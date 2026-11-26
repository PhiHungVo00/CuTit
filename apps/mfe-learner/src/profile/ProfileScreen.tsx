import { useMemo, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListRow } from '@vietlearning/ui';
import { computeStreak, useLearner } from '@vietlearning/state';
import { useProgress } from '@vietlearning/state/progress';
import { ScreenFrame } from '../common/ui';
import { Rows } from '../settings/parts';
import { useT } from '../settings/i18n';
import { SignInInvite } from '../account/SignInInvite';
import { useFeedbackUnread } from '../feedback/useFeedbackUnread';
import { useChatUnread } from './useChatUnread';

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
/** `messagesEnabled`: Host bật dòng Tin nhắn (Dự án 4); mfe-learner không biết gì về mfe-social, chỉ đi tới /tin-nhan. */
export function ProfileScreen({ messagesEnabled = false }: { messagesEnabled?: boolean } = {}) {
  const t = useT();
  const navigate = useNavigate();
  const profile = useLearner((s) => s.profile);
  const activity = useLearner((s) => s.activity);
  const srs = useLearner((s) => s.srs);
  const { count: unread } = useFeedbackUnread();
  const chatUnread = useChatUnread();
  const badgeCount = useProgress((s) => Object.keys(s.badges).length);

  const streak = computeStreak(activity);
  const minutes = useMemo(() => Math.round(Object.values(activity).reduce((a, b) => a + b, 0) / 60), [activity]);
  const words = useMemo(() => Object.values(srs).filter((c) => c.repetitions >= MASTERED_REPS).length, [srs]);

  const go = (to: string) => (e: MouseEvent<HTMLElement>) => {
    e.preventDefault();
    navigate(to);
  };
  const row = (icon: Parameters<typeof ListRow>[0]['icon'], label: string, hint: string, to: string, trailing?: ReactNode) => <ListRow icon={icon} label={label} hint={hint} to={to} onClick={go(to)} trailing={trailing} />;
  // Chấm đỏ: có lời nhắn chưa đọc. Màu #C0553A (token lỗi của bản phác) + chữ ẩn cho trình đọc màn hình, không chỉ báo bằng màu
  const dot = unread > 0 ? (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden="true" className="inline-block rounded-full" style={{ width: 12, height: 12, background: '#C0553A' }} />
      <span className="sr-only">{t('rowFeedbackDot')}</span>
    </span>
  ) : undefined;

  const chatDot = chatUnread > 0 ? (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden="true" className="inline-block rounded-full" style={{ width: 12, height: 12, background: '#C0553A' }} />
      <span className="sr-only">{t('rowMessagesDot')}</span>
    </span>
  ) : undefined;

  return (
    <ScreenFrame title={t('profileTitle')}>
      <ul aria-label={t('statsLabel')} className="m-0 grid list-none grid-cols-2 gap-2 p-0">
        <Stat label={t('statStreak')} value={t('daysN', { n: streak })} />
        <Stat label={t('statMinutes')} value={t('minutesN', { n: minutes })} />
        <Stat label={t('statWords')} value={String(words)} />
        <Stat label={t('statBadges')} value={String(badgeCount)} />
      </ul>
      <SignInInvite always />
      <Rows>
        {row('hoc', t('rowProgress'), t('rowProgressHint'), '/tien-do')}
        {row('ban-be', t('rowFriends'), t('rowFriendsHint'), '/ban-be')}
        {row('luyen-tap', t('rowPlacement'), profile.onboarded ? t('rowPlacementRedo') : t('rowPlacementDo'), '/bat-dau')}
        {messagesEnabled && row('chat', t('rowMessages'), t('rowMessagesHint'), '/tin-nhan', chatDot)}
        {row('chat', t('rowFeedback'), t('rowFeedbackHint'), '/gop-y', dot)}
        {row('cai-dat', t('rowSettings'), t('rowSettingsHint'), '/cai-dat')}
      </Rows>
    </ScreenFrame>
  );
}
