/**
 * Phiên người dùng phía client (import lười: `@vietlearning/api-client/session`).
 *
 * - Tài khoản khách được tạo LƯỜI ở lần gọi Gateway đầu tiên cần token (không bắt đăng ký).
 * - Dự án 3: khách có thể nâng cấp thành tài khoản thật (`kind: 'account'`) bằng Google hoặc tên đăng nhập/mật khẩu,
 *   hoặc đăng nhập tài khoản có sẵn (gộp tiến độ máy này qua `merge`). Nâng cấp xong, mã khôi phục bị XÓA khỏi máy.
 * - Access token chỉ giữ trong RAM; refresh token (+ mã khôi phục của khách) lưu bằng `gatewayStorage()`
 *   (Capacitor Preferences trên app, localStorage trên web) — không bao giờ có secret của server.
 * - Single-flight: nhiều request song song lúc khởi động chỉ tạo/làm mới MỘT lần.
 * - Khách, refresh thất bại (vd. mất phản hồi giữa lúc xoay vòng token): refresh → khôi phục bằng mã đã lưu → cuối
 *   cùng mới tạo khách mới.
 * - TÀI KHOẢN THẬT, refresh thất bại: KHÔNG tạo khách mới (sẽ rơi vào tài khoản trống), KHÔNG xóa dữ liệu trên máy;
 *   phát `signed-out` và từ chối mọi lần gọi sau (không gọi mạng) cho tới khi đăng nhập lại.
 * - Gateway báo `account_merged` (khách đã gộp/nâng cấp ở máy khác): phát `merged-elsewhere`, giữ dữ liệu, mời đăng nhập.
 * - Gateway báo `account_deleted` (tài khoản đã bị xóa ở máy khác): xóa phiên, phát `remote-deleted` và NÉM lỗi
 *   (không tạo khách mới trong cùng lần gọi — request đang chờ gửi lại sẽ không rơi vào tài khoản mới).
 *   App xóa dữ liệu trên máy; lần gọi sau mới tạo khách mới như người dùng mới.
 */
import type { ZodTypeAny, z } from 'zod';
import {
  AuthGuestResponseSchema,
  AuthNonceResponseSchema,
  AuthRegisterResponseSchema,
  AuthSignInResponseSchema,
  AuthSignedInSchema,
  AuthTokensSchema,
  DeleteMeResponseSchema,
  IdentityListResponseSchema,
  formatRecoveryCode,
  type AuthProvider,
  type AuthRegisterResponse,
  type AuthSignedIn,
  type AuthTokens
} from '@vietlearning/contracts/api';
import { GatewayRequestError, gatewayBaseUrl, gatewayStorage, type KeyValue } from './index.js';

export const AUTH_STORAGE_KEY = 'becutit.auth';

