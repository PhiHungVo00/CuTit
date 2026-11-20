import { getAudioSettings } from './config.js';
import { isRecording } from './focus.js';

export type SfxName =
  | 'cham-nut'
  | 'dung'
  | 'sai'
  | 'hoan-thanh'
  | 'chuoi-ngay'
  | 'mo-bong-bong'
  | 'cutit-noi'
  | 'thong-bao'
  | 'chuyen-tab';

export const AUDIO_BASE = '/audio';

/**
 * Âm hiệu ứng phát bằng phần tử <audio> (KHÔNG dùng AudioContext): `new AudioContext()` lần đầu chặn luồng
 * chính ~220 ms trên máy yếu (đo CPU chậm 4×) ngay ở lần chạm đầu, còn `new Audio()` chỉ ~1 ms. Âm ngắn,
 * không cần trộn phức tạp; lần phát đầu có thể trễ nhẹ tới khi tệp tải xong.
 */
const elements = new Map<SfxName, HTMLAudioElement>();

function element(name: SfxName): HTMLAudioElement | null {
  const Ctor = (globalThis as { Audio?: typeof Audio }).Audio;
  if (!Ctor) return null;
  let el = elements.get(name);
  if (!el) {
    el = new Ctor(`${AUDIO_BASE}/sfx/${name}.ogg`);
    el.preload = 'auto';
    // trình duyệt cũ không có Opus ⇒ mp3 dự phòng
    el.addEventListener?.('error', () => {
      if (el && el.src.endsWith('.ogg')) el.src = `${AUDIO_BASE}/sfx/${name}.mp3`;
    });
    elements.set(name, el);
  }
  return el;
}

/** Phát một âm hiệu ứng ngắn. No-op khi tắt hiệu ứng hoặc đang thu âm. Không chờ tải/giải mã trong handler cử chỉ. */
export function playSfx(name: SfxName): void {
  if (!getAudioSettings().sfx || isRecording()) return;
  const el = element(name);
  if (!el) return;
  const go = () => {
    // kiểm lại lúc phát: trong lúc tải có thể đã bắt đầu thu âm hoặc tắt hiệu ứng
    if (!getAudioSettings().sfx || isRecording()) return;
    try {
      el.currentTime = 0;
    } catch {
      /* chưa có metadata */
    }
    void Promise.resolve(el.play()).catch(() => undefined); // chưa có cử chỉ ⇒ im lặng
  };
  if (el.readyState >= 2) go();
  else el.addEventListener?.('canplay', go, { once: true });
}

/** Giữ để tương thích: âm hiệu ứng dùng <audio> nên không cần mở khóa AudioContext. */
export function unlockSfx(): void {}

export function haptic(kind: 'nhe' | 'thanh-cong' | 'loi'): void {
  if (!getAudioSettings().haptics) return;
  const nav = (globalThis as { navigator?: { vibrate?: (p: number | number[]) => boolean } }).navigator;
  if (typeof nav?.vibrate !== 'function') return;
  nav.vibrate(kind === 'nhe' ? 10 : kind === 'thanh-cong' ? [10, 40, 10] : 30);
}
