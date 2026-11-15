/**
 * Dịch vụ Phát Âm Tiếng Việt (TTS) cho Màn hình M3 (Honorific Matrix)
 *
 * Thứ tự: giọng đọc tiếng Việt của thiết bị (TTS native trong app Capacitor, Web Speech
 * trên trình duyệt) -> TTS của Gateway (/v1/speech/synthesize) -> báo lỗi thật cho UI.
 *
 * Sửa so với bản cũ:
 * - Mỗi lượt đọc có token: lượt cũ bị hủy không còn kích hoạt dự phòng hay reset trạng thái lượt mới.
 * - Không đọc câu tiếng Việt bằng giọng tiếng Anh khi thiết bị thiếu giọng Việt.
 * - Không "giả vờ đọc 1.2 giây" khi mọi đường đều hỏng: gọi onError để UI thông báo.
 */
import { getDeviceSpeech, SpeechError } from '@vietlearning/native';

export type SpeechFailure = 'no-voice-available' | 'network' | 'playback';

export interface SpeechOptions {
  speed?: number; // 0.8 | 1.0 | 1.2
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: { code: SpeechFailure; message: string }) => void;
}

function gatewayBaseUrl(): string {
  const fromWindow = typeof window !== 'undefined' ? (window as { __GATEWAY_URL__?: string }).__GATEWAY_URL__ : undefined;
  const fromEnv = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_GATEWAY_URL;
  return (fromWindow || fromEnv || 'http://localhost:4000').replace(/\/$/, '');
}

class SpeechService {
  private turn = 0;
  private audio: HTMLAudioElement | null = null;
  private speaking = false;

  public isSpeaking(): boolean {
    return this.speaking;
  }

  public stop(): void {
    this.turn++;
    this.speaking = false;
    void getDeviceSpeech().stop();
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
  }

  public async speak(text: string, options: SpeechOptions = {}): Promise<void> {
    this.stop();
    const token = ++this.turn;
    const isCurrent = () => token === this.turn;
    this.speaking = true;
    options.onStart?.();

    const finish = () => {
      if (!isCurrent()) return;
      this.speaking = false;
      options.onEnd?.();
    };
    const fail = (code: SpeechFailure, message: string) => {
      if (!isCurrent()) return;
      this.speaking = false;
      console.warn(`[SpeechService] ${code}: ${message}`);
      options.onError?.({ code, message });
    };

    // 1. Giọng đọc của thiết bị
    try {
      await getDeviceSpeech().speak(text, { rate: options.speed ?? 1.0, lang: 'vi-VN' });
      finish();
      return;
    } catch (err) {
      if (!isCurrent()) return;
      const code = err instanceof SpeechError ? err.code : 'failed';
      if (code === 'interrupted') return;
      // 'unsupported' | 'no-vietnamese-voice' | 'failed' => thử Gateway
    }

    // 2. TTS của Gateway
    try {
      const res = await fetch(`${gatewayBaseUrl()}/v1/speech/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId: 'vi-VN-Standard-A', speed: options.speed ?? 1.0, dialect: 'north' })
      });
      if (!isCurrent()) return;
      if (!res.ok) {
        fail('no-voice-available', `Thiết bị không có giọng tiếng Việt và Gateway trả về ${res.status}`);
        return;
      }
      const data: { audioUrl?: string } = await res.json();
      if (!data.audioUrl) {
        fail('no-voice-available', 'Gateway không trả về audioUrl');
        return;
      }
      if (!isCurrent()) return;

      const audio = new Audio(data.audioUrl);
      this.audio = audio;
      audio.onended = finish;
      audio.onerror = () => fail('playback', 'Không phát được file âm thanh');
      await audio.play();
    } catch (err) {
      fail('network', err instanceof Error ? err.message : String(err));
    }
  }
}

export const speechService = new SpeechService();
