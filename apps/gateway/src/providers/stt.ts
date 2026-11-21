import type { LlmProvider } from './llm.js';
import { transcribe } from '../services/ai/tasks.js';

/**
 * Năng lực "chép lời giọng nói" trừu tượng (Nguyên tắc 4): code nghiệp vụ gọi `stt.transcribe`,
 * không gọi tên hãng. Hiện dùng mô hình đa phương thức qua LlmProvider (Gemini); đổi sang dịch vụ STT
 * chuyên dụng = thêm một lớp implements SttProvider + sửa createSttProvider.
 */
export interface SttResult {
  text: string;
  confidence: number;
  /** token nhà cung cấp tính (đối soát quota), 0 nếu không có */
  tokens: number;
  /** nguồn đã trả lời (chỉ tên, không chứa khóa) */
  provider?: string;
}

export interface SttProvider {
  readonly name: string;
  /** `timeoutMs`: ngân sách thời gian do chuỗi dự phòng cấp cho lần gọi này */
  transcribe(audio: { bytes: Buffer; mimetype: string; timeoutMs?: number }): Promise<SttResult>;
}

class LlmSttProvider implements SttProvider {
  readonly name: string;
  constructor(private readonly llm: LlmProvider) {
    this.name = `${llm.name}-stt`;
  }
  async transcribe(audio: { bytes: Buffer; mimetype: string; timeoutMs?: number }): Promise<SttResult> {
    return { ...(await transcribe(this.llm, audio, audio.timeoutMs)), provider: this.name };
  }
}

/**
 * STT qua máy chủ kiểu OpenAI `POST {base}/audio/transcriptions` (vd. `tools/tts-local` chạy faster-whisper trên máy).
 * Hiện chỉ script dựng sẵn âm thanh dùng để kiểm lời đọc (không tốn hạn mức Gemini).
 */
export class OpenAiCompatSttProvider implements SttProvider {
  readonly name = 'openai-compatible-stt';
  constructor(
    private readonly baseUrl: string,
    private readonly language = 'vi',
    private readonly timeoutMs = 120_000,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async transcribe(audio: { bytes: Buffer; mimetype: string; timeoutMs?: number }): Promise<SttResult> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio.bytes)], { type: audio.mimetype }), 'audio.wav');
    form.append('language', this.language);
    form.append('model', 'whisper');
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, '')}/audio/transcriptions`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!res.ok) throw new Error(`STT lỗi (${res.status})`);
    const json = (await res.json()) as { text?: unknown };
    if (typeof json.text !== 'string') throw new Error('STT không trả text');
    return { text: json.text, confidence: 1, tokens: 0 };
  }
}

/** Có LLM đa phương thức => STT qua LLM; không có => null (nơi gọi trả mock: true) */
export function createSttProvider(llm: LlmProvider | null): SttProvider | null {
  return llm ? new LlmSttProvider(llm) : null;
}
