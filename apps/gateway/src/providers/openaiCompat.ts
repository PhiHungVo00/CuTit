import type { JsonRequest, JsonResult, LlmProvider } from './llm.js';
import { LlmProviderError, parseRetryAfter } from './llm.js';
import type { SttProvider, SttResult } from './stt.js';

/**
 * Bộ điều hợp "OpenAI-compatible" dùng chung cho OpenRouter, Groq, Cloudflare Workers AI, Nous… (Nguyên tắc 4):
 * chỉ khác baseUrl + khóa + model, đều lấy từ biến môi trường (registry.ts). Khóa chỉ nằm ở header Authorization,
 * KHÔNG vào URL, log hay thông báo lỗi (Nguyên tắc 2).
 */

/** response_format: 'json_schema' (structured output) | 'json_object' (JSON mode, mặc định) | 'none' (chỉ dặn trong prompt) */
export type JsonMode = 'json_schema' | 'json_object' | 'none';

export interface OpenAiCompatConfig {
  /** nhãn nguồn trong log/header, vd. "openrouter:google/gemma-3-27b-it:free" */
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  jsonMode?: JsonMode;
  /** nhận ảnh (message có image_url); false => chuỗi bỏ qua nguồn này với yêu cầu có ảnh */
  vision?: boolean;
}

/** Lấy đối tượng JSON từ chữ model trả về: JSON thuần, có rào ```json, có khối <think>, hoặc chữ thừa quanh. Không được thì null. */
export function extractJsonObject(raw: string): unknown | null {
  const t = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const isObj = (v: unknown) => (v && typeof v === 'object' ? v : null);
  try {
    return isObj(JSON.parse(t));
  } catch {
    /* thử tiếp */
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fenced) {
    try {
      return isObj(JSON.parse(fenced[1]));
    } catch {
      /* thử tiếp */
    }
  }
  const start = t.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try {
        return isObj(JSON.parse(t.slice(start, i + 1)));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Schema kiểu Gemini (OBJECT/STRING, nullable) -> JSON Schema chuẩn */
export function toJsonSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(toJsonSchema);
  if (!s || typeof s !== 'object') return s;
  const o = s as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === 'nullable') continue;
    if (k === 'type' && typeof v === 'string') out.type = o.nullable ? [v.toLowerCase(), 'null'] : v.toLowerCase();
    else if (k === 'properties' && v && typeof v === 'object') out.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, toJsonSchema(pv)]));
    else out[k] = toJsonSchema(v);
  }
  return out;
}

/** Lỗi HTTP của nhà cung cấp -> LlmProviderError (429 => llm_busy; còn lại => llm_unavailable). Không chép nguyên văn thân lỗi. */
export function httpError(res: Response): LlmProviderError {
  if (res.status === 429) return new LlmProviderError(503, 'llm_busy', 'Dịch vụ AI đang quá tải (429)', 429, parseRetryAfter(res.headers.get('retry-after')));
  return new LlmProviderError(502, 'llm_unavailable', `Dịch vụ AI lỗi (${res.status})`, res.status);
}

export function networkError(err: unknown): LlmProviderError {
  const timeout = (err as Error).name === 'TimeoutError' || (err as Error).name === 'AbortError';
  return new LlmProviderError(timeout ? 504 : 502, timeout ? 'llm_timeout' : 'llm_unavailable', timeout ? 'Dịch vụ AI phản hồi quá lâu' : 'Không kết nối được dịch vụ AI');
}

interface ChatCompletion {
  choices?: { message?: { content?: unknown }; finish_reason?: string }[];
  usage?: { total_tokens?: number };
}

