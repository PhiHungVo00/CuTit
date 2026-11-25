import test from 'node:test';
import assert from 'node:assert/strict';
import { createDbProvider } from '../dist/db/client.js';
import { makeApp } from './helpers.mjs';

/**
 * Rà PR #18 (kien-truc) — ba mục "trước khi phát hành":
 *  BM-1a trần thư theo từng người dùng + phần trần dành riêng cho quên/đặt lại mật khẩu
 *  BM-1b kẻ gõ tên nạn nhân không khóa được đường đặt lại mật khẩu bằng email của nạn nhân
 *  BM-1c khóa đăng nhập tạm chịu được request song song (đếm nguyên tử trước khi kiểm mật khẩu)
 * TEST_DATABASE_URL => chạy thêm trên Postgres thật (hậu tố ngẫu nhiên, mỗi app một IP riêng).
 */
const PG = process.env.TEST_DATABASE_URL;
const RUN = PG ? Math.random().toString(36).slice(2, 6) : '';
const U = (n) => n + RUN;
const E = (local) => `${local}${RUN}@example.com`;
const PW = 'ca-phe-sua-da-42';
const ENV = { AUTH_RATE_LIMIT_PER_MINUTE: '1000', RATE_LIMIT_PER_MINUTE: '1000', AUTH_LOGIN_SLOWDOWN_MS: '0' };
const NET = PG ? `10.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}` : '10.7.0';
const IP = (n) => ({ remoteAddress: `${NET}.${n}` });

