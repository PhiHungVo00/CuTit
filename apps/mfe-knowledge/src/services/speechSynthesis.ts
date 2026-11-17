/**
 * Dịch vụ Phát Âm Tiếng Việt (TTS) Đa Tầng cho Màn hình M3 (Honorific Matrix)
 * Tối ưu hóa đặc biệt cho thiết bị Di Động (iOS Safari & Android Chrome):
 * 1. Mở khóa AudioContext và phát âm chuông ngũ cung dân gian (Folk Chime) ngay tại touch gesture.
 * 2. Ưu tiên HTML5 Audio phát MP3 tiếng Việt chuẩn tự nhiên qua Gateway Stream / Vite Proxy.
 * 3. Dự phòng trực tiếp Cloud TTS Stream (No-Referrer policy).
 * 4. Dự phòng Web Speech API (vi-VN) với window.speechSynthesis.resume().
 */

export interface SpeechOptions {
  speed?: number; // 0.8 | 1.0 | 1.2
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
 * Phát âm chuông ngũ cung dân gian Việt Nam (C5 - E5 - G5)
 * Vừa tạo cảm giác truyền thống sân đình, vừa mở khóa âm thanh cho iOS/Android ngay tức thì.
 */
export function playFolkChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Chuỗi 3 nốt ngũ cung ấm áp (523.25Hz, 659.25Hz, 783.99Hz)
    const notes = [523.25, 659.25, 783.99];
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
  } catch (e) {
    // Non-fatal
  }
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

    // 1. Kích hoạt chuông mở khóa âm thanh phần cứng
    playFolkChime();

    // 2. Danh sách các nguồn phát âm tiếng Việt chất lượng cao (HTML5 Audio)
    const encoded = encodeURIComponent(text);
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

    const audioCandidates = [
      // Kênh 1: Qua Vite dev proxy (hoạt động hoàn hảo trên mọi thiết bị cùng mạng Wi-Fi)
      `/api/speech/stream?text=${encoded}`,
      // Kênh 2: Trực tiếp tới Gateway cổng 4000
      `http://${hostname}:4000/api/speech/stream?text=${encoded}`,
      // Kênh 3: Dự phòng Cloud TTS trực tiếp (nhờ <meta name="referrer" content="no-referrer">)
      `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encoded}`
    ];

    // Thử lần lượt các nguồn phát HTML5 Audio
    for (const url of audioCandidates) {
      const success = await this.playAudioElement(url, options);
      if (success) {
        return;
      }
    }

    // 3. Dự phòng Web Speech API của trình duyệt
    const webSpeechSuccess = await this.speakViaWebSpeechAPI(text, options);
    if (webSpeechSuccess) {
      return;
    }

    // 4. Nếu mọi phương án đều thất bại (ví dụ thiết bị tắt mạng hoàn toàn), kết thúc sau 1.5s
    console.warn('[SpeechService] Không thể phát âm thanh từ bất kỳ nguồn nào');
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

        // Timeout 6 giây nếu kết nối mạng bị treo
        const timer = setTimeout(() => done(false), 6000);

        audio.onended = () => {
          clearTimeout(timer);
          done(true);
        };

        audio.onerror = (e) => {
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
      } catch (err) {
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
        // Đảm bảo không bị kẹt trạng thái paused trên Safari
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'vi-VN';
        utterance.rate = options.speed ?? 1.0;
        utterance.pitch = 1.0;

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

        utterance.onerror = () => {
          resolve(false);
        };

        this.currentUtterance = utterance;
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        resolve(false);
      }
    });
  }
}

export const speechService = new SpeechService();
