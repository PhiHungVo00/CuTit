import { COURSE_WORDS } from '@vietlearning/content';
import type { NewWord } from '@vietlearning/contracts';

/** Tối đa số từ mới mỗi lượt (tổng kết buổi nói không bị ngập) */
export const MAX_NEW_WORDS = 3;

/** Đại từ/từ quá phổ biến: không tính là "từ mới" dù có trong khóa học */
const TOO_COMMON = new Set(['tôi', 'bạn', 'anh', 'chị', 'em', 'ông', 'bà', 'không', 'vâng', 'một']);

const norm = (s: string) => s.normalize('NFC').trim().toLowerCase();

/** Câu thành chuỗi từ cách nhau một khoảng trắng, có khoảng trắng hai đầu => so khớp nguyên cụm từ */
function wordString(text: string): string {
  return ` ${norm(text)
    .split(/[^\p{L}\p{M}]+/u)
    .filter(Boolean)
    .join(' ')} `;
}

const appears = (phrase: string, words: string) => words.includes(` ${phrase.split(/\s+/).join(' ')} `);

/**
 * Lọc từ mới LLM đề xuất (Nguyên tắc 6): phải xuất hiện nguyên cụm trong câu trả lời, có nghĩa tiếng Anh,
 * bỏ trùng, cắt độ dài, tối đa MAX_NEW_WORDS.
 */
export function filterNewWords(reply: string, candidates: { vi: string; en: string }[]): NewWord[] {
  const words = wordString(reply);
  const out: NewWord[] = [];
  for (const c of candidates) {
    const vi = norm(c.vi);
    const en = c.en.trim();
    if (!vi || vi.length > 40 || !en || en.length > 80) continue;
    if (TOO_COMMON.has(vi) || out.some((w) => w.vi === vi) || !appears(vi, words)) continue;
    out.push({ vi, en });
    if (out.length === MAX_NEW_WORDS) break;
  }
  return out;
}

/** Bộ giả lập: từ của khóa học có trong câu trả lời, ưu tiên cụm dài */
export function courseWordsIn(reply: string): NewWord[] {
  const sorted = [...COURSE_WORDS].sort((a, b) => b.vi.length - a.vi.length);
  return filterNewWords(reply, sorted.map((w) => ({ vi: w.vi, en: w.en })));
}
