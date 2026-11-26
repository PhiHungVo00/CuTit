import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { schema } from '../dist/db/client.js';
import { startWs } from './ws-helpers.mjs';

/**
 * Dự án 4 Task 5 — xác thực `/ws`: khung ĐẦU TIÊN phải là `hello` (JWT access) trong 5 giây, token KHÔNG nằm trên URL,
 * kiểm đủ như `authenticate` + điều kiện chat (không khách, đủ 18, có handle, không chờ xóa, không bị khóa chat).
 */
let s;
before(async () => {
  s = await startWs({
    // đồng hồ nhảy hàng trăm giây trong test hết hạn: tắt kiểm pong để không đóng 4408 trước
    realtime: { limits: { pongTimeoutMs: 10 ** 9 } },
    versions: {
      web: { latestBuild: 50, latestVersion: '1.0.50', minBuild: 40, minBuildEnforceAt: null, notes: null, downloadUrl: null, apkFile: null },
      play: { latestBuild: 50, latestVersion: '1.0.50', minBuild: 30, minBuildEnforceAt: null, notes: null, downloadUrl: null, apkFile: null },
      apk: { latestBuild: 50, latestVersion: '1.0.50', minBuild: 20, minBuildEnforceAt: null, notes: null, downloadUrl: null, apkFile: null }
    }
  });
});
after(async () => {
  assert.deepEqual(s.uncaught, [], 'không có ngoại lệ chưa bắt');
  await s.close();
});

const closeOf = async (c) => (await c.waitClosed()).code;

test('không gửi hello trong 5 giây → đóng 4401', async () => {
  const u = await s.user();
  const c = s.connect(u.id, { hello: false });
  await c.opened;
  s.clock.t += 4_900;
  s.app.realtime.sweep();
  assert.equal(c.closed, null, 'chưa tới 5 giây thì chưa đóng');
  s.clock.t += 200;
  s.app.realtime.sweep();
  assert.equal(await closeOf(c), 4401);
});

test('khung nào khác hello gửi trước → đóng 4401, không xử lý khung đó', async () => {
  const u = await s.user();
  const c = s.connect(u.id, { hello: false });
  c.send({ t: 'visibility', foreground: true });
  assert.equal(await closeOf(c), 4401);
  assert.equal(s.app.realtime.isOnline(u.id), false);
  assert.equal(s.app.realtime.isForeground(u.id), false);
});

test('token trên URL không có tác dụng (vẫn phải hello)', async () => {
  const u = await s.user();
  const c = s.connect(u.id, { hello: false, query: `?token=${s.token(u.id)}` });
  await c.opened;
  assert.equal(c.frames.length, 0);
  assert.equal(s.app.realtime.isOnline(u.id), false);
  s.clock.t += 5_100;
  s.app.realtime.sweep();
  assert.equal(await closeOf(c), 4401);
});

test('hello hợp lệ → hello_ok, KHÔNG chứa dữ liệu người khác', async () => {
  const u = await s.user();
  const other = await s.user();
  await s.ready(other.id);
  const c = await s.ready(u.id);
  assert.deepEqual(Object.keys(c.helloOk).sort(), ['expSec', 'serverTime', 't']);
  assert.ok(c.helloOk.expSec > 0 && c.helloOk.expSec <= 900);
  assert.ok(!JSON.stringify(c.helloOk).includes(other.id));
  assert.equal(s.app.realtime.isOnline(u.id), true);
});

test('hello thiếu token / sai kiểu / thừa trường → đóng 4401', async () => {
  const u = await s.user();
  for (const bad of [
    { t: 'hello', v: 1, build: 1, device: '11111111-1111-4111-8111-111111111111' },
    { t: 'hello', v: 2, token: s.token(u.id), build: 1, device: '11111111-1111-4111-8111-111111111111' },
    { t: 'hello', v: 1, token: s.token(u.id), build: 1, device: 'khong-phai-uuid' },
    { t: 'hello', v: 1, token: s.token(u.id), build: 1, device: '11111111-1111-4111-8111-111111111111', extra: 1 },
    'khong phai json'
  ]) {
    const c = s.connect(u.id, { hello: false });
    c.send(bad);
    assert.equal(await closeOf(c), 4401, JSON.stringify(bad));
  }
});

test('token refresh / hết hạn / sai chữ ký / rác → 4401', async () => {
  const u = await s.user();
  const good = s.token(u.id);
  const forged = good.slice(0, -3) + (good.endsWith('AAA') ? 'BBB' : 'AAA');
  const expired = s.app.jwt.sign({ sub: u.id, typ: 'access', exp: Math.floor(Date.now() / 1000) - 30 });
  for (const [name, token] of [
    ['refresh', s.token(u.id, { typ: 'refresh' })],
    ['không có typ', s.app.jwt.sign({ sub: u.id }, { expiresIn: 900 })],
    ['hết hạn', expired],
    ['sai chữ ký', forged],
    ['rác', 'x'.repeat(40)]
  ]) {
    const c = s.connect(u.id, { token });
    assert.equal(await closeOf(c), 4401, name);
    assert.equal(s.app.realtime.isOnline(u.id), false, name);
  }
});

