import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { canOpenAppSettings, openAppSettings } from '@vietlearning/native';
import { useLearner } from '@vietlearning/state';
import { VoiceConsent } from '../chat/VoiceConsent';
import { t as tConv, useT } from '../i18n';
import { buildSummary } from '../summary/summaryItems';
import { SessionSummary } from '../summary/SessionSummary';
import { useCall } from './useCall';

const pill = 'min-h-12 rounded-xl border border-line-strong bg-surface-2 px-3 text-sm font-bold text-ink';

/** Màn gọi thoại với Bé Cu Tít (GĐ3): nói → STT → LLM → đọc trả lời, phụ đề, nói chậm, gõ thay nói. */
export function CallScreen() {
  const t = useT();
  const [callKey, setCallKey] = useState(0);
  return (
    <div className="min-h-dvh bg-canvas px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] font-sans text-ink">
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
        <header className="flex items-center justify-between gap-2 border-b-2 border-line pb-4">
          <h1 className="m-0 text-[26px] font-black leading-tight tracking-tight text-heading">{t('callTitle')}</h1>
          <Link to="/hoi-thoai" className="flex min-h-11 items-center rounded-xl border border-line-strong bg-surface px-3 text-sm font-bold text-ink no-underline">
            {t('chatLink')}
          </Link>
        </header>
        <Call key={callKey} onAgain={() => setCallKey((k) => k + 1)} />
      </div>
    </div>
  );
}

