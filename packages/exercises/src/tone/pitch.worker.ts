/**
 * Web Worker phân tích thanh điệu (A1 + A2): chạy ngoài luồng giao diện để thao tác chạm, cuộn,
 * hoạt ảnh vẫn mượt trên điện thoại yếu trong lúc tính YIN/DTW.
 */
import { expose } from 'comlink';
import { analyzeTone, type ToneAnalysisInput, type ToneAnalysisResult } from '@vietlearning/audio-dsp';

const api = {
  analyze(input: ToneAnalysisInput): ToneAnalysisResult {
    return analyzeTone(input);
  }
};

export type PitchWorkerApi = typeof api;

expose(api);
