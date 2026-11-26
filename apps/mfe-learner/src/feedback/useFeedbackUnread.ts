import { useCallback, useEffect, useState } from 'react';
import { unreadFeedbackCount } from '@vietlearning/api-client/feedback';

/**
 * Sự kiện (cửa sổ) báo số góp ý chưa đọc, `detail` = số (nguyên tắc 7: MFE không import chéo; Host nghe cùng tên này để
 * vẽ chấm đỏ ở tab Hồ sơ — host-shell/src/shell/feedbackUnread.ts, giữ hai chuỗi trùng nhau).
 */
export const FEEDBACK_UNREAD_EVENT = 'becutit:feedback-unread';

/**
 * Số góp ý có lời nhắn chưa đọc. Hỏi Gateway khi mở màn (Hồ sơ) và mỗi khi gọi `refresh()`;
 * lỗi mạng/chưa có phiên ⇒ giữ số cũ, KHÔNG báo lỗi (chấm đỏ chỉ là gợi ý).
 */
export function useFeedbackUnread(): { count: number; refresh: () => void } {
  const [count, setCount] = useState(0);
  const refresh = useCallback(() => {
    unreadFeedbackCount().then(
      (n) => window.dispatchEvent(new CustomEvent(FEEDBACK_UNREAD_EVENT, { detail: n })),
      () => undefined
    );
  }, []);
  useEffect(() => {
    const on = (e: Event) => setCount(Number((e as CustomEvent<number>).detail) || 0);
    window.addEventListener(FEEDBACK_UNREAD_EVENT, on);
    return () => window.removeEventListener(FEEDBACK_UNREAD_EVENT, on);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { count, refresh };
}
