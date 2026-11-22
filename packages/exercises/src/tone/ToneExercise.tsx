import { useEffect, useRef } from 'react';
import { PitchReferenceFlyweight } from '@vietlearning/content';
import { useLearner } from '@vietlearning/state';
import { Icon } from '@vietlearning/ui';
import { answerFeedback, FeedbackMascot } from '../feedback';
import { useT } from '../i18n';
import { say } from '../choice/ChoiceExercise';
import { SlowButton } from '../audio/SlowButton';
import type { ExerciseItem, ExerciseResult } from '../types';
import { ContourChart } from './ContourChart';
import { MAX_RECORD_MS, useToneRecorder } from './useToneRecorder';
import { verdict } from './verdict';

type ToneItem = Extract<ExerciseItem, { kind: 'tone' }>;

/**
 * Luyện thanh trong phiên học: nghe mẫu → ghi âm → A1 (F0) + A2 (so contour) chấm điểm.
 * Luôn có nút “Không nói được lúc này” (micro bị từ chối, nơi công cộng, máy ảo không có micro): bỏ qua, không tính sai.
 */
export default function ToneExercise({ item, onDone, onSkip }: { item: ToneItem; onDone(r: ExerciseResult): void; onSkip?(): void }) {
  const t = useT();
  const en = useLearner((s) => s.preferences.uiLanguage) === 'en';
  const tone = PitchReferenceFlyweight.get(item.tone);
  const { status, error, result, level, start, stop } = useToneRecorder(item.tone);
  const recording = status === 'recording' || status === 'starting';
  const feedbackRef = useRef<HTMLDivElement>(null);
  const v = result ? verdict(result.targetScore.score, result.bestMatch === item.tone) : null;
  const best = result ? PitchReferenceFlyweight.get(result.bestMatch) : null;

  useEffect(() => {
    if (v) answerFeedback(v !== 'bad');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  useEffect(() => {
    if (status === 'done' || status === 'error') feedbackRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [status]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p lang="vi" className="m-0 text-3xl font-black text-ink">
          {item.word}
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => say(item.word)} className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-3 text-sm font-bold text-ink">
            <Icon name="loa" size={20} />
            {t('playSample')}
          </button>
          <SlowButton text={item.word} />
        </div>
      </div>
      <p className="m-0 text-sm text-ink-soft">{en ? tone.descriptionEn : tone.description}</p>
      <ContourChart reference={tone.contour} learner={result?.contour ?? null} label={t('chartLabel', { tone: (en ? tone.nameEn : tone.name).toLowerCase() })} />

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => (recording ? void stop() : void start())}
          disabled={status === 'analyzing' || status === 'starting'}
          aria-pressed={recording}
          aria-label={recording ? t('stopRec') : t('startRec')}
          className={['relative grid size-16 place-items-center rounded-full text-2xl shadow-card disabled:opacity-60', recording ? 'bg-danger text-white' : 'bg-accent text-accent-ink'].join(' ')}
        >
          {status === 'recording' && (
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full border-4 border-danger" style={{ transform: `scale(${1 + level * 0.35})`, opacity: 0.35 + level * 0.5 }} />
          )}
          <span aria-hidden="true">{recording ? '⏹️' : '🎙️'}</span>
        </button>
        <p className="m-0 min-h-6 text-center text-sm text-ink-soft" aria-live="polite">
          {status === 'idle' && t('status.idle')}
          {status === 'starting' && t('status.starting')}
          {status === 'recording' && t('status.recording', { s: MAX_RECORD_MS / 1000 })}
          {status === 'analyzing' && t('status.analyzing')}
          {(status === 'done' || status === 'error') && t('status.again')}
        </p>
      </div>

      <div ref={feedbackRef} className="flex flex-col gap-2 scroll-mb-[calc(80px+env(safe-area-inset-bottom))]">
        {error && (
          <p role="alert" className="m-0 rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">
            {t(`err.${error}`)}
          </p>
        )}
        {result && v && best && (
          <div role="status" className="ct-feedback flex flex-col gap-2 rounded-xl border border-line bg-sunken p-3">
            <div className="flex items-center justify-between gap-2">
              <FeedbackMascot correct={v !== 'bad'} size={48} />
              <strong className={v === 'bad' ? 'text-danger' : 'text-heading'}>{t(`verdict.${v}`)}</strong>
              <span className="text-2xl font-black text-ink">{t('toneScore', { score: result.targetScore.score })}</span>
            </div>
            {result.bestMatch !== item.tone && <p className="m-0 text-sm text-ink-soft">{t('soundsLike', { tone: (en ? best.nameEn : best.name).toLowerCase() })}</p>}
            <button
              type="button"
              onClick={() =>
                onDone({ key: item.key, correct: v !== 'bad', skipped: false, quality: v === 'good' ? 5 : v === 'ok' ? 3 : 1, answer: item.word, score: result.targetScore.score, tone: item.tone })
              }
              className="min-h-12 w-full rounded-xl bg-accent font-extrabold text-accent-ink"
            >
              {t('next')}
            </button>
          </div>
        )}
        {!result && onSkip && (
          <button type="button" onClick={onSkip} disabled={recording} className="min-h-12 rounded-xl border border-line bg-surface px-4 text-sm font-bold text-ink-soft disabled:opacity-50">
            {t('cantSpeak')}
          </button>
        )}
      </div>
    </div>
  );
}
