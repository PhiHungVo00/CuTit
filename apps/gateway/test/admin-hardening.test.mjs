import test from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { schema } from '../dist/db/client.js';
import { runAdminCli } from '../dist/scripts/admin-cli.js';
import {
  ADMIN_ORIGIN,
  APP_ORIGIN,
  MFA_KEY,
  MIN,
  PEPPER,
  PW,
  bearer,
  codeFor,
  cookieOf,
  enrollFully,
  grant,
  login,
  loginWithTotp,
  makeAdminApp,
  makeStaff,
  post,
  refresh,
  registerUser,
  sessionInfo
} from './admin-helpers.mjs';

/**
 * Dự án 5a Task 4 — vá theo bản rà `kien-truc` PR #50 (4 Trung bình + các điểm Thấp rẻ).
 * Mỗi test viết TRƯỚC khi sửa code (đỏ), sau đó xanh.
 */

const cli = async (ctx, ...argv) => runAdminCli(argv, { db: await ctx.db(), now: ctx.clock, pepper: PEPPER, mfaKey: MFA_KEY });
const expired = { error: 'session_expired' };

// ---------- TB1: đổi/đặt lại mật khẩu, xóa tài khoản => đóng phiên quản trị ----------

test('TB1: đổi mật khẩu (POST /v1/me/password) đóng MỌI phiên quản trị của người đó ngay', async () => {
  const ctx = await makeAdminApp();
  try {
    const staff = await makeStaff(ctx);
    const first = await enrollFully(ctx, 'chu.app');
    assert.equal((await sessionInfo(ctx, first.accessToken)).statusCode, 200);
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/v1/me/password',
      headers: bearer(staff.appAccessToken),
      payload: { currentPassword: PW, newPassword: 'mat-khau-moi-xanh-77' }
    });
    assert.equal(r.statusCode, 200, r.body);
    const dead = await sessionInfo(ctx, first.accessToken);
    assert.equal(dead.statusCode, 401);
    assert.deepEqual(dead.json(), expired);
    assert.equal((await refresh(ctx, first.cookie)).statusCode, 401);
  } finally {
    await ctx.close();
  }
});

test('TB1: đặt lại mật khẩu bằng mã dự phòng (/v1/auth/password/reset-backup) đóng phiên quản trị', async () => {
  const ctx = await makeAdminApp();
  try {
    const staff = await makeStaff(ctx);
    const first = await enrollFully(ctx, 'chu.app');
    const r = await post(ctx, '/v1/auth/password/reset-backup', { username: 'chu.app', backupCode: staff.backupCode, newPassword: 'mat-khau-moi-xanh-77' });
    assert.equal(r.statusCode, 200, r.body);
    const dead = await sessionInfo(ctx, first.accessToken);
    assert.equal(dead.statusCode, 401);
    assert.deepEqual(dead.json(), expired);
  } finally {
    await ctx.close();
  }
});

test('TB1: xóa tài khoản (hẹn xóa 30 ngày) đóng phiên quản trị; guard cũng chặn tài khoản đang chờ xóa dù phiên còn', async () => {
  const ctx = await makeAdminApp();
  try {
    const staff = await makeStaff(ctx);
    const first = await enrollFully(ctx, 'chu.app');
    const del = await ctx.app.inject({ method: 'DELETE', url: '/v1/me', headers: bearer(staff.appAccessToken), payload: { mode: 'grace' } });
    assert.equal(del.statusCode, 200, del.body);
    const dead = await sessionInfo(ctx, first.accessToken);
    assert.equal(dead.statusCode, 401);
    assert.deepEqual(dead.json(), expired);
    // Guard độc lập với việc thu hồi phiên: phiên còn sống nhưng tài khoản chờ xóa => 401
    const ctx2 = await makeAdminApp();
    try {
      const s2 = await makeStaff(ctx2);
      const f2 = await enrollFully(ctx2, 'chu.app');
      const d2 = await ctx2.db();
      await d2.update(schema.users).set({ deleteAt: new Date(ctx2.state.now + 86_400_000) }).where(eq(schema.users.id, s2.userId));
      const r = await sessionInfo(ctx2, f2.accessToken);
      assert.equal(r.statusCode, 401);
      assert.deepEqual(r.json(), expired);
    } finally {
      await ctx2.close();
    }
  } finally {
    await ctx.close();
  }
});

