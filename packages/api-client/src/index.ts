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

export type GatewayErrorKind =
  | 'offline' // mất mạng / không tới được máy chủ
  | 'timeout'
  | 'unauthorized' // 401
  | 'quota' // 429
  | 'unavailable' // 503: nhà cung cấp AI chưa cấu hình / tạm ngưng
  | 'invalid-request' // 400, 413, 415
  | 'contract' // phản hồi không khớp contract
  | 'server'; // 5xx khác

export class GatewayRequestError extends Error {
  constructor(
    public readonly kind: GatewayErrorKind,
    message: string,
    public readonly status?: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'GatewayRequestError';
  }
}

/** Câu thông báo tiếng Việt thống nhất cho người học */
const ERROR_TEXT: Record<'vi' | 'en', Partial<Record<GatewayErrorKind, string>> & { server: string }> = {
  vi: {
    offline: 'Không có kết nối mạng. Phần này cần mạng, hãy thử lại khi có mạng.',
    timeout: 'Máy chủ phản hồi chậm. Vui lòng thử lại.',
    unauthorized: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.',
    quota: 'Bạn đã dùng hết lượt hôm nay. Hãy quay lại vào ngày mai nhé.',
    unavailable: 'Tính năng AI đang tạm ngưng. Vui lòng thử lại sau.',
    'invalid-request': 'Dữ liệu gửi lên chưa hợp lệ.',
    server: 'Có lỗi ở máy chủ. Vui lòng thử lại.'
  },
  en: {
    offline: 'No internet connection. This part needs the network; please try again when you are online.',
    timeout: 'The server is responding slowly. Please try again.',
    unauthorized: 'Your session has expired. Please sign in again.',
    quota: 'You have used up today’s allowance. Come back tomorrow!',
    unavailable: 'The AI feature is temporarily unavailable. Please try again later.',
    'invalid-request': 'The request was not valid.',
    server: 'Something went wrong on the server. Please try again.'
  }
};

/** Câu báo lỗi thân thiện theo ngôn ngữ giao diện (mặc định tiếng Việt) */
export function describeGatewayError(err: unknown, lang: 'vi' | 'en' = 'vi'): string {
  const kind = err instanceof GatewayRequestError ? err.kind : 'server';
  return ERROR_TEXT[lang][kind] ?? ERROR_TEXT[lang].server;
}

/** Kho khóa–giá trị bất đồng bộ (Capacitor Preferences trên app, localStorage trên web) */
export interface KeyValue {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

interface GatewayConfig {
  baseUrl: string;
  getToken?: () => string | null | Promise<string | null>;
  /** Gọi khi Gateway trả 401: làm mới phiên; true => gửi lại request đúng MỘT lần */
  onUnauthorized?: () => Promise<boolean>;
  /** Nơi lưu phiên đăng nhập (refresh token, mã khôi phục). Bỏ trống => localStorage */
  storage?: KeyValue;
  timeoutMs: number;
}

let config: GatewayConfig = { baseUrl: 'http://localhost:4000', timeoutMs: 15000 };

export function configureGateway(next: Partial<GatewayConfig>): void {
  config = { ...config, ...next, baseUrl: (next.baseUrl ?? config.baseUrl).replace(/\/$/, '') };
}

export function gatewayBaseUrl(): string {
  return config.baseUrl;
}

/** Kho phiên do Host cấp (undefined => phiên dùng localStorage) */
export function gatewayStorage(): KeyValue | undefined {
  return config.storage;
}

export interface RequestOptions<S extends ZodTypeAny> {
  method?: 'GET' | 'POST' | 'PUT';
  /** JSON body hoặc FormData (multipart) */
  body?: unknown;
  schema: S;
  signal?: AbortSignal;
}

function kindForStatus(status: number): GatewayErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 429) return 'quota';
  if (status === 503) return 'unavailable';
  if (status === 400 || status === 413 || status === 415) return 'invalid-request';
  return 'server';
}

async function send(path: string, method: string, body: unknown, signal?: AbortSignal, accept = 'application/json', retried = false): Promise<Response> {
  const headers: Record<string, string> = { Accept: accept };
  const token = await config.getToken?.();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), config.timeoutMs);
  signal?.addEventListener('abort', () => timeout.abort(), { once: true });
  try {
    const res = await fetch(`${config.baseUrl}${path}`, { method, headers, body: payload, signal: timeout.signal });
    if (res.status === 401 && !retried && config.onUnauthorized) {
      clearTimeout(timer);
      if (await config.onUnauthorized()) return send(path, method, body, signal, accept, true);
    }
    if (!res.ok) {
      let code: string | undefined;
      try {
        code = ((await res.json()) as { error?: string }).error;
      } catch {
        /* thân lỗi không phải JSON */
      }
      throw new GatewayRequestError(kindForStatus(res.status), `Gateway trả ${res.status}`, res.status, code);
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
