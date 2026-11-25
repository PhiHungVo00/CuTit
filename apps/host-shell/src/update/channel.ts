import type { AppChannel, AppVersionResponse } from '@vietlearning/contracts/api';
import { isNativeApp } from '../native/platform';
import type { UpdateErrorKey } from './updateI18n';

/**
 * Kênh phân phối lúc chạy (Global Constraints): không native ⇒ `web`; native có plugin `ApkUpdater` ⇒ `apk`;
 * còn lại ⇒ `play`. Đọc `window.Capacitor` do WebView tiêm sẵn nên KHÔNG kéo `@capacitor/core` vào gói đầu
 * (file này được gói đầu nạp để gửi header `x-app-channel`; chỉ phụ thuộc `native/platform.ts`).
 */
export function detectChannel(): AppChannel {
  if (!isNativeApp) return 'web';
  const cap = (globalThis as { Capacitor?: { isPluginAvailable?: (name: string) => boolean } }).Capacitor;
  return cap?.isPluginAvailable?.('ApkUpdater') ? 'apk' : 'play';
}

/**
 * Cách engine nhận trạng thái từ kênh (tiến độ tải, "tải xong chờ khởi động lại", lỗi hiển thị được).
 * Task 7 dùng cùng hook cho luồng APK.
 */
export interface UpdaterHooks {
  /** 0–100 khi đang tải; null = hết/hủy */
  setProgress(percent: number | null): void;
  /** Tải xong: `action` thực hiện bước cuối (khởi động lại/cài). null = bỏ thẻ */
  setReady(action: (() => Promise<void>) | null): void;
  setError(key: UpdateErrorKey | null): void;
}

export interface ChannelUpdater {
  softUpdate(r: AppVersionResponse, hooks?: UpdaterHooks): Promise<void>;
  forcedUpdate(r: AppVersionResponse, hooks?: UpdaterHooks): Promise<void>;
}

/** Nạp lười đúng kênh (plugin Play chỉ được import trong play.ts) */
export async function loadUpdater(channel: AppChannel): Promise<ChannelUpdater> {
  if (channel === 'play') return (await import('./play')).updater;
  if (channel === 'apk') return (await import('./apk')).updater;
  return (await import('./web')).updater;
}
