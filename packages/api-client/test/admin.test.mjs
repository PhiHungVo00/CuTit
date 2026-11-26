import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminClient, AdminRequestError } from '../dist/admin.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const UUID = '11111111-1111-4111-8111-111111111111';
const SESSION = { accessToken: 'acc-1', expiresIn: 600 };
const QUEUE = { items: [], nextCursor: null, pendingCount: 0 };

/** fetch giả: nhận danh sách phản hồi theo thứ tự, ghi lại mọi lời gọi */
function mock(...responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (!r) throw new Error('hết phản hồi giả');
    if (r instanceof Error) throw r;
    return r instanceof Response ? r : r(url, init);
  };
  return { fn, calls };
}

test('đăng nhập: cookie đi kèm (credentials include), không Bearer, access chỉ trong bộ nhớ', async () => {
  const m = mock(json(200, { ticket: 't'.repeat(40), next: 'totp' }), json(200, SESSION), json(200, QUEUE));
  const c = createAdminClient('http://gw.test/', { fetch: m.fn });
  const r = await c.login('chu', 'matkhau');
  assert.equal(r.next, 'totp');
  assert.equal(m.calls[0].url, 'http://gw.test/admin/v1/auth/login');
  assert.equal(m.calls[0].init.credentials, 'include');
  assert.equal(m.calls[0].init.headers.Authorization, undefined);
  assert.equal(c.hasAccess(), false);
  await c.totp('t'.repeat(40), { code: '123456' });
  assert.equal(c.hasAccess(), true);
  assert.deepEqual(JSON.parse(m.calls[1].init.body), { ticket: 't'.repeat(40), code: '123456' });
  await c.queue({ status: 'received', limit: 10 });
  assert.equal(m.calls[2].init.headers.Authorization, 'Bearer acc-1');
  assert.equal(m.calls[2].url, 'http://gw.test/admin/v1/queue?type=feedback&status=received&limit=10');
});

test('restore: khởi động lại client gọi refresh bằng cookie, không hỏi lại mã', async () => {
  const m = mock(json(200, SESSION), json(200, { userIdShort: 'abcd1234', roles: ['owner'] }));
  const c = createAdminClient('http://gw.test', { fetch: m.fn });
  assert.equal(await c.restore(), true);
  assert.equal(m.calls[0].url, 'http://gw.test/admin/v1/auth/refresh');
  assert.equal(m.calls[0].init.credentials, 'include');
  const s = await c.session();
  assert.deepEqual(s.roles, ['owner']);
});

test('restore: không có cookie (401) => false, không ném', async () => {
  const m = mock(json(401, { error: 'session_expired' }));
  const c = createAdminClient('http://gw.test', { fetch: m.fn });
  assert.equal(await c.restore(), false);
});

test('401 giữa chừng: refresh đúng một lần rồi gửi lại đúng một lần', async () => {
  const m = mock(json(200, SESSION), json(401, { error: 'invalid_token' }), json(200, { accessToken: 'acc-2', expiresIn: 600 }), json(200, QUEUE));
  const c = createAdminClient('http://gw.test', { fetch: m.fn });
  await c.restore();
  const q = await c.queue();
  assert.equal(q.pendingCount, 0);
  assert.equal(m.calls.length, 4);
  assert.equal(m.calls[3].init.headers.Authorization, 'Bearer acc-2');
});

test('401 hai lần liên tiếp: session-expired + onSessionExpired, access bị xóa', async () => {
  let expired = 0;
  const m = mock(json(200, SESSION), json(401, { error: 'invalid_token' }), json(200, { accessToken: 'acc-2', expiresIn: 600 }), json(401, { error: 'invalid_token' }));
  const c = createAdminClient('http://gw.test', { fetch: m.fn, onSessionExpired: () => expired++ });
  await c.restore();
  await assert.rejects(c.queue(), (e) => e instanceof AdminRequestError && e.kind === 'session-expired');
  assert.equal(expired, 1);
  assert.equal(c.hasAccess(), false);
});

test('refresh hỏng (cookie hết hạn) => session-expired', async () => {
  let expired = 0;
  const m = mock(json(200, SESSION), json(401, { error: 'invalid_token' }), json(401, { error: 'session_expired' }));
  const c = createAdminClient('http://gw.test', { fetch: m.fn, onSessionExpired: () => expired++ });
  await c.restore();
  await assert.rejects(c.queue(), (e) => e.kind === 'session-expired');
  assert.equal(expired, 1);
});

test('nhiều request song song cùng lúc hết hạn: chỉ MỘT lần refresh', async () => {
  let refreshes = 0;
  const fn = async (url, init) => {
    if (url.endsWith('/auth/refresh')) {
      refreshes++;
      await new Promise((r) => setTimeout(r, 10));
      return json(200, { accessToken: `acc-${refreshes}`, expiresIn: 600 });
    }
    return init.headers.Authorization === 'Bearer acc-1' ? json(200, QUEUE) : json(401, { error: 'invalid_token' });
  };
  const c = createAdminClient('http://gw.test', { fetch: fn });
  await Promise.all([c.queue(), c.queue(), c.queue()]);
  assert.equal(refreshes, 1);
});

