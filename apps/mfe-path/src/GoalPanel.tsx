import { GOAL_OPTIONS, progressStore, useProgress } from '@vietlearning/state/progress';
import { useT } from './i18n';

/** Mục tiêu ngày (người học chọn 5/10/15/20 phút) + nhắc học (chỉ hiện trên app có thông báo). */
export function GoalPanel({ goalMet: _goalMet }: { goalMet: boolean }) {
  const t = useT();
  const goal = useProgress((s) => s.dailyGoal);
  return (
    <details className="rounded-2xl border border-line-strong bg-surface p-4 shadow-card">
      <summary className="flex min-h-11 cursor-pointer items-center font-bold text-ink">⚙️ {t('goalSettings')}</summary>
      <fieldset className="mt-3 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-sm font-bold text-ink-soft">{t('goalPick')}</legend>
        <div className="grid grid-cols-4 gap-2">
          {GOAL_OPTIONS.map((g) => (
            <label
              key={g}
              className={['flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 text-sm font-bold', goal === g ? 'border-accent bg-accent-soft text-heading' : 'border-line bg-surface-2 text-ink'].join(' ')}
            >
              <input type="radio" name="ct-goal" className="sr-only" checked={goal === g} onChange={() => progressStore.getState().setDailyGoal(g)} />
              {t('goalMinutes', { n: g })}
            </label>
          ))}
        </div>
      </fieldset>
    </details>
  );
}
