/**
 * Bản Web — Bảng danh mục hoạt động (khai báo dùng chung duy nhất)
 * Nhãn thân thiện với người dùng (bé & phụ huynh); id giữ nguyên để khớp hợp đồng điều hướng.
 */
export type MainTabType = 'conversation' | 'practice' | 'vision' | 'speech' | 'profile';

export type SubScreenType =
  | 'overview'
  | 'm1-chat'
  | 'm7-roleplay'
  | 'm5-drill'
  | 'm8-sentence'
  | 'm3-honorific'
  | 'm10-culture'
  | 'm4-vision'
  | 'm2-pitch'
  | 'm6-dialect'
  | 'm9-analytics'
  | 'm11-onboarding'
  | 'm12-preferences';

export interface NavItem {
  id: SubScreenType;
  name: string;
  icon: string;
  desc: string;
}

export interface NavGroup {
  id: MainTabType;
  label: string;
  icon: string;
  /** Tailwind class hoàn chỉnh (literal, để CDN Tailwind JIT bắt được) */
  accentText: string;
  accentBg: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'conversation',
    label: 'Hội thoại',
    icon: '💬',
    accentText: 'text-[var(--coral)]',
    accentBg: 'border-l-[#e56c5e]',
    items: [
      {
        id: 'm1-chat',
        name: 'Hội Thoại cùng Cu Tít',
        icon: '💬',
        desc: 'Nhắn tin hoặc nói chuyện — Cu Tít trả lời ngay'
      },
      {
        id: 'm7-roleplay',
        name: 'Nhập Vai',
        icon: '🎭',
        desc: 'Giao tiếp trong chợ, quán phở, taxi và ngày Tết'
      }
    ]
  },
  {
    id: 'practice',
    label: 'Luyện tập',
    icon: '🎋',
    accentText: 'text-[var(--amber)]',
    accentBg: 'border-l-[#f8bc4b]',
    items: [
      {
        id: 'm8-sentence',
        name: 'Ghép Câu',
        icon: '🎋',
        desc: 'Kéo chữ xếp thành câu đúng trật tự'
      },
      {
        id: 'm5-drill',
        name: 'Luyện Tập',
        icon: '🎯',
        desc: 'Bài tập tự tăng độ khó theo trình độ của bé'
      },
      {
        id: 'm3-honorific',
        name: 'Xưng Hô',
        icon: '🏮',
        desc: '20 cặp xưng hô chuẩn mực cho từng quan hệ'
      },
      {
        id: 'm10-culture',
        name: 'Văn Hóa',
        icon: '📜',
        desc: 'Điều nên và không nên, đố vui cùng Cu Tít'
      }
    ]
  },
  {
    id: 'speech',
    label: 'Ngữ âm',
    icon: '🎙️',
    accentText: 'text-[var(--sky)]',
    accentBg: 'border-l-[#38bdf8]',
    items: [
      {
        id: 'm2-pitch',
        name: 'Thanh Điệu',
        icon: '🎵',
        desc: 'Tập 6 thanh điệu theo đồ thị trực quan'
      },
      {
        id: 'm6-dialect',
        name: 'Phương Ngữ',
        icon: '🚂',
        desc: 'Nghe và bắt chước giọng Bắc – Trung – Nam'
      }
    ]
  },
  {
    id: 'vision',
    label: 'Camera',
    icon: '📷',
    accentText: 'text-[var(--ok)]',
    accentBg: 'border-l-[#4ade80]',
    items: [
      {
        id: 'm4-vision',
        name: 'AR Camera',
        icon: '📷',
        desc: 'Dán nhãn đồ vật văn hóa khi bé chỉ camera vào'
      }
    ]
  },
  {
    id: 'profile',
    label: 'Hồ sơ',
    icon: '👤',
    accentText: 'text-[var(--sky-soft)]',
    accentBg: 'border-l-[#9acde9]',
    items: [
      {
        id: 'm9-analytics',
        name: 'Tiến Trình',
        icon: '📊',
        desc: 'Lộ trình học hằng ngày và kho từ vựng của bé'
      },
      {
        id: 'm11-onboarding',
        name: 'Xếp Lớp',
        icon: '🧭',
        desc: 'Vài câu hỏi nhẹ nhàng, đặt đúng cấp độ cho bé'
      },
      {
        id: 'm12-preferences',
        name: 'Cài Đặt Trợ Lý',
        icon: '⚙️',
        desc: 'Chọn giọng đọc và tính cách của trợ lý cho bé'
      }
    ]
  }
];

export const ALL_SCREEN_META: NavItem[] = NAV_GROUPS.flatMap(g => g.items);

export function groupOfScreen(screen: SubScreenType): NavGroup | undefined {
  return NAV_GROUPS.find(g => g.items.some(i => i.id === screen));
}