test('vai trò thấp: 403 => kind forbidden (không refresh, không đăng xuất)', async () => {
  const m = mock(json(200, SESSION), json(403, { error: 'forbidden' }));
  const c = createAdminClient('http://gw.test', { fetch: m.fn });
  await c.restore();
  await assert.rejects(c.audit(), (e) => e.kind === 'forbidden' && e.status === 403 && e.code === 'forbidden');
  assert.equal(c.hasAccess(), true);
});

test('lỗi mạng => offline; hết giờ => timeout', async () => {
  const c1 = createAdminClient('http://gw.test', { fetch: mock(new TypeError('fetch failed')).fn });
  await assert.rejects(c1.login('a', 'b'), (e) => e.kind === 'offline');
  const slow = (_u, init) => new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('abort', 'AbortError'))));
  const c2 = createAdminClient('http://gw.test', { fetch: slow, timeoutMs: 20 });
  await assert.rejects(c2.login('a', 'b'), (e) => e.kind === 'timeout');
});

test('restore khi mất mạng: ném offline (không nhầm với "chưa đăng nhập")', async () => {
  const c = createAdminClient('http://gw.test', { fetch: mock(new TypeError('x')).fn });
  await assert.rejects(c.restore(), (e) => e.kind === 'offline');
});

test('phản hồi sai schema => contract (không đưa dữ liệu sai lên giao diện)', async () => {
  const m = mock(json(200, SESSION), json(200, { items: 'không phải mảng' }), json(200, 'không phải đối tượng'));
  const c = createAdminClient('http://gw.test', { fetch: m.fn });
  await c.restore();
  await assert.rejects(c.queue(), (e) => e.kind === 'contract');
  await assert.rejects(c.detail(UUID), (e) => e.kind === 'contract');
});

test('đăng nhập sai: 401 invalid_credentials; khóa: 429 rate_limited; chưa bật: 503 admin_disabled', async () => {
  const m = mock(json(401, { error: 'invalid_credentials' }), json(429, { error: 'rate_limited' }), json(503, { error: 'admin_disabled' }));
  const c = createAdminClient('http://gw.test', { fetch: m.fn });
  await assert.rejects(c.login('a', 'b'), (e) => e.kind === 'invalid-credentials' && e.code === 'invalid_credentials');
  await assert.rejects(c.login('a', 'b'), (e) => e.kind === 'rate-limited');
  await assert.rejects(c.login('a', 'b'), (e) => e.kind === 'disabled');
});

test('enroll → confirm: nhận 10 mã dự phòng và có access', async () => {
  const codes = Array.from({ length: 10 }, (_, i) => `abcd${i}-efgh${i}`);
  const m = mock(
    json(200, { otpauthUrl: 'otpauth://totp/x?secret=ABCDEFGH', secret: 'ABCDEFGH' }),
    json(200, { ...SESSION, backupCodes: codes })
  );
  const c = createAdminClient('http://gw.test', { fetch: m.fn });
  const e = await c.enroll('t'.repeat(40), 'aaaaa-bbbbb-ccccc');
  assert.equal(e.secret, 'ABCDEFGH');
  const r = await c.confirmTotp('t'.repeat(40), '654321');
  assert.equal(r.backupCodes.length, 10);
  assert.equal(c.hasAccess(), true);
});

test('setStatus: gửi đúng body; fileUrl: chỉ nhận http(s)', async () => {
  const detail = {
    id: UUID, kind: 'bug', body: 'x'.repeat(12), status: 'done', createdAt: '2026-11-26T00:00:00.000Z', events: [],
    context: { appVersion: '1.0.0', build: '1', platform: 'web', osVersion: 'x', locale: 'vi', route: '/', recentRoutes: [] },
    userIdShort: 'abcd1234', accountPendingDeletion: false, doneAt: null, files: []
  };
  const m = mock(json(200, SESSION), (u, i) => json(200, detail), json(200, { url: 'javascript:alert(1)', expiresAt: '2026-11-26T00:05:00.000Z' }), json(200, { url: 'http://gw.test/admin/v1/blob?k=a&exp=1&sig=b', expiresAt: '2026-11-26T00:05:00.000Z' }));
  const c = createAdminClient('http://gw.test', { fetch: m.fn });
  await c.restore();
  const d = await c.setStatus(UUID, { status: 'done', message: 'Cảm ơn bạn' });
  assert.equal(d.status, 'done');
  assert.equal(m.calls[1].url, `http://gw.test/admin/v1/feedback/${UUID}/status`);
  assert.deepEqual(JSON.parse(m.calls[1].init.body), { status: 'done', message: 'Cảm ơn bạn' });
  await assert.rejects(c.fileUrl(UUID, UUID), (e) => e.kind === 'contract');
  const ok = await c.fileUrl(UUID, UUID);
  assert.match(ok.url, /^http:\/\/gw\.test\//);
});

test('URL ký hết hạn: Gateway trả 403 => forbidden; tệp đã dọn 410 => gone', async () => {
  const m = mock(json(200, SESSION), json(410, { error: 'file_purged' }));
  const c = createAdminClient('http://gw.test', { fetch: m.fn });
  await c.restore();
  await assert.rejects(c.fileUrl(UUID, UUID), (e) => e.kind === 'gone');
});

test('đăng xuất: gọi /logout rồi xóa access dù mạng lỗi', async () => {
  const m = mock(json(200, SESSION), new TypeError('x'));
  const c = createAdminClient('http://gw.test', { fetch: m.fn });
  await c.restore();
  await assert.rejects(c.logout());
  assert.equal(c.hasAccess(), false);
});
