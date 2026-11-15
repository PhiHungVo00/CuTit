import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentUIBlock, ChatCorrection, ChatHistoryItem } from '@vietlearning/contracts/api';
import { learnerStore } from '@vietlearning/state';
import { sanitizeAgentBlocks } from '@vietlearning/ui/agent-blocks';
import { TurnStateMachine, type TurnState } from '../state/TurnStateMachine';
import { sendTurn, TurnError } from './chatClient';

export interface ChatMessage {
  id: string;
  role: 'user' | 'tutor';
  text: string;
  correction?: ChatCorrection;
  blocks?: AgentUIBlock[];
  /** câu trả lời đang được stream */
  pending?: boolean;
  mock?: boolean;
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
  onTurnDone?: (r: { completedTasks: number[]; correction?: ChatCorrection; reply: string }) => void;
}

/**
 * Quản lý một buổi hội thoại: danh sách tin nhắn, trạng thái lượt (TurnStateMachine), luồng SSE.
 * Token được gộp theo khung hình (requestAnimationFrame) để không render lại mỗi từ.
 */
export function useChatSession({ scenarioId, dialect, onTurnDone }: UseChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [turnState, setTurnState] = useState<TurnState>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const machine = useRef<TurnStateMachine>();
  machine.current ??= new TurnStateMachine(setTurnState);
  const sessionId = useRef(newSessionId());
  const abortRef = useRef<AbortController | null>(null);
  const lastText = useRef<string | null>(null);
  const onDoneRef = useRef(onTurnDone);
  onDoneRef.current = onTurnDone;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Rời màn hình: hủy lượt đang chạy
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (rawText: string, opts: { retry?: boolean } = {}) => {
      const text = rawText.trim().slice(0, 500);
      const m = machine.current!;
      if (!text || m.isBusy()) return;
      setError(null);
      lastText.current = text;

      const prior = messagesRef.current.filter((x) => !x.pending && x.text);
      const history: ChatHistoryItem[] = prior.slice(-6).map((x) => ({ role: x.role, text: x.text.slice(0, 500) }));
      const tutorId = nextId();
      setMessages((list): ChatMessage[] => [...(opts.retry ? list : [...list, { id: nextId(), role: 'user' as const, text }]), { id: tutorId, role: 'tutor', text: '', pending: true }]);
      // Lượt thử lại: lịch sử không gồm câu của chính người dùng (đã nằm trong userText)
      if (opts.retry && history[history.length - 1]?.role === 'user' && history[history.length - 1]?.text === text) history.pop();

      const { profile, preferences } = learnerStore.getState();
      const controller = new AbortController();
      abortRef.current = controller;
      m.transition('UPLOADING');

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
            scenarioId,
            history
          },
          (e) => {
            m.transition('STREAMING');
            if (e.type === 'token') {
              buffer += e.text;
              frame ||= requestAnimationFrame(flush);
            } else if (e.type === 'correction') {
              correction = e.correction;
              // gắn lời sửa vào tin nhắn của người học (tin cuối cùng của người dùng)
              setMessages((list) => {
                const idx = list.map((x) => x.role).lastIndexOf('user');
                return list.map((x, i) => (i === idx ? { ...x, correction: e.correction } : x));
              });
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
        m.transition('IDLE');
        learnerStore.getState().recordAttempt('conversation', !correction);
        onDoneRef.current?.({ completedTasks: done.completedTasks, correction, reply: done.reply });
      } catch (err) {
        cancelAnimationFrame(frame);
        m.reset();
        setMessages((list) => list.filter((x) => x.id !== tutorId));
        if (controller.signal.aborted && !(err instanceof TurnError)) return; // người dùng hủy / rời màn hình
        setError(err instanceof TurnError ? err.message : 'Có lỗi xảy ra. Vui lòng thử lại.');
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [scenarioId, dialect]
  );

  const retry = useCallback(() => {
    if (lastText.current) void send(lastText.current, { retry: true });
  }, [send]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return { messages, turnState, busy: turnState !== 'IDLE', error, send, retry, cancel };
}
