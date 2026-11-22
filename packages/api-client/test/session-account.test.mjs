import test from 'node:test';
import assert from 'node:assert/strict';
import { GatewayRequestError } from '../dist/index.js';
import { createAuthSession, AUTH_STORAGE_KEY } from '../dist/session.js';

/** Dự án 3 / Task 6: phiên cho tài khoản thật (kind:'account'), Google, gộp, đăng xuất */

const realFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

const memStore = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { m, get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v), remove: async (k) => void m.delete(k) };
};
const uid = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const tokens = (n, extra = {}) => ({ accessToken: `access-${n}-xxxxxxxx`, refreshToken: `refresh-${n}-xxxxxxxxxxxxxxxx`, expiresIn: 900, userId: uid(1), ...extra });
const signedIn = (n, extra = {}) => ({ ...tokens(n), status: 'signed_in', isGuest: false, providers: ['password'], ...extra });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const stored = (o) => JSON.stringify(o);
const GUEST = { userId: uid(1), refreshToken: 'refresh-0-xxxxxxxxxxxxxxxx', recoveryCode: 'ABCD-EFGH-JKMN-PQRS' };
const ACCOUNT = { userId: uid(1), refreshToken: 'refresh-0-xxxxxxxxxxxxxxxx', recoveryCode: null, kind: 'account', providers: ['password'] };

function fakeGateway(routes) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, method: init?.method ?? 'GET', headers: init?.headers ?? {}, body: init?.body ? JSON.parse(init.body) : undefined });
    const r = routes[u.pathname];
    if (!r) return json({ error: 'not_found' }, 404);
    return typeof r === 'function' ? r(init, calls) : r.shift();
  };
  return calls;
}
const opts = (storage, extra = {}) => ({ storage, baseUrl: () => 'http://gw.test', now: () => 0, ...extra });
const events = (s) => {
  const list = [];
  s.onUserChange((e) => list.push(e));
  return list;
};

test('Tài khoản: refresh hỏng => signed-out, KHÔNG tạo khách mới, KHÔNG gọi recover, giữ dữ liệu; lần sau không gọi mạng', async () => {
  const store = memStore({ [AUTH_STORAGE_KEY]: stored(ACCOUNT) });
  const calls = fakeGateway({
    '/v1/auth/refresh': () => json({ error: 'invalid_refresh_token' }, 401),
    '/v1/auth/guest': () => json({ ...tokens(9), recoveryCode: 'ABCD-EFGH-JKMN-PQRS' }),
    '/v1/auth/recover': () => json(tokens(9))
  });
  const s = createAuthSession(opts(store));
  const ev = events(s);
  await assert.rejects(s.getToken(), (e) => e instanceof GatewayRequestError && e.kind === 'unauthorized');
  assert.deepEqual(ev, [{ reason: 'signed-out', userId: null }]);
  assert.deepEqual(calls.map((c) => c.path), ['/v1/auth/refresh']);
  assert.ok(store.m.get(AUTH_STORAGE_KEY), 'không xóa phiên/dữ liệu trên máy');
  assert.equal(await s.handleUnauthorized(), false);
  await assert.rejects(s.getToken());
  assert.equal(calls.length, 1, 'đã đăng xuất: không thử lại qua mạng, không tạo khách');
  assert.equal(ev.length, 1, 'chỉ báo một lần');
});

test('Tài khoản: mất mạng / 5xx khi refresh KHÔNG bị coi là đăng xuất', async () => {
  const store = memStore({ [AUTH_STORAGE_KEY]: stored(ACCOUNT) });
  fakeGateway({ '/v1/auth/refresh': () => json({ error: 'x' }, 503) });
  const s = createAuthSession(opts(store));
  const ev = events(s);
  await assert.rejects(s.getToken(), (e) => e.kind === 'unavailable');
  assert.deepEqual(ev, []);
});

