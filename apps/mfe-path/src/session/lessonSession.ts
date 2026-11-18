/**
 * Phiên bài học (hàm thuần, kiểu reducer): hàng đợi câu, câu sai quay lại cuối phiên, tổng kết.
 * Không có tim/năng lượng: sai không bị chặn, chỉ được làm lại (tối đa MAX_RETRIES lần mỗi câu để phiên luôn kết thúc).
 * Độ chính xác (và XP) tính theo lần làm ĐẦU TIÊN của mỗi câu; câu bỏ qua (không nghe/nói được) không tính.
 */
import type { ExerciseRef } from '@vietlearning/content';
import { refKey } from '@vietlearning/exercises';

export const MAX_RETRIES = 2;

export interface QueueEntry {
  ref: ExerciseRef;
  key: string;
  /** vị trí câu trong bài gốc (phân biệt ref trùng) */
  slot: number;
  /** lần làm thứ mấy (1 = lần đầu) */
  attempt: number;
}

export interface SessionState {
  queue: QueueEntry[];
  pos: number;
  /** slot => đúng ngay lần đầu? */
  firstTry: Record<number, boolean>;
  skipped: number[];
  done: boolean;
  /** số lần tối đa một câu sai được quay lại (bài kiểm tra vượt unit: 0) */
  maxRetries: number;
}

export function startSession(refs: readonly ExerciseRef[], maxRetries = MAX_RETRIES): SessionState {
  const queue = refs.map((ref, slot) => ({ ref, key: refKey(ref), slot, attempt: 1 }));
  return { queue, pos: 0, firstTry: {}, skipped: [], done: queue.length === 0, maxRetries };
}

export function current(s: SessionState): QueueEntry | undefined {
  return s.done ? undefined : s.queue[s.pos];
}

export function answer(s: SessionState, r: { key: string; correct: boolean; skipped: boolean }): SessionState {
  const cur = current(s);
  if (!cur || cur.key !== r.key) return s;
  const firstTry = { ...s.firstTry };
  const skipped = [...s.skipped];
  const queue = [...s.queue];
  if (r.skipped) {
    if (cur.attempt === 1) skipped.push(cur.slot);
  } else {
    if (cur.attempt === 1) firstTry[cur.slot] = r.correct;
    if (!r.correct && cur.attempt <= s.maxRetries) queue.push({ ...cur, attempt: cur.attempt + 1 });
  }
  const pos = s.pos + 1;
  return { ...s, queue, pos, firstTry, skipped, done: pos >= queue.length };
}

export function summarize(s: SessionState): { total: number; firstTryCorrect: number; accuracy: number; mistakes: string[]; skipped: number } {
  const slots = Object.keys(s.firstTry).map(Number);
  const firstTryCorrect = slots.filter((k) => s.firstTry[k]).length;
  const mistakes = [...new Set(s.queue.filter((q) => s.firstTry[q.slot] === false).map((q) => q.key))];
  return { total: slots.length, firstTryCorrect, accuracy: slots.length ? firstTryCorrect / slots.length : 0, mistakes, skipped: s.skipped.length };
}
