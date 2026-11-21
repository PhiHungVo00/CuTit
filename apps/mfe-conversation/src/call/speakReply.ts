/**
 * Đọc câu trả lời trong cuộc gọi (Nguyên tắc 4: gọi năng lực trừu tượng tts.synthesize qua Gateway, không gọi hãng).
 * 1. Gateway có TTS => phát audioUrl tốc độ chuẩn; nói chậm CHỈ bằng playbackRate 0.75 (không xin giọng chậm => không chậm hai lần).
 * 2. Gateway chưa có / lỗi / chậm quá 4 s => TTS của máy (nói chậm = rate thấp hơn). Gateway báo "chưa có" một lần
 *    thì cả cuộc gọi không hỏi lại.
 * 3. Luôn kết thúc trong watchdog (máy/headless có thể không bao giờ báo "đọc xong") => vòng gọi không bị treo.
 */
export interface SpeakerDeps {
  /** Trả audioUrl giọng tốc độ CHUẨN (một khóa cache), null = không có; ném lỗi kind 'unavailable' khi Gateway chưa có TTS */
  synth: (text: string) => Promise<string | null>;
  play: (url: string, rate: number) => Promise<void>;
  /** Dừng âm thanh máy chủ đang phát (watchdog, gác máy) */
  stopPlayback?: () => void;
  device: { speak(text: string, o?: { rate?: number }): Promise<void>; stop(): Promise<void> };
  /** tốc độ đọc của máy theo tùy chỉnh người học (speechRate) */
  deviceRate: (base: number) => number;
  /** Gọi ngay trước khi nói (âm hiệu "Cu Tít sắp nói") */
  announce?: () => void;
}

export type SpokenBy = 'server' | 'device' | 'none';

const SYNTH_TIMEOUT_MS = 4000;

export function speakTimeoutMs(text: string, slow: boolean): number {
  return Math.round(Math.max(3000, 90 * text.length) * (slow ? 1.4 : 1));
}

const within = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => (clearTimeout(id), resolve(v)),
      (e) => (clearTimeout(id), reject(e))
    );
  });

export function createSpeaker(deps: SpeakerDeps) {
  let serverTts = true;
  return async function speak(text: string, { slow }: { slow: boolean }): Promise<SpokenBy> {
    const deadline = speakTimeoutMs(text, slow);
    deps.announce?.();
    const attempt = async (): Promise<SpokenBy> => {
      if (serverTts) {
        try {
          const url = await within(deps.synth(text), SYNTH_TIMEOUT_MS);
          if (url) {
            await deps.play(url, slow ? 0.75 : 1);
            return 'server';
          }
        } catch (err) {
          if ((err as { kind?: string }).kind === 'unavailable') serverTts = false;
        }
      }
      await deps.device.speak(text, { rate: deps.deviceRate(slow ? 0.7 : 0.95) });
      return 'device';
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watchdog = new Promise<SpokenBy>((resolve) => {
      timer = setTimeout(() => {
        deps.stopPlayback?.();
        void deps.device.stop().catch(() => undefined);
        resolve('none');
      }, deadline);
    });
    try {
      return await Promise.race([attempt().catch((): SpokenBy => 'none'), watchdog]);
    } finally {
      clearTimeout(timer);
    }
  };
}
