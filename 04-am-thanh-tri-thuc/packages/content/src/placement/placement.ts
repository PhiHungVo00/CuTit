/**
 * Ngân hàng câu hỏi xếp lớp (M11, thuật toán A5 chạy ở Gateway). NGUỒN DUY NHẤT: src/data/placement.json.
 * 4 câu × 6 cấp (A1..C2). `answer` là chỉ số đáp án TRONG DỮ LIỆU; Gateway xáo lựa chọn khi gửi đi.
 * reviewed=false: chờ người bản ngữ / giáo viên duyệt.
 */
import placementData from '../data/placement.json' with { type: 'json' };

export interface PlacementQuestion {
  id: string;
  /** độ khó 1–6 (A1..C2) */
  level: number;
  prompt: string;
  /** câu hỏi bằng tiếng Anh cho giao diện tiếng Anh (lựa chọn vẫn là tiếng Việt) */
  promptEn: string;
  options: string[];
  answer: number;
  reviewed: boolean;
}

export const PLACEMENT_QUESTIONS: readonly PlacementQuestion[] = placementData as PlacementQuestion[];
