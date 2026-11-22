import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { and, eq } from 'drizzle-orm';
import { createDbProvider, schema } from '../dist/db/client.js';
import {
  IdentityTokenError,
  createGoogleIdentityProvider,
  createIdentityProviderFromEnv,
  maskEmail
} from '../dist/providers/identity.js';
import { makeApp, guest } from './helpers.mjs';

/**
 * Dự án 3 Task 3 — đăng nhập Google, liên kết/gỡ danh tính. Token Google GIẢ: tự sinh cặp khóa RS256, ký bằng jose,
 * Gateway kiểm bằng bộ khóa cục bộ (createLocalJWKSet) => chạy đúng code kiểm chữ ký/aud/iss/exp/nonce thật, không gọi mạng.
 * Chạy thêm trên Postgres thật khi đặt TEST_DATABASE_URL (như friends-concurrency).
 */
const CLIENT_ID = 'test-web-client.apps.googleusercontent.com';
const PG = process.env.TEST_DATABASE_URL;
const dbp = createDbProvider(PG ? { DATABASE_URL: PG, PGLITE_DIR: 'memory://' } : { PGLITE_DIR: 'memory://' });
const LIMITS = { AUTH_RATE_LIMIT_PER_MINUTE: '10000', RATE_LIMIT_PER_MINUTE: '10000' };

