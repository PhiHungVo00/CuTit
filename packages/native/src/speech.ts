import { Capacitor } from '@capacitor/core';
import { acquireAudio } from '@vietlearning/shared/audio/focus';

/**
 * Năng lực "đọc văn bản tiếng Việt trên thiết bị" (Nguyên tắc 4: gọi speech.speak,
 * không gọi tên plugin/hãng). GoF Bridge: cùng một interface, hai bộ thực thi
 * - App Capacitor: TTS native của Android/iOS (WebView Android thường không có speechSynthesis)
 * - Trình duyệt: Web Speech API
 *
 * Chỉ dùng giọng tiếng Việt thật. Nếu thiết bị không có, ném lỗi 'no-vietnamese-voice'
 * để nơi gọi chuyển sang TTS của Gateway, thay vì đọc câu tiếng Việt bằng giọng tiếng Anh.
 */

export type SpeechErrorCode = 'unsupported' | 'no-vietnamese-voice' | 'interrupted' | 'failed';

export class SpeechError extends Error {
  constructor(public readonly code: SpeechErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'SpeechError';
  }
}

export interface SpeakOptions {
  /** 0.5 - 2.0, mặc định 1.0 */
  rate?: number;
  lang?: string;
}

export interface DeviceSpeech {
  /** Hoàn tất khi đọc xong. Bị thay bằng lượt mới hoặc stop() => reject SpeechError('interrupted'). */
  speak(text: string, options?: SpeakOptions): Promise<void>;
  stop(): Promise<void>;
  isAvailable(lang?: string): Promise<boolean>;
}

const VI = 'vi-VN';
const isVietnamese = (lang: string) => lang.toLowerCase().replace('_', '-').startsWith('vi');

/** Mỗi lượt đọc mang một token; kết quả của lượt cũ bị bỏ qua (sửa lỗi lượt cũ reset lượt mới). */
class TurnGuard {
  private current = 0;
  next(): number {
    return ++this.current;
  }
  invalidate(): void {
    this.current++;
  }
  isCurrent(token: number): boolean {
    return token === this.current;
  }
}

class NativeSpeech implements DeviceSpeech {
  private guard = new TurnGuard();
  /** Giữ "đang đọc" với điều phối âm thanh (nhạc nền tự dừng); luôn nhả khi xong/lỗi/hủy/bị thay. */
  private hold: (() => void) | null = null;
  private supportCache = new Map<string, boolean>();

  /**
   * KHÔNG được trả thẳng proxy plugin từ hàm async: Promise sẽ dò `.then` trên proxy, Capacitor coi
   * đó là lời gọi native "TextToSpeech.then()" => lỗi "not implemented on android" và lượt đọc treo.
   * Bọc trong object thường để tránh.
   */
  private async plugin(): Promise<{ tts: import('@capacitor-community/text-to-speech').TextToSpeechPlugin }> {
    const mod = await import('@capacitor-community/text-to-speech');
    return { tts: mod.TextToSpeech };
  }

  async isAvailable(lang = VI): Promise<boolean> {
    const cached = this.supportCache.get(lang);
    if (cached !== undefined) return cached;
    try {
      const { tts } = await this.plugin();
      const { supported } = await tts.isLanguageSupported({ lang });
      this.supportCache.set(lang, supported);
      return supported;
    } catch {
      return false;
    }
  }

  async speak(text: string, options: SpeakOptions = {}): Promise<void> {
    const lang = options.lang ?? VI;
    const token = this.guard.next();
    this.hold?.(); // lượt cũ bị thay
    const release = acquireAudio('speech');
    this.hold = release;
    try {
      const { tts } = await this.plugin();
      await tts.stop().catch(() => undefined);

      if (!(await this.isAvailable(lang))) {
        throw new SpeechError('no-vietnamese-voice', 'Thiết bị chưa cài giọng đọc tiếng Việt');
      }
      if (!this.guard.isCurrent(token)) throw new SpeechError('interrupted');

      try {
        await tts.speak({ text, lang, rate: options.rate ?? 1.0, pitch: 1.0, volume: 1.0, category: 'playback' });
      } catch (err) {
        if (!this.guard.isCurrent(token)) throw new SpeechError('interrupted');
        throw new SpeechError('failed', err instanceof Error ? err.message : String(err));
      }
      // Plugin resolve cả khi bị stop(): phân biệt bằng token
      if (!this.guard.isCurrent(token)) throw new SpeechError('interrupted');
    } finally {
      release();
      if (this.hold === release) this.hold = null;
    }
  }

