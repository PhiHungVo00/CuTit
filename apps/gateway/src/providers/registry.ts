import type { GatewayConfig } from '../config.js';
import { CircuitBreaker, FallbackLlmProvider, FallbackSttProvider, type ChainLog, type ChainOptions } from './chain.js';
import { GeminiProvider, type LlmProvider } from './llm.js';
import { OpenAiCompatLlmProvider, OpenAiCompatSttClient, type JsonMode } from './openaiCompat.js';
import { createSttProvider, type SttProvider } from './stt.js';

/**
 * Dựng chuỗi dự phòng LLM / vision / STT từ biến môi trường (Nguyên tắc 2, 4): mã nghiệp vụ chỉ thấy
 * LlmProvider / SttProvider, đổi hoặc thêm nhà cung cấp = sửa biến môi trường, không sửa code.
 *
 * Cú pháp mỗi mục: `nhà_cung_cấp` hoặc `nhà_cung_cấp:model` (model được chứa `/` và `:`, vd. `openrouter:google/gemma-3-27b-it:free`).
 *  - `gemini[:model]`  — dùng GEMINI_API_KEY (+ GEMINI_MODEL nếu không ghi model).
 *  - `openrouter`, `groq`, `nous`, `cloudflare` — có sẵn URL gốc; khóa ở `<TÊN>_API_KEY` (cloudflare: CLOUDFLARE_API_KEY +
 *    CLOUDFLARE_ACCOUNT_ID). Ghi đè URL bằng `<TÊN>_BASE_URL`.
 *  - tên bất kỳ khác (vd. `together`) — bắt buộc `<TÊN>_BASE_URL` và `<TÊN>_API_KEY`.
 *  - `<TÊN>_JSON_MODE` = json_schema | json_object (mặc định) | none: cách yêu cầu đầu ra JSON.
 * Mục thiếu khóa/URL bị BỎ QUA kèm cảnh báo (cùng một tệp env dùng chung nhiều máy), chuỗi rỗng => null (bộ giả lập).
 */

interface Preset {
  baseUrl?: string;
  keyEnv: string[];
  /** nhà cung cấp tự cấu hình URL từ biến khác */
  buildUrl?: (env: Record<string, string>) => string | undefined;
}

const PRESETS: Record<string, Preset> = {
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', keyEnv: ['OPENROUTER_API_KEY'] },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', keyEnv: ['GROQ_API_KEY'] },
  nous: { baseUrl: 'https://inference-api.nousresearch.com/v1', keyEnv: ['NOUS_API_KEY'] },
  cloudflare: {
    keyEnv: ['CLOUDFLARE_API_KEY', 'CLOUDFLARE_API_TOKEN'],
    buildUrl: (env) => (env.CLOUDFLARE_ACCOUNT_ID ? `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/ai/v1` : undefined)
  }
};

export interface ChainEntry {
  provider: string;
  model?: string;
  /** chuỗi gốc, dùng làm nhãn nguồn (vd. "groq:whisper-large-v3-turbo") */
  id: string;
}

/** `a,b:model:free` -> các mục; tách ở dấu `:` ĐẦU TIÊN (phần còn lại là model, có thể chứa `/` và `:`) */
export function parseChain(spec: string | undefined): ChainEntry[] {
  if (!spec) return [];
  return spec
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => {
      const i = id.indexOf(':');
      return i < 0 ? { provider: id.toLowerCase(), id } : { provider: id.slice(0, i).toLowerCase(), model: id.slice(i + 1), id };
    });
}

const envName = (provider: string) => provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_');

interface Endpoint {
  baseUrl: string;
  apiKey: string;
  jsonMode: JsonMode;
}