type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export class OpenAiCompatLlmProvider implements LlmProvider {
  readonly name: string;
  readonly supportsImage: boolean;
  readonly supportsAudio = false;
  /** nhà cung cấp từ chối response_format => lần sau bỏ qua (chỉ dặn trong prompt) */
  private jsonModeRejected = false;

  constructor(
    private readonly cfg: OpenAiCompatConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {
    this.name = cfg.name;
    this.supportsImage = cfg.vision === true;
  }

  private buildMessages(req: JsonRequest): { role: string; content: string | ContentPart[] }[] {
    const messages: { role: string; content: string | ContentPart[] }[] = [
      {
        role: 'system',
        content: `${req.system}\n\nChỉ trả về DUY NHẤT một đối tượng JSON hợp lệ (không giải thích, không rào markdown) đúng JSON Schema sau:\n${JSON.stringify(toJsonSchema(req.schema))}`
      }
    ];
    for (const t of req.turns) {
      const role = t.role === 'model' ? 'assistant' : 'user';
      if (t.parts.some((p) => 'inline' in p && p.inline.mimeType.startsWith('audio/'))) {
        throw new LlmProviderError(400, 'llm_unsupported', 'Nguồn này không nhận âm thanh');
      }
      if (t.parts.some((p) => 'inline' in p)) {
        if (!this.supportsImage) throw new LlmProviderError(400, 'llm_unsupported', 'Nguồn này không nhận ảnh');
        messages.push({
          role,
          content: t.parts.map((p): ContentPart => ('text' in p ? { type: 'text', text: p.text } : { type: 'image_url', image_url: { url: `data:${p.inline.mimeType};base64,${p.inline.base64}` } }))
        });
      } else {
        messages.push({ role, content: t.parts.map((p) => ('text' in p ? p.text : '')).join('') });
      }
    }
    return messages;
  }

  private async post(body: Record<string, unknown>, timeoutMs: number): Promise<Response> {
    try {
      return await this.fetchImpl(`${this.cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.cfg.apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (err) {
      throw networkError(err);
    }
  }

  async generateJson(req: JsonRequest): Promise<JsonResult> {
    const base: Record<string, unknown> = {
      model: this.cfg.model,
      messages: this.buildMessages(req),
      max_tokens: req.maxOutputTokens ?? 1024,
      temperature: req.temperature ?? 0.6
    };
    const timeoutMs = Math.min(req.timeoutMs ?? this.cfg.timeoutMs, this.cfg.timeoutMs);
    const mode = this.jsonModeRejected ? 'none' : (this.cfg.jsonMode ?? 'json_object');
    const withFormat = (m: JsonMode) =>
      m === 'json_schema'
        ? { ...base, response_format: { type: 'json_schema', json_schema: { name: 'output', strict: false, schema: toJsonSchema(req.schema) } } }
        : m === 'json_object'
          ? { ...base, response_format: { type: 'json_object' } }
          : base;

    const t0 = Date.now();
    let res = await this.post(withFormat(mode), timeoutMs);
    if (!res.ok && (res.status === 400 || res.status === 422) && mode !== 'none') {
      // Có thể do response_format không được hỗ trợ: thử lại MỘT lần chỉ với lời dặn trong prompt, trong phần thời gian còn lại
      // của lượt này. Chỉ NHỚ "không hỗ trợ" khi lần thử lại thành công (400 vì lý do khác — model sai, ảnh quá lớn… — không tắt JSON mode).
      const left = timeoutMs - (Date.now() - t0);
      if (left < 500) throw httpError(res);
      const retry = await this.post(base, left);
      if (retry.ok) this.jsonModeRejected = true;
      res = retry;
    }
    if (!res.ok) throw httpError(res);

    const data = (await res.json().catch(() => ({}))) as ChatCompletion;
    const raw = data.choices?.[0]?.message?.content;
    const text = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.map((p) => (p && typeof p === 'object' && 'text' in p ? String((p as { text: unknown }).text) : '')).join('') : '';
    const json = extractJsonObject(text);
    if (json === null) throw new LlmProviderError(502, 'llm_bad_output', 'Dịch vụ AI trả về dữ liệu không đúng định dạng');
    return { json, tokens: data.usage?.total_tokens ?? 0, provider: this.name };
  }
}

export interface OpenAiCompatSttConfig {
  name: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  language: string;
  timeoutMs: number;
}

const AUDIO_EXT: Record<string, string> = { 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/mp4': 'mp4' };

/** STT kiểu Whisper `POST {base}/audio/transcriptions` (Groq, Cloudflare, OpenAI…). Có khóa => gửi Bearer. */
export class OpenAiCompatSttClient implements SttProvider {
  readonly name: string;

  constructor(
    private readonly cfg: OpenAiCompatSttConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {
    this.name = cfg.name;
  }

  async transcribe(audio: { bytes: Buffer; mimetype: string; timeoutMs?: number }): Promise<SttResult> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio.bytes)], { type: audio.mimetype }), `audio.${AUDIO_EXT[audio.mimetype] ?? 'wav'}`);
    form.append('language', this.cfg.language);
    form.append('model', this.cfg.model);
    form.append('response_format', 'json');
    form.append('temperature', '0');
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.cfg.baseUrl.replace(/\/+$/, '')}/audio/transcriptions`, {
        method: 'POST',
        headers: this.cfg.apiKey ? { authorization: `Bearer ${this.cfg.apiKey}` } : undefined,
        body: form,
        signal: AbortSignal.timeout(Math.min(audio.timeoutMs ?? this.cfg.timeoutMs, this.cfg.timeoutMs))
      });
    } catch (err) {
      throw networkError(err);
    }
    if (!res.ok) throw httpError(res);
    const json = (await res.json().catch(() => ({}))) as { text?: unknown };
    if (typeof json.text !== 'string') throw new LlmProviderError(502, 'llm_bad_output', 'Dịch vụ nhận dạng giọng nói trả về dữ liệu không hợp lệ');
    // Whisper không trả độ tin cậy ở chế độ json: 1 = "không có thông tin" (giống bản chạy local)
    return { text: json.text.trim().slice(0, 500), confidence: 1, tokens: 0, provider: this.name };
  }
}
