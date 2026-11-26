import { useEffect, useState } from 'react';

/**
 * Tổng tin nhắn chưa đọc (Dự án 4), `detail` = số. MFE không import chéo nên tên sự kiện được chép ở 3 nơi, GIỮ TRÙNG:
 * mfe-social/src/state/useSocial.ts (CHAT_UNREAD_EVENT), host-shell/src/shell/ChatUnreadProbe.tsx và đây.
 */
const CHAT_UNREAD_EVENT = 'becutit:chat-unread';

export function useChatUnread(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const on = (e: Event) => setN(Math.max(0, Math.floor(Number((e as CustomEvent<number>).detail) || 0)));
    window.addEventListener(CHAT_UNREAD_EVENT, on);
    return () => window.removeEventListener(CHAT_UNREAD_EVENT, on);
  }, []);
  return n;
}
