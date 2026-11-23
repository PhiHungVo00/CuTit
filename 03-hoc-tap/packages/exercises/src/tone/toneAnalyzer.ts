import { transfer, wrap, type Remote } from 'comlink';
import type { ToneAnalysisInput, ToneAnalysisResult } from '@vietlearning/audio-dsp';
import type { PitchWorkerApi } from './pitch.worker';

let worker: Worker | null = null;
let remote: Remote<PitchWorkerApi> | null = null;

/** Tạo Worker lười ở lần phân tích đầu tiên (không tốn tài nguyên nếu người học không ghi âm). */
function getRemote(): Remote<PitchWorkerApi> | null {
  if (remote) return remote;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./pitch.worker.ts', import.meta.url), { type: 'module' });
    remote = wrap<PitchWorkerApi>(worker);
    return remote;
  } catch {
    return null;
  }
}

/**
 * Phân tích một lần phát âm. PCM được CHUYỂN GIAO (transfer) sang Worker, không sao chép.
 * Nếu môi trường không có Worker thì chạy trực tiếp (chậm hơn nhưng vẫn đúng).
 */
export async function analyzeInWorker(input: ToneAnalysisInput): Promise<ToneAnalysisResult> {
  const r = getRemote();
  if (!r) {
    const { analyzeTone } = await import('@vietlearning/audio-dsp');
    return analyzeTone(input);
  }
  return r.analyze(transfer(input, [input.pcm.buffer]));
}

/** Giải phóng Worker khi rời màn hình. */
export function disposeAnalyzer(): void {
  worker?.terminate();
  worker = null;
  remote = null;
}
