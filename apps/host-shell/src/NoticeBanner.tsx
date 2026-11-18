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
    dismiss: 'Đã hiểu'
  },
  {
    accountDeleted:
      'Your account was deleted on another device, so the learning data on this device was cleared too. You are starting fresh.',
    dismiss: 'Got it'
  }
);

export default function NoticeBanner({ notice }: { notice: NoticeKey }) {
  const t = useT();
  return (
    <div className="notice-banner" role="alert">
      <span>{t(notice)}</span>
      <button type="button" onClick={clearNotice}>
        {t('dismiss')}
      </button>
    </div>
  );
}
