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
}

export interface SttProvider {
  readonly name: string;
  transcribe(audio: { bytes: Buffer; mimetype: string }): Promise<SttResult>;
}

class LlmSttProvider implements SttProvider {
  readonly name: string;
  constructor(private readonly llm: LlmProvider) {
    this.name = `${llm.name}-stt`;
  }
  transcribe(audio: { bytes: Buffer; mimetype: string }): Promise<SttResult> {
    return transcribe(this.llm, audio);
  }
}

/** Có LLM đa phương thức => STT qua LLM; không có => null (nơi gọi trả mock: true) */
export function createSttProvider(llm: LlmProvider | null): SttProvider | null {
  return llm ? new LlmSttProvider(llm) : null;
}