// ---------- TB2: mở khóa tên bị lợi dụng ----------

test('TB2: admin:unlock gỡ khóa theo tên ngay (chủ vào lại được từ IP khác); không có bộ đếm thì báo rõ', async () => {
  const ctx = await makeAdminApp();
  try {
    await makeStaff(ctx);
    const first = await enrollFully(ctx, 'chu.app');
    for (let i = 0; i < 5; i++) await login(ctx, 'chu.app', 'sai-mat-khau-1', { remoteAddress: '10.1.1.1' });
    assert.equal((await login(ctx, 'chu.app', PW, { remoteAddress: '10.2.2.2' })).statusCode, 429, 'bị khóa theo tên');
    const r = await cli(ctx, 'unlock', '--username', 'chu.app');
    assert.equal(r.code, 0, r.message);
    ctx.advance(31_000);
    const ok = await login(ctx, 'chu.app', PW, { remoteAddress: '10.2.2.2' });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().next, 'totp');
    void first;
    // Gỡ cả khóa ở bước mã 6 số
    const ticket = ok.json().ticket;
    for (let i = 0; i < 5; i++) await post(ctx, '/admin/v1/auth/totp', { ticket, code: '000000' }, { remoteAddress: '10.3.3.3' });
    assert.equal((await post(ctx, '/admin/v1/auth/totp', { ticket, code: '000000' }, { remoteAddress: '10.4.4.4' })).statusCode, 429);
    assert.equal((await cli(ctx, 'unlock', '--username', 'chu.app')).code, 0);
    assert.equal((await post(ctx, '/admin/v1/auth/totp', { ticket, code: '000000' }, { remoteAddress: '10.4.4.4' })).statusCode, 401);
    assert.equal((await cli(ctx, 'unlock', '--username', 'khong.co')).code, 1);
    // Nhật ký: tác nhân cli (không thêm hành động mới ngoài danh sách của contract)
  } finally {
    await ctx.close();
  }
});

// ---------- TB3: mã mời đăng ký mã 6 số ----------

test('TB3: không có mã mời thì KHÔNG đăng ký được mã 6 số dù biết mật khẩu; mã mời sai 403; đúng thì vào được', async () => {
  const ctx = await makeAdminApp();
  try {
    const staff = await makeStaff(ctx);
    assert.match(staff.inviteCode, /^[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}$/);
    const ticket = (await login(ctx, 'chu.app')).json().ticket;
    assert.equal((await post(ctx, '/admin/v1/auth/totp/enroll', { ticket })).statusCode, 400, 'thiếu mã mời');
    const wrong = await post(ctx, '/admin/v1/auth/totp/enroll', { ticket, inviteCode: 'aaaaa-bbbbb-ccccc' });
    assert.equal(wrong.statusCode, 403);
    assert.deepEqual(wrong.json(), { error: 'forbidden' });
    const ok = await post(ctx, '/admin/v1/auth/totp/enroll', { ticket, inviteCode: staff.inviteCode.toUpperCase() });
    assert.equal(ok.statusCode, 200);
    // DB: mã mời chỉ lưu băm
    const d = await ctx.db();
    const rows = await d.select().from(schema.staffInvites);
    assert.equal(rows.length, 1);
    assert.ok(!JSON.stringify(rows).includes(staff.inviteCode));
    // Mã mời hết hạn giữa enroll và confirm => confirm bị từ chối (403), kể cả khi mã 6 số đúng
    ctx.advance(24 * 60 * MIN + 1000);
    const t2 = (await login(ctx, 'chu.app')).json().ticket;
    const late = await post(ctx, '/admin/v1/auth/totp/confirm', { ticket: t2, code: codeFor(ok.json().secret, ctx.state.now) });
    assert.equal(late.statusCode, 403);
  } finally {
    await ctx.close();
  }
});

