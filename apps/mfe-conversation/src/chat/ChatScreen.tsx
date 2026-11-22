import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { learnerStore, useLearner } from '@vietlearning/state';
import { CuTit, Icon } from '@vietlearning/ui';
import { AiConsentDialog, aiConsentKey } from './AiConsentDialog';
import { ChatHeader } from './ChatHeader';
import { Composer } from './Composer';
import { HistorySheet, type ConversationRow } from './HistorySheet';
import { MessageBubble } from './MessageBubble';
import { useChatSession, type ChatMessage, type ChatPersistence } from './useChatSession';
import { useT } from '../i18n';

/** Kho lịch sử: import LƯỜI để gói đầu không tăng (subpath riêng của @vietlearning/state) */
type HistoryModule = typeof import('@vietlearning/state/chat-history');
const loadHistory = () => import('@vietlearning/state/chat-history');

/** Số tin cuối đọc khi mở lại cuộc cũ (cuộc 100+ tin vẫn mở nhanh; chỉ 10 lượt + tóm tắt được gửi đi) */
const OPEN_LIMIT = 50;

interface Opened {
  key: string;
  conversationId?: string;
  scenarioId?: string;
  summary?: string;
  turnsSince: number;
  messages: ChatMessage[];
}

/**
 * Màn hình M1 kiểu Messenger: chat chữ/giọng/ảnh với Cu Tít, lịch sử nhiều cuộc, gọi thường/gọi video.
 * URL: `?tinh-huong=<id>` mở cuộc mới gắn tình huống; `?cuoc=<id>` mở lại cuộc cũ.
 */
export function ChatScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const cuoc = params.get('cuoc') ?? undefined;
  const tinhHuong = params.get('tinh-huong') ?? undefined;
  const [mod, setMod] = useState<HistoryModule | null | 'failed'>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const fresh = useRef(0);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let off = false;
    loadHistory().then(
      (m) => !off && setMod(m),
      () => !off && setMod('failed') // không có IndexedDB: vẫn chat được, chỉ không lưu lịch sử
    );
    return () => {
      off = true;
    };
  }, []);

  // Mở cuộc theo URL (chạy lại khi đổi ?cuoc / ?tinh-huong)
  useEffect(() => {
    if (mod === null) return;
    let off = false;
    const blank = (): Opened => ({ key: `new-${tinhHuong ?? ''}-${++fresh.current}`, scenarioId: tinhHuong, turnsSince: 0, messages: [] });
    if (mod === 'failed' || !cuoc) return void setOpened(blank());
    (async () => {
      const list = await mod.listConversations();
      const c = list.find((x) => x.id === cuoc);
      if (!c) return !off && setOpened(blank());
      const saved = await mod.recentMessages(c.id, OPEN_LIMIT);
      if (off) return;
      setOpened({
        key: `conv-${c.id}`,
        conversationId: c.id,
        scenarioId: c.scenarioId,
        summary: c.summary,
        turnsSince: c.userTurnsSinceSummary,
        messages: saved.map((m) => ({ id: m.id, role: m.role, kind: m.kind, text: m.text, status: m.status }))
      });
    })().catch(() => !off && setOpened(blank()));
    return () => {
      off = true;
    };
  }, [mod, cuoc, tinhHuong, nonce]);

  if (!opened) return <div className="min-h-dvh bg-canvas" aria-busy="true" />;
  return <ChatSession key={opened.key} opened={opened} mod={mod === 'failed' ? null : mod} onNavigate={(to) => navigate(to)} onNewChat={() => { navigate('/hoi-thoai'); setNonce((n) => n + 1); }} />;
}

