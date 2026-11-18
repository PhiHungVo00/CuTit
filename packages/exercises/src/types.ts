import type { ExerciseRef, SentenceBank, ToneId } from '@vietlearning/content';

export type ChoiceVariant = 'meaning' | 'listen' | 'fill' | 'pronoun' | 'dialect';

/** Bài tập cụ thể đã dựng từ ExerciseRef (lựa chọn + nhiễu đã chọn theo seed) */
export type ExerciseItem =
  | {
      kind: 'choice';
      key: string;
      variant: ChoiceVariant;
      prompt: string;
      /** dòng nội dung tiếng Việt hiển thị dưới đề (vd. câu có chỗ trống) */
      display?: string;
      /** dòng phụ (vd. bản dịch) */
      hint?: string;
      /** chữ được đọc lên (dạng nghe chọn) */
      speak?: string;
      options: string[];
      answer: string;
      explanation: string;
    }
  | { kind: 'build'; key: string; prompt: string; sentence: SentenceBank }
  | { kind: 'tone'; key: string; prompt: string; tone: ToneId; word: string }
  /** nói lại câu (A3): `text` là câu chuẩn cần đọc (đã đổi theo miền) */
  | { kind: 'speak'; key: string; prompt: string; text: string; translation: string };

/** Kết quả một bài, mọi dạng bài trả cùng hình dạng */
export interface ExerciseResult {
  key: string;
  correct: boolean;
  /** người học bấm “không nghe/nói được lúc này”: không tính đúng/sai */
  skipped: boolean;
  /** chất lượng 0–5 cho SM-2 (A4) */
  quality: number;
  /** đáp án đúng để lưu thẻ ôn */
  answer: string;
  /** điểm luyện thanh 0–100 (A2) */
  score?: number;
  tone?: ToneId;
}

export type { ExerciseRef };
