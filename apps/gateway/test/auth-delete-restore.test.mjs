import test from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { createDbProvider, schema } from '../dist/db/client.js';
import { purgeExpiredAccounts, restorableOf } from '../dist/services/auth/lifecycle.js';
import { makeApp, guest } from './helpers.mjs';

/**
 * Dự án 3 / Task 4: đăng xuất, xóa mềm 30 ngày, khôi phục, bia mộ, job dọn.
 * Mọi mốc thời gian dùng ĐỒNG HỒ GIẢ (`clock` tiêm vào buildApp) — không chờ thật.
 */
const DAY = 24 * 3600 * 1000;
// Lấy theo giờ thật lúc chạy: /auth/refresh dùng giờ thật, nên mốc cố định sẽ hỏng test khi lịch trôi qua
const T0 = new Date(Math.floor(Date.now() / 1000) * 1000);

async function setup() {
  const dbp = createDbProvider({ PGLITE_DIR: 'memory://' });
  const state = { now: new Date(T0) };
  const app = await makeApp({ AUTH_RATE_LIMIT_PER_MINUTE: '1000', RATE_LIMIT_PER_MINUTE: '1000' }, { db: dbp, clock: () => new Date(state.now) });
  const db = await dbp.get();
  const advance = (ms) => (state.now = new Date(state.now.getTime() + ms));
  const close = async () => {
    await app.close();
    await dbp.close();
  };
  return { app, db, state, advance, close };
}

const bearer = (t) => ({ authorization: `Bearer ${t}` });
/** Thứ mà đăng nhập (Task 2/3) sẽ cấp cho người đang chờ xóa: access token còn hạn, ký đúng */
const accessFor = (app, userId) => app.jwt.sign({ sub: userId, typ: 'access' }, { expiresIn: 900 });

// ---------- Xóa mềm ----------

test('DELETE /v1/me {mode:grace}: deleteAt = +30 ngày, thu hồi mọi refresh token, API thường bị khóa, dữ liệu còn nguyên', async () => {
  const { app, db, close } = await setup();
  try {
    const A = await guest(app);
    const B = (await app.inject({ method: 'POST', url: '/v1/auth/recover', payload: { recoveryCode: A.body.recoveryCode } })).json(); // máy 2
    const res = await app.inject({ method: 'DELETE', url: '/v1/me', headers: A.headers, payload: { mode: 'grace' } });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().deleteAt, new Date(T0.getTime() + 30 * DAY).toISOString());

    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, A.body.userId));
    assert.ok(u, 'chưa xóa cứng');
    assert.equal(u.deleteAt.toISOString(), res.json().deleteAt);
    const live = (await db.select().from(schema.refreshTokens).where(eq(schema.refreshTokens.userId, A.body.userId))).filter((t) => !t.revokedAt);
    assert.equal(live.length, 0, 'mọi refresh token bị thu hồi');

    // token cũ (cả hai máy) hết dùng; báo đúng lý do để client giữ dữ liệu và hỏi người dùng
    for (const rt of [A.body.refreshToken, B.refreshToken]) {
      const r = await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: rt } });
      assert.equal(r.statusCode, 401);
      assert.equal(r.json().error, 'account_pending_deletion');
    }
    // access token còn hạn: API thường trả account_pending_deletion (403), không phải 401
    const prefs = await app.inject({ url: '/v1/preferences', headers: A.headers });
    assert.equal(prefs.statusCode, 403);
    assert.equal(prefs.json().error, 'account_pending_deletion');
    // bấm xóa lần hai: giữ nguyên hạn đầu (không gia hạn)
    const again = await app.inject({ method: 'DELETE', url: '/v1/me', headers: bearer(accessFor(app, A.body.userId)), payload: { mode: 'grace' } });
    assert.equal(again.json().deleteAt, res.json().deleteAt);
  } finally {
    await close();
  }
});

test('Xóa mềm: ẩn khỏi bạn bè và mã mời bị hủy; khôi phục thì hiện lại', async () => {
  const { app, close } = await setup();
  try {
    const mai = await guest(app);
    const tom = await guest(app);
    const call = (h, method, url, payload) => app.inject({ method, url, headers: h, ...(payload ? { payload } : {}) });
    await call(mai.headers, 'PUT', '/v1/friends/profile', { displayName: 'Mai' });
    await call(tom.headers, 'PUT', '/v1/friends/profile', { displayName: 'Tom' });
    const code = (await call(mai.headers, 'POST', '/v1/friends/invite')).json().code;
    assert.equal((await call(tom.headers, 'POST', '/v1/friends/accept', { code })).statusCode, 200);
    assert.equal((await call(tom.headers, 'GET', '/v1/friends?today=2026-12-01')).json().friends.length, 1);

    await call(mai.headers, 'DELETE', '/v1/me', { mode: 'grace' });
    assert.equal((await call(tom.headers, 'GET', '/v1/friends?today=2026-12-01')).json().friends.length, 0, 'Mai ẩn khỏi danh sách của Tom');

    const restore = await call(bearer(accessFor(app, mai.body.userId)), 'POST', '/v1/me/restore');
    assert.equal(restore.statusCode, 200, restore.body);
    assert.equal((await call(tom.headers, 'GET', '/v1/friends?today=2026-12-01')).json().friends.length, 1, 'hiện lại nguyên vẹn');
  } finally {
    await close();
  }
});