test('Khách: refresh hỏng + không có mã khôi phục => hành vi cũ (tạo khách mới)', async () => {
  const store = memStore({ [AUTH_STORAGE_KEY]: stored({ ...GUEST, recoveryCode: null }) });
  const calls = fakeGateway({
    '/v1/auth/refresh': () => json({ error: 'invalid_refresh_token' }, 401),
    '/v1/auth/guest': () => json({ ...tokens(2, { userId: uid(2) }), recoveryCode: 'WXYZ-WXYZ-WXYZ-WXYZ' })
  });
  const s = createAuthSession(opts(store));
  const ev = events(s);
  assert.equal(await s.getToken(), 'access-2-xxxxxxxx');
  assert.deepEqual(calls.map((c) => c.path), ['/v1/auth/refresh', '/v1/auth/guest']);
  assert.deepEqual(ev, [{ reason: 'guest', userId: uid(2) }]);
});

test('401 account_merged (khách đã gộp vào tài khoản ở máy khác) => merged-elsewhere, giữ dữ liệu, không tạo khách', async () => {
  const store = memStore({ [AUTH_STORAGE_KEY]: stored(GUEST) });
  const calls = fakeGateway({
    '/v1/auth/refresh': () => json({ error: 'account_merged' }, 401),
    '/v1/auth/recover': () => json(tokens(9)),
    '/v1/auth/guest': () => json({ ...tokens(9), recoveryCode: 'ABCD-EFGH-JKMN-PQRS' })
  });
  const s = createAuthSession(opts(store));
  const ev = events(s);
  await assert.rejects(s.getToken(), (e) => e instanceof GatewayRequestError && e.status === 401 && e.code === 'account_merged');
  assert.deepEqual(ev, [{ reason: 'merged-elsewhere', userId: null }]);
  assert.deepEqual(calls.map((c) => c.path), ['/v1/auth/refresh']);
  assert.ok(store.m.get(AUTH_STORAGE_KEY), 'không xóa phiên trên máy');
  assert.equal(await s.handleUnauthorized(), false);
  await assert.rejects(s.getToken());
  assert.equal(calls.length, 1);
});

test('Sau merged-elsewhere: đăng nhập Google / đăng ký vẫn chạy (không Bearer của khách đã gộp), không bị chặn', async () => {
  const store = memStore({ [AUTH_STORAGE_KEY]: stored(GUEST) });
  const calls = fakeGateway({
    '/v1/auth/refresh': () => json({ error: 'account_merged' }, 401),
    '/v1/auth/nonce': () => json({ nonce: 'n'.repeat(32), expiresIn: 300 }),
    '/v1/auth/google': () => json(signedIn(5, { userId: uid(2), providers: ['google'] })),
    '/v1/auth/register': () => json({ ...signedIn(6, { userId: uid(3) }), backupCode: 'AAAA-BBBB-CCCC-DDDD' })
  });
  const s = createAuthSession(opts(store, { getGoogleIdToken: async () => 'id-token-xxxxxxxx' }));
  const ev = events(s);
  await assert.rejects(s.getToken(), (e) => e.code === 'account_merged');
  const r = await s.signInWithGoogle();
  assert.equal(r.status, 'signed_in');
  const g = calls.find((c) => c.path === '/v1/auth/google');
  assert.ok(g && !g.headers.Authorization, 'đăng nhập không kèm Bearer của khách đã gộp');
  assert.equal(JSON.parse(store.m.get(AUTH_STORAGE_KEY)).kind, 'account');
  assert.equal(await s.getToken(), 'access-5-xxxxxxxx');
  assert.deepEqual(ev.map((e) => e.reason), ['merged-elsewhere', 'signed-in']);

  // đăng ký trên máy merged-elsewhere khác cũng không bị chặn
  const store2 = memStore({ [AUTH_STORAGE_KEY]: stored(GUEST) });
  const s2 = createAuthSession(opts(store2));
  await assert.rejects(s2.getToken());
  await s2.register('ten_moi', 'Mat-khau-dai-du-123');
  const reg = calls.find((c) => c.path === '/v1/auth/register');
  assert.ok(reg && !reg.headers.Authorization);

  // mở lại app (chặn chỉ nằm trong RAM): bấm Google ngay, refresh trả account_merged => vẫn đăng nhập được
  const store3 = memStore({ [AUTH_STORAGE_KEY]: stored(GUEST) });
  const s3 = createAuthSession(opts(store3, { getGoogleIdToken: async () => 'id-token-xxxxxxxx' }));
  assert.equal((await s3.signInWithGoogle()).status, 'signed_in');
  assert.equal(JSON.parse(store3.m.get(AUTH_STORAGE_KEY)).kind, 'account');
});

