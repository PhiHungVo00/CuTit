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

export interface ScreenRoute {
  path: string;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
  owner: string;
  ready: boolean;
  inTabBar: boolean;
  load: Loader;
  Component: LazyExoticComponent<ComponentType>;
}

function screen(def: Omit<ScreenRoute, 'Component'>): ScreenRoute {
  return { ...def, Component: lazy(def.load) };
}

export const SCREENS: ScreenRoute[] = [
  screen({
    path: '/xung-ho',
    label: 'Ma trận xưng hô',
    shortLabel: 'Xưng hô',
    icon: '🏮',
    description: 'M3 · Đại từ xưng hô theo tuổi, quan hệ và bối cảnh (A6)',
    owner: 'mfe-knowledge',
    ready: true,
    inTabBar: true,
    load: () => import('./screens/HonorificScreen')
  }),
  screen({
    path: '/van-hoa',
    label: 'Cẩm nang văn hóa',
    shortLabel: 'Văn hóa',
    icon: '📜',
    description: 'M10 · 20 thẻ phong tục, kiêng kỵ; hỏi đáp cùng Bé Cu Tít',
    owner: 'mfe-knowledge',
    ready: true,
    inTabBar: false,
    load: () => import('./screens/CultureRoute')
  }),
  screen({
    path: '/hoi-thoai',
    label: 'Trò chuyện cùng Cu Tít',
    shortLabel: 'Hội thoại',
    icon: '💬',
    description: 'M1 · Chat giọng nói, M7 · Nhập vai tình huống',
    owner: 'mfe-conversation',
    ready: false,
    inTabBar: true,
    load: () => import('@vietlearning/mfe-conversation')
  }),
  screen({
    path: '/phat-am',
    label: 'Phòng luyện phát âm',
    shortLabel: 'Phát âm',
    icon: '🎙️',
    description: 'M2 · Luyện 6 thanh điệu với biểu đồ cao độ (A1, A2)',
    owner: 'mfe-speech-lab',
    ready: true,
    inTabBar: true,
    load: () => import('./screens/ToneLabRoute')
  }),
  screen({
    path: '/luyen-tap',
    label: 'Luyện tập',
    shortLabel: 'Luyện tập',
    icon: '🧩',
    description: 'M5 · Bài tập thích ứng, M8 · Ghép câu',
    owner: 'mfe-practice',
    ready: false,
    inTabBar: true,
    load: () => import('@vietlearning/mfe-practice')
  }),
  screen({
    path: '/camera',
    label: 'Camera từ vựng',
    shortLabel: 'Camera',
    icon: '📷',
    description: 'M4 · Chụp ảnh và dán nhãn từ vựng',
    owner: 'mfe-vision',
    ready: false,
    inTabBar: false,
    load: () => import('@vietlearning/mfe-vision')
  }),
  screen({
    path: '/ho-so',
    label: 'Tiến độ học',
    shortLabel: 'Hồ sơ',
    icon: '📈',
    description: 'M9 · Thống kê, M11 · Xếp lớp, M12 · Tùy chỉnh',
    owner: 'mfe-learner',
    ready: false,
    inTabBar: false,
    load: () => import('@vietlearning/mfe-learner')
  })
];

const prefetched = new Set<string>();

/** Tải trước chunk khi người dùng vừa chạm vào link (trước khi nhả tay ~100ms). */
export function prefetchScreen(route: ScreenRoute): void {
  if (prefetched.has(route.path)) return;
  prefetched.add(route.path);
  route.load().catch(() => prefetched.delete(route.path));
}
