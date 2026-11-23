import type { ChatCorrection, NewWord } from '@vietlearning/contracts/api';

/** Một mục của màn tổng kết: chạm một lần để thành thẻ ôn tập SM-2 (learnerStore.addCard) */
export interface SummaryItem {
  /** itemRef của thẻ SRS: lỗi `roleplay:<câu đúng viết thường>` (giữ như bản cũ), từ `conv:word:<từ>` */
  key: string;
  kind: 'mistake' | 'word';
  front: string;
  back: string;
}

const norm = (s: string) => s.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');

/** Gộp lỗi đã sửa + từ mới của cả buổi thành danh sách tổng kết (lỗi trước, bỏ trùng theo key) */
export function buildSummary(corrections: ChatCorrection[], words: NewWord[], youWrote: (text: string) => string): SummaryItem[] {
  const out = new Map<string, SummaryItem>();
  for (const c of corrections) {
    const key = `roleplay:${norm(c.corrected)}`;
    if (!out.has(key)) out.set(key, { key, kind: 'mistake', front: c.corrected.trim(), back: `${youWrote(c.original.trim())} ${c.explanation}`.trim() });
  }
  for (const w of words) {
    const vi = norm(w.vi);
    const key = `conv:word:${vi}`;
    if (vi && !out.has(key)) out.set(key, { key, kind: 'word', front: vi, back: w.en.trim() });
  }
  return [...out.values()];
}
