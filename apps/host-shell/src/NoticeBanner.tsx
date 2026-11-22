import { useNavigate } from 'react-router-dom';
import { defineMessages } from '@vietlearning/state';
import { clearNotice, type NoticeKey } from './notice';

/**
 * Banner thông báo một lần (vd. tài khoản đã bị xóa ở máy khác). Hiếm khi hiện nên tách chunk lười
 * cùng chuỗi của nó — giữ bundle đầu trong ngân sách.
 */
const { useT } = defineMessages(
  {
    accountDeleted:
      'Tài khoản đã bị xóa trên thiết bị khác nên dữ liệu học trên máy này cũng đã được xóa. Bạn bắt đầu lại như người mới.',
    signedOut: 'Phiên đăng nhập đã hết hạn. Dữ liệu trên máy vẫn còn; hãy đăng nhập lại để đồng bộ.',
    mergedElsewhere: 'Tiến độ máy này đã gộp vào tài khoản ở máy khác. Hãy đăng nhập để tiếp tục.',
    signIn: 'Đăng nhập',
    dismiss: 'Đã hiểu'
  },
  {
    accountDeleted:
      'Your account was deleted on another device, so the learning data on this device was cleared too. You are starting fresh.',
    signedOut: 'Your sign-in expired. The data on this device is still here; sign in again to sync.',
    mergedElsewhere: 'This device’s progress was merged into an account on another device. Please sign in to continue.',
    signIn: 'Sign in',
    dismiss: 'Got it'
  }
);

export default function NoticeBanner({ notice }: { notice: NoticeKey }) {
  const t = useT();
  const navigate = useNavigate();
  const needsSignIn = notice === 'signedOut' || notice === 'mergedElsewhere';
  return (
    <div className="notice-banner" role="alert">
      <span>{t(notice)}</span>
      {needsSignIn && (
        <button
          type="button"
          onClick={() => {
            clearNotice();
            navigate('/dang-nhap');
          }}
        >
          {t('signIn')}
        </button>
      )}
      <button type="button" onClick={clearNotice}>
        {t('dismiss')}
      </button>
    </div>
  );
}
