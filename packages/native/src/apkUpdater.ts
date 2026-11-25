import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Cầu nối tự tải và tự cài APK (dự án 8, Task 6). CHỈ có ở flavor Android `apk` (cài tay):
 * bản `play` không chứa plugin này nên `isApkUpdaterAvailable()` = false.
 * Native: apps/host-shell/android/app/src/apk/.../ApkUpdaterPlugin.java.
 * Import qua subpath `@vietlearning/native/apk-updater` (không re-export từ index.ts để không vào gói đầu).
 */
export type ApkInstallStatus = 'pending_user' | 'success' | 'cancelled' | 'failed';

export type ApkUpdaterErrorCode =
  | 'unavailable' // không phải bản apk / không native
  | 'invalid_args' // tham số sai (url không https, sha256 sai dạng, …)
  | 'host_not_allowed' // host ngoài danh sách cho phép (bản release)
  | 'storage' // hết dung lượng
  | 'network'
  | 'verify_failed' // SHA-256 / kích thước / tên gói / versionCode không khớp — tệp đã bị xóa
  | 'install_not_allowed' // chưa bật "Cho phép cài ứng dụng từ nguồn này"
  | 'not_downloaded'; // chưa có tệp của build này

export interface ApkUpdaterPlugin {
  download(o: { url: string; sha256: string; sizeBytes: number; build: number; allowMetered: boolean }): Promise<{ state: 'done' | 'queued' }>;
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  /** Kiểm SHA/kích thước/tên gói/versionCode trước; sai ⇒ reject code 'verify_failed'. */
  install(o: { build: number }): Promise<void>;
  cleanup(): Promise<void>;
  /** Thêm so với kế hoạch: hủy lượt tải đang chạy và xóa tệp dở. */
  cancel(): Promise<void>;
  addListener(e: 'downloadProgress', cb: (p: { percent: number }) => void): Promise<{ remove(): void }>;
  addListener(
    e: 'downloadState',
    cb: (s: { state: 'done' | 'failed'; code?: 'network' | 'storage' | 'verify_failed' }) => void,
  ): Promise<{ remove(): void }>;
  addListener(e: 'installStatus', cb: (s: { status: ApkInstallStatus; message?: string }) => void): Promise<{ remove(): void }>;
}

const PLUGIN_NAME = 'ApkUpdater';

export function isApkUpdaterAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(PLUGIN_NAME);
  } catch {
    return false;
  }
}

function unavailable(): Promise<never> {
  return Promise.reject(Object.assign(new Error('ApkUpdater không khả dụng (không phải bản APK cài tay)'), { code: 'unavailable' }));
}

/** Bọc plugin: khi không khả dụng thì không đụng native, chỉ reject 'unavailable'. */
export function createApkUpdater(raw: ApkUpdaterPlugin, isAvailable: () => boolean): ApkUpdaterPlugin {
  return {
    download: (o) => (isAvailable() ? raw.download(o) : unavailable()),
    canInstall: () => (isAvailable() ? raw.canInstall() : unavailable()),
    openInstallSettings: () => (isAvailable() ? raw.openInstallSettings() : unavailable()),
    install: (o) => (isAvailable() ? raw.install(o) : unavailable()),
    cleanup: () => (isAvailable() ? raw.cleanup() : unavailable()),
    cancel: () => (isAvailable() ? raw.cancel() : unavailable()),
    addListener: ((e: string, cb: never) =>
      isAvailable() ? (raw.addListener as (e: string, cb: never) => Promise<{ remove(): void }>)(e, cb) : Promise.resolve({ remove() {} })) as ApkUpdaterPlugin['addListener'],
  };
}

// Lưu ý dự án: không trả proxy của plugin qua Promise/hàm async — ApkUpdater là đối tượng thường bọc proxy.
export const ApkUpdater: ApkUpdaterPlugin = createApkUpdater(registerPlugin<ApkUpdaterPlugin>(PLUGIN_NAME), isApkUpdaterAvailable);
