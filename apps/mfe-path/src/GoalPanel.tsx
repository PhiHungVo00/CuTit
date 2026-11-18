import { useState } from 'react';
import { getLocalReminders, type LocalReminders } from '@vietlearning/native';
import { clampReminderHour, GOAL_OPTIONS, progressStore, useProgress } from '@vietlearning/state/progress';
import { useT } from './i18n';
import { enableReminders, syncReminders } from './reminders';

const pad = (n: number) => String(n).padStart(2, '0');

/** Mục tiêu ngày (người học chọn 5/10/15/20 phút) + nhắc học (chỉ hiện trên app có thông báo cục bộ). */
export function GoalPanel({ reminders = getLocalReminders() }: { reminders?: LocalReminders }) {
  const t = useT();
  const goal = useProgress((s) => s.dailyGoal);
  const reminder = useProgress((s) => s.reminder);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const time = `${pad(reminder.hour)}:${pad(reminder.minute)}`;

  const turnOn = async () => {
    setBusy(true);
    const ok = await enableReminders(reminders);
    setDenied(!ok);
    setBusy(false);
  };
  const turnOff = () => {
    progressStore.getState().setReminder({ enabled: false });
    void syncReminders(reminders);
  };
  const changeTime = (value: string) => {
    const [h, m] = value.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return;
    progressStore.getState().setReminder({ hour: clampReminderHour(h), minute: m });
    void syncReminders(reminders);
  };

  return (
    <details className="rounded-2xl border border-line-strong bg-surface p-4 shadow-card">
      <summary className="flex min-h-11 cursor-pointer items-center font-bold text-ink">⚙️ {t('goalSettings')}</summary>
      <fieldset className="mt-3 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-sm font-bold text-ink-soft">{t('goalPick')}</legend>
        <div className="grid grid-cols-2 gap-2 min-[360px]:grid-cols-4">
          {GOAL_OPTIONS.map((g) => (
            <label
              key={g}
              className={['flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 text-sm font-bold', goal === g ? 'border-accent bg-accent-soft text-heading' : 'border-line bg-surface-2 text-ink'].join(' ')}
            >
              <input
                type="radio"
                name="ct-goal"
                className="sr-only"
                checked={goal === g}
                onChange={() => {
                  progressStore.getState().setDailyGoal(g);
                  void syncReminders(reminders);
                }}
              />
              {t('goalMinutes', { n: g })}
            </label>
          ))}
        </div>
      </fieldset>

      {reminders.supported() && (
        <section aria-labelledby="ct-reminder" className="mt-4 flex flex-col gap-2">
          <h3 id="ct-reminder" className="m-0 text-sm font-bold text-ink-soft">
            🔔 {t('reminderTitle')}
          </h3>
          <p className="m-0 text-sm text-ink-soft">{t('reminderHint')}</p>
          {reminder.enabled ? (
            <>
              <p className="m-0 text-sm font-bold text-heading">{t('reminderOn', { time })}</p>
              <label className="flex min-h-12 items-center justify-between gap-3 text-sm text-ink">
                {t('reminderTime')}
                <input
                  type="time"
                  min="07:00"
                  max="21:59"
                  value={time}
                  onChange={(e) => changeTime(e.target.value)}
                  className="min-h-11 rounded-xl border border-line bg-surface-2 px-3 text-ink"
                />
              </label>
              <button type="button" onClick={turnOff} className="min-h-12 rounded-xl border border-line-strong bg-surface px-4 font-bold text-ink">
                {t('reminderDisable')}
              </button>
            </>
          ) : (
            <button type="button" disabled={busy} onClick={() => void turnOn()} className="min-h-12 rounded-xl bg-accent px-4 font-extrabold text-accent-ink disabled:opacity-50">
              {t('reminderEnable')}
            </button>
          )}
          {denied && (
            <p role="alert" className="m-0 text-sm text-danger-ink">
              {t('reminderDenied')}
            </p>
          )}
        </section>
      )}
    </details>
  );
}
