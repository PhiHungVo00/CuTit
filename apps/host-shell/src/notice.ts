/**
 * Thông báo một lần của Host (vd. tài khoản đã bị xóa ở máy khác). Lưu ở khóa riêng — KHÔNG nằm trong
 * các store bị xóa — để vẫn hiện sau khi dữ liệu đã xóa hoặc app tải lại.
 */
export type NoticeKey = 'accountDeleted' | 'signedOut' | 'mergedElsewhere';
const KEYS: readonly string[] = ['accountDeleted', 'signedOut', 'mergedElsewhere'];

const KEY = 'becutit.notice';
const EVENT = 'becutit:notice';

export function readNotice(): NoticeKey | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && KEYS.includes(v) ? (v as NoticeKey) : null;
  } catch {
    return null;
  }
}

export function showNotice(key: NoticeKey): void {
  try {
    localStorage.setItem(KEY, key);
  } catch {
    /* chế độ riêng tư: vẫn báo trong phiên này */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}

export function clearNotice(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* bỏ qua */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: null }));
}

export function onNotice(cb: (key: NoticeKey | null) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<NoticeKey | null>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