test('người dùng đã xóa / không tồn tại → 4401; chờ xóa → 4403', async () => {
  const gone = s.connect('99999999-9999-4999-8999-999999999999');
  assert.equal(await closeOf(gone), 4401);
  const del = await s.user();
  await s.db.update(schema.users).set({ deleteAt: new Date(Date.now() - 1000) }).where(eq(schema.users.id, del.id));
  assert.equal(await closeOf(s.connect(del.id)), 4401, 'quá hạn xóa');
  const pending = await s.user();
  await s.db.update(schema.users).set({ deleteAt: new Date(Date.now() + 86_400_000) }).where(eq(schema.users.id, pending.id));
  assert.equal(await closeOf(s.connect(pending.id)), 4403, 'đang chờ xóa');
});

test('khách / chưa khai tuổi / dưới 18 / chưa có handle / bị khóa chat → 4403', async () => {
  const cases = {
    khách: await s.user({ user: { isGuest: true } }),
    'chưa khai tuổi': await s.user({ user: { isAdult: null, ageDeclaredAt: null } }),
    'dưới 18': await s.user({ user: { isAdult: false } }),
    'chưa có handle': await s.user({ handle: null }),
    'không có hồ sơ': await s.user({ profile: false })
  };
  const banned = await s.user();
  await s.db.insert(schema.chatRestrictions).values({ userId: banned.id, reason: 'test', until: null });
  cases['bị khóa chat'] = banned;
  for (const [name, u] of Object.entries(cases)) {
    assert.equal(await closeOf(s.connect(u.id)), 4403, name);
    assert.equal(s.app.realtime.isOnline(u.id), false, name);
  }
});

test('khóa chat đã gỡ hoặc hết hạn thì vẫn nối được', async () => {
  const u = await s.user();
  await s.db.insert(schema.chatRestrictions).values([
    { userId: u.id, reason: 'đã gỡ', until: null, liftedAt: new Date() },
    { userId: u.id, reason: 'hết hạn', until: new Date(Date.now() - 1000) }
  ]);
  const c = await s.ready(u.id);
  assert.equal(c.helloOk.t, 'hello_ok');
});

test('bản app quá cũ → 4426 (theo kênh); còn ân hạn thì cho qua', async () => {
  const u = await s.user();
  assert.equal(await closeOf(s.connect(u.id, { build: 39, query: '?channel=web' })), 4426);
  assert.equal(await closeOf(s.connect(u.id, { build: 29, query: '?channel=play' })), 4426);
  const ok = await s.ready(u.id, { build: 40, query: '?channel=web' });
  assert.equal(ok.helloOk.t, 'hello_ok');
  // không nói kênh: chỉ chặn khi nhỏ hơn mọi kênh (dữ liệu hello không có kênh)
  assert.equal(await closeOf(s.connect(u.id, { build: 5 })), 4426);
  assert.equal((await s.ready(u.id, { build: 25 })).helloOk.t, 'hello_ok');
});

test('auth_expiring ≈60 giây trước hạn; gửi auth mới thì tiếp tục, không gia hạn → 4401', async () => {
  const u = await s.user();
  const t0 = Date.now();
  const c = await s.ready(u.id);
  s.clock.t = t0 + 838_000; // còn ~62 giây
  s.app.realtime.sweep();
  assert.equal(await c.collect((f) => f.t === 'auth_expiring', 100).then((a) => a.length), 0);
  s.clock.t = t0 + 842_000; // còn ~58 giây
  s.app.realtime.sweep();
  const f = await c.waitFrame((x) => x.t === 'auth_expiring');
  assert.ok(f.inSec > 0 && f.inSec <= 60, `inSec=${f.inSec}`);
  s.app.realtime.sweep();
  assert.equal(c.frames.filter((x) => x.t === 'auth_expiring').length, 1, 'chỉ báo một lần');

  const newExp = t0 + 842_000 + 900_000; // token mới sống 900 giây tính từ lúc gia hạn (đồng hồ giả)
  c.send({ t: 'auth', token: s.app.jwt.sign({ sub: u.id, typ: 'access', exp: Math.floor(newExp / 1000) }) });
  await new Promise((r) => setTimeout(r, 150));
  s.clock.t = t0 + 910_000; // qua hạn token cũ
  s.app.realtime.sweep();
  assert.equal(c.closed, null, 'đã gia hạn thì còn sống');
  assert.equal(s.app.realtime.isOnline(u.id), true);

  s.clock.t = newExp + 1_000; // qua hạn token mới (không gia hạn nữa)
  s.app.realtime.sweep();
  assert.equal(await closeOf(c), 4401);
});

test('auth sai: token người khác → 4403; refresh/rác → 4401; người dùng vừa bị khóa → 4403', async () => {
  const a = await s.user();
  const b = await s.user();
  const ca = await s.ready(a.id);
  ca.send({ t: 'auth', token: s.token(b.id) });
  assert.equal(await closeOf(ca), 4403);

  const c2 = await s.ready(a.id);
  c2.send({ t: 'auth', token: s.token(a.id, { typ: 'refresh' }) });
  assert.equal(await closeOf(c2), 4401);

  const c3 = await s.ready(b.id);
  await s.db.insert(schema.chatRestrictions).values({ userId: b.id, reason: 'x', until: null });
  c3.send({ t: 'auth', token: s.token(b.id) });
  assert.equal(await closeOf(c3), 4403);
});