test('recover trả account_upgraded/account_merged => mời đăng nhập, không tạo khách mới', async () => {
  const store = memStore({ [AUTH_STORAGE_KEY]: stored(GUEST) });
  const calls = fakeGateway({
    '/v1/auth/refresh': () => json({ error: 'invalid_refresh_token' }, 401),
    '/v1/auth/recover': () => json({ error: 'account_upgraded' }, 401),
    '/v1/auth/guest': () => json({ ...tokens(9), recoveryCode: 'ABCD-EFGH-JKMN-PQRS' })
  });
  const s = createAuthSession(opts(store));
  const ev = events(s);
  await assert.rejects(s.getToken(), (e) => e.code === 'account_merged' || e.code === 'account_upgraded');
  assert.deepEqual(ev, [{ reason: 'merged-elsewhere', userId: null }]);
  assert.ok(!calls.some((c) => c.path === '/v1/auth/guest'));
});

test('register: nâng cấp khách (Bearer), lưu kind account, XÓA mã khôi phục khỏi máy, trả mã dự phòng một lần', async () => {
  const store = memStore({ [AUTH_STORAGE_KEY]: stored(GUEST) });
  const calls = fakeGateway({
    '/v1/auth/refresh': [json(tokens(1))],
    '/v1/auth/register': () => json({ ...signedIn(2), backupCode: 'AAAA-BBBB-CCCC-DDDD' })
  });
  const s = createAuthSession(opts(store));
  const ev = events(s);
  const r = await s.register('Mai.Le', 'matkhau-dai-hon-8');
  assert.equal(r.status, 'signed_in');
  assert.equal(r.backupCode, 'AAAA-BBBB-CCCC-DDDD');
  const reg = calls.find((c) => c.path === '/v1/auth/register');
  assert.equal(reg.headers.Authorization, 'Bearer access-1-xxxxxxxx');
  assert.deepEqual(reg.body, { username: 'Mai.Le', password: 'matkhau-dai-hon-8' });
  const saved = JSON.parse(store.m.get(AUTH_STORAGE_KEY));
  assert.equal(saved.kind, 'account');
  assert.equal(saved.recoveryCode, null);
  assert.deepEqual(saved.providers, ['password']);
  assert.equal(saved.refreshToken, 'refresh-2-xxxxxxxxxxxxxxxx');
  assert.ok(!store.m.get(AUTH_STORAGE_KEY).includes('ABCD-EFGH'), 'mã khôi phục không còn trên máy');
  assert.deepEqual(await s.info(), { userId: uid(1), recoveryCode: null });
  assert.deepEqual(ev, [{ reason: 'signed-in', userId: uid(1) }]);
  assert.equal(await s.getToken(), 'access-2-xxxxxxxx');
});

test('register: chưa có phiên => không tạo khách chỉ để đăng ký (không Bearer); lỗi username_taken mang mã', async () => {
  const store = memStore();
  const calls = fakeGateway({ '/v1/auth/register': () => json({ error: 'username_taken' }, 409) });
  const s = createAuthSession(opts(store));
  await assert.rejects(s.register('mai', 'matkhau-dai-hon-8'), (e) => e instanceof GatewayRequestError && e.code === 'username_taken' && e.status === 409);
  assert.deepEqual(calls.map((c) => c.path), ['/v1/auth/register']);
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(store.m.get(AUTH_STORAGE_KEY), undefined);
});

test('login: lưu tài khoản, xóa mã khôi phục; tài khoản chờ xóa => thêm pending-deletion; restore() gọi /me/restore', async () => {
  const store = memStore({ [AUTH_STORAGE_KEY]: stored(GUEST) });
  const deleteAt = '2026-12-20T00:00:00.000Z';
  const calls = fakeGateway({
    '/v1/auth/login': () => json(signedIn(3, { userId: uid(5), restorable: { deleteAt } })),
    '/v1/me/restore': () => json(signedIn(4, { userId: uid(5) }))
  });
  const s = createAuthSession(opts(store));
  const ev = events(s);
  const r = await s.login('mai', 'matkhau-dai-hon-8');
  assert.equal(r.status, 'signed_in');
  assert.deepEqual(r.restorable, { deleteAt });
  assert.equal(JSON.parse(store.m.get(AUTH_STORAGE_KEY)).recoveryCode, null);
  assert.deepEqual(ev, [
    { reason: 'signed-in', userId: uid(5) },
    { reason: 'pending-deletion', userId: uid(5) }
  ]);
  await s.restore();
  const rc = calls.find((c) => c.path === '/v1/me/restore');
  assert.equal(rc.headers.Authorization, 'Bearer access-3-xxxxxxxx');
});

