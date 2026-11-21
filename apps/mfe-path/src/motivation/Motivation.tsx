import { useEffect, useMemo } from 'react';
import { COURSE, PitchReferenceFlyweight, type ToneId } from '@vietlearning/content';
import { learnerStore, useLearner, useUiLanguage } from '@vietlearning/state';
import { badgeStatuses, progressStore, useProgress, weeklySummary, type BadgeStatus } from '@vietlearning/state/progress';
import { Card } from '@vietlearning/ui';
import { cardStack } from '../Page';
import { badgeFacts } from './facts';
import { useT } from './i18n';

/**
 * GĐ4: huy hiệu theo thành thạo + tổng kết tuần. Cả file là một chunk lười (trang chủ lộ trình, tổng kết bài,
 * kiểm tra vượt unit) để không đụng ngân sách tải ban đầu.
 */
const FACTS = badgeFacts(COURSE);

/** Trao huy hiệu vừa đạt + ghi ngày “đã thuộc” — lúc mở và mỗi khi dữ liệu học đổi (an toàn khi gọi nhiều lần) */
function useAwarding() {
  useEffect(() => {
    const check = () => {
      progressStore.getState().noteKnownWords(learnerStore.getState().srs);
      progressStore.getState().awardBadges(FACTS);
    };
    check();
    const offP = progressStore.subscribe(check);
    const offL = learnerStore.subscribe((s, prev) => {
      if (s.srs !== prev.srs) check();
    });
    return () => {
      offP();
      offL();
    };
  }, []);
}

function useBadgeName() {
  const t = useT();
  const en = useUiLanguage() === 'en';
  return (key: string): { name: string; desc: string } => {
    if (key.startsWith('unit:')) {
      const i = COURSE.units.findIndex((u) => `unit:${u.id}` === key);
      const u = COURSE.units[i];
      return { name: t('badge.unit', { n: i + 1 }), desc: t('badge.unit.desc', { unit: u ? (en ? u.titleEn : u.title) : key }) };
    }
    const k = `badge.${key}` as 'badge.tones80';
    return { name: t(k), desc: t(`${k}.desc` as 'badge.tones80.desc') };
  };
}

/** Thông báo nhẹ khi vừa đạt huy hiệu: một dòng, không pháo hoa, không âm thanh */
export function BadgeNotice() {
  const t = useT();
  const nameOf = useBadgeName();
  useAwarding();
  const badges = useProgress((s) => s.badges);
  const fresh = Object.keys(badges).filter((k) => !badges[k].seen);
  if (fresh.length === 0) return null;
  return (
    <div role="status" className="flex items-center justify-between gap-2 rounded-xl bg-accent-soft p-3 text-sm text-heading">
      <span className="font-bold">{t('newBadge', { names: fresh.map((k) => nameOf(k).name).join(' · ') })}</span>
      <button type="button" onClick={() => progressStore.getState().markBadgesSeen(fresh)} className="min-h-11 shrink-0 rounded-xl border border-line bg-surface px-3 font-bold text-ink">
        {t('seen')}
      </button>
    </div>
  );
}

function Stat({ label, value, last }: { label: string; value: string; last: string | null }) {
  return (
    <li className="flex flex-col rounded-xl bg-surface-2 px-2 py-2">
      <span className="text-xs text-ink-soft">{label}</span>
      <span className="text-lg font-black text-heading">{value}</span>
      {last && <span className="text-xs text-ink-muted">{last}</span>}
    </li>
  );
}

