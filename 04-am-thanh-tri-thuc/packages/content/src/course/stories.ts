/**
 * Truyện ngắn / đoạn hội thoại nghe (GĐ2b, kế hoạch tổng mục 5 GĐ2 điểm 6): 1 truyện A1 mỗi unit, dùng từ của unit,
 * có câu hỏi hiểu. Mỗi câu thoại là một văn bản đọc riêng (gói âm thanh dựng sẵn theo miền tra theo từng câu).
 * Cờ reviewed (D8): đã duyệt ở đợt DUYET-NOI-DUNG (docs/nhat-ky/DUYET-NOI-DUNG.md).
 */
import storyData from '../data/course/stories.json' with { type: 'json' };

export interface StoryLine {
  /** tên người nói (không đọc lên) */
  speaker: string;
  text: string;
  /** bản dịch tiếng Anh */
  en: string;
}

export interface StoryQuestion {
  q: string;
  qEn: string;
  answer: string;
  distractors: string[];
}

export interface Story {
  id: string;
  unit: string;
  title: string;
  titleEn: string;
  reviewed: boolean;
  lines: StoryLine[];
  questions: StoryQuestion[];
}

export const STORIES: readonly Story[] = storyData as Story[];
export function findStory(id: string): Story | undefined {
  // tra bằng find, không dựng Map cấp module: module không có tác dụng phụ nên Rollup chỉ đưa truyện vào chunk
  // của lộ trình, không vào chunk dữ liệu chung mà M6/M10/trang chủ cũng tải
  return STORIES.find((s) => s.id === id);
}