let key;
let otherKey;
let provider;
let a;
before(async () => {
  key = await generateKeyPair('RS256');
  otherKey = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(key.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  provider = createGoogleIdentityProvider({ audiences: [CLIENT_ID], keys: createLocalJWKSet({ keys: [jwk] }) });
  a = await makeApp(LIMITS, { db: dbp, identity: provider });
});
after(async () => {
  await a.close();
  await dbp.close();
});

/** Ký một ID token kiểu Google. `over` ghi đè claim; `opts.key`/`opts.alg`/`opts.exp` để làm token hỏng. */
async function idToken(claims = {}, opts = {}) {
  const { exp = '1h', signKey = key.privateKey, alg = 'RS256' } = opts;
  return new SignJWT({ email: 'mai.le@gmail.com', email_verified: true, ...claims })
    .setProtectedHeader({ alg, kid: 'k1' })
    .setIssuer(claims.iss ?? 'https://accounts.google.com')
    .setAudience(claims.aud ?? CLIENT_ID)
    .setSubject(claims.sub ?? `g-${randomUUID()}`)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(signKey);
}

const nonce = async () => {
  const r = await a.inject({ url: '/v1/auth/nonce' });
  assert.equal(r.statusCode, 200, r.body);
  return r.json().nonce;
};
/** Một lần bấm "Tiếp tục với Google": xin nonce, Google ký token có nonce đó */
async function googleBody(claims = {}) {
  const n = await nonce();
  return { nonce: n, idToken: await idToken({ ...claims, nonce: n }) };
}
const signIn = async (claims) => a.inject({ method: 'POST', url: '/v1/auth/google', payload: await googleBody(claims) });
const link = async (headers, claims) => a.inject({ method: 'POST', url: '/v1/me/identities/google', headers, payload: await googleBody(claims) });
const bearer = (t) => ({ authorization: `Bearer ${t}` });
const db = () => dbp.get();

async function addProgress(headers) {
  const at = new Date().toISOString();
  const r = await a.inject({
    method: 'POST',
    url: '/v1/sync',
    headers,
    payload: { events: [{ clientEventId: randomUUID(), at, type: 'xp.add', source: 'lesson', amount: 10, day: '2026-11-21', lessonId: 'u1-l1' }] }
  });
  assert.equal(r.statusCode, 200, r.body);
}

// ---------- Bộ kiểm ID token ----------

test('Cấu hình: không có GOOGLE_WEB_CLIENT_ID => null; có => provider google (thêm GOOGLE_EXTRA_AUDIENCES)', () => {
  assert.equal(createIdentityProviderFromEnv({}), null);
  assert.equal(createIdentityProviderFromEnv({ GOOGLE_WEB_CLIENT_ID: '  ' }), null);
  assert.equal(createIdentityProviderFromEnv({ GOOGLE_WEB_CLIENT_ID: CLIENT_ID, GOOGLE_EXTRA_AUDIENCES: 'a, b' }).name, 'google');
  assert.equal(maskEmail('mai.le@gmail.com'), 'm***@gmail.com');
});

test('Kiểm token: hợp lệ => sub + email che; sai chữ ký/aud/iss/hết hạn/email chưa xác minh/nonce/HS256 => IdentityTokenError', async () => {
  const ok = await provider.verify(await idToken({ sub: 'g-1', nonce: 'n'.repeat(20) }), 'n'.repeat(20));
  assert.deepEqual(ok, { subject: 'g-1', emailMasked: 'm***@gmail.com', emailVerified: true });
  const n = 'n'.repeat(20);
  const bad = [
    ['chữ ký khóa khác', await idToken({ nonce: n }, { signKey: otherKey.privateKey })],
    ['aud sai', await idToken({ nonce: n, aud: 'other-app.apps.googleusercontent.com' })],
    ['iss sai', await idToken({ nonce: n, iss: 'https://evil.example.com' })],
    ['hết hạn', await idToken({ nonce: n }, { exp: Math.floor(Date.now() / 1000) - 60 })],
    ['email chưa xác minh', await idToken({ nonce: n, email_verified: false })],
    ['thiếu email_verified', await idToken({ nonce: n, email_verified: undefined })],
    ['nonce khác', await idToken({ nonce: 'x'.repeat(20) })],
    ['không có nonce', await idToken({})],
    ['HS256', await idToken({ nonce: n }, { alg: 'HS256', signKey: new TextEncoder().encode('s'.repeat(32)) })]
  ];
  for (const [name, t] of bad) {
    await assert.rejects(provider.verify(t, n), IdentityTokenError, name);
  }
});

// ---------- Route ----------

test('Chưa cấu hình Google => 503 provider_unavailable (không sập); nonce vẫn cấp được', async () => {
  const b = await makeApp(LIMITS, { db: dbp, identity: null });
  try {
    const n = (await b.inject({ url: '/v1/auth/nonce' })).json().nonce;
    const payload = { nonce: n, idToken: await idToken({ nonce: n }) };
    const r = await b.inject({ method: 'POST', url: '/v1/auth/google', payload });
    assert.equal(r.statusCode, 503);
    assert.equal(r.json().error, 'provider_unavailable');
    const g = await guest(b);
    const r2 = await b.inject({ method: 'POST', url: '/v1/me/identities/google', headers: g.headers, payload });
    assert.equal(r2.statusCode, 503);
    assert.equal(r2.json().error, 'provider_unavailable');
  } finally {
    await b.close();
  }
});

test('Nonce: dùng lần 2 => 401; nonce không do server cấp => 401; aud sai => 401 invalid_credentials', async () => {
  const body = await googleBody();
  assert.equal((await a.inject({ method: 'POST', url: '/v1/auth/google', payload: body })).statusCode, 200);
  const again = await a.inject({ method: 'POST', url: '/v1/auth/google', payload: body });
  assert.equal(again.statusCode, 401);
  assert.equal(again.json().error, 'invalid_credentials');
  const fake = 'f'.repeat(32);
  const forged = await a.inject({ method: 'POST', url: '/v1/auth/google', payload: { nonce: fake, idToken: await idToken({ nonce: fake }) } });
  assert.equal(forged.statusCode, 401);
  const n = await nonce();
  const wrongAud = await a.inject({ method: 'POST', url: '/v1/auth/google', payload: { nonce: n, idToken: await idToken({ nonce: n, aud: 'x.apps.googleusercontent.com' }) } });
  assert.equal(wrongAud.statusCode, 401);
  assert.equal(wrongAud.json().error, 'invalid_credentials');
  assert.equal((await a.inject({ method: 'POST', url: '/v1/auth/google', payload: { nonce: n } })).statusCode, 400);
});

test('Đăng nhập Google không Bearer: sub mới => tài khoản mới (không phải khách); lần sau cùng sub => cùng userId', async () => {
  const sub = `g-${randomUUID()}`;
  const r1 = await signIn({ sub });
  assert.equal(r1.statusCode, 200, r1.body);
  const b1 = r1.json();
  assert.equal(b1.status, 'signed_in');
  assert.equal(b1.isGuest, false);
  assert.deepEqual(b1.providers, ['google']);
  const r2 = await signIn({ sub });
  assert.equal(r2.json().userId, b1.userId);
  assert.notEqual(r2.json().refreshToken, b1.refreshToken);
  const list = await a.inject({ url: '/v1/me/identities', headers: bearer(b1.accessToken) });
  assert.equal(list.statusCode, 200);
  assert.deepEqual(list.json().identities.map((i) => [i.provider, i.display]), [['google', 'm***@gmail.com']]);
  // Không lưu email đầy đủ của Google
  const [row] = await (await db()).select().from(schema.identities).where(eq(schema.identities.subject, sub));
  assert.ok(!JSON.stringify(row).includes('mai.le@gmail.com'));
});

test('Chống chiếm tài khoản: email trùng với danh tính email của người khác nhưng sub khác => tài khoản MỚI, không vào tài khoản cũ', async () => {
  const victim = await signIn({ sub: `g-${randomUUID()}` });
  const victimId = victim.json().userId;
  const email = `victim-${randomUUID()}@gmail.com`;
  await (await db()).insert(schema.identities).values({ userId: victimId, provider: 'email', subject: email, display: 'v***@gmail.com', emailVerified: true });
  const attacker = await signIn({ sub: `g-${randomUUID()}`, email });
  assert.equal(attacker.statusCode, 200);
  assert.notEqual(attacker.json().userId, victimId);
  // Cùng email nhưng khác sub khi đang là khách => nâng cấp chính khách, không chạm tài khoản nạn nhân
  const g = await guest(a);
  const up = await link(g.headers, { sub: `g-${randomUUID()}`, email });
  assert.equal(up.json().userId, g.body.userId);
});

test('Khách + Google chưa thuộc ai => nâng cấp giữ userId, mã khôi phục cũ hết dùng (bia mộ upgraded)', async () => {
  const g = await guest(a);
  const r = await link(g.headers);
  assert.equal(r.statusCode, 200, r.body);
  const b = r.json();
  assert.equal(b.status, 'signed_in');
  assert.equal(b.userId, g.body.userId);
  assert.equal(b.isGuest, false);
  assert.deepEqual(b.providers, ['google']);
  const d = await db();
  const [u] = await d.select().from(schema.users).where(eq(schema.users.id, g.body.userId));
  assert.equal(u.isGuest, false);
  assert.equal(u.recoveryCodeHash, null);
  const rec = await a.inject({ method: 'POST', url: '/v1/auth/recover', payload: { recoveryCode: g.body.recoveryCode } });
  assert.equal(rec.statusCode, 401);
  const tomb = await d.select().from(schema.deletedAccounts).where(eq(schema.deletedAccounts.reason, 'upgraded'));
  assert.ok(tomb.some((t) => t.expiresAt === null));
  // token khách cũ vẫn dùng được (cùng người dùng)
  assert.equal((await a.inject({ url: '/v1/me/identities', headers: g.headers })).statusCode, 200);
});

test('Google đã thuộc tài khoản A, khách KHÔNG tiến độ => signed_in tài khoản A, khách rỗng bị xóa (bia mộ merged)', async () => {
  const sub = `g-${randomUUID()}`;
  const accA = (await signIn({ sub })).json();
  const g = await guest(a);
  const r = await link(g.headers, { sub });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().status, 'signed_in');
  assert.equal(r.json().userId, accA.userId);
  const d = await db();
  assert.equal((await d.select().from(schema.users).where(eq(schema.users.id, g.body.userId))).length, 0);
  const merged = await d.select().from(schema.deletedAccounts).where(eq(schema.deletedAccounts.reason, 'merged'));
  assert.ok(merged.length >= 2); // refresh token + mã khôi phục của khách
  assert.equal((await a.inject({ url: '/v1/me/identities', headers: g.headers })).statusCode, 401);
  assert.equal((await a.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: g.body.refreshToken } })).statusCode, 401);
});

