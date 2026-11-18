import type { KeyValue } from '@vietlearning/api-client';

/**
 * Kho phiên đăng nhập trên app native: Capacitor Preferences (SharedPreferences / UserDefaults) —
 * không bị hệ điều hành dọn như bộ nhớ WebView. Plugin import động => bản web không tải mã này.
 * Web/PWA dùng localStorage (mặc định của api-client).
 */
const plugin = () => import('@capacitor/preferences').then((m) => m.Preferences);

export const preferencesStore: KeyValue = {
  get: async (key) => (await (await plugin()).get({ key })).value ?? null,
  set: async (key, value) => (await plugin()).set({ key, value }),
  remove: async (key) => (await plugin()).remove({ key })
};
