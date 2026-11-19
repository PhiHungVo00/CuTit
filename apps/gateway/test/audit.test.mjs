import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { desc, eq } from 'drizzle-orm';
import { loadConfig } from '../dist/config.js';
import { createDbProvider, schema } from '../dist/db/client.js';
import { AuditLog, AUDIT_RETENTION_DAYS, purgeAuditEvents, shortUserAgent } from '../dist/services/audit/audit.js';
import { makeApp, guest } from './helpers.mjs';

/** Nhật ký sự kiện bảo mật (audit_events): slide 04/08 — “cần có log để biết mình bị lộ”. */
const dbp = createDbProvider({ PGLITE_DIR: 'memory://' });
const SALT = 'audit-salt-for-tests-at-least-32-characters';
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36 ' + 'x'.repeat(400);
let a;
before(async () => {
  a = await makeApp({ AUDIT_IP_SALT: SALT, AUTH_RATE_LIMIT_PER_MINUTE: '1000', RATE_LIMIT_PER_MINUTE: '1000', FRIEND_INVITE_RATE_LIMIT_PER_MINUTE: '1000' }, { db: dbp });
});
after(async () => {
  await a.close();
  await dbp.close();
});

const rows = async (type) => {
  await a.audit.flush();
  const db = await dbp.get();
  return db.select().from(schema.auditEvents).where(eq(schema.auditEvents.type, type)).orderBy(desc(schema.auditEvents.createdAt));
};
const rowsOf = async (userId) => {
  await a.audit.flush();
  const db = await dbp.get();
  return db.select().from(schema.auditEvents).where(eq(schema.auditEvents.userId, userId));
};

test('Tạo khách => một dòng auth.guest_created: user_id, IP đã băm (không IP thô), user-agent rút gọn', async () => {
  const res = await a.inject({ method: 'POST', url: '/v1/auth/guest', headers: { 'user-agent': UA } });
  assert.equal(res.statusCode, 200);
  const { userId } = res.json();
  const [row] = (await rows('auth.guest_created')).filter((r) => r.userId === userId);
  assert.ok(row, 'có dòng sự kiện');
  assert.equal(row.outcome, 'success');
  assert.match(row.ipHash, /^[0-9a-f]{32}$/);
  assert.ok(!JSON.stringify(row).includes('127.0.0.1'), 'không lưu IP thô');
  assert.ok(row.userAgent.length <= 120);
  assert.ok(row.userAgent.startsWith('Mozilla/5.0 (Linux; Android 14'));
  assert.ok(row.createdAt instanceof Date);
  assert.deepEqual(row.metadata, {});
});

test('Khôi phục bằng mã: đúng => success, sai => failure; không lưu mã khôi phục', async () => {
  const g = await guest(a);
  const ok = await a.inject({ method: 'POST', url: '/v1/auth/recover', payload: { recoveryCode: g.body.recoveryCode } });
  assert.equal(ok.statusCode, 200);
  const bad = await a.inject({ method: 'POST', url: '/v1/auth/recover', payload: { recoveryCode: '0000-0000-0000-0001' } });
  assert.equal(bad.statusCode, 401);
  const all = await rows('auth.recover');
  const success = all.find((r) => r.userId === g.body.userId);
  assert.equal(success?.outcome, 'success');
  const failure = all.find((r) => r.outcome === 'failure');
  assert.ok(failure);
  assert.equal(failure.userId, null);
  assert.deepEqual(failure.metadata, { reason: 'invalid_recovery_code' });
  const text = JSON.stringify(all);
  assert.ok(!text.includes(g.body.recoveryCode) && !text.includes('0000-0000-0000-0001'), 'không lưu mã');
});

test('Dùng lại refresh token đã xoay vòng => auth.refresh_reuse (chủ token); token lạ không phải “dùng lại”', async () => {
  const g = await guest(a);
  const r1 = await a.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: g.body.refreshToken } });
  assert.equal(r1.statusCode, 200);
  const before = (await rows('auth.refresh_reuse')).length;
  await a.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: 'khong-phai-token-that-0123456789abcdef' } });
  assert.equal((await rows('auth.refresh_reuse')).length, before, 'token không tồn tại => không ghi reuse');
  const reuse = await a.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: g.body.refreshToken } });
  assert.equal(reuse.statusCode, 401);
  const found = (await rows('auth.refresh_reuse')).filter((r) => r.userId === g.body.userId);
  assert.equal(found.length, 1);
  assert.equal(found[0].outcome, 'failure');
  assert.ok(!JSON.stringify(found).includes(g.body.refreshToken));
});