function fakeMail() {
  const sent = [];
  return {
    name: 'fake',
    sent,
    available: () => true,
    async send(to, subjectVi, subjectEn, body) {
      sent.push({ to, body });
    },
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

async function makeAuthApp(env = {}, opts = {}) {
  const dbp = createDbProvider(PG ? { DATABASE_URL: PG, PGLITE_DIR: 'memory://' } : { PGLITE_DIR: 'memory://' });
  const app = await makeApp({ ...ENV, ...env }, { db: dbp, ...opts });
  const close = app.close.bind(app);
  app.close = async () => {
    await close();
    await dbp.close();
  };
  return app;
}

const post = (app, url, payload, extra = {}) => app.inject({ method: 'POST', url, payload, ...extra });
const bearer = (b) => ({ headers: { authorization: `Bearer ${b.accessToken}` } });
async function account(app, name, extra = {}) {
  const r = await post(app, '/v1/auth/register', { username: U(name), password: PW }, extra);
  assert.equal(r.statusCode, 200, r.body);
  return r.json();
}
async function attachEmail(app, mail, acc, email, extra = {}) {
  assert.equal((await post(app, '/v1/me/email/start', { email, currentPassword: PW }, { ...bearer(acc), ...extra })).statusCode, 202);
  const code = await mail.codeFor(email);
  assert.equal((await post(app, '/v1/me/email/verify', { email, code }, { ...bearer(acc), ...extra })).statusCode, 200);
}

test('Cấu hình: trần thư theo người dùng và phần dành riêng cho quên mật khẩu có mặc định hợp lý', async () => {
  const { loadConfig } = await import('../dist/config.js');
  const c = loadConfig({ NODE_ENV: 'development' });
  assert.equal(c.MAIL_USER_DAILY_CAP, 5);
  assert.equal(c.MAIL_RESET_RESERVE_RATIO, 0.2);
});

test('Trần thư theo người dùng: một tài khoản chỉ xin được MAIL_USER_DAILY_CAP thư/ngày (email khác nhau vẫn tính chung); người khác không bị ảnh hưởng', async () => {
  const mail = fakeMail();
  const a = await makeAuthApp({ MAIL_USER_DAILY_CAP: '2' }, { mail });
  try {
    const ip = IP(11);
    const spammer = await account(a, 'ke.dot.thu', ip);
    const start = (acc, email) => post(a, '/v1/me/email/start', { email, currentPassword: PW }, { ...bearer(acc), ...ip });
    assert.equal((await start(spammer, E('s1'))).statusCode, 202);
    assert.equal((await start(spammer, E('s2'))).statusCode, 202);
    const third = await start(spammer, E('s3'));
    assert.equal(third.statusCode, 429);
    assert.equal(third.json().error, 'rate_limited');
    assert.equal(mail.sent.length, 2);
    const honest = await account(a, 'nguoi.that', ip);
    assert.equal((await start(honest, E('h1'))).statusCode, 202);
  } finally {
    await a.close();
  }
});

test('Phần trần dành riêng: luồng gắn email hết phần của nó (cap − dự trữ) thì dừng, nhưng quên mật khẩu vẫn gửi được tới hết trần chung', async () => {
  const mail = fakeMail();
  // cap 10, dự trữ 30% => luồng gắn email tối đa 7 thư; forgot dùng được thêm 3
  const a = await makeAuthApp({ MAIL_DAILY_CAP: PG ? '100000' : '10', MAIL_RESET_RESERVE_RATIO: PG ? '0' : '0.3' }, { mail });
  if (PG) {
    // Trần chung của Postgres dùng chung giữa các lần chạy => không dựng được "gần cạn" ổn định; PGlite đã phủ logic này
    await a.close();
    return;
  }
  try {
    const victim = await account(a, 'nan.nhan.mk', IP(12));
    await attachEmail(a, mail, victim, E('nan.nhan.mk'), IP(12));
    // đốt phần của luồng gắn email bằng nhiều tài khoản (mỗi tài khoản trong trần riêng)
    let blocked = 0;
    for (let i = 0; i < 12 && blocked === 0; i++) {
      const acc = await account(a, 'dot' + i, IP(13));
      const r = await post(a, '/v1/me/email/start', { email: E('dot' + i), currentPassword: PW }, { ...bearer(acc), ...IP(13) });
      if (r.statusCode === 503) blocked++;
    }
    assert.equal(blocked, 1, 'luồng gắn email phải bị chặn trước khi chạm trần chung');
    const before = mail.sent.length;
    assert.ok(before < 10, `đã gửi ${before}, phải còn chỗ cho quên mật khẩu`);
    mail.sent.length = 0; // codeFor chỉ được thấy thư của forgot (gửi nền)
    assert.equal((await post(a, '/v1/auth/password/forgot', { usernameOrEmail: U('nan.nhan.mk') }, IP(14))).statusCode, 202);
    const code = await mail.codeFor(E('nan.nhan.mk'));
    assert.equal(mail.sent.length, 1);
    const r = await post(a, '/v1/auth/password/reset-email', { usernameOrEmail: U('nan.nhan.mk'), code, newPassword: 'mi-quang-ga-22' }, IP(14));
    assert.equal(r.statusCode, 204, r.body);
  } finally {
    await a.close();
  }
});

test('Phá khóa: kẻ gõ sai tên nạn nhân nhiều lần (từ IP khác) KHÔNG làm nạn nhân bị otp_locked; cùng IP gõ sai nhiều vẫn bị khóa', async () => {
  const mail = fakeMail();
  const a = await makeAuthApp({}, { mail });
  try {
    const victim = await account(a, 'nan.nhan.khoa', IP(21));
    await attachEmail(a, mail, victim, E('nan.nhan.khoa'), IP(21));
    const attack = () => post(a, '/v1/auth/password/reset-email', { usernameOrEmail: U('nan.nhan.khoa'), code: '000000', newPassword: 'mi-quang-ga-22' }, IP(22));
    for (let i = 0; i < 12; i++) await attack();
    // kẻ phá: chính IP đó bị khóa (chống dò mã giữ nguyên)
    assert.equal((await attack()).json().error, 'otp_locked');
    mail.sent.length = 0;
    // nạn nhân từ IP khác: xin mã, đặt lại được
    assert.equal((await post(a, '/v1/auth/password/forgot', { usernameOrEmail: U('nan.nhan.khoa') }, IP(21))).statusCode, 202);
    const code = await mail.codeFor(E('nan.nhan.khoa'));
    const r = await post(a, '/v1/auth/password/reset-email', { usernameOrEmail: U('nan.nhan.khoa'), code, newPassword: 'mi-quang-ga-22' }, IP(21));
    assert.equal(r.statusCode, 204, r.body);
  } finally {
    await a.close();
  }
});

test('Chống dò mã giữ nguyên: một IP đoán mã cho nhiều tên khác nhau vẫn bị chặn ở trần IP (30 lần/ngày)', async () => {
  const a = await makeAuthApp({});
  try {
    const ip = IP(31);
    let last;
    for (let i = 0; i < 31; i++) {
      last = await post(a, '/v1/auth/password/reset-email', { usernameOrEmail: U('ten' + (i % 4)) + 'x', code: '000000', newPassword: 'mi-quang-ga-22' }, ip);
    }
    assert.equal(last.json().error, 'otp_locked');
  } finally {
    await a.close();
  }
});

test('Đếm nguyên tử: 20 lần đăng nhập SAI song song cùng (IP, tên) => chỉ tối đa 5 lần được thử mật khẩu, còn lại 429', async () => {
  const a = await makeAuthApp();
  try {
    await account(a, 'song.song');
    const ip = IP(41);
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => post(a, '/v1/auth/login', { username: U('song.song'), password: 'sai-' + i + '-xxxx' }, ip)));
    const codes = rs.map((r) => r.statusCode);
    assert.ok(codes.filter((c) => c === 401).length <= 5, `quá 5 lần thử: ${codes.join(',')}`);
    assert.equal(codes.filter((c) => c === 429).length, 20 - codes.filter((c) => c === 401).length);
    assert.equal((await post(a, '/v1/auth/login', { username: U('song.song'), password: PW }, ip)).statusCode, 429);
  } finally {
    await a.close();
  }
});

test('Đăng nhập đúng không tốn lượt IP: 40 lần đăng nhập đúng liên tiếp từ một IP (trần IP 30 chỉ tính lần sai)', async () => {
  const a = await makeAuthApp();
  try {
    await account(a, 'dang.dung');
    const ip = IP(51);
    for (let i = 0; i < 40; i++) assert.equal((await post(a, '/v1/auth/login', { username: U('dang.dung'), password: PW }, ip)).statusCode, 200, 'lần ' + i);
  } finally {
    await a.close();
  }
});

test('Mã dự phòng sai song song cũng bị đếm nguyên tử (cùng khóa với đăng nhập)', async () => {
  const a = await makeAuthApp();
  try {
    await account(a, 'dp.song');
    const ip = IP(61);
    const rs = await Promise.all(
      Array.from({ length: 20 }, (_, i) => post(a, '/v1/auth/password/reset-backup', { username: U('dp.song'), backupCode: 'AAAA-BBBB-CCCC-' + String(1000 + i), newPassword: 'mi-quang-ga-22' }, ip))
    );
    const codes = rs.map((r) => r.statusCode);
    assert.ok(codes.filter((c) => c === 401).length <= 5, codes.join(','));
  } finally {
    await a.close();
  }
});