test('Xóa không gửi thân (client cũ) giữ hành vi cũ: xóa cứng ngay, trả {deleted:true}', async () => {
  const { app, db, close } = await setup();
  try {
    const A = await guest(app);
    const res = await app.inject({ method: 'DELETE', url: '/v1/me', headers: A.headers });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().deleted, true);
    assert.equal(res.json().deleteAt, null);
    assert.equal((await db.select().from(schema.users).where(eq(schema.users.id, A.body.userId))).length, 0);
  } finally {
    await close();
  }
});

test('Thân sai (mode lạ) => 400, không xóa gì', async () => {
  const { app, db, close } = await setup();
  try {
    const A = await guest(app);
    const res = await app.inject({ method: 'DELETE', url: '/v1/me', headers: A.headers, payload: { mode: 'later' } });
    assert.equal(res.statusCode, 400);
    assert.equal((await db.select().from(schema.users).where(eq(schema.users.id, A.body.userId))).length, 1);
  } finally {
    await close();
  }
});

test('{mode:now}: xóa cứng ngay + bia mộ; người đang chờ xóa cũng "Xóa ngay" được', async () => {
  const { app, db, close } = await setup();
  try {
    const A = await guest(app);
    const res = await app.inject({ method: 'DELETE', url: '/v1/me', headers: A.headers, payload: { mode: 'now' } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().deleteAt, null);
    assert.equal((await db.select().from(schema.users).where(eq(schema.users.id, A.body.userId))).length, 0);
    const r = await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: A.body.refreshToken } });
    assert.equal(r.json().error, 'account_deleted');

    const B = await guest(app);
    await app.inject({ method: 'DELETE', url: '/v1/me', headers: B.headers, payload: { mode: 'grace' } });
    const now = await app.inject({ method: 'DELETE', url: '/v1/me', headers: bearer(accessFor(app, B.body.userId)), payload: { mode: 'now' } });
    assert.equal(now.statusCode, 200, now.body);
    assert.equal((await db.select().from(schema.users).where(eq(schema.users.id, B.body.userId))).length, 0);
  } finally {
    await close();
  }
});

// ---------- Khôi phục ----------

test('Khôi phục trong hạn: hết delete_at, API dùng lại được; hỏi lại trên người đang hoạt động là vô hại', async () => {
  const { app, db, advance, close } = await setup();
  try {
    const A = await guest(app);
    const del = await app.inject({ method: 'DELETE', url: '/v1/me', headers: A.headers, payload: { mode: 'grace' } });
    advance(29 * DAY + 23 * 3600 * 1000); // còn 1 giờ

    assert.deepEqual(await restorableOf(db, A.body.userId, new Date(T0.getTime() + 29 * DAY + 23 * 3600 * 1000)), { deleteAt: del.json().deleteAt });
    const h = bearer(accessFor(app, A.body.userId));
    const r = await app.inject({ method: 'POST', url: '/v1/me/restore', headers: h });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().deleteAt, null);
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, A.body.userId));
    assert.equal(u.deleteAt, null);
    assert.equal((await app.inject({ url: '/v1/preferences', headers: h })).statusCode, 200);
    assert.equal(await restorableOf(db, A.body.userId, new Date(T0.getTime() + 29 * DAY + 23 * 3600 * 1000)), null);
    // lần hai: không sao
    assert.equal((await app.inject({ method: 'POST', url: '/v1/me/restore', headers: h })).statusCode, 200);
    // thân khác {} (strict) => 400
    assert.equal((await app.inject({ method: 'POST', url: '/v1/me/restore', headers: h, payload: { x: 1 } })).statusCode, 400);
  } finally {
    await close();
  }
});

test('Token cấp lúc đăng nhập-để-khôi-phục: refresh khi đang chờ xóa => 401 pending, KHÔNG bị cháy; khôi phục xong dùng lại được', async () => {
  const { app, db, close } = await setup();
  try {
    const A = await guest(app);
    await app.inject({ method: 'DELETE', url: '/v1/me', headers: A.headers, payload: { mode: 'grace' } });
    const { issueTokens } = await import('../dist/services/auth/tokens.js');
    const t = await issueTokens(app, db, A.body.userId, new Date());
    const r1 = await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: t.refreshToken } });
    assert.equal(r1.statusCode, 401);
    assert.equal(r1.json().error, 'account_pending_deletion');
    assert.equal((await app.inject({ method: 'POST', url: '/v1/me/restore', headers: bearer(t.accessToken) })).statusCode, 200);
    const r2 = await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: t.refreshToken } });
    assert.equal(r2.statusCode, 200, r2.body);
  } finally {
    await close();
  }
});