test('Google đã thuộc tài khoản A, khách CÓ tiến độ => needs_merge + mergeTicket (một lần, gắn khách→A), khách còn nguyên', async () => {
  const sub = `g-${randomUUID()}`;
  const accA = (await signIn({ sub })).json();
  const g = await guest(a);
  await addProgress(g.headers);
  const r = await link(g.headers, { sub });
  assert.equal(r.statusCode, 200, r.body);
  const b = r.json();
  assert.equal(b.status, 'needs_merge');
  assert.equal(b.target.hasProgress, true);
  assert.ok(b.mergeTicket.length >= 32);
  assert.ok(!('accessToken' in b));
  const d = await db();
  const [t] = await d
    .select()
    .from(schema.authChallenges)
    .where(and(eq(schema.authChallenges.kind, 'merge_ticket'), eq(schema.authChallenges.userId, g.body.userId)));
  assert.equal(t.subject, accA.userId);
  assert.notEqual(t.keyHash, b.mergeTicket); // chỉ lưu băm
  assert.equal((await a.inject({ url: '/v1/me/identities', headers: g.headers })).statusCode, 200);
});

test('Đang là tài khoản: liên kết Google đã thuộc người khác => 409 identity_in_use; liên kết lại Google của mình => idempotent', async () => {
  const subA = `g-${randomUUID()}`;
  await signIn({ sub: subA });
  const accB = (await signIn({ sub: `g-${randomUUID()}` })).json();
  const r = await link(bearer(accB.accessToken), { sub: subA });
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().error, 'identity_in_use');
  const g = await guest(a);
  const subC = `g-${randomUUID()}`;
  const up = (await link(g.headers, { sub: subC })).json();
  const again = await link(bearer(up.accessToken), { sub: subC });
  assert.equal(again.statusCode, 200);
  assert.equal(again.json().userId, g.body.userId);
  // Google thứ hai (sub khác) cho cùng tài khoản => 409 (mỗi tài khoản một Google)
  const second = await link(bearer(up.accessToken), { sub: `g-${randomUUID()}` });
  assert.equal(second.statusCode, 409);
});