function resolveEndpoint(provider: string, env: Record<string, string>): Endpoint | string {
  const preset = PRESETS[provider];
  const prefix = envName(provider);
  const apiKey = preset ? preset.keyEnv.map((k) => env[k]).find(Boolean) : env[`${prefix}_API_KEY`];
  if (!apiKey) return `thiếu ${preset ? preset.keyEnv[0] : `${prefix}_API_KEY`}`;
  const baseUrl = env[`${prefix}_BASE_URL`] ?? preset?.baseUrl ?? preset?.buildUrl?.(env);
  if (!baseUrl) return `thiếu ${preset?.buildUrl ? 'CLOUDFLARE_ACCOUNT_ID' : `${prefix}_BASE_URL`}`;
  if (!/^https?:\/\//.test(baseUrl)) return `${prefix}_BASE_URL không phải URL http(s)`;
  const jm = env[`${prefix}_JSON_MODE`];
  const jsonMode: JsonMode = jm === 'json_schema' || jm === 'none' ? jm : 'json_object';
  return { baseUrl, apiKey, jsonMode };
}

export interface AiProviders {
  llm: LlmProvider | null;
  vision: LlmProvider | null;
  stt: SttProvider | null;
  breaker: CircuitBreaker;
  /** các mục bị bỏ qua và lý do (đã ghi log); để test/kiểm tra khởi động */
  skipped: string[];
}

export interface RegistryDeps {
  log?: ChainLog;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** Mặc định (không đặt biến chuỗi): "gemini" khi có khóa — giữ hành vi trước khi có chuỗi dự phòng */
const defaultSpec = (config: GatewayConfig) => (config.GEMINI_API_KEY ? 'gemini' : undefined);

export function createAiProviders(config: GatewayConfig, deps: RegistryDeps = {}): AiProviders {
  const env: Record<string, string> = { ...config.aiEnv };
  if (config.GEMINI_API_KEY) env.GEMINI_API_KEY = config.GEMINI_API_KEY;
  const skipped: string[] = [];
  const breaker = new CircuitBreaker({
    openMs: config.AI_BREAKER_MS,
    failureThreshold: config.AI_BREAKER_FAILURES,
    transientOpenMs: config.AI_BREAKER_TRANSIENT_MS,
    now: deps.now
  });
  const chainOpts: ChainOptions = { breaker, budgetMs: config.LLM_CHAIN_BUDGET_MS, now: deps.now, log: deps.log };
  const skip = (capability: string, e: ChainEntry, why: string) => {
    skipped.push(`${capability}:${e.id} (${why})`);
    deps.log?.warn({ capability, source: e.id, why }, 'AI chain entry skipped');
  };

  const gemini = (e: ChainEntry): GeminiProvider | null => (config.GEMINI_API_KEY ? new GeminiProvider(config.GEMINI_API_KEY, e.model ?? config.GEMINI_MODEL, config.LLM_TIMEOUT_MS, deps.fetchImpl) : null);

  const buildLlm = (capability: 'llm' | 'vision', spec: string | undefined): LlmProvider | null => {
    const sources: { id: string; provider: LlmProvider }[] = [];
    for (const e of parseChain(spec)) {
      if (e.provider === 'gemini') {
        const g = gemini(e);
        if (!g) skip(capability, e, 'thiếu GEMINI_API_KEY');
        else sources.push({ id: `gemini:${e.model ?? config.GEMINI_MODEL}`, provider: g });
        continue;
      }
      if (!e.model) {
        skip(capability, e, 'thiếu model (dạng nhà_cung_cấp:model)');
        continue;
      }
      const ep = resolveEndpoint(e.provider, env);
      if (typeof ep === 'string') {
        skip(capability, e, ep);
        continue;
      }
      sources.push({
        id: e.id,
        provider: new OpenAiCompatLlmProvider(
          { name: e.id, baseUrl: ep.baseUrl, apiKey: ep.apiKey, model: e.model, timeoutMs: config.LLM_TIMEOUT_MS, jsonMode: ep.jsonMode, vision: capability === 'vision' },
          deps.fetchImpl
        )
      });
    }
    return sources.length ? new FallbackLlmProvider(capability, sources, chainOpts) : null;
  };

  const buildStt = (spec: string | undefined): SttProvider | null => {
    const sources: { id: string; provider: SttProvider }[] = [];
    for (const e of parseChain(spec)) {
      if (e.provider === 'gemini') {
        const g = gemini(e);
        if (!g) skip('stt', e, 'thiếu GEMINI_API_KEY');
        else {
          const p = createSttProvider(g);
          if (p) sources.push({ id: `gemini-stt:${e.model ?? config.GEMINI_MODEL}`, provider: p });
        }
        continue;
      }
      if (!e.model) {
        skip('stt', e, 'thiếu model (vd. groq:whisper-large-v3-turbo)');
        continue;
      }
      const ep = resolveEndpoint(e.provider, env);
      if (typeof ep === 'string') {
        skip('stt', e, ep);
        continue;
      }
      sources.push({
        id: e.id,
        provider: new OpenAiCompatSttClient({ name: e.id, baseUrl: ep.baseUrl, apiKey: ep.apiKey, model: e.model, language: config.STT_LANGUAGE, timeoutMs: config.LLM_TIMEOUT_MS }, deps.fetchImpl)
      });
    }
    return sources.length ? new FallbackSttProvider(sources, chainOpts) : null;
  };

  return {
    llm: buildLlm('llm', config.LLM_CHAIN ?? defaultSpec(config)),
    vision: buildLlm('vision', config.VISION_CHAIN ?? defaultSpec(config)),
    stt: buildStt(config.STT_CHAIN ?? defaultSpec(config)),
    breaker,
    skipped
  };
}
