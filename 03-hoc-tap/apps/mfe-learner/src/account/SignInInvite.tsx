import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProgress } from '@vietlearning/state/progress';
import { card, primaryBtn, secondaryBtn } from '../common/ui';
import { defaultDeps, type AuthDeps } from './deps';
import { useT } from './i18n';

const DISMISS_KEY = 'becutit.invite.dismissed';

function dismissedBefore(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Thẻ mời đăng nhập: hiện cho khách SAU KHI xong bài đầu tiên; tắt được (nhớ trên máy); không chặn việc học.
 * `always` = luôn hiện cho khách (dùng ở Hồ sơ, nơi người dùng chủ động tìm).
 */
export function SignInInvite({ deps = defaultDeps, always }: { deps?: AuthDeps; always?: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  const lessonsDone = useProgress((s) => s.lessonsDone);
  const [dismissed, setDismissed] = useState(dismissedBefore);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    let live = true;
    void deps
      .session()
      .then((s) => s.info())
      .then((i) => live && setIsGuest(!i || i.kind !== 'account'))
      .catch(() => live && setIsGuest(true));
    return () => {
      live = false;
    };
  }, [deps]);

  if (!isGuest || dismissed || (!always && lessonsDone < 1)) return null;

  const later = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* chế độ riêng tư: chỉ ẩn trong phiên */
    }
    setDismissed(true);
  };

  return (
    <section className={card} aria-labelledby="ct-invite-h">
      <h2 id="ct-invite-h" className="m-0 text-lg font-extrabold text-heading">
        {t('inviteTitle')}
      </h2>
      <p className="m-0 text-[15px] text-ink-soft">{t('inviteBody')}</p>
      <button type="button" className={primaryBtn} onClick={() => navigate('/dang-nhap')}>
        {t('inviteGo')}
      </button>
      <button type="button" className={secondaryBtn} onClick={later}>
        {t('inviteLater')}
      </button>
    </section>
  );
}
