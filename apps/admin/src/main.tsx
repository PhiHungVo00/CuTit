import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App.js';
import { I18nProvider } from './i18n.js';
import { createSessionHandle } from './session.js';

// Giao diện sáng/tối theo hệ điều hành (không script nội tuyến: CSP chỉ cho script từ chính trang)
const mq = window.matchMedia('(prefers-color-scheme: light)');
const applyTheme = () => document.documentElement.setAttribute('data-theme', mq.matches ? 'light' : 'dark');
applyTheme();
mq.addEventListener('change', applyTheme);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App handle={createSessionHandle()} />
    </I18nProvider>
  </StrictMode>
);
