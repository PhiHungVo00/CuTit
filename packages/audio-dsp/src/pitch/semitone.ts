/**
 * Chuẩn hóa contour cao độ cho so sánh thanh điệu (phần tiền xử lý của A2).
 *
 * Vì sao semitone tương đối: giọng nam (~110 Hz) và giọng nữ (~220 Hz) cách nhau 12 semitone,
 * nhưng HÌNH DẠNG thanh điệu thì như nhau. Đổi sang semitone rồi trừ trung vị giọng của chính
 * người nói => so sánh công bằng giữa mọi giọng (bản cũ so Hz thô nên giọng nữ luôn bị chấm thấp).
 */
import type { PitchFrame } from './yin.js';

export function hzToSemitone(hz: number, refHz = 55): number {
  return hz > 0 ? 12 * Math.log2(hz / refHz) : NaN;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface VoicedContour {
  /** semitone so với trung vị giọng của người nói (0 = cao độ "thường" của họ) */
  semitones: number[];
  /** mốc thời gian (ms) tương ứng, đã cắt phần lặng đầu/cuối */
  timesMs: number[];
  /** tỉ lệ khung hữu thanh trong đoạn đã cắt */
  voicedRatio: number;
  /** trung vị F0 (Hz) của người nói */
  medianHz: number;
}

/**
 * Từ khung YIN/MPM => contour semitone tương đối:
 * 1. bỏ khung độ tin cậy thấp, 2. cắt lặng đầu/cuối, 3. lọc trung vị 3 điểm (bỏ nhảy quãng tám lẻ),
 * 4. nội suy tuyến tính khoảng vô thanh ngắn bên trong (vd. ngắt thanh hầu của thanh ngã/nặng).
 * Trả null nếu quá ít khung hữu thanh.
 */
export function toRelativeSemitones(frames: PitchFrame[], minClarity = 0.5, minVoicedFrames = 8): VoicedContour | null {
  const voicedIdx = frames.flatMap((f, i) => (f.hz && f.clarity >= minClarity ? [i] : []));
  if (voicedIdx.length < minVoicedFrames) return null;

  const first = voicedIdx[0];
  const last = voicedIdx[voicedIdx.length - 1];
  const span = frames.slice(first, last + 1);
  const raw = span.map((f) => (f.hz && f.clarity >= minClarity ? hzToSemitone(f.hz) : NaN));

  // Lọc trung vị 3 điểm trên các điểm hữu thanh
  const smoothed = raw.map((v, i) => {
    if (Number.isNaN(v)) return v;
    const win = [raw[i - 1], v, raw[i + 1]].filter((x) => x !== undefined && !Number.isNaN(x)) as number[];
    return median(win);
  });

  // Nội suy khoảng trống
  const filled = [...smoothed];
  for (let i = 0; i < filled.length; i++) {
    if (!Number.isNaN(filled[i])) continue;
    let j = i;
    while (j < filled.length && Number.isNaN(filled[j])) j++;
    const left = filled[i - 1];
    const right = filled[j];
    for (let k = i; k < j; k++) filled[k] = left + ((right - left) * (k - i + 1)) / (j - i + 1);
    i = j;
  }

  const voicedSemis = smoothed.filter((v) => !Number.isNaN(v));
  const center = median(voicedSemis);
  return {
    semitones: filled.map((v) => v - center),
    timesMs: span.map((f) => f.timeMs),
    voicedRatio: voicedSemis.length / span.length,
    medianHz: 55 * 2 ** (center / 12)
  };
}

/** Lấy mẫu lại chuỗi về đúng n điểm (nội suy tuyến tính) để so độ dài khác nhau. */
export function resampleSeries(series: number[], n: number): number[] {
  if (series.length === 0) return [];
  if (series.length === 1) return Array(n).fill(series[0]);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const pos = (i * (series.length - 1)) / (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(series.length - 1, lo + 1);
    out[i] = series[lo] + (series[hi] - series[lo]) * (pos - lo);
  }
  return out;
}

/** Trừ trung bình (đưa chuỗi về quanh 0) để so HÌNH DẠNG. */
export function centered(series: number[]): number[] {
  const mean = series.reduce((a, b) => a + b, 0) / Math.max(1, series.length);
  return series.map((v) => v - mean);
}
