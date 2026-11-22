import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword, isWeakPassword } from '../dist/services/auth/password.js';
import { createDbProvider, schema } from '../dist/db/client.js';
import { makeApp, guest } from './helpers.mjs';

/** Tắt giới hạn chung 10 lần/phút/IP của /v1/auth để test được giới hạn riêng của đăng nhập */
const ENV = { AUTH_RATE_LIMIT_PER_MINUTE: '1000', AUTH_LOGIN_SLOWDOWN_MS: '0' };
/**
 * Chạy thêm trên Postgres thật: TEST_DATABASE_URL=postgres://… pnpm --filter @vietlearning/gateway test.
 * DB dùng chung giữa các lần chạy => tên đăng nhập/IP có hậu tố ngẫu nhiên để không đụng dữ liệu lần trước.
 */
const PG = process.env.TEST_DATABASE_URL;
const RUN = PG ? Math.random().toString(36).slice(2, 6) : '';
const U = (n) => n + RUN;
const NET = PG ? `10.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}` : '10.0.0';
const IP = (n) => ({ remoteAddress: `${NET}.${n}` });
async function makeAuthApp(env = {}, opts = {}) {
  const dbp = createDbProvider(PG ? { DATABASE_URL: PG, PGLITE_DIR: 'memory://' } : { PGLITE_DIR: 'memory://' });
  const app = await makeApp({ ...ENV, ...env }, { db: dbp, ...opts });
  app.dbForTest = () => dbp.get();
  const close = app.close.bind(app);
  app.close = async () => {
    await close();
    await dbp.close();
  };
  return app;
}
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const PW = 'ca-phe-sua-da-42';

const post = (app, url, payload, extra = {}) => app.inject({ method: 'POST', url, payload, ...extra });

