/**
 * Thuật toán A1: trích xuất cao độ F0 bằng YIN (de Cheveigné & Kawahara, 2002), theo từng khung.
 *
 * Khác bản cũ (một giá trị cho cả bản ghi, O(N²) trên toàn bộ tín hiệu):
 *  - Chia khung 40ms, bước 10ms => ra ĐƯỜNG CONTOUR theo thời gian (cần cho 6 thanh điệu).
 *  - Chỉ xét tau trong dải giọng người 70–500 Hz => chi phí mỗi khung O(W · tauMax), không O(N²).
 *  - Nội suy parabol quanh cực tiểu => độ chính xác dưới 1 mẫu.
 *  - Cổng năng lượng (RMS) + ngưỡng tin cậy => khung lặng/vô thanh trả null thay vì số rác.
 */

export interface PitchOptions {
  minHz?: number;
  maxHz?: number;
  /** Ngưỡng CMNDF của YIN (0.10–0.20). Thấp hơn = khắt khe hơn. */
  threshold?: number;
  /** RMS tối thiểu để coi là có tiếng (tín hiệu chuẩn hóa -1..1) */
  minRms?: number;
}

export interface PitchEstimate {
  hz: number | null;
  /** 0..1, càng cao càng chắc là âm hữu thanh */
  clarity: number;
}

export interface PitchFrame extends PitchEstimate {
  timeMs: number;
}

export interface ContourOptions extends PitchOptions {
  frameMs?: number;
  hopMs?: number;
}

const DEFAULTS = { minHz: 70, maxHz: 500, threshold: 0.15, minRms: 0.01 };

export function rms(buf: Float32Array, start = 0, len = buf.length): number {
  let s = 0;
  for (let i = start; i < start + len; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / Math.max(1, len));
}

/**
 * YIN cho MỘT khung. `scratch` (độ dài >= tauMax + 1) được tái sử dụng giữa các khung
 * để không cấp phát bộ nhớ mới mỗi lần (giảm GC trên điện thoại).
 */
export function yinPitch(
  frame: Float32Array,
  sampleRate: number,
  opts: PitchOptions = {},
  scratch?: Float32Array
): PitchEstimate {
  const { minHz, maxHz, threshold, minRms } = { ...DEFAULTS, ...opts };
  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  const tauMax = Math.min(Math.floor(sampleRate / minHz), Math.floor(frame.length / 2));
  if (tauMax <= tauMin + 2 || rms(frame) < minRms) return { hz: null, clarity: 0 };

  const W = frame.length - tauMax; // cửa sổ tích phân
  const d = scratch && scratch.length > tauMax ? scratch : new Float32Array(tauMax + 1);

  // Bước 1–2: hàm sai phân d(tau)
  d[0] = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < W; i++) {
      const delta = frame[i] - frame[i + tau];
      sum += delta * delta;
    }
    d[tau] = sum;
  }

  // Bước 3: hiệu chỉnh theo trung bình tích lũy (CMNDF)
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }

  // Bước 4: cực tiểu đầu tiên dưới ngưỡng (trong dải tau hợp lệ); nếu không có => lấy cực tiểu toàn cục
  let tauEst = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (d[tau] < threshold) {
      while (tau + 1 <= tauMax && d[tau + 1] < d[tau]) tau++;
      tauEst = tau;
      break;
    }
  }
  if (tauEst < 0) {
    let best = tauMin;
    for (let tau = tauMin + 1; tau <= tauMax; tau++) if (d[tau] < d[best]) best = tau;
    // Cực tiểu toàn cục quá "nông" => coi là vô thanh
    if (d[best] > 0.35) return { hz: null, clarity: Math.max(0, 1 - d[best]) };
    tauEst = best;
  }

  // Bước 5: nội suy parabol
  let betterTau = tauEst;
  if (tauEst > 1 && tauEst < tauMax) {
    const s0 = d[tauEst - 1];
    const s1 = d[tauEst];
    const s2 = d[tauEst + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tauEst + (s2 - s0) / denom;
  }

  const hz = sampleRate / betterTau;
  if (hz < minHz || hz > maxHz) return { hz: null, clarity: 0 };
  return { hz, clarity: Math.max(0, Math.min(1, 1 - d[tauEst])) };
}

/** Một hàm ước lượng cao độ cho một khung (YIN, McLeod...) — dùng cho GoF Strategy. */
export type FramePitchFn = (
  frame: Float32Array,
  sampleRate: number,
  opts: PitchOptions,
  scratch: Float32Array
) => PitchEstimate;

/** Chạy một bộ ước lượng trên toàn bộ tín hiệu theo khung trượt => contour cao độ. */
export function extractContourWith(
  estimator: FramePitchFn,
  pcm: Float32Array,
  sampleRate: number,
  opts: ContourOptions = {}
): PitchFrame[] {
  const frameMs = opts.frameMs ?? 40;
  const hopMs = opts.hopMs ?? 10;
  const frameLen = Math.round((sampleRate * frameMs) / 1000);
  const hop = Math.max(1, Math.round((sampleRate * hopMs) / 1000));
  const scratch = new Float32Array(frameLen + 1);
  const out: PitchFrame[] = [];
  for (let start = 0; start + frameLen <= pcm.length; start += hop) {
    const est = estimator(pcm.subarray(start, start + frameLen), sampleRate, opts, scratch);
    out.push({ timeMs: (start * 1000) / sampleRate, ...est });
  }
  return out;
}

/** A1: contour F0 bằng YIN. */
export function extractContourYIN(pcm: Float32Array, sampleRate: number, opts: ContourOptions = {}): PitchFrame[] {
  return extractContourWith(yinPitch, pcm, sampleRate, opts);
}
