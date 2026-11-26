import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { eq, sql } from 'drizzle-orm';
import { loadConfig } from '../dist/config.js';
import { schema } from '../dist/db/client.js';
import { withAdminAudit, listAdminAudit } from '../dist/services/admin/audit.js';
import { AdminCrypto } from '../dist/services/admin/crypto.js';
import { purgeAdminData } from '../dist/services/admin/purge.js';
import {
  ADMIN_JWT_SECRET,
  ADMIN_ORIGIN,
  APP_JWT_SECRET,
  APP_ORIGIN,
  HOUR,
  MFA_KEY,
  MIN,
  PW,
  bearer,
  codeFor,
  cookieOf,
  enrollFully,
  fakeMail,
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
 * Dự án 5a Task 4 — đăng nhập quản trị (mật khẩu + TOTP), phiên, quyền, CORS, bật/tắt, nhật ký, dọn.
 * Chạy trên PGlite (mỗi test một DB mới). Đồng hồ giả tăng được để kiểm hạn mã/phiên mà không chờ thật.
 * Khóa dùng trong test là khóa giả, không phải khóa thật.
 */

const INVALID = { error: 'invalid_credentials' };

test('login: sai mật khẩu, tên không có, và đúng mật khẩu nhưng KHÔNG có vai trò => cùng status + cùng thân + không cookie', async () => {
  const ctx = await makeAdminApp();
  try {
    await makeStaff(ctx, 'chu.app');
    await registerUser(ctx, 'hoc.sinh'); // đúng mật khẩu, không có vai trò
    const wrongPw = await login(ctx, 'chu.app', 'sai-mat-khau-1');
    const noUser = await login(ctx, 'khong.ton.tai', PW);
    const noRole = await login(ctx, 'hoc.sinh', PW);
    for (const r of [wrongPw, noUser, noRole]) {
      assert.equal(r.statusCode, 401);
      assert.deepEqual(r.json(), INVALID);
      assert.equal(r.headers['set-cookie'], undefined);
    }
    assert.equal(wrongPw.body, noUser.body);
    assert.equal(wrongPw.body, noRole.body);
    // Đầu vào sai hình dạng bị Zod chặn (strict)
    assert.equal((await post(ctx, '/admin/v1/auth/login', { username: 'a', password: 'b', extra: 1 })).statusCode, 400);
  } finally {
    await ctx.close();
  }
});

test('lần đầu: login => next=enroll; enroll trả otpauthUrl; confirm sai mã 401; confirm đúng => phiên + 10 mã dự phòng + cookie đúng cờ; bí mật lưu MÃ HÓA', async () => {
  const ctx = await makeAdminApp();
  try {
    const staff0 = await makeStaff(ctx);
    const l = await login(ctx, 'chu.app');
    assert.equal(l.statusCode, 200);
    assert.equal(l.json().next, 'enroll');
    assert.equal(l.headers['cache-control'], 'no-store');
    const { ticket } = l.json();
    const e = await post(ctx, '/admin/v1/auth/totp/enroll', { ticket, inviteCode: staff0.inviteCode });
    assert.equal(e.statusCode, 200);
    assert.match(e.json().otpauthUrl, /^otpauth:\/\/totp\//);
    assert.match(e.json().otpauthUrl, /algorithm=SHA1/);
    assert.match(e.json().otpauthUrl, /digits=6/);
    assert.match(e.json().otpauthUrl, /period=30/);
    const secret = e.json().secret;
    const bad = await post(ctx, '/admin/v1/auth/totp/confirm', { ticket, code: '000000' });
    assert.equal(bad.statusCode, 401);
    assert.deepEqual(bad.json(), { error: 'totp_invalid' });
    assert.equal(bad.headers['set-cookie'], undefined);
    const ok = await post(ctx, '/admin/v1/auth/totp/confirm', { ticket, code: codeFor(secret, ctx.state.now) });
    assert.equal(ok.statusCode, 200);
    const body = ok.json();
    assert.equal(body.expiresIn, 600);
    assert.equal(body.backupCodes.length, 10);
    assert.equal(new Set(body.backupCodes).size, 10);
    for (const c of body.backupCodes) assert.match(c, /^[a-z0-9]{5}-[a-z0-9]{5}$/);
    const cookie = [].concat(ok.headers['set-cookie']).find((c) => c.startsWith('admin_refresh='));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Path=\/admin\/v1\/auth(;|$)/);
    assert.match(cookie, /Max-Age=43200/);
    // DB: bí mật mã hóa (không có chuỗi base32 nguyên văn), mã dự phòng chỉ lưu băm, refresh chỉ lưu băm
    const d = await ctx.db();
    const [t] = await d.select().from(schema.staffTotp);
    assert.ok(t.confirmedAt);
    assert.ok(!Buffer.from(t.secretEnc).toString('latin1').includes(secret));
    assert.equal(t.backupHashes.length, 10);
    for (const code of body.backupCodes) assert.ok(!t.backupHashes.includes(code));
    const [s] = await d.select().from(schema.adminSessions);
    assert.ok(!cookie.includes(s.refreshHash));
    assert.match(s.refreshHash, /^[0-9a-f]{64}$/);
    // Nhật ký (cùng transaction): enroll + login (tác nhân user) + role.grant của CLI + auth.failed của lần nhập sai mã; không có bí mật
    await ctx.app.adminAlerts.flush();
    const rows = (await listAdminAudit(d)).map((r) => r.action).sort();
    assert.deepEqual(rows, ['auth.failed', 'auth.login', 'auth.totp_enrolled', 'role.grant']);
    assert.ok(!JSON.stringify(await listAdminAudit(d)).includes(secret));
  } finally {
    await ctx.close();
  }
});

test('đã xác nhận TOTP: login => next=totp; vé enroll cũ KHÔNG đăng ký lại được (403); totp khi next=enroll => 403', async () => {
  const ctx = await makeAdminApp();
  try {
    await makeStaff(ctx);
    await registerUser(ctx, 'nhan.vien2');
    await grant(ctx, 'nhan.vien2');
    // Người 2: vé next=enroll mà gọi /totp => 403
    const other = await login(ctx, 'nhan.vien2');
    assert.equal(other.json().next, 'enroll');
    const wrongStage = await post(ctx, '/admin/v1/auth/totp', { ticket: other.json().ticket, code: '123456' });
    assert.equal(wrongStage.statusCode, 403);

    // Người 1: giữ vé enroll, đăng ký xong ở "thiết bị khác", rồi dùng vé cũ để xin enroll lại
    const staleTicket = (await login(ctx, 'chu.app')).json().ticket;
    const first = await enrollFully(ctx, 'chu.app');
    const again = await post(ctx, '/admin/v1/auth/totp/enroll', { ticket: staleTicket, inviteCode: 'aaaaa-bbbbb-ccccc' });
    assert.equal(again.statusCode, 403);
    const afterConfirm = await login(ctx, 'chu.app');
    assert.equal(afterConfirm.json().next, 'totp');
    // Vé next=totp không dùng được cho enroll/confirm
    assert.equal((await post(ctx, '/admin/v1/auth/totp/enroll', { ticket: afterConfirm.json().ticket, inviteCode: 'aaaaa-bbbbb-ccccc' })).statusCode, 403);
    assert.equal((await post(ctx, '/admin/v1/auth/totp/confirm', { ticket: afterConfirm.json().ticket, code: codeFor(first.secret, ctx.state.now) })).statusCode, 403);
    // Bí mật đã xác nhận không bị ghi đè: mã cũ vẫn dùng được ở bước kế
    ctx.advance(31_000);
    const t = await post(ctx, '/admin/v1/auth/totp', { ticket: afterConfirm.json().ticket, code: codeFor(first.secret, ctx.state.now) });
    assert.equal(t.statusCode, 200);
  } finally {
    await ctx.close();
  }
});

test('mã đúng => access typ:admin + cookie; vào /admin/v1/session thấy vai trò; token sai loại bị 401 hai chiều', async () => {
  const ctx = await makeAdminApp();
  try {
    const staff = await makeStaff(ctx);
    const first = await enrollFully(ctx, 'chu.app');
    const me = await sessionInfo(ctx, first.accessToken);
    assert.equal(me.statusCode, 200);
    assert.deepEqual(me.json().roles, ['owner']);
    // payload JWT: typ admin
    const payload = JSON.parse(Buffer.from(first.accessToken.split('.')[1], 'base64url').toString());
    assert.equal(payload.typ, 'admin');
    assert.equal(payload.sub, staff.userId);
    assert.equal(payload.exp - payload.iat, 600);
    // Không bearer / rác
    assert.equal((await ctx.app.inject({ method: 'GET', url: '/admin/v1/session' })).statusCode, 401);
    assert.equal((await sessionInfo(ctx, 'khong.phai.jwt')).statusCode, 401);
    // Token APP (typ access, ký JWT_SECRET) gọi /admin/v1 => 401
    assert.equal((await sessionInfo(ctx, staff.appAccessToken)).statusCode, 401);
    // Token QUẢN TRỊ gọi /v1/me => 401
    const adminOnV1 = await ctx.app.inject({ method: 'GET', url: '/v1/quota', headers: bearer(first.accessToken) });
    assert.equal(adminOnV1.statusCode, 401);
    // ...kể cả thao tác nguy hiểm: DELETE /v1/me bằng token quản trị bị 401 và KHÔNG xóa tài khoản
    assert.equal((await ctx.app.inject({ method: 'DELETE', url: '/v1/me', headers: bearer(first.accessToken) })).statusCode, 401);
    assert.equal((await ctx.app.inject({ method: 'GET', url: '/v1/quota', headers: bearer(staff.appAccessToken) })).statusCode, 200);
    // Token ký bằng JWT_SECRET (khóa app) nhưng tự xưng typ:admin => 401 (tách khóa)
    const sid = JSON.parse(Buffer.from(first.accessToken.split('.')[1], 'base64url').toString()).sid;
    const forged = await new SignJWT({ typ: 'admin', sid })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(staff.userId)
      .setIssuer('becutit-admin')
      .setAudience('becutit-admin-api')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode(APP_JWT_SECRET));
    assert.equal((await sessionInfo(ctx, forged)).statusCode, 401);
    // Khóa quản trị đúng nhưng typ khác (vé đăng nhập dùng làm access) => 401
    const l = await login(ctx, 'chu.app');
    assert.equal((await sessionInfo(ctx, l.json().ticket)).statusCode, 401);
    // alg none bị từ chối
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ typ: 'admin', sub: staff.userId, sid })).toString('base64url')}.`;
    assert.equal((await sessionInfo(ctx, none)).statusCode, 401);
  } finally {
    await ctx.close();
  }
});

test('access hết hạn sau 10 phút (cần refresh)', async () => {
  const ctx = await makeAdminApp();
  try {
    await makeStaff(ctx);
    const first = await enrollFully(ctx, 'chu.app');
    ctx.advance(9 * MIN);
    assert.equal((await sessionInfo(ctx, first.accessToken)).statusCode, 200);
    ctx.advance(2 * MIN);
    assert.equal((await sessionInfo(ctx, first.accessToken)).statusCode, 401);
    const r = await refresh(ctx, first.cookie);
    assert.equal(r.statusCode, 200);
    assert.equal((await sessionInfo(ctx, r.json().accessToken)).statusCode, 200);
  } finally {
    await ctx.close();
  }
});

test('cùng một mã 6 số dùng lần 2 (trong 30 giây) => totp_invalid; sang bước kế thì dùng được', async () => {
  const ctx = await makeAdminApp();
  try {
    await makeStaff(ctx);
    const first = await enrollFully(ctx, 'chu.app'); // đã tiêu mã của bước hiện tại
    const l = await login(ctx, 'chu.app');
    const replay = await post(ctx, '/admin/v1/auth/totp', { ticket: l.json().ticket, code: codeFor(first.secret, ctx.state.now) });
    assert.equal(replay.statusCode, 401);
    assert.deepEqual(replay.json(), { error: 'totp_invalid' });
    // Đăng nhập thành công bằng mã bước kế, rồi chính mã đó lần 2 bị từ chối
    ctx.advance(31_000);
    const code = codeFor(first.secret, ctx.state.now);
    const l2 = await login(ctx, 'chu.app');
    assert.equal((await post(ctx, '/admin/v1/auth/totp', { ticket: l2.json().ticket, code })).statusCode, 200);
    const l3 = await login(ctx, 'chu.app');
    assert.equal((await post(ctx, '/admin/v1/auth/totp', { ticket: l3.json().ticket, code })).statusCode, 401);
    // Mã của bước CŨ hơn bước đã dùng cũng bị chặn (≤ last_used_step)
    const l4 = await login(ctx, 'chu.app');
    assert.equal((await post(ctx, '/admin/v1/auth/totp', { ticket: l4.json().ticket, code: codeFor(first.secret, ctx.state.now - 30_000) })).statusCode, 401);
  } finally {
    await ctx.close();
  }
});

test('hai request SONG SONG cùng một mã => đúng một thành công (nguyên tử)', async () => {
  const ctx = await makeAdminApp();
  try {
    await makeStaff(ctx);
    const first = await enrollFully(ctx, 'chu.app');
    ctx.advance(31_000);
    const tickets = [(await login(ctx, 'chu.app')).json().ticket, (await login(ctx, 'chu.app')).json().ticket];
    const code = codeFor(first.secret, ctx.state.now);
    const res = await Promise.all(tickets.map((ticket) => post(ctx, '/admin/v1/auth/totp', { ticket, code })));
    assert.deepEqual(res.map((r) => r.statusCode).sort(), [200, 401]);
  } finally {
    await ctx.close();
  }
});

test('mã dự phòng dùng được MỘT lần (gõ HOA vẫn nhận); lần 2 => totp_invalid; hai request song song chỉ một thắng', async () => {
  const ctx = await makeAdminApp();
  try {
    await makeStaff(ctx);
    const first = await enrollFully(ctx, 'chu.app');
    const [b1, b2] = first.backupCodes;
    const t1 = (await login(ctx, 'chu.app')).json().ticket;
    const ok = await post(ctx, '/admin/v1/auth/totp', { ticket: t1, backupCode: b1.toUpperCase() });
    assert.equal(ok.statusCode, 200);
    assert.ok(cookieOf(ok));
    const t2 = (await login(ctx, 'chu.app')).json().ticket;
    const again = await post(ctx, '/admin/v1/auth/totp', { ticket: t2, backupCode: b1 });
    assert.equal(again.statusCode, 401);
    assert.deepEqual(again.json(), { error: 'totp_invalid' });
    // song song
    const ta = (await login(ctx, 'chu.app')).json().ticket;
    const tb = (await login(ctx, 'chu.app')).json().ticket;
    const res = await Promise.all([ta, tb].map((ticket) => post(ctx, '/admin/v1/auth/totp', { ticket, backupCode: b2 })));
    assert.deepEqual(res.map((r) => r.statusCode).sort(), [200, 401]);
    const d = await ctx.db();
    const [t] = await d.select().from(schema.staffTotp);
    assert.equal(t.backupHashes.length, 8);
    // Phải đúng MỘT trong code hoặc backupCode
    const t3 = (await login(ctx, 'chu.app')).json().ticket;
    assert.equal((await post(ctx, '/admin/v1/auth/totp', { ticket: t3 })).statusCode, 400);
    assert.equal((await post(ctx, '/admin/v1/auth/totp', { ticket: t3, code: '123456', backupCode: 'abcde-fghij' })).statusCode, 400);
  } finally {
    await ctx.close();
  }
});

test('giới hạn: 5 lần sai mã 6 số => lần 6 rate_limited (kể cả mã đúng) + cảnh báo email đúng một lần', async () => {
  const mail = fakeMail(true);
  const ctx = await makeAdminApp({}, { mail });
  try {
    const staff = await makeStaff(ctx);
    const d = await ctx.db();
    await d.insert(schema.identities).values({ userId: staff.userId, provider: 'email', subject: 'chu@example.com', display: 'chu@example.com', emailVerified: true });
    const first = await enrollFully(ctx, 'chu.app');
    await ctx.app.adminAlerts.flush();
    mail.sent.length = 0;
    ctx.advance(31_000);
    const ticket = (await login(ctx, 'chu.app')).json().ticket;
    for (let i = 0; i < 5; i++) {
      const r = await post(ctx, '/admin/v1/auth/totp', { ticket, code: '000000' });
      assert.equal(r.statusCode, 401, `lần sai thứ ${i + 1}`);
    }
    const sixth = await post(ctx, '/admin/v1/auth/totp', { ticket, code: codeFor(first.secret, ctx.state.now) });
    assert.equal(sixth.statusCode, 429);
    assert.deepEqual(sixth.json(), { error: 'rate_limited' });
    assert.equal(sixth.headers['set-cookie'], undefined);
    // thêm lần nữa vẫn bị khóa nhưng KHÔNG gửi thêm thư cảnh báo
    assert.equal((await post(ctx, '/admin/v1/auth/totp', { ticket, code: '111111' })).statusCode, 429);
    await ctx.app.adminAlerts.flush();
    const alerts = mail.sent.filter((m) => /nhập sai mã/.test(m.subjectVi));
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].to, 'chu@example.com');
    assert.ok(!alerts[0].body.includes('chu.app'), 'thư không chứa tên đăng nhập');
    // Hết cửa sổ 15 phút thì đăng nhập lại được
    ctx.advance(16 * MIN);
    const ok = await loginWithTotp(ctx, 'chu.app', first.secret);
    assert.equal(ok.res.statusCode, 200);
  } finally {
    await ctx.close();
  }
});

test('giới hạn: 5 lần sai MẬT KHẨU (theo tên) => lần 6 rate_limited kể cả mật khẩu đúng; theo IP cũng vậy', async () => {
  const ctx = await makeAdminApp();
  try {
    await makeStaff(ctx);
    for (let i = 0; i < 5; i++) assert.equal((await login(ctx, 'chu.app', 'sai-mat-khau-1')).statusCode, 401);
    const sixth = await login(ctx, 'chu.app', PW);
    assert.equal(sixth.statusCode, 429);
    assert.deepEqual(sixth.json(), { error: 'rate_limited' });
    // Cùng IP đó, tên KHÁC cũng bị chặn (trần theo IP)
    assert.equal((await login(ctx, 'nguoi.khac', PW)).statusCode, 429);
    // IP khác + tên bị khóa => vẫn khóa (theo tên)
    assert.equal((await login(ctx, 'chu.app', PW, { remoteAddress: '10.9.9.9' })).statusCode, 429);
    // Tên khác từ IP khác thì không sao
    assert.equal((await login(ctx, 'nguoi.khac', PW, { remoteAddress: '10.9.9.9' })).statusCode, 401);
    // Hết cửa sổ => dùng lại được
    ctx.advance(16 * MIN);
    assert.equal((await login(ctx, 'chu.app', PW)).statusCode, 200);
  } finally {
    await ctx.close();
  }
});

test('mật khẩu đúng không tốn lượt IP: nhiều lần đăng nhập đúng liên tiếp không bị khóa', async () => {
  const ctx = await makeAdminApp();
  try {
    await makeStaff(ctx);
    for (let i = 0; i < 8; i++) assert.equal((await login(ctx, 'chu.app', PW)).statusCode, 200);
  } finally {
    await ctx.close();
  }
});

test('hạn phiên: rảnh 31 phút => session_expired; làm mới đều thì sống tới đúng 12 giờ rồi hết dù vẫn dùng', async () => {
  const ctx = await makeAdminApp();
  try {
    await makeStaff(ctx);
    const first = await enrollFully(ctx, 'chu.app');
    // Rảnh 29 phút: còn sống, và làm mới kéo dài hạn rảnh
    ctx.advance(29 * MIN);
    const r1 = await refresh(ctx, first.cookie);
    assert.equal(r1.statusCode, 200);
    ctx.advance(29 * MIN);
    const r2 = await refresh(ctx, cookieOf(r1)); // refresh xoay vòng: dùng cookie mới nhất
    assert.equal(r2.statusCode, 200);
    // Rảnh 31 phút => hết
    ctx.advance(31 * MIN);
    const dead = await refresh(ctx, cookieOf(r2));
    assert.equal(dead.statusCode, 401);
    assert.deepEqual(dead.json(), { error: 'session_expired' });
    assert.match([].concat(dead.headers['set-cookie']).join(';'), /Max-Age=0/);

    // Phiên mới: làm mới mỗi 25 phút; tại 12h + 1 phút phải hết dù vẫn đang dùng
    const s2 = await loginWithTotp(ctx, 'chu.app', first.secret);
    const t0 = ctx.state.now;
    let cookie = s2.cookie;
    const step = async () => {
      const r = await refresh(ctx, cookie);
      cookie = cookieOf(r) ?? cookie; // refresh xoay vòng: dùng cookie mới nhất
      return r.statusCode;
    };
    while (ctx.state.now - t0 < 12 * HOUR - 30 * MIN) {
      ctx.advance(25 * MIN);
      assert.equal(await step(), 200, `còn trong 12 giờ (${Math.round((ctx.state.now - t0) / MIN)} phút)`);
    }
    ctx.state.now = t0 + 12 * HOUR - MIN;
    assert.equal(await step(), 200, 'còn 1 phút nữa');
    ctx.state.now = t0 + 12 * HOUR + MIN;
    const over = await refresh(ctx, cookie);
    assert.equal(over.statusCode, 401);
    assert.deepEqual(over.json(), { error: 'session_expired' });
  } finally {
    await ctx.close();
  }
});

test('access token của phiên đã quá 12 giờ / bị thu hồi / rảnh quá lâu không dùng được nữa (hook kiểm phiên mỗi request)', async () => {
  const ctx = await makeAdminApp();
  try {
    await makeStaff(ctx);
    const first = await enrollFully(ctx, 'chu.app');
    const d = await ctx.db();
    // Ép phiên về trạng thái hết hạn trong DB: access còn hạn JWT nhưng phiên đã chết
    await d.update(schema.adminSessions).set({ expiresAt: new Date(ctx.state.now - 1000) });
    const r = await sessionInfo(ctx, first.accessToken);
    assert.equal(r.statusCode, 401);
    assert.deepEqual(r.json(), { error: 'session_expired' });
  } finally {
    await ctx.close();
  }
});

test('logout: refresh cũ hết hiệu lực, access cũ cũng chết ngay, cookie bị xóa; logout lặp lại vẫn 204', async () => {
  const ctx = await makeAdminApp();
  try {
    await makeStaff(ctx);
    const first = await enrollFully(ctx, 'chu.app');
    assert.equal((await sessionInfo(ctx, first.accessToken)).statusCode, 200);
    const out = await ctx.app.inject({ method: 'POST', url: '/admin/v1/auth/logout', headers: { cookie: first.cookie } });
    assert.equal(out.statusCode, 204);
    assert.match([].concat(out.headers['set-cookie']).join(';'), /admin_refresh=;.*Max-Age=0/);
    const after = await refresh(ctx, first.cookie);
    assert.equal(after.statusCode, 401);
    assert.deepEqual(after.json(), { error: 'session_expired' });
    const dead = await sessionInfo(ctx, first.accessToken);
    assert.equal(dead.statusCode, 401);
    assert.deepEqual(dead.json(), { error: 'session_expired' });
    assert.equal((await ctx.app.inject({ method: 'POST', url: '/admin/v1/auth/logout', headers: { cookie: first.cookie } })).statusCode, 204);
    assert.equal((await ctx.app.inject({ method: 'POST', url: '/admin/v1/auth/logout' })).statusCode, 204);
  } finally {
    await ctx.close();
  }
});

test('refresh: không cookie / cookie rác => 401; Origin lạ => 403 (bổ sung SameSite); Origin ADMIN_ORIGIN hợp lệ', async () => {
  const ctx = await makeAdminApp();
  try {
    await makeStaff(ctx);
    const first = await enrollFully(ctx, 'chu.app');
    assert.equal((await ctx.app.inject({ method: 'POST', url: '/admin/v1/auth/refresh' })).statusCode, 401);
    assert.equal((await refresh(ctx, 'admin_refresh=rac')).statusCode, 401);
    assert.equal((await refresh(ctx, first.cookie, { origin: 'https://evil.example' })).statusCode, 403);
    assert.equal((await refresh(ctx, first.cookie, { origin: APP_ORIGIN })).statusCode, 403);
    assert.equal((await refresh(ctx, first.cookie, { origin: ADMIN_ORIGIN })).statusCode, 200);
    // cookie hợp lệ gửi tới /v1 vô nghĩa: refresh chỉ có ở /admin/v1/auth
    assert.equal((await ctx.app.inject({ method: 'POST', url: '/v1/auth/refresh', headers: { cookie: first.cookie }, payload: {} })).statusCode >= 400, true);
    // Token refresh (đọc từ cookie) KHÔNG dùng làm Bearer
    const raw = first.cookie.split('=')[1];
    assert.equal((await sessionInfo(ctx, raw)).statusCode, 401);
    assert.equal((await ctx.app.inject({ method: 'GET', url: '/v1/quota', headers: bearer(raw) })).statusCode, 401);
  } finally {
    await ctx.close();
  }
});

test('vé hết hạn sau 5 phút => ticket_invalid; vé rác => ticket_invalid; thu vai trò giữa chừng => ticket_invalid', async () => {
  const ctx = await makeAdminApp();
  try {
    const staff = await makeStaff(ctx);
    const l = await login(ctx, 'chu.app');
    ctx.advance(5 * MIN + 1000);
    const late = await post(ctx, '/admin/v1/auth/totp/enroll', { ticket: l.json().ticket, inviteCode: 'aaaaa-bbbbb-ccccc' });
    assert.equal(late.statusCode, 401);
    assert.deepEqual(late.json(), { error: 'ticket_invalid' });
    assert.equal((await post(ctx, '/admin/v1/auth/totp/enroll', { ticket: 'x'.repeat(40), inviteCode: 'aaaaa-bbbbb-ccccc' })).statusCode, 401);
    const l2 = await login(ctx, 'chu.app');
    const d = await ctx.db();
    await d.delete(schema.staffRoles).where(eq(schema.staffRoles.userId, staff.userId));
    assert.equal((await post(ctx, '/admin/v1/auth/totp/enroll', { ticket: l2.json().ticket, inviteCode: 'aaaaa-bbbbb-ccccc' })).statusCode, 401);
    // Đăng nhập lại khi đã mất vai trò: giống hệt sai mật khẩu
    assert.deepEqual((await login(ctx, 'chu.app')).json(), INVALID);
  } finally {
    await ctx.close();
  }
});

test('tài khoản đang chờ xóa không đăng nhập quản trị được (cùng invalid_credentials)', async () => {
  const ctx = await makeAdminApp();
  try {
    const staff = await makeStaff(ctx);
    const d = await ctx.db();
    await d.update(schema.users).set({ deleteAt: new Date(ctx.state.now + 86_400_000) }).where(eq(schema.users.id, staff.userId));
    const r = await login(ctx, 'chu.app');
    assert.equal(r.statusCode, 401);
    assert.deepEqual(r.json(), INVALID);
  } finally {
    await ctx.close();
  }
});

test('nhật ký: sai mật khẩu của nhân sự ghi auth.failed (không chứa bí mật); người ngoài sai thì KHÔNG ghi', async () => {
  const ctx = await makeAdminApp();
  try {
    await makeStaff(ctx);
    await login(ctx, 'khong.ton.tai', 'sai-mat-khau-1');
    await login(ctx, 'chu.app', 'sai-mat-khau-1');
    await ctx.app.adminAlerts.flush();
    const rows = await listAdminAudit(await ctx.db());
    const failed = rows.filter((r) => r.action === 'auth.failed');
    assert.equal(failed.length, 1);
    assert.equal(failed[0].actorKind, 'user');
    assert.ok(failed[0].ipHash && /^[0-9a-f]{32}$/.test(failed[0].ipHash));
    assert.ok(!JSON.stringify(failed).includes('sai-mat-khau-1'));
    assert.ok(!JSON.stringify(failed).includes('chu.app'));
  } finally {
    await ctx.close();
  }
});

test('MAIL_PROVIDER=none (nhà cung cấp không sẵn sàng): đăng nhập vẫn thành công, KHÔNG gửi cảnh báo', async () => {
  const mail = fakeMail(false);
  const ctx = await makeAdminApp({ MAIL_PROVIDER: 'none' }, { mail });
  try {
    const staff = await makeStaff(ctx);
    const d = await ctx.db();
    await d.insert(schema.identities).values({ userId: staff.userId, provider: 'email', subject: 'chu@example.com', display: 'chu@example.com', emailVerified: true });
    const first = await enrollFully(ctx, 'chu.app');
    const again = await loginWithTotp(ctx, 'chu.app', first.secret);
    assert.equal(again.res.statusCode, 200);
    await ctx.app.adminAlerts.flush();
    assert.equal(mail.sent.length, 0);
  } finally {
    await ctx.close();
  }
});

test('cảnh báo email khi đăng nhập thành công (có email đã xác minh); lỗi gửi thư không làm hỏng đăng nhập', async () => {
  const mail = fakeMail(true);
  const ctx = await makeAdminApp({}, { mail });
  try {
    const staff = await makeStaff(ctx);
    const d = await ctx.db();
    await d.insert(schema.identities).values({ userId: staff.userId, provider: 'email', subject: 'chu@example.com', display: 'chu@example.com', emailVerified: true });
    const first = await enrollFully(ctx, 'chu.app');
    await ctx.app.adminAlerts.flush();
    assert.equal(mail.sent.length, 1);
    assert.match(mail.sent[0].subjectVi, /đăng nhập/);
    assert.ok(!mail.sent[0].body.includes(first.secret));
    mail.send = async () => {
      throw new Error('smtp down');
    };
    const again = await loginWithTotp(ctx, 'chu.app', first.secret);
    assert.equal(again.res.statusCode, 200);
    await ctx.app.adminAlerts.flush();
  } finally {
    await ctx.close();
  }
});

test('CORS: /v1 LOẠI ADMIN_ORIGIN (dù có trong CORS_ORIGIN), vẫn nhận origin app; /admin/v1 chỉ nhận ADMIN_ORIGIN + credentials', async () => {
  const ctx = await makeAdminApp();
  try {
    const pre = (url, origin) =>
      ctx.app.inject({ method: 'OPTIONS', url, headers: { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' } });
    const v1Admin = await pre('/v1/me', ADMIN_ORIGIN);
    assert.equal(v1Admin.headers['access-control-allow-origin'], undefined);
    const v1App = await pre('/v1/me', APP_ORIGIN);
    assert.equal(v1App.headers['access-control-allow-origin'], APP_ORIGIN);
    assert.equal(v1App.headers['access-control-allow-credentials'], undefined);
    // Cả các scope /v1/auth và /v1/app cũng không nhận ADMIN_ORIGIN
    assert.equal((await pre('/v1/auth/login', ADMIN_ORIGIN)).headers['access-control-allow-origin'], undefined);
    assert.equal((await pre('/v1/app/version', ADMIN_ORIGIN)).headers['access-control-allow-origin'], undefined);
    // Phản hồi thật (không phải preflight) cũng không có header CORS cho ADMIN_ORIGIN
    const real = await ctx.app.inject({ method: 'GET', url: '/healthz', headers: { origin: ADMIN_ORIGIN } });
    assert.equal(real.headers['access-control-allow-origin'], undefined);

    const adm = await pre('/admin/v1/auth/login', ADMIN_ORIGIN);
    assert.equal(adm.headers['access-control-allow-origin'], ADMIN_ORIGIN);
    assert.equal(adm.headers['access-control-allow-credentials'], 'true');
    assert.equal((await pre('/admin/v1/auth/login', APP_ORIGIN)).headers['access-control-allow-origin'], undefined);
    assert.equal((await pre('/admin/v1/session', 'https://evil.example')).headers['access-control-allow-origin'], undefined);
    const realAdmin = await login(ctx, 'ai.do', PW, { headers: { origin: ADMIN_ORIGIN } });
    assert.equal(realAdmin.headers['access-control-allow-origin'], ADMIN_ORIGIN);
    assert.equal(realAdmin.headers['access-control-allow-credentials'], 'true');
  } finally {
    await ctx.close();
  }
});

test('ADMIN_API_ENABLED=false => /admin/v1/* 404 (không có route nào)', async () => {
  const ctx = await makeAdminApp({ ADMIN_API_ENABLED: 'false' });
  try {
    assert.equal((await login(ctx, 'chu.app')).statusCode, 404);
    assert.equal((await ctx.app.inject({ method: 'GET', url: '/admin/v1/session' })).statusCode, 404);
    assert.equal(ctx.app.adminAlerts, undefined);
    // /v1 vẫn chạy bình thường
    assert.equal((await ctx.app.inject({ method: 'GET', url: '/healthz' })).statusCode, 200);
  } finally {
    await ctx.close();
  }
});

test('mặc định ADMIN_API_ENABLED: TẮT ở production, BẬT ở dev/test', () => {
  const prodBase = { NODE_ENV: 'production', JWT_SECRET: APP_JWT_SECRET, AUDIT_IP_SALT: 's'.repeat(40), AUTH_OTP_PEPPER: 'p'.repeat(40), DATABASE_URL: 'postgres://u:p@localhost/db' };
  assert.equal(loadConfig(prodBase).ADMIN_API_ENABLED, false);
  assert.equal(loadConfig({ ...prodBase, ADMIN_API_ENABLED: 'true' }).ADMIN_API_ENABLED, true);
  assert.equal(loadConfig({ NODE_ENV: 'test' }).ADMIN_API_ENABLED, true);
  assert.equal(loadConfig({ NODE_ENV: 'test' }).ADMIN_ORIGIN, 'http://localhost:5180');
});

test('thiếu ADMIN_MFA_KEY (hoặc ADMIN_JWT_SECRET) => mọi /admin/v1 trả 503 admin_disabled; không sinh khóa ngẫu nhiên', async () => {
  for (const env of [{ ADMIN_MFA_KEY: '' }, { ADMIN_JWT_SECRET: '' }]) {
    const ctx = await makeAdminApp(env);
    try {
      for (const [method, url] of [
        ['POST', '/admin/v1/auth/login'],
        ['POST', '/admin/v1/auth/refresh'],
        ['GET', '/admin/v1/session'],
        ['GET', '/admin/v1/queue']
      ]) {
        const r = await ctx.app.inject({ method, url, payload: method === 'POST' ? { username: 'a', password: 'b' } : undefined });
        assert.equal(r.statusCode, 503, `${method} ${url}`);
        assert.deepEqual(r.json(), { error: 'admin_disabled' });
      }
    } finally {
      await ctx.close();
    }
  }
});

test('config: ADMIN_MFA_KEY sai độ dài/dạng, ADMIN_JWT_SECRET trùng JWT_SECRET, ADMIN_ORIGIN có đường dẫn => lỗi khởi động (không in giá trị khóa)', () => {
  const bad = 'khong-hop-le-khong-hop-le-khong-hop-le-khong-hop-le';
  assert.throws(() => loadConfig({ NODE_ENV: 'test', ADMIN_MFA_KEY: bad }), (e) => /ADMIN_MFA_KEY/.test(e.message) && !e.message.includes(bad));
  assert.throws(() => loadConfig({ NODE_ENV: 'test', ADMIN_MFA_KEY: 'ab'.repeat(16) }), /ADMIN_MFA_KEY/);
  assert.doesNotThrow(() => loadConfig({ NODE_ENV: 'test', ADMIN_MFA_KEY: MFA_KEY }));
  assert.doesNotThrow(() => loadConfig({ NODE_ENV: 'test', ADMIN_MFA_KEY: Buffer.alloc(32, 7).toString('base64') }));
  assert.throws(() => loadConfig({ NODE_ENV: 'test', JWT_SECRET: APP_JWT_SECRET, ADMIN_JWT_SECRET: APP_JWT_SECRET }), /ADMIN_JWT_SECRET/);
  assert.throws(() => loadConfig({ NODE_ENV: 'test', ADMIN_ORIGIN: 'http://localhost:5180/admin' }), /ADMIN_ORIGIN/);
  assert.equal(loadConfig({ NODE_ENV: 'test', ADMIN_ORIGIN: 'https://admin.example.id.vn/' }).ADMIN_ORIGIN, 'https://admin.example.id.vn');
});

test('withAdminAudit: ghi nhật ký trong CÙNG transaction — fn ném lỗi => 0 dòng nhật ký VÀ thay đổi của fn bị hoàn tác; ghi nhật ký lỗi => fn cũng hoàn tác', async () => {
  const ctx = await makeAdminApp();
  try {
    const staff = await makeStaff(ctx);
    const d = await ctx.db();
    const entry = { actorUserId: staff.userId, actorKind: 'user', action: 'feedback.status', targetType: 'feedback', targetId: 'x', meta: { a: 1 } };
    const count = async () => Number((await d.execute(sql`select count(*) as n from admin_audit_log`)).rows?.[0]?.n ?? 0);
    const before = await count();

    await assert.rejects(
      withAdminAudit(d, entry, async (tx) => {
        await tx.insert(schema.staffRoles).values({ userId: staff.userId, role: 'editor' });
        throw new Error('hỏng giữa chừng');
      }),
      /hỏng giữa chừng/
    );
    assert.equal(await count(), before, 'không có dòng nhật ký');
    assert.equal((await d.select().from(schema.staffRoles).where(eq(schema.staffRoles.role, 'editor'))).length, 0, 'thay đổi bị hoàn tác');

    const out = await withAdminAudit(d, entry, async (tx) => {
      await tx.insert(schema.staffRoles).values({ userId: staff.userId, role: 'editor' });
      return 42;
    });
    assert.equal(out, 42);
    assert.equal(await count(), before + 1);
    const last = (await listAdminAudit(d, 1))[0];
    assert.equal(last.action, 'feedback.status');
    assert.deepEqual(last.meta, { a: 1 });

    // Nhật ký lỗi (vi phạm ràng buộc) => thao tác của fn cũng không giữ lại
    await d.delete(schema.staffRoles).where(eq(schema.staffRoles.role, 'editor'));
    await assert.rejects(
      withAdminAudit(d, { ...entry, targetType: null }, async (tx) => {
        await tx.insert(schema.staffRoles).values({ userId: staff.userId, role: 'support' });
      })
    );
    assert.equal((await d.select().from(schema.staffRoles).where(eq(schema.staffRoles.role, 'support'))).length, 0);
    // Nhật ký chỉ thêm: ép ở DB
    await assert.rejects(d.execute(sql`update admin_audit_log set action = 'x'`));
    await assert.rejects(d.execute(sql`delete from admin_audit_log`));
  } finally {
    await ctx.close();
  }
});

test('AdminCrypto: khứ hồi, sai người (AAD), dữ liệu bị sửa, sai khóa => null; IV khác nhau mỗi lần', () => {
  const c = new AdminCrypto(MFA_KEY);
  const u1 = '11111111-1111-1111-1111-111111111111';
  const u2 = '22222222-2222-2222-2222-222222222222';
  const blob = c.encryptSecret('JBSWY3DPEHPK3PXP', u1);
  assert.equal(c.decryptSecret(blob, u1), 'JBSWY3DPEHPK3PXP');
  assert.equal(c.decryptSecret(blob, u2), null);
  const tampered = Buffer.from(blob);
  tampered[tampered.length - 1] ^= 1;
  assert.equal(c.decryptSecret(tampered, u1), null);
  assert.equal(new AdminCrypto('ff'.repeat(32)).decryptSecret(blob, u1), null);
  assert.notDeepEqual(c.encryptSecret('JBSWY3DPEHPK3PXP', u1), blob);
  assert.equal(c.decryptSecret(Buffer.alloc(5), u1), null);
  assert.notEqual(c.hashBackupCode('abcde-fghij'), new AdminCrypto('ff'.repeat(32)).hashBackupCode('abcde-fghij'));
  assert.equal(c.hashBackupCode(' ABCDE-fghij '), c.hashBackupCode('abcde-fghij'));
});

test('dọn hằng ngày (đồng hồ giả): phiên hết hạn > 30 ngày bị xóa, nhật ký > 2 năm bị xóa, phần còn lại giữ; trigger chỉ-thêm vẫn bật', async () => {
  const ctx = await makeAdminApp();
  try {
    const staff = await makeStaff(ctx);
    const d = await ctx.db();
    const DAY = 86_400_000;
    const now = ctx.state.now;
    const mk = (hash, expiresAgoDays) => ({ userId: staff.userId, refreshHash: hash, mfaAt: new Date(now), lastSeenAt: new Date(now), expiresAt: new Date(now - expiresAgoDays * DAY) });
    await d.insert(schema.adminSessions).values([mk('a'.repeat(64), 31), mk('b'.repeat(64), 29), mk('c'.repeat(64), -1)]);
    const ins = (daysAgo, action) =>
      d.insert(schema.adminAuditLog).values({ actorKind: 'cli', action, targetType: 'user', createdAt: new Date(now - daysAgo * DAY) });
    await ins(731, 'role.grant');
    await ins(729, 'role.revoke');
    await ins(1, 'totp.reset');

    const res = await purgeAdminData(d, new Date(now));
    assert.equal(res.sessions, 1);
    assert.equal(res.auditRows, 1);
    const left = (await d.select({ h: schema.adminSessions.refreshHash }).from(schema.adminSessions)).map((r) => r.h[0]).sort();
    assert.deepEqual(left, ['b', 'c']);
    assert.deepEqual((await listAdminAudit(d, 10)).map((r) => r.action).sort(), ['role.grant', 'role.revoke', 'totp.reset']); // role.grant còn lại là lần cấp quyền của makeStaff (mới)
    await assert.rejects(d.execute(sql`delete from admin_audit_log`), 'trigger vẫn bật sau khi dọn');
    // Chạy lại: không còn gì để dọn
    assert.deepEqual(await purgeAdminData(d, new Date(now)), { sessions: 0, auditRows: 0 });
  } finally {
    await ctx.close();
  }
});
