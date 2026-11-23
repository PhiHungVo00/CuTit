import type { AudioSettings } from './types.js';

/** Môi trường thiết bị do host-shell cấp (cầu nối native, Task 14). Thiếu ⇒ coi như không im lặng, không mất focus. */
export interface AudioEnv {
  /** true khi máy đang ở chế độ im lặng/rung ⇒ không bắt đầu nhạc */
  isSilent?: () => Promise<boolean>;
  /** Báo khi app khác giành audio focus ⇒ nhạc dừng tới lần unlockAudio() kế tiếp. Trả hàm hủy đăng ký. */
  onFocusLost?: (cb: () => void) => () => void;
}

/** Trước khi cấu hình: tắt hết (an toàn, không phát gì). */
const OFF: AudioSettings = { sfx: false, haptics: false, music: false, musicTrack: 'rotate', musicVolume: 0 };

let getter: () => AudioSettings = () => OFF;
let env: AudioEnv = {};
const configListeners = new Set<() => void>();

export function configureAudio(get: () => AudioSettings, e: AudioEnv = {}): void {
  getter = get;
  env = e;
  for (const cb of [...configListeners]) cb();
}

export const getAudioSettings = (): AudioSettings => getter();
export const getAudioEnv = (): AudioEnv => env;
/** Nội bộ: music.ts đăng ký lại onFocusLost mỗi lần cấu hình lại. */
export function onAudioConfigured(cb: () => void): void {
  configListeners.add(cb);
}
