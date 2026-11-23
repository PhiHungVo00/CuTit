/**
 * Thuật toán A3: chấm phát âm tổng hợp = so khớp từng âm tiết (NFC) giữa câu mẫu và lời chép của STT,
 * kết hợp A2 (so contour) cho thanh điệu từng âm tiết khi tách được đoạn hữu thanh khớp số âm tiết.
 * Trạng thái đúng/sai do chữ quyết định; A2 chỉ bổ sung "thanh nghe giống thanh nào".
 */
import { compareContours, type ToneId } from '@vietlearning/audio-dsp';
import { PitchReferenceFlyweight } from '@vietlearning/content';
import type { AssessResponse, AssessWord } from '@vietlearning/contracts';
import { alignSyllables } from './align.js';
import { syllableContours } from './segments.js';
import { baseOf, syllables, toneOf } from './text.js';

export interface AssessInput {
  expectedText: string;
  /** lời chép của STT; null = chưa có nhà cung cấp STT (mock) */
  transcript: string | null;
  pcm: Float32Array | null;
  sampleRate: number;
}

/** Mỗi âm tiết nói thêm trừ 5 điểm */
const EXTRA_PENALTY = 5;

function pitchFor(contour: number[], target: ToneId): NonNullable<AssessWord['pitch']> {
  const refs = PitchReferenceFlyweight.contours() as Record<ToneId, number[]>;
  const ids = Object.keys(refs) as ToneId[];
  const scores = Object.fromEntries(ids.map((id) => [id, compareContours(contour, refs[id]).score])) as Record<ToneId, number>;
  const bestMatch = ids.reduce((b, id) => (scores[id] > scores[b] ? id : b), ids[0]);
  return { score: scores[target], bestMatch };
}

export function assessPronunciation(input: AssessInput): AssessResponse {
  const expected = syllables(input.expectedText);
  const contours = input.pcm ? syllableContours(input.pcm, input.sampleRate) : [];
  const toneChecked = expected.length > 0 && contours.length === expected.length;
  const pitchAt = (i: number, s: string) => (toneChecked ? { pitch: pitchFor(contours[i], toneOf(s)) } : {});

  if (input.transcript === null) {
    return {
      transcript: '',
      words: expected.map((s, i) => ({ expected: s, heard: null, status: 'correct' as const, expectedTone: toneOf(s), ...pitchAt(i, s) })),
      score: 0,
      toneChecked,
      mock: true,
      hints: ['mock']
    };
  }

  let expIndex = 0;
  let good = 0;
  let extras = 0;
  const words: AssessWord[] = alignSyllables(expected, syllables(input.transcript)).map(({ expected: e, heard: h }) => {
    if (e === null) {
      extras++;
      return { expected: null, heard: h, status: 'extra' };
    }
    const base = { expected: e, heard: h, expectedTone: toneOf(e), ...pitchAt(expIndex++, e) };
    if (h === null) return { ...base, status: 'missing' };
    if (h === e) {
      good += 1;
      return { ...base, status: 'correct' };
    }
    if (baseOf(h) === baseOf(e)) {
      good += 0.5;
      return { ...base, status: 'tone', heardTone: toneOf(h) };
    }
    return { ...base, status: 'wrong' };
  });

  const raw = expected.length ? Math.round((100 * good) / expected.length) : 0;
  const score = Math.max(0, Math.min(100, raw - EXTRA_PENALTY * extras));
  const hints = words.filter((w) => w.status === 'tone').map((w) => `tone:${w.expected}:${w.expectedTone}:${w.heardTone}`);
  return { transcript: input.transcript, words, score, toneChecked, mock: false, hints };
}
