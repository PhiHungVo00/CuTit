/**
 * Tính lại đáp án tình huống bằng luật A6 thật. Tách khỏi situations.ts để chunk bài học (chỉ cần bản chụp `a6`)
 * không kéo lớp HonorificInterpreter và 20 cặp vào; dùng cho test và công cụ soạn nội dung.
 */
import { HONORIFIC_PAIRS_20, HonorificInterpreter } from '../honorifics/HonorificInterpreter.js';
import type { Situation, SituationAnswer } from './situations.js';

export function resolveSituation(s: Situation): SituationAnswer {
  const r = new HonorificInterpreter().interpret(s.context);
  const pair = HONORIFIC_PAIRS_20.find((p) => p.id === r.pairId);
  return { speaker: r.speaker, listener: r.listener, pairId: r.pairId, explanation: r.explanation, explanationEn: pair?.explanationEn ?? '' };
}
