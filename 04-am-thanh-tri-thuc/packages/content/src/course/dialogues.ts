/**
 * Tình huống rẽ nhánh cuối unit (dự án 2, Task 3): kịch bản KHÔNG cần AI, chạy offline.
 * Nút = một câu của Cu Tít + các lựa chọn của người học, mỗi lựa chọn trỏ tới nút kế hoặc `end-ok` / `end-retry`.
 * Chấm xưng hô theo mẫu `situations.ts`: nút có `context` (tuổi/giới/quan hệ) mang bản chụp `a6` (kết quả luật A6)
 * để không kéo HonorificInterpreter (~9 kB) vào chunk bài học; test `dialogues.test.mjs` ép bản chụp luôn bằng
 * luật thật. Cờ `reviewed` (D8): nháp do AI soạn, chỉ hiện ở bản phát hành sau khi người duyệt
 * (docs/nhat-ky/DUYET-NOI-DUNG.md). Cấu trúc kịch bản tham khảo mô hình nút–lựa chọn của inkjs/ink (MIT, inkle),
 * chỉ lấy ý tưởng, không chép mã, không thêm phụ thuộc.
 */
import dialogueData from '../data/course/dialogues.json' with { type: 'json' };
import type { ContextExpression } from '../honorifics/HonorificInterpreter.js';

export type DialogueEnd = 'end-ok' | 'end-retry';

export interface DialoguePronouns {
  speaker: string;
  listener: string;
}

export interface DialogueOption {
  /** câu người học nói (tiếng Việt, nội dung học) */
  text: string;
  textEn: string;
  /** id nút kế tiếp hoặc kết thúc */
  next: string;
  /** cặp xưng hô lựa chọn này dùng (chỉ có ở nút có chấm xưng hô) */
  a6?: DialoguePronouns;
}

export interface DialogueNode {
  id: string;
  /** lời Cu Tít / người trong cảnh (tiếng Việt) */
  cutit: string;
  cutitEn: string;
  /** ngữ cảnh đưa vào luật A6; có thì nút này chấm xưng hô */
  context?: Omit<ContextExpression, 'pairId'>;
  /** bản chụp đáp án của luật A6 cho `context` */
  a6?: DialoguePronouns;
  options: DialogueOption[];
}

export interface Dialogue {
  id: string;
  unit: string;
  /** id kịch bản AI cũ (scenarios.json) để nút “Luyện với Cu Tít” dùng lại prompt nhập vai */
  aiScenarioId: string;
  title: string;
  titleEn: string;
  start: string;
  nodes: DialogueNode[];
  reviewed: boolean;
}

export const DIALOGUES: readonly Dialogue[] = dialogueData as Dialogue[];

/** Tình huống của unit; bản phát hành (includeUnreviewed=false) bỏ kịch bản chưa duyệt */
export function dialogueForUnit(unitId: string, opts: { includeUnreviewed: boolean }): Dialogue | undefined {
  const d = DIALOGUES.find((x) => x.unit === unitId);
  return d && (d.reviewed || opts.includeUnreviewed) ? d : undefined;
}
