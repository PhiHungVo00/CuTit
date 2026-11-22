import { createElement, lazy, type ComponentType } from 'react';

/**
 * Registry màn hình của Host Shell (ghép lúc build).
 *
 * Mỗi remote MFE vẫn là một package độc lập; Host chỉ import điểm vào công khai của nó qua
 * dynamic import(), nên Vite tách mỗi màn hình thành một chunk riêng và chỉ tải khi người dùng
 * mở màn hình đó. Không có remoteEntry.js tải lúc chạy => không waterfall, chạy được offline
 * và đóng gói Capacitor bình thường.
 */
type Loader = () => Promise<{ default: ComponentType }>;

/**
 * lazy() nhưng NHỚ module đã tải: lần render sau khi chunk đã về thì vẽ thẳng component, KHÔNG suspend.
 * Vì sao: React 18 “throttle” việc hiện nội dung Suspense — khung chờ đã vẽ thì nội dung thật bị giữ thêm
 * ~300–500 ms (chống nhấp nháy). Mở thẳng một màn (deep link) vì thế luôn trễ cố định ~325 ms (Lighthouse:
 * “element render delay”), đẩy LCP /xung-ho, /phat-am quá 2,5 s. main.tsx chờ chunk màn đầu rồi mới render
 * => không vẽ khung chờ => không bị throttle. Chuyển màn trong app vẫn như cũ (chưa tải thì suspend).
 */
export function lazyScreen(load: Loader): { load: Loader; Component: ComponentType } {
  let mod: { default: ComponentType } | undefined;
  const loadAndKeep: Loader = () => load().then((m) => (mod = m));
  const Lazy = lazy(loadAndKeep);
  const Component: ComponentType = () => (mod ? createElement(mod.default) : createElement(Lazy));
  return { load: loadAndKeep, Component };
}

/** Nhãn ngắn (thanh tab) theo khóa `<đường dẫn>.short` (src/i18n.ts); tên + mô tả ở src/exploreI18n.ts (màn Khám phá) */
export type ScreenId = 'xung-ho' | 'van-hoa' | 'hoi-thoai' | 'nhap-vai' | 'phat-am' | 'phuong-ngu' | 'luyen-tap' | 'ghep-cau' | 'camera' | 'ho-so' | 'bat-dau';

export const screenId = (r: ScreenRoute) => r.path.slice(1) as ScreenId;

export interface ScreenRoute {
  path: string;
  icon: string;
  owner: string;
  ready: boolean;
  load: Loader;
  Component: ComponentType;
}

function screen(def: Omit<ScreenRoute, 'Component'> & { path: `/${ScreenId}` }): ScreenRoute {
  return { ...def, ...lazyScreen(def.load) };
}

export const SCREENS: ScreenRoute[] = [
  screen({
    path: '/xung-ho',
    icon: '🏮',
    owner: 'mfe-knowledge',
    ready: true,
    load: () => import('./screens/HonorificScreen')
  }),
  screen({
    path: '/van-hoa',
    icon: '📜',
    owner: 'mfe-knowledge',
    ready: true,
    load: () => import('./screens/CultureRoute')
  }),
  screen({
    path: '/hoi-thoai',
    icon: '💬',
    owner: 'mfe-conversation',
    ready: true,
    load: () => import('./screens/ChatRoute')
  }),
  screen({
    path: '/nhap-vai',
    icon: '🎭',
    owner: 'mfe-conversation',
    ready: true,
    load: () => import('./screens/RoleplayRoute')
  }),
  screen({
    path: '/phat-am',
    icon: '🎙️',
    owner: 'mfe-speech-lab',
    ready: true,
    load: () => import('./screens/ToneLabRoute')
  }),
  screen({
    path: '/phuong-ngu',
    icon: '🗺️',
    owner: 'mfe-speech-lab',
    ready: true,
    load: () => import('./screens/DialectRoute')
  }),
  screen({
    path: '/luyen-tap',
    icon: '🧩',
    owner: 'mfe-practice',
    ready: true,
    load: () => import('./screens/DrillRoute')
  }),
  screen({
    path: '/ghep-cau',
    icon: '🧱',
    owner: 'mfe-practice',
    ready: true,
    load: () => import('./screens/SentenceRoute')
  }),
  screen({
    path: '/camera',
    icon: '📷',
    owner: 'mfe-vision',
    ready: true,
    load: () => import('./screens/CameraRoute')
  }),
  screen({
    path: '/ho-so',
    icon: '📈',
    owner: 'mfe-learner',
    ready: true,
    load: () => import('./screens/ProfileRoute')
  }),
  screen({
    path: '/bat-dau',
    icon: '🌱',
    owner: 'mfe-learner',
    ready: true,
    load: () => import('./screens/OnboardingRoute')
  })
];

