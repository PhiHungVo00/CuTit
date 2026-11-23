/**
 * Nhận biết nền tảng KHÔNG cần nạp `@capacitor/core` (R10: core ~3 kB gzip nằm ở gói tải ban đầu chỉ để
 * hỏi "có phải app native không"). Logic chép đúng `getPlatform()` của @capacitor/core 7
 * (dist/index.js: `CapacitorCustomPlatform` → `androidBridge` → `webkit.messageHandlers.bridge` → 'web').
 * Trong app, native-bridge.js của Capacitor được tiêm vào WebView TRƯỚC mọi script của trang nên
 * `androidBridge` / `webkit.messageHandlers.bridge` đã có sẵn khi file này chạy.
 * Nâng cấp Capacitor: so lại với `getPlatformId` / `createCapacitor` của core (có test ở platform.test.ts).
 */
export type Platform = 'android' | 'ios' | 'web' | (string & {});

interface CapWindow {
  CapacitorCustomPlatform?: { name: string } | null;
  androidBridge?: unknown;
  webkit?: { messageHandlers?: { bridge?: unknown } };
}

export function detectPlatform(win: CapWindow | undefined = globalThis as CapWindow): Platform {
  const custom = win?.CapacitorCustomPlatform || null;
  if (custom !== null) return custom.name;
  if (win?.androidBridge) return 'android';
  if (win?.webkit?.messageHandlers?.bridge) return 'ios';
  return 'web';
}

/** Giống `Capacitor.getPlatform()` — đọc lại mỗi lần như core */
export const getPlatform = (): Platform => detectPlatform();

/** Giống `Capacitor.isNativePlatform()` lúc mở app */
export const isNativeApp = getPlatform() !== 'web';
