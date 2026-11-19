import { useEffect, useRef, useState } from 'react';
import { PitchReferenceFlyweight, type ToneId } from '@vietlearning/content';
import type { AssessResponse, AssessWord } from '@vietlearning/contracts/api';
import { learnerStore, useLearner } from '@vietlearning/state';
import { useT } from '../i18n';
import { say } from '../choice/ChoiceExercise';
import { SlowButton } from '../audio/SlowButton';
import type { ExerciseItem, ExerciseResult } from '../types';
import { gradeAssess } from './grade';
import { MAX_SENTENCE_MS, useSentenceRecorder, type AssessFn } from './useSentenceRecorder';
import { useMediaAllowed } from '@vietlearning/state/family';

type SpeakItem = Extract<ExerciseItem, { kind: 'speak' }>;

const STYLE: Record<Exclude<AssessWord['status'], 'extra'>, { cls: string; mark: string }> = {
  correct: { cls: 'bg-accent-soft text-heading', mark: '✓' },
  tone: { cls: 'bg-danger-soft text-ink underline decoration-wavy decoration-danger decoration-2 underline-offset-4', mark: '〜' },
  wrong: { cls: 'bg-danger-soft font-black text-danger-ink', mark: '✗' },
  missing: { cls: 'border border-dashed border-line-strong text-ink-muted line-through', mark: '∅' }
};

/**
 * Kết quả chấm câu kiểu ELSA: tô màu từng âm tiết (đúng / sai thanh / sai / thiếu), liệt kê từ nói thêm và
 * danh sách thanh lệch (từ chữ STT chép được, và từ cao độ A2 khi có). Mỗi từ có nhãn đọc màn hình đầy đủ.
 */