test('Quá hạn 30 ngày mà job chưa chạy: API trả account_deleted, không khôi phục được nữa', async () => {
  const { app, db, advance, close } = await setup();
  try {
    const A = await guest(app);
    await app.inject({ method: 'DELETE', url: '/v1/me', headers: A.headers, payload: { mode: 'grace' } });
    const tok = accessFor(app, A.body.userId);
    advance(30 * DAY + 1000);
    const r = await app.inject({ method: 'POST', url: '/v1/me/restore', headers: bearer(tok) });
    assert.equal(r.statusCode, 401);
    assert.equal(r.json().error, 'account_deleted');
    assert.equal(await restorableOf(db, A.body.userId, new Date(T0.getTime() + 30 * DAY + 1000)), null);
  } finally {
    await close();
  }
});

// ---------- Job dọn ----------

test('Job dọn: chưa đủ 30 ngày không xóa; đủ hạn xóa cứng + bia mộ + giữ tên đăng nhập 30 ngày, trong cùng giao dịch', async () => {
  const { app, db, close } = await setup();
  try {
    const A = await guest(app);
    const keep = await guest(app);
    await db.insert(schema.identities).values({ userId: A.body.userId, provider: 'password', subject: 'mai.le', display: 'mai.le' });
    const recoveryHash = (await db.select().from(schema.users).where(eq(schema.users.id, A.body.userId)))[0].recoveryCodeHash;
    await app.inject({ method: 'DELETE', url: '/v1/me', headers: A.headers, payload: { mode: 'grace' } });
    const hashes = (await db.select().from(schema.refreshTokens).where(eq(schema.refreshTokens.userId, A.body.userId))).map((t) => t.tokenHash);

    // 29 ngày 23 giờ: chưa động tới
    assert.equal(await purgeExpiredAccounts(db, new Date(T0.getTime() + 30 * DAY - 3600e3)), 0);
    assert.equal((await db.select().from(schema.users).where(eq(schema.users.id, A.body.userId))).length, 1);

    const at = new Date(T0.getTime() + 30 * DAY);
    assert.equal(await purgeExpiredAccounts(db, at), 1);
    assert.equal((await db.select().from(schema.users).where(eq(schema.users.id, A.body.userId))).length, 0);
    assert.equal((await db.select().from(schema.users).where(eq(schema.users.id, keep.body.userId))).length, 1, 'người khác không bị đụng');
    assert.equal((await db.select().from(schema.identities).where(eq(schema.identities.subject, 'mai.le'))).length, 0, 'danh tính cascade');

    const [res] = await db.select().from(schema.reservedUsernames).where(eq(schema.reservedUsernames.username, 'mai.le'));
    assert.equal(res.until.toISOString(), new Date(at.getTime() + 30 * DAY).toISOString());

    const tombs = await db.select().from(schema.deletedAccounts);
    const rc = tombs.find((t) => t.credentialHash === recoveryHash);
    assert.equal(rc.reason, 'deleted');
    assert.equal(rc.expiresAt, null, 'hash mã khôi phục giữ mãi (không dọn)');
    for (const h of hashes) {
      const t = tombs.find((x) => x.credentialHash === h);
      assert.ok(t, 'refresh token vào bia mộ');
      assert.equal(t.expiresAt.toISOString(), new Date(at.getTime() + 90 * DAY).toISOString());
    }
    // Chạy lại: không có gì để làm, không lỗi
    assert.equal(await purgeExpiredAccounts(db, at), 0);

    // Máy cũ nhận account_deleted
    const r = await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: A.body.refreshToken } });
    assert.equal(r.json().error, 'account_deleted');
  } finally {
    await close();
  }
});

test('Dọn bia mộ theo expires_at (không theo deleted_at); null giữ mãi; tên đăng nhập giữ chỗ hết hạn thì thả', async () => {
  const { db, close } = await setup();
  try {
    const old = new Date('2020-01-01T00:00:00Z');
    await db.insert(schema.deletedAccounts).values([
      { credentialHash: 'forever', deletedAt: old, reason: 'deleted', expiresAt: null },
      { credentialHash: 'expired', deletedAt: old, reason: 'deleted', expiresAt: new Date(T0.getTime() - 1000) },
      { credentialHash: 'later', deletedAt: old, reason: 'upgraded', expiresAt: new Date(T0.getTime() + DAY) }
    ]);
    await db.insert(schema.reservedUsernames).values([
      { username: 'cu.cu', until: new Date(T0.getTime() - 1000) },
      { username: 'con.giu', until: new Date(T0.getTime() + DAY) }
    ]);
    await purgeExpiredAccounts(db, T0);
    const left = (await db.select().from(schema.deletedAccounts)).map((t) => t.credentialHash).sort();
    assert.deepEqual(left, ['forever', 'later']);
    assert.deepEqual((await db.select().from(schema.reservedUsernames)).map((r) => r.username), ['con.giu']);
  } finally {
    await close();
  }
});

