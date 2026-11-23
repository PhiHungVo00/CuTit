import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioCaptureBridge } from '@vietlearning/audio-dsp';
import type { AssessResponse } from '@vietlearning/contracts/api';

export type SpeakStatus = 'idle' | 'starting' | 'recording' | 'sending' | 'done';
export type SpeakError = 'permission-denied' | 'no-microphone' | 'unsupported' | 'too-short' | 'network' | 'quota' | 'failed';

/** Một câu A1 đọc chậm hiếm khi quá 8 giây: tự dừng để tiết kiệm dữ liệu và hạn mức STT */
export const MAX_SENTENCE_MS = 8000;
const MIN_SENTENCE_MS = 500;

export type AssessFn = (wav: ArrayBuffer, expectedText: string, signal: AbortSignal) => Promise<AssessResponse>;

/** Gửi WAV (PCM16 16 kHz) + câu mẫu lên /v1/speech/assess (A3); tải api-client/contracts lúc cần */
export const assessOnGateway: AssessFn = async (wav, expectedText, signal) => {
  const [{ request }, { AssessResponseSchema }] = await Promise.all([import('@vietlearning/api-client'), import('@vietlearning/contracts/api')]);
  const form = new FormData();
  form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'sentence.wav');
  form.append('expectedText', expectedText);
  return request('/v1/speech/assess', { body: form, schema: AssessResponseSchema, signal });
};

const defaultBridge = () =>
  import('@vietlearning/audio-dsp').then(({ AudioCaptureBridge, WebAudioDriver }) => new AudioCaptureBridge(new WebAudioDriver(16000, true)));

/** Ghi một câu → mã hóa WAV → chấm ở Gateway. State machine giống useVoiceInput của M1. */
export function useSentenceRecorder(expectedText: string, assess: AssessFn = assessOnGateway, createBridge: () => Promise<AudioCaptureBridge> = defaultBridge) {
  const [status, setStatus] = useState<SpeakStatus>('idle');
  const [error, setError] = useState<SpeakError | null>(null);
  const [result, setResult] = useState<AssessResponse | null>(null);
  const [level, setLevel] = useState(0);
  const bridgeRef = useRef<AudioCaptureBridge | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const startedRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    bridgeRef.current = null;
    window.clearTimeout(timerRef.current);
    setLevel(0);
    if (performance.now() - startedRef.current < MIN_SENTENCE_MS) {
      bridge.cancel();
      setError('too-short');
      setStatus('idle');
      return;
    }
    setStatus('sending');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const [rec, { encodeWav }] = await Promise.all([bridge.finish(), import('@vietlearning/audio-dsp')]);
      const r = await assess(encodeWav(rec.pcm, rec.sampleRate), expectedText, ac.signal);
      if (ac.signal.aborted) return;
      setResult(r);
      setStatus('done');
    } catch (err) {
      if (ac.signal.aborted) return;
      const kind = (err as { kind?: string }).kind;
      setError(kind === 'offline' || kind === 'timeout' ? 'network' : kind === 'quota' ? 'quota' : 'failed');
      setStatus('idle');
    }
  }, [assess, expectedText]);

  const start = useCallback(async () => {
    if (bridgeRef.current) return;
    setError(null);
    setResult(null);
    setStatus('starting');
    let bridge: AudioCaptureBridge | null = null;
    try {
      bridge = await createBridge();
      bridgeRef.current = bridge;
      let n = 0;
      await bridge.record((rms) => {
        if (++n % 8 === 0) setLevel(Math.min(1, rms * 6));
      });
      startedRef.current = performance.now();
      setStatus('recording');
      timerRef.current = window.setTimeout(() => void stop(), MAX_SENTENCE_MS);
    } catch (err) {
      bridgeRef.current = null;
      bridge?.cancel();
      const code = (err as { code?: string }).code;
      setError(code === 'permission-denied' || code === 'no-microphone' || code === 'unsupported' ? code : 'failed');
      setStatus('idle');
    }
  }, [createBridge, stop]);

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
      bridgeRef.current?.cancel();
      bridgeRef.current = null;
      abortRef.current?.abort();
    },
    []
  );

  return { status, error, result, level, start, stop, reset: () => (setResult(null), setStatus('idle')) };
}
