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

let ctx: AudioContext | null = null;
const buffers = new Map<SfxName, Promise<AudioBuffer | null>>();

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Nạp lười lần đầu: thử .ogg (Opus) rồi .mp3 dự phòng cho trình duyệt cũ. */
function load(name: SfxName, c: AudioContext): Promise<AudioBuffer | null> {
  let p = buffers.get(name);
  if (!p) {
    p = (async () => {
      for (const ext of ['ogg', 'mp3']) {
        try {
          const res = await fetch(`${AUDIO_BASE}/sfx/${name}.${ext}`);
          if (!res.ok) continue;
          return await c.decodeAudioData(await res.arrayBuffer());
        } catch {
          /* thử định dạng kế tiếp */
        }
      }
      return null;
    })();
    buffers.set(name, p);
  }
  return p;
}

/** Phát một âm hiệu ứng ngắn. No-op khi tắt hiệu ứng, đang thu âm, hoặc chưa có cử chỉ người dùng. */
export function playSfx(name: SfxName): void {
  if (!getAudioSettings().sfx || isRecording()) return;
  const c = context();
  if (!c) return;
  if (c.state === 'suspended') {
    // chưa có cử chỉ: thử đánh thức, KHÔNG xếp hàng phát bù
    void c.resume().catch(() => undefined);
    return;
  }
  void load(name, c).then((buf) => {
    // kiểm lại lúc phát: trong lúc nạp có thể đã bắt đầu thu âm hoặc tắt hiệu ứng
    if (!buf || !getAudioSettings().sfx || isRecording()) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start();
  });
}

/** Mở khóa AudioContext ở cử chỉ đầu tiên. */
export function unlockSfx(): void {
  const c = context();
  if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
}

export function haptic(kind: 'nhe' | 'thanh-cong' | 'loi'): void {
  if (!getAudioSettings().haptics) return;
  const nav = (globalThis as { navigator?: { vibrate?: (p: number | number[]) => boolean } }).navigator;
  if (typeof nav?.vibrate !== 'function') return;
  nav.vibrate(kind === 'nhe' ? 10 : kind === 'thanh-cong' ? [10, 40, 10] : 30);
}
