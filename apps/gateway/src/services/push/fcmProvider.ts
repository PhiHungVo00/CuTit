import { createSign } from 'node:crypto';
import type { PushProvider } from './PushProvider.js';
import type { PushMessage } from './payload.js';

/**
 * FCM HTTP v1 gọi TRỰC TIẾP (không thêm thư viện: `firebase-admin` kéo hàng chục MB phụ thuộc, vượt nhu cầu; ở đây chỉ cần
 * ký JWT RS256 bằng `node:crypto` và hai lời gọi HTTPS). Khóa tài khoản dịch vụ chỉ nằm trong bộ nhớ tiến trình;
 * KHÔNG đưa vào log, lỗi, hay phản hồi. Mọi lỗi ném ra đã được rút gọn thành mã (`PushError`).
 */
export interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

export class PushError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'PushError';
  }
}

export function parseServiceAccount(raw: string): ServiceAccount | null {
  try {
    const j = JSON.parse(raw) as Partial<ServiceAccount>;
    if (typeof j.client_email === 'string' && typeof j.project_id === 'string' && typeof j.private_key === 'string' && j.private_key.includes('PRIVATE KEY')) {
      return { client_email: j.client_email, project_id: j.project_id, private_key: j.private_key };
    }
  } catch {
    // không phải JSON
  }
  return null;
}

interface FcmErrorBody {
  error?: { status?: string; details?: Array<{ errorCode?: string; fieldViolations?: Array<{ field?: string }> }> };
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const b64url = (b: Buffer | string): string => Buffer.from(b).toString('base64url');

export interface FcmOptions {
  fetch?: typeof fetch;
  now?: () => number;
  /** số yêu cầu gửi song song (v1 không có gửi mẻ) */
  concurrency?: number;
  timeoutMs?: number;
}

export class FcmProvider implements PushProvider {
  readonly name = 'fcm';
  private access: { token: string; exp: number } | null = null;
  /** làm mới token truy cập đang chờ: các `send` song song dùng chung một lời gọi OAuth */
  private refreshing: Promise<string> | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly concurrency: number;
  private readonly timeoutMs: number;

  constructor(
    private readonly sa: ServiceAccount,
    opts: FcmOptions = {}
  ) {
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    this.now = opts.now ?? Date.now;
    this.concurrency = opts.concurrency ?? 20;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  private accessToken(): Promise<string> {
    if (this.access && this.access.exp - 60_000 > this.now()) return Promise.resolve(this.access.token);
    this.refreshing ??= this.fetchAccessToken().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async fetchAccessToken(): Promise<string> {
    const nowMs = this.now();
    const iat = Math.floor(nowMs / 1000);
    const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: this.sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }))}`;
    let jwt: string;
    try {
      jwt = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(this.sa.private_key).toString('base64url')}`;
    } catch {
      throw new PushError('fcm_bad_key');
    }
    let res: Response;
    try {
      res = await this.fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: 'error'
      });
    } catch {
      throw new PushError('fcm_auth_network');
    }
    if (!res.ok) throw new PushError(`fcm_auth_http_${res.status}`);
    const j = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
    if (!j?.access_token) throw new PushError('fcm_auth_bad_response');
    this.access = { token: j.access_token, exp: nowMs + (j.expires_in ?? 3600) * 1000 };
    return j.access_token;
  }

  async send(tokens: string[], msg: PushMessage): Promise<{ invalid: string[]; retry: string[]; config: number }> {
    const invalid: string[] = [];
    const retry: string[] = [];
    let config = 0; // lỗi cấu hình/nội dung (project_id sai, payload sai): KHÔNG vô hiệu token, KHÔNG thử lại
    if (!tokens.length) return { invalid, retry, config };
    const bearer = await this.accessToken(); // lỗi xác thực ⇒ ném (cả mẻ hỏng)
    const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.sa.project_id)}/messages:send`;
    let fatal: PushError | null = null;
    let next = 0;
    const worker = async (): Promise<void> => {
      while (!fatal) {
        const i = next++;
        if (i >= tokens.length) return;
        const token = tokens[i];
        try {
          const res = await this.fetchImpl(url, {
            method: 'POST',
            headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
            body: JSON.stringify(toFcmBody(token, msg)),
            signal: AbortSignal.timeout(this.timeoutMs),
            redirect: 'error'
          });
          if (res.ok) continue;
          if (res.status === 404 || res.status === 400) {
            // Chỉ dọn token khi FCM chỉ ĐÚNG token: 404 + errorCode UNREGISTERED, hoặc 400 INVALID_ARGUMENT có fieldViolation `message.token`.
            // 404 khác (sai project_id) / 400 khác (payload sai) là lỗi của ta: dọn token sẽ tắt oan token của mọi người.
            const e = ((await res.json().catch(() => null)) as FcmErrorBody | null)?.error;
            const details = e?.details ?? [];
            const dead = res.status === 404 ? details.some((d) => d.errorCode === 'UNREGISTERED') : e?.status === 'INVALID_ARGUMENT' && details.some((d) => d.fieldViolations?.some((f) => f.field === 'message.token'));
            if (dead) invalid.push(token);
            else config++;
          } else if (res.status === 401) {
            this.access = null;
            retry.push(token);
          } else if (res.status === 403) fatal = new PushError('fcm_forbidden');
          else retry.push(token); // 429, 5xx
        } catch {
          retry.push(token);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, tokens.length) }, worker));
    if (fatal) throw fatal;
    return { invalid, retry, config };
  }
}

function toFcmBody(token: string, m: PushMessage): object {
  return {
    message: {
      token,
      notification: { title: m.title, body: m.body },
      data: m.data,
      android: {
        priority: m.priority === 'high' ? 'HIGH' : 'NORMAL',
        ttl: `${m.ttlSec}s`,
        ...(m.collapseKey ? { collapse_key: m.collapseKey } : {}),
        notification: { channel_id: m.channel, ...(m.collapseKey ? { tag: m.collapseKey } : {}) }
      }
    }
  };
}
