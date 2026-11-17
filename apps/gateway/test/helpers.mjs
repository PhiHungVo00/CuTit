import { loadConfig } from '../dist/config.js';
import { buildApp } from '../dist/app.js';

export const ORIGIN = 'http://localhost:3000';

/** App với cấu hình mặc định (AUTH_REQUIRED bật, PGlite memory). */
export const makeApp = (env = {}, opts = {}) =>
  buildApp(loadConfig({ NODE_ENV: 'test', CORS_ORIGIN: ORIGIN, ...env }), { logger: false, ...opts });

/** Tạo tài khoản khách, trả về header Authorization + body (token, recoveryCode, userId). */
export async function guest(app) {
  const res = await app.inject({ method: 'POST', url: '/v1/auth/guest' });
  if (res.statusCode !== 200) throw new Error(`guest ${res.statusCode}: ${res.body}`);
  const body = res.json();
  return { body, headers: { authorization: `Bearer ${body.accessToken}` } };
}
