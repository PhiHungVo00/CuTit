import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { canOpenAppSettings, openAppSettings } from '@vietlearning/native';
import { useLearner } from '@vietlearning/state';
import { Button, CuTit, Icon } from '@vietlearning/ui';
import { VoiceConsent } from '../chat/VoiceConsent';
import { t as tConv, useT } from '../i18n';
import { buildSummary } from '../summary/summaryItems';
import { SessionSummary } from '../summary/SessionSummary';
import { useCall } from './useCall';

const pill = 'min-h-12 rounded-xl border border-line-strong bg-surface-2 px-3 text-sm font-bold text-ink';
const full = { width: '100%' } as const;

/** Màn gọi thoại với Bé Cu Tít (GĐ3): nói → STT → LLM → đọc trả lời, phụ đề, nói chậm, gõ thay nói. */
export function CallScreen() {
  const t = useT();
  const [callKey, setCallKey] = useState(0);
  return (
    <div className="min-h-dvh bg-canvas px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] font-sans text-ink">
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
        <header className="flex items-center justify-between gap-2 border-b-2 border-line pb-4">
          <h1 className="m-0 text-[26px] font-black leading-tight tracking-tight text-heading">{t('callTitle')}</h1>
          <Link to="/hoi-thoai" className="flex min-h-11 items-center gap-1 rounded-xl border border-line-strong bg-surface px-3 text-sm font-bold text-ink no-underline">
            <Icon name="chat" size={18} />
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
        <CuTit mood="chao" size={112} />
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
            <Button size="lg" style={full} onClick={() => start('voice')}>
              <Icon name="goi" size={22} />
              {t('callStart')}
            </Button>
            <Button variant="secondary" style={full} onClick={() => start('text')}>
              {t('typeInstead')}
            </Button>
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
          <Button style={full} onClick={onAgain}>
            <Icon name="goi" size={20} />
            {t('callAgain')}
          </Button>
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
        <CuTit mood={phase === 'speaking' ? 'noi' : phase === 'thinking' ? 'suy-nghi' : phase === 'listening' ? 'nghe' : 'chao'} size={112} />
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
              <Button variant="secondary" onClick={() => void openAppSettings()}>
                {t('openSettings')}
              </Button>
            )}
          </div>
        )}
        {phase === 'paused' && (
          <div className="flex w-full flex-col gap-2">
            {state.error && state.pendingText ? (
              <Button onClick={() => dispatch({ type: 'RETRY' })}>{t('retry')}</Button>
            ) : (
              <Button onClick={() => dispatch({ type: 'RESUME' })}>{t('callResume')}</Button>
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
          <Button type="submit" disabled={!draft.trim()}>
            {t('send')}
          </Button>
        </form>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" aria-pressed={slow} onClick={() => (slow ? setSlow(false) : replaySlow())} disabled={phase === 'thinking'}>
          {slow ? t('slowOn') : t('slowDown')}
        </Button>
        <Button variant="secondary" aria-pressed={subtitles} onClick={() => setSubtitles((v) => !v)}>
          {subtitles ? t('subtitlesOn') : t('subtitlesOff')}
        </Button>
        {state.input === 'voice' ? (
          <Button variant="secondary" onClick={toText} disabled={phase === 'thinking' || phase === 'speaking'}>
            {t('typeInstead')}
          </Button>
        ) : (
          <Button variant="secondary" onClick={toVoice} disabled={phase === 'thinking' || phase === 'speaking'}>
            {t('speakInstead')}
          </Button>
        )}
        <Button variant="danger" onClick={() => dispatch({ type: 'HANG_UP' })}>
          <Icon name="goi" size={18} />
          {t('hangUp')}
        </Button>
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
