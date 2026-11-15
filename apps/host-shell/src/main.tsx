import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// Font tự host (latin + vietnamese, 400/800; class 600/700 dùng 800): khai báo trong styles/fonts.css
// với unicode-range đúng và font-display: optional (không đổi font giữa chừng => không tính lại bố cục)
import './styles/fonts.css';
import './styles/app.css';

import { App } from './App';
import { SCREENS, prefetchScreen } from './routes';
import { isNativeApp } from './native/bootstrap';
import { applySwapFontsForNativeApp } from './styles/nativeFonts';
import { ThemeProvider } from './theme/ThemeContext';
import { configureGateway } from '@vietlearning/api-client';

// Một nơi duy nhất cấu hình Gateway cho mọi màn hình (URL nhúng lúc build, KHÔNG có secret)
configureGateway({ baseUrl: import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:4000', timeoutMs: 10_000 });

if (isNativeApp) applySwapFontsForNativeApp();

// Mở thẳng một màn hình (link, khôi phục tab, deep link): tải chunk của nó NGAY, song song với lúc React
// khởi tạo, thay vì đợi Router render rồi lazy() mới bắt đầu tải (giảm LCP của các route lazy)
const initialScreen = SCREENS.find((s) => s.path === window.location.pathname);
if (initialScreen) prefetchScreen(initialScreen);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);

// Đăng ký Service Worker sau khi trang tải xong để không tranh băng thông với lần hiển thị đầu.
// Trong app Capacitor không cần SW: mọi file đã nằm sẵn trong gói cài đặt.
if (import.meta.env.PROD && !isNativeApp && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
  });
}
