import type { KeyValue } from '@vietlearning/api-client';

/**
 * Kho phiên đăng nhập trên app native: Capacitor Preferences (SharedPreferences / UserDefaults) —
 * không bị hệ điều hành dọn như bộ nhớ WebView. Plugin import động => bản web không tải mã này.
 * Web/PWA dùng localStorage (mặc định của api-client).
 */
// KHÔNG trả thẳng proxy plugin qua Promise (`.then((m) => m.Preferences)`): Promise dò `.then` trên proxy, Capacitor
// coi đó là lời gọi native “Preferences.then()” => treo mãi. Trên Android, phiên đăng nhập và đồng bộ chưa từng chạy
// vì lỗi này (thấy trên emulator). Bọc trong object thường, giống 01-nen-tang/packages/native/src/reminders.ts.
const plugin = async () => ({ p: (await import('@capacitor/preferences')).Preferences });

export const preferencesStore: KeyValue = {
  get: async (key) => {
    const { p } = await plugin();
    return (await p.get({ key })).value ?? null;
  },
  set: async (key, value) => {
    const { p } = await plugin();
    await p.set({ key, value });
  },
  remove: async (key) => {
    const { p } = await plugin();
    await p.remove({ key });
  }
};
