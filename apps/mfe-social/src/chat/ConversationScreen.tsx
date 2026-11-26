import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '@vietlearning/ui';
import type { Conversation, SocialClient } from '../client/types';
import { useT } from '../i18n';
import { useConnState, useConversation } from '../state/useSocial';
import { Gate, StatusScreen } from '../privacy/Gate';
import { BlockReport } from '../privacy/BlockReport';
import { iconBtn, secondaryBtn } from '../ui';
import { Composer } from './Composer';
import { ConnectionBar } from './ConnectionBar';
import { MessageBubble, PendingBubble } from './MessageBubble';
import { convName } from './ConversationList';

const NEAR_BOTTOM = 80;

function Conversation_({ client, cid }: { client: SocialClient; cid: string }) {
  const t = useT();
  const navigate = useNavigate();
  const conn = useConnState(client);
  const c = useConversation(client, cid);
  const [meta, setMeta] = useState<Conversation | null>(null);
  const [safety, setSafety] = useState(false);
  const [newBelow, setNewBelow] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const seen = useRef({ n: 0, lastKey: '' });

  // tên người kia (danh sách cuộc trò chuyện là nguồn duy nhất của tên/peer)
  useEffect(() => {
    let alive = true;
    client.rest.listConversations().then(
      (r) => alive && setMeta(r.conversations.find((x) => x.id === cid) ?? null),
      () => undefined
    );
    return () => {
      alive = false;
    };
  }, [client, cid]);

  const toBottom = useCallback(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
    atBottom.current = true;
    setNewBelow(false);
  }, []);

  // Tin mới: ở đáy ⇒ cuộn theo; đang đọc phía trên ⇒ KHÔNG giật màn, hiện nút "Có tin mới ↓"
  useLayoutEffect(() => {
    const last = c.messages[c.messages.length - 1];
    const key = (last?.id ?? '') + ':' + c.pending.length;
    if (key === seen.current.lastKey) return;
    const firstPaint = seen.current.n === 0;
    seen.current = { n: c.messages.length, lastKey: key };
    if (firstPaint || atBottom.current || last?.mine || c.pending.length > 0) toBottom();
    else setNewBelow(true);
  }, [c.messages, c.pending, toBottom]);

  // Đã xem: ở đáy và tab đang hiện
  useEffect(() => {
    if (c.status === 'ready' && atBottom.current && c.messages.length > 0 && document.visibilityState !== 'hidden') c.markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.messages.length, c.status]);

  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    if (atBottom.current) setNewBelow(false);
  };

  const title = meta ? convName(meta, t('list.group')) : t('chat.title');
  if (c.status !== 'ready') return <StatusScreen title={title} state={c.status === 'loading' ? { status: 'loading' } : { status: 'error', ...c.errState }} onRetry={c.retry} back="/tin-nhan" />;

  const empty = c.messages.length === 0 && c.pending.length === 0;
  return (
    <div className="flex h-dvh flex-col bg-canvas font-sans text-ink">
      <header className="flex items-center gap-2 border-b border-line bg-surface px-3 pb-2 pt-[calc(8px+env(safe-area-inset-top))]">
        <button type="button" aria-label={t('back')} className={iconBtn} onClick={() => navigate('/tin-nhan')}>
          <span aria-hidden="true">←</span>
        </button>
        <h1 className="m-0 min-w-0 flex-1 truncate text-lg font-black text-heading">{title}</h1>
        {meta?.kind === 'dm' && meta.peer && (
          <button type="button" aria-label={t('safety.menu')} aria-expanded={safety} className={iconBtn} onClick={() => setSafety((s) => !s)}>
            <span aria-hidden="true">⋯</span>
          </button>
        )}
      </header>
      <div className="px-3 pt-2">
        <ConnectionBar state={conn} />
      </div>
      {safety && meta?.peer && (
        <div className="px-3 pt-2">
          <BlockReport
            client={client}
            cid={cid}
            peer={meta.peer}
            onClose={() => setSafety(false)}
            onBlocked={() => navigate('/tin-nhan')}
          />
        </div>
      )}
      <div ref={box} onScroll={onScroll} className="flex flex-1 flex-col overflow-y-auto px-3 py-3">
        {c.hasMore && (
          <button type="button" className={secondaryBtn + ' mb-2 shrink-0'} onClick={() => void c.loadOlder()}>
            {t('chat.loadOlder')}
          </button>
        )}
        {empty ? (
          <EmptyState mood="ngu" title={t('chat.empty')} />
        ) : (
          <ul aria-label={t('chat.msgCount')} className="m-0 flex list-none flex-col gap-2 p-0">
            {c.messages.map((m) => (
              <MessageBubble key={m.id} m={m} onRecall={(id) => void c.recall(id).catch(() => undefined)} onRestore={(id) => void c.restore(id).catch(() => undefined)} />
            ))}
            {c.pending.map((p) => (
              <PendingBubble key={p.localId} p={p} onResend={c.resend} onDiscard={c.discard} />
            ))}
          </ul>
        )}
      </div>
      {newBelow && (
        <div className="flex justify-center pb-1">
          <button type="button" className="min-h-11 rounded-full bg-accent px-4 text-sm font-extrabold text-accent-ink shadow-card" onClick={toBottom}>
            {t('chat.newBelow')}
          </button>
        </div>
      )}
      <Composer onSend={c.send} />
    </div>
  );
}

/** Một cuộc trò chuyện (`/tin-nhan/:id`) — đi qua cổng tuổi/handle trước. */
export function ChatScreen({ client, conversationId }: { client: SocialClient; conversationId: string }) {
  const t = useT();
  return (
    <Gate client={client} title={t('chat.title')}>
      <Conversation_ client={client} cid={conversationId} />
    </Gate>
  );
}
