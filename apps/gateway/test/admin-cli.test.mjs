import test from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { schema } from '../dist/db/client.js';
import { runAdminCli } from '../dist/scripts/admin-cli.js';
import { listAdminAudit } from '../dist/services/admin/audit.js';
import { getRoles } from '../dist/services/admin/roles.js';
import {
  MFA_KEY,
  PEPPER,
  bearer,
  enrollFully,
  fakeMail,
  loginWithTotp,
  login,
  makeAdminApp,
  makeStaff,
  post,
  refresh,
  registerUser,
  sessionInfo
} from './admin-helpers.mjs';

/** Dự án 5a Task 4 — CLI `admin:grant | admin:revoke | admin:reset-totp` (tác nhân `cli`, có hiệu lực ngay, không cache). */

const run = async (ctx, ...argv) => {
  const r = await runAdminCli(argv, { db: await ctx.db(), now: ctx.clock, mfaKey: MFA_KEY, pepper: PEPPER });
  if (r.inviteCode && argv[0] !== 'unlock') {
    const eq = argv.find((a) => a.startsWith('--username='));
    const name = eq ? eq.slice('--username='.length) : argv[argv.indexOf('--username') + 1];
    ctx.invites[name.toLowerCase()] = r.inviteCode;
  }
  return r;
};

test('CLI từ chối đầu vào sai: thiếu lệnh/tên/vai trò, vai trò lạ, tên sai dạng => mã 2, không đụng DB', async () => {
  const ctx = await makeAdminApp();
  try {
    await registerUser(ctx, 'chu.app');
    for (const argv of [[], ['grant'], ['grant', '--username', 'chu.app'], ['grant', '--username', 'chu.app', '--role', 'god'], ['grant', '--username', 'a b', '--role', 'owner'], ['xoa', '--username', 'chu.app'], ['revoke', '--role', 'owner']]) {
      const r = await run(ctx, ...argv);
      assert.equal(r.code, 2, JSON.stringify(argv));
    }
    assert.equal((await (await ctx.db()).select().from(schema.staffRoles)).length, 0);
    assert.equal((await listAdminAudit(await ctx.db())).length, 0);
  } finally {
    await ctx.close();
  }
});

test('CLI: tên không có tài khoản mật khẩu => mã 1; tài khoản đang chờ xóa => mã 1; tài khoản KHÁCH (không có mật khẩu) không cấp được', async () => {
  const ctx = await makeAdminApp();
  try {
    assert.equal((await run(ctx, 'grant', '--username', 'khong.co', '--role', 'owner')).code, 1);
    const u = await registerUser(ctx, 'chu.app');
    const d = await ctx.db();
    await d.update(schema.users).set({ deleteAt: new Date(ctx.state.now + 86_400_000) }).where(eq(schema.users.id, u.userId));
    assert.equal((await run(ctx, 'grant', '--username', 'chu.app', '--role', 'owner')).code, 1);
    assert.equal((await d.select().from(schema.staffRoles)).length, 0);
    const g = await ctx.app.inject({ method: 'POST', url: '/v1/auth/guest' });
    assert.equal(g.statusCode, 200);
  } finally {
    await ctx.close();
  }
});

test('admin:grant: cấp vai trò + nhật ký tác nhân cli (cùng transaction); chạy lại không đổi, không ghi nhật ký thêm; chấp nhận --username=…', async () => {
  const ctx = await makeAdminApp();
  try {
    const u = await registerUser(ctx, 'chu.app');
    const d = await ctx.db();
    const r1 = await run(ctx, 'grant', '--username=Chu.App', '--role', 'owner');
    assert.match(r1.inviteCode, /^[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}$/);
    assert.equal(r1.code, 0);
    assert.deepEqual(await getRoles(d, u.userId), ['owner']);
    const r2 = await run(ctx, 'grant', '--username', 'chu.app', '--role', 'owner');
    assert.equal(r2.code, 0);
    assert.match(r2.message, /đã có/);
    const rows = await listAdminAudit(d);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, 'role.grant');
    assert.equal(rows[0].actorKind, 'cli');
    assert.equal(rows[0].actorUserId, null);
    assert.equal(rows[0].targetId, u.userId);
    assert.deepEqual(rows[0].meta, { role: 'owner' });
    // Vai trò thứ hai
    assert.equal((await run(ctx, 'grant', '--username', 'chu.app', '--role', 'support')).code, 0);
    assert.deepEqual((await getRoles(d, u.userId)).sort(), ['owner', 'support']);
  } finally {
    await ctx.close();
  }
});

