import { useMemo, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListRow } from '@vietlearning/ui';
import { computeStreak, useLearner } from '@vietlearning/state';
import { useProgress } from '@vietlearning/state/progress';
import { ScreenFrame } from '../common/ui';
import { Rows } from '../settings/parts';
import { useT } from '../settings/i18n';

/** Thẻ "đã thuộc": đã lặp đúng từ 3 lần (SM-2 repetitions >= 3) */
const MASTERED_REPS = 3;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex flex-col rounded-2xl border border-line-strong bg-surface p-3">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-2xl font-black text-heading">{value}</span>
    </li>
  );
}

/** Hồ sơ (phương án B): 4 số liệu + danh sách gọn, Cài đặt là mục cuối. Dữ liệu offline trên máy. */
export function ProfileScreen() {
  const t = useT();
  const navigate = useNavigate();
  const profile = useLearner((s) => s.profile);
  const activity = useLearner((s) => s.activity);
  const srs = useLearner((s) => s.srs);
  const badgeCount = useProgress((s) => Object.keys(s.badges).length);

  const streak = computeStreak(activity);
  const minutes = useMemo(() => Math.round(Object.values(activity).reduce((a, b) => a + b, 0) / 60), [activity]);
  const words = useMemo(() => Object.values(srs).filter((c) => c.repetitions >= MASTERED_REPS).length, [srs]);

  const go = (to: string) => (e: MouseEvent<HTMLElement>) => {
    e.preventDefault();
    navigate(to);
  };
  const row = (icon: Parameters<typeof ListRow>[0]['icon'], label: string, hint: string, to: string) => <ListRow icon={icon} label={label} hint={hint} to={to} onClick={go(to)} />;

  return (
    <ScreenFrame title={t('profileTitle')}>
      <ul aria-label={t('statsLabel')} className="m-0 grid list-none grid-cols-2 gap-2 p-0">
        <Stat label={t('statStreak')} value={t('daysN', { n: streak })} />
        <Stat label={t('statMinutes')} value={t('minutesN', { n: minutes })} />
        <Stat label={t('statWords')} value={String(words)} />
        <Stat label={t('statBadges')} value={String(badgeCount)} />
      </ul>
      <Rows>
        {row('hoc', t('rowProgress'), t('rowProgressHint'), '/tien-do')}
        {row('ban-be', t('rowFriends'), t('rowFriendsHint'), '/ban-be')}
        {row('luyen-tap', t('rowPlacement'), profile.onboarded ? t('rowPlacementRedo') : t('rowPlacementDo'), '/bat-dau')}
        {row('cai-dat', t('rowSettings'), t('rowSettingsHint'), '/cai-dat')}
      </Rows>
    </ScreenFrame>
  );
}
