/**
 * Client trang quản trị (dự án 5a, Task 6) — `/admin/v1/*`. Subpath `@vietlearning/api-client/admin`.
 *
 * Khác client của app học:
 *  - KHÔNG dùng Bearer của app và KHÔNG đọc `gatewayConfig()`: access token quản trị (JWT `typ:'admin'`, 10 phút) chỉ nằm trong
 *    bộ nhớ của `createAdminClient` (không localStorage/sessionStorage/IndexedDB). Refresh là cookie HttpOnly do server cấp,
 *    trình duyệt tự gửi nhờ `credentials: 'include'` (JS không đọc được).
 *  - Mọi phản hồi qua Zod theo `@vietlearning/contracts/api`; lệch contract ⇒ lỗi `contract`, không đưa dữ liệu sai hình lên giao diện.
 *  - 401 trên đường cần phiên ⇒ gọi refresh ĐÚNG MỘT lần (gộp các request song song vào một lần refresh) rồi gửi lại ĐÚNG MỘT lần;
 *    hỏng ⇒ xóa access, gọi `onSessionExpired`, ném `AdminRequestError('session-expired')`.
 *  - Không có khóa bí mật nào ở đây (Nguyên tắc 2). Quyền thật luôn do server kiểm; vai trò ở client chỉ để ẩn/khóa nút.
 */
import type { ZodTypeAny, z } from 'zod';
import {
  AdminEnrollResponseSchema,
  AdminLoginResponseSchema,
  AdminFeedbackDetailSchema,
  AdminSessionInfoSchema,
  AdminSessionSchema,
  AdminTotpConfirmResponseSchema,
  AuditListResponseSchema,
  QueueResponseSchema,
  SignedUrlSchema,
  type AdminFeedbackDetail,
  type AdminLoginResponse,
  type AdminSessionInfo,
  type AdminStatusRequest,
  type AuditListResponse,
  type QueueQuery,
  type QueueResponse,
  type SignedUrl
} from '@vietlearning/contracts/api';

export type AdminErrorKind =
  | 'offline' // mất mạng / không tới được máy chủ
  | 'timeout'
  | 'session-expired' // hết phiên (đã thử refresh một lần)
  | 'invalid-credentials' // 401 trên bước đăng nhập/mã (mã lỗi riêng trong `.code`)
  | 'forbidden' // 403: thiếu vai trò / sai bước
  | 'rate-limited' // 429
  | 'not-found' // 404
  | 'gone' // 410: tệp đã dọn
  | 'disabled' // 404/503 admin_disabled: Gateway chưa bật khối quản trị
  | 'invalid-request' // 400
  | 'contract' // phản hồi không khớp contract
  | 'server';

export class AdminRequestError extends Error {
  constructor(
    public readonly kind: AdminErrorKind,
    message: string,
    public readonly status?: number,
    /** Mã máy đọc được của `/admin/v1` (AdminErrorCode) hoặc mã lỗi khác của Gateway */
    public readonly code?: string
  ) {
    super(message);
    this.name = 'AdminRequestError';
  }
}

export interface AdminClientOptions {
  /** Thay `fetch` (test) */
  fetch?: typeof fetch;
  /** Mặc định 15 giây */
  timeoutMs?: number;
  /** Gọi đúng lúc phiên chấm dứt (refresh hỏng / đăng xuất) để giao diện về màn đăng nhập */
  onSessionExpired?: () => void;
}

export interface AdminClient {
  /** Bước 1: mật khẩu ⇒ vé + bước kế (`totp` | `enroll`) */
  login(username: string, password: string): Promise<AdminLoginResponse>;
  /** Bước 2 (đã có mã 6 số): đúng một trong `code` / `backupCode` */
  totp(ticket: string, proof: { code: string } | { backupCode: string }): Promise<void>;
  /** Bước 2' (lần đầu): mã mời ⇒ mã QR (otpauth) + bí mật nhập tay */
  enroll(ticket: string, inviteCode: string): Promise<{ otpauthUrl: string; secret: string }>;
  /** Bước 3' : mã 6 số đầu tiên ⇒ phiên + 10 mã dự phòng (chỉ hiện một lần) */
  confirmTotp(ticket: string, code: string): Promise<{ backupCodes: string[] }>;
  /** Khôi phục phiên từ cookie (tải lại trang): `true` nếu còn phiên */
  restore(): Promise<boolean>;
  session(): Promise<AdminSessionInfo>;
  logout(): Promise<void>;
  queue(q?: Partial<Omit<QueueQuery, 'type'>>): Promise<QueueResponse>;
  detail(id: string): Promise<AdminFeedbackDetail>;
  setStatus(id: string, body: AdminStatusRequest): Promise<AdminFeedbackDetail>;
  /** URL ký 5 phút cho một tệp; chỉ nhận http(s) (không bao giờ trả `javascript:`/`data:`) */
  fileUrl(id: string, fileId: string): Promise<SignedUrl>;
  audit(q?: { cursor?: string; limit?: number }): Promise<AuditListResponse>;
  hasAccess(): boolean;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function kindOf(status: number, code: string | undefined): AdminErrorKind {
  if (code === 'admin_disabled') return 'disabled';
  if (status === 401) return 'invalid-credentials';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 410) return 'gone';
  if (status === 429) return 'rate-limited';
  if (status === 400 || status === 413 || status === 415) return 'invalid-request';
  if (status === 503) return 'disabled';
  return 'server';
}

