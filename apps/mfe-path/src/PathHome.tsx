import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { COURSE } from '@vietlearning/content';
import { dayKey, dueCards, learnerStore, useLearner, useUiLanguage } from '@vietlearning/state';
import { goalProgress, learnedDays, progressStore, streakWithFreezes, totalXp, useProgress, weekCalendar } from '@vietlearning/state/progress';
import { useT } from './i18n';
import { lessonStatuses, nextLesson, unitProgress } from './path/pathModel';
import { GoalPanel } from './GoalPanel';
import { startGoalWatch, syncReminders } from './reminders';
import { card, primaryBtn } from './ui';

/**
 * Phần lộ trình của trang chủ (Host đặt dưới tiêu đề app, tải lazy):
 * một nút chính “Học tiếp”, thẻ “Ôn hôm nay (n)”, chuỗi ngày/XP/mục tiêu, lịch tuần, bản đồ unit.
 */
export function PathHome() {
  const t = useT();
  const en = useUiLanguage() === 'en';
  const activity = useLearner((s) => s.activity);
  const srs = useLearner((s) => s.srs);
  const lessons = useProgress((s) => s.lessons);
  const testedOut = useProgress((s) => s.testedOut);
  const xpByDay = useProgress((s) => s.xpByDay);
  const frozenDays = useProgress((s) => s.frozenDays);
  const freezes = useProgress((s) => s.freezes);
  const goal = useProgress((s) => s.dailyGoal);
  const [freezeUsed, setFreezeUsed] = useState(0);

  // Mở lộ trình: tiêu đóng băng cho ngày vừa lỡ (an toàn khi gọi nhiều lần)
  useEffect(() => {
    setFreezeUsed(progressStore.getState().settleFreezes(learnerStore.getState().activity));
    // Mở app: đặt lại lịch nhắc (bỏ mốc hôm nay nếu đã đạt mục tiêu); web thì không làm gì
    void syncReminders().catch(() => undefined);
    startGoalWatch();
  }, []);

  const today = dayKey(new Date());
  const streak = streakWithFreezes(activity, xpByDay, frozenDays);
  const gp = goalProgress(activity[today] ?? 0, goal);
  const week = useMemo(() => weekCalendar(learnedDays(activity, xpByDay, []), frozenDays), [activity, xpByDay, frozenDays]);
  const due = dueCards(srs).length;
  const next = nextLesson(COURSE, lessons, testedOut);
  const nextUnit = COURSE.units.find((u) => u.lessons.some((l) => l.id === next.id))!;
  const statuses = lessonStatuses(COURSE, lessons, testedOut);
  const isNew = Object.keys(lessons).length === 0 && Object.keys(testedOut).length === 0;

  return (
    <div className="flex flex-col gap-4">
      <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 text-center">
        <li className="rounded-xl bg-surface-2 px-1 py-2" aria-label={t('streakLabel')}>
          <span className="block text-lg font-black text-heading" data-testid="streak">
            🔥 {streak}
          </span>
          <span className="block text-xs text-ink-soft">{t('streak', { n: streak })}</span>
        </li>
        <li className="rounded-xl bg-surface-2 px-1 py-2" aria-label={t('xpLabel')}>
          <span className="block text-lg font-black text-heading" data-testid="xp">
            ⭐ {totalXp(xpByDay)}
          </span>
          <span className="block text-xs text-ink-soft">XP</span>
        </li>
        <li className="rounded-xl bg-surface-2 px-1 py-2" aria-label={t('freezesLabel', { n: freezes })}>
          <span className="block text-lg font-black text-heading">{t('freezes', { n: freezes })}</span>
          <span className="block text-xs text-ink-soft">{gp.met ? t('goalMet') : t('goalToday', { m: gp.minutes, goal })}</span>
        </li>
      </ul>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={t('goalLabel')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(gp.ratio * 100)}>
        <div className="h-full bg-accent" style={{ width: `${gp.ratio * 100}%` }} />
      </div>
      {freezeUsed > 0 && (
        <p role="status" className="m-0 rounded-xl bg-accent-soft p-3 text-sm text-heading">
          {t('freezeUsed', { n: freezeUsed })}
        </p>
      )}

      <Link to={`/bai-hoc/${next.id}`} className={`${primaryBtn} min-h-16 flex-col gap-0 text-lg`}>
        <span>{isNew ? t('startFirst') : t('continue')}</span>
        <span className="text-sm font-semibold opacity-90">{t('continueSub', { unit: en ? nextUnit.titleEn : nextUnit.title, lesson: en ? next.titleEn : next.title })}</span>
      </Link>

      <Link to="/on-tap" className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line-strong bg-surface px-4 py-2 text-ink no-underline shadow-card">
        <span className="font-bold">
          🔁 {t('reviewToday')} ({due})
        </span>
        <span className="text-sm text-ink-soft">{due > 0 ? t('reviewCount', { n: due }) : t('reviewNone')}</span>
      </Link>

      <section aria-labelledby="ct-week" className="flex flex-col gap-2">
        <h2 id="ct-week" className="m-0 text-sm font-bold text-ink-soft">
          {t('weekTitle')}
        </h2>
        <ol className="m-0 grid list-none grid-cols-7 gap-1 p-0">
          {week.map((d) => (
            <li key={d.day} className="flex flex-col items-center gap-1" aria-label={`${t(`wd.${d.weekday}` as 'wd.0')} ${t(`day.${d.status}`)}`}>
              <span className="text-xs text-ink-muted">{t(`wd.${d.weekday}` as 'wd.0')}</span>
              <span
                aria-hidden="true"
                className={[
                  'grid size-8 place-items-center rounded-full text-sm',
                  d.status === 'done' ? 'bg-accent text-accent-ink' : d.status === 'frozen' ? 'bg-surface-2 text-heading' : d.status === 'today' ? 'border-2 border-accent' : 'bg-surface-2 opacity-60'
                ].join(' ')}
              >
                {d.status === 'done' ? '✓' : d.status === 'frozen' ? '❄' : ''}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="ct-path" className="flex flex-col gap-3">
        <h2 id="ct-path" className="m-0 text-lg font-black text-heading">
          {t('pathTitle')}
        </h2>
        <p className="m-0 text-sm text-ink-soft">{t('pathNote')}</p>
        {COURSE.units.map((u) => {
          const p = unitProgress(u, lessons, testedOut);
          return (
            <section key={u.id} aria-labelledby={`ct-${u.id}`} className={card}>
              <div className="flex items-center justify-between gap-2">
                <h3 id={`ct-${u.id}`} className="m-0 text-base font-extrabold text-ink">
                  <span aria-hidden="true">{u.icon} </span>
                  {en ? u.titleEn : u.title}
                </h3>
                <span className="shrink-0 text-xs text-ink-muted">{t('unitProgress', p)}</span>
              </div>
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {u.lessons.map((l, i) => {
                  const st = statuses[l.id];
                  return (
                    <li key={l.id}>
                      <Link
                        to={`/bai-hoc/${l.id}`}
                        className={[
                          'flex min-h-12 items-center gap-3 rounded-xl border-2 px-3 no-underline',
                          st === 'next' ? 'border-accent bg-accent-soft text-heading' : st === 'done' ? 'border-line bg-surface-2 text-ink' : 'border-line bg-surface text-ink'
                        ].join(' ')}
                      >
                        <span aria-hidden="true" className={['grid size-8 shrink-0 place-items-center rounded-full text-sm font-black', st === 'done' ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink'].join(' ')}>
                          {st === 'done' ? '✓' : i + 1}
                        </span>
                        <span className="flex-1 font-bold">{en ? l.titleEn : l.title}</span>
                        <span className="text-xs text-ink-muted">{t(st === 'done' ? 'lessonDone' : st === 'next' ? 'lessonNext' : 'lessonOpen')}</span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
              {testedOut[u.id] ? (
                <p className="m-0 text-sm font-bold text-heading">{t('unitPassed')}</p>
              ) : (
                p.done < p.total && (
                  <Link to={`/kiem-tra/${u.id}`} className="flex min-h-11 items-center justify-center rounded-xl border border-dashed border-line-strong px-3 text-sm font-bold text-ink no-underline">
                    🎯 {t('testOut')}
                  </Link>
                )
              )}
            </section>
          );
        })}
        <p className="m-0 text-xs italic text-ink-muted">{t('draftContent')}</p>
      </section>

      <GoalPanel />
    </div>
  );
}
