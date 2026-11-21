import { Navigate, Route } from 'react-router-dom';
import { LEGACY_REDIRECTS } from '../shell/navMap';

/** Đường cũ (/tuy-chinh, /kham-pha) chuyển sang đường mới: link và lịch sử cũ không trắng màn. */
export const legacyRoutes = Object.entries(LEGACY_REDIRECTS).map(([from, to]) => (
  <Route key={from} path={from} element={<Navigate to={to} replace />} />
));
