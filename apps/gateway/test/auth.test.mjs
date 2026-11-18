import test from 'node:test';
import assert from 'node:assert/strict';
import { createSigner } from 'fast-jwt';
import { loadConfig } from '../dist/config.js';
import { makeApp, guest } from './helpers.mjs';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';

test('Cấu hình: AUTH_REQUIRED mặc định bật; dev/test tự sinh JWT_SECRET; production bắt buộc đặt', () => {
  const dev = loadConfig({ NODE_ENV: 'development' });
  assert.equal(dev.AUTH_REQUIRED, true);
  assert.ok(dev.JWT_SECRET && dev.JWT_SECRET.length >= 32);
  assert.equal(dev.jwtSecretGenerated, true);
  assert.equal(loadConfig({ NODE_ENV: 'test', JWT_SECRET: SECRET }).jwtSecretGenerated, false);
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /JWT_SECRET/);
});

test('Khách: tạo tài khoản => token dùng được, mã khôi phục dạng XXXX-XXXX-XXXX-XXXX; không token => 401', async () => {
  const a = await makeApp();
  try {
    assert.equal((await a.inject({ url: '/v1/speech/voices' })).statusCode, 401);
    const { body, headers } = await guest(a);
    assert.match(body.recoveryCode, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    assert.equal(body.expiresIn, 900);
    assert.equal((await a.inject({ url: '/v1/speech/voices', headers })).statusCode, 200);
    const other = await guest(a);
    assert.notEqual(other.body.userId, body.userId);
    assert.notEqual(other.body.recoveryCode, body.recoveryCode);
  } finally {
    await a.close();
  }
});

test('Refresh: xoay vòng — token mới dùng được, token cũ dùng lại => 401', async () => {
  const a = await makeApp();
  try {
    const { body } = await guest(a);
    const r1 = await a.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: body.refreshToken } });
    assert.equal(r1.statusCode, 200);
    assert.equal(r1.json().userId, body.userId);
    assert.notEqual(r1.json().refreshToken, body.refreshToken);
    const reuse = await a.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: body.refreshToken } });
    assert.equal(reuse.statusCode, 401);
    const r2 = await a.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: r1.json().refreshToken } });
    assert.equal(r2.statusCode, 200);
  } finally {
    await a.close();
  }
});

test('Khôi phục: nhập mã (chữ thường, khoảng trắng) => cùng tài khoản; mã sai => 401', async () => {
  const a = await makeApp();
  try {
    const { body } = await guest(a);
    const typed = body.recoveryCode.toLowerCase().replace(/-/g, ' ');
    const ok = await a.inject({ method: 'POST', url: '/v1/auth/recover', payload: { recoveryCode: typed } });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().userId, body.userId);
    const wrong = await a.inject({ method: 'POST', url: '/v1/auth/recover', payload: { recoveryCode: '0000-0000-0000-0000' } });
    assert.equal(wrong.statusCode, 401);
    const malformed = await a.inject({ method: 'POST', url: '/v1/auth/recover', payload: { recoveryCode: 'abc' } });
    assert.equal(malformed.statusCode, 400);
  } finally {
    await a.close();
  }
});

test('Token: JWT ký đúng nhưng không phải access token, hoặc user không tồn tại => 401', async () => {
  const a = await makeApp({ JWT_SECRET: SECRET });
  try {
    const sign = createSigner({ key: SECRET });
    const { body } = await guest(a);
    const noTyp = await a.inject({ url: '/v1/speech/voices', headers: { authorization: `Bearer ${sign({ sub: body.userId })}` } });
    assert.equal(noTyp.statusCode, 401);
    const ghost = await a.inject({
      url: '/v1/speech/voices',
      headers: { authorization: `Bearer ${sign({ sub: '00000000-0000-4000-8000-000000000000', typ: 'access' })}` }
    });
    assert.equal(ghost.statusCode, 401);
    assert.equal(ghost.json().error, 'account_deleted');
  } finally {
    await a.close();
  }
});

test('Giới hạn theo IP cho /auth: quá AUTH_RATE_LIMIT_PER_MINUTE => 429', async () => {
  const a = await makeApp({ AUTH_RATE_LIMIT_PER_MINUTE: '3' });
  try {
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await a.inject({ method: 'POST', url: '/v1/auth/guest' })).statusCode);
    assert.deepEqual(codes, [200, 200, 200, 429]);
  } finally {
    await a.close();
  }
});

test('Tài khoản đã xóa ở máy khác: refresh/recover bằng credential cũ => account_deleted (khác token hỏng)', async () => {
  const a = await makeApp();
  try {
    const A = await guest(a);
    // máy B: một refresh token khác của cùng tài khoản (đăng nhập bằng mã khôi phục)
    const B = (await a.inject({ method: 'POST', url: '/v1/auth/recover', payload: { recoveryCode: A.body.recoveryCode } })).json();
    assert.equal((await a.inject({ method: 'DELETE', url: '/v1/me', headers: A.headers })).statusCode, 200);

    const refreshB = await a.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: B.refreshToken } });
    assert.equal(refreshB.statusCode, 401);
    assert.equal(refreshB.json().error, 'account_deleted');
    const recoverB = await a.inject({ method: 'POST', url: '/v1/auth/recover', payload: { recoveryCode: A.body.recoveryCode } });
    assert.equal(recoverB.statusCode, 401);
    assert.equal(recoverB.json().error, 'account_deleted');

    const junk = await a.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: 'x'.repeat(43) } });
    assert.equal(junk.json().error, 'invalid_refresh_token');
  } finally {
    await a.close();
  }
});