test('Gỡ liên kết: phương thức cuối => 409 last_identity; còn mật khẩu => gỡ Google được; id người khác => 404; id sai dạng => 400', async () => {
  const acc = (await signIn({ sub: `g-${randomUUID()}` })).json();
  const h = bearer(acc.accessToken);
  const [gid] = (await (await a.inject({ url: '/v1/me/identities', headers: h })).json()).identities.map((i) => i.id);
  const last = await a.inject({ method: 'DELETE', url: `/v1/me/identities/${gid}`, headers: h });
  assert.equal(last.statusCode, 409);
  assert.equal(last.json().error, 'last_identity');
  // email chỉ để lấy lại mật khẩu: không tính là phương thức đăng nhập
  const d = await db();
  await d.insert(schema.identities).values({ userId: acc.userId, provider: 'email', subject: `x-${randomUUID()}@gmail.com`, emailVerified: true });
  assert.equal((await a.inject({ method: 'DELETE', url: `/v1/me/identities/${gid}`, headers: h })).statusCode, 409);
  const uname = `u${randomUUID().slice(0, 8)}`;
  await d.insert(schema.identities).values({ userId: acc.userId, provider: 'password', subject: uname, display: uname });
  await d.insert(schema.passwordCredentials).values({ userId: acc.userId, passwordHash: 'x' });
  const ok = await a.inject({ method: 'DELETE', url: `/v1/me/identities/${gid}`, headers: h });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.deepEqual(ok.json().identities.map((i) => i.provider).sort(), ['email', 'password']);
  // email che khi không có display (lưu ý 5 của kien-truc: display NULL => coalesce)
  assert.ok(ok.json().identities.find((i) => i.provider === 'email').display.includes('***'));
  const other = (await signIn({ sub: `g-${randomUUID()}` })).json();
  const otherId = (await (await a.inject({ url: '/v1/me/identities', headers: bearer(other.accessToken) })).json()).identities[0].id;
  assert.equal((await a.inject({ method: 'DELETE', url: `/v1/me/identities/${otherId}`, headers: h })).statusCode, 404);
  assert.equal((await a.inject({ method: 'DELETE', url: '/v1/me/identities/not-a-uuid', headers: h })).statusCode, 400);
});

test('Gỡ mật khẩu => xóa luôn băm mật khẩu và email đã gắn (email chỉ để lấy lại mật khẩu; rà kien-truc RA-DOT2)', async () => {
  const acc = (await signIn({ sub: `g-${randomUUID()}` })).json();
  const h = bearer(acc.accessToken);
  const d = await db();
  const uname = `u${randomUUID().slice(0, 8)}`;
  const [pw] = await d.insert(schema.identities).values({ userId: acc.userId, provider: 'password', subject: uname, display: uname }).returning({ id: schema.identities.id });
  await d.insert(schema.passwordCredentials).values({ userId: acc.userId, passwordHash: 'x' });
  await d.insert(schema.identities).values({ userId: acc.userId, provider: 'email', subject: `x-${randomUUID()}@gmail.com`, emailVerified: true });
  const r = await a.inject({ method: 'DELETE', url: `/v1/me/identities/${pw.id}`, headers: h });
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json().identities.map((i) => i.provider), ['google']);
  assert.equal((await d.select().from(schema.passwordCredentials).where(eq(schema.passwordCredentials.userId, acc.userId))).length, 0);
});