test('Google khi đang là khách: gọi nonce rồi /me/identities/google (Bearer khách) => nâng cấp, giữ userId', async () => {
  const store = memStore({ [AUTH_STORAGE_KEY]: stored(GUEST) });
  const calls = fakeGateway({
    '/v1/auth/refresh': [json(tokens(1))],
    '/v1/auth/nonce': () => json({ nonce: 'n'.repeat(24), expiresIn: 600 }),
    '/v1/me/identities/google': () => json(signedIn(2, { providers: ['google'] }))
  });
  let seenNonce;
  const s = createAuthSession(opts(store, { getGoogleIdToken: async (n) => ((seenNonce = n), 'g'.repeat(40)) }));
  const ev = events(s);
  const r = await s.signInWithGoogle();
  assert.equal(seenNonce, 'n'.repeat(24));
  assert.equal(r.status, 'signed_in');
  const link = calls.find((c) => c.path === '/v1/me/identities/google');
  assert.equal(link.headers.Authorization, 'Bearer access-1-xxxxxxxx');
  assert.deepEqual(link.body, { idToken: 'g'.repeat(40), nonce: 'n'.repeat(24) });
  const saved = JSON.parse(store.m.get(AUTH_STORAGE_KEY));
  assert.equal(saved.kind, 'account');
  assert.equal(saved.recoveryCode, null);
  assert.deepEqual(saved.providers, ['google']);
  assert.deepEqual(ev, [{ reason: 'signed-in', userId: uid(1) }]);
});

test('Google khi chưa có phiên: /auth/google (không Bearer, không tạo khách)', async () => {
  const store = memStore();
  const calls = fakeGateway({
    '/v1/auth/nonce': () => json({ nonce: 'n'.repeat(24), expiresIn: 600 }),
    '/v1/auth/google': () => json(signedIn(2, { providers: ['google'] }))
  });
  const s = createAuthSession(opts(store, { getGoogleIdToken: async () => 'g'.repeat(40) }));
  await s.signInWithGoogle();
  assert.deepEqual(calls.map((c) => c.path), ['/v1/auth/nonce', '/v1/auth/google']);
  assert.equal(calls[1].headers.Authorization, undefined);
  assert.equal(JSON.parse(store.m.get(AUTH_STORAGE_KEY)).kind, 'account');
});

test('Google: needs_merge trả vé, KHÔNG đổi phiên trên máy; merge() => tài khoản, phát merged', async () => {
  const store = memStore({ [AUTH_STORAGE_KEY]: stored(GUEST) });
  const calls = fakeGateway({
    '/v1/auth/refresh': [json(tokens(1))],
    '/v1/auth/nonce': () => json({ nonce: 'n'.repeat(24), expiresIn: 600 }),
    '/v1/me/identities/google': () => json({ status: 'needs_merge', mergeTicket: 't'.repeat(32), target: { createdAt: '2026-11-01T00:00:00.000Z', hasProgress: true } }),
    '/v1/me/merge': () => json(signedIn(3, { userId: uid(7), providers: ['google'] }))
  });
  const s = createAuthSession(opts(store, { getGoogleIdToken: async () => 'g'.repeat(40) }));
  const ev = events(s);
  const r = await s.signInWithGoogle();
  assert.equal(r.status, 'needs_merge');
  assert.equal(r.mergeTicket, 't'.repeat(32));
  assert.deepEqual(JSON.parse(store.m.get(AUTH_STORAGE_KEY)), { ...GUEST, refreshToken: 'refresh-1-xxxxxxxxxxxxxxxx' }, 'chưa quyết định: vẫn là khách (chỉ xoay refresh token)');
  assert.deepEqual(ev, []);
  const m = await s.merge(r.mergeTicket, 'merge');
  assert.equal(m.userId, uid(7));
  const mc = calls.find((c) => c.path === '/v1/me/merge');
  assert.equal(mc.headers.Authorization, 'Bearer access-1-xxxxxxxx');
  assert.deepEqual(mc.body, { mergeTicket: 't'.repeat(32), strategy: 'merge' });
  const saved = JSON.parse(store.m.get(AUTH_STORAGE_KEY));
  assert.equal(saved.kind, 'account');
  assert.equal(saved.userId, uid(7));
  assert.equal(saved.recoveryCode, null);
  assert.deepEqual(ev, [{ reason: 'merged', userId: uid(7) }]);
});

