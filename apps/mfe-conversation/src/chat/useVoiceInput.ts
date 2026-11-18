import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioCaptureBridge } from '@vietlearning/audio-dsp';
import { SilenceDetector } from '../call/silenceDetector';

export type VoiceStatus = 'idle' | 'starting' | 'recording' | 'transcribing';
export type VoiceError = 'permission-denied' | 'no-microphone' | 'unsupported' | 'too-short' | 'no-speech' | 'network' | 'failed';

/** Một câu nói khi luyện hội thoại hiếm khi quá 15 giây: tự dừng để tiết kiệm dữ liệu và quota STT */
export const MAX_VOICE_MS = 15000;
const MIN_VOICE_MS = 500;

export interface Transcript {
  text: string;
  /** true = Gateway chưa nối dịch vụ nhận dạng giọng nói, chữ trả về là câu mẫu */
  mock: boolean;
}

/** Gửi WAV (PCM16 16 kHz mono) lên Gateway dạng multipart; tải api-client/contracts lúc cần */
async function transcribeWav(wav: ArrayBuffer, signal: AbortSignal): Promise<Transcript> {
  const [{ request }, { TranscribeResponseSchema }] = await Promise.all([import('@vietlearning/api-client'), import('@vietlearning/contracts/api')]);
  const form = new FormData();
  form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'speech.wav');
  const r = await request('/v1/speech/transcribe', { body: form, schema: TranscribeResponseSchema, signal });
  return { text: r.text.trim(), mock: r.mock };
}

/**
 * Nhập bằng giọng nói cho M1/M7: bấm để nói → bấm lần nữa (hoặc hết 15 giây) để dừng → chữ đã chép
 * được đưa vào ô nhập để người học XEM và SỬA trước khi gửi (không tự gửi: STT có thể nghe nhầm).
 */
export interface VoiceInputOptions {
  /** Gọi thoại: tự dừng khi người học ngừng nói (SilenceDetector); không nói gì => lỗi no-speech */
  autoStop?: boolean;
}

export function useVoiceInput(onText: (t: Transcript) => void, createBridge?: () => Promise<AudioCaptureBridge>, options: VoiceInputOptions = {}) {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<VoiceError | null>(null);
  const [level, setLevel] = useState(0);
  const bridgeRef = useRef<AudioCaptureBridge | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const startedRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  // Ref thay vì đọc `status` trong closure: lượt sau của cuộc gọi không bị chặn bởi giá trị cũ
  const busyRef = useRef(false);
  const autoStop = options.autoStop === true;

  const stop = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    bridgeRef.current = null;
    window.clearTimeout(timerRef.current);
    setLevel(0);
    if (performance.now() - startedRef.current < MIN_VOICE_MS) {
      bridge.cancel();
      setError('too-short');
      setStatus('idle');
      busyRef.current = false;
      return;
    }
    setStatus('transcribing');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const [rec, { encodeWav }] = await Promise.all([bridge.finish(), import('@vietlearning/audio-dsp')]);
      const t = await transcribeWav(encodeWav(rec.pcm, rec.sampleRate), ac.signal);
      if (ac.signal.aborted) return;
      if (!t.text) setError('no-speech');
      else onTextRef.current(t);
    } catch (err) {
      if (ac.signal.aborted) return;
      const kind = (err as { kind?: string }).kind;
      setError(kind === 'offline' || kind === 'timeout' ? 'network' : 'failed');
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      if (!ac.signal.aborted) setStatus('idle');
      busyRef.current = false;
    }
  }, []);

  const start = useCallback(async () => {
    if (bridgeRef.current || busyRef.current) return;
    busyRef.current = true;
    setError(null);
    setStatus('starting');
    let bridge: AudioCaptureBridge | null = null;
    try {
      const b = createBridge
        ? await createBridge()
        : await import('@vietlearning/audio-dsp').then(({ AudioCaptureBridge, WebAudioDriver }) => new AudioCaptureBridge(new WebAudioDriver(16000, true)));
      bridge = b;
      bridgeRef.current = b;
      let n = 0;
      const detector = autoStop ? new SilenceDetector({ maxMs: MAX_VOICE_MS }) : null;
      await b.record((rms) => {
        if (++n % 8 === 0) setLevel(Math.min(1, rms * 6));
        if (!detector || bridgeRef.current !== b) return;
        const e = detector.push(rms, performance.now());
        if (e === 'end' || e === 'max') void stop();
        else if (e === 'no-speech') {
          bridgeRef.current = null;
          window.clearTimeout(timerRef.current);
          b.cancel();
          setLevel(0);
          setError('no-speech');
          setStatus('idle');
          busyRef.current = false;
        }
      });
      startedRef.current = performance.now();
      setStatus('recording');
      timerRef.current = window.setTimeout(() => void stop(), MAX_VOICE_MS);
    } catch (err) {
      bridgeRef.current = null;
      bridge?.cancel();
      const code = (err as { code?: string }).code;
      setError(code === 'permission-denied' || code === 'no-microphone' || code === 'unsupported' ? code : 'failed');
      setStatus('idle');
      busyRef.current = false;
    }
  }, [createBridge, autoStop, stop]);

  // Rời màn hình: tắt micro, hủy yêu cầu đang chạy
  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
      bridgeRef.current?.cancel();
      bridgeRef.current = null;
      abortRef.current?.abort();
    },
    []
  );

  /** Tắt micro, bỏ bản ghi và yêu cầu đang chạy (gác máy / đọc lại câu trả lời) — không gửi gì */
  const cancel = useCallback(() => {
    window.clearTimeout(timerRef.current);
    bridgeRef.current?.cancel();
    bridgeRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    busyRef.current = false;
    setLevel(0);
    setStatus('idle');
  }, []);

  return { status, error, level, start, stop, cancel, clearError: () => setError(null) };
}
