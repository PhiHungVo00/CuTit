import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Registry màn hình của Host Shell (ghép lúc build).
 *
 * Mỗi remote MFE vẫn là một package độc lập; Host chỉ import điểm vào công khai của nó qua
 * dynamic import(), nên Vite tách mỗi màn hình thành một chunk riêng và chỉ tải khi người dùng
 * mở màn hình đó. Không có remoteEntry.js tải lúc chạy => không waterfall, chạy được offline
 * và đóng gói Capacitor bình thường.
 */
type Loader = () => Promise<{ default: ComponentType }>;

/** Nhãn ngắn (thanh tab) theo khóa `<đường dẫn>.short` (src/i18n.ts); tên + mô tả ở src/exploreI18n.ts (màn Khám phá) */
export type ScreenId = 'xung-ho' | 'van-hoa' | 'hoi-thoai' | 'nhap-vai' | 'phat-am' | 'phuong-ngu' | 'luyen-tap' | 'ghep-cau' | 'camera' | 'ho-so' | 'tuy-chinh' | 'bat-dau';

export const screenId = (r: ScreenRoute) => r.path.slice(1) as ScreenId;

export interface ScreenRoute {
  path: string;
  icon: string;
  owner: string;
  ready: boolean;
  inTabBar: boolean;
  load: Loader;
  Component: LazyExoticComponent<ComponentType>;
}

function screen(def: Omit<ScreenRoute, 'Component'> & { path: `/${ScreenId}` }): ScreenRoute {
  return { ...def, Component: lazy(def.load) };
}

export const SCREENS: ScreenRoute[] = [
  screen({
    path: '/xung-ho',
    icon: '🏮',
    owner: 'mfe-knowledge',
    ready: true,
    inTabBar: true,
    load: () => import('./screens/HonorificScreen')
  }),
  screen({
    path: '/van-hoa',
    icon: '📜',
    owner: 'mfe-knowledge',
    ready: true,
    inTabBar: false,
    load: () => import('./screens/CultureRoute')
  }),
  screen({
    path: '/hoi-thoai',
    icon: '💬',
    owner: 'mfe-conversation',
    ready: true,
    inTabBar: false,
    load: () => import('./screens/ChatRoute')
  }),
  screen({
    path: '/nhap-vai',
    icon: '🎭',
    owner: 'mfe-conversation',
    ready: true,
    inTabBar: false,
    load: () => import('./screens/RoleplayRoute')
  }),
  screen({
    path: '/phat-am',
    icon: '🎙️',
    owner: 'mfe-speech-lab',
    ready: true,
    inTabBar: true,
    load: () => import('./screens/ToneLabRoute')
  }),
  screen({
    path: '/phuong-ngu',
    icon: '🗺️',
    owner: 'mfe-speech-lab',
    ready: true,
    inTabBar: false,
    load: () => import('./screens/DialectRoute')
  }),
  screen({
    path: '/luyen-tap',
    icon: '🧩',
    owner: 'mfe-practice',
    ready: true,
    inTabBar: false,
    load: () => import('./screens/DrillRoute')
  }),
  screen({
    path: '/ghep-cau',
    icon: '🧱',
    owner: 'mfe-practice',
    ready: true,
    inTabBar: false,
    load: () => import('./screens/SentenceRoute')
  }),
  screen({
    path: '/camera',
    icon: '📷',
    owner: 'mfe-vision',
    ready: true,
    inTabBar: false,
    load: () => import('./screens/CameraRoute')
  }),
  screen({
    path: '/ho-so',
    icon: '📈',
    owner: 'mfe-learner',
    ready: true,
    inTabBar: false,
    load: () => import('./screens/ProgressRoute')
  }),
  screen({
    path: '/tuy-chinh',
    icon: '⚙️',
    owner: 'mfe-learner',
    ready: true,
    inTabBar: false,
    load: () => import('./screens/PreferencesRoute')
  }),
  screen({
    path: '/bat-dau',
    icon: '🌱',
    owner: 'mfe-learner',
    ready: true,
    inTabBar: false,
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
  Component: LazyExoticComponent<ComponentType>;
}
const pathRoute = (path: string, load: Loader): PathRoute => ({ path, load, Component: lazy(load) });

export const REVIEW_ROUTE = pathRoute('/on-tap', () => import('./screens/ReviewRoute'));
export const EXPLORE_ROUTE = pathRoute('/kham-pha', () => import('./screens/Explore'));
export const PATH_ROUTES: PathRoute[] = [
  pathRoute('/bai-hoc/:lessonId', () => import('./screens/LessonRoute')),
  pathRoute('/kiem-tra/:unitId', () => import('./screens/TestOutRoute')),
  REVIEW_ROUTE,
  EXPLORE_ROUTE
];

const prefetched = new Set<string>();

/** Tải trước chunk khi người dùng vừa chạm vào link (trước khi nhả tay ~100ms). */
export function prefetchScreen(route: Pick<ScreenRoute, 'path' | 'load'>): void {
  if (prefetched.has(route.path)) return;
  prefetched.add(route.path);
  route.load().catch(() => prefetched.delete(route.path));
}
