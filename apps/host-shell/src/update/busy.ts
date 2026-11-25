/**
 * "Đang bận" theo route (spec 5.5): màn bài học/bài tập — không hiện màn chặn, không tải lại giữa chừng.
 * Thuần chuỗi (cùng kiểu navMap.ts) để test và nạp rẻ. Cộng với `isAudioBusy()` (thu âm/nói/gọi) ở scheduler.
 */
export const BUSY_ROUTES: readonly string[] = [
  '/bai-hoc', // phiên bài học lộ trình
  '/kiem-tra', // kiểm tra vượt unit
  '/on-tap', // ôn tập SM-2
  '/luyen-tap', // Adaptive Drills (không phải /luyen-tap-chung: đó là màn lối vào)
  '/ghep-cau', // Sentence Builder
  '/nhap-vai', // Roleplay
  '/phong-thanh', // phòng tập thanh điệu
  '/goi-thoai' // gọi thoại
];

const firstSegment = (path: string): string => '/' + (path.split('?')[0].split('/')[1] ?? '');

export function isBusy(path: string): boolean {
  return BUSY_ROUTES.includes(firstSegment(path));
}
