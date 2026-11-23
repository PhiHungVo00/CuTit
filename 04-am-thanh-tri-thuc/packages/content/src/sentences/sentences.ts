/**
 * 60 câu ghép (M8, thuật toán A8). NGUỒN DUY NHẤT: src/data/sentences.json.
 * Mỗi câu: token có nhãn ngữ pháp + các thứ tự chấp nhận. reviewed=false: chờ người bản ngữ duyệt.
 */
import sentenceData from '../data/sentences.json' with { type: 'json' };

export interface SentenceBank {
  id: string;
  level: number;
  topic: string;
  tokens: { text: string; tag: string }[];
  accepted: number[][];
  translation: string;
  reviewed: boolean;
}

export const SENTENCE_ITEMS: readonly SentenceBank[] = sentenceData as SentenceBank[];
