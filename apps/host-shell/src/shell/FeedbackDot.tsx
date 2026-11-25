import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { unreadFeedbackCount } from '@vietlearning/api-client/feedback';
import { useUiLanguage } from '@vietlearning/state';
import { useLocation } from 'react-router-dom';

/**
 * Chấm đỏ trên tab Hồ sơ khi có góp ý có lời nhắn chưa đọc (dự án 5a). Chunk LƯỜI (App nạp sau lần vẽ đầu) nên không
 * tốn gói đầu: dựng bằng portal vào biểu tượng của tab (TabBar không phải biết gì về Góp ý).
 *
 * Số chưa đọc: hỏi Gateway MỘT lần khi mở app (chỉ khi online; lỗi/chưa có phiên ⇒ im lặng, chấm đỏ chỉ là gợi ý),
 * rồi theo sự kiện `becutit:feedback-unread` (detail = số) do mfe-learner phát khi mở Hồ sơ / đọc xong một góp ý.
 * MFE không import chéo nên hai bên chỉ thống nhất tên sự kiện (mfe-learner/src/feedback/useFeedbackUnread.ts).
 */
export const FEEDBACK_UNREAD_EVENT = 'becutit:feedback-unread';
const LABEL = { vi: 'Có tin mới', en: 'New reply' } as const;

export default function FeedbackDot() {
  const [count, setCount] = useState(0);
  const lang = useUiLanguage();
  const { pathname } = useLocation();
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => {
    let gotEvent = false;
    const on = (e: Event) => ((gotEvent = true), setCount(Math.max(0, Math.floor(Number((e as CustomEvent<number>).detail) || 0))));
    window.addEventListener(FEEDBACK_UNREAD_EVENT, on);
    let alive = true;
    if (navigator.onLine) {
      unreadFeedbackCount().then(
        (n) => alive && !gotEvent && setCount(n),
        () => undefined
      );
    }
    return () => {
      alive = false;
      window.removeEventListener(FEEDBACK_UNREAD_EVENT, on);
    };
  }, []);

  // Tìm biểu tượng tab SAU khi vẽ xong (effect): ra khỏi màn tập trung thì TabBar mới mount cùng lượt commit
  useEffect(() => {
    setHost(count > 0 ? document.querySelector('.tabbar a[href="/ho-so"] .tab-icon') : null);
  }, [count, pathname]);
  if (!host || count <= 0) return null;
  return createPortal(
    <>
      <span aria-hidden="true" style={{ position: 'absolute', top: 0, right: -3, width: 10, height: 10, borderRadius: '50%', background: '#C0553A' }} />
      <span className="sr-only">{LABEL[lang]}</span>
    </>,
    host
  );
}
