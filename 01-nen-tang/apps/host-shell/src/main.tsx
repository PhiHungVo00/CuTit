import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// Font tự host (latin + vietnamese, 400/800; class 600/700 dùng 800): khai báo trong styles/fonts.css
// với unicode-range đúng và font-display: optional (không đổi font giữa chừng => không tính lại bố cục)
import './styles/fonts.css';
import './styles/app.css';

import { App } from './App';
import { PATH_ROUTES, SCREENS, prefetchScreen } from './routes';
import { isNativeApp } from './native/bootstrap';
import { applySwapFontsForNativeApp } from './styles/nativeFonts';
import { ThemeProvider } from './theme/ThemeContext';
import { configureGateway } from '@vietlearning/api-client/config';
import { startAudioOnFirstGesture } from './audio/lazyAudio';

// Tài khoản khách + đồng bộ: chunk lười, chỉ tải khi cần token hoặc sau lần vẽ đầu
const account = () => import('./account/bootstrap');

// Một nơi duy nhất cấu hình Gateway cho mọi màn hình (URL nhúng lúc build, KHÔNG có secret).
// Token: tài khoản khách tạo lười ở lần gọi Gateway đầu tiên; 401 => làm mới phiên rồi gửi lại một lần.
configureGateway({
  baseUrl: import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:4000',
  timeoutMs: 10_000,
  getToken: async () => (await account()).session().getToken(),
  onUnauthorized: async () => (await account()).session().handleUnauthorized()
});

// Âm thanh: cài đặt theo máy (deviceSettings) là nguồn duy nhất; Cài đặt chỉ ghi slice, host phản ứng.
// Trình duyệt/WebView chỉ cho phát sau cử chỉ ⇒ nạp lười + mở khóa ở lần chạm đầu tiên (nhạc nền bắt đầu từ đó).
startAudioOnFirstGesture();

if (isNativeApp) applySwapFontsForNativeApp();

// Mở thẳng một màn hình (link, khôi phục tab, deep link): tải chunk của nó NGAY, song song với lúc React
// khởi tạo, thay vì đợi Router render rồi lazy() mới bắt đầu tải (giảm LCP của các route lazy)
const initialScreen = [...SCREENS, ...PATH_ROUTES].find((s) => s.path === window.location.pathname);
if (initialScreen) prefetchScreen(initialScreen);

// Chờ chunk màn đầu (tối đa 1 s) rồi mới render: màn vẽ thẳng nội dung, không qua khung chờ Suspense — React 18
// giữ nội dung thêm ~300–500 ms sau khi khung chờ đã hiện (xem lazyScreen trong routes.tsx). Mạng quá chậm/lỗi
// => hết 1 s vẫn render như cũ (khung chờ + tải tiếp).
const firstScreen = initialScreen
  ? Promise.race([initialScreen.load().catch(() => undefined), new Promise((r) => setTimeout(r, 1000))])
  : Promise.resolve();

void firstScreen.then(() => ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
));

// Hàng đợi đồng bộ local-first: bắt đầu sau khi trang tải xong (không tranh lần vẽ đầu)
const startSyncLater = () => setTimeout(() => void account().then((m) => m.startAccountSync()));
if (document.readyState === 'complete') startSyncLater();
else window.addEventListener('load', startSyncLater, { once: true });

// Đăng ký Service Worker sau khi trang tải xong để không tranh băng thông với lần hiển thị đầu.
// Trong app Capacitor không cần SW: mọi file đã nằm sẵn trong gói cài đặt.
if (import.meta.env.PROD && !isNativeApp && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
  });
}
