import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Khởi tạo các hành vi native khi chạy trong app Capacitor.
 * Plugin được import động => bản web/PWA không phải tải mã plugin.
 */
export const isNativeApp = Capacitor.isNativePlatform();

/** Plugin nội bộ (android/.../SystemBarsPlugin.java): màu dải status/navigation bar theo giao diện */
interface SystemBarsPlugin {
  setTheme(opts: { dark: boolean; color?: string }): Promise<void>;
}
const SystemBars = registerPlugin<SystemBarsPlugin>('SystemBars');

/** Gọi khi giao diện đổi. Không trả proxy plugin khỏi hàm async (Promise sẽ dò `.then` trên proxy). */
export function applySystemBars(theme: 'dark' | 'light'): void {
  if (!isNativeApp || Capacitor.getPlatform() !== 'android') return;
  SystemBars.setTheme({ dark: theme === 'dark', color: theme === 'dark' ? '#16100B' : '#F6F3EC' }).catch((err) =>
    console.warn('[Native] Không đổi được màu thanh hệ thống', err)
  );
}

export async function bootstrapNative(navigateBack: () => void): Promise<void> {
  if (!isNativeApp) return;

  document.documentElement.classList.add('native-app', `platform-${Capacitor.getPlatform()}`);

  const [{ App }, { SplashScreen }] = await Promise.all([import('@capacitor/app'), import('@capacitor/splash-screen')]);

  // Nút Back cứng của Android: lùi trong lịch sử điều hướng; ở trang chủ thì thoát app.
  // Một màn hình (vd. drawer đang mở) có thể chặn bằng cách gọi event.preventDefault()
  // trên sự kiện 'app:back' trước khi Shell xử lý.
  App.addListener('backButton', ({ canGoBack }) => {
    const evt = new Event('app:back', { cancelable: true });
    if (!window.dispatchEvent(evt)) return;
    if (canGoBack && window.location.pathname !== '/') navigateBack();
    else App.exitApp();
  });

  // Màu thanh hệ thống do ThemeProvider gọi applySystemBars() theo giao diện hiện tại
  // React đã vẽ khung đầu tiên => ẩn splash
  await SplashScreen.hide({ fadeOutDuration: 150 });
}
