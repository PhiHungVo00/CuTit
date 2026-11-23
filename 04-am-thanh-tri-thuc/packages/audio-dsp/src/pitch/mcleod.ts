/**
 * Thuật toán A1 (biến thể): McLeod Pitch Method (McLeod & Wyvill, 2005) dựa trên NSDF.
 * Ổn định hơn YIN với giọng có nhiều hài, dùng làm chiến lược thay thế (GoF Strategy).
 */
import { rms, type PitchEstimate, type PitchOptions } from './yin.js';

const DEFAULTS = { minHz: 70, maxHz: 500, minRms: 0.01 };
/** Hệ số k của MPM: chọn đỉnh đầu tiên >= k * đỉnh lớn nhất */
const K = 0.9;

export function mcleodPitch(
  frame: Float32Array,
  sampleRate: number,
  opts: PitchOptions = {},
  scratch?: Float32Array
): PitchEstimate {
  const { minHz, maxHz, minRms } = { ...DEFAULTS, ...opts };
  const n = frame.length;
  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  const tauMax = Math.min(Math.floor(sampleRate / minHz), n - 2);
  if (tauMax <= tauMin + 2 || rms(frame) < minRms) return { hz: null, clarity: 0 };

  const nsdf = scratch && scratch.length > tauMax ? scratch : new Float32Array(tauMax + 1);
  for (let tau = 0; tau <= tauMax; tau++) {
    let acf = 0;
    let m = 0;
    for (let i = 0; i < n - tau; i++) {
      acf += frame[i] * frame[i + tau];
      m += frame[i] * frame[i] + frame[i + tau] * frame[i + tau];
    }
    nsdf[tau] = m > 0 ? (2 * acf) / m : 0;
  }

  // Các đỉnh dương giữa hai lần cắt 0 đi xuống
  const peaks: number[] = [];
  let tau = 1;
  while (tau < tauMax && nsdf[tau] > 0) tau++; // bỏ thùy quanh tau = 0
  while (tau < tauMax) {
    while (tau < tauMax && nsdf[tau] <= 0) tau++;
    let best = tau;
    while (tau < tauMax && nsdf[tau] > 0) {
      if (nsdf[tau] > nsdf[best]) best = tau;
      tau++;
    }
    if (best >= tauMin && best < tauMax) peaks.push(best);
  }
  if (peaks.length === 0) return { hz: null, clarity: 0 };

  const maxVal = Math.max(...peaks.map((p) => nsdf[p]));
  const chosen = peaks.find((p) => nsdf[p] >= K * maxVal)!;
  if (nsdf[chosen] < 0.5) return { hz: null, clarity: Math.max(0, nsdf[chosen]) };

  const s0 = nsdf[chosen - 1];
  const s1 = nsdf[chosen];
  const s2 = nsdf[chosen + 1];
  const denom = 2 * (2 * s1 - s2 - s0);
  const better = denom !== 0 ? chosen + (s2 - s0) / denom : chosen;
  const hz = sampleRate / better;
  if (hz < minHz || hz > maxHz) return { hz: null, clarity: 0 };
  return { hz, clarity: Math.min(1, s1) };
}
