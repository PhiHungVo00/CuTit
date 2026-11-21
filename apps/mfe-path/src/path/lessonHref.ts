import type { Course, Lesson } from '@vietlearning/content';
import { defaultVisible, type LessonFilter } from './visibility';

/** Đường dẫn mở một bài của lộ trình. Tình huống cuối unit (kịch bản rẽ nhánh, không AI) cũng mở ở /bai-hoc. */
export function lessonHref(lesson: Lesson): string {
  return `/bai-hoc/${lesson.id}`;
}

/** Bài hiện kế tiếp theo thứ tự khóa học; bài cuối khóa => null */
export function lessonAfter(course: Course, lessonId: string, visible: LessonFilter = defaultVisible): Lesson | null {
  const all = course.units.flatMap((u) => u.lessons).filter(visible);
  const i = all.findIndex((l) => l.id === lessonId);
  return i >= 0 && i < all.length - 1 ? all[i + 1] : null;
}