test('Mã mời bạn bè: tạo => success; nhập mã sai => failure (không lưu mã, không lưu id người khác)', async () => {
  const g = await guest(a);
  await a.inject({ method: 'PUT', url: '/v1/friends/profile', headers: g.headers, payload: { displayName: 'Lan' } });
  const inv = await a.inject({ method: 'POST', url: '/v1/friends/invite', headers: g.headers });
  assert.equal(inv.statusCode, 200);
  const acc = await a.inject({ method: 'POST', url: '/v1/friends/accept', headers: g.headers, payload: { code: 'ZZZZ-ZZZZ' } });
  assert.equal(acc.statusCode, 404);
  const mine = await rowsOf(g.body.userId);
  assert.equal(mine.find((r) => r.type === 'friends.invite_created')?.outcome, 'success');
  const failed = mine.find((r) => r.type === 'friends.invite_accepted');
  assert.equal(failed?.outcome, 'failure');
  assert.deepEqual(failed.metadata, { reason: 'invite_invalid' });
  const text = JSON.stringify(mine);
  assert.ok(!text.includes(inv.json().code) && !text.includes('ZZZZ-ZZZZ'));
});

test('Xóa tài khoản => mọi dòng của user bị ẩn danh hóa (user_id = null), có dòng account.deleted không định danh', async () => {
  const g = await guest(a);
  await a.inject({ method: 'POST', url: '/v1/auth/recover', payload: { recoveryCode: g.body.recoveryCode } });
  assert.ok((await rowsOf(g.body.userId)).length >= 2);
  const del = await a.inject({ method: 'DELETE', url: '/v1/me', headers: g.headers });
  assert.equal(del.statusCode, 200);
  assert.equal((await rowsOf(g.body.userId)).length, 0, 'không còn dòng nào gắn user_id cũ');
  const deleted = await rows('account.deleted');
  assert.ok(deleted.length >= 1);
  assert.equal(deleted[0].userId, null);
  assert.equal(deleted[0].outcome, 'success');
  assert.ok(!JSON.stringify(deleted).includes(g.body.userId));
});

test('Vượt rate limit /v1/auth => đúng MỘT dòng auth.rate_limited mỗi IP mỗi cửa sổ (không ghi tràn)', async () => {
  const dbq = createDbProvider({ PGLITE_DIR: 'memory://' });
  const app = await makeApp({ AUDIT_IP_SALT: SALT, AUTH_RATE_LIMIT_PER_MINUTE: '2' }, { db: dbq });
  try {
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await app.inject({ method: 'POST', url: '/v1/auth/guest' })).statusCode);
    assert.deepEqual(codes, [200, 200, 429, 429, 429, 429]);
    await app.audit.flush();
    const db = await dbq.get();
    const limited = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.type, 'auth.rate_limited'));
    assert.equal(limited.length, 1);
    assert.equal(limited[0].outcome, 'blocked');
    assert.deepEqual(limited[0].metadata, { route: '/v1/auth/guest' });
  } finally {
    await app.close();
    await dbq.close();
  }
});

test('Lỗi xác thực lặp nhiều lần từ một IP => một dòng auth.failure_burst; ít lần => không ghi', async () => {
  const dbq = createDbProvider({ PGLITE_DIR: 'memory://' });
  const app = await makeApp({ AUDIT_IP_SALT: SALT }, { db: dbq });
  try {
    const bad = () => app.inject({ url: '/v1/speech/voices', headers: { authorization: 'Bearer abc.def.ghi' } });
    for (let i = 0; i < 4; i++) assert.equal((await bad()).statusCode, 401);
    await app.audit.flush();
    const db = await dbq.get();
    const q = () => db.select().from(schema.auditEvents).where(eq(schema.auditEvents.type, 'auth.failure_burst'));
    assert.equal((await q()).length, 0, 'dưới ngưỡng');
    for (let i = 0; i < 20; i++) await bad();
    await app.audit.flush();
    const burst = await q();
    assert.equal(burst.length, 1, 'một dòng mỗi cửa sổ, không ghi mỗi request');
    assert.equal(burst[0].outcome, 'failure');
    assert.equal(burst[0].metadata.lastReason, 'invalid_token');
    assert.equal(burst[0].metadata.threshold, 5);
  } finally {
    await app.close();
    await dbq.close();
  }
});

test('Dọn nhật ký: xóa dòng cũ hơn 180 ngày, giữ dòng mới', async () => {
  assert.equal(AUDIT_RETENTION_DAYS, 180);
  const dbq = createDbProvider({ PGLITE_DIR: 'memory://' });
  try {
    const db = await dbq.get();
    const now = new Date('2026-11-19T00:00:00Z');
    const day = 24 * 3600 * 1000;
    await db.insert(schema.auditEvents).values([
      { type: 'auth.guest_created', outcome: 'success', createdAt: new Date(now.getTime() - 181 * day) },
      { type: 'auth.guest_created', outcome: 'success', createdAt: new Date(now.getTime() - 179 * day) }
    ]);
    assert.equal(await purgeAuditEvents(db, now), 1);
    const left = await db.select().from(schema.auditEvents);
    assert.equal(left.length, 1);
    assert.ok(left[0].createdAt.getTime() > now.getTime() - 180 * day);
  } finally {
    await dbq.close();
  }
});

