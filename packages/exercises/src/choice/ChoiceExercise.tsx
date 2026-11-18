import { useEffect, useRef, useState } from 'react';
import { playText } from '../audio/coursePlayer';
import { ExplainButton } from '../explain/ExplainButton';
import { useT } from '../i18n';
import type { ExerciseItem, ExerciseResult } from '../types';

type ChoiceItem = Extract<ExerciseItem, { kind: 'choice' }>;

/** Đọc từ/câu: tệp dựng sẵn theo miền nếu đã tải gói, không thì TTS của máy (GĐ2) */
export const say = (text: string) => playText(text);

/**
 * Trắc nghiệm / nghe chọn / điền từ / chọn đại từ (A6) / từ theo miền (A7): cùng một dạng “chọn một đáp án”.
 * Phản hồi ngay sau khi chọn (đúng/sai + giải thích), bấm Tiếp mới trả kết quả.
 * Dạng nghe có nút “Không nghe được lúc này” (máy không có giọng Việt, đang ở nơi công cộng): bỏ qua, không tính sai.
 */
export function ChoiceExercise({ item, onDone, onSkip }: { item: ChoiceItem; onDone(r: ExerciseResult): void; onSkip?(): void }) {
  const t = useT();
  const [chosen, setChosen] = useState<string | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const listen = item.variant === 'listen';

  useEffect(() => {
    if (listen && item.speak) void say(item.speak);
  }, [item, listen]);

  useEffect(() => {
    if (chosen !== null) feedbackRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [chosen]);

  const correct = chosen === item.answer;
  return (
    <div className="flex flex-col gap-3">
      {item.display && (
        <p lang="vi" className="m-0 rounded-xl bg-sunken p-3 text-xl font-extrabold text-ink">
          {item.display}
        </p>
      )}
      {item.hint && <p className="m-0 text-sm text-ink-soft">{item.hint}</p>}
      {item.speak && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => say(item.speak!)} className="min-h-12 rounded-xl border border-line bg-surface-2 px-4 font-bold text-ink">
            {t('replay')}
          </button>
          {listen && onSkip && chosen === null && (
            <button type="button" onClick={onSkip} className="min-h-12 rounded-xl border border-line bg-surface px-4 text-sm font-bold text-ink-soft">
              {t('cantListen')}
            </button>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2" role="group" aria-label={t('choices')}>
        {item.options.map((o) => {
          const state = chosen === null ? 'idle' : o === item.answer ? 'right' : o === chosen ? 'wrong' : 'idle';
          return (
            <button
              key={o}
              type="button"
              disabled={chosen !== null}
              onClick={() => setChosen(o)}
              // trắc nghiệm nghĩa Việt → Anh (có từ được đọc): lựa chọn là tiếng Anh; còn lại là tiếng Việt
              lang={item.variant === 'meaning' && item.speak ? undefined : 'vi'}
              className={[
                'min-h-14 break-words rounded-xl border-2 px-2 py-1 text-base font-bold',
                state === 'right' ? 'border-accent bg-accent text-accent-ink' : state === 'wrong' ? 'border-danger bg-danger-soft text-danger-ink' : 'border-line bg-surface-2 text-ink'
              ].join(' ')}
            >
              {o}
            </button>
          );
        })}
      </div>
      {chosen !== null && (
        <div ref={feedbackRef} role="status" className={['scroll-mb-[calc(80px+env(safe-area-inset-bottom))] rounded-xl p-3 text-[15px]', correct ? 'bg-accent-soft text-heading' : 'bg-danger-soft text-danger-ink'].join(' ')}>
          <strong>{correct ? t('right') : t('wrong', { answer: item.answer })}</strong>
          {item.explanation}
          {!correct && <ExplainButton request={{ kind: 'choice', question: [item.prompt, item.display].filter(Boolean).join(' — '), answer: item.answer, userAnswer: chosen }} />}
          <button
            type="button"
            onClick={() => onDone({ key: item.key, correct, skipped: false, quality: correct ? 5 : 1, answer: item.answer })}
            className="mt-2 block min-h-12 w-full rounded-xl bg-accent font-extrabold text-accent-ink"
          >
            {t('next')}
          </button>
        </div>
      )}
    </div>
  );
}
