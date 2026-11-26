import { useLocation, useParams } from 'react-router-dom';
import { ChatListScreen, ChatScreen, FindFriendScreen, InviteScreen } from '@vietlearning/mfe-social';
import { getSocialClient } from '../social/client';
import SocialSoonRoute from './SocialSoonRoute';

/**
 * Một chunk cho các màn chat của mfe-social (Dự án 4): `/tin-nhan` (danh sách), `/tin-nhan/:id` (cuộc trò chuyện),
 * `/ban-be/tim` (thêm bạn), `/moi` và `/moi/:code` (mã mời). Tên khác `ChatRoute` (chat AI Cu Tít, `/hoi-thoai`).
 * Gộp một chunk + route dạng `/tin-nhan/*` để bản đồ route của gói đầu chỉ thêm 3 mục. `/tin-nhan/moi` (tạo nhóm) là Task 14.
 */
export default function SocialRoute() {
  const { pathname } = useLocation();
  const params = useParams();
  const client = getSocialClient();
  const path = pathname.replace(/\/+$/, '');
  if (path === '/ban-be/tim') return <FindFriendScreen client={client} />;
  if (path === '/moi' || path.startsWith('/moi/')) return <InviteScreen client={client} code={path.slice(5) || undefined} />;
  if (path === '/tin-nhan/moi') return <SocialSoonRoute />;
  const id = params['*'];
  return id ? <ChatScreen client={client} conversationId={id} /> : <ChatListScreen client={client} />;
}
