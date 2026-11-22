import { useEffect, useRef } from 'react';
import { Icon } from '@vietlearning/ui';
import { answerFeedback, FeedbackMascot } from '../feedback';
import { ExplainButton } from '../explain/ExplainButton';
import { useT } from '../i18n';
import { say } from '../choice/ChoiceExercise';
import { SlowButton } from '../audio/SlowButton';
import type { ExerciseItem, ExerciseResult } from '../types';
import { useSentenceBuilder } from './useSentenceBuilder';

type BuildItem = Extract<ExerciseItem, { kind: 'build' }>;

/** Ghép câu trong phiên học: chạm từ theo thứ tự, kiểm tra MỘT lần bằng A8, sai thì xem câu đúng + lời giải thích. */
export function SentenceExercise({ item, seed, onDone }: { item: BuildItem; seed: number; onDone(r: ExerciseResult): void }) {
  const t = useT();
  const b = useSentenceBuilder(item.sentence, seed);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const s = item.sentence;
  const sentence = b.placed.map((i) => s.tokens[i].text).join(' ');
  const correctSentence = s.accepted[0].map((i) => s.tokens[i].text).join(' ');

  useEffect(() => {
    if (b.result) feedbackRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [b.result]);

  const done = (correct: boolean) => onDone({ key: item.key, correct, skipped: false, quality: correct ? 4 : 1, answer: correctSentence });

  return (
    <div className="flex flex-col gap-3">
      <div aria-label={t('yourSentence')} role="group" className="flex min-h-16 flex-wrap content-start gap-2 rounded-xl border-2 border-dashed border-line bg-sunken p-2">
        {b.placed.length === 0 && <span className="self-center px-2 text-sm text-ink-muted">{t('tapWords')}</span>}
        {b.placed.map((tokIdx, pos) => {
          const wrong = b.result && !b.result.valid && b.result.misplaced.includes(pos);
          return (
            <button
              key={tokIdx}
              type="button"
              lang="vi"
              disabled={Boolean(b.result)}
              onClick={() => b.remove(pos)}
              aria-label={t('remove', { word: s.tokens[tokIdx].text })}
              className={[
                'min-h-11 rounded-xl border-2 px-3 text-base font-bold',
                b.result?.valid ? 'border-accent bg-accent text-accent-ink' : wrong ? 'border-danger bg-danger-soft text-danger-ink' : 'border-line-strong bg-surface text-ink'
              ].join(' ')}
            >
              {s.tokens[tokIdx].text}
            </button>
          );
        })}
      </div>

      <div role="group" aria-label={t('wordBank')} className="flex flex-wrap gap-2">
        {b.pool.map((tokIdx) => (
          <button
            key={tokIdx}
            type="button"
            lang="vi"
            disabled={b.placed.includes(tokIdx) || Boolean(b.result)}
            onClick={() => b.place(tokIdx)}
            className="min-h-11 rounded-xl border border-line bg-surface-2 px-3 text-base font-semibold text-ink disabled:opacity-25"
          >
            {s.tokens[tokIdx].text}
          </button>
        ))}
      </div>

      {!b.result && (
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={b.undo} disabled={!b.canUndo} className="min-h-12 rounded-xl border border-line bg-surface-2 text-sm font-bold text-ink disabled:opacity-40">
            {t('undo')}
          </button>
          <button type="button" onClick={() => answerFeedback(b.check().valid)} disabled={!b.complete} className="col-span-2 min-h-12 rounded-xl bg-accent text-base font-extrabold text-accent-ink disabled:opacity-40">
            {t('check')}
          </button>
        </div>
      )}

      <div ref={feedbackRef} className="scroll-mb-[calc(80px+env(safe-area-inset-bottom))]">
        {b.result?.valid && (
          <div role="status" className="ct-feedback flex flex-col gap-2 rounded-xl bg-accent-soft p-3">
            <FeedbackMascot correct />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-bold text-heading">{t('correct', { sentence })}</span>
              <span className="flex shrink-0 gap-2">
                <button type="button" aria-label={t('listenSentence')} onClick={() => say(sentence)} className="grid min-h-11 min-w-11 place-items-center rounded-xl bg-surface text-ink">
                  <Icon name="loa" size={20} />
                </button>
                <SlowButton text={sentence} />
              </span>
            </div>
            <button type="button" onClick={() => done(true)} className="min-h-12 w-full rounded-xl bg-accent font-extrabold text-accent-ink">
              {t('next')}
            </button>
          </div>
        )}
        {b.result && !b.result.valid && (
          <div role="status" className="ct-feedback flex flex-col gap-2 rounded-xl bg-danger-soft p-3 text-[15px] text-danger-ink">
            <FeedbackMascot correct={false} />
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
              {b.result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <p className="m-0 font-bold">{t('correctOrder', { sentence: correctSentence })}</p>
            <ExplainButton request={{ kind: 'build', question: item.prompt, answer: correctSentence, userAnswer: sentence }} />
            <button type="button" onClick={() => done(false)} className="min-h-12 w-full rounded-xl bg-accent font-extrabold text-accent-ink">
              {t('next')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