test('password.ts: argon2id đúng tham số OWASP (m=19456, t=2, p=1), verify đúng/sai', async () => {
  const h = await hashPassword(PW);
  assert.match(h, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.equal(await verifyPassword(h, PW), true);
  assert.equal(await verifyPassword(h, PW + 'x'), false);
  assert.equal(await verifyPassword('không-phải-hash', PW), false);
});

test('password.ts: mật khẩu có dấu gõ dạng NFD (tổ hợp) vẫn khớp hash tạo từ NFC (rà kien-truc RA-DOT2)', async () => {
  const nfc = 'Mèo con đáng yêu'.normalize('NFC');
  const nfd = nfc.normalize('NFD');
  assert.notEqual(nfc, nfd);
  assert.equal(await verifyPassword(await hashPassword(nfc), nfd), true);
  assert.equal(await verifyPassword(await hashPassword(nfd), nfc), true);
});

test('password.ts: chặn mật khẩu phổ biến (kể cả thêm số/ký hiệu ở đuôi, hoa thường) và trùng tên đăng nhập', () => {
  assert.equal(isWeakPassword('password123', 'mai.le'), true);
  assert.equal(isWeakPassword('PASSWORD', 'mai.le'), true);
  assert.equal(isWeakPassword('12345678', 'mai.le'), true);
  assert.equal(isWeakPassword('iloveyou2024!', 'mai.le'), true);
  assert.equal(isWeakPassword('aaaaaaaa', 'mai.le'), true);
  assert.equal(isWeakPassword('mai.le2024', 'mai.le'), true);
  assert.equal(isWeakPassword('Mai.Le', 'mai.le'), true);
  assert.equal(isWeakPassword(PW, 'mai.le'), false);
  assert.equal(isWeakPassword('trâu vàng ăn cỏ', 'mai.le'), false);
});

test('Đăng ký khi đang là khách: giữ userId, is_guest=false, trả mã dự phòng; mã khôi phục cũ vào bia mộ upgraded', async () => {
  const a = await makeAuthApp();
  try {
    const g = await guest(a);
    const r = await post(a, '/v1/auth/register', { username: ' ' + U('Mai.Le') + ' ', password: PW }, { headers: g.headers });
    assert.equal(r.statusCode, 200, r.body);
    const b = r.json();
    assert.equal(b.status, 'signed_in');
    assert.equal(b.userId, g.body.userId);
    assert.equal(b.isGuest, false);
    assert.deepEqual(b.providers, ['password']);
    assert.match(b.backupCode, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);

    const d = await a.dbForTest();
    const [u] = await d.select().from(schema.users).where(eq(schema.users.id, g.body.userId));
    assert.equal(u.isGuest, false);
    assert.equal(u.recoveryCodeHash, null);
    const [ident] = await d.select().from(schema.identities).where(eq(schema.identities.userId, u.id));
    assert.equal(ident.provider, 'password');
    assert.equal(ident.subject, U('mai.le'));
    const [cred] = await d.select().from(schema.passwordCredentials).where(eq(schema.passwordCredentials.userId, u.id));
    assert.match(cred.passwordHash, /^\$argon2id\$/);
    assert.notEqual(cred.passwordHash, PW);

    // Mã khôi phục của khách: hết dùng được, máy khác nhập vào nhận account_upgraded (KHÔNG account_deleted => không xóa dữ liệu máy)
    const rec = await post(a, '/v1/auth/recover', { recoveryCode: g.body.recoveryCode });
    assert.equal(rec.statusCode, 401);
    assert.equal(rec.json().error, 'account_upgraded');
    const [tomb] = await d.select().from(schema.deletedAccounts).where(eq(schema.deletedAccounts.credentialHash, sha256(g.body.recoveryCode.replace(/-/g, ''))));
    assert.equal(tomb.reason, 'upgraded');
    assert.equal(tomb.expiresAt, null);

    // Access token cũ của khách vẫn dùng được (cùng userId), đăng ký lần nữa bằng Bearer đó => đã là tài khoản
    const again = await post(a, '/v1/auth/register', { username: U('mai.le2'), password: PW }, { headers: g.headers });
    assert.equal(again.statusCode, 409);
    assert.equal(again.json().error, 'account_upgraded');
  } finally {
    await a.close();
  }
});

test('Đăng ký không Bearer: tài khoản mới; trùng tên (khác hoa thường) => username_taken; mật khẩu yếu => weak_password', async () => {
  const a = await makeAuthApp();
  try {
    const r = await post(a, '/v1/auth/register', { username: U('lan_anh'), password: PW });
    assert.equal(r.statusCode, 200, r.body);
    const dup = await post(a, '/v1/auth/register', { username: U('LAN_ANH'), password: PW + '!' });
    assert.equal(dup.statusCode, 409);
    assert.equal(dup.json().error, 'username_taken');
    const weak = await post(a, '/v1/auth/register', { username: U('hoa.mai'), password: 'password123' });
    assert.equal(weak.statusCode, 400);
    assert.equal(weak.json().error, 'weak_password');
    const same = await post(a, '/v1/auth/register', { username: U('hoa.mai'), password: U('hoa.mai') + '99' });
    assert.equal(same.json().error, 'weak_password');
    // Unicode / dấu chấm đầu / tên cấm => 400 trước khi tới DB
    for (const username of ['maì', '.mai', 'admin', 'ma']) {
      assert.equal((await post(a, '/v1/auth/register', { username, password: PW })).statusCode, 400, username);
    }
    // Tên đang giữ chỗ (tài khoản cũ bị xóa hẳn < 30 ngày) => username_taken
    const d = await a.dbForTest();
    await d.insert(schema.reservedUsernames).values({ username: U('cu.tit.cu'), until: new Date(Date.now() + 86400_000) });
    const reserved = await post(a, '/v1/auth/register', { username: U('cu.tit.cu'), password: PW });
    assert.equal(reserved.json().error, 'username_taken');
    // Giữ chỗ đã hết hạn => dùng được
    await d.insert(schema.reservedUsernames).values({ username: U('het.han'), until: new Date(Date.now() - 1000) });
    assert.equal((await post(a, '/v1/auth/register', { username: U('het.han'), password: PW })).statusCode, 200);
  } finally {
    await a.close();
  }
});

test('Đăng ký: Bearer sai => 401 (không lặng lẽ tạo tài khoản mới)', async () => {
  const a = await makeAuthApp();
  try {
    const r = await post(a, '/v1/auth/register', { username: U('bad.token'), password: PW }, { headers: { authorization: 'Bearer abc.def.ghi' } });
    assert.equal(r.statusCode, 401);
    assert.equal(r.json().error, 'invalid_token');
  } finally {
    await a.close();
  }
});

test('Đăng ký đồng thời: hai request cùng tên => đúng một thành công; hai request nâng cấp cùng khách => đúng một danh tính', async () => {
  const a = await makeAuthApp();
  try {
    const rs = await Promise.all([post(a, '/v1/auth/register', { username: U('trung.ten'), password: PW }), post(a, '/v1/auth/register', { username: U('trung.ten'), password: PW })]);
    assert.deepEqual(rs.map((r) => r.statusCode).sort(), [200, 409]);

    const g = await guest(a);
    const up = await Promise.all([
      post(a, '/v1/auth/register', { username: U('nang.cap1'), password: PW }, { headers: g.headers }),
      post(a, '/v1/auth/register', { username: U('nang.cap2'), password: PW }, { headers: g.headers })
    ]);
    assert.deepEqual(up.map((r) => r.statusCode).sort(), [200, 409]);
    const d = await a.dbForTest();
    const ids = await d.select().from(schema.identities).where(eq(schema.identities.userId, g.body.userId));
    assert.equal(ids.length, 1);
  } finally {
    await a.close();
  }
});

test('Đăng nhập: đúng => signed_in; sai mật khẩu và sai tên trả CÙNG một thân lỗi invalid_credentials', async () => {
  const a = await makeAuthApp();
  try {
    const reg = (await post(a, '/v1/auth/register', { username: U('minh.chau'), password: PW })).json();
    const ok = await post(a, '/v1/auth/login', { username: ' ' + U('Minh.Chau'), password: PW });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal(ok.json().status, 'signed_in');
    assert.equal(ok.json().userId, reg.userId);
    assert.deepEqual(ok.json().providers, ['password']);
    assert.equal(ok.json().restorable, undefined);
    const wrongPw = await post(a, '/v1/auth/login', { username: U('minh.chau'), password: 'sai-mat-khau-1' });
    const noUser = await post(a, '/v1/auth/login', { username: U('khong.ton.tai'), password: 'sai-mat-khau-1' });
    assert.equal(wrongPw.statusCode, 401);
    assert.equal(noUser.statusCode, 401);
    assert.equal(wrongPw.body, noUser.body);
    assert.deepEqual(wrongPw.json(), { error: 'invalid_credentials' });
    // token đăng nhập dùng được ở API có Bearer
    const me = await a.inject({ url: '/v1/speech/voices', headers: { authorization: `Bearer ${ok.json().accessToken}` } });
    assert.equal(me.statusCode, 200);
  } finally {
    await a.close();
  }
});

test('Đăng nhập: tài khoản đang chờ xóa => signed_in kèm restorable.deleteAt', async () => {
  const a = await makeAuthApp();
  try {
    const reg = (await post(a, '/v1/auth/register', { username: U('cho.xoa'), password: PW })).json();
    const d = await a.dbForTest();
    const deleteAt = new Date(Date.now() + 10 * 86400_000);
    await d.update(schema.users).set({ deleteAt }).where(eq(schema.users.id, reg.userId));
    const ok = await post(a, '/v1/auth/login', { username: U('cho.xoa'), password: PW });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().restorable.deleteAt, deleteAt.toISOString());
  } finally {
    await a.close();
  }
});