test('Gỡ ĐỒNG THỜI hai phương thức còn lại => chỉ gỡ được một, luôn còn ít nhất một phương thức đăng nhập', async () => {
  const acc = (await signIn({ sub: `g-${randomUUID()}` })).json();
  const h = bearer(acc.accessToken);
  const d = await db();
  const uname = `u${randomUUID().slice(0, 8)}`;
  await d.insert(schema.identities).values({ userId: acc.userId, provider: 'password', subject: uname, display: uname });
  const ids = (await (await a.inject({ url: '/v1/me/identities', headers: h })).json()).identities.map((i) => i.id);
  const rs = await Promise.all(ids.map((id) => a.inject({ method: 'DELETE', url: `/v1/me/identities/${id}`, headers: h })));
  assert.deepEqual(rs.map((r) => r.statusCode).sort(), [200, 409]);
  assert.equal((await d.select().from(schema.identities).where(eq(schema.identities.userId, acc.userId))).length, 1);
});

test('Hai request nâng cấp ĐỒNG THỜI cùng khách: cùng Google => đúng một danh tính, cả hai cùng userId; Google khác => một 409', async () => {
  const g = await guest(a);
  const sub = `g-${randomUUID()}`;
  const [b1, b2] = await Promise.all([googleBody({ sub }), googleBody({ sub })]);
  const rs = await Promise.all([b1, b2].map((payload) => a.inject({ method: 'POST', url: '/v1/me/identities/google', headers: g.headers, payload })));
  for (const r of rs) {
    assert.ok(r.statusCode === 200 || (r.statusCode === 409 && r.json().error === 'identity_in_use'), r.body);
    if (r.statusCode === 200) assert.equal(r.json().userId, g.body.userId);
  }
  const d = await db();
  assert.equal((await d.select().from(schema.identities).where(eq(schema.identities.subject, sub))).length, 1);

  const g2 = await guest(a);
  const [c1, c2] = await Promise.all([googleBody(), googleBody()]);
  const rs2 = await Promise.all([c1, c2].map((payload) => a.inject({ method: 'POST', url: '/v1/me/identities/google', headers: g2.headers, payload })));
  assert.deepEqual(rs2.map((r) => r.statusCode).sort(), [200, 409]);
  const rows = await d.select().from(schema.identities).where(and(eq(schema.identities.userId, g2.body.userId), eq(schema.identities.provider, 'google')));
  assert.equal(rows.length, 1);
});

test('Hai máy cùng đăng nhập ĐỒNG THỜI bằng một Google mới => đúng một tài khoản', async () => {
  const sub = `g-${randomUUID()}`;
  const [b1, b2] = await Promise.all([googleBody({ sub }), googleBody({ sub })]);
  const rs = await Promise.all([b1, b2].map((payload) => a.inject({ method: 'POST', url: '/v1/auth/google', payload })));
  assert.deepEqual(rs.map((r) => r.statusCode), [200, 200]);
  assert.equal(rs[0].json().userId, rs[1].json().userId);
});

test('Tài khoản đang chờ xóa: đăng nhập Google => signed_in kèm restorable.deleteAt', async () => {
  const sub = `g-${randomUUID()}`;
  const acc = (await signIn({ sub })).json();
  const deleteAt = new Date(Date.now() + 20 * 24 * 3600 * 1000);
  await (await db()).update(schema.users).set({ deleteAt }).where(eq(schema.users.id, acc.userId));
  const r = (await signIn({ sub })).json();
  assert.equal(r.userId, acc.userId);
  assert.equal(r.restorable.deleteAt, deleteAt.toISOString());
});

test('Không tải được khóa công khai Google (mạng lỗi) => 503 provider_unavailable, không 500', async () => {
  const down = createGoogleIdentityProvider({ audiences: [CLIENT_ID], keys: async () => { throw new TypeError('fetch failed'); } });
  const b = await makeApp(LIMITS, { db: dbp, identity: down });
  try {
    const n = (await b.inject({ url: '/v1/auth/nonce' })).json().nonce;
    const r = await b.inject({ method: 'POST', url: '/v1/auth/google', payload: { nonce: n, idToken: await idToken({ nonce: n }) } });
    assert.equal(r.statusCode, 503);
    assert.equal(r.json().error, 'provider_unavailable');
  } finally {
    await b.close();
  }
});

