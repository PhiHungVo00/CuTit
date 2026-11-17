import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { configureGateway, request, GatewayRequestError } from '../dist/index.js';
import { createAuthSession, AUTH_STORAGE_KEY } from '../dist/session.js';

const realFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = realFetch;
  configureGateway({ getToken: undefined, onUnauthorized: undefined });
});

const memStore = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { m, get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v), remove: async (k) => void m.delete(k) };
};
const uid = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const tokens = (n, extra = {}) => ({ accessToken: `access-${n}-xxxxxxxx`, refreshToken: `refresh-${n}-xxxxxxxxxxxxxxxx`, expiresIn: 900, userId: uid(1), ...extra });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

/** Gateway giả: ghi lại các lần gọi, trả theo bảng `routes[path]` (hàm hoặc mảng phản hồi lần lượt) */
function fakeGateway(routes) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({ path, init });
    const r = routes[path];
    if (!r) return json({ error: 'not_found' }, 404);
    return typeof r === 'function' ? r(init, calls) : r.shift();
  };
  return calls;
}

const opts = (storage, now = () => 0) => ({ storage, baseUrl: () => 'http://gw.test', now });

test('Khách lười: 3 request song song lúc khởi động chỉ tạo MỘT tài khoản; lưu refresh token + mã khôi phục', async () => {
  const calls = fakeGateway({ '/v1/auth/guest': () => json({ ...tokens(1), recoveryCode: 'ABCD-EFGH-JKMN-PQRS' }) });
  const store = memStore();
  const s = createAuthSession(opts(store));
  const got = await Promise.all([s.getToken(), s.getToken(), s.getToken()]);
  assert.deepEqual(got, Array(3).fill('access-1-xxxxxxxx'));
  assert.equal(calls.filter((c) => c.path === '/v1/auth/guest').length, 1);
  assert.deepEqual(await s.info(), { userId: uid(1), recoveryCode: 'ABCD-EFGH-JKMN-PQRS' });
  assert.match(store.m.get(AUTH_STORAGE_KEY), /refresh-1/);
});

test('Hết hạn => refresh (xoay vòng, lưu token mới); refresh 401 => khôi phục bằng mã đã lưu', async () => {
  let t = 0;
  const store = memStore({ [AUTH_STORAGE_KEY]: JSON.stringify({ userId: uid(1), refreshToken: 'refresh-0-xxxxxxxxxxxxxxxx', recoveryCode: 'ABCD-EFGH-JKMN-PQRS' }) });
  const calls = fakeGateway({
    '/v1/auth/refresh': [json(tokens(2)), json({ error: 'invalid_refresh_token' }, 401)],
    '/v1/auth/recover': [json(tokens(3))]
  });
  const s = createAuthSession(opts(store, () => t));
  assert.equal(await s.getToken(), 'access-2-xxxxxxxx');
  assert.match(store.m.get(AUTH_STORAGE_KEY), /refresh-2/);
  assert.equal(await s.getToken(), 'access-2-xxxxxxxx', 'còn hạn: không gọi mạng');
  t = 900_000;
  assert.equal(await s.getToken(), 'access-3-xxxxxxxx');
  assert.deepEqual(calls.map((c) => c.path), ['/v1/auth/refresh', '/v1/auth/refresh', '/v1/auth/recover']);
  assert.equal(JSON.parse(calls[2].init.body).recoveryCode, 'ABCD-EFGH-JKMN-PQRS');
  assert.match(store.m.get(AUTH_STORAGE_KEY), /refresh-3/);
});

test('Mất mạng khi tạo khách => lỗi offline ngay (không treo)', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  const s = createAuthSession(opts(memStore()));
  await assert.rejects(s.getToken(), (e) => e instanceof GatewayRequestError && e.kind === 'offline');
});

test('Khôi phục trên máy mới: đổi userId, lưu mã đã nhập, báo onUserChange; mã sai => unauthorized', async () => {
  fakeGateway({ '/v1/auth/recover': [json({ error: 'invalid_recovery_code' }, 401), json(tokens(5, { userId: uid(7) }))] });
  const store = memStore();
  const s = createAuthSession(opts(store));
  const seen = [];
  s.onUserChange((e) => seen.push(e));
  await assert.rejects(s.recover('0000-0000-0000-0000'), (e) => e.kind === 'unauthorized' && e.code === 'invalid_recovery_code');
  assert.equal(await s.recover('abcd efgh jkmn pqrs'), uid(7));
  assert.deepEqual(seen, [{ reason: 'recovered', userId: uid(7) }]);
  assert.deepEqual(await s.info(), { userId: uid(7), recoveryCode: 'ABCD-EFGH-JKMN-PQRS' });
  assert.equal(await s.getToken(), 'access-5-xxxxxxxx');
});

test('Xóa tài khoản: gọi DELETE /v1/me có Bearer, xóa phiên trên máy, báo deleted', async () => {
  const calls = fakeGateway({
    '/v1/auth/guest': () => json({ ...tokens(1), recoveryCode: 'ABCD-EFGH-JKMN-PQRS' }),
    '/v1/me': () => json({ deleted: true })
  });
  const store = memStore();
  const s = createAuthSession(opts(store));
  await s.getToken();
  const seen = [];
  s.onUserChange((e) => seen.push(e.reason));
  await s.deleteAccount();
  const del = calls.find((c) => c.path === '/v1/me');
  assert.equal(del.init.method, 'DELETE');
  assert.equal(del.init.headers.Authorization, 'Bearer access-1-xxxxxxxx');
  assert.equal(store.m.has(AUTH_STORAGE_KEY), false);
  assert.deepEqual(seen, ['deleted']);
});

test('request: 401 => onUnauthorized rồi gửi lại đúng MỘT lần với token mới', async () => {
  let token = 'old';
  let refreshes = 0;
  configureGateway({ baseUrl: 'http://gw.test', getToken: () => token, onUnauthorized: async () => ((token = 'new'), ++refreshes, true) });
  const seen = [];
  globalThis.fetch = async (_url, init) => {
    seen.push(init.headers.Authorization);
    return init.headers.Authorization === 'Bearer new' ? json({ ok: true }) : json({ error: 'invalid_token' }, 401);
  };
  assert.deepEqual(await request('/v1/x', { schema: z.object({ ok: z.boolean() }) }), { ok: true });
  assert.deepEqual(seen, ['Bearer old', 'Bearer new']);
  // vẫn 401 sau khi làm mới => báo lỗi, không lặp vô hạn
  token = 'old';
  configureGateway({ getToken: () => 'bad', onUnauthorized: async () => true });
  await assert.rejects(request('/v1/x', { schema: z.object({ ok: z.boolean() }) }), (e) => e.kind === 'unauthorized');
  assert.equal(refreshes, 1);
});
