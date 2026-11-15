import { memo, useEffect, useState } from 'react';
import type { HonorificInterpretationResult } from '@vietlearning/content';
import { speechService, type SpeechFailure } from '../../services/speechSynthesis';
import { useT } from '../../i18n';
import { SPEEDS } from './options';

interface SentencePanelProps {
  result: HonorificInterpretationResult;
  contextLabel: string;
  fromTable: boolean;
}

/** Câu mẫu trực quan + 3 thành tố ngữ pháp + nghe phát âm. */
export const SentencePanel = memo(function SentencePanel({ result, contextLabel, fromTable }: SentencePanelProps) {
  const t = useT();
  const [speaking, setSpeaking] = useState(false);
  const [speed, setSpeed] = useState<number>(1.0);
  const [error, setError] = useState<SpeechFailure | null>(null);

  // Rời màn hình thì dừng đọc
  useEffect(() => () => speechService.stop(), []);

  const toggleSpeak = () => {
    if (speaking) {
      speechService.stop();
      setSpeaking(false);
      return;
    }
    setError(null);
    setSpeaking(true);
    speechService.speak(result.sampleSentence, {
      speed,
      onEnd: () => setSpeaking(false),
      onError: ({ code }) => {
        setSpeaking(false);
        setError(code);
      }
    });
  };

  return (
    <section
      aria-labelledby="ct-sentence-title"
      className="flex flex-col gap-4 rounded-2xl border border-line-strong bg-surface p-4 shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-line pb-3">
        <h2 id="ct-sentence-title" className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-heading">
          <span aria-hidden="true">💬</span> {t('sample')}
        </h2>
        <span className="rounded-lg bg-surface-2 px-2 py-1 text-sm font-bold text-ink-soft">
          {result.speaker} → {result.listener}
        </span>
      </div>

      <figure className="m-0 flex flex-col gap-2 rounded-xl border border-line-strong bg-sunken p-4">
        <blockquote lang="vi" className="m-0 text-xl font-extrabold leading-relaxed text-ink">
          “{result.sampleSentence}”
        </blockquote>
        <figcaption className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
          <span>{t('fits')}</span>
          <strong className="text-heading">{contextLabel}</strong>
          {fromTable && (
            <span className="ml-auto rounded bg-accent-soft px-1.5 py-0.5 text-xs font-bold text-heading">{t('fromTable')}</span>
          )}
        </figcaption>
      </figure>

      <div>
        <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-ink-soft">{t('grammar')}</h3>
        <dl className="m-0 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-chip1-line bg-chip1-bg p-3">
            <dt className="text-xs font-bold uppercase text-chip1-ink">{t('firstPerson')}</dt>
            <dd className="m-0 text-lg font-black text-ink">{result.speaker}</dd>
          </div>
          <div className="rounded-xl border border-chip2-line bg-chip2-bg p-3">
            <dt className="text-xs font-bold uppercase text-chip2-ink">{t('secondPerson')}</dt>
            <dd className="m-0 text-lg font-black text-ink">{result.listener}</dd>
          </div>
          <div className="col-span-2 rounded-xl border border-chip3-line bg-chip3-bg p-3">
            <dt className="text-xs font-bold uppercase text-chip3-ink">{t('particle')}</dt>
            <dd className="m-0 text-lg font-black text-ink">{result.politeParticle}</dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-3">
        <button
          type="button"
          onClick={toggleSpeak}
          aria-pressed={speaking}
          className={[
            'flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-extrabold transition-colors',
            speaking ? 'bg-danger text-white' : 'bg-accent text-accent-ink'
          ].join(' ')}
        >
          <span aria-hidden="true">{speaking ? '⏹️' : '🔊'}</span>
          {speaking ? t('speaking') : t('listenSample')}
        </button>

        <div className="flex items-center gap-2" role="group" aria-label={t('speedGroup')}>
          <span className="text-sm font-semibold text-ink-muted">{t('speedLabel')}</span>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={speed === s}
              onClick={() => setSpeed(s)}
              className={[
                'min-h-11 min-w-14 rounded-lg px-3 text-sm',
                speed === s ? 'bg-accent font-extrabold text-accent-ink' : 'bg-surface-2 font-medium text-ink-soft'
              ].join(' ')}
            >
              {s}x
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="m-0 rounded-xl bg-danger-soft p-3 text-sm leading-relaxed text-danger-ink">
            {t(`speech.${error}`)}
          </p>
        )}
      </div>
    </section>
  );
});
