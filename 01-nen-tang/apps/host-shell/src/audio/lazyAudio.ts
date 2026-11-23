import { deviceSettingsStore } from '@vietlearning/state';
import type { SfxName } from '@vietlearning/shared/audio';
import { bindMusicSettings } from '../theme/deviceBindings';

/**
 * Bộ điều phối âm thanh (nhạc nền, âm hiệu ứng) nạp LƯỜI: chỉ cần từ lần chạm đầu tiên (trình duyệt/WebView
 * không cho phát trước đó), nên không nằm trong gói đầu (ngân sách 67,5 kB). Cấu hình đúng một lần.
 */
let ready: Promise<typeof import('@vietlearning/shared/audio')> | undefined;

export function loadAudio(): Promise<typeof import('@vietlearning/shared/audio')> {
  return (ready ??= (async () => {
    const [audio, native] = await Promise.all([import('@vietlearning/shared/audio'), import('@vietlearning/native').catch(() => undefined)]);
    // env = cầu nối native (chế độ im lặng, audio focus); web thì thiếu ⇒ coi như không im lặng
    audio.configureAudio(() => deviceSettingsStore.getState(), native?.getAudioEnv());
    bindMusicSettings(deviceSettingsStore, audio.music);
    return audio;
  })());
}

/** Gọi ở cử chỉ đầu tiên: nạp điều phối, cấu hình, mở khóa loa (nhạc nền bắt đầu từ đó nếu bật). */
export function startAudioOnFirstGesture(): void {
  window.addEventListener('pointerdown', () => void loadAudio().then((a) => a.unlockAudio()).catch(() => undefined), { once: true });
}

export function playSfx(name: SfxName): void {
  void loadAudio().then((a) => a.playSfx(name)).catch(() => undefined);
}