test('AuditLog: ghi bất đồng bộ (record trả về ngay), lỗi ghi không ném ra, chỉ ghi log cảnh báo', async () => {
  const warnings = [];
  const broken = { get: () => Promise.reject(new Error('db down')), close: async () => {} };
  const audit = new AuditLog(broken, { salt: SALT, log: { warn: (o, m) => warnings.push(m ?? o) } });
  const ret = audit.record('auth.guest_created', { outcome: 'success', ctx: { ip: '1.2.3.4' } });
  assert.equal(ret, undefined, 'không trả promise để request phải chờ');
  await audit.flush();
  assert.equal(warnings.length, 1);
});

test('AuditLog: metadata chỉ giữ trường trong danh sách trắng; băm IP ổn định theo muối', async () => {
  const written = [];
  const fake = { get: async () => ({ insert: () => ({ values: async (v) => written.push(v) }) }), close: async () => {} };
  const audit = new AuditLog(fake, { salt: SALT });
  audit.record('auth.recover', {
    outcome: 'failure',
    ctx: { ip: '1.2.3.4' },
    metadata: { reason: 'invalid_recovery_code', recoveryCode: 'ABCD-EFGH-JKMN-PQRS', userId: 'x' }
  });
  await audit.flush();
  assert.deepEqual(written[0].metadata, { reason: 'invalid_recovery_code' });
  assert.equal(written[0].ipHash, audit.hashIp('1.2.3.4'));
  assert.notEqual(audit.hashIp('1.2.3.4'), new AuditLog(fake, { salt: SALT + 'khac' }).hashIp('1.2.3.4'));
});

test('AuditLog: hàng đợi có giới hạn — vượt thì bỏ bớt và cảnh báo, không giữ bộ nhớ vô hạn', async () => {
  const warnings = [];
  let release;
  const gate = new Promise((r) => (release = r));
  const slow = { get: async () => { await gate; return { insert: () => ({ values: async () => {} }) }; }, close: async () => {} };
  const audit = new AuditLog(slow, { salt: SALT, maxPending: 3, log: { warn: (o, m) => warnings.push(m ?? o) } });
  for (let i = 0; i < 5; i++) audit.record('auth.guest_created', { outcome: 'success' });
  assert.equal(audit.pendingCount, 3);
  release();
  await audit.flush();
  assert.ok(warnings.length >= 1);
  assert.equal(audit.droppedCount, 2);
});

test('shortUserAgent: rút gọn, bỏ ký tự điều khiển; rỗng => null', () => {
  assert.equal(shortUserAgent(undefined), null);
  assert.equal(shortUserAgent('  '), null);
  assert.equal(shortUserAgent('a\nb\u0000c'), 'a b c');
  assert.equal(shortUserAgent('x'.repeat(500)).length, 120);
});

test('Cấu hình: production bắt buộc AUDIT_IP_SALT (≥ 32 ký tự); dev/test thiếu thì sinh ngẫu nhiên mỗi lần chạy', () => {
  const secret = 'prod-secret-that-is-at-least-32-characters-long';
  assert.throws(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: secret }), /AUDIT_IP_SALT/);
  assert.throws(() => loadConfig({ NODE_ENV: 'test', AUDIT_IP_SALT: 'ngan' }), /AUDIT_IP_SALT/);
  assert.ok(loadConfig({ NODE_ENV: 'production', JWT_SECRET: secret, AUDIT_IP_SALT: SALT }));
  assert.ok(loadConfig({ NODE_ENV: 'test' }).AUDIT_IP_SALT.length >= 32);
  assert.notEqual(loadConfig({ NODE_ENV: 'test' }).AUDIT_IP_SALT, loadConfig({ NODE_ENV: 'test' }).AUDIT_IP_SALT);
});

test('Ghi muộn sau khi tài khoản đã xóa (vi phạm FK) => vẫn lưu, ẩn danh (user_id = null)', async () => {
  const g = await guest(a);
  await a.inject({ method: 'DELETE', url: '/v1/me', headers: g.headers });
  await a.audit.flush();
  a.audit.record('friends.invite_created', { outcome: 'success', userId: g.body.userId, ctx: { ip: '10.0.0.9' } });
  await a.audit.flush();
  const db = await dbp.get();
  const late = (await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.type, 'friends.invite_created'))).filter(
    (r) => r.ipHash === a.audit.hashIp('10.0.0.9')
  );
  assert.equal(late.length, 1);
  assert.equal(late[0].userId, null);
});
