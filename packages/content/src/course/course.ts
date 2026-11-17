/**
 * Mô hình khóa học (GĐ1): Course → Unit → Lesson → ExerciseRef.
 * ExerciseRef chỉ THAM CHIẾU id nội dung có sẵn (câu ghép, cặp xưng hô, từ phương ngữ, thanh điệu)
 * hoặc từ/câu mới của khóa học (words.json `w*`, sentences.json `cs*`). Bài tập cụ thể (lựa chọn, nhiễu)
 * do packages/exercises dựng từ ref. Nội dung mới là bản nháp: reviewed=false tới khi người bản ngữ duyệt.
 */
import unit1 from '../data/course/unit-1.json' with { type: 'json' };
import unit2 from '../data/course/unit-2.json' with { type: 'json' };
import unit3 from '../data/course/unit-3.json' with { type: 'json' };
import wordData from '../data/course/words.json' with { type: 'json' };
import courseSentenceData from '../data/course/sentences.json' with { type: 'json' };
import { SENTENCE_ITEMS, type SentenceBank } from '../sentences/sentences.js';
import type { ToneId } from '../pitch/PitchReferenceFlyweight.js';

export type ExerciseRef =
  /** trắc nghiệm nghĩa: vi-en = thấy từ Việt chọn nghĩa; en-vi = thấy nghĩa chọn từ Việt */
  | { type: 'meaning'; word: string; dir: 'vi-en' | 'en-vi' }
  /** nghe chọn: nghe từ, chọn chữ viết đúng */
  | { type: 'listen'; word: string }
  /** điền từ vào chỗ trống của câu (s* hoặc cs*) */
  | { type: 'fill'; sentence: string; blank: number }
  /** ghép câu, chấm bằng A8 */
  | { type: 'build'; sentence: string }
  /** luyện thanh A1/A2: đọc một từ mang thanh `tone` */
  | { type: 'tone'; tone: ToneId; word: string }
  /** chọn đại từ xưng hô (A6), cặp h* */
  | { type: 'pronoun'; pair: string }
  /** từ theo miền (A7), mục d* */
  | { type: 'dialect'; entry: string; region: 'central' | 'south' };

export interface CourseWord {
  id: string;
  vi: string;
  /** nghĩa tiếng Anh (lời giải nghĩa, không phải nội dung học) */
  en: string;
  /** ghi chú tiếng Việt, vd. từ miền khác */
  note?: string;
  reviewed: boolean;
}

export interface Lesson {
  id: string;
  title: string;
  titleEn: string;
  exercises: ExerciseRef[];
}

export interface Unit {
  id: string;
  level: 'A1';
  title: string;
  titleEn: string;
  icon: string;
  reviewed: boolean;
  lessons: Lesson[];
  /** bộ câu cố định của bài “kiểm tra để vượt unit” */
  testOut: ExerciseRef[];
}

export interface Course {
  id: string;
  units: Unit[];
}

export const COURSE: Course = { id: 'vi-a1', units: [unit1, unit2, unit3] as Unit[] };
export const COURSE_WORDS: readonly CourseWord[] = wordData as CourseWord[];
export const COURSE_SENTENCES: readonly SentenceBank[] = courseSentenceData as SentenceBank[];

const LESSONS = new Map(COURSE.units.flatMap((unit) => unit.lessons.map((lesson, index) => [lesson.id, { unit, lesson, index }] as const)));
const WORDS = new Map(COURSE_WORDS.map((w) => [w.id, w]));
const SENTENCES = new Map([...SENTENCE_ITEMS, ...COURSE_SENTENCES].map((s) => [s.id, s]));

export function findLesson(id: string): { unit: Unit; lesson: Lesson; index: number } | undefined {
  return LESSONS.get(id);
}

export function findWord(id: string): CourseWord | undefined {
  return WORDS.get(id);
}

/** Tìm trong cả kho 60 câu cũ (s*) lẫn câu mới của khóa học (cs*) */
export function findSentence(id: string): SentenceBank | undefined {
  return SENTENCES.get(id);
}

/** Mọi câu ghép (kho cũ + khóa học), dùng làm nguồn nhiễu cho bài điền từ */
export const ALL_SENTENCES: readonly SentenceBank[] = [...SENTENCE_ITEMS, ...COURSE_SENTENCES];
