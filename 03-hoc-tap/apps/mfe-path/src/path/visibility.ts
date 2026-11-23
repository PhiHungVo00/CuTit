import { dialogueForUnit, findLesson, type Lesson } from '@vietlearning/content';

/** Khóa localStorage để xem tình huống nháp ở bản phát hành (e2e, ảnh chụp, người duyệt nội dung); không có UI bật */
export const DRAFT_DIALOGUES_KEY = 'becutit.draftDialogues';

/** Bản dev luôn thấy tình huống nháp (reviewed:false); bản phát hành chỉ khi bật khóa trên */
export function draftsEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return localStorage.getItem(DRAFT_DIALOGUES_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Bài có hiện trên lộ trình không. Bài tình huống cuối unit (có `roleplay`) chỉ hiện khi unit có kịch bản đã duyệt
 * (hoặc nháp khi `includeUnreviewed`); không thì bỏ hẳn bước này và KHÔNG khóa tiến độ unit (Review Focus 4).
 */
export function lessonVisible(lesson: Lesson, includeUnreviewed: boolean): boolean {
  if (!lesson.roleplay) return true;
  const unitId = findLesson(lesson.id)?.unit.id;
  return Boolean(unitId && dialogueForUnit(unitId, { includeUnreviewed }));
}

export type LessonFilter = (lesson: Lesson) => boolean;

/** Bộ lọc mặc định theo môi trường chạy (đọc lúc gọi để đổi được khóa nháp mà không tải lại mô-đun) */
export const defaultVisible: LessonFilter = (l) => lessonVisible(l, draftsEnabled());
