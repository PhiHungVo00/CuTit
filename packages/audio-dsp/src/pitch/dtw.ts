/**
 * Thuật toán A2: so khớp contour thanh điệu bằng DTW (có dải Sakoe-Chiba) + tương quan Pearson.
 *
 * Đầu vào là semitone TƯƠNG ĐỐI (xem semitone.ts), không phải Hz thô như bản cũ.
 *  - DTW: khoảng cách hình dạng, chịu được nói nhanh/chậm khác nhau.
 *  - Pearson: cùng hướng lên/xuống hay không (sắc vs huyền).
 * Điểm tổng 0..100 = 60% DTW + 40% Pearson (thanh "ngang" phẳng xử lý riêng vì Pearson không xác định).
 */
import { centered, resampleSeries } from './semitone.js';

/** DTW chuẩn hóa theo độ dài đường đi, dải Sakoe-Chiba `bandRatio` (0..1) để O(n·w) thay vì O(n²). */
export function dtwDistance(a: number[], b: number[], bandRatio = 0.25): number {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return Infinity;
  const w = Math.max(Math.ceil(Math.max(n, m) * bandRatio), Math.abs(n - m));
  let prev = new Float64Array(m + 1).fill(Infinity);
  let cur = new Float64Array(m + 1).fill(Infinity);
  const prevLen = new Float64Array(m + 1);
  const curLen = new Float64Array(m + 1);
  prev[0] = 0;

  for (let i = 1; i <= n; i++) {
    cur.fill(Infinity);
    const jStart = Math.max(1, i - w);
    const jEnd = Math.min(m, i + w);
    for (let j = jStart; j <= jEnd; j++) {
      const cost = Math.abs(a[i - 1] - b[j - 1]);
      // chọn ô trước có chi phí nhỏ nhất, ghi lại độ dài đường đi để chuẩn hóa
      let best = prev[j - 1];
      let len = prevLen[j - 1];
      if (prev[j] < best) {
        best = prev[j];
        len = prevLen[j];
      }
      if (cur[j - 1] < best) {
        best = cur[j - 1];
        len = curLen[j - 1];
      }
      cur[j] = cost + best;
      curLen[j] = len + 1;
    }
    [prev, cur] = [cur, prev];
    prevLen.set(curLen);
  }
  return prev[m] / Math.max(1, prevLen[m]);
}

export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
}

function stdDev(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
}

export interface ToneComparison {
  /** 0..100 */
  score: number;
  dtwScore: number;
  dtwDistanceSemitones: number;
  pearson: number;
}

const POINTS = 40;
/** Contour dao động dưới ngưỡng này (semitone) coi là "phẳng" */
const FLAT_STD = 0.6;

/** So contour người học với contour mẫu (cả hai là semitone tương đối, độ dài bất kỳ). */
export function compareContours(learner: number[], reference: number[]): ToneComparison {
  const a = centered(resampleSeries(learner, POINTS));
  const b = centered(resampleSeries(reference, POINTS));
  const dist = dtwDistance(a, b);
  // Lệch trung bình 0 st => 100 điểm; 1 st => ~67; 2 st => ~45; 3 st => ~30
  const dtwScore = 100 * Math.exp(-dist / 2.5);

  const flatA = stdDev(a) < FLAT_STD;
  const flatB = stdDev(b) < FLAT_STD;
  let r: number;
  if (flatA && flatB) r = 1;
  else if (flatA || flatB) r = 0;
  else r = pearson(a, b);
  const pearsonScore = ((r + 1) / 2) * 100;

  return {
    score: Math.round(0.6 * dtwScore + 0.4 * pearsonScore),
    dtwScore: Math.round(dtwScore),
    dtwDistanceSemitones: Math.round(dist * 100) / 100,
    pearson: Math.round(r * 1000) / 1000
  };
}