// ---------- Đăng xuất + họ token ----------

test('POST /v1/auth/logout: thu hồi đúng token đó; máy khác vẫn dùng được; lặp lại/token lạ vẫn 204 (không lộ)', async () => {
  const { app, close } = await setup();
  try {
    const A = await guest(app);
    const B = (await app.inject({ method: 'POST', url: '/v1/auth/recover', payload: { recoveryCode: A.body.recoveryCode } })).json();
    const out = await app.inject({ method: 'POST', url: '/v1/auth/logout', payload: { refreshToken: A.body.refreshToken } });
    assert.equal(out.statusCode, 204);
    const r = await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: A.body.refreshToken } });
    assert.equal(r.statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: B.refreshToken } })).statusCode, 200, 'máy khác không bị đăng xuất');
    assert.equal((await app.inject({ method: 'POST', url: '/v1/auth/logout', payload: { refreshToken: A.body.refreshToken } })).statusCode, 204);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/auth/logout', payload: { refreshToken: 'x'.repeat(43) } })).statusCode, 204);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/auth/logout', payload: { refreshToken: 'ngan' } })).statusCode, 400);
  } finally {
    await close();
  }
});

test('logout {everywhere:true} thu hồi mọi họ token của người đó, không đụng người khác', async () => {
  const { app, close } = await setup();
  try {
    const A = await guest(app);
    const other = await guest(app);
    const B = (await app.inject({ method: 'POST', url: '/v1/auth/recover', payload: { recoveryCode: A.body.recoveryCode } })).json();
    const r = await app.inject({ method: 'POST', url: '/v1/auth/logout', payload: { refreshToken: A.body.refreshToken, everywhere: true } });
    assert.equal(r.statusCode, 204);
    for (const rt of [A.body.refreshToken, B.refreshToken]) {
      assert.equal((await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: rt } })).statusCode, 401);
    }
    assert.equal((await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: other.body.refreshToken } })).statusCode, 200);
  } finally {
    await close();
  }
});

test('logout {everywhere:true} bằng token ĐÃ XOAY VÒNG không đăng xuất máy khác (rà kien-truc RA-DOT2)', async () => {
  const { app, close } = await setup();
  try {
    const A = await guest(app);
    const B = (await app.inject({ method: 'POST', url: '/v1/auth/recover', payload: { recoveryCode: A.body.recoveryCode } })).json();
    await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: A.body.refreshToken } }); // token cũ của máy A
    const r = await app.inject({ method: 'POST', url: '/v1/auth/logout', payload: { refreshToken: A.body.refreshToken, everywhere: true } });
    assert.equal(r.statusCode, 204);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: B.refreshToken } })).statusCode, 200, 'máy B vẫn đăng nhập');
  } finally {
    await close();
  }
});

test('Xoay vòng giữ family_id; dùng lại token đã xoay => thu hồi cả họ (kể cả token mới)', async () => {
  const { app, db, close } = await setup();
  try {
    const A = await guest(app);
    const t1 = A.body.refreshToken;
    const t2 = (await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: t1 } })).json().refreshToken;
    const fam = (await db.select().from(schema.refreshTokens).where(eq(schema.refreshTokens.userId, A.body.userId))).map((t) => t.familyId);
    assert.equal(new Set(fam).size, 1, 'token xoay vòng cùng một họ');

    const reuse = await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: t1 } });
    assert.equal(reuse.statusCode, 401);
    const r2 = await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: t2 } });
    assert.equal(r2.statusCode, 401, 'token mới của họ bị thu hồi theo');
  } finally {
    await close();
  }
});

test('Họ token khác của cùng người (máy khác) không bị thu hồi khi một họ bị dùng lại', async () => {
  const { app, close } = await setup();
  try {
    const A = await guest(app);
    const B = (await app.inject({ method: 'POST', url: '/v1/auth/recover', payload: { recoveryCode: A.body.recoveryCode } })).json();
    const t2 = (await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: A.body.refreshToken } })).json().refreshToken;
    await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: A.body.refreshToken } }); // dùng lại => cả họ A chết
    assert.equal((await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: t2 } })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: B.refreshToken } })).statusCode, 200);
  } finally {
    await close();
  }
});
