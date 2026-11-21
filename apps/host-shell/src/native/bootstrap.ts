import { getPlatform, isNativeApp } from './platform';

/**
 * Khởi tạo các hành vi native khi chạy trong app Capacitor.
 * Plugin và cả `@capacitor/core` đều import động (R10) => bản web/PWA không tải mã Capacitor ở gói đầu.
 */
export { isNativeApp };

/** Plugin nội bộ (android/.../SystemBarsPlugin.java): màu dải status/navigation bar theo giao diện */
interface SystemBarsPlugin {
  setTheme(opts: { dark: boolean; color?: string }): Promise<void>;
}

// Một promise dùng chung => các lần đổi giao diện liên tiếp vẫn gửi xuống native đúng thứ tự.
// Không resolve promise bằng proxy plugin (Promise sẽ dò `.then` trên proxy) => giữ proxy ở biến ngoài.
let systemBars: SystemBarsPlugin | undefined;
let systemBarsReady: Promise<void> | undefined;
const loadSystemBars = () =>
  (systemBarsReady ??= import('@capacitor/core').then(({ registerPlugin }) => {
    systemBars = registerPlugin<SystemBarsPlugin>('SystemBars');
  }));

/** Gọi khi giao diện đổi. */
export function applySystemBars(theme: 'dark' | 'light'): void {
  if (!isNativeApp || getPlatform() !== 'android') return;
  loadSystemBars()
    .then(() => systemBars!.setTheme({ dark: theme === 'dark', color: theme === 'dark' ? '#1F1710' : '#FBF3E4' }))
    .catch((err) => console.warn('[Native] Không đổi được màu thanh hệ thống', err));
}

export async function bootstrapNative(navigateBack: () => void): Promise<void> {
  if (!isNativeApp) return;

  document.documentElement.classList.add('native-app', `platform-${getPlatform()}`);

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
