import { Capacitor } from '@capacitor/core';

/**
 * Khởi tạo các hành vi native khi chạy trong app Capacitor.
 * Plugin được import động => bản web/PWA không phải tải mã plugin.
 */
export const isNativeApp = Capacitor.isNativePlatform();

export async function bootstrapNative(navigateBack: () => void): Promise<void> {
  if (!isNativeApp) return;

  document.documentElement.classList.add('native-app', `platform-${Capacitor.getPlatform()}`);

  const [{ App }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen')
  ]);

  // Nút Back cứng của Android: lùi trong lịch sử điều hướng; ở trang chủ thì thoát app.
  // Một màn hình (vd. drawer đang mở) có thể chặn bằng cách gọi event.preventDefault()
  // trên sự kiện 'app:back' trước khi Shell xử lý.
  App.addListener('backButton', ({ canGoBack }) => {
    const evt = new Event('app:back', { cancelable: true });
    if (!window.dispatchEvent(evt)) return;
    if (canGoBack && window.location.pathname !== '/') navigateBack();
    else App.exitApp();
  });

  try {
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    /* iOS không hỗ trợ một số tùy chọn: bỏ qua */
  }

  // React đã vẽ khung đầu tiên => ẩn splash
  await SplashScreen.hide({ fadeOutDuration: 150 });
}
