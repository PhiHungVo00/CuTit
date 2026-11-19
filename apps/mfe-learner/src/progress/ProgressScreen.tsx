import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { accuracyBySkill, cefrLabel, computeStreak, dueCards, useLearner, type SrsCard, type Skill } from '@vietlearning/state';
import { ScreenFrame, card, linkBtn, primaryBtn, secondaryBtn } from '../common/ui';
import { useT } from '../i18n';
import { ReviewSession } from './ReviewSession';
import { formatDue, lastSevenDays, nextDue } from './stats';

/** GĐ4c: chunk lười riêng, chỉ tải (và chỉ gọi mạng) khi người học bấm mở */
const FriendsPanel = lazy(() => import('../friends/FriendsPanel'));

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col rounded-2xl border border-line-strong bg-surface p-3">
      <span className="text-2xl font-black text-heading">{value}</span>
      <span className="text-sm text-ink-muted">{label}</span>
    </div>
  );
}

/** Màn hình M9: chuỗi ngày, thời gian học, độ chính xác theo kỹ năng, ôn thẻ SM-2 đến hạn. Dữ liệu offline trên máy. */
export function ProgressScreen() {
  const t = useT();
  const lang = useLearner((s) => s.preferences.uiLanguage);
  const profile = useLearner((s) => s.profile);
  const activity = useLearner((s) => s.activity);
  const attempts = useLearner((s) => s.attempts);
  const srs = useLearner((s) => s.srs);
  const [reviewing, setReviewing] = useState<SrsCard[] | null>(null);
  const [friendsOpen, setFriendsOpen] = useState(false);

  const week = useMemo(() => lastSevenDays(activity, new Date(), lang), [activity, lang]);
  const weekMinutes = week.reduce((a, d) => a + d.minutes, 0);
  const max = Math.max(10, ...week.map((d) => d.minutes));
  const streak = computeStreak(activity);
  const due = useMemo(() => dueCards(srs), [srs]);
  const upcoming = due.length === 0 ? nextDue(srs) : null;
  const acc = Object.entries(accuracyBySkill(attempts)) as [Skill, { total: number; correct: number; rate: number }][];
  const totalCards = Object.keys(srs).length;

  return (
    <ScreenFrame
      title={t('progressTitle')}
      action={
        <Link to="/tuy-chinh" className={linkBtn}>
          {t('settingsLink')}
        </Link>
      }
    >
      {reviewing ? (
        <ReviewSession cards={reviewing} onClose={() => setReviewing(null)} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Tile value={t('days', { n: streak })} label={t('streak')} />
            <Tile value={t('minutes', { n: weekMinutes })} label={t('week')} />
            <Tile value={profile.onboarded ? cefrLabel(profile.level) : '—'} label={t('level')} />
            <Tile value={String(due.length)} label={t('dueTile')} />
          </div>

          <section className={card} aria-labelledby="ct-srs">
            <h2 id="ct-srs" className="m-0 text-lg font-extrabold text-ink">
              {t('srsTitle')}
            </h2>
            {totalCards === 0 ? (
              <>
                <p className="m-0 text-[15px] text-ink-soft">{t('srsEmpty')}</p>
                <div className="flex flex-wrap gap-2">
                  <Link to="/luyen-tap" className={linkBtn}>
                    {t('practiceLink')}
                  </Link>
                  <Link to="/phuong-ngu" className={linkBtn}>
                    {t('dialectLink')}
                  </Link>
                </div>
              </>
            ) : due.length > 0 ? (
              <>
                <p className="m-0 text-[15px] text-ink-soft">{t('dueToday', { due: due.length, total: totalCards })}</p>
                <button type="button" className={primaryBtn} onClick={() => setReviewing(due.slice(0, 20))}>
                  {t('reviewN', { n: Math.min(20, due.length) })}
                </button>
              </>
            ) : (
              <p className="m-0 text-[15px] text-ink-soft">
                {t('allDone', { n: totalCards })}
                {upcoming ? t('nextDue', { when: formatDue(upcoming, new Date(), lang) }) : ''}
              </p>
            )}
          </section>

          <section className={card} aria-labelledby="ct-week">
            <h2 id="ct-week" className="m-0 text-lg font-extrabold text-ink">
              {t('weekTitle')}
            </h2>
            {/* Một chuỗi số liệu => không cần chú giải; danh sách ẩn bên dưới là bản bảng cho trình đọc màn hình */}
            <div className="flex h-32 items-end gap-2 border-b border-line" aria-hidden="true">
              {week.map((d) => (
                <div key={d.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.label}: ${t('minutes', { n: d.minutes })}`}>
                  {(d.isToday || d.minutes === max) && d.minutes > 0 && <span className="text-xs font-bold text-ink-soft">{d.minutes}</span>}
                  <div className="w-full max-w-7 rounded-t-[4px] bg-accent" style={{ height: `${(d.minutes / max) * 100}%`, minHeight: d.minutes > 0 ? 3 : 0 }} />
                </div>
              ))}
            </div>
            <div className="flex gap-2" aria-hidden="true">
              {week.map((d) => (
                <span key={d.key} className={['flex-1 text-center text-xs', d.isToday ? 'font-bold text-ink' : 'text-ink-muted'].join(' ')}>
                  {d.label}
                </span>
              ))}
            </div>
            <ul className="sr-only">
              {week.map((d) => (
                <li key={d.key}>
                  {d.label}: {t('minutes', { n: d.minutes })}
                </li>
              ))}
            </ul>
          </section>

          <section className={card} aria-labelledby="ct-acc">
            <h2 id="ct-acc" className="m-0 text-lg font-extrabold text-ink">
              {t('accTitle')}
            </h2>
            {acc.length === 0 ? (
              <p className="m-0 text-[15px] text-ink-soft">{t('accEmpty')}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {acc.map(([skill, r]) => (
                  <li key={skill} className="flex flex-col gap-1">
                    <span className="flex justify-between text-[15px]">
                      <span className="font-bold text-ink">{t(`skill.${skill}`)}</span>
                      <span className="text-ink-soft">{t('accRow', { rate: r.rate, correct: r.correct, total: r.total })}</span>
                    </span>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${r.rate}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={card} aria-labelledby="ct-friends">
            <h2 id="ct-friends" className="m-0 text-lg font-extrabold text-ink">
              {t('friendsTitle')}
            </h2>
            {friendsOpen ? (
              <Suspense fallback={null}>
                <FriendsPanel />
              </Suspense>
            ) : (
              <>
                <p className="m-0 text-[15px] text-ink-soft">{t('friendsHint')}</p>
                <button type="button" className={secondaryBtn} onClick={() => setFriendsOpen(true)}>
                  {t('friendsOpen')}
                </button>
              </>
            )}
          </section>

          <Link to="/bat-dau" className={`${linkBtn} justify-center`}>
            🌱 {profile.onboarded ? t('redoPlacement') : t('doPlacement')}
          </Link>
        </>
      )}
    </ScreenFrame>
  );
}
