/**
 * Cầu nối đăng nhập Google → ID token (dự án 3, Task 6). Gateway kiểm token bằng JWKS; client KHÔNG giữ secret.
 *
 * - Android/iOS: Credential Manager qua plugin `@capgo/capacitor-social-login` 7.19.0 (MIT, hỗ trợ Capacitor 7;
 *   các bản 7.19.1+ đổi sang MPL-2.0 nên ghim đúng 7.19.0). Nạp LƯỜI để không vào gói tải đầu.
 * - Web: Google Identity Services (`accounts.google.com/gsi/client`) nạp lười khi bấm nút.
 * - Chưa cấu hình OAuth client (`configureGoogleIdentity({ webClientId })` từ biến build) ⇒ `isGoogleSignInAvailable()`
 *   là false (giao diện ẩn nút) và `getGoogleIdToken` ném IdentityError('not_configured') — app không sập.
 * Nonce do Gateway cấp (một lần) và được Google ký vào ID token.
 */
import { Capacitor } from '@capacitor/core';

export type IdentityErrorCode = 'not_configured' | 'cancelled' | 'failed';
export class IdentityError extends Error {
  constructor(
    public readonly code: IdentityErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'IdentityError';
  }
}

let webClientId: string | undefined;
let nativeReady: Promise<void> | null = null;

/** Host gọi một lần lúc khởi động với Web client ID (public, không phải secret). Rỗng/thiếu = tắt Google */
export function configureGoogleIdentity(cfg: { webClientId?: string | null }): void {
  const id = cfg.webClientId?.trim() || undefined;
  if (id !== webClientId) nativeReady = null;
  webClientId = id;
}

export function isGoogleSignInAvailable(): boolean {
  return Boolean(webClientId);
}

/** Nhận ID token Google gắn với `nonce`. Ném IdentityError('cancelled') khi người dùng đóng hộp chọn tài khoản */
export async function getGoogleIdToken(nonce: string): Promise<string> {
  if (!webClientId) throw new IdentityError('not_configured', 'Đăng nhập Google chưa được cấu hình');
  return Capacitor.isNativePlatform() ? nativeIdToken(webClientId, nonce) : webIdToken(webClientId, nonce);
}

// ---------------- Native (Credential Manager) ----------------

async function nativeIdToken(clientId: string, nonce: string): Promise<string> {
  try {
    const { SocialLogin } = await import('@capgo/capacitor-social-login');
    nativeReady ??= SocialLogin.initialize({ google: { webClientId: clientId } });
    await nativeReady;
    const res = await SocialLogin.login({ provider: 'google', options: { nonce, scopes: ['openid', 'email', 'profile'] } });
    const r = res.result;
    if (r.responseType !== 'online' || !r.idToken) throw new IdentityError('failed', 'Google không trả ID token');
    return r.idToken;
  } catch (err) {
    nativeReady = null;
    if (err instanceof IdentityError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new IdentityError(/cancel|dismiss/i.test(msg) ? 'cancelled' : 'failed', msg);
  }
}

// ---------------- Web (Google Identity Services) ----------------

interface GsiNotification {
  isNotDisplayed(): boolean;
  isSkippedMoment(): boolean;
  isDismissedMoment(): boolean;
  getDismissedReason?(): string;
}
interface GsiId {
  initialize(cfg: { client_id: string; nonce: string; callback: (r: { credential?: string }) => void; use_fedcm_for_prompt?: boolean; cancel_on_tap_outside?: boolean }): void;
  prompt(cb?: (n: GsiNotification) => void): void;
  cancel(): void;
}
type GsiGlobal = { google?: { accounts?: { id?: GsiId } } };

const GSI_SRC = 'https://accounts.google.com/gsi/client';
let gsiLoading: Promise<GsiId> | null = null;

function loadGsi(): Promise<GsiId> {
  const g = globalThis as unknown as GsiGlobal & { document?: Document };
  const ready = g.google?.accounts?.id;
  if (ready) return Promise.resolve(ready);
  const doc = g.document;
  if (!doc) return Promise.reject(new IdentityError('failed', 'Không có trình duyệt'));
  gsiLoading ??= new Promise<GsiId>((resolve, reject) => {
    const el = doc.createElement('script');
    el.src = GSI_SRC;
    el.async = true;
    el.onload = () => {
      const id = (globalThis as unknown as GsiGlobal).google?.accounts?.id;
      if (id) resolve(id);
      else {
        gsiLoading = null;
        reject(new IdentityError('failed', 'Google Identity Services không khởi tạo được'));
      }
    };
    el.onerror = () => {
      gsiLoading = null;
      reject(new IdentityError('failed', 'Không tải được Google Identity Services (mất mạng?)'));
    };
    doc.head.appendChild(el);
  });
  return gsiLoading;
}

async function webIdToken(clientId: string, nonce: string): Promise<string> {
  const gsi = await loadGsi();
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    gsi.initialize({
      client_id: clientId,
      nonce,
      use_fedcm_for_prompt: true,
      cancel_on_tap_outside: true,
      callback: (r) => done(() => (r.credential ? resolve(r.credential) : reject(new IdentityError('failed', 'Google không trả ID token'))))
    });
    gsi.prompt((n) => {
      if (n.isDismissedMoment() && n.getDismissedReason?.() === 'credential_returned') return; // callback sẽ chạy
      if (n.isNotDisplayed() || n.isSkippedMoment() || n.isDismissedMoment()) done(() => reject(new IdentityError('cancelled', 'Không mở được hộp đăng nhập Google')));
    });
  });
}
