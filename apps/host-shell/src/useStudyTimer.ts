import { useEffect } from 'react';
import { learnerStore } from '@vietlearning/state';

const TICK_MS = 15_000;
/** Không chạm màn hình quá lâu thì coi như đã rời đi (không cộng giờ khi để máy sáng) */
const IDLE_MS = 2 * 60_000;

/**
 * Đếm thời gian học cho M9: chỉ cộng khi trang đang hiển thị VÀ người dùng có tương tác gần đây.
 * Ghi theo lô 15 giây (ít ghi localStorage), cộng phần lẻ khi ẩn trang.
 */
export function useStudyTimer(): void {
  useEffect(() => {
    let lastInput = Date.now();
    let since = Date.now();
    const active = () => document.visibilityState === 'visible' && Date.now() - lastInput < IDLE_MS;
    const flush = () => {
      const now = Date.now();
      if (active()) learnerStore.getState().addStudyTime((now - since) / 1000);
      since = now;
    };
    const onInput = () => {
      if (Date.now() - lastInput >= IDLE_MS) since = Date.now(); // vừa quay lại sau khi rảnh: bắt đầu đếm lại
      lastInput = Date.now();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
      else since = Date.now();
    };
    const id = window.setInterval(flush, TICK_MS);
    window.addEventListener('pointerdown', onInput, { passive: true });
    window.addEventListener('keydown', onInput);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      flush();
      window.clearInterval(id);
      window.removeEventListener('pointerdown', onInput);
      window.removeEventListener('keydown', onInput);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}