  async stop(): Promise<void> {
    this.guard.invalidate();
    this.hold?.();
    this.hold = null;
    const { tts } = await this.plugin();
    await tts.stop().catch(() => undefined);
  }
}

class WebSpeech implements DeviceSpeech {
  private guard = new TurnGuard();
  private hold: (() => void) | null = null;
  private voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;

  private get synth(): SpeechSynthesis | null {
    return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  }

  /** getVoices() thường rỗng ở lần gọi đầu (Chrome nạp bất đồng bộ): chờ 'voiceschanged'. */
  private loadVoices(): Promise<SpeechSynthesisVoice[]> {
    const synth = this.synth;
    if (!synth) return Promise.resolve([]);
    const now = synth.getVoices();
    if (now.length) return Promise.resolve(now);
    this.voicesReady ??= new Promise((resolve) => {
      const done = () => {
        synth.removeEventListener('voiceschanged', done);
        resolve(synth.getVoices());
      };
      synth.addEventListener('voiceschanged', done);
      setTimeout(done, 1500);
    });
    return this.voicesReady;
  }

  private async findVoice(lang: string): Promise<SpeechSynthesisVoice | undefined> {
    const voices = await this.loadVoices();
    return (
      voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ??
      voices.find((v) => isVietnamese(v.lang))
    );
  }

  async isAvailable(lang = VI): Promise<boolean> {
    return Boolean(this.synth && (await this.findVoice(lang)));
  }

  async speak(text: string, options: SpeakOptions = {}): Promise<void> {
    const synth = this.synth;
    if (!synth) throw new SpeechError('unsupported');

    const lang = options.lang ?? VI;
    const token = this.guard.next();
    this.hold?.(); // lượt cũ bị thay
    const release = acquireAudio('speech');
    this.hold = release;
    try {
      synth.cancel();

      const voice = await this.findVoice(lang);
      if (!this.guard.isCurrent(token)) throw new SpeechError('interrupted');
      if (!voice) throw new SpeechError('no-vietnamese-voice', 'Trình duyệt không có giọng đọc tiếng Việt');

      await new Promise<void>((resolve, reject) => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = voice.lang;
        u.voice = voice;
        u.rate = options.rate ?? 1.0;
        u.onend = () => (this.guard.isCurrent(token) ? resolve() : reject(new SpeechError('interrupted')));
        u.onerror = (e) => {
          // cancel() bắn 'interrupted'/'canceled' cho lượt cũ: KHÔNG coi là lỗi cần dự phòng
          if (!this.guard.isCurrent(token) || e.error === 'interrupted' || e.error === 'canceled') {
            reject(new SpeechError('interrupted'));
          } else {
            reject(new SpeechError('failed', e.error));
          }
        };
        synth.speak(u);
      });
    } finally {
      release();
      if (this.hold === release) this.hold = null;
    }
  }

  async stop(): Promise<void> {
    this.guard.invalidate();
    this.hold?.();
    this.hold = null;
    this.synth?.cancel();
  }
}

export const isNativePlatform = (): boolean => Capacitor.isNativePlatform();

let instance: DeviceSpeech | null = null;

/** Singleton theo nền tảng đang chạy. */
export function getDeviceSpeech(): DeviceSpeech {
  instance ??= isNativePlatform() ? new NativeSpeech() : new WebSpeech();
  return instance;
}
