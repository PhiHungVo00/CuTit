/**
 * A3 + A1: tách bản ghi một câu thành các đoạn hữu thanh (ứng viên âm tiết) để so contour từng âm tiết bằng A2.
 * Không phải căn chỉnh cưỡng bức (forced alignment): nơi gọi chỉ dùng khi số đoạn bằng đúng số âm tiết mong đợi,
 * nếu không thì không phán thanh (người nói liền hơi thường nối âm tiết; tách sai còn tệ hơn không tách).
 */
import { createPitchStrategy, toRelativeSemitones, type PitchFrame } from '@vietlearning/audio-dsp';

/** Khoảng vô thanh tối thiểu giữa hai âm tiết, và độ dài tối thiểu của một đoạn */
const MIN_GAP_MS = 80;
const MIN_SEG_MS = 60;
const MIN_CLARITY = 0.5;

export function syllableContours(pcm: Float32Array, sampleRate: number): number[][] {
  const frames = createPitchStrategy('yin').extractContour(pcm, sampleRate);
  if (frames.length < 2) return [];
  const hop = frames[1].timeMs - frames[0].timeMs || 10;
  const voiced = (f: PitchFrame) => Boolean(f.hz) && f.clarity >= MIN_CLARITY;

  const runs: PitchFrame[][] = [];
  let cur: PitchFrame[] = [];
  let gap = 0;
  for (const f of frames) {
    if (voiced(f)) {
      if (cur.length && gap * hop >= MIN_GAP_MS) {
        runs.push(cur);
        cur = [];
      }
      gap = 0;
      cur.push(f);
    } else if (cur.length) {
      gap++;
      cur.push(f); // khoảng lặng ngắn bên trong (thanh ngã/nặng có ngắt) được nội suy ở toRelativeSemitones
    }
  }
  if (cur.length) runs.push(cur);

  return runs
    .map((r) => {
      let end = r.length;
      while (end > 0 && !voiced(r[end - 1])) end--; // bỏ đuôi vô thanh đã nối vào
      return r.slice(0, end);
    })
    .filter((r) => r.length * hop >= MIN_SEG_MS)
    .map((r) => toRelativeSemitones(r, MIN_CLARITY, 4)?.semitones ?? null)
    .filter((c): c is number[] => c !== null);
}
