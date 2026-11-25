/**
 * Vết điều hướng trong RAM (không lưu đĩa) cho màn Góp ý: màn trước + tối đa 5 đường dẫn gần nhất (spec §5.1).
 * Chỉ ghi `pathname` (đã cắt `?` và `#`) nên không lộ tham số truy vấn; màn Góp ý không tự ghi chính nó.
 */
const KEEP = 6;
let trail: string[] = [];

export function recordRoute(pathname: string): void {
  if (pathname.startsWith('/gop-y')) return;
  const path = (pathname.split(/[?#]/)[0] || '/').slice(0, 200);
  if (trail[trail.length - 1] === path) return;
  trail = [...trail, path].slice(-KEEP);
}

/** `route` = màn ngay trước khi vào Góp ý; `recentRoutes` = tối đa 5 đường dẫn gần nhất (kể cả `route`) */
export function feedbackRouteInfo(): { route: string; recentRoutes: string[] } {
  return { route: trail[trail.length - 1] ?? '/', recentRoutes: trail.slice(-5) };
}

/** Chỉ dùng trong test */
export function resetRouteTrail(): void {
  trail = [];
}
