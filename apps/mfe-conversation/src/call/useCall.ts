import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { NewWord } from '@vietlearning/contracts/api';
import { getDeviceSpeech, grabFrame } from '@vietlearning/native';
import { playSfx } from '@vietlearning/shared/audio';
import { acquireAudio } from '@vietlearning/shared/audio/focus';
import { learnerStore, speechRate } from '@vietlearning/state';
import { useChatSession } from '../chat/useChatSession';
import { useVoiceInput } from '../chat/useVoiceInput';
import { callReducer, initialCall, type CameraOffReason } from './callMachine';
import { createSpeaker, type SpeakerDeps } from './speakReply';
import { useThinkingFiller } from './thinkingFiller';

/** Lượt có ảnh: `send` của useChatSession nhận thêm `imageBase64` (Task 5–6); kiểu ở đây khai riêng để call/ không sửa chat/** */
type SendWithImage = (text: string, opts?: { imageBase64?: string }) => Promise<void>;

/** Gọi /v1/speech/synthesize (Gateway quyết định nhà cung cấp TTS); 503 => kind 'unavailable' */
async function synth(text: string): Promise<string | null> {
  const [{ request }, { SynthesizeResponseSchema }] = await Promise.all([import('@vietlearning/api-client'), import('@vietlearning/contracts/api')]);
  const { preferences } = learnerStore.getState();
  const r = await request('/v1/speech/synthesize', {
    body: { text: text.slice(0, 500), voiceId: preferences.voiceId, speed: 1, dialect: preferences.dialect },
    schema: SynthesizeResponseSchema
  });
  return r.audioUrl;
}

/** Âm thanh máy chủ đang phát (để gác máy / watchdog dừng được) */
let current: HTMLAudioElement | null = null;

function stopPlayback(): void {
  current?.pause();
  current = null;
}

