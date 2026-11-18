/**
 * Xưng hô trong ngữ cảnh (GĐ2b, kế hoạch tổng mục 5 GĐ2 điểm 4): tình huống “ai nói với ai” (tuổi, giới tính,
 * quan hệ). Đáp án và lời giải KHÔNG viết tay: là kết quả của luật A6 có sẵn (`HonorificInterpreter.interpret`).
 * Trường `a6` trong JSON là bản chụp kết quả đó (+ lời giải tiếng Anh của cặp), để chunk dữ liệu khóa học không kéo luật A6 và 20 cặp theo,
 * test `situations-stories.test.mjs` ép bản chụp luôn bằng `resolveSituation` (situationsA6.ts, gọi luật thật): đổi luật A6 mà
 * quên chụp lại thì test đỏ. Nội dung là bản nháp (reviewed=false) chờ người bản ngữ duyệt (D8).
 */
import situationData from '../data/course/situations.json' with { type: 'json' };
import type { ContextExpression } from '../honorifics/HonorificInterpreter.js';

/** Bản chụp kết quả luật A6 cho ngữ cảnh của tình huống */
export interface SituationA6 {
  speaker: string;
  listener: string;
  pairId: string;
  explanation: string;
  /** lời giải tiếng Anh của cặp `pairId` trong 20 cặp (A6 chỉ trả tiếng Việt) */
  explanationEn: string;
}

export interface Situation {
  id: string;
  /** cảnh bằng tiếng Việt (nội dung học) */
  scene: string;
  /** bản dịch cảnh cho giao diện tiếng Anh */
  sceneEn: string;
  /** ngữ cảnh đưa vào luật A6; không có pairId để đáp án do luật suy ra */
  context: Omit<ContextExpression, 'pairId'>;
  a6: SituationA6;
  reviewed: boolean;
}

/** Đáp án của tình huống (cùng hình dạng bản chụp) */
export type SituationAnswer = SituationA6;

export const SITUATIONS: readonly Situation[] = situationData as Situation[];

export function findSituation(id: string): Situation | undefined {
  // không dựng Map ở cấp module: giữ module không có tác dụng phụ để Rollup tree-shake khỏi các màn không dùng
  return SITUATIONS.find((s) => s.id === id);
}

/**
 * Đáp án dùng lúc chạy (bản chụp A6). KHÔNG import gì từ honorifics/ ở đây: module này nằm trong chunk dữ liệu
 * khóa học mà nhiều màn (M6, M10…) cùng tải; kéo 20 cặp vào sẽ gộp chunk xưng hô (~9 kB gzip) vào chunk chung.
 */
export function situationAnswer(s: Situation): SituationAnswer {
  return s.a6;
}
