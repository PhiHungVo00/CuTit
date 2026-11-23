import { Suspense, lazy, useEffect, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { bootstrapNative } from './native/bootstrap';
import { PATH_ROUTES, SCREENS } from './routes';
import { t as tShell, useT } from './i18n';
import { useUiLanguage } from '@vietlearning/state';
import { Home } from './screens/Home';
import { legacyRoutes } from './screens/LegacyRedirects';
import { TabBar } from './shell/TabBar';
import { isFocusRoute } from './shell/navMap';
import { ScreenErrorBoundary } from './components/ScreenErrorBoundary';
import { useStudyTimer } from './useStudyTimer';
import { onNotice, readNotice } from './notice';

const NoticeBanner = lazy(() => import('./NoticeBanner'));
// Bong bóng Cu Tít: chunk lười, gắn sau lần vẽ đầu để không tranh LCP/gói đầu
const CuTitBubble = lazy(() => import('./shell/CuTitBubble'));

function useAfterFirstPaint(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 1200);
    return () => window.clearTimeout(id);
  }, []);
  return ready;
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

function ScreenLoading() {
  return (
    <div className="screen-fallback" role="status">
      <div className="spinner" aria-hidden="true" />
      <span>{tShell('loading')}</span>
    </div>
  );
}

export function App() {
  const online = useOnline();
  const [notice, setNotice] = useState(readNotice);
  useEffect(() => onNotice(setNotice), []);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useStudyTimer();
  const t = useT();
  const lang = useUiLanguage();

  // Ngôn ngữ của trang theo giao diện (trình đọc màn hình đọc đúng giọng); nội dung học tự gắn lang="vi"
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t('appTitle');
  }, [lang, t]);

  useEffect(() => {
    bootstrapNative(() => navigate(-1)).catch((err) => console.error('[Native] Khởi tạo lỗi', err));
    // chỉ chạy một lần khi mở app
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mỗi lần đổi màn hình: cuộn về đầu (hành vi giống app native)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const focus = isFocusRoute(pathname);
  const bubbleReady = useAfterFirstPaint();

  return (
    <div className="shell">
      {!online && (
        <div className="offline-banner" role="status">
          {t('offline')}
        </div>
      )}

      {notice && (
        <Suspense fallback={null}>
          <NoticeBanner notice={notice} />
        </Suspense>
      )}

      <main className={focus ? 'shell-main focus' : 'shell-main'}>
        <ScreenErrorBoundary resetKey={pathname}>
          <Suspense fallback={<ScreenLoading />}>
            <Routes>
              <Route path="/" element={<Home />} />
              {[...SCREENS, ...PATH_ROUTES].map(({ path, Component }) => (
                <Route key={path} path={path} element={<Component />} />
              ))}
              {legacyRoutes}
              <Route path="*" element={<Home />} />
            </Routes>
          </Suspense>
        </ScreenErrorBoundary>
      </main>

      {!focus && <TabBar />}
      {bubbleReady && !focus && (
        <Suspense fallback={null}>
          <CuTitBubble />
        </Suspense>
      )}
    </div>
  );
}

export default App;
