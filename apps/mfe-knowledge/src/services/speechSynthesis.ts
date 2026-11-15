/**
 * Dịch vụ Phát Âm Tiếng Việt (TTS) cho Màn hình M3 (Honorific Matrix)
 * Ưu tiên Web Speech API (Client) và dự phòng gọi Gateway /v1/speech/synthesize
 */

export interface SpeechOptions {
  speed?: number; // 0.8 | 1.0 | 1.2
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: any) => void;
}

class SpeechService {
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private speaking = false;

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  public isSpeaking(): boolean {
    return this.speaking;
  }

  public stop(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    this.speaking = false;
  }

  public async speak(text: string, options: SpeechOptions = {}): Promise<void> {
    this.stop();
    this.speaking = true;
    options.onStart?.();

    const speed = options.speed ?? 1.0;

    // 1. Thử Web Speech API của trình duyệt trước
    if (this.isSupported()) {
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'vi-VN';
        utterance.rate = speed;
        utterance.pitch = 1.0;

        // Tìm voice tiếng Việt nếu có
        const voices = window.speechSynthesis.getVoices();
        const viVoice = voices.find(v => v.lang.toLowerCase().includes('vi'));
        if (viVoice) {
          utterance.voice = viVoice;
        }

        utterance.onend = () => {
          this.speaking = false;
          options.onEnd?.();
        };

        utterance.onerror = async (event) => {
          console.warn('[SpeechService] Web Speech API lỗi hoặc không hỗ trợ tiếng Việt, chuyển sang dự phòng Gateway:', event);
          await this.speakViaGateway(text, options);
        };

        this.currentUtterance = utterance;
        window.speechSynthesis.speak(utterance);
        return;
      } catch (err) {
        console.warn('[SpeechService] Không thể kích hoạt Web Speech API, chuyển sang dự phòng Gateway:', err);
      }
    }

    // 2. Dự phòng Gateway SaaS /v1/speech/synthesize
    await this.speakViaGateway(text, options);
  }

  private async speakViaGateway(text: string, options: SpeechOptions): Promise<void> {
    const gatewayBase =
      (typeof window !== 'undefined' && (window as any).__GATEWAY_URL__) ||
      (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GATEWAY_URL) ||
      'http://localhost:4000';

    const endpoints = [`${gatewayBase}/v1/speech/synthesize`];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voiceId: 'vi-VN-Standard-A',
            speed: options.speed ?? 1.0,
            dialect: 'north'
          })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.audioUrl) {
            const audio = new Audio(data.audioUrl);
            this.currentAudio = audio;
            audio.onended = () => {
              this.speaking = false;
              options.onEnd?.();
            };
            audio.onerror = () => {
              this.speaking = false;
              options.onEnd?.();
            };
            await audio.play();
            return;
          }
        }
      } catch (e) {
        console.warn(`[SpeechService] Không thể kết nối tới ${endpoint}, thử phương án tiếp theo:`, e);
      }
    }

    // Nếu cả Web Speech API lẫn Gateway đều không khả dụng, hoàn tất sau 1.2s mô phỏng đọc
    console.log('[SpeechService] Hoàn tất mô phỏng đọc câu mẫu tiếng Việt:', text);
    setTimeout(() => {
      this.speaking = false;
      options.onEnd?.();
    }, 1200);
  }
}

export const speechService = new SpeechService();
