import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { canOpenAppSettings, openAppSettings, capturePhoto } from '@vietlearning/native';
import type { Remaining } from '@vietlearning/contracts/api';
import { Button, Icon } from '@vietlearning/ui';
import { useT } from '../i18n';
import { MicIcon, SendIcon } from './icons';
import type { ChatImage } from './useChatSession';
import { MAX_VOICE_MS, useVoiceInput } from './useVoiceInput';

/** Đếm ngược hiện từ giây thứ 10 của tin giọng nói (tối đa 15 giây) */
export const COUNTDOWN_FROM_MS = 10_000;

const round = 'flex size-12 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-ink disabled:opacity-40';

/**
 * Ô soạn kiểu Messenger: ô chữ, nút chụp ảnh (capturePhoto), nút giữ để nói, gửi.
 * Chữ nghe được đưa vào ô để người học xem/sửa rồi mới gửi (STT có thể nghe nhầm).
 */
export function Composer({ busy, remaining, placeholder, ensureConsent, onSend, onCancel }: { busy: boolean; remaining?: Remaining; placeholder: string; ensureConsent: (cap: 'voice' | 'camera') => Promise<boolean>; onSend: (text: string, opts?: { image?: ChatImage; kind?: 'text' | 'voice' | 'image' }) => void; onCancel: () => void }) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fromVoice = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const voice = useVoiceInput(({ text, mock }) => {
    fromVoice.current = true;
    setDraft((d) => (d.trim() ? `${d.trim()} ${text}` : text).slice(0, 500));
    setNote(mock ? t('voiceMock') : t('voiceCheck'));
    inputRef.current?.focus();
  });
  const recording = voice.status === 'recording';

  // Đếm ngược: bắt đầu hiện từ giây 10; tự dừng ở 15 s thì giải thích vì sao
  const startedAt = useRef(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [hitLimit, setHitLimit] = useState(false);
  useEffect(() => {
    if (!recording) return;
    startedAt.current = Date.now();
    setHitLimit(false);
    const id = window.setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      setSecondsLeft(elapsed >= COUNTDOWN_FROM_MS ? Math.max(0, Math.ceil((MAX_VOICE_MS - elapsed) / 1000)) : null);
    }, 250);
    return () => {
      window.clearInterval(id);
      setSecondsLeft(null);
      if (Date.now() - startedAt.current >= MAX_VOICE_MS - 500) setHitLimit(true);
    };
  }, [recording]);

  const noSpeech = remaining !== undefined && remaining.sttSeconds === 0;
  const noPhoto = remaining !== undefined && remaining.visionImages === 0;

  const startTalk = async () => {
    if (recording || busy || noSpeech) return;
    if (!(await ensureConsent('voice'))) return;
    setNote('');
    void voice.start();
  };
  const stopTalk = () => {
    if (recording) void voice.stop();
  };
  const onMicKey = (e: KeyboardEvent) => {
    // Bàn phím/đọc màn hình không "giữ" được: Enter/Space bật-tắt
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (recording) stopTalk();
      else void startTalk();
    }
  };

  const takePhoto = async () => {
    if (busy || noPhoto) return;
    if (!(await ensureConsent('camera'))) return;
    setPhotoError(null);
    try {
      const img = await capturePhoto();
      if (!img) return; // người dùng hủy
      onSend(draft.trim() || t('imageDefault'), { image: { base64: img.base64, previewUrl: img.previewUrl }, kind: 'image' });
      setDraft('');
      setNote('');
    } catch (e) {
      const code = (e as { code?: string }).code;
      setPhotoError(code === 'permission-denied' || code === 'no-camera' || code === 'unsupported' ? code : 'failed');
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || busy) return;
    onSend(draft, { kind: fromVoice.current ? 'voice' : 'text' });
    fromVoice.current = false;
    setDraft('');
    setNote('');
  };

  return (
    <div className="sticky bottom-[calc(var(--tabbar-h,64px)+var(--safe-bottom,0px)+8px)] flex flex-col gap-1 bg-canvas pt-1">
      <form onSubmit={submit} className="flex items-center gap-2 rounded-2xl border border-line-strong bg-surface p-2 shadow-card">
        <button type="button" className={round} aria-label={t('takePhoto')} title={t('takePhoto')} disabled={busy || noPhoto} onClick={() => void takePhoto()}>
          <Icon name="camera" size={22} />
        </button>
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
        <button
          type="button"
          className={`${round} ${recording ? 'border-danger-ink bg-danger-soft text-danger-ink' : ''}`}
          aria-label={t('holdToTalk')}
          title={t('holdToTalk')}
          aria-pressed={recording}
          disabled={busy || noSpeech}
          onPointerDown={() => void startTalk()}
          onPointerUp={stopTalk}
          onPointerCancel={stopTalk}
          onPointerLeave={stopTalk}
          onKeyDown={onMicKey}
          style={{ touchAction: 'none' }}
        >
          <MicIcon />
        </button>
        {busy ? (
          <Button variant="secondary" onClick={onCancel}>
            {t('stop')}
          </Button>
        ) : (
          <button type="submit" className={`${round} bg-accent text-accent-ink`} aria-label={t('send')} disabled={!draft.trim()}>
            <SendIcon />
          </button>
        )}
      </form>
      {recording && (
        <p role="status" className="m-0 text-sm font-bold text-danger-ink">
          {secondsLeft !== null ? t('recordingCountdown', { n: secondsLeft }) : t('listening')}
        </p>
      )}
      {voice.status === 'transcribing' && (
        <p role="status" className="m-0 text-sm text-ink-muted">
          {t('transcribing')}
        </p>
      )}
      {hitLimit && !recording && <p className="m-0 text-sm text-ink-muted">{t('voiceLimitReached')}</p>}
      {note && !voice.error && voice.status === 'idle' && <p className="m-0 text-sm text-ink-muted">{note}</p>}
      {noSpeech && <p className="m-0 text-xs text-ink-muted">{t('noSpeechLeft')}</p>}
      {noPhoto && <p className="m-0 text-xs text-ink-muted">{t('noPhotoLeft')}</p>}
      {photoError && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl bg-danger-soft p-3 text-danger-ink">
          <p className="m-0 text-[15px]">{t(`camera.${photoError}` as 'camera.failed')}</p>
          {photoError === 'permission-denied' && canOpenAppSettings() && (
            <Button variant="secondary" onClick={() => void openAppSettings()}>
              {t('openSettings')}
            </Button>
          )}
        </div>
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
