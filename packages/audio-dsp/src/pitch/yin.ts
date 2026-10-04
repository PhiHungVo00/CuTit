/**
 * Thuật toán A1: YIN Pitch Extraction & Semitone Conversion
 * Trích xuất tần số cơ bản F0 từ tín hiệu PCM 16kHz
 */
export function extractF0YIN(buffer: Float32Array, sampleRate = 16000, threshold = 0.1): number[] {
  const f0Values: number[] = [];
  const bufferSize = buffer.length;
  const halfSize = Math.floor(bufferSize / 2);
  const yinBuffer = new Float32Array(halfSize);

  // Bước 1: Tính hàm sai số bình phương tự tương quan (Difference Function)
  for (let tau = 0; tau < halfSize; tau++) {
    yinBuffer[tau] = 0;
    for (let i = 0; i < halfSize; i++) {
      const delta = buffer[i] - buffer[i + tau];
      yinBuffer[tau] += delta * delta;
    }
  }

  // Bước 2: Chuẩn hóa tỉ lệ (Cumulative Mean Normalized Difference)
  yinBuffer[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < halfSize; tau++) {
    runningSum += yinBuffer[tau];
    yinBuffer[tau] *= tau / runningSum;
  }

  // Bước 3: Tìm điểm cực tiểu tuyệt đối dưới ngưỡng threshold
  let tauFound = -1;
  for (let tau = 2; tau < halfSize; tau++) {
    if (yinBuffer[tau] < threshold) {
      while (tau + 1 < halfSize && yinBuffer[tau + 1] < yinBuffer[tau]) {
        tau++;
      }
      tauFound = tau;
      break;
    }
  }

  const pitch = tauFound > 0 ? sampleRate / tauFound : 0;
  f0Values.push(pitch);
  return f0Values;
}

export function hzToSemitone(hz: number, refHz = 55): number {
  if (hz <= 0) return 0;
  return 12 * Math.log2(hz / refHz);
}