function ChatSession({ opened, mod, onNavigate, onNewChat }: { opened: Opened; mod: HistoryModule | null; onNavigate: (to: string) => void; onNewChat: () => void }) {
  const t = useT();
  const persona = useLearner((s) => s.preferences.persona);
  const tutorName = persona === 'co_giao' ? t('teacherName') : 'Bé Cu Tít';
  const avatar = persona !== 'co_giao';

  // Cuộc được tạo ở tin đầu tiên (không để lại cuộc rỗng khi người học chỉ mở màn rồi thoát)
  const convId = useRef(opened.conversationId);
  const persistence = useMemo<ChatPersistence | undefined>(() => {
    if (!mod) return undefined;
    const ensure = async () => (convId.current ??= (await mod.createConversation({ scenarioId: opened.scenarioId })).id);
    return {
      appendMessage: async (m) => mod.appendMessage({ ...m, conversationId: await ensure() }),
      setSummary: async (s) => mod.setSummary(await ensure(), s)
    };
  }, [mod, opened.scenarioId]);

  const session = useChatSession({ scenarioId: opened.scenarioId, initialMessages: opened.messages, initialSummary: opened.summary, initialTurnsSinceSummary: opened.turnsSince, store: persistence });
  const { messages, busy, remaining, isMock, send, resend, cancel } = session;

  // --- hộp đồng ý AI ---
  const version = mod?.AI_PROVIDERS_VERSION ?? 2;
  const [consentAsk, setConsentAsk] = useState<{ wants: 'voice' | 'camera'; resolve: (ok: boolean) => void } | null>(null);
  const ensureConsent = useCallback(
    (cap: 'voice' | 'camera') => {
      const c = learnerStore.getState().consents;
      if (c[aiConsentKey(version)] && c[cap]) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => setConsentAsk({ wants: cap, resolve }));
    },
    [version]
  );

  // --- lịch sử ---
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const refresh = useCallback(async () => setRows(mod ? await mod.listConversations() : []), [mod]);
  const openHistory = () => {
    setHistoryOpen(true);
    void refresh();
  };
  const toNewChat = () => {
    setHistoryOpen(false);
    onNewChat();
  };

  // Cuộn xuống tin mới; thông báo câu trả lời MỘT lần khi xong
  const endRef = useRef<HTMLDivElement>(null);
  const lastDoneId = useRef<string | null>(null);
  const [announce, setAnnounce] = useState('');
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' });
    const last = messages[messages.length - 1];
    if (last?.role === 'tutor' && !last.pending && last.id !== lastDoneId.current) {
      lastDoneId.current = last.id;
      setAnnounce(`${tutorName}: ${last.text}`);
    }
  }, [messages, tutorName]);

  return (
    <div className="min-h-dvh bg-canvas px-4 pb-4 pt-[calc(8px+env(safe-area-inset-top))] font-sans text-ink">
      <div className="mx-auto flex max-w-[560px] flex-col gap-3">
        {isMock && (
          <p role="status" data-testid="mock-banner" className="sticky top-0 z-20 m-0 rounded-xl bg-surface-2 border border-line-strong px-3 py-2 text-sm font-bold text-ink">
            {t('mockBanner')}
          </p>
        )}
        <ChatHeader remaining={remaining} tutorName={tutorName} onHistory={openHistory} ensureConsent={ensureConsent} />
        <Link to="/nhap-vai" className="flex min-h-11 items-center gap-1 self-end rounded-xl border border-line-strong bg-surface px-3 text-sm font-bold text-ink no-underline">
          <Icon name="nhap-vai" size={18} />
          {t('roleplayLink')}
        </Link>
        <div role="log" aria-label={t('log')} className="flex min-h-40 flex-col gap-3">
          {messages.length === 0 && (
            <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
              {avatar && <CuTit mood="chao" size={56} />}
              <p className="m-0 text-[15px] text-ink-soft">{t('chatEmpty', { name: tutorName })}</p>
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} tutorName={tutorName} avatar={avatar} onResend={(id) => void resend(id)} />
          ))}
          <div ref={endRef} />
        </div>
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
        <Composer busy={busy} remaining={remaining} placeholder={t('chatPlaceholder')} ensureConsent={ensureConsent} onSend={(text, o) => void send(text, o)} onCancel={cancel} />
      </div>

      {historyOpen && (
        <HistorySheet
          conversations={rows}
          onClose={() => setHistoryOpen(false)}
          onNew={toNewChat}
          onOpen={(id) => {
            setHistoryOpen(false);
            onNavigate(`/hoi-thoai?cuoc=${encodeURIComponent(id)}`);
          }}
          onDelete={async (id) => {
            await mod?.deleteConversation(id);
            if (id === convId.current) return toNewChat();
            await refresh();
          }}
          onDeleteAll={async () => {
            await mod?.deleteAll();
            toNewChat();
          }}
        />
      )}
      {consentAsk && (
        <AiConsentDialog
          version={version}
          wants={consentAsk.wants}
          onDone={(r) => {
            const ok = r.confirmed && (consentAsk.wants === 'voice' ? r.voice : r.camera);
            consentAsk.resolve(ok);
            setConsentAsk(null);
          }}
        />
      )}
    </div>
  );
}
