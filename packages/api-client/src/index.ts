/**
 * Client Gateway dùng chung cho mọi màn hình (thay cho các hàm fetch riêng lẻ trong từng MFE).
 *
 * - Nguyên tắc 2: không giữ secret; chỉ gửi Bearer token người dùng nếu Host cấp.
 * - Nguyên tắc 5/6: mọi phản hồi được kiểm tra bằng Zod theo `@vietlearning/contracts/api`;
 *   lệch contract là lỗi, không đưa dữ liệu sai hình dạng lên giao diện.
 * - Lỗi được chuẩn hóa một kiểu (GatewayRequestError.kind) để mọi màn hình xử lý giống nhau.
 * Host gọi configureGateway() một lần lúc khởi động.
 */
import type { ZodTypeAny, z } from 'zod';
import { APP_BUILD_HEADER, APP_CHANNEL_HEADER, AppUpdateRequiredErrorSchema, ChatSummarizeResponseSchema, type ChatSummarizeRequest, type ChatSummarizeResponse } from '@vietlearning/contracts/api';
import { gatewayConfig } from './config.js';

export type GatewayErrorKind =
  | 'offline' // mất mạng / không tới được máy chủ
  | 'timeout'
  | 'unauthorized' // 401
  | 'quota' // 429
  | 'unavailable' // 503: nhà cung cấp AI chưa cấu hình / tạm ngưng
  | 'update-required' // 426: bản app quá cũ
  | 'invalid-request' // 400, 413, 415
  | 'contract' // phản hồi không khớp contract
  | 'server'; // 5xx khác

export class GatewayRequestError extends Error {
  constructor(
    public readonly kind: GatewayErrorKind,
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    /** Thân lỗi JSON của Gateway (vd. quota_exceeded => capability, resetAt) */
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'GatewayRequestError';
  }
}

/** Câu thông báo tiếng Việt thống nhất cho người học */
const ERROR_TEXT: Record<'vi' | 'en', Partial<Record<GatewayErrorKind | 'rate' | 'busy' | 'globalQuota', string>> & { server: string }> = {
  vi: {
    offline: 'Không có kết nối mạng. Phần này cần mạng, hãy thử lại khi có mạng.',
    timeout: 'Máy chủ phản hồi chậm. Vui lòng thử lại.',
    unauthorized: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.',
    quota: 'Bạn đã dùng hết lượt hôm nay. Hãy quay lại vào ngày mai nhé.',
    rate: 'Bạn gửi hơi nhanh. Đợi một chút rồi thử lại nhé.',
    busy: 'Cu Tít đang bận một chút. Bạn thử lại sau ít giây nhé (lượt của bạn chưa bị trừ).',
    globalQuota: 'Hôm nay Cu Tít đã học cùng rất nhiều bạn. Mai quay lại nhé!',
    unavailable: 'Tính năng AI đang tạm ngưng. Vui lòng thử lại sau.',
    'update-required': 'Cần cập nhật ứng dụng để tiếp tục.',
    'invalid-request': 'Dữ liệu gửi lên chưa hợp lệ.',
    server: 'Có lỗi ở máy chủ. Vui lòng thử lại.'
  },
  en: {
    offline: 'No internet connection. This part needs the network; please try again when you are online.',
    timeout: 'The server is responding slowly. Please try again.',
    unauthorized: 'Your session has expired. Please sign in again.',
    quota: 'You have used up today’s allowance. Come back tomorrow!',
    rate: 'You’re sending too fast. Wait a moment and try again.',
    busy: 'Cu Tít is busy for a moment. Please try again in a few seconds (your turn was not used).',
    globalQuota: 'Cu Tít has been helping lots of learners today. Come back tomorrow!',
    unavailable: 'The AI feature is temporarily unavailable. Please try again later.',
    'update-required': 'Please update the app to continue.',
    'invalid-request': 'The request was not valid.',
    server: 'Something went wrong on the server. Please try again.'
  }
};

/** Câu báo lỗi thân thiện theo ngôn ngữ giao diện (mặc định tiếng Việt) */
export function describeGatewayError(err: unknown, lang: 'vi' | 'en' = 'vi'): string {
  const kind = err instanceof GatewayRequestError ? err.kind : 'server';
  // 429 có mã khác quota_exceeded = giới hạn tốc độ theo phút, KHÔNG phải "hết lượt hôm nay"
  const code = err instanceof GatewayRequestError ? err.code : undefined;
  if (kind === 'quota' && code && code !== 'quota_exceeded') return ERROR_TEXT[lang].rate!;
  // Trần dùng chung cả app đã hết (không phải lượt của riêng người học)
  if (kind === 'quota' && err instanceof GatewayRequestError && err.details?.scope === 'global') return ERROR_TEXT[lang].globalQuota!;
  // Mọi nguồn AI đều bận: KHÔNG trừ lượt, thử lại được (khác với hết lượt)
  if (code === 'llm_busy') return ERROR_TEXT[lang].busy!;
  return ERROR_TEXT[lang][kind] ?? ERROR_TEXT[lang].server;
}