test('Google chưa cấu hình / người dùng hủy: lỗi có mã, app không sập, phiên không đổi', async () => {
  const store = memStore({ [AUTH_STORAGE_KEY]: stored(GUEST) });
  fakeGateway({});
  const none = createAuthSession(opts(store));
  await assert.rejects(none.signInWithGoogle(), (e) => e instanceof GatewayRequestError && e.kind === 'unavailable' && e.code === 'google_not_configured');
  const cancelled = createAuthSession(
    opts(store, {
      getGoogleIdToken: async () => {
        throw new Error('cancelled');
      }
    })
  );
  fakeGateway({ '/v1/auth/nonce': () => json({ nonce: 'n'.repeat(24), expiresIn: 600 }) });
  await assert.rejects(cancelled.signInWithGoogle(), (e) => e instanceof GatewayRequestError && e.code === 'google_cancelled');
  assert.deepEqual(JSON.parse(store.m.get(AUTH_STORAGE_KEY)), GUEST);
});

test('logout: thu hồi refresh token ở server, xóa phiên, phát signed-out; offline => ném lỗi và GIỮ phiên', async () => {
  const store = memStore({ [AUTH_STORAGE_KEY]: stored(ACCOUNT) });
  const calls = fakeGateway({ '/v1/auth/logout': () => new Response(null, { status: 204 }) });
  const s = createAuthSession(opts(store));
  const ev = events(s);
  globalThis.fetch = async () => {
    throw new TypeError('network');
  };
  await assert.rejects(s.logout(true), (e) => e.kind === 'offline');
  assert.ok(store.m.get(AUTH_STORAGE_KEY));
  assert.deepEqual(ev, []);
  fakeGateway({ '/v1/auth/logout': (init) => ((calls.body = JSON.parse(init.body)), new Response(null, { status: 204 })) });
  await s.logout(true);
  assert.deepEqual(calls.body, { refreshToken: ACCOUNT.refreshToken, everywhere: true });
  assert.equal(store.m.get(AUTH_STORAGE_KEY), undefined);
  assert.deepEqual(ev, [{ reason: 'signed-out', userId: null }]);
});

test('identities(): GET /v1/me/identities với Bearer', async () => {
  const store = memStore({ [AUTH_STORAGE_KEY]: stored(ACCOUNT) });
  const calls = fakeGateway({
    '/v1/auth/refresh': [json(tokens(1))],
    '/v1/me/identities': () => json({ identities: [{ id: uid(3), provider: 'password', display: 'mai' }] })
  });
  const s = createAuthSession(opts(store));
  const list = await s.identities();
  assert.deepEqual(list, [{ id: uid(3), provider: 'password', display: 'mai' }]);
  assert.equal(calls.at(-1).headers.Authorization, 'Bearer access-1-xxxxxxxx');
});

test('401 account_upgraded ở /refresh (khách không còn mã khôi phục) => merged-elsewhere, KHÔNG tạo khách mới', async () => {
  const store = memStore({ [AUTH_STORAGE_KEY]: stored({ ...GUEST, recoveryCode: null }) });
  const calls = fakeGateway({
    '/v1/auth/refresh': () => json({ error: 'account_upgraded' }, 401),
    '/v1/auth/guest': () => json({ ...tokens(9), recoveryCode: 'ABCD-EFGH-JKMN-PQRS' })
  });
  const s = createAuthSession(opts(store));
  const ev = events(s);
  await assert.rejects(s.getToken(), (e) => e.code === 'account_merged');
  assert.deepEqual(ev, [{ reason: 'merged-elsewhere', userId: null }]);
  assert.deepEqual(calls.map((c) => c.path), ['/v1/auth/refresh']);
});
