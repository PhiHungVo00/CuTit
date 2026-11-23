import type { AssessResponse } from '@vietlearning/contracts/api';

/** Ngưỡng đạt của bài nói lại câu (điểm A3 0–100) */
export const SPEAK_PASS = 70;

/**
 * Đổi kết quả A3 thành kết quả bài: mock (chưa nối STT) => bỏ qua, không tính đúng/sai;
 * ≥ 70 => đúng. Chất lượng SM-2: ≥ 90 → 5, ≥ 80 → 4, ≥ 70 → 3, còn lại 1.
 */
export function gradeAssess(r: Pick<AssessResponse, 'score' | 'mock'>): { correct: boolean; skipped: boolean; quality: number; score: number } {
  if (r.mock) return { correct: false, skipped: true, quality: 0, score: 0 };
  const score = Math.round(r.score);
  const quality = score >= 90 ? 5 : score >= 80 ? 4 : score >= SPEAK_PASS ? 3 : 1;
  return { correct: score >= SPEAK_PASS, skipped: false, quality, score };
}
