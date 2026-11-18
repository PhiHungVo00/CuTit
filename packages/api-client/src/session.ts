/**
 * Phiên tài khoản khách phía client (import lười: `@vietlearning/api-client/session`).
 *
 * - Tài khoản khách được tạo LƯỜI ở lần gọi Gateway đầu tiên cần token (không bắt đăng ký).
 * - Access token chỉ giữ trong RAM; refresh token + mã khôi phục lưu bằng `gatewayStorage()`
 *   (Capacitor Preferences trên app, localStorage trên web) — không bao giờ có secret của server.
 * - Single-flight: nhiều request song song lúc khởi động chỉ tạo/làm mới MỘT lần.
 * - Thứ tự cứu phiên khi refresh thất bại (vd. mất phản hồi giữa lúc xoay vòng token):
 *   refresh → khôi phục bằng mã đã lưu → cuối cùng mới tạo khách mới.
 * - Gateway báo `account_deleted` (tài khoản đã bị xóa ở máy khác): xóa phiên, phát `remote-deleted` và NÉM lỗi
 *   (không tạo khách mới trong cùng lần gọi — request đang chờ gửi lại sẽ không rơi vào tài khoản mới).
 *   App xóa dữ liệu trên máy; lần gọi sau mới tạo khách mới như người dùng mới.
 */
import type { ZodTypeAny, z } from 'zod';
import {
  AuthGuestResponseSchema,
  AuthTokensSchema,
  DeleteMeResponseSchema,
  formatRecoveryCode,
  type AuthTokens
} from '@vietlearning/contracts/api';
import { GatewayRequestError, gatewayBaseUrl, gatewayStorage, type KeyValue } from './index.js';

export const AUTH_STORAGE_KEY = 'becutit.auth';
/** GĐ4b: phiên phụ huynh được cất khi máy đang dùng hồ sơ trẻ (có khóa này = đang ở chế độ trẻ) */
export const PARENT_AUTH_STORAGE_KEY = `${AUTH_STORAGE_KEY}.parent`;

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
  /** dạng XXXX-XXXX-XXXX-XXXX; null nếu máy này không biết mã (hiếm) */
  recoveryCode: string | null;
}

/** remote-deleted = tài khoản bị xóa ở máy khác (Gateway trả account_deleted); switched = đổi hồ sơ phụ huynh ↔ trẻ */
export type UserChangeReason = 'guest' | 'recovered' | 'deleted' | 'remote-deleted' | 'switched';
export interface UserChange {
  reason: UserChangeReason;
  /** null khi tài khoản vừa bị xóa */
  userId: string | null;
}

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
  onUserChange(cb: (e: UserChange) => void): () => void;
  /**
   * GĐ4b: chuyển máy sang hồ sơ trẻ bằng token phụ huynh vừa xin (POST /v1/family/children/:id/session).
   * Phiên phụ huynh được cất riêng. CHỈ gọi qua SyncEngine.pullAndReplace (sau khi hàng đợi đã gửi hết).
   */
  switchToChild(tokens: AuthTokens): Promise<void>;
  /** Trả máy về phiên phụ huynh đã cất (sau cổng phụ huynh). Không có phiên cất => lỗi */
  switchToParent(): Promise<void>;
  /** Phiên phụ huynh đang cất (null = máy không ở chế độ trẻ) */
  parentInfo(): Promise<{ userId: string; recoveryCode: string | null } | null>;
}

export interface SessionOptions {
  storage?: KeyValue;
  baseUrl?: () => string;
  now?: () => number;
}

/** Làm mới sớm 30 s trước hạn để request đang bay không gặp token vừa hết hạn */
const EARLY_MS = 30_000;

