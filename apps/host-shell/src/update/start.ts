import type { AppChannel } from '@vietlearning/contracts/api';
import { gatewayBaseUrl } from '@vietlearning/api-client/config';
import { isAudioBusy, onAudioBusyChange } from '@vietlearning/shared/audio/focus';
import { detectChannel, loadUpdater } from './channel';
import { createEngine } from './scheduler';

/**
 * Điểm vào mô-đun cập nhật (chunk lười, nạp ở sự kiện `load` — spec 5.5). Một engine duy nhất cho cả phiên.
 * - `startUpdates()`: bắt đầu lịch kiểm (mọi kênh) + đăng ký SW (web) + nghe `resume` (native).
 * - `forceRequired(info)`: api-client gặp 426 ⇒ vào trạng thái bắt buộc.
 * Giao diện (UpdateLayer.tsx) đọc `engine` qua subscribe/getView.
 */
const channel = detectChannel();
// Bản dev (Vite dev server) build = 0 ⇒ engine không kiểm, không gửi header (main.tsx)
const build = import.meta.env.DEV ? 0 : Number(import.meta.env.VITE_APP_BUILD) || 0;

export const engine = createEngine({
  build,
  channel,
  now: () => Date.now(),
  isOnline: () => navigator.onLine,
  baseUrl: gatewayBaseUrl,
  fetch: (input, init) => fetch(input, init),
  isAudioBusy,
  onAudioBusyChange,
  // Đồng bộ nằm ở chunk lười riêng: nạp khi cần, không kéo vào chunk này
  pauseSync: () => void import('@vietlearning/state/sync').then((m) => m.pauseSync('update-required')),
  resumeSync: () => void import('@vietlearning/state/sync').then((m) => m.resumeSync()),
  loadUpdater: () => loadUpdater(channel),
  getPath: () => window.location.pathname
});

let started = false;

export function startUpdates(): void {
  if (started) return;
  started = true;
  engine.start();
  if (channel === 'web') {
    if ('serviceWorker' in navigator) {
      void import('./web').then((w) =>
        w.registerWeb({ onNeedRefresh: () => engine.markWebRefresh(), onStaleTab: () => engine.markWebRefresh() })
      );
    }
  } else {
    // Native: quay lại từ nền ⇒ kiểm (plugin đã có trong dependencies, dùng sẵn ở native/bootstrap)
    void import('@capacitor/app').then(({ App }) => App.addListener('resume', () => void engine.check()));
  }
}

export function forceRequired(info: { minBuild: number; channel: AppChannel }): void {
  engine.forceRequired(info);
}
