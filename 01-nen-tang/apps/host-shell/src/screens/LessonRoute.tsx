import { LessonScreen } from '@vietlearning/mfe-path';

/** Phiên bài học /bai-hoc/:lessonId — bọc mỏng để chunk lazy có tên ổn định "LessonRoute" (ngân sách .size-limit.cjs). */
export default function LessonRoute() {
  return <LessonScreen />;
}