export function createAuthSession(opts: SessionOptions = {}): AuthSession {
  const storage = () => opts.storage ?? gatewayStorage() ?? localStorageKV;
  const baseUrl = opts.baseUrl ?? gatewayBaseUrl;
  const now = opts.now ?? Date.now;
  const listeners = new Set<(e: UserChange) => void>();
  let access: { token: string; exp: number } | null = null;
  let inflight: Promise<string> | null = null;

  const emit = (e: UserChange) => listeners.forEach((cb) => cb(e));

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

  /** POST tới /v1/auth/*: lỗi mạng => 'offline' ngay (không treo các request phía sau) */
  async function post<S extends ZodTypeAny>(path: string, body: unknown, schema: S): Promise<{ status: number; data?: z.infer<S>; error?: string }> {
    let res: Response;
    try {
      res = await fetch(`${baseUrl()}${path}`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
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

  function adopt(t: AuthTokens): string {
    access = { token: t.accessToken, exp: now() + t.expiresIn * 1000 };
    return t.accessToken;
  }

  /** Tài khoản đã bị xóa ở máy khác: bỏ phiên trên máy, báo app, ném lỗi riêng */
  async function loadParent(): Promise<StoredAuth | null> {
    const raw = await storage().get(PARENT_AUTH_STORAGE_KEY);
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as StoredAuth;
      return v && typeof v.refreshToken === 'string' && typeof v.userId === 'string' ? v : null;
    } catch {
      return null;
    }
  }

  async function remoteDeleted(): Promise<never> {
    access = null;
    // Hồ sơ trẻ bị phụ huynh xóa: máy quay về phiên phụ huynh đã cất (không tạo khách mới)
    const parent = await loadParent();
    if (parent) {
      await save(parent);
      await storage().remove(PARENT_AUTH_STORAGE_KEY);
    } else await storage().remove(AUTH_STORAGE_KEY);
    emit({ reason: 'remote-deleted', userId: parent?.userId ?? null });
    throw new GatewayRequestError('unauthorized', 'Tài khoản đã bị xóa trên thiết bị khác', 401, 'account_deleted');
  }

  async function createGuest(): Promise<string> {
    const r = await post('/v1/auth/guest', {}, AuthGuestResponseSchema);
    if (!r.data) fail(r.status, '/v1/auth/guest');
    await save({ userId: r.data.userId, refreshToken: r.data.refreshToken, recoveryCode: r.data.recoveryCode });
    emit({ reason: 'guest', userId: r.data.userId });
    return adopt(r.data);
  }

  async function obtain(): Promise<string> {
    const stored = await load();
    if (!stored) return createGuest();
    const r = await post('/v1/auth/refresh', { refreshToken: stored.refreshToken }, AuthTokensSchema);
    if (r.data) {
      await save({ ...stored, refreshToken: r.data.refreshToken });
      return adopt(r.data);
    }
    if (r.status !== 401) fail(r.status, '/v1/auth/refresh');
    if (r.error === 'account_deleted') return remoteDeleted();
    // Hồ sơ trẻ (không có mã khôi phục): KHÔNG rơi xuống tạo khách người lớn — thế là thoát chế độ trẻ.
    // Phụ huynh mở lại hồ sơ qua cổng phụ huynh (cấp phiên mới).
    if (await loadParent()) throw new GatewayRequestError('unauthorized', 'Phiên hồ sơ trẻ hết hạn', 401, 'child_session_expired');
    // Refresh token hỏng (vd. mất phản hồi lúc xoay vòng): cứu bằng mã khôi phục đã lưu
    if (stored.recoveryCode) {
      const rec = await post('/v1/auth/recover', { recoveryCode: stored.recoveryCode }, AuthTokensSchema);
      if (rec.data) {
        await save({ ...stored, userId: rec.data.userId, refreshToken: rec.data.refreshToken });
        return adopt(rec.data);
      }
      if (rec.status !== 401) fail(rec.status, '/v1/auth/recover');
      if (rec.error === 'account_deleted') return remoteDeleted();
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

  return {
    async getToken() {
      if (access && access.exp - EARLY_MS > now()) return access.token;
      return ensure();
    },

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
        if (r.status === 400 || r.status === 401) throw new GatewayRequestError('unauthorized', 'Mã khôi phục không đúng', r.status, 'invalid_recovery_code');
        fail(r.status, '/v1/auth/recover');
      }
      await save({ userId: r.data.userId, refreshToken: r.data.refreshToken, recoveryCode: formatRecoveryCode(code) });
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
      const token = await this.getToken();
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

    onUserChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    async switchToChild(t) {
      const parked = await loadParent();
      const current = await load();
      // đang ở hồ sơ trẻ khác: giữ phiên phụ huynh đã cất; chưa thì cất phiên hiện tại (phụ huynh)
      if (!parked) {
        if (!current) throw new GatewayRequestError('unauthorized', 'Chưa có tài khoản phụ huynh trên máy', 401);
        await storage().set(PARENT_AUTH_STORAGE_KEY, JSON.stringify(current));
      }
      await save({ userId: t.userId, refreshToken: t.refreshToken, recoveryCode: null });
      adopt(t);
      emit({ reason: 'switched', userId: t.userId });
    },

    async switchToParent() {
      const parked = await loadParent();
      if (!parked) throw new GatewayRequestError('unauthorized', 'Không có phiên phụ huynh trên máy', 401, 'no_parent_session');
      access = null;
      await save(parked);
      await storage().remove(PARENT_AUTH_STORAGE_KEY);
      emit({ reason: 'switched', userId: parked.userId });
    },

    async parentInfo() {
      const p = await loadParent();
      return p ? { userId: p.userId, recoveryCode: p.recoveryCode } : null;
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
