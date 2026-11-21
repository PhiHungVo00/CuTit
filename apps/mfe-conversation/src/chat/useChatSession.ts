import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentUIBlock, ChatCorrection, ChatHistoryItem, NewWord } from '@vietlearning/contracts/api';
import { EventBus } from '@vietlearning/shared';
import { learnerStore } from '@vietlearning/state';
import { sanitizeAgentBlocks } from '@vietlearning/ui/agent-blocks';
import { TurnStateMachine, type TurnState } from '../state/TurnStateMachine';
import type { Remaining } from '@vietlearning/contracts/api';
import { sendTurn, summarizeConversation, TurnError } from './chatClient';
import { messageForError } from './errors';
import { t as tConv } from '../i18n';

export interface ChatImage {
  /** JPEG base64 gửi cho AI — chỉ giữ trong RAM của phiên để gửi lại, không lưu vào kho lịch sử */
  base64: string;
  previewUrl: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'tutor';
  text: string;
  kind?: 'text' | 'voice' | 'image';
  image?: ChatImage;
  /** 'failed' = chưa gửi được (mất mạng, hết lượt…); vắng = đã gửi */
  status?: 'sent' | 'failed';
  errorText?: string;
  /** có hiện nút gửi lại không (hết lượt hôm nay thì thử lại vô ích) */
  canRetry?: boolean;
  correction?: ChatCorrection;
  blocks?: AgentUIBlock[];
  /** câu trả lời đang được stream */
  pending?: boolean;
  mock?: boolean;
}

/** Số lượt lịch sử gửi kèm mỗi yêu cầu, và chu kỳ tóm tắt (theo Global Constraints của kế hoạch) */
export const HISTORY_TURNS = 10;
export const SUMMARY_EVERY = 10;
const SUMMARY_HISTORY = 20;

/** Nơi lưu bền cuộc trò chuyện (IndexedDB qua `@vietlearning/state/chat-history`); tiêm vào để hook không phụ thuộc kho */
export interface ChatPersistence {
  appendMessage(m: { role: 'user' | 'tutor'; kind: 'text' | 'voice' | 'image'; text: string; status: 'sent' | 'failed' }): Promise<unknown>;
  setSummary(summary: string): Promise<unknown>;
}

let seq = 0;
const nextId = () => `m${++seq}`;

