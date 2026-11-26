import { useEffect } from 'react';
import { getSocialClient } from '../social/client';

/** Giữ trùng với mfe-social (CHAT_UNREAD_EVENT) và mfe-learner (useChatUnread). */
const CHAT_UNREAD_EVENT = 'becutit:chat-unread';

/**
 * Hỏi MỘT lần số tin chưa đọc lúc rảnh (sau lần vẽ đầu) rồi phát sự kiện cho dòng "Tin nhắn" ở Hồ sơ. Chunk LƯỜI.
 * Lỗi / tính năng tắt / chưa đăng nhập ⇒ im lặng (chấm đỏ chỉ là gợi ý). Chỉ mount khi SOCIAL_ENTRY_ENABLED.
 */
export default function ChatUnreadProbe() {
  useEffect(() => {
    if (!navigator.onLine) return;
    let alive = true;
    getSocialClient()
      .rest.listConversations()
      .then(
        (r) => alive && window.dispatchEvent(new CustomEvent(CHAT_UNREAD_EVENT, { detail: r.conversations.reduce((a, c) => a + c.unread, 0) })),
        () => undefined
      );
    return () => {
      alive = false;
    };
  }, []);
  return null;
}