test('Khóa tạm: 5 lần sai cùng (IP, tên) => lần 6 rate_limited kể cả mật khẩu đúng; IP khác vẫn đăng nhập được', async () => {
  const a = await makeAuthApp();
  try {
    await post(a, '/v1/auth/register', { username: U('khoa.tam'), password: PW });
    const ip1 = IP(1);
    for (let i = 0; i < 5; i++) assert.equal((await post(a, '/v1/auth/login', { username: U('khoa.tam'), password: 'sai-' + i + '-xxxx' }, ip1)).statusCode, 401);
    const locked = await post(a, '/v1/auth/login', { username: U('khoa.tam'), password: PW }, ip1);
    assert.equal(locked.statusCode, 429);
    assert.equal(locked.json().error, 'rate_limited');
    const other = await post(a, '/v1/auth/login', { username: U('khoa.tam'), password: PW }, IP(2));
    assert.equal(other.statusCode, 200);
  } finally {
    await a.close();
  }
});

test('Trần IP: 30 lần sai/15 phút từ một IP (nhiều tên) => rate_limited', async () => {
  const a = await makeAuthApp();
  try {
    const ip = IP(9);
    const rs = await Promise.all(Array.from({ length: 30 }, (_, i) => post(a, '/v1/auth/login', { username: U('ten') + i, password: 'sai-mat-khau' }, ip)));
    assert.ok(rs.every((r) => r.statusCode === 401));
    const r = await post(a, '/v1/auth/login', { username: U('ten.moi'), password: 'sai-mat-khau' }, ip);
    assert.equal(r.statusCode, 429);
  } finally {
    await a.close();
  }
});