function play(url: string, rate: number): Promise<void> {
  return new Promise((resolve, reject) => {
    stopPlayback();
    const audio = new Audio(url);
    current = audio;
    audio.playbackRate = rate;
    (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    audio.onended = () => {
      if (current === audio) current = null;
      resolve();
    };
    audio.onerror = () => reject(new Error('audio_error'));
    audio.play().catch(reject);
  });
}

// Micro không dùng được, hoặc hết thời lượng nhận giọng nói hôm nay => gõ chữ để gọi tiếp (lượt chat vẫn còn)
const VOICE_TO_TEXT = new Set(['permission-denied', 'no-microphone', 'unsupported', 'quota']);

/** Điều phối một cuộc gọi: micro (tự dừng) → STT → lượt chat mode 'call' → đọc trả lời → nghe tiếp. */
export function useCall(deps?: Partial<SpeakerDeps>, _opts: { video?: boolean } = {}) {
  const [state, dispatch] = useReducer(callReducer, initialCall);
  const [words, setWords] = useState<NewWord[]>([]);
  const [turnsLeft, setTurnsLeft] = useState<number | null>(null);
  const [slow, setSlow] = useState(false);
  const lastReply = useRef('');
  const callHold = useRef<(() => void) | null>(null);
  const videoEl = useRef<HTMLVideoElement | null>(null);
  // Khung hình chụp lúc người học vừa ngừng nói, chờ gửi cùng câu chép lời (null = lỗi/không có)
  const frame = useRef<Promise<string | null> | null>(null);
  const slowRef = useRef(slow);
  slowRef.current = slow;

  const speak = useMemo(
    () => createSpeaker({ synth, play, stopPlayback, device: getDeviceSpeech(), deviceRate: (b) => speechRate(b), announce: () => playSfx('cutit-noi'), ...deps }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const session = useChatSession({
    mode: 'call',
    onTurnDone: (r) => {
      lastReply.current = r.reply;
      setWords((w) => [...w, ...r.newWords]);
      if (typeof r.turnsLeft === 'number') setTurnsLeft(r.turnsLeft);
      dispatch({ type: 'THOUGHT' });
    }
  });

  const voice = useVoiceInput(({ text }) => dispatch({ type: 'HEARD', text }), undefined, { autoStop: true });

  // Gọi video: người học vừa ngừng nói (đang ghi → đang chép lời) ⇒ chụp ĐÚNG 1 khung hình cho lượt này
  const prevVoice = useRef(voice.status);
  useEffect(() => {
    const was = prevVoice.current;
    prevVoice.current = voice.status;
    if (was === 'recording' && voice.status === 'transcribing' && state.video && videoEl.current) {
      frame.current = grabFrame(videoEl.current).then(
        (f) => f.base64,
        () => null
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.status]);

  // Chờ AI > 1 200 ms ⇒ "ừm" một lần (giọng máy, ngắn) để cuộc gọi không im lặng
  useThinkingFiller(state.phase, () => void getDeviceSpeech().speak('ừm', { rate: speechRate(1) }).catch(() => undefined));

  // Cả cuộc gọi báo điều phối âm thanh là "đang bận" (nhạc nền tắt từ lúc bắt đầu tới khi gác máy/rời màn)
  useEffect(() => {
    const inCall = state.phase !== 'idle' && state.phase !== 'ended';
    if (inCall && !callHold.current) callHold.current = acquireAudio('call');
    if (!inCall) {
      callHold.current?.();
      callHold.current = null;
    }
  }, [state.phase]);
  useEffect(
    () => () => {
      callHold.current?.();
      callHold.current = null;
    },
    []
  );

  // Hạn mức hôm nay (để hiện "còn N lượt"); lỗi thì bỏ qua — lượt đầu sẽ cập nhật
  useEffect(() => {
    void (async () => {
      try {
        const [{ request }, { QuotaStatusSchema }] = await Promise.all([import('@vietlearning/api-client'), import('@vietlearning/contracts/api')]);
        const q = await request('/v1/quota', { method: 'GET', schema: QuotaStatusSchema });
        setTurnsLeft((cur) => cur ?? Math.max(0, q.turns.limit - q.turns.used));
      } catch {
        /* offline / Gateway cũ */
      }
    })();
  }, []);

  // listening => mở micro
  useEffect(() => {
    if (state.phase === 'listening') void voice.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.turns]);

  // thinking => gửi lượt
  useEffect(() => {
    if (state.phase !== 'thinking' || !state.pendingText) return;
    // Gửi lại sau lỗi: session.retry không thêm lại câu của người học vào hội thoại/lịch sử
    if (state.retry) {
      session.retry();
      return;
    }
    const text = state.pendingText;
    const pending = state.video ? frame.current : null;
    frame.current = null;
    void (async () => {
      const imageBase64 = (await pending) ?? undefined;
      void (session.send as SendWithImage)(text, imageBase64 ? { imageBase64 } : undefined);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.pendingText, state.retry]);

  // speaking => đọc (micro đã tắt), xong (hoặc watchdog) thì nghe tiếp
  useEffect(() => {
    if (state.phase !== 'speaking') return;
    let live = true;
    void speak(lastReply.current, { slow: slowRef.current }).then(() => live && dispatch({ type: 'SPOKEN' }));
    return () => {
      live = false;
    };
  }, [state.phase, state.turns, speak]);

  // lỗi lượt chat
  useEffect(() => {
    if (session.error) dispatch({ type: 'TURN_FAILED', quota: session.errorCode === 'quota_exceeded', message: session.error });
  }, [session.error, session.errorCode]);

  // lỗi micro
  useEffect(() => {
    const e = voice.error;
    if (!e) return;
    if (VOICE_TO_TEXT.has(e)) dispatch({ type: 'MIC_FAILED', error: e });
    else dispatch({ type: 'NO_SPEECH' });
  }, [voice.error]);

  // gác máy / rời màn: tắt micro, dừng đọc, hủy lượt
  useEffect(() => {
    if (state.phase === 'ended') {
      voice.cancel();
      session.cancel();
      stopPlayback();
      void getDeviceSpeech().stop().catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);
  useEffect(
    () => () => {
      stopPlayback();
      void getDeviceSpeech().stop().catch(() => undefined);
    },
    []
  );

  const replaySlow = useCallback(() => {
    setSlow(true);
    slowRef.current = true;
    voice.cancel();
    dispatch({ type: 'REPLAY' });
  }, [voice]);

  const setVideoElement = useCallback((v: HTMLVideoElement | null) => {
    videoEl.current = v;
  }, []);
  const onCameraOff = useCallback((reason: CameraOffReason) => {
    frame.current = null;
    dispatch({ type: 'CAMERA_OFF', reason });
  }, []);

  return { state, dispatch, setVideoElement, onCameraOff, session, voice, words, turnsLeft, slow, setSlow, replaySlow };
}
