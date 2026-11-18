import type { Course, Lesson } from '@vietlearning/content';

/**
 * Đường dẫn mở một bài của lộ trình. Bài nhập vai (GĐ3) nằm ở mfe-conversation: chỉ liên kết qua URL
 * (Nguyên tắc 7 — không import chéo MFE). `bai` để màn nhập vai ghi tiến độ bài khi xong.
 */
export function lessonHref(lesson: Lesson): string {
  if (lesson.roleplay) return `/nhap-vai?kb=${encodeURIComponent(lesson.roleplay)}&bai=${encodeURIComponent(lesson.id)}`;
  return `/bai-hoc/${lesson.id}`;
}

/** Bài kế tiếp theo thứ tự khóa học (để bỏ qua bài nhập vai khi offline/hết lượt AI); bài cuối khóa => null */
export function lessonAfter(course: Course, lessonId: string): Lesson | null {
  const all = course.units.flatMap((u) => u.lessons);
  const i = all.findIndex((l) => l.id === lessonId);
  return i >= 0 && i < all.length - 1 ? all[i + 1] : null;
}
