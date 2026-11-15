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

/** Nhãn/mô tả lấy từ từ điển Shell theo khóa `<đường dẫn>.label|short|desc` (src/i18n.ts) */
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
    inTabBar: true,
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
    inTabBar: true,
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

const prefetched = new Set<string>();

/** Tải trước chunk khi người dùng vừa chạm vào link (trước khi nhả tay ~100ms). */
export function prefetchScreen(route: ScreenRoute): void {
  if (prefetched.has(route.path)) return;
  prefetched.add(route.path);
  route.load().catch(() => prefetched.delete(route.path));
}