test('Mã dự phòng: đặt lại đúng => mật khẩu mới dùng được, mã cũ hết hiệu lực, trả mã mới, mọi refresh token cũ bị thu hồi', async () => {
  const a = await makeAuthApp();
  try {
    const reg = (await post(a, '/v1/auth/register', { username: U('du.phong'), password: PW })).json();
    const NEW = 'banh-mi-pate-77';
    const bad = await post(a, '/v1/auth/password/reset-backup', { username: U('du.phong'), backupCode: '0000-0000-0000-0000', newPassword: NEW });
    assert.equal(bad.statusCode, 401);
    assert.equal(bad.json().error, 'invalid_credentials');
    const weak = await post(a, '/v1/auth/password/reset-backup', { username: U('du.phong'), backupCode: reg.backupCode, newPassword: 'password123' });
    assert.equal(weak.json().error, 'weak_password');

    const r = await post(a, '/v1/auth/password/reset-backup', { username: U('du.phong'), backupCode: reg.backupCode.toLowerCase(), newPassword: NEW });
    assert.equal(r.statusCode, 200, r.body);
    const fresh = r.json().backupCode;
    assert.notEqual(fresh, reg.backupCode);
    assert.equal((await post(a, '/v1/auth/login', { username: U('du.phong'), password: PW })).statusCode, 401);
    assert.equal((await post(a, '/v1/auth/login', { username: U('du.phong'), password: NEW })).statusCode, 200);
    assert.equal((await post(a, '/v1/auth/refresh', { refreshToken: reg.refreshToken })).statusCode, 401);
    const reuse = await post(a, '/v1/auth/password/reset-backup', { username: U('du.phong'), backupCode: reg.backupCode, newPassword: 'pho-bo-tai-99' });
    assert.equal(reuse.statusCode, 401);
    assert.equal((await post(a, '/v1/auth/password/reset-backup', { username: U('du.phong'), backupCode: fresh, newPassword: 'pho-bo-tai-99' })).statusCode, 200);
    // hai request đồng thời với cùng một mã => đúng một thành công
    const d = await a.dbForTest();
    const [cred] = await d.select().from(schema.passwordCredentials).where(eq(schema.passwordCredentials.userId, reg.userId));
    assert.ok(cred.backupCodeHash);
  } finally {
    await a.close();
  }
});

test('Mã dự phòng dùng đồng thời hai lần => đúng một lần thành công', async () => {
  const a = await makeAuthApp();
  try {
    const reg = (await post(a, '/v1/auth/register', { username: U('dong.thoi'), password: PW })).json();
    const rs = await Promise.all(
      ['mien-tay-song-nuoc-1', 'mien-tay-song-nuoc-2'].map((newPassword) => post(a, '/v1/auth/password/reset-backup', { username: U('dong.thoi'), backupCode: reg.backupCode, newPassword }))
    );
    assert.deepEqual(rs.map((r) => r.statusCode).sort(), [200, 401]);
  } finally {
    await a.close();
  }
});

