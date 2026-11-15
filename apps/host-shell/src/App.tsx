import { Suspense, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { bootstrapNative } from './native/bootstrap';
import { SCREENS, prefetchScreen } from './routes';
import { Home } from './screens/Home';
import { ScreenErrorBoundary } from './components/ScreenErrorBoundary';

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
      <span>Đang mở màn hình…</span>
    </div>
  );
}

export function App() {
  const online = useOnline();
  const { pathname } = useLocation();
  const navigate = useNavigate();

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
          Đang ngoại tuyến · Nội dung đã tải vẫn dùng được
        </div>
      )}

      <main className="shell-main">
        <ScreenErrorBoundary resetKey={pathname}>
          <Suspense fallback={<ScreenLoading />}>
            <Routes>
              <Route path="/" element={<Home />} />
              {SCREENS.map(({ path, Component }) => (
                <Route key={path} path={path} element={<Component />} />
              ))}
              <Route path="*" element={<Home />} />
            </Routes>
          </Suspense>
        </ScreenErrorBoundary>
      </main>

      <nav className="tabbar" aria-label="Điều hướng chính">
        <NavLink to="/" end>
          <span className="tab-icon" aria-hidden="true">
            🏠
          </span>
          <span>Trang chủ</span>
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
            <span>{s.shortLabel}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default App;
