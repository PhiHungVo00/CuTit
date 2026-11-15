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
    description: 'M1 · Trò chuyện, sửa lỗi theo mức bạn chọn (trả lời mẫu, chưa nối AI)',
    owner: 'mfe-conversation',
    ready: true,
    inTabBar: true,
    load: () => import('./screens/ChatRoute')
  }),
  screen({
    path: '/nhap-vai',
    label: 'Nhập vai tình huống',
    shortLabel: 'Nhập vai',
    icon: '🎭',
    description: 'M7 · Chợ, hỏi đường, quán phở, làm quen: nhiệm vụ + tổng kết lỗi',
    owner: 'mfe-conversation',
    ready: true,
    inTabBar: false,
    load: () => import('./screens/RoleplayRoute')
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
    path: '/phuong-ngu',
    label: 'Phương ngữ 3 miền',
    shortLabel: 'Phương ngữ',
    icon: '🗺️',
    description: 'M6 · Đối chiếu từ Bắc / Trung / Nam, nghe và lưu để ôn (A7)',
    owner: 'mfe-speech-lab',
    ready: true,
    inTabBar: false,
    load: () => import('./screens/DialectRoute')
  }),
  screen({
    path: '/luyen-tap',
    label: 'Luyện tập',
    shortLabel: 'Luyện tập',
    icon: '🧩',
    description: 'M5 · 8 bài/phiên, 5 dạng, ôn lại bài sai theo SM-2 (A4)',
    owner: 'mfe-practice',
    ready: true,
    inTabBar: true,
    load: () => import('./screens/DrillRoute')
  }),
  screen({
    path: '/ghep-cau',
    label: 'Ghép câu',
    shortLabel: 'Ghép câu',
    icon: '🧱',
    description: 'M8 · Xếp từ thành câu đúng trật tự, giải thích lỗi (A8)',
    owner: 'mfe-practice',
    ready: true,
    inTabBar: false,
    load: () => import('./screens/SentenceRoute')
  }),
  screen({
    path: '/camera',
    label: 'Camera từ vựng',
    shortLabel: 'Camera',
    icon: '📷',
    description: 'M4 · Chụp đồ vật, học tên tiếng Việt, lưu để ôn (nhãn mẫu, chưa nối AI)',
    owner: 'mfe-vision',
    ready: true,
    inTabBar: false,
    load: () => import('./screens/CameraRoute')
  }),
  screen({
    path: '/ho-so',
    label: 'Tiến độ học',
    shortLabel: 'Hồ sơ',
    icon: '📈',
    description: 'M9 · Chuỗi ngày, thời gian học, độ chính xác, ôn thẻ đến hạn (A4)',
    owner: 'mfe-learner',
    ready: true,
    inTabBar: false,
    load: () => import('./screens/ProgressRoute')
  }),
  screen({
    path: '/tuy-chinh',
    label: 'Tùy chỉnh',
    shortLabel: 'Tùy chỉnh',
    icon: '⚙️',
    description: 'M12 · Giọng đọc, tốc độ, phương ngữ, mức sửa lỗi, nhân vật',
    owner: 'mfe-learner',
    ready: true,
    inTabBar: false,
    load: () => import('./screens/PreferencesRoute')
  }),
  screen({
    path: '/bat-dau',
    label: 'Làm quen & xếp lớp',
    shortLabel: 'Bắt đầu',
    icon: '🌱',
    description: 'M11 · Mục tiêu, phương ngữ, bài xếp lớp thích ứng 8–12 câu (A5)',
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
