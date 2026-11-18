import { PitchReferenceFlyweight, type Course } from '@vietlearning/content';
import type { BadgeFacts } from '@vietlearning/state/progress';

/** Dữ liệu khóa học mà luật huy hiệu cần (package state không phụ thuộc content) */
export function badgeFacts(course: Course): BadgeFacts {
  return {
    tones: PitchReferenceFlyweight.all().map((t) => t.id),
    units: course.units.map((u) => ({
      id: u.id,
      lessonIds: u.lessons.map((l) => l.id),
      roleplayIds: u.lessons.filter((l) => l.roleplay).map((l) => l.id)
    }))
  };
}
