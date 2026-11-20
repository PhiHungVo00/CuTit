/** Bản đồ route → tab / màn tập trung (spec 5.2 + 8.8). Thuần chuỗi, không import React để test và nạp rẻ. */
export type TabId = 'hoc' | 'luyen-tap' | 'ban-be' | 'ho-so';
export const TAB_IDS: readonly TabId[] = ['hoc', 'luyen-tap', 'ban-be', 'ho-so'];
export const TAB_HOME: Record<TabId, string> = { hoc: '/', 'luyen-tap': '/luyen-tap-chung', 'ban-be': '/ban-be', 'ho-so': '/ho-so' };

/** Đường cũ → đường mới (link, lịch sử, PWA đã cài không được gãy) */
export const LEGACY_REDIRECTS: Record<string, string> = {
  '/tuy-chinh': '/cai-dat',
  '/kham-pha': '/luyen-tap-chung'
};

const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
const first = (p: string) => '/' + (norm(p).split('/')[1] ?? '');

const TAB_BY_SEGMENT: Record<string, TabId> = {
  '/': 'hoc',
  '/bai-hoc': 'hoc',
  '/kiem-tra': 'hoc',
  '/xung-ho': 'hoc',
  '/van-hoa': 'hoc',
  '/phuong-ngu': 'hoc',
  '/on-tap': 'luyen-tap',
  '/phat-am': 'luyen-tap',
  '/phong-thanh': 'luyen-tap',
  '/luyen-tap': 'luyen-tap',
  '/luyen-tap-chung': 'luyen-tap',
  '/ghep-cau': 'luyen-tap',
  '/ban-be': 'ban-be',
  '/ho-so': 'ho-so',
  '/cai-dat': 'ho-so',
  '/bat-dau': 'ho-so',
  '/quyen-rieng-tu': 'ho-so'
};

export function tabOf(pathname: string): TabId | null {
  return TAB_BY_SEGMENT[first(pathname)] ?? null;
}

/** Màn tập trung: ẩn thanh tab và bong bóng (bài học, kiểm tra, màn Cu Tít — đã có nút quay lại) */
const FOCUS = new Set(['/bai-hoc', '/kiem-tra', '/hoi-thoai', '/nhap-vai', '/goi-thoai', '/camera']);
export const isFocusRoute = (pathname: string): boolean => FOCUS.has(first(pathname));

/** Các màn của Cu Tít (bong bóng mở, thanh đổi chế độ) */
export const CUTIT_MODES = ['/hoi-thoai', '/nhap-vai', '/goi-thoai', '/camera'] as const;
export const isCuTitRoute = (pathname: string): boolean => (CUTIT_MODES as readonly string[]).includes(first(pathname));
