import { createRemoteJWKSet, errors as joseErrors, jwtVerify, type JWTVerifyGetKey } from 'jose';

/**
 * Nhà cung cấp danh tính (Nguyên tắc 4: code gọi `identity.verify`, không gọi thẳng tên hãng).
 * Ruột đầu tiên: Google — kiểm ID token bằng thư viện `jose` (MIT, https://github.com/panva/jose), KHÔNG tự viết phần JWT.
 *
 * Tham khảo (chỉ lấy ý, không chép mã):
 * - Google "Authenticate with a backend server": https://developers.google.com/identity/sign-in/web/backend-auth
 *   (kiểm chữ ký bằng khóa công khai Google, `aud` = client ID của app, `iss`, `exp`).
 * - Tài liệu jose `createRemoteJWKSet` + `jwtVerify` (MIT): https://github.com/panva/jose/blob/main/docs
 *
 * Danh tính khóa theo `sub` (không theo email — chống chiếm tài khoản khi trùng email). Email chỉ giữ bản che để hiển thị.
 */
export interface VerifiedIdentity {
  /** Google `sub` — ổn định, duy nhất theo tài khoản Google */
  subject: string;
  /** 'm***@gmail.com' hoặc null nếu token không có email */
  emailMasked: string | null;
  emailVerified: boolean;
}

export interface IdentityProvider {
  readonly name: 'google';
  /** Ném IdentityTokenError (token sai) hoặc IdentityUnavailableError (không lấy được khóa công khai) */
  verify(idToken: string, nonce: string): Promise<VerifiedIdentity>;
}

/** Token không hợp lệ (chữ ký, aud, iss, exp, nonce, email chưa xác minh…) => 401 */
export class IdentityTokenError extends Error {
  constructor(public reason: string) {
    super(`invalid id token: ${reason}`);
  }
}
/** Không kiểm được vì phía nhà cung cấp (tải JWKS lỗi/hết giờ) => 503 provider_unavailable */
export class IdentityUnavailableError extends Error {}

export const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

export interface GoogleProviderOptions {
  /** Client ID hợp lệ cho `aud`: Web client (Android Credential Manager cũng phát token với aud = Web client ID) + bổ sung */
  audiences: string[];
  /** Mặc định JWKS từ xa của Google (jose tự cache + xử lý xoay khóa). Test tiêm bộ khóa cục bộ (createLocalJWKSet). */
  keys?: JWTVerifyGetKey;
  /** Lệch đồng hồ cho phép (giây) */
  clockToleranceS?: number;
}

/** 'mai.le@gmail.com' => 'm***@gmail.com' */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

export function createGoogleIdentityProvider(opts: GoogleProviderOptions): IdentityProvider {
  if (!opts.audiences.length) throw new Error('Google identity: cần ít nhất một client ID');
  const keys = opts.keys ?? createRemoteJWKSet(new URL(GOOGLE_JWKS_URL), { timeoutDuration: 4000 });
  return {
    name: 'google',
    async verify(idToken, nonce) {
      let payload: Record<string, unknown>;
      try {
        ({ payload } = await jwtVerify(idToken, keys, {
          issuer: GOOGLE_ISSUERS,
          audience: opts.audiences,
          algorithms: ['RS256'],
          requiredClaims: ['sub', 'exp', 'iat', 'aud', 'iss'],
          clockTolerance: opts.clockToleranceS ?? 5
        }));
      } catch (err) {
        // Lỗi mạng khi tải khóa công khai: không phải lỗi của người dùng
        // JWKSTimeout; lỗi fetch (TypeError); JOSEError chung (ERR_JOSE_GENERIC) = Google trả không phải 200 / JSON hỏng.
        // Mọi lỗi kiểm token cụ thể (chữ ký, claim, không khớp khóa…) là lớp con có mã riêng => 401.
        const generic = err instanceof joseErrors.JOSEError && (err as { code?: string }).code === 'ERR_JOSE_GENERIC';
        if (err instanceof joseErrors.JWKSTimeout || generic || (err instanceof Error && !(err instanceof joseErrors.JOSEError))) {
          throw new IdentityUnavailableError('jwks unavailable');
        }
        throw new IdentityTokenError((err as { code?: string }).code ?? 'verify_failed');
      }
      // nonce do server cấp (GET /v1/auth/nonce) phải nằm trong token => chống phát lại token bị đánh cắp
      if (typeof payload.nonce !== 'string' || payload.nonce !== nonce) throw new IdentityTokenError('nonce_mismatch');
      const sub = payload.sub;
      if (typeof sub !== 'string' || !sub || sub.length > 255) throw new IdentityTokenError('bad_sub');
      // Chỉ chấp nhận email đã được Google xác minh (yêu cầu Task 3). Danh tính vẫn khóa theo `sub`, KHÔNG theo email.
      if (payload.email_verified !== true) throw new IdentityTokenError('email_not_verified');
      const email = typeof payload.email === 'string' ? payload.email : null;
      return { subject: sub, emailMasked: email ? maskEmail(email) : null, emailVerified: true };
    }
  };
}

/**
 * Đọc cấu hình từ biến môi trường: `GOOGLE_WEB_CLIENT_ID` (bắt buộc để bật), `GOOGLE_EXTRA_AUDIENCES` (tùy chọn, cách nhau
 * bằng dấu phẩy). Chưa cấu hình => null: route Google trả 503 `provider_unavailable`, Gateway vẫn chạy bình thường.
 * (Tạm đọc thẳng env ở đây vì Task 3 không được sửa config.ts — việc sau: chuyển vào schema config.)
 */
export function createIdentityProviderFromEnv(env: NodeJS.ProcessEnv = process.env): IdentityProvider | null {
  const web = env.GOOGLE_WEB_CLIENT_ID?.trim();
  if (!web) return null;
  const extra = (env.GOOGLE_EXTRA_AUDIENCES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return createGoogleIdentityProvider({ audiences: [web, ...extra] });
}
