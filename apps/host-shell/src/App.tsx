import { Suspense, lazy, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { bootstrapNative } from './native/bootstrap';
import { EXPLORE_ROUTE, PATH_ROUTES, REVIEW_ROUTE, SCREENS, prefetchScreen, screenId } from './routes';
import { t as tShell, useT } from './i18n';
import { useUiLanguage } from '@vietlearning/state';
import { Home } from './screens/Home';
import { ScreenErrorBoundary } from './components/ScreenErrorBoundary';
import { useStudyTimer } from './useStudyTimer';
import { onNotice, readNotice } from './notice';

const NoticeBanner = lazy(() => import('./NoticeBanner'));

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

  const tabs = SCREENS.filter((s) => s.inTabBar);

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

      <main className="shell-main">
        <ScreenErrorBoundary resetKey={pathname}>
          <Suspense fallback={<ScreenLoading />}>
            <Routes>
              <Route path="/" element={<Home />} />
              {[...SCREENS, ...PATH_ROUTES].map(({ path, Component }) => (
                <Route key={path} path={path} element={<Component />} />
              ))}
              <Route path="*" element={<Home />} />
            </Routes>
          </Suspense>
        </ScreenErrorBoundary>
      </main>

      <nav className="tabbar" aria-label={t('mainNav')}>
        <NavLink to="/" end>
          <span className="tab-icon" aria-hidden="true">
            🏠
          </span>
          <span>{t('learn')}</span>
        </NavLink>
        <NavLink to={REVIEW_ROUTE.path} onPointerDown={() => prefetchScreen(REVIEW_ROUTE)} onFocus={() => prefetchScreen(REVIEW_ROUTE)}>
          <span className="tab-icon" aria-hidden="true">
            🔁
          </span>
          <span>{t('review')}</span>
        </NavLink>
        {tabs.map((s) => (
          <NavLink
            key={s.path}
            to={s.path}
            onPointerDown={() => prefetchScreen(s)}
            onFocus={() => prefetchScreen(s)}
          >
            <span className="tab-icon" aria-hidden="true">
              {s.icon}
            </span>
            <span>{t(`${screenId(s)}.short`)}</span>
          </NavLink>
        ))}
        <NavLink to={EXPLORE_ROUTE.path} onPointerDown={() => prefetchScreen(EXPLORE_ROUTE)} onFocus={() => prefetchScreen(EXPLORE_ROUTE)}>
          <span className="tab-icon" aria-hidden="true">
            🧭
          </span>
          <span>{t('explore')}</span>
        </NavLink>
      </nav>
    </div>
  );
}

export default App;