/** Tổng kết tuần (so với chính mình) + danh sách huy hiệu (đã có / còn thiếu bao nhiêu) */
export function MotivationPanel() {
  const t = useT();
  const en = useUiLanguage() === 'en';
  const nameOf = useBadgeName();
  const activity = useLearner((s) => s.activity);
  const srs = useLearner((s) => s.srs);
  const p = useProgress((s) => s);
  const w = useMemo(
    () => weeklySummary({ activity, lessonsByDay: p.lessonsByDay, knownAt: p.knownAt, xpByDay: p.xpByDay, toneStats: p.toneStats, toneWeek: p.toneWeek }),
    [activity, p.lessonsByDay, p.knownAt, p.xpByDay, p.toneStats, p.toneWeek]
  );
  const statuses: BadgeStatus[] = useMemo(() => badgeStatuses({ toneStats: p.toneStats, srs, lessons: p.lessons, testedOut: p.testedOut }, FACTS), [p.toneStats, srs, p.lessons, p.testedOut]);
  const got = statuses.filter((s) => p.badges[s.key]).length;
  const last = (key: 'minutes' | 'lessons' | 'words', n: number) => (w.hasLastWeek ? t('lastWeek', { n: t(key, { n }) }) : null);
  const tone = w.bestTone ? PitchReferenceFlyweight.get(w.bestTone.tone as ToneId) : null;

  return (
    <>
      <Card role="region" aria-labelledby="ct-week-sum" elevated style={cardStack}>
        <div>
          <h2 id="ct-week-sum" className="m-0 text-base font-extrabold text-ink">
            {t('weekSummary')}
          </h2>
          <p className="m-0 text-xs text-ink-muted">{t('weekNote')}</p>
        </div>
        <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
          <Stat label={t('statTime')} value={t('minutes', { n: w.thisWeek.minutes })} last={last('minutes', w.lastWeek.minutes)} />
          <Stat label={t('statLessons')} value={t('lessons', { n: w.thisWeek.lessons })} last={last('lessons', w.lastWeek.lessons)} />
          <Stat label={t('statWords')} value={t('words', { n: w.thisWeek.words })} last={last('words', w.lastWeek.words)} />
        </ul>
        {tone && w.bestTone && <p className="m-0 text-sm text-ink">{t('bestTone', { tone: en ? tone.nameEn : tone.name, avg: w.bestTone.avg, delta: `+${w.bestTone.delta}` })}</p>}
        {!w.hasLastWeek && <p className="m-0 text-sm text-ink-soft">{t('noLastWeek')}</p>}
        <p className="m-0 text-xs text-ink-muted">{t('wordsHint')}</p>
      </Card>

      <details className="rounded-2xl border border-line-strong bg-surface px-4 shadow-card">
        <summary className="flex min-h-12 cursor-pointer items-center text-base font-extrabold text-ink">🏅 {t('badges', { got, total: statuses.length })}</summary>
        <p className="m-0 text-xs text-ink-muted">{t('badgesNote')}</p>
        <ul aria-label={t('badgesList')} className="m-0 flex list-none flex-col gap-2 px-0 py-3">
          {statuses.map((s) => {
            const earned = Boolean(p.badges[s.key]);
            const { name, desc } = nameOf(s.key);
            return (
              <li key={s.key} className={['flex flex-col gap-1 rounded-xl px-3 py-2', earned ? 'bg-accent-soft' : 'bg-surface-2'].join(' ')}>
                <span className="flex justify-between gap-2 text-[15px]">
                  <span className="font-bold text-ink">
                    <span aria-hidden="true">{earned ? '🏅 ' : '○ '}</span>
                    {name}
                  </span>
                  <span className="shrink-0 text-sm text-ink-soft">{earned ? t('got') : t('progress', { current: s.current, target: s.target, left: s.target - s.current })}</span>
                </span>
                <span className="text-xs text-ink-soft">{desc}</span>
                {!earned && (
                  <div className="h-2 overflow-hidden rounded-full bg-surface" aria-hidden="true">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(s.current / s.target) * 100}%` }} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </>
  );
}

/** Điểm vào lười duy nhất (một `lazy()` cho mọi màn): `part` chọn phần cần hiện */
export default function Motivation({ part }: { part: 'notice' | 'panel' }) {
  return part === 'notice' ? <BadgeNotice /> : <MotivationPanel />;
}