test('TB3: mã mời dùng MỘT lần (xóa khi xác nhận), hết hạn sau 24 giờ, không dùng chéo người; reset-totp cấp mã mời MỚI', async () => {
  const ctx = await makeAdminApp();
  try {
    const a = await makeStaff(ctx, 'chu.app');
    const b = await makeStaff(ctx, 'nhan.vien');
    // mã của B không dùng cho A
    const tA = (await login(ctx, 'chu.app')).json().ticket;
    assert.equal((await post(ctx, '/admin/v1/auth/totp/enroll', { ticket: tA, inviteCode: b.inviteCode })).statusCode, 403);
    // hết hạn
    ctx.advance(24 * 60 * MIN + 1000);
    const tA2 = (await login(ctx, 'chu.app')).json().ticket;
    assert.equal((await post(ctx, '/admin/v1/auth/totp/enroll', { ticket: tA2, inviteCode: a.inviteCode })).statusCode, 403, 'mã mời quá 24 giờ');
    // cấp lại bằng grant lên người chưa đăng ký (đã có vai trò) => mã mới
    const re = await grant(ctx, 'chu.app');
    assert.ok(re.inviteCode && re.inviteCode !== a.inviteCode);
    const first = await enrollFully(ctx, 'chu.app');
    assert.equal(first.backupCodes.length, 10);
    // đã xác nhận: mã mời bị xóa; không còn dùng được
    const d = await ctx.db();
    assert.equal((await d.select().from(schema.staffInvites).where(eq(schema.staffInvites.userId, a.userId))).length, 0);
    // grant lại khi đã có TOTP xác nhận: không cấp mã mời
    const again = await grant(ctx, 'chu.app', 'support');
    assert.equal(again.inviteCode, undefined);
    // reset-totp: cấp mã mời mới và bắt buộc dùng
    const rs = await cli(ctx, 'reset-totp', '--username', 'chu.app');
    assert.ok(rs.inviteCode);
    ctx.invites['chu.app'] = rs.inviteCode;
    const t = (await login(ctx, 'chu.app')).json().ticket;
    assert.equal((await post(ctx, '/admin/v1/auth/totp/enroll', { ticket: t, inviteCode: a.inviteCode })).statusCode, 403);
    assert.equal((await post(ctx, '/admin/v1/auth/totp/enroll', { ticket: t, inviteCode: rs.inviteCode })).statusCode, 200);
  } finally {
    await ctx.close();
  }
});

// ---------- TB4: refresh xoay vòng + phát hiện dùng lại ----------

test('TB4: refresh xoay vòng — cookie mới mỗi lần; cookie cũ trong 30 giây ân hạn vẫn nhận (không đặt cookie); quá ân hạn => thu hồi phiên', async () => {
  const ctx = await makeAdminApp();
  try {
    await makeStaff(ctx);
    const first = await enrollFully(ctx, 'chu.app');
    const r1 = await refresh(ctx, first.cookie);
    assert.equal(r1.statusCode, 200);
    const c1 = cookieOf(r1);
    assert.ok(c1 && c1 !== first.cookie, 'cookie được xoay');
    assert.match([].concat(r1.headers['set-cookie']).join(';'), /HttpOnly; Secure; SameSite=Strict; Path=\/admin\/v1\/auth/);
    // ân hạn: tab thứ hai còn gửi cookie cũ trong 30 giây
    ctx.advance(20_000);
    const grace = await refresh(ctx, first.cookie);
    assert.equal(grace.statusCode, 200);
    assert.equal(cookieOf(grace), null, 'trong ân hạn không phát cookie mới');
    assert.equal((await sessionInfo(ctx, grace.json().accessToken)).statusCode, 200);
    // cookie mới dùng được và xoay tiếp
    const r2 = await refresh(ctx, c1);
    assert.equal(r2.statusCode, 200);
    const c2 = cookieOf(r2);
    assert.ok(c2 && c2 !== c1);
    // Dùng lại cookie ĐÃ XOAY quá ân hạn => nghi đánh cắp: thu hồi cả phiên
    ctx.advance(45_000);
    const reuse = await refresh(ctx, c1);
    assert.equal(reuse.statusCode, 401);
    assert.deepEqual(reuse.json(), expired);
    assert.equal((await refresh(ctx, c2)).statusCode, 401, 'cookie hợp lệ của chủ cũng chết (phiên đã thu hồi)');
    assert.equal((await sessionInfo(ctx, r2.json().accessToken)).statusCode, 401);
    await ctx.app.adminAlerts.flush();
    const d = await ctx.db();
    const [s] = await d.select().from(schema.adminSessions);
    assert.ok(s.revokedAt);
    assert.ok(!JSON.stringify(s).includes(first.cookie.split('=')[1]));
  } finally {
    await ctx.close();
  }
});

