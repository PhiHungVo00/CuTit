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

/** Ô nhập chữ (hiện bàn phím ảo). Có `type` không phải chữ (checkbox, nút...) thì không tính. */
export function isTextEntry(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'range', 'file', 'color', 'reset', 'image'].includes(el.type);
}

/** Làm quen (/bat-dau) ẩn bong bóng nhưng giữ thanh tab (bước 1 không có nút Quay lại). */
export function bubbleVisibility(s: { pathname: string; scrollMode: ScrollMode; keyboardOpen: boolean; audioBusy: boolean }): BubbleVisibility {
  if (isFocusRoute(s.pathname) || s.pathname === '/bat-dau' || s.keyboardOpen || s.audioBusy) return 'hidden';
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
    let baseline = vv ? Math.max(window.innerHeight, vv.height) : 0;
    let resized = false;
    let typing = isTextEntry(document.activeElement);
    const update = () => setKeyboardOpen(resized || typing);
    const onResize = () => {
      if (!vv) return;
      baseline = Math.max(baseline, vv.height);
      resized = isKeyboardOpen(vv.height, baseline);
      update();
    };
    // Android WebView (edge-to-edge, targetSdk 35) KHÔNG co visualViewport khi bàn phím mở (đo trên AVD API 35):
    // thêm tín hiệu "đang gõ vào ô nhập chữ" để bong bóng vẫn ẩn
    const onFocusIn = (e: FocusEvent) => {
      typing = isTextEntry(e.target as Element);
      update();
    };
    const onFocusOut = () => {
      typing = false;
      update();
    };
    vv?.addEventListener('resize', onResize);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    update();
    return () => {
      vv?.removeEventListener('resize', onResize);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  useEffect(() => onAudioBusyChange(setAudioBusy), []);

  return bubbleVisibility({ pathname, scrollMode, keyboardOpen, audioBusy });
}