test('admin:grant gửi cảnh báo email (nếu có mail + email đã xác minh); không có mail thì im lặng', async () => {
  const mail = fakeMail(true);
  const ctx = await makeAdminApp();
  try {
    const u = await registerUser(ctx, 'chu.app');
    const d = await ctx.db();
    await d.insert(schema.identities).values({ userId: u.userId, provider: 'email', subject: 'chu@example.com', display: 'chu@example.com', emailVerified: true });
    assert.equal((await runAdminCli(['grant', '--username', 'chu.app', '--role', 'owner'], { db: d, now: ctx.clock, mail, mfaKey: MFA_KEY })).code, 0);
    assert.equal(mail.sent.length, 1);
    assert.match(mail.sent[0].subjectVi, /được cấp quyền/);
    // Lỗi gửi không làm hỏng lệnh
    const broken = { ...fakeMail(true), send: async () => { throw new Error('smtp down'); } };
    assert.equal((await runAdminCli(['grant', '--username', 'chu.app', '--role', 'editor'], { db: d, now: ctx.clock, mail: broken, mfaKey: MFA_KEY })).code, 0);
  } finally {
    await ctx.close();
  }
});

test('admin:revoke: request kế tiếp bị 403 NGAY (không cache), dù access token + phiên còn hạn; refresh cũng không dùng được', async () => {
  const ctx = await makeAdminApp();
  try {
    await makeStaff(ctx);
    const first = await enrollFully(ctx, 'chu.app');
    assert.equal((await sessionInfo(ctx, first.accessToken)).statusCode, 200);
    const r = await run(ctx, 'revoke', '--username', 'chu.app', '--role', 'owner');
    assert.equal(r.code, 0);
    const next = await sessionInfo(ctx, first.accessToken);
    assert.equal(next.statusCode, 403);
    assert.deepEqual(next.json(), { error: 'forbidden' });
    const rf = await refresh(ctx, first.cookie);
    assert.equal(rf.statusCode, 401);
    assert.deepEqual(rf.json(), { error: 'session_expired' });
    // Đăng nhập lại: giống hệt sai mật khẩu
    assert.deepEqual((await login(ctx, 'chu.app')).json(), { error: 'invalid_credentials' });
    // Nhật ký
    const rows = await listAdminAudit(await ctx.db());
    assert.ok(rows.some((x) => x.action === 'role.revoke' && x.actorKind === 'cli' && x.actorUserId === null));
    // Thu lần nữa: không đổi gì
    assert.match((await run(ctx, 'revoke', '--username', 'chu.app', '--role', 'owner')).message, /không có vai trò/);
    assert.equal((await listAdminAudit(await ctx.db())).filter((x) => x.action === 'role.revoke').length, 1);
  } finally {
    await ctx.close();
  }
});