function Call({ onAgain }: { onAgain: () => void }) {
  const t = useT();
  const { state, dispatch, session, voice, words, turnsLeft, slow, setSlow, replaySlow } = useCall();
  const consent = useLearner((s) => s.consents.voice === true);
  const [askConsent, setAskConsent] = useState(false);
  const [subtitles, setSubtitles] = useState(true);
  const [draft, setDraft] = useState('');
  const { phase } = state;

  const start = (input: 'voice' | 'text') => {
    if (input === 'voice' && !consent) return setAskConsent(true);
    dispatch({ type: 'START' });
    if (input === 'text') dispatch({ type: 'USE_TEXT' });
  };
  const toText = () => {
    voice.cancel();
    dispatch({ type: 'USE_TEXT' });
  };
  const toVoice = () => (consent ? dispatch({ type: 'USE_VOICE' }) : setAskConsent(true));
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim().slice(0, 500);
    if (!text) return;
    voice.cancel();
    dispatch({ type: 'SEND_TYPED', text });
    setDraft('');
  };

  const turnsNote = turnsLeft !== null && <p className="m-0 text-sm text-ink-muted" data-testid="turns-left">{t('turnsLeft', { n: turnsLeft })}</p>;

  if (phase === 'idle') {
    return (
      <section className="flex flex-col items-center gap-3 rounded-2xl border border-line-strong bg-surface p-5 text-center shadow-card">
        <span aria-hidden="true" className="text-6xl">
          🐣
        </span>
        <p className="m-0 text-[15px] text-ink-soft">{t('callIntro')}</p>
        {askConsent ? (
          <VoiceConsent
            text={t('voicePrivacyCall')}
            onCancel={() => setAskConsent(false)}
            onAgree={() => {
              setAskConsent(false);
              dispatch({ type: 'START' });
            }}
          />
        ) : (
          <div className="flex w-full flex-col gap-2">
            <button type="button" onClick={() => start('voice')} className="min-h-14 rounded-2xl bg-accent px-4 text-lg font-extrabold text-accent-ink">
              {t('callStart')}
            </button>
            <button type="button" onClick={() => start('text')} className={pill}>
              {t('typeInstead')}
            </button>
          </div>
        )}
        {turnsNote}
      </section>
    );
  }

  if (phase === 'ended') {
    const corrections = session.messages.flatMap((m) => (m.correction ? [m.correction] : []));
    return (
      <section role="status" aria-labelledby="ct-call-sum" className="flex flex-col gap-3 rounded-2xl border border-line-strong bg-surface p-4 shadow-card">
        <h2 id="ct-call-sum" className="m-0 text-xl font-black text-ink">
          {t('callSummary', { n: state.turns })}
        </h2>
        {state.reason === 'quota' && (
          <div role="alert" className="flex flex-col gap-1 rounded-xl bg-danger-soft p-3 text-danger-ink">
            <p className="m-0 text-[15px] font-bold">{state.error}</p>
            <p className="m-0 text-sm">{t('quotaStillFree')}</p>
          </div>
        )}
        {state.reason === 'max-turns' && <p className="m-0 text-sm text-ink-soft">{t('callMaxTurns')}</p>}
        <SessionSummary items={buildSummary(corrections, words, (s) => tConv('youSaid', { text: s }))} />
        {state.reason !== 'quota' && (
          <button type="button" onClick={onAgain} className="min-h-12 rounded-xl bg-accent px-4 font-extrabold text-accent-ink">
            {t('callAgain')}
          </button>
        )}
        <Link to="/" className={`${pill} flex items-center justify-center no-underline`}>
          {t('backHome')}
        </Link>
      </section>
    );
  }

  const recording = voice.status === 'recording';
  const status =
    phase === 'listening'
      ? voice.status === 'transcribing'
        ? t('callHearing')
        : t('callListening')
      : phase === 'thinking'
        ? t('callThinking')
        : phase === 'speaking'
          ? t('callSpeaking')
          : phase === 'typing'
            ? t('callTyping')
            : state.error ?? (voice.error ? t(`voice.${voice.error}`) : t('callPaused'));

  return (
    <>
      <section className="flex flex-col items-center gap-2 rounded-2xl border border-line-strong bg-surface p-4 text-center shadow-card">
        <span aria-hidden="true" className={`text-6xl ${phase === 'speaking' ? 'animate-pulse' : ''}`}>
          🐣
        </span>
        <p role="status" aria-live="polite" className="m-0 text-[16px] font-bold text-ink" data-testid="call-status">
          {status}
        </p>
        {recording && (
          <div aria-hidden="true" className="h-2 w-40 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full origin-left rounded-full bg-accent" style={{ transform: `scaleX(${Math.max(0.05, voice.level)})` }} />
          </div>
        )}
        {state.micError && (
          <div role="alert" className="flex w-full flex-col gap-2 rounded-xl bg-danger-soft p-3 text-danger-ink">
            <p className="m-0 text-sm">
              {t(`voice.${state.micError}` as 'voice.failed')} {t('micToText')}
            </p>
            {state.micError === 'permission-denied' && canOpenAppSettings() && (
              <button type="button" onClick={() => void openAppSettings()} className="min-h-12 rounded-xl border border-line-strong bg-surface px-4 font-bold text-ink">
                {t('openSettings')}
              </button>
            )}
          </div>
        )}
        {phase === 'paused' && (
          <div className="flex w-full flex-col gap-2">
            {state.error && state.pendingText ? (
              <button type="button" onClick={() => dispatch({ type: 'SEND_TYPED', text: state.pendingText! })} className="min-h-12 rounded-xl bg-accent px-4 font-extrabold text-accent-ink">
                {t('retry')}
              </button>
            ) : (
              <button type="button" onClick={() => dispatch({ type: 'RESUME' })} className="min-h-12 rounded-xl bg-accent px-4 font-extrabold text-accent-ink">
                {t('callResume')}
              </button>
            )}
          </div>
        )}
        {turnsNote}
      </section>

      {askConsent && (
        <VoiceConsent
          text={t('voicePrivacyCall')}
          onCancel={() => setAskConsent(false)}
          onAgree={() => {
            setAskConsent(false);
            dispatch({ type: 'USE_VOICE' });
          }}
        />
      )}

      {(phase === 'typing' || (phase === 'paused' && state.input === 'text')) && (
        <form onSubmit={onSubmit} className="flex gap-2 rounded-2xl border border-line-strong bg-surface p-2 shadow-card">
          <label htmlFor="ct-call-input" className="sr-only">
            {t('messageLabel')}
          </label>
          <input
            id="ct-call-input"
            lang="vi"
            value={draft}
            maxLength={500}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('chatPlaceholder')}
            autoComplete="off"
            enterKeyHint="send"
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-[16px] text-ink"
          />
          <button type="submit" disabled={!draft.trim()} className="min-h-12 rounded-xl bg-accent px-4 font-extrabold text-accent-ink disabled:opacity-50">
            {t('send')}
          </button>
        </form>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" aria-pressed={slow} onClick={() => (slow ? setSlow(false) : replaySlow())} disabled={phase === 'thinking'} className={`${pill} disabled:opacity-50`}>
          {slow ? t('slowOn') : t('slowDown')}
        </button>
        <button type="button" aria-pressed={subtitles} onClick={() => setSubtitles((v) => !v)} className={pill}>
          {subtitles ? t('subtitlesOn') : t('subtitlesOff')}
        </button>
        {state.input === 'voice' ? (
          <button type="button" onClick={toText} disabled={phase === 'thinking' || phase === 'speaking'} className={`${pill} disabled:opacity-50`}>
            {t('typeInstead')}
          </button>
        ) : (
          <button type="button" onClick={toVoice} disabled={phase === 'thinking' || phase === 'speaking'} className={`${pill} disabled:opacity-50`}>
            {t('speakInstead')}
          </button>
        )}
        <button type="button" onClick={() => dispatch({ type: 'HANG_UP' })} className="min-h-12 rounded-xl border border-danger bg-danger-soft px-3 text-sm font-extrabold text-danger-ink">
          {t('hangUp')}
        </button>
      </div>

      {subtitles ? (
        <div role="log" aria-label={t('subtitles')} className="flex flex-col gap-2">
          {session.messages
            .filter((m) => m.text)
            .map((m) => (
              <div key={m.id} className={`flex max-w-[90%] flex-col gap-1 ${m.role === 'user' ? 'self-end' : 'self-start'}`}>
                <p className="m-0 text-xs font-bold text-ink-muted">
                  {m.role === 'user' ? t('you') : 'Bé Cu Tít'}
                  {m.mock && t('mockLabel')}
                </p>
                <p lang="vi" className={`m-0 rounded-2xl px-3 py-2 text-[16px] ${m.role === 'user' ? 'bg-accent text-accent-ink' : 'border border-line-strong bg-surface text-ink'}`}>
                  {m.text}
                </p>
                {m.correction && (
                  <p className="m-0 rounded-xl border border-line bg-surface px-3 py-1 text-sm text-ink">
                    {t('shouldSay')} <strong lang="vi">{m.correction.corrected}</strong>
                  </p>
                )}
              </div>
            ))}
        </div>
      ) : (
        <p className="m-0 text-center text-sm text-ink-muted">{t('subtitlesHidden')}</p>
      )}
    </>
  );
}