test('Google trả lỗi HTTP khi tải khóa (JOSEError chung) => 503, không 401', async () => {
  const { errors } = await import('jose');
  const down = createGoogleIdentityProvider({ audiences: [CLIENT_ID], keys: async () => { throw new errors.JOSEError('Expected 200 OK from the JSON Web Key Set HTTP response'); } });
  const b = await makeApp(LIMITS, { db: dbp, identity: down });
  try {
    const n = (await b.inject({ url: '/v1/auth/nonce' })).json().nonce;
    const r = await b.inject({ method: 'POST', url: '/v1/auth/google', payload: { nonce: n, idToken: await idToken({ nonce: n }) } });
    assert.equal(r.statusCode, 503);
  } finally {
    await b.close();
  }
});

test('Nonce: không cache (no-store); nonce hết hạn => 401', async () => {
  const r = await a.inject({ url: '/v1/auth/nonce' });
  assert.equal(r.headers['cache-control'], 'no-store');
  const body = await googleBody();
  const d = await db();
  const { createHash } = await import('node:crypto');
  const h = createHash('sha256').update(body.nonce).digest('hex');
  await d.update(schema.authChallenges).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.authChallenges.keyHash, h));
  const res = await a.inject({ method: 'POST', url: '/v1/auth/google', payload: body });
  assert.equal(res.statusCode, 401);
});

test('Tài khoản chỉ có mật khẩu liên kết thêm Google => signed_in cùng userId, có cả hai phương thức', async () => {
  const d = await db();
  const g = await guest(a);
  const uname = `u${randomUUID().slice(0, 8)}`;
  // giả lập Task 2 đã nâng cấp khách thành tài khoản mật khẩu
  await d.update(schema.users).set({ isGuest: false }).where(eq(schema.users.id, g.body.userId));
  await d.insert(schema.identities).values({ userId: g.body.userId, provider: 'password', subject: uname, display: uname });
  const r = await link(g.headers);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().userId, g.body.userId);
  assert.deepEqual(r.json().providers.sort(), ['google', 'password']);
});

// ---------- Giao với Task 4 (xóa mềm 30 ngày / xóa cứng, PR #13) ----------
const DAY_MS = 24 * 3600 * 1000;

test('Google vào tài khoản ĐÃ QUÁ HẠN xóa (job dọn chưa chạy) => 401 invalid_credentials như /login, không tạo tài khoản mới', async () => {
  const sub = `g-${randomUUID()}`;
  const acc = (await signIn({ sub })).json();
  const d = await db();
  await d.update(schema.users).set({ deleteAt: new Date(Date.now() - 1000) }).where(eq(schema.users.id, acc.userId));
  const before = (await d.select({ id: schema.users.id }).from(schema.users)).length;
  const r = await signIn({ sub });
  assert.equal(r.statusCode, 401, r.body);
  assert.equal(r.json().error, 'invalid_credentials');
  assert.equal((await d.select({ id: schema.users.id }).from(schema.users)).length, before, 'không tạo user mới');
});

test('Khách bấm Google của tài khoản ĐÃ QUÁ HẠN xóa => 409 identity_in_use (không 401 để client khỏi tự gửi lại), khách còn nguyên', async () => {
  const sub = `g-${randomUUID()}`;
  const acc = (await signIn({ sub })).json();
  const d = await db();
  await d.update(schema.users).set({ deleteAt: new Date(Date.now() - 1000) }).where(eq(schema.users.id, acc.userId));
  const g = await guest(a);
  const r = await link(g.headers, { sub });
  assert.equal(r.statusCode, 409, r.body);
  assert.equal(r.json().error, 'identity_in_use');
  const [still] = await d.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, g.body.userId));
  assert.ok(still, 'khách không bị xóa');
});

test('Khách rỗng bấm Google của tài khoản ĐANG CHỜ xóa => signed_in tài khoản đó kèm restorable (như /login)', async () => {
  const sub = `g-${randomUUID()}`;
  const acc = (await signIn({ sub })).json();
  const deleteAt = new Date(Date.now() + 10 * DAY_MS);
  await (await db()).update(schema.users).set({ deleteAt }).where(eq(schema.users.id, acc.userId));
  const g = await guest(a);
  const r = await link(g.headers, { sub });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().userId, acc.userId);
  assert.equal(r.json().restorable.deleteAt, deleteAt.toISOString());
});

