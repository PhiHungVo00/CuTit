import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioCaptureBridge, CaptureError, type CaptureErrorCode, type ToneAnalysisResult, type ToneId } from '@vietlearning/audio-dsp';
import { PitchReferenceFlyweight } from '@vietlearning/content';
import { analyzeInWorker, disposeAnalyzer } from './toneAnalyzer';

export type RecorderStatus = 'idle' | 'starting' | 'recording' | 'analyzing' | 'done' | 'error';
export type RecorderError = CaptureErrorCode | 'no-voice' | 'too-short';

/** Một âm tiết hiếm khi dài quá 2.5 giây: tự dừng để người học không phải bấm lần hai */
export const MAX_RECORD_MS = 2500;
const MIN_RECORD_MS = 300;

/** State machine ghi âm → phân tích (GoF State, tương tự TurnStateMachine của M1). */
export function useToneRecorder(target: ToneId, createBridge: () => AudioCaptureBridge = () => new AudioCaptureBridge()) {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [error, setError] = useState<RecorderError | null>(null);
  const [result, setResult] = useState<Extract<ToneAnalysisResult, { ok: true }> | null>(null);
  const [level, setLevel] = useState(0);
  const bridgeRef = useRef<AudioCaptureBridge | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const startedRef = useRef(0);
  const targetRef = useRef(target);
  targetRef.current = target;

  const stop = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    bridgeRef.current = null;
    window.clearTimeout(timerRef.current);
    setLevel(0);
    if (performance.now() - startedRef.current < MIN_RECORD_MS) {
      bridge.cancel();
      setError('too-short');
      setStatus('error');
      return;
    }
    setStatus('analyzing');
    try {
      const rec = await bridge.finish();
      const analysis = await analyzeInWorker({
        pcm: rec.pcm,
        sampleRate: rec.sampleRate,
        target: targetRef.current,
        references: PitchReferenceFlyweight.contours()
      });
      if (analysis.ok) {
        setResult(analysis);
        setStatus('done');
      } else {
        setError(analysis.reason);
        setStatus('error');
      }
    } catch {
      setError('failed');
      setStatus('error');
    }
  }, []);

  const start = useCallback(async () => {
    if (bridgeRef.current) return;
    setError(null);
    setResult(null);
    setStatus('starting');
    const bridge = createBridge();
    bridgeRef.current = bridge;
    try {
      // Mức âm lượng cập nhật ~ mỗi 8 khối (≈ 20ms) để không re-render quá dày
      let n = 0;
      await bridge.record((rms) => {
        if (++n % 8 === 0) setLevel(Math.min(1, rms * 6));
      });
      startedRef.current = performance.now();
      setStatus('recording');
      timerRef.current = window.setTimeout(() => void stop(), MAX_RECORD_MS);
    } catch (err) {
      bridgeRef.current = null;
      bridge.cancel();
      setError(err instanceof CaptureError ? err.code : 'failed');
      setStatus('error');
    }
  }, [createBridge, stop]);

  // Đổi thanh mục tiêu thì kết quả cũ không còn ý nghĩa
  useEffect(() => {
    setResult(null);
    setError(null);
    setStatus((s) => (s === 'done' || s === 'error' ? 'idle' : s));
  }, [target]);

  // Rời màn hình: dừng micro, giải phóng Worker
  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
      bridgeRef.current?.cancel();
      bridgeRef.current = null;
      disposeAnalyzer();
    },
    []
  );

  return { status, error, result, level, start, stop };
}
