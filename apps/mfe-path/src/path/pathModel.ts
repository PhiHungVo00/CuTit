/**
 * Mô hình hiển thị lộ trình (hàm thuần). Lộ trình là GỢI Ý, không khóa cứng (bài học từ phàn nàn về Duolingo 2022):
 * mọi bài đều mở; “Học tiếp” chỉ trỏ bài chưa xong đầu tiên; vượt unit (test-out) tính mọi bài của unit là xong.
 */
import type { Course, Lesson, ToneId, Unit } from '@vietlearning/content';

export type LessonStatus = 'done' | 'next' | 'open';
type Done = Record<string, unknown>;

const isDone = (unit: Unit, lessonId: string, done: Done, testedOut: Record<string, string>) => Boolean(done[lessonId]) || Boolean(testedOut[unit.id]);

export function nextLesson(course: Course, done: Done, testedOut: Record<string, string>): Lesson {
  for (const u of course.units) for (const l of u.lessons) if (!isDone(u, l.id, done, testedOut)) return l;
  const lastUnit = course.units[course.units.length - 1];
  return lastUnit.lessons[lastUnit.lessons.length - 1];
}

export function lessonStatuses(course: Course, done: Done, testedOut: Record<string, string>): Record<string, LessonStatus> {
  const next = nextLesson(course, done, testedOut).id;
  const out: Record<string, LessonStatus> = {};
  for (const u of course.units) for (const l of u.lessons) out[l.id] = isDone(u, l.id, done, testedOut) ? 'done' : l.id === next ? 'next' : 'open';
  return out;
}

export function unitProgress(unit: Unit, done: Done, testedOut: Record<string, string>): { done: number; total: number } {
  return { done: unit.lessons.filter((l) => isDone(unit, l.id, done, testedOut)).length, total: unit.lessons.length };
}

/** Thanh có điểm trung bình thấp nhất (cần ít nhất 1 lượt); chưa luyện thanh nào => null */
export function weakestTone(stats: Record<string, { n: number; sum: number }>): ToneId | null {
  let best: { id: string; avg: number } | null = null;
  for (const [id, s] of Object.entries(stats)) {
    if (!(s.n > 0)) continue;
    const avg = s.sum / s.n;
    if (!best || avg < best.avg) best = { id, avg };
  }
  return (best?.id as ToneId) ?? null;
}

/** Ngưỡng đạt của bài kiểm tra vượt unit */
export const TEST_OUT_PASS = 0.8;