function newSessionId(): string {
  const c: Partial<Crypto> & Pick<Crypto, 'getRandomValues'> = crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export interface UseChatOptions {
  scenarioId?: string;
  /** phương ngữ của kịch bản (nếu cố định), mặc định theo tùy chỉnh người học */
  dialect?: 'north' | 'central' | 'south';
  /** GĐ3: 'call' khi gọi thoại */
  mode?: 'chat' | 'call';
  onTurnDone?: (r: TurnDone) => void;
  /** Mở lại cuộc cũ: tin đã lưu (tối đa vài chục tin cuối), tóm tắt cũ, số lượt người dùng kể từ lần tóm tắt */
  initialMessages?: ChatMessage[];
  initialSummary?: string;
  initialTurnsSinceSummary?: number;
  store?: ChatPersistence;
}

export interface TurnDone {
  completedTasks: number[];
  correction?: ChatCorrection;
  reply: string;
  newWords: NewWord[];
  /** số lượt AI còn lại hôm nay (Gateway báo) */
  turnsLeft?: number;
  audioUrl?: string;
  remaining?: Remaining;
}

/**
 * Quản lý một buổi hội thoại: danh sách tin nhắn, trạng thái lượt (TurnStateMachine), luồng SSE.
 * Token được gộp theo khung hình (requestAnimationFrame) để không render lại mỗi từ.
 */
export function useChatSession({ scenarioId, dialect, mode, onTurnDone, initialMessages, initialSummary, initialTurnsSinceSummary = 0, store }: UseChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);
  const [turnState, setTurnState] = useState<TurnState>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<Remaining | undefined>(undefined);
  const [isMock, setIsMock] = useState(false);
  const machine = useRef<TurnStateMachine>();
  machine.current ??= new TurnStateMachine(setTurnState);
  const sessionId = useRef(newSessionId());
  const abortRef = useRef<AbortController | null>(null);
  const onDoneRef = useRef(onTurnDone);
  onDoneRef.current = onTurnDone;
  const storeRef = useRef(store);
  storeRef.current = store;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const summaryRef = useRef(initialSummary);
  const turnsSinceRef = useRef(initialTurnsSinceSummary);
  const summarizing = useRef(false);

  // Rời màn hình: hủy lượt đang chạy
  useEffect(() => () => abortRef.current?.abort(), []);

  /** Tóm tắt nền: lỗi/AI bận ⇒ giữ tóm tắt cũ, không báo lỗi, bộ đếm giữ nguyên nên thử lại ở lượt sau */
  const maybeSummarize = useCallback((recent: ChatMessage[]) => {
    if (turnsSinceRef.current < SUMMARY_EVERY || summarizing.current) return;
    summarizing.current = true;
    const history: ChatHistoryItem[] = recent
      .filter((x) => x.text && x.status !== 'failed' && !x.pending)
      .slice(-SUMMARY_HISTORY)
      .map((x) => ({ role: x.role, text: x.text.slice(0, 500) }));
    void summarizeConversation({ sessionId: sessionId.current, previousSummary: summaryRef.current, history, explanationLanguage: learnerStore.getState().preferences.uiLanguage })
      .then(async (summary) => {
        summaryRef.current = summary;
        turnsSinceRef.current = 0;
        await storeRef.current?.setSummary(summary);
      })
      .catch(() => undefined)
      .finally(() => {
        summarizing.current = false;
      });
  }, []);

  /** Chạy một lượt. `existingId` = gửi lại tin đã có (không thêm tin người dùng mới). */
  const run = useCallback(
    async (rawText: string, opts: { image?: ChatImage; kind?: 'text' | 'voice' | 'image'; existingId?: string }) => {
      const text = rawText.trim().slice(0, 500);
      const m = machine.current!;
      if (!text || m.isBusy()) return;
      setError(null);
      setErrorCode(null);

      const userId = opts.existingId ?? nextId();
      const kind = opts.kind ?? (opts.image ? 'image' : 'text');
      // Lịch sử gửi đi: tối đa 10 lượt gần nhất, bỏ tin chưa gửi được và chính tin đang gửi
      const prior = messagesRef.current.filter((x) => x.id !== userId && !x.pending && x.text && x.status !== 'failed');
      const history: ChatHistoryItem[] = prior.slice(-HISTORY_TURNS).map((x) => ({ role: x.role, text: x.text.slice(0, 500) }));
      const tutorId = nextId();
      setMessages((list): ChatMessage[] => {
        const mine: ChatMessage = { id: userId, role: 'user', text, kind, image: opts.image, status: 'sent' };
        const base = opts.existingId ? list.map((x) => (x.id === userId ? { ...x, status: 'sent' as const, errorText: undefined, canRetry: undefined } : x)) : [...list, mine];
        return [...base, { id: tutorId, role: 'tutor', text: '', pending: true }];
      });

      const { profile, preferences } = learnerStore.getState();
      const controller = new AbortController();
      abortRef.current = controller;
      m.transition('UPLOADING');
      // Host (bong bóng Cu Tít) nghe sự kiện này để hiện "đang suy nghĩ"
      EventBus.getInstance().emit('cutit:thinking', { thinking: true });

      let buffer = '';
      let frame = 0;
      let correction: ChatCorrection | undefined;
      const flush = () => {
        frame = 0;
        if (!buffer) return;
        const chunk = buffer;
        buffer = '';
        setMessages((list) => list.map((x) => (x.id === tutorId ? { ...x, text: x.text + chunk } : x)));
      };

      try {
        const done = await sendTurn(
          {
            sessionId: sessionId.current,
            userText: text,
            targetDialect: dialect ?? preferences.dialect,
            learnerLevel: profile.level,
            correctionLevel: preferences.correctionLevel,
            persona: preferences.persona,
            explanationLanguage: preferences.uiLanguage,
            scenarioId,
            history,
            ...(summaryRef.current ? { summary: summaryRef.current } : {}),
            ...(opts.image ? { imageBase64: opts.image.base64 } : {}),
            ...(mode ? { mode } : {})
          },
          (e) => {
            m.transition('STREAMING');
            if (e.type === 'token') {
              buffer += e.text;
              frame ||= requestAnimationFrame(flush);
            } else if (e.type === 'correction') {
              correction = e.correction;
              // gắn lời sửa vào tin của người học vừa gửi
              setMessages((list) => list.map((x) => (x.id === userId ? { ...x, correction: e.correction } : x)));
            } else if (e.type === 'blocks') {
              // Lớp phòng thủ thứ hai (Nguyên tắc 6): làm sạch block trước khi dựng giao diện
              const blocks = sanitizeAgentBlocks(e.blocks);
              setMessages((list) => list.map((x) => (x.id === tutorId ? { ...x, blocks } : x)));
            }
          },
          controller.signal
        );
        cancelAnimationFrame(frame);
        buffer = '';
        // Dùng reply đầy đủ trong 'done' làm bản chuẩn
        setMessages((list) => list.map((x) => (x.id === tutorId ? { ...x, text: done.reply, pending: false, mock: done.mock } : x)));
        if (done.remaining) setRemaining(done.remaining);
        if (done.mock) setIsMock(true);
        m.transition('IDLE');
        learnerStore.getState().recordAttempt('conversation', !correction);

        // Lưu bền (chỉ chữ) rồi cân nhắc tóm tắt; lỗi lưu không làm hỏng lượt
        const st = storeRef.current;
        if (st) {
          void st
            .appendMessage({ role: 'user', kind, text, status: 'sent' })
            .then(() => st.appendMessage({ role: 'tutor', kind: 'text', text: done.reply.slice(0, 500), status: 'sent' }))
            .catch(() => undefined);
        }
        turnsSinceRef.current += 1;
        maybeSummarize([...prior, { id: userId, role: 'user', text }, { id: tutorId, role: 'tutor', text: done.reply }]);
        onDoneRef.current?.({ completedTasks: done.completedTasks, correction, reply: done.reply, newWords: done.newWords, turnsLeft: done.turnsLeft, audioUrl: done.audioUrl, remaining: done.remaining });
      } catch (err) {
        cancelAnimationFrame(frame);
        m.reset();
        const aborted = controller.signal.aborted && !(err instanceof TurnError);
        const info = aborted
          ? { text: '', retry: true }
          : messageForError(err instanceof TurnError ? { kind: err.kind, code: err.code, details: err.details } : { kind: 'server' }, preferences.uiLanguage);
        // Bỏ chỗ trống của gia sư; tin của người học ở lại, đánh dấu chưa gửi được (ảnh còn trong RAM để gửi lại)
        setMessages((list) => list.filter((x) => x.id !== tutorId).map((x) => (x.id === userId ? { ...x, status: 'failed' as const, errorText: info.text, canRetry: info.retry } : x)));
        if (aborted) return; // người dùng hủy / rời màn hình
        setError(info.text);
        setErrorCode(err instanceof TurnError ? (err.code ?? err.kind) : null);
      } finally {
        EventBus.getInstance().emit('cutit:thinking', { thinking: false });
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [scenarioId, dialect, mode, maybeSummarize]
  );

  const send = useCallback((text: string, opts: { image?: ChatImage; kind?: 'text' | 'voice' | 'image'; retry?: boolean } = {}) => run(text, opts), [run]);

  /** Gửi lại một tin chưa gửi được (giữ nguyên vị trí và ảnh) */
  const resend = useCallback(
    (id: string) => {
      const target = messagesRef.current.find((x) => x.id === id && x.role === 'user');
      if (target) return run(target.text, { image: target.image, kind: target.kind, existingId: id });
    },
    [run]
  );

  /** Tương thích ChatPanel cũ: gửi lại tin người dùng chưa gửi được gần nhất */
  const retry = useCallback(() => {
    const last = [...messagesRef.current].reverse().find((x) => x.role === 'user' && x.status === 'failed');
    if (last) void resend(last.id);
  }, [resend]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return { messages, turnState, busy: turnState !== 'IDLE', error, errorCode, remaining, isMock, send, resend, retry, cancel };
}