test('Đổi mật khẩu (Bearer): mật khẩu cũ sai => invalid_credentials; đúng => token mới, refresh token cũ bị thu hồi', async () => {
  const a = await makeAuthApp();
  try {
    const reg = (await post(a, '/v1/auth/register', { username: U('doi.mk'), password: PW })).json();
    const headers = { authorization: `Bearer ${reg.accessToken}` };
    const wrong = await post(a, '/v1/me/password', { currentPassword: 'sai-roi-nhe', newPassword: 'com-tam-suon-1' }, { headers });
    assert.equal(wrong.statusCode, 401);
    assert.equal(wrong.json().error, 'invalid_credentials');
    const r = await post(a, '/v1/me/password', { currentPassword: PW, newPassword: 'com-tam-suon-1' }, { headers });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().userId, reg.userId);
    assert.equal((await post(a, '/v1/auth/refresh', { refreshToken: reg.refreshToken })).statusCode, 401);
    assert.equal((await post(a, '/v1/auth/refresh', { refreshToken: r.json().refreshToken })).statusCode, 200);
    assert.equal((await post(a, '/v1/auth/login', { username: U('doi.mk'), password: 'com-tam-suon-1' })).statusCode, 200);
    // khách (không có mật khẩu) => không đổi được
    const g = await guest(a);
    const gr = await post(a, '/v1/me/password', { currentPassword: 'gi-cung-duoc', newPassword: 'com-tam-suon-1' }, { headers: g.headers });
    assert.equal(gr.statusCode, 401);
  } finally {
    await a.close();
  }
});

test('Tạo mã dự phòng mới (Bearer): mã cũ hết hiệu lực; khách => 409', async () => {
  const a = await makeAuthApp();
  try {
    const reg = (await post(a, '/v1/auth/register', { username: U('ma.moi'), password: PW })).json();
    const headers = { authorization: `Bearer ${reg.accessToken}` };
    const r = await post(a, '/v1/me/backup-code', {}, { headers });
    assert.equal(r.statusCode, 200, r.body);
    const old = await post(a, '/v1/auth/password/reset-backup', { username: U('ma.moi'), backupCode: reg.backupCode, newPassword: 'goi-cuon-tom-1' });
    assert.equal(old.statusCode, 401);
    const d = await a.dbForTest();
    const [cred] = await d.select().from(schema.passwordCredentials).where(eq(schema.passwordCredentials.userId, reg.userId));
    assert.equal(cred.backupCodeHash, sha256(r.json().backupCode.replace(/-/g, '')));
    const g = await guest(a);
    assert.equal((await post(a, '/v1/me/backup-code', {}, { headers: g.headers })).statusCode, 409);
  } finally {
    await a.close();
  }
});

test('Không log mật khẩu, mã dự phòng hay tên đăng nhập trong log của Gateway', async () => {
  const lines = [];
  const stream = { write: (s) => lines.push(s) };
  const a = await makeAuthApp({}, { logger: { level: 'trace', stream } });
  try {
    const reg = (await post(a, '/v1/auth/register', { username: U('bi.mat'), password: PW })).json();
    await post(a, '/v1/auth/login', { username: U('bi.mat'), password: 'sai-bi-mat-123' });
    await post(a, '/v1/auth/password/reset-backup', { username: U('bi.mat'), backupCode: reg.backupCode, newPassword: 'mat-khau-moi-xyz' });
    await a.audit.flush();
    const all = lines.join('\n');
    for (const secret of [PW, 'sai-bi-mat-123', 'mat-khau-moi-xyz', reg.backupCode, U('bi.mat')]) assert.ok(!all.includes(secret), `log chứa ${secret}`);
  } finally {
    await a.close();
  }
});
