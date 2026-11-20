// VỎ TẠM — Task 11 thay (FriendsScreen của mfe-learner, khi mfe-learner xuất FriendsPanel/FriendsScreen)
import { CuTit } from '@vietlearning/ui';
import { useT } from '../i18n';

/** Trang Bạn bè tạm: chưa có màn thật nên chỉ mời kết bạn bằng Cu Tít. */
export default function FriendsRoute() {
  const t = useT();
  return (
    <div className="home" style={{ textAlign: 'center' }}>
      <h1>{t('tabFriends')}</h1>
      <CuTit mood="chao" size={120} />
      <p className="lead">{t('friendsSoon')}</p>
    </div>
  );
}
