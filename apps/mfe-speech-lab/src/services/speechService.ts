/**
 * Dịch vụ Phát Âm Tiếng Việt (TTS) cho mfe-speech-lab (Màn hình M2 & M6)
 * Hỗ trợ phát âm chuẩn toàn dân và giọng đọc đặc trưng 3 miền Bắc - Trung - Nam.
 */

export interface SpeechOptions {
  speed?: number; // 0.5 | 0.75 | 1.0
  dialect?: 'north' | 'central' | 'south';
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: any) => void;
}

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioCtx();
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

/**
 * Mở khóa âm thanh phần cứng & phát chuông ngũ cung dân gian (Folk Chime)
 */
export function playFolkChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const notes = [523.25, 659.25, 783.99]; // C5 - E5 - G5 (Hò - Xự - Xang)
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);
      gain.gain.setValueAtTime(0.06, now + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.07 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.22);
    });
  } catch (e) {}
}

class SpeechService {
  private currentAudio: HTMLAudioElement | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private speaking = false;

  public isSpeaking(): boolean {
    return this.speaking;
  }

  public stop(): void {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (e) {}
      this.currentAudio = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }

    this.speaking = false;
  }

  public async speak(text: string, options: SpeechOptions = {}): Promise<void> {
    this.stop();
    this.speaking = true;
    options.onStart?.();

    // 1. Mở khóa âm thanh bằng chuông dân gian
    playFolkChime();

    const encoded = encodeURIComponent(text);
    const dialect = options.dialect || 'north';
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

    const candidates = [
      // Kênh 1: Qua Vite dev proxy tới Gateway 4000
      `/api/speech/stream?text=${encoded}&dialect=${dialect}`,
      // Kênh 2: Trực tiếp Gateway LAN
      `http://${hostname}:4000/api/speech/stream?text=${encoded}&dialect=${dialect}`,
      // Kênh 3: Dự phòng Cloud TTS
      `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encoded}`
    ];

    for (const url of candidates) {
      const success = await this.playAudioElement(url, options);
      if (success) return;
    }

    // Dự phòng Web Speech API
    const webSpeechSuccess = await this.speakViaWebSpeechAPI(text, options);
    if (webSpeechSuccess) return;

    // Timeout kết thúc giả lập nếu offline hoàn toàn
    setTimeout(() => {
      this.speaking = false;
      options.onEnd?.();
    }, 1500);
  }

  private playAudioElement(url: string, options: SpeechOptions): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const audio = new Audio();
        audio.preload = 'auto';
        (audio as any).referrerPolicy = 'no-referrer';
        this.currentAudio = audio;

        let resolved = false;
        const done = (success: boolean) => {
          if (!resolved) {
            resolved = true;
            if (this.currentAudio === audio) {
              this.currentAudio = null;
            }
            if (success) {
              this.speaking = false;
              options.onEnd?.();
            }
            resolve(success);
          }
        };

        const timer = setTimeout(() => done(false), 6000);

        audio.onended = () => {
          clearTimeout(timer);
          done(true);
        };

        audio.onerror = () => {
          clearTimeout(timer);
          done(false);
        };

        audio.src = url;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            clearTimeout(timer);
            done(false);
          });
        }
      } catch (e) {
        resolve(false);
      }
    });
  }

  private speakViaWebSpeechAPI(text: string, options: SpeechOptions): Promise<boolean> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        resolve(false);
        return;
      }

      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'vi-VN';
        if (options.dialect === 'south') {
          utterance.rate = (options.speed ?? 1.0) * 1.05;
          utterance.pitch = 1.08;
        } else if (options.dialect === 'central') {
          utterance.rate = (options.speed ?? 1.0) * 0.92;
          utterance.pitch = 0.92;
        } else {
          utterance.rate = options.speed ?? 1.0;
          utterance.pitch = 1.0;
        }

        const voices = window.speechSynthesis.getVoices();
        const viVoice = voices.find(
          (v) =>
            v.lang.toLowerCase().includes('vi') ||
            v.lang.toLowerCase().includes('vie') ||
            v.name.toLowerCase().includes('vietnam')
        );
        if (viVoice) {
          utterance.voice = viVoice;
        }

        utterance.onend = () => {
          this.speaking = false;
          options.onEnd?.();
          resolve(true);
        };

        utterance.onerror = () => resolve(false);

        this.currentUtterance = utterance;
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        resolve(false);
      }
    });
  }
}

export const speechService = new SpeechService();
