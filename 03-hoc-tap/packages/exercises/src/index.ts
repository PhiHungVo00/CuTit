/**
 * @vietlearning/exercises — các dạng bài thuần dùng chung (R6 trong kế hoạch tổng).
 * Mỗi dạng nhận `item` và trả `ExerciseResult`; MFE cũ (M2, M8) và lộ trình (mfe-path) cùng dùng,
 * nên không MFE nào phải import MFE khác (Nguyên tắc 7). Package được dùng ở dạng mã nguồn (giống MFE)
 * để Vite đóng gói Web Worker phân tích thanh điệu bằng `new URL(..., import.meta.url)`.
 */
export type { ExerciseItem, ExerciseResult, ChoiceVariant, ExerciseRef, StoryItemLine, StoryItemQuestion } from './types';
export { buildItem, refKey, parseRefKey, isResolvable, rng } from './build';
export { ExerciseView } from './ExerciseView';
export { answerFeedback, FeedbackMascot } from './feedback';
export { ChoiceExercise } from './choice/ChoiceExercise';
export { SentenceExercise } from './sentence/SentenceExercise';
export { useSentenceBuilder, shuffledIndices } from './sentence/useSentenceBuilder';
export { useToneRecorder, MAX_RECORD_MS, type RecorderStatus, type RecorderError } from './tone/useToneRecorder';
export { ContourChart } from './tone/ContourChart';
export { verdict } from './tone/verdict';
export { gradeAssess, SPEAK_PASS } from './speak/grade';
export { prefetchPack, playText, findAudioKey, stopPlayback } from './audio/coursePlayer';
export { DialogueRunner, type DialogueOutcome } from './dialogue/DialogueRunner';
export { runStep, scoreRun, type StepResult } from './dialogue/engine';
