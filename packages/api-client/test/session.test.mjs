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

test('Tài khoản bị xóa ở máy khác: refresh trả account_deleted => xóa phiên, báo remote-deleted, KHÔNG tạo khách mới trong cùng lần gọi', async () => {
  const store = memStore({ [AUTH_STORAGE_KEY]: JSON.stringify({ userId: uid(1), refreshToken: 'refresh-0-xxxxxxxxxxxxxxxx', recoveryCode: 'ABCD-EFGH-JKMN-PQRS' }) });
  const calls = fakeGateway({
    '/v1/auth/refresh': () => json({ error: 'account_deleted' }, 401),
    '/v1/auth/guest': () => json({ ...tokens(2, { userId: uid(2) }), recoveryCode: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ' })
  });
  const s = createAuthSession(opts(store));
  const seen = [];
  s.onUserChange((e) => seen.push(e));
  await assert.rejects(s.getToken(), (e) => e instanceof GatewayRequestError && e.code === 'account_deleted' && e.status === 401);
  assert.deepEqual(seen, [{ reason: 'remote-deleted', userId: null }]);
  assert.equal(store.m.has(AUTH_STORAGE_KEY), false);
  assert.equal(calls.filter((c) => c.path === '/v1/auth/guest').length, 0);
  assert.equal(calls.filter((c) => c.path === '/v1/auth/recover').length, 0, 'không thử mã khôi phục của tài khoản đã xóa');
  // lần sau (sau khi app đã xóa dữ liệu) mới bắt đầu tài khoản khách mới
  assert.equal(await s.getToken(), 'access-2-xxxxxxxx');
});

test('Refresh token hỏng nhưng mã khôi phục báo account_deleted => cũng là remote-deleted', async () => {
  const store = memStore({ [AUTH_STORAGE_KEY]: JSON.stringify({ userId: uid(1), refreshToken: 'refresh-0-xxxxxxxxxxxxxxxx', recoveryCode: 'ABCD-EFGH-JKMN-PQRS' }) });
  fakeGateway({
    '/v1/auth/refresh': () => json({ error: 'invalid_refresh_token' }, 401),
    '/v1/auth/recover': () => json({ error: 'account_deleted' }, 401)
  });
  const s = createAuthSession(opts(store));
  const seen = [];
  s.onUserChange((e) => seen.push(e.reason));
  await assert.rejects(s.getToken(), (e) => e.code === 'account_deleted');
  assert.deepEqual(seen, ['remote-deleted']);
});

test('request(): access token còn hạn bị từ chối account_deleted => lỗi account_deleted, không gửi lại lô bằng token khách mới', async () => {
  const store = memStore({ [AUTH_STORAGE_KEY]: JSON.stringify({ userId: uid(1), refreshToken: 'refresh-0-xxxxxxxxxxxxxxxx', recoveryCode: null }) });
  let t = 0;
  const calls = fakeGateway({
    '/v1/auth/refresh': [json(tokens(1)), json({ error: 'account_deleted' }, 401)],
    '/v1/sync': () => json({ error: 'account_deleted' }, 401),
    '/v1/auth/guest': () => json({ ...tokens(2, { userId: uid(2) }), recoveryCode: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ' })
  });
  const s = createAuthSession(opts(store, () => t));
  configureGateway({ baseUrl: 'http://gw.test', getToken: () => s.getToken(), onUnauthorized: () => s.handleUnauthorized() });
  await assert.rejects(request('/v1/sync', { method: 'POST', body: { events: [] }, schema: z.any() }), (e) => e.code === 'account_deleted');
  assert.equal(calls.filter((c) => c.path === '/v1/sync').length, 1);
  assert.equal(calls.filter((c) => c.path === '/v1/auth/guest').length, 0);
});

// ---------- GĐ4b: chuyển hồ sơ trẻ trên cùng máy ----------
const PARENT_KEY = `${AUTH_STORAGE_KEY}.parent`;
const childUid = '00000000-0000-4000-8000-0000000000c1';
const parentStored = { userId: uid(1), refreshToken: 'refresh-p-xxxxxxxxxxxxxxxx', recoveryCode: 'ABCD-EFGH-JKMN-PQRS' };

test('switchToChild cất phiên phụ huynh, dùng token trẻ; switchToParent trả lại phiên phụ huynh', async () => {
  const store = memStore({ [AUTH_STORAGE_KEY]: JSON.stringify(parentStored) });
  const calls = fakeGateway({ '/v1/auth/refresh': (init) => json(tokens(JSON.parse(init.body).refreshToken.includes('-p-') ? 'p2' : 'c2')) });
  const s = createAuthSession(opts(store));
  const changes = [];
  s.onUserChange((e) => changes.push(e));
  await s.switchToChild(tokens('c', { userId: childUid }));
  assert.equal(await s.getToken(), 'access-c-xxxxxxxx', 'dùng ngay access token trẻ, không gọi mạng');
  assert.equal(calls.length, 0);
  assert.deepEqual(await s.info(), { userId: childUid, recoveryCode: null });
  assert.deepEqual((await s.parentInfo())?.userId, uid(1));
  assert.ok(store.m.get(PARENT_KEY));

  await s.switchToParent();
  assert.equal(store.m.get(PARENT_KEY), undefined);
  assert.equal(await s.parentInfo(), null);
  assert.deepEqual(await s.info(), { userId: uid(1), recoveryCode: 'ABCD-EFGH-JKMN-PQRS' });
  assert.equal(await s.getToken(), 'access-p2-xxxxxxxx', 'phiên phụ huynh làm mới bằng refresh token đã cất');
  assert.deepEqual(changes.map((c) => c.reason), ['switched', 'switched']);
});

test('hồ sơ trẻ hỏng refresh: KHÔNG tạo khách người lớn mới (không thoát chế độ trẻ)', async () => {
  const store = memStore({ [AUTH_STORAGE_KEY]: JSON.stringify({ userId: childUid, refreshToken: 'refresh-c-xxxxxxxxxxxxxxxx', recoveryCode: null }), [PARENT_KEY]: JSON.stringify(parentStored) });
  const calls = fakeGateway({ '/v1/auth/refresh': () => json({ error: 'invalid_refresh_token' }, 401), '/v1/auth/guest': () => json({ ...tokens(9), recoveryCode: 'X' }) });
  const s = createAuthSession(opts(store));
  await assert.rejects(s.getToken(), (e) => e instanceof GatewayRequestError && e.code === 'child_session_expired');
  assert.ok(!calls.some((c) => c.path === '/v1/auth/guest'));
  assert.equal(JSON.parse(store.m.get(AUTH_STORAGE_KEY)).userId, childUid);
});

test('hồ sơ trẻ bị phụ huynh xóa (account_deleted): máy quay về phiên phụ huynh, không tạo khách mới', async () => {
  const store = memStore({ [AUTH_STORAGE_KEY]: JSON.stringify({ userId: childUid, refreshToken: 'refresh-c-xxxxxxxxxxxxxxxx', recoveryCode: null }), [PARENT_KEY]: JSON.stringify(parentStored) });
  fakeGateway({ '/v1/auth/refresh': [json({ error: 'account_deleted' }, 401)] });
  const s = createAuthSession(opts(store));
  const changes = [];
  s.onUserChange((e) => changes.push(e));
  await assert.rejects(s.getToken(), (e) => e.code === 'account_deleted');
  assert.deepEqual(changes, [{ reason: 'remote-deleted', userId: uid(1) }]);
  assert.equal(JSON.parse(store.m.get(AUTH_STORAGE_KEY)).userId, uid(1));
  assert.equal(store.m.get(PARENT_KEY), undefined);
});