/**
 * Màn hình của lộ trình (GĐ1, mfe-path) + Khám phá. Tách khỏi SCREENS vì có tham số đường dẫn và không
 * nằm trong danh sách 12 công cụ ở màn Khám phá.
 */
export interface PathRoute {
  path: string;
  load: Loader;
  Component: ComponentType;
}
const pathRoute = (path: string, load: Loader): PathRoute => ({ path, ...lazyScreen(load) });

export const REVIEW_ROUTE = pathRoute('/on-tap', () => import('./screens/ReviewRoute'));
/** Tab Luyện tập (lối vào ôn tập, phát âm, phòng thanh, luyện tập, ghép câu) — thay màn Khám phá */
export const PRACTICE_HUB_ROUTE = pathRoute('/luyen-tap-chung', () => import('./screens/PracticeHub'));
/** Chính sách quyền riêng tư (bản nháp) — M12 và các hộp đồng ý link tới bằng URL */
export const PRIVACY_ROUTE = pathRoute('/quyen-rieng-tu', () => import('./screens/PrivacyRoute'));
/** GĐ2: phòng tập thanh điệu (mfe-speech-lab), mở từ Khám phá — không tính vào 12 công cụ M1–M12 */
export const TONE_GYM_ROUTE = pathRoute('/phong-thanh', () => import('./screens/ToneGymRoute'));
export const PATH_ROUTES: PathRoute[] = [
  pathRoute('/bai-hoc/:lessonId', () => import('./screens/LessonRoute')),
  pathRoute('/kiem-tra/:unitId', () => import('./screens/TestOutRoute')),
  // GĐ3: gọi thoại với Bé Cu Tít (mfe-conversation) — không nằm trong 12 công cụ của Khám phá, vào từ màn Trò chuyện
  pathRoute('/goi-thoai', () => import('./screens/CallRoute')),
  REVIEW_ROUTE,
  PRACTICE_HUB_ROUTE,
  // Tiến độ chi tiết (M9: thống kê, ôn thẻ SM-2, 7 ngày, độ chính xác) — mở từ một dòng của tab Hồ sơ
  pathRoute('/tien-do', () => import('./screens/ProgressRoute')),
  pathRoute('/ban-be', () => import('./screens/FriendsRoute')),
  // Dự án 3: đăng nhập/đăng ký (mfe-learner); mở từ Hồ sơ, thẻ mời và Cài đặt › Tài khoản
  pathRoute('/dang-nhap', () => import('./screens/AuthRoute')),
  pathRoute('/cai-dat', () => import('./screens/SettingsRoute')),
  pathRoute('/cai-dat/:nhom', () => import('./screens/SettingsRoute')),
  PRIVACY_ROUTE,
  TONE_GYM_ROUTE
];

const prefetched = new Set<string>();

/** Tải trước chunk của một đường dẫn (thanh tab, lối vào chính); đường không có chunk riêng (vd. "/") bỏ qua. */
export function prefetchPath(path: string): void {
  const r = [...SCREENS, ...PATH_ROUTES].find((x) => x.path === path);
  if (r) prefetchScreen(r);
}

/** Tải (và nhớ) chunk của một đường dẫn; đường không có chunk riêng ⇒ undefined (chuyển cảnh không phải chờ). */
export function loaderOf(path: string): (() => Promise<unknown>) | undefined {
  return [...SCREENS, ...PATH_ROUTES].find((x) => x.path === path)?.load;
}

/** Tải trước chunk khi người dùng vừa chạm vào link (trước khi nhả tay ~100ms). */
export function prefetchScreen(route: Pick<ScreenRoute, 'path' | 'load'>): void {
  if (prefetched.has(route.path)) return;
  prefetched.add(route.path);
  route.load().catch(() => prefetched.delete(route.path));
}