export function SpeakResult({ result }: { result: AssessResponse }) {
  const t = useT();
  const en = useLearner((s) => s.preferences.uiLanguage) === 'en';
  const tone = (id?: ToneId) => (id ? (en ? PitchReferenceFlyweight.get(id).nameEn : PitchReferenceFlyweight.get(id).name).toLowerCase() : '?');
  const shown = result.words.filter((w) => w.status !== 'extra' && w.expected);
  const extras = result.words.filter((w) => w.status === 'extra').map((w) => w.heard);
  const toneSlips = result.mock ? [] : shown.filter((w) => w.status === 'tone');
  const pitchSlips = shown.filter((w) => w.pitch && w.expectedTone && w.pitch.bestMatch !== w.expectedTone && w.status !== 'tone');

  return (
    <div className="flex flex-col gap-2">
      <ul aria-label={t('speakWords')} className="m-0 flex list-none flex-wrap gap-1.5 p-0" lang="vi">
        {shown.map((w, i) => {
          const status = result.mock ? 'correct' : (w.status as keyof typeof STYLE);
          const label = result.mock
            ? w.expected!
            : t(`speak.${status}`, { w: w.expected!, need: tone(w.expectedTone), got: tone(w.heardTone), heard: w.heard ?? '' });
          return (
            <li
              key={i}
              aria-label={label}
              data-status={result.mock ? 'unchecked' : status}
              className={['rounded-lg px-2 py-1 text-lg font-bold', result.mock ? 'bg-surface-2 text-ink' : STYLE[status].cls].join(' ')}
            >
              {w.expected}
              {!result.mock && (
                <span aria-hidden="true" className="ml-1 text-xs">
                  {STYLE[status].mark}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {!result.mock && extras.length > 0 && <p className="m-0 text-sm text-ink-soft">{t('speakExtra', { words: extras.join(', ') })}</p>}
      {(toneSlips.length > 0 || pitchSlips.length > 0) && (
        <div className="rounded-xl border border-line bg-surface p-2">
          <p className="m-0 text-xs font-bold uppercase tracking-wide text-ink-muted">{t('speakToneList')}</p>
          <ul className="m-0 list-disc pl-5 text-sm text-ink">
            {toneSlips.map((w, i) => (
              <li key={`t${i}`}>{t('speakToneItem', { w: w.expected!, need: tone(w.expectedTone), got: tone(w.heardTone) })}</li>
            ))}
            {pitchSlips.map((w, i) => (
              <li key={`p${i}`}>{t('speakPitch', { w: w.expected!, need: tone(w.expectedTone), got: tone(w.pitch!.bestMatch) })}</li>
            ))}
          </ul>
        </div>
      )}
      {result.mock ? (
        <p className="m-0 text-sm text-ink-soft">{t('speakMock')}</p>
      ) : (
        result.transcript && <p className="m-0 text-sm text-ink-soft">{t('speakHeard', { t: result.transcript })}</p>
      )}
    </div>
  );
}

/**
 * Nói lại câu (A3 + A2): nghe mẫu → ghi âm cả câu → Gateway chấm từng âm tiết → tô màu.
 * Lần đầu: xin đồng ý gửi giọng nói (cùng khóa `consents.voice` với M1). Luôn có “Không nói được lúc này”.
 */
export default function SpeakExercise({ item, onDone, onSkip, assess }: { item: SpeakItem; onDone(r: ExerciseResult): void; onSkip?(): void; assess?: AssessFn }) {
  const t = useT();
  const { status, error, result, level, start, stop, reset } = useSentenceRecorder(item.text, assess);
  const consent = useLearner((s) => s.consents.voice === true);
  const [askConsent, setAskConsent] = useState(false);
  // GĐ4b: hồ sơ trẻ chỉ gửi ghi âm khi phụ huynh đã cho phép (Gateway cũng chặn) — vẫn bỏ qua được câu này
  const mediaAllowed = useMediaAllowed();
  const [needParent, setNeedParent] = useState(false);
  const recording = status === 'recording' || status === 'starting';
  const feedbackRef = useRef<HTMLDivElement>(null);
  const grade = result ? gradeAssess(result) : null;

  useEffect(() => {
    if (status === 'done' || error) feedbackRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [status, error]);

  const onMic = () => {
    if (recording) return void stop();
    if (!mediaAllowed) return setNeedParent(true);
    if (!consent) return setAskConsent(true);
    void start();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p lang="vi" className="m-0 text-2xl font-black leading-snug text-ink">
            {item.text}
          </p>
          <p className="m-0 text-sm text-ink-soft">{item.translation}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => say(item.text)} className="min-h-12 shrink-0 rounded-xl border border-line bg-surface-2 px-3 text-sm font-bold text-ink">
            {t('playSample')}
          </button>
          <SlowButton text={item.text} />
        </div>
      </div>

      {askConsent && (
        <div role="dialog" aria-labelledby="ct-speak-consent" className="flex flex-col gap-2 rounded-xl border border-line bg-sunken p-3">
          <strong id="ct-speak-consent" className="text-ink">
            {t('consentTitle')}
          </strong>
          <p className="m-0 text-sm text-ink-soft">{t('consentBody')}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setAskConsent(false)} className="min-h-12 rounded-xl border border-line bg-surface text-sm font-bold text-ink">
              {t('consentNo')}
            </button>
            <button
              type="button"
              onClick={() => {
                learnerStore.getState().giveConsent('voice');
                setAskConsent(false);
                void start();
              }}
              className="min-h-12 rounded-xl bg-accent px-2 text-sm font-extrabold text-accent-ink"
            >
              {t('consentAgree')}
            </button>
          </div>
        </div>
      )}

      {!result && !askConsent && (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onMic}
            disabled={status === 'sending' || status === 'starting'}
            aria-pressed={recording}
            aria-label={recording ? t('speakStop') : t('speakRecord')}
            className={['relative grid size-16 place-items-center rounded-full text-2xl shadow-card disabled:opacity-60', recording ? 'bg-danger text-white' : 'bg-accent text-accent-ink'].join(' ')}
          >
            {status === 'recording' && (
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full border-4 border-danger" style={{ transform: `scale(${1 + level * 0.35})`, opacity: 0.35 + level * 0.5 }} />
            )}
            <span aria-hidden="true">{recording ? '⏹️' : '🎙️'}</span>
          </button>
          <p className="m-0 min-h-6 text-center text-sm text-ink-soft" aria-live="polite">
            {status === 'idle' && t('speak.idle')}
            {status === 'starting' && t('status.starting')}
            {status === 'recording' && t('speak.recording', { s: MAX_SENTENCE_MS / 1000 })}
            {status === 'sending' && t('speak.sending')}
          </p>
        </div>
      )}

      <div ref={feedbackRef} className="flex flex-col gap-2 scroll-mb-[calc(80px+env(safe-area-inset-bottom))]">
        {needParent && (
          <p role="status" data-testid="speak-need-parent" className="m-0 rounded-xl bg-surface-2 p-3 text-sm text-ink">
            {t('speak.needParent')}
          </p>
        )}
        {error && (
          <p role="alert" className="m-0 rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">
            {error === 'network' || error === 'quota' || error === 'failed' ? t(`speak.err.${error}`) : t(`err.${error}`)}
          </p>
        )}
        {result && grade && (
          <div role="status" className="flex flex-col gap-2 rounded-xl border border-line bg-sunken p-3">
            {!result.mock && (
              <div className="flex items-baseline justify-between gap-2">
                <strong className={grade.correct ? 'text-heading' : 'text-danger'}>{t(grade.correct ? (grade.score >= 90 ? 'verdict.good' : 'verdict.ok') : 'verdict.bad')}</strong>
                <span className="text-2xl font-black text-ink">{t('speakScore', { score: grade.score })}</span>
              </div>
            )}
            <SpeakResult result={result} />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={reset} className="min-h-12 rounded-xl border border-line bg-surface text-sm font-bold text-ink">
                {t('speakRetry')}
              </button>
              <button
                type="button"
                // mock (chưa chấm được chữ) => coi như bỏ qua: không ghi lượt sai, không tạo thẻ ôn
                onClick={() => (grade.skipped && onSkip ? onSkip() : onDone({ key: item.key, correct: grade.correct, skipped: grade.skipped, quality: grade.quality, answer: item.text, ...(grade.skipped ? {} : { score: grade.score }) }))}
                className="min-h-12 rounded-xl bg-accent font-extrabold text-accent-ink"
              >
                {t('next')}
              </button>
            </div>
          </div>
        )}
        {!result && onSkip && (
          <button type="button" onClick={onSkip} disabled={recording || status === 'sending'} className="min-h-12 rounded-xl border border-line bg-surface px-4 text-sm font-bold text-ink-soft disabled:opacity-50">
            {t('cantSpeak')}
          </button>
        )}
      </div>
    </div>
  );
}
