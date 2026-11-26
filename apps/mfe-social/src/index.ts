/** Điểm vào công khai của mfe-social (Dự án 4): Host chỉ import từ đây (ghép lúc build, nạp lười theo route). */
export { ChatListScreen } from './chat/ConversationList';
export { ChatScreen } from './chat/ConversationScreen';
export { FindFriendScreen } from './friends/FindFriend';
export { InviteScreen } from './friends/Invite';
export { CHAT_UNREAD_EVENT } from './state/useSocial';
export type { SocialClient, SocialRest, SocialRealtime, ConnState } from './client/types';