test('admin:revoke một trong hai vai trò: phiên vẫn sống với vai trò còn lại; cấp lại sau khi thu hết thì phiên CŨ không sống lại', async () => {
  const ctx = await makeAdminApp();
  try {
    await makeStaff(ctx);
    await run(ctx, 'grant', '--username', 'chu.app', '--role', 'support');
    const first = await enrollFully(ctx, 'chu.app');
    await run(ctx, 'revoke', '--username', 'chu.app', '--role', 'owner');
    const still = await sessionInfo(ctx, first.accessToken);
    assert.equal(still.statusCode, 200);
    assert.deepEqual(still.json().roles, ['support']);
    await run(ctx, 'revoke', '--username', 'chu.app', '--role', 'support');
    assert.equal((await sessionInfo(ctx, first.accessToken)).statusCode, 403);
    await run(ctx, 'grant', '--username', 'chu.app', '--role', 'owner');
    const revived = await sessionInfo(ctx, first.accessToken);
    assert.equal(revived.statusCode, 401, 'phiên cũ đã bị đóng khi thu hết vai trò');
    assert.deepEqual(revived.json(), { error: 'session_expired' });
  } finally {
    await ctx.close();
  }
});

test('admin:reset-totp: xóa mã 6 số + mã dự phòng, đóng mọi phiên, lần đăng nhập sau lại là enroll và mã cũ không dùng được', async () => {
  const ctx = await makeAdminApp();
  try {
    const staff = await makeStaff(ctx);
    const first = await enrollFully(ctx, 'chu.app');
    const second = await loginWithTotp(ctx, 'chu.app', first.secret);
    assert.equal((await sessionInfo(ctx, first.accessToken)).statusCode, 200);
    const r = await run(ctx, 'reset-totp', '--username', 'chu.app');
    assert.equal(r.code, 0);
    const d = await ctx.db();
    assert.equal((await d.select().from(schema.staffTotp)).length, 0);
    for (const t of [first.accessToken, second.accessToken]) {
      assert.equal((await sessionInfo(ctx, t)).statusCode, 401);
    }
    assert.equal((await refresh(ctx, second.cookie)).statusCode, 401);
    // Vai trò còn nguyên; đăng nhập => enroll lại với bí mật MỚI, mã dự phòng cũ vô hiệu
    assert.deepEqual(await getRoles(d, staff.userId), ['owner']);
    const l = await login(ctx, 'chu.app');
    assert.equal(l.json().next, 'enroll');
    const re = await enrollFully(ctx, 'chu.app').catch((e) => e);
    assert.ok(re.secret && re.secret !== first.secret);
    ctx.advance(31_000);
    const l2 = await login(ctx, 'chu.app');
    assert.equal(l2.json().next, 'totp');
    assert.equal((await post(ctx, '/admin/v1/auth/totp', { ticket: l2.json().ticket, backupCode: first.backupCodes[0] })).statusCode, 401);
    const rows = await listAdminAudit(d);
    assert.ok(rows.some((x) => x.action === 'totp.reset' && x.actorKind === 'cli'));
  } finally {
    await ctx.close();
  }
});

test('mọi lệnh CLI không để lộ bí mật trong nhật ký/kết quả (không có khóa, mật khẩu, hash)', async () => {
  const ctx = await makeAdminApp();
  try {
    await makeStaff(ctx);
    const out = [];
    out.push((await run(ctx, 'grant', '--username', 'chu.app', '--role', 'editor')).message);
    out.push((await run(ctx, 'revoke', '--username', 'chu.app', '--role', 'editor')).message);
    out.push((await run(ctx, 'reset-totp', '--username', 'chu.app')).message);
    const blob = JSON.stringify([out, await listAdminAudit(await ctx.db())]);
    for (const secretish of ['00112233445566778899aabbccddeeff', 'test-admin-jwt-secret', 'ca-phe-sua-da-42', '$argon2']) {
      assert.ok(!blob.includes(secretish), secretish);
    }
  } finally {
    await ctx.close();
  }
});

test('bearer app không bao giờ thành quyền quản trị: người có vai trò dùng token APP gọi /admin/v1 vẫn 401', async () => {
  const ctx = await makeAdminApp();
  try {
    const staff = await makeStaff(ctx);
    assert.equal((await ctx.app.inject({ method: 'GET', url: '/admin/v1/session', headers: bearer(staff.appAccessToken) })).statusCode, 401);
  } finally {
    await ctx.close();
  }
});
