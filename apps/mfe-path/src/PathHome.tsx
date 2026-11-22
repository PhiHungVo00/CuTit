import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { COURSE } from '@vietlearning/content';
import { dayKey, dueCards, learnerStore, useLearner, useUiLanguage } from '@vietlearning/state';
import { goalProgress, learnedDays, progressStore, streakWithFreezes, totalXp, useProgress, weekCalendar } from '@vietlearning/state/progress';
import { useT } from './i18n';
import { lessonStatuses, nextLesson, unitProgress } from './path/pathModel';
import { lessonHref } from './path/lessonHref';
import { defaultVisible } from './path/visibility';
import { GoalPanel } from './GoalPanel';
import { startGoalWatch, syncReminders } from './reminders';
import { Card, Icon } from '@vietlearning/ui';
import { cardStack, LinkButton } from './Page';

// Thẻ miền (GĐ2) chỉ tải khi người học mở
const DialectCard = lazy(() => import('./DialectCard'));
// GĐ4: huy hiệu + tổng kết tuần (một chunk lười, cùng module)
const Motivation = lazy(() => import('./motivation/Motivation'));

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
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label={t('statsLabel')}>
        <li className="rounded-full bg-surface-2 px-3 py-1 text-sm font-bold text-heading" aria-label={t('streak', { n: streak })}>
          <span data-testid="streak">🔥 {streak}</span>
        </li>
        <li className="rounded-full bg-surface-2 px-3 py-1 text-sm font-bold text-heading" aria-label={t('xpLabel')}>
          <span data-testid="xp">⭐ {totalXp(xpByDay)}</span> XP
        </li>
        <li className="rounded-full bg-surface-2 px-3 py-1 text-sm font-bold text-heading" aria-label={t('freezesLabel', { n: freezes })}>
          {t('freezes', { n: freezes })}
        </li>
      </ul>
      <div className="flex flex-col gap-1">
        <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={t('goalLabel')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(gp.ratio * 100)}>
          <div className="h-full bg-accent" style={{ width: `${gp.ratio * 100}%` }} />
        </div>
        <p className="m-0 text-xs text-ink-soft">{gp.met ? t('goalMet') : t('goalToday', { m: gp.minutes, goal })}</p>
      </div>
      {freezeUsed > 0 && (
        <p role="status" className="m-0 rounded-xl bg-accent-soft p-3 text-sm text-heading">
          {t('freezeUsed', { n: freezeUsed })}
        </p>
      )}

      <Suspense fallback={null}>
        <Motivation part="notice" />
      </Suspense>

      <LinkButton to={lessonHref(next)} style={{ minHeight: 64, flexDirection: 'column', fontSize: '1.125rem' }}>
        <span>{isNew ? t('startFirst') : t('continue')}</span>
        <span className="text-sm font-semibold">{t('continueSub', { unit: en ? nextUnit.titleEn : nextUnit.title, lesson: en ? next.titleEn : next.title })}</span>
      </LinkButton>

      <Link to="/on-tap" className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line-strong bg-surface px-4 py-2 text-ink no-underline shadow-card">
        <span className="font-bold">
          {t('reviewToday')} ({due})
        </span>
        <span className="flex items-center gap-1 text-sm text-ink-soft">
          {due > 0 ? t('reviewCount', { n: due }) : t('reviewNone')}
          <Icon name="mui-ten-phai" size={18} />
        </span>
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
        {COURSE.units.map((u) => {
          const p = unitProgress(u, lessons, testedOut);
          return (
            <Card key={u.id} role="region" aria-labelledby={`ct-${u.id}`} elevated style={cardStack}>
              <div className="flex items-center justify-between gap-2">
                <h3 id={`ct-${u.id}`} className="m-0 text-base font-extrabold text-ink">
                  <span aria-hidden="true">{u.icon} </span>
                  {en ? u.titleEn : u.title}
                </h3>
                <span className="shrink-0 text-xs text-ink-muted">{t('unitProgress', p)}</span>
              </div>
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {u.lessons.filter(defaultVisible).map((l, i) => {
                  const st = statuses[l.id];
                  return (
                    <li key={l.id}>
                      <Link
                        to={lessonHref(l)}
                        className={[
                          'flex min-h-12 items-center gap-3 rounded-xl border-2 px-3 no-underline',
                          st === 'next' ? 'border-accent bg-accent-soft text-heading' : st === 'done' ? 'border-line bg-surface-2 text-ink' : 'border-line bg-surface text-ink'
                        ].join(' ')}
                      >
                        <span aria-hidden="true" className={['grid size-8 shrink-0 place-items-center rounded-full text-sm font-black', st === 'done' ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink'].join(' ')}>
                          {st === 'done' ? '✓' : l.roleplay ? '🎭' : i + 1}
                        </span>
                        <span className="flex-1 font-bold">{en ? l.titleEn : l.title}</span>
                        {/* dòng “tiếp theo” có nền cam: chữ muted chỉ đạt 3,85:1 (Lighthouse) => dùng ink-soft */}
                        <span className={['text-xs', st === 'next' ? 'text-ink-soft' : 'text-ink-muted'].join(' ')}>
                          {t(st === 'done' ? 'lessonDone' : st === 'next' ? 'lessonNext' : 'lessonOpen')}
                        </span>
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
                    {t('testOut')}
                  </Link>
                )
              )}
              {u.dialectNotes && u.dialectNotes.length > 0 && <DialectDetails ids={u.dialectNotes} />}
            </Card>
          );
        })}
        {/* Ghi chú đặt cuối bản đồ (không ở đầu): khối chữ của chunk lười lọt màn đầu sẽ thành LCP muộn khi chữ có sẵn ngắn hơn (bản en trên CI: 3 s) */}
        <p className="m-0 text-xs text-ink-soft">{t('pathNote')}</p>
        <p className="m-0 text-xs italic text-ink-muted">{t('draftContent')}</p>
      </section>

      {/* Panel lười (tổng kết tuần + huy hiệu) đặt dưới bản đồ: nằm ngoài màn hình đầu nên không thành phần tử LCP muộn (soi LCP 3 s) */}
      <Suspense fallback={null}>
        <Motivation part="panel" />
      </Suspense>

      <GoalPanel />
    </div>
  );
}

function DialectDetails({ ids }: { ids: readonly string[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} className="rounded-xl border border-line px-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold text-ink">{t('dialectCard')}</summary>
      {open && (
        <Suspense fallback={<div aria-busy="true" className="h-24" />}>
          <DialectCard ids={ids} />
        </Suspense>
      )}
    </details>
  );
}
