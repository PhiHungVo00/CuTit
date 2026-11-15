import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// Font tự host: chỉ subset tiếng Việt + Latin, 2 độ đậm (400 và 800; class 600/700 tự dùng 800). Trình duyệt chỉ tải file woff2
// có unicode-range khớp ký tự trên trang, không chặn render (font-display: swap).
import '@fontsource/be-vietnam-pro/vietnamese-400.css';
import '@fontsource/be-vietnam-pro/latin-400.css';
import '@fontsource/be-vietnam-pro/vietnamese-800.css';
import '@fontsource/be-vietnam-pro/latin-800.css';
import './styles/app.css';

import { App } from './App';
import { isNativeApp } from './native/bootstrap';
import { ThemeProvider } from './theme/ThemeContext';

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
