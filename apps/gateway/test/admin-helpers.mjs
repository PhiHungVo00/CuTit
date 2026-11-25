import * as OTPAuth from 'otpauth';
import { createDbProvider, schema } from '../dist/db/client.js';
import { runAdminCli } from '../dist/scripts/admin-cli.js';
import { makeApp } from './helpers.mjs';

/** Khóa/bí mật CHỈ cho test (không phải khóa thật) */
export const ADMIN_ORIGIN = 'http://localhost:5180';
export const APP_ORIGIN = 'http://localhost:3000';
export const MFA_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
export const ADMIN_JWT_SECRET = 'test-admin-jwt-secret-0123456789-abcdefghij';
export const APP_JWT_SECRET = 'test-app-jwt-secret-9876543210-zyxwvutsrq';
export const PW = 'ca-phe-sua-da-42';

export const ADMIN_ENV = {
  AUTH_RATE_LIMIT_PER_MINUTE: '1000',
  AUTH_LOGIN_SLOWDOWN_MS: '0',
  ADMIN_API_ENABLED: 'true',
  ADMIN_ORIGIN,
  ADMIN_MFA_KEY: MFA_KEY,
  ADMIN_JWT_SECRET,
  JWT_SECRET: APP_JWT_SECRET,
  // CORS_ORIGIN cố ý gồm cả ADMIN_ORIGIN: /v1 vẫn phải loại nó (không thì test "loại" đúng một cách tầm thường)
  CORS_ORIGIN: `${APP_ORIGIN},${ADMIN_ORIGIN}`
};

/** Nhà cung cấp thư giả: đếm thư đã gửi */
export function fakeMail(available = true) {
  const sent = [];
  return {
    name: 'fake',
    sent,
    available: () => available,
    send: async (to, subjectVi, subjectEn, body) => {
      sent.push({ to, subjectVi, subjectEn, body });
    }
  };
}

/**
 * App quản trị + DB dùng chung + đồng hồ giả tăng được (`advance(ms)`).
 * `ctx.close()` đóng cả app lẫn DB.
 */
export async function makeAdminApp(env = {}, { mail = fakeMail(false), startAt = Date.now() } = {}) {
  const dbp = createDbProvider({ PGLITE_DIR: 'memory://' });
  const state = { now: startAt };
  const clock = () => new Date(state.now);
  const app = await makeApp({ ...ADMIN_ENV, ...env }, { db: dbp, clock, mail });
  const ctx = {
    app,
    dbp,
    mail,
    state,
    clock,
    advance: (ms) => {
      state.now += ms;
    },
    db: () => dbp.get(),
    close: async () => {
      await app.close();
      await dbp.close();
    }
  };
  return ctx;
}

export const post = (ctx, url, payload, extra = {}) => ctx.app.inject({ method: 'POST', url, payload, ...extra });

/** Đăng ký tài khoản mật khẩu (dự án 3) và trả userId */
export async function registerUser(ctx, username, password = PW) {
  const res = await post(ctx, '/v1/auth/register', { username, password });
  if (res.statusCode !== 200) throw new Error(`register ${res.statusCode}: ${res.body}`);
  const d = await ctx.db();
  const { eq, and } = await import('drizzle-orm');
  const [row] = await d
    .select({ userId: schema.identities.userId })
    .from(schema.identities)
    .where(and(eq(schema.identities.provider, 'password'), eq(schema.identities.subject, username)));
  return { userId: row.userId, appAccessToken: res.json().accessToken };
}

export async function grant(ctx, username, role = 'owner') {
  const r = await runAdminCli(['grant', '--username', username, '--role', role], { db: await ctx.db(), now: ctx.clock });
  if (r.code !== 0) throw new Error(`grant: ${r.message}`);
}

/** Tạo tài khoản + cấp owner */
export async function makeStaff(ctx, username = 'chu.app') {
  const u = await registerUser(ctx, username);
  await grant(ctx, username);
  return { username, ...u };
}

export const login = (ctx, username, password = PW, extra = {}) => post(ctx, '/admin/v1/auth/login', { username, password }, extra);

export const codeFor = (secretBase32, at) =>
  new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secretBase32), algorithm: 'SHA1', digits: 6, period: 30 }).generate({ timestamp: at });

/** `admin_refresh=<token>` từ Set-Cookie của phản hồi */
export const cookieOf = (res) => {
  const raw = [].concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('admin_refresh='));
  return raw ? raw.split(';')[0] : null;
};

/** login → enroll → confirm (lần đầu). Trả secret, mã dự phòng, access, cookie */
export async function enrollFully(ctx, username, extra = {}) {
  const l = await login(ctx, username, PW, extra);
  if (l.statusCode !== 200 || l.json().next !== 'enroll') throw new Error(`login/enroll: ${l.statusCode} ${l.body}`);
  const ticket = l.json().ticket;
  const e = await post(ctx, '/admin/v1/auth/totp/enroll', { ticket }, extra);
  if (e.statusCode !== 200) throw new Error(`enroll ${e.statusCode} ${e.body}`);
  const { secret, otpauthUrl } = e.json();
  const c = await post(ctx, '/admin/v1/auth/totp/confirm', { ticket, code: codeFor(secret, ctx.state.now) }, extra);
  if (c.statusCode !== 200) throw new Error(`confirm ${c.statusCode} ${c.body}`);
  return { secret, otpauthUrl, backupCodes: c.json().backupCodes, accessToken: c.json().accessToken, cookie: cookieOf(c), res: c };
}

/** Đăng nhập lần sau (đã đăng ký mã): tự lùi đồng hồ qua bước 30 giây kế để mã không trùng bước đã dùng */
export async function loginWithTotp(ctx, username, secret, extra = {}) {
  ctx.advance(31_000);
  const l = await login(ctx, username, PW, extra);
  if (l.statusCode !== 200 || l.json().next !== 'totp') throw new Error(`login/totp: ${l.statusCode} ${l.body}`);
  const t = await post(ctx, '/admin/v1/auth/totp', { ticket: l.json().ticket, code: codeFor(secret, ctx.state.now) }, extra);
  if (t.statusCode !== 200) throw new Error(`totp ${t.statusCode} ${t.body}`);
  return { accessToken: t.json().accessToken, cookie: cookieOf(t), res: t };
}

export const bearer = (token) => ({ authorization: `Bearer ${token}` });
export const sessionInfo = (ctx, token) => ctx.app.inject({ method: 'GET', url: '/admin/v1/session', headers: bearer(token) });
export const refresh = (ctx, cookie, headers = {}) => ctx.app.inject({ method: 'POST', url: '/admin/v1/auth/refresh', headers: { cookie, ...headers } });

export const MIN = 60_000;
export const HOUR = 3_600_000;
