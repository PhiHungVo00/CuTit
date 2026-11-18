import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { NewWord } from '@vietlearning/contracts/api';
import { getDeviceSpeech } from '@vietlearning/native';
import { learnerStore, speechRate } from '@vietlearning/state';
import { useChatSession } from '../chat/useChatSession';
import { useVoiceInput } from '../chat/useVoiceInput';
import { callReducer, initialCall } from './callMachine';
import { createSpeaker, type SpeakerDeps } from './speakReply';

/** Gọi /v1/speech/synthesize (Gateway quyết định nhà cung cấp TTS); 503 => kind 'unavailable' */
async function synth(text: string, slow: boolean): Promise<string | null> {
  const [{ request }, { SynthesizeResponseSchema }] = await Promise.all([import('@vietlearning/api-client'), import('@vietlearning/contracts/api')]);
  const { preferences } = learnerStore.getState();
  const r = await request('/v1/speech/synthesize', {
    body: { text: text.slice(0, 500), voiceId: preferences.voiceId, speed: slow ? 0.75 : 1, dialect: preferences.dialect },
    schema: SynthesizeResponseSchema
  });
  return r.audioUrl;
}

function play(url: string, rate: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.playbackRate = rate;
    (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error('audio_error'));
    audio.play().catch(reject);
  });
}

const VOICE_TO_TEXT = new Set(['permission-denied', 'no-microphone', 'unsupported']);

/** Điều phối một cuộc gọi: micro (tự dừng) → STT → lượt chat mode 'call' → đọc trả lời → nghe tiếp. */
export function useCall(deps?: Partial<SpeakerDeps>) {
  const [state, dispatch] = useReducer(callReducer, initialCall);
  const [words, setWords] = useState<NewWord[]>([]);
  const [turnsLeft, setTurnsLeft] = useState<number | null>(null);
  const [slow, setSlow] = useState(false);
  const lastReply = useRef('');
  const slowRef = useRef(slow);
  slowRef.current = slow;

  const speak = useMemo(
    () => createSpeaker({ synth, play, device: getDeviceSpeech(), deviceRate: (b) => speechRate(b), ...deps }),
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
    if (state.phase === 'thinking' && state.pendingText) void session.send(state.pendingText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.pendingText]);

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
      void getDeviceSpeech().stop().catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);
  useEffect(
    () => () => {
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

  return { state, dispatch, session, voice, words, turnsLeft, slow, setSlow, replaySlow };
}
