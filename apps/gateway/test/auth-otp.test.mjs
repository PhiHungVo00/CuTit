import test from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { createDbProvider, schema } from '../dist/db/client.js';
import { loadConfig } from '../dist/config.js';
import { quotaDay } from '../dist/pipeline/QuotaStore.js';
import { makeApp } from './helpers.mjs';

/** Xem auth-password.test.mjs: TEST_DATABASE_URL => chạy thêm trên Postgres thật, tên/email có hậu tố ngẫu nhiên */
const PG = process.env.TEST_DATABASE_URL;
const RUN = PG ? Math.random().toString(36).slice(2, 6) : '';
const U = (n) => n + RUN;
const E = (local) => `${local}${RUN}@example.com`;
const PW = 'ca-phe-sua-da-42';
const ENV = { AUTH_RATE_LIMIT_PER_MINUTE: '1000', RATE_LIMIT_PER_MINUTE: '1000', AUTH_LOGIN_SLOWDOWN_MS: '0' };

/** Nhà cung cấp mail giả: ghi lại thư thay vì gửi */
function fakeMail({ available = true } = {}) {
  const sent = [];
  return {
    name: 'fake',
    sent,
    available: () => available,
    async send(to, subjectVi, subjectEn, body) {
      sent.push({ to, subjectVi, subjectEn, body });
    },
    /** mã 6 số trong thư gần nhất gửi tới `to` (chờ tối đa 2 s vì quên mật khẩu gửi nền) */
    async codeFor(to) {
      for (let i = 0; i < 100; i++) {
        const m = [...sent].reverse().find((x) => x.to === to);
        if (m) return m.body.match(/\b(\d{6})\b/)[1];
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error('không thấy thư gửi ' + to);
    }
  };
}

/** Thư đã gửi hôm nay trong DB (Postgres dùng chung giữa các lần chạy => trần MAIL_DAILY_CAP tính thêm phần này) */
async function mailSentToday(dbp) {
  const d = await dbp.get();
  const rows = await d.select().from(schema.aiGlobalUsage).where(and(eq(schema.aiGlobalUsage.capability, 'mail'), eq(schema.aiGlobalUsage.usageDay, quotaDay(new Date()))));
  return rows[0]?.units ?? 0;
}

async function makeAuthApp(env = {}, opts = {}) {
  const dbp = createDbProvider(PG ? { DATABASE_URL: PG, PGLITE_DIR: 'memory://' } : { PGLITE_DIR: 'memory://' });
  let now = Date.now();
  const cap = env.MAIL_DAILY_CAP && PG ? { MAIL_DAILY_CAP: String(Number(env.MAIL_DAILY_CAP) + (await mailSentToday(dbp))) } : {};
  const app = await makeApp({ ...ENV, ...env, ...cap }, { db: dbp, clock: () => new Date(now), ...opts });
  if (PG) {
    // bộ đếm theo IP là toàn cục => mỗi app một IP riêng
    const ip = `10.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
    const inject = app.inject.bind(app);
    app.inject = (o) => inject({ remoteAddress: ip, ...o });
  }
  app.dbForTest = () => dbp.get();
  app.advance = (ms) => {
    now += ms;
  };
  const close = app.close.bind(app);
  app.close = async () => {
    await close();
    await dbp.close();
  };
  return app;
}

const post = (app, url, payload, extra = {}) => app.inject({ method: 'POST', url, payload, ...extra });
const bearer = (b) => ({ headers: { authorization: `Bearer ${b.accessToken}` } });

async function account(app, name) {
  const r = await post(app, '/v1/auth/register', { username: U(name), password: PW });
  assert.equal(r.statusCode, 200, r.body);
  return r.json();
}

async function attachEmail(app, mail, acc, email) {
  assert.equal((await post(app, '/v1/me/email/start', { email }, bearer(acc))).statusCode, 202);
  const code = await mail.codeFor(email);
  const r = await post(app, '/v1/me/email/verify', { email, code }, bearer(acc));
  assert.equal(r.statusCode, 200, r.body);
  return r.json();
}

test('Cấu hình: MAIL_PROVIDER mặc định none; gmail-smtp thiếu thông tin đăng nhập => lỗi; production bắt buộc AUTH_OTP_PEPPER', () => {
  const dev = loadConfig({ NODE_ENV: 'development' });
  assert.equal(dev.MAIL_PROVIDER, 'none');
  assert.equal(dev.MAIL_DAILY_CAP, 450);
  assert.equal(dev.GUEST_QUOTA_FACTOR, 0.5);
  assert.ok(dev.AUTH_OTP_PEPPER.length >= 32);
  assert.throws(() => loadConfig({ NODE_ENV: 'development', MAIL_PROVIDER: 'gmail-smtp' }), /MAIL_SMTP_USER/);
  assert.doesNotThrow(() =>
    loadConfig({ NODE_ENV: 'development', MAIL_PROVIDER: 'gmail-smtp', MAIL_SMTP_USER: 'app@gmail.com', MAIL_SMTP_PASS: 'abcd efgh ijkl mnop' })
  );
  const prodBase = { NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32), AUDIT_IP_SALT: 'y'.repeat(32) };
  assert.throws(() => loadConfig(prodBase), /AUTH_OTP_PEPPER/);
  assert.doesNotThrow(() => loadConfig({ ...prodBase, AUTH_OTP_PEPPER: 'z'.repeat(32) }));
});

test('MAIL_PROVIDER=none: quên mật khẩu vẫn 202 (không treo, không lộ); gắn email => provider_unavailable', async () => {
  const a = await makeAuthApp();
  try {
    const acc = await account(a, 'khong.mail');
    for (const usernameOrEmail of [U('khong.mail'), 'ai.do@example.com', U('khong.co.ai')]) {
      const r = await post(a, '/v1/auth/password/forgot', { usernameOrEmail });
      assert.equal(r.statusCode, 202);
    }
    const s = await post(a, '/v1/me/email/start', { email: E('x') }, bearer(acc));
    assert.equal(s.statusCode, 503);
    assert.equal(s.json().error, 'provider_unavailable');
  } finally {
    await a.close();
  }
});

test('Gắn email: mã 6 số qua thư song ngữ; sai mã => otp_invalid; đúng => danh tính email (che) được gắn', async () => {
  const mail = fakeMail();
  const a = await makeAuthApp({}, { mail });
  try {
    const acc = await account(a, 'gan.mail');
    const email = E('Gan.Mail');
    const norm = email.toLowerCase();
    assert.equal((await post(a, '/v1/me/email/start', { email }, bearer(acc))).statusCode, 202);
    const m = mail.sent.at(-1);
    assert.equal(m.to, norm);
    assert.ok(m.subjectVi && m.subjectEn);
    assert.match(m.body, /\b\d{6}\b/);
    assert.match(m.body, /10/);
    assert.ok(!/https?:\/\//.test(m.body), 'thư không chứa link');
    const code = m.body.match(/\b(\d{6})\b/)[1];
    const wrong = await post(a, '/v1/me/email/verify', { email, code: code === '000000' ? '111111' : '000000' }, bearer(acc));
    assert.equal(wrong.statusCode, 400);
    assert.equal(wrong.json().error, 'otp_invalid');
    const ok = await post(a, '/v1/me/email/verify', { email, code }, bearer(acc));
    assert.equal(ok.statusCode, 200, ok.body);
    const emailIdent = ok.json().identities.find((i) => i.provider === 'email');
    assert.ok(emailIdent);
    assert.ok(!emailIdent.display.includes(norm.split('@')[0]), 'email phải được che');
    assert.match(emailIdent.display, /@example\.com$/);
    // mã đã dùng => không dùng lại được
    assert.equal((await post(a, '/v1/me/email/verify', { email, code }, bearer(acc))).statusCode, 400);
    // DB không lưu email nguyên văn ở auth_challenges, không lưu mã nguyên văn
    const d = await a.dbForTest();
    const rows = await d.select().from(schema.authChallenges).where(eq(schema.authChallenges.kind, 'email_otp'));
    for (const r of rows) {
      assert.ok(!String(r.subject).includes('@'));
      assert.notEqual(r.keyHash, code);
    }
  } finally {
    await a.close();
  }
});

test('OTP: sai 5 lần => otp_locked (kể cả mã đúng sau đó); quá 10 phút => otp_expired', async () => {
  const mail = fakeMail();
  const a = await makeAuthApp({}, { mail });
  try {
    const acc = await account(a, 'khoa.otp');
    const email = E('khoa.otp');
    await post(a, '/v1/me/email/start', { email }, bearer(acc));
    const code = await mail.codeFor(email);
    const bad = code === '999999' ? '888888' : '999999';
    const errs = [];
    for (let i = 0; i < 5; i++) errs.push((await post(a, '/v1/me/email/verify', { email, code: bad }, bearer(acc))).json().error);
    assert.deepEqual(errs, ['otp_invalid', 'otp_invalid', 'otp_invalid', 'otp_invalid', 'otp_locked']);
    assert.equal((await post(a, '/v1/me/email/verify', { email, code }, bearer(acc))).json().error, 'otp_locked');

    a.advance(16 * 60_000); // qua cửa sổ giới hạn gửi
    await post(a, '/v1/me/email/start', { email }, bearer(acc));
    const code2 = await mail.codeFor(email);
    a.advance(10 * 60_000 + 1000);
    const exp = await post(a, '/v1/me/email/verify', { email, code: code2 }, bearer(acc));
    assert.equal(exp.statusCode, 400);
    assert.equal(exp.json().error, 'otp_expired');
  } finally {
    await a.close();
  }
});

test('OTP: cấp mã mới hủy mã cũ cùng email => 5 lần thử không nhân lên theo số mã', async () => {
  const mail = fakeMail();
  const a = await makeAuthApp({}, { mail });
  try {
    const acc = await account(a, 'ma.cu');
    const email = E('ma.cu');
    await post(a, '/v1/me/email/start', { email }, bearer(acc));
    const first = await mail.codeFor(email);
    mail.sent.length = 0;
    await post(a, '/v1/me/email/start', { email }, bearer(acc));
    const second = await mail.codeFor(email);
    const d = await a.dbForTest();
    const live = await d
      .select()
      .from(schema.authChallenges)
      .where(and(eq(schema.authChallenges.kind, 'email_otp'), eq(schema.authChallenges.userId, acc.userId)));
    assert.equal(live.length, 1);
    if (first !== second) assert.equal((await post(a, '/v1/me/email/verify', { email, code: first }, bearer(acc))).json().error, 'otp_invalid');
    assert.equal((await post(a, '/v1/me/email/verify', { email, code: second }, bearer(acc))).statusCode, 200);
  } finally {
    await a.close();
  }
});

test('Giới hạn gửi: 3 thư/15 phút mỗi email => lần 4 rate_limited; trần thư/ngày => provider_unavailable', async () => {
  const mail = fakeMail();
  const a = await makeAuthApp({ MAIL_DAILY_CAP: '4' }, { mail });
  try {
    const acc = await account(a, 'gioi.han');
    const email = E('gioi.han');
    for (let i = 0; i < 3; i++) assert.equal((await post(a, '/v1/me/email/start', { email }, bearer(acc))).statusCode, 202);
    const fourth = await post(a, '/v1/me/email/start', { email }, bearer(acc));
    assert.equal(fourth.statusCode, 429);
    assert.equal(fourth.json().error, 'rate_limited');
    // thư thứ 4 trong ngày (email khác) vẫn được; thứ 5 => chạm trần MAIL_DAILY_CAP=4
    assert.equal((await post(a, '/v1/me/email/start', { email: E('khac1') }, bearer(acc))).statusCode, 202);
    const capped = await post(a, '/v1/me/email/start', { email: E('khac2') }, bearer(acc));
    assert.equal(capped.statusCode, 503);
    assert.equal(capped.json().error, 'provider_unavailable');
    assert.equal(mail.sent.length, 4);
  } finally {
    await a.close();
  }
});

test('Email đã gắn tài khoản khác: start vẫn 202 (không lộ); chỉ sau khi nhập ĐÚNG mã mới báo identity_in_use', async () => {
  const mail = fakeMail();
  const a = await makeAuthApp({}, { mail });
  try {
    const owner = await account(a, 'chu.mail');
    const email = E('chung');
    await attachEmail(a, mail, owner, email);
    const other = await account(a, 'nguoi.khac');
    mail.sent.length = 0;
    assert.equal((await post(a, '/v1/me/email/start', { email }, bearer(other))).statusCode, 202);
    const code = await mail.codeFor(email);
    const r = await post(a, '/v1/me/email/verify', { email, code }, bearer(other));
    assert.equal(r.statusCode, 409);
    assert.equal(r.json().error, 'identity_in_use');
  } finally {
    await a.close();
  }
});

test('Quên mật khẩu bằng email: theo tên đăng nhập hoặc email => mã => đặt lại => mọi phiên bị thu hồi', async () => {
  const mail = fakeMail();
  const a = await makeAuthApp({}, { mail });
  try {
    const acc = await account(a, 'quen.mk');
    const email = E('quen.mk');
    await attachEmail(a, mail, acc, email);
    mail.sent.length = 0;
    assert.equal((await post(a, '/v1/auth/password/forgot', { usernameOrEmail: ' ' + U('Quen.MK') })).statusCode, 202);
    const code = await mail.codeFor(email);
    const NEW = 'bun-bo-hue-cay-1';
    const r = await post(a, '/v1/auth/password/reset-email', { usernameOrEmail: U('quen.mk'), code, newPassword: NEW });
    assert.equal(r.statusCode, 204, r.body);
    assert.equal((await post(a, '/v1/auth/refresh', { refreshToken: acc.refreshToken })).statusCode, 401);
    assert.equal((await post(a, '/v1/auth/login', { username: U('quen.mk'), password: NEW })).statusCode, 200);

    mail.sent.length = 0;
    assert.equal((await post(a, '/v1/auth/password/forgot', { usernameOrEmail: email.toUpperCase() })).statusCode, 202);
    const code2 = await mail.codeFor(email);
    const weak = await post(a, '/v1/auth/password/reset-email', { usernameOrEmail: email, code: code2, newPassword: 'password123' });
    assert.equal(weak.json().error, 'weak_password');
    const r2 = await post(a, '/v1/auth/password/reset-email', { usernameOrEmail: email, code: code2, newPassword: 'mi-quang-ga-22' });
    assert.equal(r2.statusCode, 204, r2.body);
  } finally {
    await a.close();
  }
});

test('Quên mật khẩu: tài khoản không có/không tồn tại => 202, không gửi thư; reset-email trả cùng otp_invalid như sai mã', async () => {
  const mail = fakeMail();
  const a = await makeAuthApp({}, { mail });
  try {
    await account(a, 'khong.email');
    const acc = await account(a, 'co.email');
    await attachEmail(a, mail, acc, E('co.email'));
    mail.sent.length = 0;
    for (const usernameOrEmail of [U('khong.email'), U('khong.ton.tai'), 'ai@example.com', '!!!']) {
      assert.equal((await post(a, '/v1/auth/password/forgot', { usernameOrEmail })).statusCode, 202, usernameOrEmail);
    }
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(mail.sent.length, 0);
    const unknown = await post(a, '/v1/auth/password/reset-email', { usernameOrEmail: U('khong.ton.tai'), code: '123456', newPassword: 'mi-quang-ga-22' });
    const wrong = await post(a, '/v1/auth/password/reset-email', { usernameOrEmail: U('co.email'), code: '123456', newPassword: 'mi-quang-ga-22' });
    assert.equal(unknown.statusCode, 400);
    assert.equal(unknown.body, wrong.body);
    assert.deepEqual(unknown.json(), { error: 'otp_invalid' });
  } finally {
    await a.close();
  }
});

test('Mã gắn email của người A không dùng được để đặt lại mật khẩu (mã gắn với mục đích + người dùng)', async () => {
  const mail = fakeMail();
  const a = await makeAuthApp({}, { mail });
  try {
    const owner = await account(a, 'muc.dich');
    const email = E('muc.dich');
    await attachEmail(a, mail, owner, email);
    mail.sent.length = 0;
    // owner xin gắn lại cùng email (mã "gắn email"), rồi thử dùng mã đó cho đặt lại mật khẩu
    await post(a, '/v1/me/email/start', { email }, bearer(owner));
    const linkCode = await mail.codeFor(email);
    const r = await post(a, '/v1/auth/password/reset-email', { usernameOrEmail: email, code: linkCode, newPassword: 'mi-quang-ga-22' });
    assert.equal(r.statusCode, 400);
  } finally {
    await a.close();
  }
});

test('reset-email: mật khẩu yếu + mã sai => CÙNG thân lỗi cho tài khoản có thật và không có (không lộ qua weak_password/otp_locked)', async () => {
  const mail = fakeMail();
  const a = await makeAuthApp({}, { mail });
  try {
    const acc = await account(a, 'lo.ten');
    await attachEmail(a, mail, acc, E('lo.ten'));
    for (const newPassword of ['password123', `${U('lo.ten')}-${U('lo.tenx')}`]) {
      const known = await post(a, '/v1/auth/password/reset-email', { usernameOrEmail: U('lo.ten'), code: '000000', newPassword });
      const unknown = await post(a, '/v1/auth/password/reset-email', { usernameOrEmail: U('lo.tenx'), code: '000000', newPassword });
      assert.equal(known.body, unknown.body, newPassword);
    }
    // 10 lần sai: khóa như nhau cho cả hai
    for (let i = 0; i < 12; i++) {
      await post(a, '/v1/auth/password/reset-email', { usernameOrEmail: U('lo.ten'), code: '000000', newPassword: 'mi-quang-ga-22' });
      await post(a, '/v1/auth/password/reset-email', { usernameOrEmail: U('lo.tenx'), code: '000000', newPassword: 'mi-quang-ga-22' });
    }
    const k = await post(a, '/v1/auth/password/reset-email', { usernameOrEmail: U('lo.ten'), code: '000000', newPassword: 'mi-quang-ga-22' });
    const u = await post(a, '/v1/auth/password/reset-email', { usernameOrEmail: U('lo.tenx'), code: '000000', newPassword: 'mi-quang-ga-22' });
    assert.equal(k.body, u.body);
  } finally {
    await a.close();
  }
});

test('Người khác KHÔNG phá được quên mật khẩu của nạn nhân qua /me/email/* (không xóa mã, không đốt lượt gửi, không khóa)', async () => {
  const mail = fakeMail();
  const a = await makeAuthApp({}, { mail });
  try {
    const victim = await account(a, 'nan.nhan');
    const email = E('nan.nhan');
    await attachEmail(a, mail, victim, email);
    mail.sent.length = 0;
    assert.equal((await post(a, '/v1/auth/password/forgot', { usernameOrEmail: U('nan.nhan') })).statusCode, 202);
    const code = await mail.codeFor(email);
    // kẻ xấu: xin mã gắn email của nạn nhân nhiều lần, nhập sai 10+ lần
    const evil = await account(a, 'ke.xau');
    for (let i = 0; i < 3; i++) await post(a, '/v1/me/email/start', { email }, bearer(evil));
    for (let i = 0; i < 6; i++) await post(a, '/v1/me/email/verify', { email, code: code === '000000' ? '111111' : '000000' }, bearer(evil));
    a.advance(61_000);
    for (let i = 0; i < 6; i++) await post(a, '/v1/me/email/verify', { email, code: code === '000000' ? '111111' : '000000' }, bearer(evil));
    // mã đặt lại của nạn nhân vẫn dùng được
    const r = await post(a, '/v1/auth/password/reset-email', { usernameOrEmail: U('nan.nhan'), code, newPassword: 'mi-quang-ga-22' });
    assert.equal(r.statusCode, 204, r.body);
  } finally {
    await a.close();
  }
});

test('Không log mã OTP hay email đầy đủ', async () => {
  const lines = [];
  const mail = fakeMail();
  const a = await makeAuthApp({}, { mail, logger: { level: 'trace', stream: { write: (s) => lines.push(s) } } });
  try {
    const acc = await account(a, 'log.otp');
    const email = E('log.otp');
    await attachEmail(a, mail, acc, email);
    await post(a, '/v1/auth/password/forgot', { usernameOrEmail: email });
    const code = await mail.codeFor(email);
    await post(a, '/v1/auth/password/reset-email', { usernameOrEmail: email, code: '000000', newPassword: 'mi-quang-ga-22' });
    await a.audit.flush();
    const all = lines.join('\n');
    assert.ok(!all.includes(email), 'log chứa email');
    assert.ok(!all.includes(code), 'log chứa mã OTP');
  } finally {
    await a.close();
  }
});
