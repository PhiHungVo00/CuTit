import { useEffect, useState } from 'react';
import { isAudioBusy, onAudioBusyChange } from '@vietlearning/shared/audio/focus';
import { isFocusRoute } from './navMap';

export type BubbleVisibility = 'full' | 'mini' | 'hidden';
type ScrollMode = 'full' | 'mini';

const MINI_AFTER_PX = 48;
const KEYBOARD_PX = 150;

/** Cuộn xuống quá 48px ⇒ thu nhỏ; cuộn lên hoặc về gần đầu trang ⇒ hiện lại; đứng yên giữ nguyên. */
export function nextScrollMode(prev: ScrollMode, y: number, lastY: number): ScrollMode {
  if (y <= MINI_AFTER_PX) return 'full';
  if (y > lastY) return 'mini';
  if (y < lastY) return 'full';
  return prev;
}

/** Bàn phím mở ⇒ visualViewport thấp hơn chiều cao nền quá 150px (thanh địa chỉ co giãn chỉ ~50–100px). */
export const isKeyboardOpen = (viewportHeight: number, baselineHeight: number): boolean => baselineHeight - viewportHeight > KEYBOARD_PX;

export function bubbleVisibility(s: { pathname: string; scrollMode: ScrollMode; keyboardOpen: boolean; audioBusy: boolean }): BubbleVisibility {
  if (isFocusRoute(s.pathname) || s.keyboardOpen || s.audioBusy) return 'hidden';
  return s.scrollMode;
}

/** Trạng thái bong bóng Cu Tít: ẩn ở màn tập trung/bàn phím/đang có âm thanh; mini khi cuộn xuống. */
export function useBubbleVisibility(pathname: string): BubbleVisibility {
  const [scrollMode, setScrollMode] = useState<ScrollMode>('full');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [audioBusy, setAudioBusy] = useState(isAudioBusy);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrollMode((m) => nextScrollMode(m, y, last));
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Đổi màn: cuộn về đầu ⇒ hiện đầy đủ
  useEffect(() => setScrollMode('full'), [pathname]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let baseline = Math.max(window.innerHeight, vv.height);
    const onResize = () => {
      baseline = Math.max(baseline, vv.height);
      setKeyboardOpen(isKeyboardOpen(vv.height, baseline));
    };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => onAudioBusyChange(setAudioBusy), []);

  return bubbleVisibility({ pathname, scrollMode, keyboardOpen, audioBusy });
}
