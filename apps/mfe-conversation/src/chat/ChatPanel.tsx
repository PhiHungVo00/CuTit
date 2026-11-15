import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getDeviceSpeech } from '@vietlearning/native';
import { speechRate } from '@vietlearning/state';
import { AgentBlockView } from './AgentBlockView';
import type { useChatSession } from './useChatSession';

type Session = ReturnType<typeof useChatSession>;

const say = (text: string) => getDeviceSpeech().speak(text, { rate: speechRate(0.95) }).catch(() => undefined);

const STATUS: Record<string, string> = { UPLOADING: 'Đang gửi…', STREAMING: 'Đang trả lời…', PLAYING: 'Đang đọc…' };

/** Khung chat dùng chung cho M1 (tự do) và M7 (nhập vai). Nhập bằng chữ; câu trả lời có nút nghe. */
export function ChatPanel({ session, placeholder, emptyHint, tutorName }: { session: Session; placeholder: string; emptyHint: string; tutorName: string }) {
  const { messages, busy, turnState, error, send, retry, cancel } = session;
  const [draft, setDraft] = useState('');
  const [announce, setAnnounce] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const lastDoneId = useRef<string | null>(null);

  // Cuộn xuống tin mới; thông báo câu trả lời MỘT lần khi xong (không đọc từng token)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    const last = messages[messages.length - 1];
    if (last?.role === 'tutor' && !last.pending && last.id !== lastDoneId.current) {
      lastDoneId.current = last.id;
      setAnnounce(`${tutorName}: ${last.text}`);
    }
  }, [messages, tutorName]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || busy) return;
    void send(draft);
    setDraft('');
  };

  return (
    <div className="flex flex-col gap-3">
      <div role="log" aria-label="Hội thoại" className="flex min-h-40 flex-col gap-3">
        {messages.length === 0 && <p className="m-0 rounded-xl bg-surface-2 p-3 text-[15px] text-ink-soft">{emptyHint}</p>}
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex max-w-[85%] flex-col gap-1 self-end">
              <p lang="vi" className="m-0 rounded-2xl rounded-br-md bg-accent px-3 py-2 text-[16px] text-accent-ink">
                {m.text}
              </p>
              {m.correction && (
                <div className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
                  <p className="m-0 text-ink">
                    ✏️ Nên viết: <strong lang="vi">{m.correction.corrected}</strong>
                  </p>
                  <p className="m-0 text-ink-muted">{m.correction.explanation}</p>
                </div>
              )}
            </div>
          ) : (
            <div key={m.id} className="flex max-w-[90%] flex-col gap-2 self-start">
              <div className="rounded-2xl rounded-bl-md border border-line-strong bg-surface px-3 py-2">
                <p className="m-0 text-xs font-bold text-ink-muted">
                  {tutorName}
                  {m.mock && ' · trả lời mẫu (chưa nối AI)'}
                </p>
                <p lang="vi" className="m-0 whitespace-pre-wrap text-[16px] text-ink">
                  {m.text || (m.pending ? '…' : '')}
                </p>
              </div>
              {!m.pending && m.text && (
                <button type="button" onClick={() => say(m.text)} className="min-h-11 self-start rounded-xl border border-line bg-surface-2 px-3 text-sm font-bold text-ink">
                  🔈 Nghe
                </button>
              )}
              {m.blocks?.map((b) => <AgentBlockView key={b.id} block={b} />)}
            </div>
          )
        )}
        <div ref={endRef} />
      </div>

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      {error && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl bg-danger-soft p-3 text-danger-ink">
          <p className="m-0 text-[15px]">{error}</p>
          <button type="button" onClick={retry} className="min-h-12 rounded-xl border border-line-strong bg-surface px-4 font-bold text-ink">
            Thử lại
          </button>
        </div>
      )}

      <form onSubmit={onSubmit} className="sticky bottom-[calc(var(--tabbar-h,64px)+var(--safe-bottom,0px)+8px)] flex gap-2 rounded-2xl border border-line-strong bg-surface p-2 shadow-card">
        <label htmlFor="ct-chat-input" className="sr-only">
          Tin nhắn
        </label>
        <input
          id="ct-chat-input"
          lang="vi"
          value={draft}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="send"
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-[16px] text-ink"
        />
        {busy ? (
          <button type="button" onClick={cancel} className="min-h-12 rounded-xl border border-line-strong bg-surface-2 px-4 font-bold text-ink">
            Dừng
          </button>
        ) : (
          <button type="submit" disabled={!draft.trim()} className="min-h-12 rounded-xl bg-accent px-4 font-extrabold text-accent-ink disabled:opacity-50">
            Gửi
          </button>
        )}
      </form>
      {busy && (
        <p role="status" className="m-0 text-sm text-ink-muted">
          {STATUS[turnState]}
        </p>
      )}
    </div>
  );
}
