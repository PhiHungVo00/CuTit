/**
 * Hạ tần số lấy mẫu (vd. 48 kHz của micro => 16 kHz cho phân tích F0, đúng TDD).
 * Lọc thông thấp windowed-sinc trước khi lấy mẫu lại để tránh chồng phổ (aliasing):
 * nếu chỉ "bỏ bớt mẫu", tạp âm tần số cao sẽ gập xuống dải giọng nói và làm sai F0.
 */
export function downsample(input: Float32Array, fromRate: number, toRate = 16000, taps = 31): Float32Array {
  if (fromRate === toRate) return input;
  if (fromRate < toRate) throw new Error('downsample chỉ hỗ trợ hạ tần số');

  const ratio = fromRate / toRate;
  const cutoff = 0.5 / ratio; // tần số cắt chuẩn hóa (theo fromRate)
  const half = (taps - 1) / 2;
  const kernel = new Float32Array(taps);
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const x = i - half;
    const sinc = x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x);
    const hamming = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (taps - 1));
    kernel[i] = sinc * hamming;
    sum += kernel[i];
  }
  for (let i = 0; i < taps; i++) kernel[i] /= sum;

  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let o = 0; o < outLen; o++) {
    const center = o * ratio;
    const base = Math.floor(center);
    let acc = 0;
    for (let k = 0; k < taps; k++) {
      const idx = base + k - half;
      if (idx >= 0 && idx < input.length) acc += input[idx] * kernel[k];
    }
    out[o] = acc;
  }
  return out;
}

/** Ghép các khối Float32Array (từ AudioWorklet) thành một mảng. */
export function concatChunks(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
