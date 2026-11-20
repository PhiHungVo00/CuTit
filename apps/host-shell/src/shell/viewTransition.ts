import { flushSync } from 'react-dom';

/** Phần môi trường trình duyệt cần cho chuyển cảnh (tách ra để test không cần DOM). */
export interface TransitionEnv {
  reducedMotion(): boolean;
  /** `document.startViewTransition` nếu có (Chrome/WebView ≥ 111); thiếu ⇒ fade CSS dự phòng */
  startViewTransition: ((cb: () => void) => { finished: Promise<unknown> }) | undefined;
  /** Chạy đồng bộ để React vẽ xong màn mới ngay trong callback của transition */
  flush(fn: () => void): void;
  /** Fade dự phòng ~150 ms (lớp CSS tạm trên <html>) */
  fade(): void;
}

const FADE_MS = 150;

const browserEnv = (): TransitionEnv => {
  const root = document.documentElement;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<unknown> } };
  return {
    reducedMotion: () => root.dataset.reducedMotion === 'true' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
    startViewTransition: doc.startViewTransition?.bind(doc),
    flush: flushSync,
    fade() {
      root.classList.add('route-fade');
      window.setTimeout(() => root.classList.remove('route-fade'), FADE_MS + 30);
    }
  };
};

/**
 * Điều hướng có chuyển cảnh: tải chunk màn đích TRƯỚC (không chớp khung chờ giữa transition), rồi
 * View Transitions nếu có, không thì điều hướng + fade 150 ms. Giảm chuyển động ⇒ điều hướng thẳng.
 * Lỗi tải chunk (mạng) không chặn điều hướng: màn đích tự hiện khung chờ/lỗi của nó.
 */
export async function navigateWithTransition(
  navigate: (to: string) => void,
  to: string,
  load?: () => Promise<unknown>,
  env: TransitionEnv = browserEnv()
): Promise<void> {
  try {
    await load?.();
  } catch {
    /* vẫn điều hướng */
  }
  if (env.reducedMotion()) return navigate(to);
  if (env.startViewTransition) {
    env.startViewTransition(() => env.flush(() => navigate(to)));
    return;
  }
  navigate(to);
  env.fade();
}