test('Tài khoản đã xóa mềm: liên kết/liệt kê/gỡ danh tính => 403 account_pending_deletion; quá hạn => 401 account_deleted', async () => {
  const g = await guest(a);
  const linked = await link(g.headers);
  assert.equal(linked.statusCode, 200, linked.body);
  const h = bearer(linked.json().accessToken);
  const ids = (await a.inject({ url: '/v1/me/identities', headers: h })).json().identities;
  const del = await a.inject({ method: 'DELETE', url: '/v1/me', headers: h, payload: { mode: 'grace' } });
  assert.equal(del.statusCode, 200, del.body);
  const calls = async () => [
    await a.inject({ method: 'POST', url: '/v1/me/identities/google', headers: h, payload: await googleBody() }),
    await a.inject({ url: '/v1/me/identities', headers: h }),
    await a.inject({ method: 'DELETE', url: `/v1/me/identities/${ids[0].id}`, headers: h })
  ];
  for (const r of await calls()) {
    assert.equal(r.statusCode, 403, r.body);
    assert.equal(r.json().error, 'account_pending_deletion');
  }
  await (await db()).update(schema.users).set({ deleteAt: new Date(Date.now() - 1000) }).where(eq(schema.users.id, g.body.userId));
  for (const r of await calls()) {
    assert.equal(r.statusCode, 401, r.body);
    assert.equal(r.json().error, 'account_deleted');
  }
});

test('Dịch vụ liên kết/gỡ tự từ chối người gọi đang chờ xóa (đua với DELETE /v1/me sau khi pipeline đã cho qua)', async () => {
  const { linkGoogle, unlinkIdentity } = await import('../dist/services/auth/link.js');
  const g = await guest(a);
  const linked = (await link(g.headers)).json();
  const d = await db();
  const [idRow] = await d.select({ id: schema.identities.id }).from(schema.identities).where(eq(schema.identities.userId, g.body.userId));
  await d.update(schema.users).set({ deleteAt: new Date(Date.now() + DAY_MS) }).where(eq(schema.users.id, linked.userId));
  const v = { subject: `g-${randomUUID()}`, emailMasked: null, emailVerified: true };
  assert.equal((await linkGoogle(d, linked.userId, v)).kind, 'pending_deletion');
  assert.equal((await unlinkIdentity(d, linked.userId, idRow.id)).kind, 'pending_deletion');
  const left = await d.select().from(schema.identities).where(eq(schema.identities.userId, linked.userId));
  assert.equal(left.length, 1, 'không thêm/không gỡ gì');
});

test('Xóa cứng (ngay, hoặc job dọn sau 30 ngày) => dọn cả danh tính Google; cùng Google đăng nhập lại => tài khoản MỚI', async () => {
  const { purgeExpiredAccounts } = await import('../dist/services/auth/lifecycle.js');
  const d = await db();
  // xóa ngay
  const sub1 = `g-${randomUUID()}`;
  const acc1 = (await signIn({ sub: sub1 })).json();
  const del = await a.inject({ method: 'DELETE', url: '/v1/me', headers: bearer(acc1.accessToken), payload: { mode: 'now' } });
  assert.equal(del.statusCode, 200, del.body);
  const gone1 = await d.select().from(schema.identities).where(and(eq(schema.identities.provider, 'google'), eq(schema.identities.subject, sub1)));
  assert.equal(gone1.length, 0, 'danh tính Google bị dọn khi xóa ngay');
  const again = (await signIn({ sub: sub1 })).json();
  assert.notEqual(again.userId, acc1.userId);
  // job dọn
  const sub2 = `g-${randomUUID()}`;
  const acc2 = (await signIn({ sub: sub2 })).json();
  await d.update(schema.users).set({ deleteAt: new Date(Date.now() - 1000) }).where(eq(schema.users.id, acc2.userId));
  await purgeExpiredAccounts(d, new Date());
  const gone2 = await d.select().from(schema.identities).where(eq(schema.identities.userId, acc2.userId));
  assert.equal(gone2.length, 0, 'danh tính Google bị dọn bởi job');
  const fresh = await signIn({ sub: sub2 });
  assert.equal(fresh.statusCode, 200, fresh.body);
  assert.notEqual(fresh.json().userId, acc2.userId);
});
