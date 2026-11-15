import type { GatewayConfig } from '../config.js';
import { GatewayError } from '../pipeline/RequestPipeline.js';

/**
 * Năng lực "sinh JSON có cấu trúc" trừu tượng (Nguyên tắc 4): code nghiệp vụ gọi `llm.generateJson`,
 * không gọi tên hãng. Đổi nhà cung cấp = thêm một lớp implements LlmProvider + sửa createLlmProvider.
 * Đầu ra luôn là JSON theo schema; nơi gọi BẮT BUỘC xác thực lại bằng Zod (Nguyên tắc 6).
 */
export type LlmPart = { text: string } | { inline: { mimeType: string; base64: string } };

export interface LlmTurn {
  role: 'user' | 'model';
  parts: LlmPart[];
}

export interface JsonRequest {
  system: string;
  turns: LlmTurn[];
  /** Schema đầu ra (tập con OpenAPI 3: type, properties, required, items, enum, nullable) */
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface JsonResult {
  json: unknown;
  /** tổng token thật nhà cung cấp tính (để đối soát quota) */
  tokens: number;
}

export interface LlmProvider {
  readonly name: string;
  generateJson(req: JsonRequest): Promise<JsonResult>;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  usageMetadata?: { totalTokenCount?: number };
  promptFeedback?: { blockReason?: string };
}

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Bộ điều hợp Gemini (REST generateContent). Khóa gửi qua header, không bao giờ nằm trong URL hay log. */
export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async generateJson(req: JsonRequest): Promise<JsonResult> {
    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.turns.map((t) => ({
        role: t.role,
        parts: t.parts.map((p) => ('text' in p ? { text: p.text } : { inlineData: { mimeType: p.inline.mimeType, data: p.inline.base64 } }))
      })),
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: req.schema,
        maxOutputTokens: req.maxOutputTokens ?? 1024,
        temperature: req.temperature ?? 0.6
      }
    };

    let res: Response;
    try {
      res = await this.fetchImpl(`${ENDPOINT}/${this.model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (err) {
      const timeout = (err as Error).name === 'TimeoutError' || (err as Error).name === 'AbortError';
      throw new GatewayError(timeout ? 504 : 502, timeout ? 'llm_timeout' : 'llm_unavailable', timeout ? 'Dịch vụ AI phản hồi quá lâu' : 'Không kết nối được dịch vụ AI');
    }

    if (!res.ok) {
      // Không chuyển nguyên văn lỗi nhà cung cấp xuống client (có thể lộ chi tiết cấu hình)
      const status = res.status === 429 ? 503 : 502;
      throw new GatewayError(status, res.status === 429 ? 'llm_busy' : 'llm_unavailable', `Dịch vụ AI lỗi (${res.status})`);
    }

    const data = (await res.json()) as GeminiResponse;
    if (data.promptFeedback?.blockReason) throw new GatewayError(422, 'llm_blocked', 'Nội dung bị bộ lọc an toàn từ chối');
    const text = data.candidates?.[0]?.content?.parts?.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('') ?? '';
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new GatewayError(502, 'llm_bad_output', 'Dịch vụ AI trả về dữ liệu không đúng định dạng');
    }
    return { json, tokens: data.usageMetadata?.totalTokenCount ?? 0 };
  }
}

/** Có khóa => nhà cung cấp thật; không có => null (nơi gọi dùng bộ giả lập và gắn mock: true) */
export function createLlmProvider(config: GatewayConfig): LlmProvider | null {
  if (!config.GEMINI_API_KEY) return null;
  return new GeminiProvider(config.GEMINI_API_KEY, config.GEMINI_MODEL, config.LLM_TIMEOUT_MS);
}