export function createAdminClient(baseUrl: string, opts: AdminClientOptions = {}): AdminClient {
  const root = baseUrl.replace(/\/+$/, '');
  const doFetch: typeof fetch = opts.fetch ?? ((input, init) => fetch(input, init));
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let access: string | null = null;
  let refreshing: Promise<boolean> | null = null;

  async function raw(path: string, method: string, body: unknown, token: string | null): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload: string | undefined;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      return await doFetch(root + path, { method, headers, body: payload, credentials: 'include', cache: 'no-store', signal: ctl.signal });
    } catch (e) {
      if (ctl.signal.aborted) throw new AdminRequestError('timeout', 'Hết thời gian chờ');
      throw new AdminRequestError('offline', e instanceof Error ? e.message : 'Lỗi mạng');
    } finally {
      clearTimeout(timer);
    }
  }

  async function errorFrom(res: Response): Promise<AdminRequestError> {
    let code: string | undefined;
    try {
      const j = (await res.json()) as { error?: unknown };
      if (typeof j.error === 'string') code = j.error;
    } catch {
      /* thân không phải JSON */
    }
    return new AdminRequestError(kindOf(res.status, code), `Gateway trả ${res.status}${code ? ` (${code})` : ''}`, res.status, code);
  }

  async function parse<S extends ZodTypeAny>(res: Response, schema: S): Promise<z.infer<S>> {
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new AdminRequestError('contract', 'Phản hồi không phải JSON', res.status);
    }
    const r = schema.safeParse(json);
    if (!r.success) throw new AdminRequestError('contract', 'Phản hồi không khớp contract', res.status);
    return r.data;
  }

  function expire(): never {
    access = null;
    opts.onSessionExpired?.();
    throw new AdminRequestError('session-expired', 'Phiên đã hết hạn', 401);
  }

  /** Làm mới access bằng cookie. Gộp các lần gọi đồng thời. `true` = có access mới. */
  function refresh(): Promise<boolean> {
    refreshing ??= (async () => {
      try {
        const res = await raw('/admin/v1/auth/refresh', 'POST', undefined, null);
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) return false;
          throw await errorFrom(res);
        }
        access = (await parse(res, AdminSessionSchema)).accessToken;
        return true;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  /** Request cần phiên: 401 ⇒ refresh một lần ⇒ gửi lại một lần. */
  async function authed<S extends ZodTypeAny>(path: string, method: string, body: unknown, schema: S): Promise<z.infer<S>> {
    if (!access && !(await refresh())) expire();
    let res = await raw(path, method, body, access);
    if (res.status === 401) {
      access = null;
      if (!(await refresh())) expire();
      res = await raw(path, method, body, access);
      if (res.status === 401) expire();
    }
    if (!res.ok) throw await errorFrom(res);
    return parse(res, schema);
  }

  /** Request không cần phiên (các bước đăng nhập) */
  async function anon<S extends ZodTypeAny>(path: string, body: unknown, schema: S): Promise<z.infer<S>> {
    const res = await raw(path, 'POST', body, null);
    if (!res.ok) throw await errorFrom(res);
    return parse(res, schema);
  }

  const qs = (o: Record<string, string | number | undefined>): string => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') p.set(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  return {
    hasAccess: () => access !== null,
    login: (username, password) => anon('/admin/v1/auth/login', { username, password }, AdminLoginResponseSchema),
    async totp(ticket, proof) {
      access = (await anon('/admin/v1/auth/totp', { ticket, ...proof }, AdminSessionSchema)).accessToken;
    },
    enroll: (ticket, inviteCode) => anon('/admin/v1/auth/totp/enroll', { ticket, inviteCode }, AdminEnrollResponseSchema),
    async confirmTotp(ticket, code) {
      const r = await anon('/admin/v1/auth/totp/confirm', { ticket, code }, AdminTotpConfirmResponseSchema);
      access = r.accessToken;
      return { backupCodes: r.backupCodes };
    },
    async restore() {
      try {
        return await refresh();
      } catch (e) {
        if (e instanceof AdminRequestError && (e.kind === 'offline' || e.kind === 'timeout')) throw e;
        return false;
      }
    },
    session: () => authed('/admin/v1/session', 'GET', undefined, AdminSessionInfoSchema),
    async logout() {
      try {
        await raw('/admin/v1/auth/logout', 'POST', undefined, null);
      } finally {
        access = null;
      }
    },
    queue: (q = {}) => authed(`/admin/v1/queue${qs({ type: 'feedback', status: q.status, kind: q.kind, cursor: q.cursor, limit: q.limit })}`, 'GET', undefined, QueueResponseSchema),
    detail: (id) => authed(`/admin/v1/feedback/${encodeURIComponent(id)}`, 'GET', undefined, AdminFeedbackDetailSchema),
    setStatus: (id, body) => authed(`/admin/v1/feedback/${encodeURIComponent(id)}/status`, 'POST', body, AdminFeedbackDetailSchema),
    async fileUrl(id, fileId) {
      const r = await authed(`/admin/v1/feedback/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}/url`, 'GET', undefined, SignedUrlSchema);
      let u: URL;
      try {
        u = new URL(r.url);
      } catch {
        throw new AdminRequestError('contract', 'URL tệp không hợp lệ');
      }
      if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new AdminRequestError('contract', 'URL tệp phải là http(s)');
      return r;
    },
    audit: (q = {}) => authed(`/admin/v1/audit${qs({ cursor: q.cursor, limit: q.limit })}`, 'GET', undefined, AuditListResponseSchema)
  };
}