// Cấu hình + kho phiên nằm ở module riêng (subpath `./config`) để Host chỉ kéo phần nhỏ này vào gói tải
// ban đầu; phần còn lại của client (request, SSE, lỗi) theo chunk lười của màn hình (R10).
export { configureGateway, gatewayBaseUrl, gatewayStorage, type KeyValue } from './config.js';

export interface RequestOptions<S extends ZodTypeAny> {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** JSON body hoặc FormData (multipart) */
  body?: unknown;
  schema: S;
  signal?: AbortSignal;
}

/** onUpdateRequired chỉ gọi một lần mỗi lần chạy (biến module, dự án 8) */
let updateNotified = false;

function kindForStatus(status: number): GatewayErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 429) return 'quota';
  if (status === 503) return 'unavailable';
  if (status === 426) return 'update-required';
  // 422: nhà cung cấp AI từ chối dữ liệu gửi lên (llm_rejected) hoặc nội dung (llm_blocked) — không phải lỗi máy chủ
  if (status === 400 || status === 413 || status === 415 || status === 422) return 'invalid-request';
  return 'server';
}

async function send(path: string, method: string, body: unknown, signal?: AbortSignal, accept = 'application/json', retried = false): Promise<Response> {
  const headers: Record<string, string> = { Accept: accept };
  const { appBuild, appChannel } = gatewayConfig();
  if (appBuild !== undefined) headers[APP_BUILD_HEADER] = String(appBuild);
  if (appChannel) headers[APP_CHANNEL_HEADER] = appChannel;
  const token = await gatewayConfig().getToken?.();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), gatewayConfig().timeoutMs);
  signal?.addEventListener('abort', () => timeout.abort(), { once: true });
  try {
    const res = await fetch(`${gatewayConfig().baseUrl}${path}`, { method, headers, body: payload, signal: timeout.signal });
    const onUnauthorized = gatewayConfig().onUnauthorized;
    if (res.status === 401 && !retried && onUnauthorized) {
      clearTimeout(timer);
      if (await onUnauthorized()) return send(path, method, body, signal, accept, true);
    }
    if (!res.ok) {
      let details: Record<string, unknown> | undefined;
      try {
        const json = (await res.json()) as unknown;
        if (json && typeof json === 'object' && !Array.isArray(json)) details = json as Record<string, unknown>;
      } catch {
        /* thân lỗi không phải JSON */
      }
      if (res.status === 426 && !updateNotified) {
        const info = AppUpdateRequiredErrorSchema.safeParse(details);
        const cb = gatewayConfig().onUpdateRequired;
        if (cb && info.success) {
          updateNotified = true;
          cb({ minBuild: info.data.minBuild, channel: info.data.channel });
        }
      }
      const code = typeof details?.error === 'string' ? details.error : undefined;
      throw new GatewayRequestError(kindForStatus(res.status), `Gateway trả ${res.status}`, res.status, code, details);
    }
    return res;
  } catch (err) {
    if (err instanceof GatewayRequestError) throw err;
    if (timeout.signal.aborted && !signal?.aborted) throw new GatewayRequestError('timeout', 'Hết thời gian chờ');
    if (signal?.aborted) throw err;
    throw new GatewayRequestError('offline', err instanceof Error ? err.message : 'Lỗi mạng');
  } finally {
    clearTimeout(timer);
  }
}

/** Gọi một endpoint, kiểm tra phản hồi theo schema. */
export async function request<S extends ZodTypeAny>(path: string, opts: RequestOptions<S>): Promise<z.infer<S>> {
  const res = await send(path, opts.method ?? (opts.body === undefined ? 'GET' : 'POST'), opts.body, opts.signal);
  const json: unknown = await res.json();
  const parsed = opts.schema.safeParse(json);
  if (!parsed.success) throw new GatewayRequestError('contract', `Phản hồi ${path} lệch contract`);
  return parsed.data;
}

/**
 * Đọc luồng Server-Sent Events (TDD: /v1/chat/turn trả transcript, token, blocks, audio, done).
 * Mỗi sự kiện được kiểm tra bằng `schema` trước khi giao cho onEvent.
 */
export async function streamEvents<S extends ZodTypeAny>(
  path: string,
  body: unknown,
  schema: S,
  onEvent: (event: z.infer<S>) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await send(path, 'POST', body, signal, 'text/event-stream');
  if (!res.body) throw new GatewayRequestError('server', 'Không có luồng dữ liệu');
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const data = raw
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      let json: unknown;
      try {
        json = JSON.parse(data);
      } catch {
        throw new GatewayRequestError('contract', 'Sự kiện SSE không phải JSON');
      }
      const parsed = schema.safeParse(json);
      if (!parsed.success) throw new GatewayRequestError('contract', 'Sự kiện SSE lệch contract');
      onEvent(parsed.data);
    }
  }
}

/**
 * POST /v1/chat/summarize — viết lại bản tóm tắt cuộc trò chuyện (≤ 600 ký tự). Không trừ lượt người dùng.
 * Lỗi (kể cả 503 llm_busy) => nơi gọi giữ tóm tắt cũ và chat tiếp, không chặn lượt người dùng.
 */
export function summarizeChat(req: ChatSummarizeRequest, signal?: AbortSignal): Promise<ChatSummarizeResponse> {
  return request('/v1/chat/summarize', { body: req, schema: ChatSummarizeResponseSchema, signal });
}
