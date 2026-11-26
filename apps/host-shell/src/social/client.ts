import type { SocialClient, SocialRest } from '@vietlearning/mfe-social';

/**
 * Điểm DUY NHẤT host cấp client mạng xã hội cho mfe-social (Dự án 4, Task 7).
 *
 * TẠM THỜI (cho tới khi Task 6 `packages/api-client/src/social` vào main): trả client "chưa mở" — mọi lời gọi REST từ chối
 * như tính năng đang tắt (404 / chat_unavailable), WebSocket không bao giờ nối. Màn hình hiển thị đúng trạng thái "Tin nhắn
 * chưa mở lúc này, bạn vẫn học bình thường" thay vì dữ liệu giả. KHÔNG có dữ liệu giả trong bản build.
 *
 * Khi Task 6 gộp: thay thân `getSocialClient` bằng `createSocialClient({...})` (import lười từ `@vietlearning/api-client/social`),
 * ánh xạ tên hàm sang giao diện `SocialRest` ở mfe-social/src/client/types.ts. Các màn không đổi.
 */
const unavailable = () => Promise.reject(Object.assign(new Error('chat unavailable'), { status: 404, code: 'chat_unavailable' }));

const rest: SocialRest = {
  me: unavailable,
  setHandle: unavailable,
  declareAge: unavailable,
  listConversations: unavailable,
  listMessages: unavailable,
  sendMessage: unavailable,
  markRead: unavailable,
  recall: unavailable,
  restore: unavailable,
  listFriendRequests: unavailable,
  createFriendRequest: unavailable,
  respondFriendRequest: unavailable,
  acceptInvite: unavailable,
  blockUser: unavailable,
  report: unavailable
};

const client: SocialClient = {
  rest,
  realtime: { state: 'idle', connect: () => undefined, close: () => undefined, on: () => () => undefined, onState: () => () => undefined }
};

export const getSocialClient = (): SocialClient => client;
