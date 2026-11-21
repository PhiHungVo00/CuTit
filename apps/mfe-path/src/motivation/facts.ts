import { PitchReferenceFlyweight, type Course } from '@vietlearning/content';
import type { BadgeFacts } from '@vietlearning/state/progress';
import { defaultVisible, type LessonFilter } from '../path/visibility';

/** Dữ liệu khóa học mà luật huy hiệu cần (package state không phụ thuộc content) */
/** Bài tình huống bị ẩn không được đòi trong huy hiệu unit (nếu không huy hiệu không đạt được) */
export function badgeFacts(course: Course, visible: LessonFilter = defaultVisible): BadgeFacts {
  return {
    tones: PitchReferenceFlyweight.all().map((t) => t.id),
    units: course.units.map((u) => ({
      id: u.id,
      lessonIds: u.lessons.filter(visible).map((l) => l.id),
      roleplayIds: u.lessons.filter((l) => l.roleplay).map((l) => l.id)
    }))
  };
}