const localStorageKV: KeyValue = {
  get: async (k) => {
    try {
      return globalThis.localStorage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  },
  set: async (k, v) => {
    try {
      globalThis.localStorage?.setItem(k, v);
    } catch {
      /* chế độ riêng tư: chỉ giữ trong phiên */
    }
  },
  remove: async (k) => {
    try {
      globalThis.localStorage?.removeItem(k);
    } catch {
      /* bỏ qua */
    }
  }
};

interface StoredAuth {
  userId: string;
  refreshToken: string;
  /** dạng XXXX-XXXX-XXXX-XXXX; null nếu máy này không biết mã (hiếm) hoặc đã nâng cấp thành tài khoản thật */
  recoveryCode: string | null;
  /** thiếu = 'guest' (bản lưu cũ trước dự án 3) */
  kind?: 'guest' | 'account';
  providers?: AuthProvider[];
}

/**
 * remote-deleted = tài khoản bị xóa ở máy khác (Gateway trả account_deleted).
 * signed-in = nâng cấp/đăng nhập tài khoản thật; merged = đã gộp tiến độ máy này vào tài khoản;
 * signed-out = đăng xuất, hoặc phiên tài khoản hỏng (không tự tạo khách; dữ liệu trên máy giữ nguyên);
 * merged-elsewhere = khách này đã gộp/nâng cấp ở máy khác (mời đăng nhập, KHÔNG xóa dữ liệu);
 * pending-deletion = vừa đăng nhập vào tài khoản đang chờ xóa (phát SAU 'signed-in'; hỏi "Khôi phục tài khoản?").
 */
export type UserChangeReason =
  | 'guest'
  | 'recovered'
  | 'deleted'
  | 'remote-deleted'
  | 'signed-in'
  | 'merged'
  | 'signed-out'
  | 'merged-elsewhere'
  | 'pending-deletion';
export interface UserChange {
  reason: UserChangeReason;
  /** null khi tài khoản vừa bị xóa / đăng xuất */
  userId: string | null;
}

/** Kết quả Google: xong, hoặc cần người dùng chọn gộp (vé sống 10 phút) */
export type SignInResult =
  | ({ status: 'signed_in' } & Omit<AuthSignedIn, 'status'>)
  | { status: 'needs_merge'; mergeTicket: string; target: { createdAt: string; hasProgress: true } };

export interface AuthSession {
  /** Access token hợp lệ (tạo khách / làm mới nếu cần). Mất mạng => GatewayRequestError('offline') */
  getToken(): Promise<string | null>;
  /** Gateway trả 401: bỏ access token, lấy token mới. true => nên gửi lại request */
  handleUnauthorized(): Promise<boolean>;
  /** Thông tin đã lưu trên máy (không gọi mạng) */
  info(): Promise<{ userId: string; recoveryCode: string | null } | null>;
  /** Nhập mã khôi phục trên máy mới => chuyển sang tài khoản đó */
  recover(code: string): Promise<string>;
  /** Xóa tài khoản trên server rồi xóa phiên trên máy */
  deleteAccount(): Promise<void>;
  /** Tên đăng nhập/mật khẩu. Đang là khách => nâng cấp chính khách đó (giữ userId). backupCode chỉ hiện một lần */
  register(username: string, password: string): Promise<AuthRegisterResponse>;
  login(username: string, password: string): Promise<AuthSignedIn>;
  /** Google: đang là khách => liên kết/nâng cấp (có thể needs_merge); chưa có phiên => đăng nhập */
  signInWithGoogle(): Promise<SignInResult>;
  merge(mergeTicket: string, strategy: 'merge' | 'discard_device'): Promise<AuthSignedIn>;
  /** Khôi phục tài khoản đang chờ xóa (sau khi đăng nhập có `restorable`) */
  restore(): Promise<AuthSignedIn>;
  /** Thu hồi refresh token rồi xóa phiên; offline => ném 'offline' và GIỮ phiên (đăng xuất chờ mạng do tầng đồng bộ lo) */
  logout(everywhere?: boolean): Promise<void>;
  identities(): Promise<Array<{ id: string; provider: AuthProvider; display: string }>>;
  onUserChange(cb: (e: UserChange) => void): () => void;
}

export interface SessionOptions {
  storage?: KeyValue;
  baseUrl?: () => string;
  now?: () => number;
  /** Lấy ID token Google theo nonce (Host nối với `@vietlearning/native`). Thiếu => lỗi 'google_not_configured' */
  getGoogleIdToken?: (nonce: string) => Promise<string>;
}

let defaultGoogle: ((nonce: string) => Promise<string>) | undefined;
/** Host đăng ký một lần lúc khởi động (api-client không phụ thuộc native) */
export function setGoogleIdTokenProvider(fn: ((nonce: string) => Promise<string>) | undefined): void {
  defaultGoogle = fn;
}

/** Làm mới sớm 30 s trước hạn để request đang bay không gặp token vừa hết hạn */
const EARLY_MS = 30_000;

export function createAuthSession(opts: SessionOptions = {}): AuthSession {
  const storage = () => opts.storage ?? gatewayStorage() ?? localStorageKV;
  const baseUrl = opts.baseUrl ?? gatewayBaseUrl;
  const now = opts.now ?? Date.now;
  const googleToken = () => opts.getGoogleIdToken ?? defaultGoogle;
  const listeners = new Set<(e: UserChange) => void>();
  let access: { token: string; exp: number } | null = null;
  let inflight: Promise<string> | null = null;
  /** Sau signed-out / merged-elsewhere: không gọi mạng, không tạo khách cho tới khi đăng nhập lại */
  let blocked: { code: string; message: string } | null = null;

  const emit = (e: UserChange) => listeners.forEach((cb) => cb(e));
  const blockedError = () => new GatewayRequestError('unauthorized', blocked!.message, 401, blocked!.code);

  async function load(): Promise<StoredAuth | null> {
    const raw = await storage().get(AUTH_STORAGE_KEY);
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as StoredAuth;
      return v && typeof v.refreshToken === 'string' && typeof v.userId === 'string' ? v : null;
    } catch {
      return null;
    }
  }
  const save = (v: StoredAuth) => storage().set(AUTH_STORAGE_KEY, JSON.stringify(v));

  /** POST tới /v1/*: lỗi mạng => 'offline' ngay (không treo các request phía sau) */
  async function post<S extends ZodTypeAny>(path: string, body: unknown, schema: S, bearer?: string): Promise<{ status: number; data?: z.infer<S>; error?: string }> {
    let res: Response;
    try {
      res = await fetch(`${baseUrl()}${path}`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
        body: JSON.stringify(body ?? {})
      });
    } catch (err) {
      throw new GatewayRequestError('offline', err instanceof Error ? err.message : 'Lỗi mạng');
    }
    if (!res.ok) {
      let error: string | undefined;
      try {
        error = ((await res.json()) as { error?: string }).error;
      } catch {
        /* thân lỗi không phải JSON */
      }
      return { status: res.status, error };
    }
    const parsed = schema.safeParse(await res.json());
    if (!parsed.success) throw new GatewayRequestError('contract', `Phản hồi ${path} lệch contract`);
    return { status: res.status, data: parsed.data };
  }

  function fail(status: number, path: string): never {
    const kind = status === 429 ? 'quota' : status === 503 ? 'unavailable' : status === 401 ? 'unauthorized' : 'server';
    throw new GatewayRequestError(kind, `${path} trả ${status}`, status);
  }

  /** Lỗi có mã máy đọc được (username_taken, invalid_credentials, identity_in_use...) cho giao diện */
  function failCoded(r: { status: number; error?: string }, path: string): never {
    const kind = r.status === 429 ? 'quota' : r.status === 503 ? 'unavailable' : r.status === 401 || r.status === 403 ? 'unauthorized' : r.status >= 500 ? 'server' : 'invalid-request';
    throw new GatewayRequestError(kind, `${path} trả ${r.status}`, r.status, r.error);
  }

  function adopt(t: AuthTokens): string {
    access = { token: t.accessToken, exp: now() + t.expiresIn * 1000 };
    return t.accessToken;
  }

  /** Phiên không dùng được nhưng KHÔNG xóa gì trên máy; chặn tới khi đăng nhập lại */
  function endSession(reason: 'signed-out' | 'merged-elsewhere', code: string, message: string): never {
    access = null;
    blocked = { code, message };
    emit({ reason, userId: null });
    throw blockedError();
  }
  const mergedElsewhere = () => endSession('merged-elsewhere', 'account_merged', 'Tiến độ máy này đã gộp vào tài khoản ở máy khác. Hãy đăng nhập.');

  /** Lưu tài khoản thật: XÓA mã khôi phục khỏi máy (không còn cửa sau tự dùng) */
  async function adoptAccount(res: AuthSignedIn, reason: 'signed-in' | 'merged'): Promise<void> {
    blocked = null;
    await save({ userId: res.userId, refreshToken: res.refreshToken, recoveryCode: null, kind: 'account', providers: res.providers });
    adopt(res);
    emit({ reason, userId: res.userId });
    if (res.restorable) emit({ reason: 'pending-deletion', userId: res.userId });
  }

  /** Tài khoản đã bị xóa ở máy khác: bỏ phiên trên máy, báo app, ném lỗi riêng */
  async function remoteDeleted(): Promise<never> {
    access = null;
    await storage().remove(AUTH_STORAGE_KEY);
    emit({ reason: 'remote-deleted', userId: null });
    throw new GatewayRequestError('unauthorized', 'Tài khoản đã bị xóa trên thiết bị khác', 401, 'account_deleted');
  }

  async function createGuest(): Promise<string> {
    const r = await post('/v1/auth/guest', {}, AuthGuestResponseSchema);
    if (!r.data) fail(r.status, '/v1/auth/guest');
    await save({ userId: r.data.userId, refreshToken: r.data.refreshToken, recoveryCode: r.data.recoveryCode, kind: 'guest' });
    emit({ reason: 'guest', userId: r.data.userId });
    return adopt(r.data);
  }

  async function obtain(): Promise<string> {
    if (blocked) throw blockedError();
    const stored = await load();
    if (!stored) return createGuest();
    const r = await post('/v1/auth/refresh', { refreshToken: stored.refreshToken }, AuthTokensSchema);
    if (r.data) {
      await save({ ...stored, refreshToken: r.data.refreshToken });
      return adopt(r.data);
    }
    if (r.status !== 401) fail(r.status, '/v1/auth/refresh');
    if (r.error === 'account_deleted') return remoteDeleted();
    if (r.error === 'account_merged' || r.error === 'account_upgraded') return mergedElsewhere();
    // Tài khoản thật: KHÔNG tự tạo khách (sẽ rơi vào tài khoản trống); báo đăng xuất, giữ dữ liệu trên máy
    if (stored.kind === 'account') return endSession('signed-out', 'signed_out', 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
    // Refresh token hỏng (vd. mất phản hồi lúc xoay vòng): cứu bằng mã khôi phục đã lưu
    if (stored.recoveryCode) {
      const rec = await post('/v1/auth/recover', { recoveryCode: stored.recoveryCode }, AuthTokensSchema);
      if (rec.data) {
        await save({ ...stored, userId: rec.data.userId, refreshToken: rec.data.refreshToken });
        return adopt(rec.data);
      }
      if (rec.status !== 401) fail(rec.status, '/v1/auth/recover');
      if (rec.error === 'account_deleted') return remoteDeleted();
      if (rec.error === 'account_merged' || rec.error === 'account_upgraded') return mergedElsewhere();
    }
    // Tài khoản không còn (đã xóa ở máy khác): bắt đầu tài khoản khách mới
    await storage().remove(AUTH_STORAGE_KEY);
    return createGuest();
  }

  function ensure(): Promise<string> {
    inflight ??= obtain().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  async function getToken(): Promise<string | null> {
    if (blocked) throw blockedError();
    if (access && access.exp - EARLY_MS > now()) return access.token;
    return ensure();
  }

  /** Bearer của khách đang có trên máy; không có phiên/đã là tài khoản => undefined (không tạo khách chỉ để đăng ký) */
  async function guestBearer(): Promise<string | undefined> {
    const st = await load();
    // Đã chặn (merged-elsewhere / signed-out): đăng nhập lại không kèm Bearer — đây là lối ra duy nhất của trạng thái chặn
    if (!st || st.kind === 'account' || blocked) return undefined;
    try {
      return (await getToken()) ?? undefined;
    } catch (err) {
      if (blocked) return undefined; // vừa phát hiện account_merged (vd. mở lại app): đăng nhập như máy chưa có phiên
      throw err;
    }
  }

  /** Gọi /v1/me/* có Bearer, gửi lại MỘT lần khi 401 (access token hết hạn) */
  async function authed<S extends ZodTypeAny>(method: 'GET' | 'POST', path: string, body: unknown, schema: S): Promise<z.infer<S>> {
    for (let attempt = 0; ; attempt++) {
      const token = await getToken();
      let res: Response;
      try {
        res = await fetch(`${baseUrl()}${path}`, {
          method,
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
          ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {})
        });
      } catch (err) {
        throw new GatewayRequestError('offline', err instanceof Error ? err.message : 'Lỗi mạng');
      }
      if (res.status === 401 && attempt === 0) {
        access = null;
        continue;
      }
      if (!res.ok) {
        let error: string | undefined;
        try {
          error = ((await res.json()) as { error?: string }).error;
        } catch {
          /* không phải JSON */
        }
        failCoded({ status: res.status, error }, path);
      }
      const parsed = schema.safeParse(await res.json());
      if (!parsed.success) throw new GatewayRequestError('contract', `Phản hồi ${path} lệch contract`);
      return parsed.data;
    }
  }

  return {
    getToken,

    async handleUnauthorized() {
      access = null;
      try {
        return Boolean(await ensure());
      } catch (err) {
        // để request() ném đúng mã account_deleted (không nuốt thành 401 chung)
        if (err instanceof GatewayRequestError && err.code === 'account_deleted') throw err;
        return false;
      }
    },

    async info() {
      const s = await load();
      return s ? { userId: s.userId, recoveryCode: s.recoveryCode } : null;
    },

    async recover(code) {
      const r = await post('/v1/auth/recover', { recoveryCode: code }, AuthTokensSchema);
      if (!r.data) {
        if (r.status === 400 || r.status === 401) throw new GatewayRequestError('unauthorized', 'Mã khôi phục không đúng', r.status, r.error === 'account_upgraded' ? 'account_upgraded' : 'invalid_recovery_code');
        fail(r.status, '/v1/auth/recover');
      }
      blocked = null;
      await save({ userId: r.data.userId, refreshToken: r.data.refreshToken, recoveryCode: formatRecoveryCode(code), kind: 'guest' });
      adopt(r.data);
      emit({ reason: 'recovered', userId: r.data.userId });
      return r.data.userId;
    },

    async deleteAccount() {
      if (!(await load())) {
        // máy này chưa từng có tài khoản: không có gì trên server để xóa
        emit({ reason: 'deleted', userId: null });
        return;
      }
      const token = await getToken();
      let res: Response;
      try {
        res = await fetch(`${baseUrl()}/v1/me`, { method: 'DELETE', headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
      } catch (err) {
        throw new GatewayRequestError('offline', err instanceof Error ? err.message : 'Lỗi mạng');
      }
      // 401 account_deleted = đã xóa trước đó (máy khác) => coi như xong
      if (!res.ok && res.status !== 401) fail(res.status, '/v1/me');
      if (res.ok && !DeleteMeResponseSchema.safeParse(await res.json()).success) throw new GatewayRequestError('contract', 'DELETE /v1/me lệch contract');
      access = null;
      await storage().remove(AUTH_STORAGE_KEY);
      emit({ reason: 'deleted', userId: null });
    },

    async register(username, password) {
      const bearer = await guestBearer();
      const r = await post('/v1/auth/register', { username, password }, AuthRegisterResponseSchema, bearer);
      if (!r.data) failCoded(r, '/v1/auth/register');
      await adoptAccount(r.data, 'signed-in');
      return r.data;
    },

    async login(username, password) {
      const r = await post('/v1/auth/login', { username, password }, AuthSignedInSchema);
      if (!r.data) failCoded(r, '/v1/auth/login');
      await adoptAccount(r.data, 'signed-in');
      return r.data;
    },

    async signInWithGoogle() {
      const getIdToken = googleToken();
      if (!getIdToken) throw new GatewayRequestError('unavailable', 'Đăng nhập Google chưa được cấu hình', undefined, 'google_not_configured');
      // nonce một lần do server cấp (Google ký vào ID token); lấy trước để cửa sổ chọn tài khoản không làm nonce hết hạn lâu
      let res: Response;
      try {
        res = await fetch(`${baseUrl()}/v1/auth/nonce`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      } catch (err) {
        throw new GatewayRequestError('offline', err instanceof Error ? err.message : 'Lỗi mạng');
      }
      if (!res.ok) failCoded({ status: res.status }, '/v1/auth/nonce');
      const nonce = AuthNonceResponseSchema.safeParse(await res.json());
      if (!nonce.success) throw new GatewayRequestError('contract', 'Phản hồi /v1/auth/nonce lệch contract');
      let idToken: string;
      try {
        idToken = await getIdToken(nonce.data.nonce);
      } catch (err) {
        throw new GatewayRequestError('invalid-request', err instanceof Error ? err.message : 'Đã hủy đăng nhập Google', undefined, 'google_cancelled');
      }
      const bearer = await guestBearer();
      const r = await post(bearer ? '/v1/me/identities/google' : '/v1/auth/google', { idToken, nonce: nonce.data.nonce }, AuthSignInResponseSchema, bearer);
      if (!r.data) failCoded(r, bearer ? '/v1/me/identities/google' : '/v1/auth/google');
      if (r.data.status === 'needs_merge') return r.data;
      await adoptAccount(r.data, 'signed-in');
      return r.data;
    },

    async merge(mergeTicket, strategy) {
      const bearer = await guestBearer();
      const r = await post('/v1/me/merge', { mergeTicket, strategy }, AuthSignedInSchema, bearer);
      if (!r.data) failCoded(r, '/v1/me/merge');
      await adoptAccount(r.data, 'merged');
      return r.data;
    },

    async restore() {
      const res = await authed('POST', '/v1/me/restore', {}, AuthSignedInSchema);
      await adoptAccount(res, 'signed-in');
      return res;
    },

    async logout(everywhere) {
      const st = await load();
      if (st) {
        let res: Response;
        try {
          res = await fetch(`${baseUrl()}/v1/auth/logout`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: st.refreshToken, ...(everywhere ? { everywhere: true } : {}) })
          });
        } catch (err) {
          throw new GatewayRequestError('offline', err instanceof Error ? err.message : 'Lỗi mạng');
        }
        if (!res.ok) failCoded({ status: res.status }, '/v1/auth/logout');
      }
      access = null;
      blocked = null;
      await storage().remove(AUTH_STORAGE_KEY);
      emit({ reason: 'signed-out', userId: null });
    },

    async identities() {
      return (await authed('GET', '/v1/me/identities', undefined, IdentityListResponseSchema)).identities;
    },

    onUserChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }
  };
}

let singleton: AuthSession | null = null;

/** Một phiên dùng chung cho cả app (Host gắn vào getToken; M12 dùng để khôi phục/xóa tài khoản) */
export function getAuthSession(): AuthSession {
  return (singleton ??= createAuthSession());
}

/** chỉ dùng cho test */
export function resetAuthSessionForTest(): void {
  singleton = null;
}
