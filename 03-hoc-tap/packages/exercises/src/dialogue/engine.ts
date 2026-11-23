import type { Dialogue, DialogueNode } from '@vietlearning/content';

export interface StepResult {
  next: string;
  /** xưng hô của lựa chọn khớp đáp án A6 của nút (true cả khi nút không chấm) */
  honorificOk: boolean;
  /** nút này có chấm xưng hô không */
  graded: boolean;
}

export function findNode(d: Dialogue, nodeId: string): DialogueNode {
  const n = d.nodes.find((x) => x.id === nodeId);
  if (!n) throw new Error(`Không có nút "${nodeId}" trong tình huống ${d.id}`);
  return n;
}

/**
 * Một bước: người học chọn lựa chọn `optionIndex` ở nút `nodeId`. Chấm xưng hô bằng bản chụp luật A6 của nút
 * (xem dialogues.ts: test nội dung ép bản chụp = HonorificInterpreter thật). Không import luật A6 để chunk bài học nhẹ.
 */
export function runStep(d: Dialogue, nodeId: string, optionIndex: number): StepResult {
  const node = findNode(d, nodeId);
  const opt = node.options[optionIndex];
  if (!opt) throw new Error(`Nút "${nodeId}" không có lựa chọn số ${optionIndex}`);
  if (!node.a6) return { next: opt.next, honorificOk: true, graded: false };
  const honorificOk = opt.a6?.speaker === node.a6.speaker && opt.a6?.listener === node.a6.listener;
  return { next: opt.next, honorificOk, graded: true };
}

/** Điểm xưng hô cả lượt: tỉ lệ nút chấm được chọn đúng (không có nút chấm => 1) */
export function scoreRun(steps: readonly Pick<StepResult, 'honorificOk' | 'graded'>[]): { total: number; ok: number; honorificScore: number } {
  const graded = steps.filter((s) => s.graded);
  const ok = graded.filter((s) => s.honorificOk).length;
  return { total: graded.length, ok, honorificScore: graded.length ? ok / graded.length : 1 };
}