test('TB4: hai refresh SONG SONG cùng cookie => cả hai nhận access, nhiều nhất một cái phát cookie mới, phiên không bị thu hồi', async () => {
  const ctx = await makeAdminApp();
  try {
    await makeStaff(ctx);
    const first = await enrollFully(ctx, 'chu.app');
    const res = await Promise.all([refresh(ctx, first.cookie), refresh(ctx, first.cookie)]);
    assert.deepEqual(res.map((r) => r.statusCode), [200, 200]);
    const set = res.map(cookieOf).filter(Boolean);
    assert.equal(set.length, 1);
    assert.equal((await refresh(ctx, set[0])).statusCode, 200);
  } finally {
    await ctx.close();
  }
});

// ---------- Thấp 5: vé dùng một lần ----------

test('Thấp5: vé đăng nhập dùng một lần — sau một lần ra phiên (mã 6 số hoặc mã dự phòng), vé cũ không tạo thêm phiên', async () => {
  const ctx = await makeAdminApp();
  try {
    await makeStaff(ctx);
    const first = await enrollFully(ctx, 'chu.app');
    ctx.advance(31_000);
    const ticket = (await login(ctx, 'chu.app')).json().ticket;
    assert.equal((await post(ctx, '/admin/v1/auth/totp', { ticket, code: codeFor(first.secret, ctx.state.now) })).statusCode, 200);
    ctx.advance(31_000);
    const again = await post(ctx, '/admin/v1/auth/totp', { ticket, code: codeFor(first.secret, ctx.state.now) });
    assert.equal(again.statusCode, 401);
    assert.deepEqual(again.json(), { error: 'ticket_invalid' });
    // mã dự phòng
    const t2 = (await login(ctx, 'chu.app')).json().ticket;
    assert.equal((await post(ctx, '/admin/v1/auth/totp', { ticket: t2, backupCode: first.backupCodes[0] })).statusCode, 200);
    const reuse = await post(ctx, '/admin/v1/auth/totp', { ticket: t2, backupCode: first.backupCodes[1] });
    assert.equal(reuse.statusCode, 401);
    assert.deepEqual(reuse.json(), { error: 'ticket_invalid' });
  } finally {
    await ctx.close();
  }
});

// ---------- Thấp 7: CORS với URL mã hóa phần trăm ----------

test('Thấp7: CORS phân loại theo đường dẫn ĐÃ chuẩn hóa — /%61dmin/v1/... xử lý như admin (chỉ ADMIN_ORIGIN), không như /v1', async () => {
  const ctx = await makeAdminApp();
  try {
    const pre = (url, origin) =>
      ctx.app.inject({ method: 'OPTIONS', url, headers: { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' } });
    const enc = await pre('/%61dmin/v1/session', ADMIN_ORIGIN);
    assert.equal(enc.headers['access-control-allow-origin'], ADMIN_ORIGIN);
    assert.equal(enc.headers['access-control-allow-credentials'], 'true');
    assert.equal((await pre('/%61dmin/v1/session', APP_ORIGIN)).headers['access-control-allow-origin'], undefined);
    assert.equal((await pre('//admin/v1/session', APP_ORIGIN)).headers['access-control-allow-origin'], undefined);
    assert.equal((await pre('/v1/quota', APP_ORIGIN)).headers['access-control-allow-origin'], APP_ORIGIN);
  } finally {
    await ctx.close();
  }
});

test('đăng nhập đầy đủ vẫn chạy với luồng mới (mã mời + xoay vòng): enroll → refresh → totp lần sau', async () => {
  const ctx = await makeAdminApp();
  try {
    await makeStaff(ctx);
    const first = await enrollFully(ctx, 'chu.app');
    const r = await refresh(ctx, first.cookie);
    assert.equal(r.statusCode, 200);
    const second = await loginWithTotp(ctx, 'chu.app', first.secret);
    assert.equal((await sessionInfo(ctx, second.accessToken)).statusCode, 200);
    void registerUser;
  } finally {
    await ctx.close();
  }
});
