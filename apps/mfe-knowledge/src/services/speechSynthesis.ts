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

/**
 * Gọi TTS của Gateway qua client chung (kiểm tra contract, lỗi chuẩn hóa). Import LƯỜI: client kéo theo
 * Zod (~13 KB) nên chỉ tải khi thiết bị không có giọng Việt, không làm nặng chunk M3.
 */
async function synthesizeViaGateway(text: string, speed: number): Promise<string> {
  const [{ request }, { SynthesizeResponseSchema }] = await Promise.all([
    import('@vietlearning/api-client'),
    import('@vietlearning/contracts/api')
  ]);
  const data = await request('/v1/speech/synthesize', {
    body: { text, voiceId: 'vi-VN-Standard-A', speed, dialect: 'north' },
    schema: SynthesizeResponseSchema
  });
  return data.audioUrl;
}

class SpeechService {
  private turn = 0;
  private audio: HTMLAudioElement | null = null;
  private speaking = false;

  public isSpeaking(): boolean {
    return this.speaking;
  }

  /** onEnd của lượt đang đọc: gọi khi lượt bị dừng/thay thế để UI của nơi gọi cũ không kẹt "Đang đọc". */
  private notifyInterrupted: (() => void) | null = null;

  public stop(): void {
    this.turn++;
    this.speaking = false;
    const notify = this.notifyInterrupted;
    this.notifyInterrupted = null;
    notify?.();
    getDeviceSpeech()
      .stop()
      .catch((err) => console.warn('[SpeechService] stop lỗi', err));
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
    this.notifyInterrupted = options.onEnd ?? null;
    options.onStart?.();

    const finish = () => {
      if (!isCurrent()) return;
      this.speaking = false;
      this.notifyInterrupted = null;
      options.onEnd?.();
    };
    const fail = (code: SpeechFailure, message: string) => {
      if (!isCurrent()) return;
      this.speaking = false;
      this.notifyInterrupted = null;
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
    let audioUrl: string;
    try {
      audioUrl = await synthesizeViaGateway(text, options.speed ?? 1.0);
    } catch (err) {
      if (!isCurrent()) return;
      const kind = (err as { kind?: string }).kind;
      if (kind === 'offline' || kind === 'timeout') fail('network', String(err));
      else fail('no-voice-available', `Thiết bị không có giọng tiếng Việt và Gateway lỗi (${kind ?? 'không rõ'})`);
      return;
    }
    if (!isCurrent()) return;

    try {
      const audio = new Audio(audioUrl);
      this.audio = audio;
      audio.onended = finish;
      audio.onerror = () => fail('playback', 'Không phát được file âm thanh');
      await audio.play();
    } catch (err) {
      fail('playback', err instanceof Error ? err.message : String(err));
    }
  }
}

export const speechService = new SpeechService();
