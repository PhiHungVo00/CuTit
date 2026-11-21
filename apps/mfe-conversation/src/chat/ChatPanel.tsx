import { useEffect, useRef, useState, type FormEvent } from 'react';
import { canOpenAppSettings, openAppSettings } from '@vietlearning/native';
import { useLearner } from '@vietlearning/state';
import { Button, CuTit, Icon } from '@vietlearning/ui';
import { SlowListen, say as sayAt } from '../listen';
import { VoiceConsent } from './VoiceConsent';
import { AgentBlockView } from './AgentBlockView';
import type { useChatSession } from './useChatSession';
import { useVoiceInput } from './useVoiceInput';
import { useT } from '../i18n';

type Session = ReturnType<typeof useChatSession>;

const BASE = 0.95;
const say = (text: string) => sayAt(text, BASE);

const BUSY_STATES = new Set(['UPLOADING', 'STREAMING', 'PLAYING']);

/** Khung chat dùng chung cho M1 (tự do) và M7 (nhập vai). Nhập bằng chữ; câu trả lời có nút nghe. */
export function ChatPanel({ session, placeholder, emptyHint, tutorName, avatar = true }: { session: Session; placeholder: string; emptyHint: string; tutorName: string; /** hiện Bé Cu Tít cạnh tin nhắn (tắt khi NPC là nhân vật khác) */ avatar?: boolean }) {
  const t = useT();
  const { messages, busy, turnState, error, send, retry, cancel } = session;
  const [draft, setDraft] = useState('');
  const [announce, setAnnounce] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const lastDoneId = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [voiceNote, setVoiceNote] = useState('');
  const voice = useVoiceInput(({ text, mock }) => {
    // Chữ nghe được vào ô nhập để người học kiểm tra, sửa rồi mới gửi
    setDraft((d) => (d.trim() ? `${d.trim()} ${text}` : text).slice(0, 500));
    setVoiceNote(mock ? t('voiceMock') : t('voiceCheck'));
    inputRef.current?.focus();
  });
  const recording = voice.status === 'recording';
  const lastTutorId = [...messages].reverse().find((m) => m.role === 'tutor')?.id;
  // Quyền riêng tư: lần đầu dùng micro, nói rõ giọng nói được gửi đi đâu rồi mới ghi âm
  const voiceConsent = useLearner((s) => s.consents.voice === true);
  const [askVoiceConsent, setAskVoiceConsent] = useState(false);
  const onMic = () => {
    if (recording) return void voice.stop();
    if (!voiceConsent) return setAskVoiceConsent(true);
    void voice.start();
  };

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
    setVoiceNote('');
  };

  return (
    <div className="flex flex-col gap-3">
      <div role="log" aria-label={t('log')} className="flex min-h-40 flex-col gap-3">
        {messages.length === 0 && (
          <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
            {avatar && <CuTit mood={recording ? 'nghe' : 'chao'} size={56} />}
            <p className="m-0 text-[15px] text-ink-soft">{emptyHint}</p>
          </div>
        )}
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex max-w-[85%] flex-col gap-1 self-end">
              <p lang="vi" className="m-0 rounded-2xl rounded-br-md bg-accent px-3 py-2 text-[16px] text-accent-ink">
                {m.text}
              </p>
              {m.correction && (
                <div className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
                  <p className="m-0 text-ink">
                    {t('shouldWrite')} <strong lang="vi">{m.correction.corrected}</strong>
                  </p>
                  <p className="m-0 text-ink-muted">{m.correction.explanation}</p>
                </div>
              )}
            </div>
          ) : (
            <div key={m.id} className="flex max-w-[90%] items-start gap-2 self-start">
              {avatar && <CuTit mood={recording && m.id === lastTutorId ? 'nghe' : 'chan-dung'} size={40} />}
              <div className="flex min-w-0 flex-col gap-2">
              <div className="rounded-2xl rounded-bl-md border border-line-strong bg-surface px-3 py-2">
                <p className="m-0 text-xs font-bold text-ink-muted">
                  {tutorName}
                  {m.mock && t('mockLabel')}
                </p>
                <p lang="vi" className="m-0 whitespace-pre-wrap text-[16px] text-ink">
                  {m.text || (m.pending ? '…' : '')}
                </p>
              </div>
              {!m.pending && m.text && (
                <div className="flex gap-2 self-start">
                  <Button variant="secondary" onClick={() => void say(m.text)}>
                    <Icon name="loa" size={18} />
                    {t('listen')}
                  </Button>
                  <SlowListen text={m.text} base={BASE} className="min-h-11 min-w-11 rounded-xl border border-line bg-surface-2 px-3 text-base" />
                </div>
              )}
              {m.blocks?.map((b) => <AgentBlockView key={b.id} block={b} />)}
              </div>
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
          <Button variant="secondary" onClick={retry}>
            {t('retry')}
          </Button>
        </div>
      )}

      <form onSubmit={onSubmit} className="sticky bottom-[calc(var(--tabbar-h,64px)+var(--safe-bottom,0px)+8px)] flex gap-2 rounded-2xl border border-line-strong bg-surface p-2 shadow-card">
        <label htmlFor="ct-chat-input" className="sr-only">
          {t('messageLabel')}
        </label>
        <input
          ref={inputRef}
          id="ct-chat-input"
          lang="vi"
          value={draft}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={recording ? t('listening') : placeholder}
          autoComplete="off"
          enterKeyHint="send"
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-[16px] text-ink"
        />
        {!busy && (
          <Button
            variant={recording ? 'danger' : 'secondary'}
            onClick={onMic}
            busy={voice.status === 'starting' || voice.status === 'transcribing'}
            aria-pressed={recording}
            aria-label={recording ? t('stopRec') : t('speak')}
            style={{ position: 'relative', minWidth: 48, padding: '0 12px' }}
          >
            {recording ? t('stop') : t('micShort')}
            {recording && <span aria-hidden="true" className="absolute inset-x-1 bottom-1 h-1 origin-left rounded bg-white" style={{ transform: `scaleX(${Math.max(0.08, voice.level)})` }} />}
          </Button>
        )}
        {busy ? (
          <Button variant="secondary" onClick={cancel}>
            {t('stop')}
          </Button>
        ) : (
          <Button type="submit" disabled={!draft.trim()}>
            {t('send')}
          </Button>
        )}
      </form>
      {busy && (
        <p role="status" className="m-0 text-sm text-ink-muted">
          {BUSY_STATES.has(turnState) ? t(`state.${turnState}` as 'state.UPLOADING') : ''}
        </p>
      )}
      {(recording || voice.status === 'transcribing') && (
        <p role="status" className="m-0 text-sm text-ink-muted">
          {recording ? t('recHint') : t('transcribing')}
        </p>
      )}
      {voiceNote && !voice.error && voice.status === 'idle' && <p className="m-0 text-sm text-ink-muted">{voiceNote}</p>}
      {askVoiceConsent && (
        <VoiceConsent
          text={t('voicePrivacy')}
          onCancel={() => setAskVoiceConsent(false)}
          onAgree={() => {
            setAskVoiceConsent(false);
            void voice.start();
          }}
        />
      )}
      {voice.error && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl bg-danger-soft p-3 text-danger-ink">
          <p className="m-0 text-[15px]">{t(`voice.${voice.error}`)}</p>
          {voice.error === 'permission-denied' && canOpenAppSettings() && (
            <Button variant="secondary" onClick={() => void openAppSettings()}>
              {t('openSettings')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
