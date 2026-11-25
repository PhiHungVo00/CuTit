import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { createDbProvider, schema } from '../dist/db/client.js';
import { sha256 } from '../dist/services/auth/tokens.js';
import { makeApp, guest } from './helpers.mjs';

/**
 * Dự án 3 Task 5 — gộp khách U_B vào tài khoản U_A (POST /v1/me/merge, M2 theo đề xuất A6.2(3)).
 * Mỗi bảng một test theo đúng luật gộp. Chạy thêm trên Postgres thật (đua thật, nhiều kết nối):
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55433/postgres pnpm --filter @vietlearning/gateway test
 */
const PG = process.env.TEST_DATABASE_URL;
const dbp = createDbProvider(PG ? { DATABASE_URL: PG, PGLITE_DIR: 'memory://' } : { PGLITE_DIR: 'memory://' });
const LIMITS = { AUTH_RATE_LIMIT_PER_MINUTE: '10000', RATE_LIMIT_PER_MINUTE: '10000' };

let a;
let clock = new Date();
before(async () => {
  a = await makeApp(LIMITS, { db: dbp, clock: () => clock });
});
after(async () => {
  await a.close();
  await dbp.close();
});

const db = () => dbp.get();
const bearer = (t) => ({ authorization: `Bearer ${t}` });
const { users, srsCards, srsReviews, xpEvents, dailyActivity, consents, aiUsage, syncEvents, authChallenges, deletedAccounts } = schema;

/** Tài khoản thật (đăng ký tên đăng nhập, không Bearer) */
async function account() {
  const username = `u_${randomBytes(5).toString('hex')}`;
  const r = await a.inject({ method: 'POST', url: '/v1/auth/register', payload: { username, password: `Mat-khau-${randomUUID()}` } });
  assert.equal(r.statusCode, 200, r.body);
  const body = r.json();
  return { ...body, headers: bearer(body.accessToken) };
}

/** Khách mới, trả cả userId */
async function newGuest() {
  const g = await guest(a);
  return { ...g.body, headers: g.headers };
}

/** Vé gộp như link.ts cấp (user_id = khách, subject = đích, 10 phút) */
async function ticket(guestId, targetId, { expiresAt = new Date(clock.getTime() + 600_000) } = {}) {
  const t = randomBytes(32).toString('base64url');
  await (await db()).insert(authChallenges).values({ kind: 'merge_ticket', keyHash: sha256(t), userId: guestId, subject: targetId, expiresAt });
  return t;
}

const merge = (headers, mergeTicket, strategy = 'merge') => a.inject({ method: 'POST', url: '/v1/me/merge', headers, payload: { mergeTicket, strategy } });

async function sync(headers, events) {
  const r = await a.inject({ method: 'POST', url: '/v1/sync', headers, payload: { events } });
  assert.equal(r.statusCode, 200, r.body);
  return r.json();
}
const ev = (body, at = '2026-11-20T08:00:00.000Z') => ({ clientEventId: randomUUID(), at, ...body });
const xp = (amount, day = '2026-11-20', extra = {}) => ev({ type: 'xp.add', source: 'path', amount, day, ...extra });
const card = (itemRef, front, at) => ev({ type: 'srs.upsert', card: { itemRef, front, back: 'b', source: 'drill', ease: 250, intervalDays: 1, repetitions: 1, dueAt: '2026-12-01T00:00:00.000Z' } }, at);

/** Khách có tiến độ + tài khoản đích + vé */
async function pair() {
  const A = await account();
  const B = await newGuest();
  await sync(B.headers, [xp(5)]);
  return { A, B, t: await ticket(B.userId, A.userId) };
}

const snap = async (headers) => (await sync(headers, [])).snapshot;

// ---------- Luồng chính ----------

test('Gộp thành công: trả token của tài khoản đích, khách bị xóa, vé dùng một lần', async () => {
  const { A, B, t } = await pair();
  const r = await merge(B.headers, t);
  assert.equal(r.statusCode, 200, r.body);
  const body = r.json();
  assert.equal(body.status, 'signed_in');
  assert.equal(body.isGuest, false);
  assert.equal(body.userId, A.userId);
  assert.equal((await snap(bearer(body.accessToken))).userId, A.userId);
  const [gone] = await (await db()).select().from(users).where(eq(users.id, B.userId));
  assert.equal(gone, undefined);
  // vé đã dùng (và mất theo khách) => gửi lại không được
  const again = await merge(B.headers, t);
  assert.notEqual(again.statusCode, 200);
});

test('Bia mộ "merged": refresh token và mã khôi phục cũ của khách => account_merged (không xóa dữ liệu máy)', async () => {
  const { B, t } = await pair();
  assert.equal((await merge(B.headers, t)).statusCode, 200);
  const rf = await a.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: B.refreshToken } });
  assert.equal(rf.statusCode, 401);
  assert.equal(rf.json().error, 'account_merged');
  const rc = await a.inject({ method: 'POST', url: '/v1/auth/recover', payload: { recoveryCode: B.recoveryCode } });
  assert.equal(rc.statusCode, 401);
  assert.equal(rc.json().error, 'account_merged');
  const tombs = await (await db()).select().from(deletedAccounts).where(eq(deletedAccounts.credentialHash, sha256(B.refreshToken)));
  assert.equal(tombs[0]?.reason, 'merged');
});

test('Vé sai / hết hạn / của khách khác => merge_ticket_invalid (409), không đổi dữ liệu', async () => {
  const A = await account();
  const B = await newGuest();
  await sync(B.headers, [xp(5)]);
  const bad = await merge(B.headers, randomBytes(32).toString('base64url'));
  assert.equal(bad.statusCode, 409);
  assert.equal(bad.json().error, 'merge_ticket_invalid');
  const expired = await ticket(B.userId, A.userId, { expiresAt: new Date(clock.getTime() - 1000) });
  assert.equal((await merge(B.headers, expired)).json().error, 'merge_ticket_invalid');
  const C = await newGuest();
  const other = await ticket(C.userId, A.userId);
  assert.equal((await merge(B.headers, other)).json().error, 'merge_ticket_invalid');
  assert.equal((await snap(B.headers)).xp.total, 5);
});

test('Tài khoản đích đang chờ xóa => từ chối account_pending_deletion (409), khách giữ nguyên, vé chưa tiêu', async () => {
  const { A, B, t } = await pair();
  const del = await a.inject({ method: 'DELETE', url: '/v1/me', headers: A.headers, payload: { mode: 'grace' } });
  assert.equal(del.statusCode, 200, del.body);
  const r = await merge(B.headers, t);
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().error, 'account_pending_deletion');
  assert.equal((await snap(B.headers)).xp.total, 5);
  const [row] = await (await db()).select().from(authChallenges).where(eq(authChallenges.keyHash, sha256(t)));
  assert.equal(row.consumedAt, null);
});

test('Người gọi không còn là khách (đã nâng cấp) => merge_ticket_invalid', async () => {
  const A = await account();
  const X = await account();
  const t = await ticket(X.userId, A.userId);
  const r = await merge(X.headers, t);
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().error, 'merge_ticket_invalid');
});

test('discard_device: bỏ tiến độ khách, đích không đổi, khách bị xóa với bia mộ merged', async () => {
  const { A, B, t } = await pair();
  await sync(A.headers, [xp(7)]);
  const r = await merge(B.headers, t, 'discard_device');
  assert.equal(r.statusCode, 200, r.body);
  assert.equal((await snap(A.headers)).xp.total, 7);
  const rf = await a.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: B.refreshToken } });
  assert.equal(rf.json().error, 'account_merged');
});

// ---------- Góp ý (dự án 5a) ----------

const FB_CTX = { appVersion: '0.9.0', build: 'abc', platform: 'android', osVersion: '15', locale: 'vi', route: '/p', recentRoutes: [] };
async function feedbackOf(userId, body) {
  const d = await db();
  const [fb] = await d.insert(schema.feedbackReports).values({ userId, kind: 'bug', body, context: FB_CTX }).returning();
  await d.insert(schema.feedbackFiles).values({ feedbackId: fb.id, blobKey: `feedback/${fb.id}/a.png`, media: 'image', contentType: 'image/png', bytes: 10 });
  await d.insert(schema.feedbackEvents).values({ feedbackId: fb.id, status: 'in_progress', message: 'Đang xem' });
  return fb.id;
}

for (const strategy of ['merge', 'discard_device']) {
  test(`Góp ý của khách chuyển sang tài khoản đích (${strategy}): kèm tệp và lời nhắn, không bị cascade xóa`, async () => {
    const { A, B, t } = await pair();
    const fbB = await feedbackOf(B.userId, 'Góp ý của khách trước khi gộp');
    const fbA = await feedbackOf(A.userId, 'Góp ý sẵn có của tài khoản thật');
    assert.equal((await merge(B.headers, t, strategy)).statusCode, 200);
    const d = await db();
    const mine = await d.select().from(schema.feedbackReports).where(eq(schema.feedbackReports.userId, A.userId));
    assert.deepEqual(mine.map((r) => r.id).sort(), [fbA, fbB].sort());
    assert.equal((await d.select().from(schema.feedbackFiles).where(eq(schema.feedbackFiles.feedbackId, fbB))).length, 1);
    assert.equal((await d.select().from(schema.feedbackEvents).where(eq(schema.feedbackEvents.feedbackId, fbB))).length, 1);
  });
}

// ---------- Từng bảng ----------

test('XP: cộng (xp_events chuyển sang, daily_activity.xp cộng)', async () => {
  const { A, B, t } = await pair(); // B: 5 XP ngày 20
  await sync(A.headers, [xp(7), xp(3, '2026-11-19')]);
  await sync(B.headers, [xp(10, '2026-11-18')]);
  assert.equal((await merge(B.headers, t)).statusCode, 200);
  const s = await snap(A.headers);
  assert.equal(s.xp.total, 25);
  assert.deepEqual(s.xp.byDay, { '2026-11-18': 10, '2026-11-19': 3, '2026-11-20': 12 });
  const rows = await (await db()).select().from(xpEvents).where(eq(xpEvents.userId, A.userId));
  assert.equal(rows.length, 4);
});

test('XP: sự kiện trùng client_event_id ở cả hai bên chỉ tính một lần', async () => {
  const { A, B, t } = await pair();
  const shared = xp(9);
  await sync(A.headers, [shared]);
  await sync(B.headers, [shared]);
  assert.equal((await merge(B.headers, t)).statusCode, 200);
  assert.equal((await snap(A.headers)).xp.total, 5 + 9);
});

test('Sổ chống trùng chép sang: gửi lại sự kiện cũ của khách vào tài khoản không cộng hai lần', async () => {
  const A = await account();
  const B = await newGuest();
  const old = xp(20);
  await sync(B.headers, [old, ev({ type: 'attempt.add', attempt: { skill: 'drill', correct: true, at: '2026-11-20T08:00:00.000Z' } })]);
  const t = await ticket(B.userId, A.userId);
  assert.equal((await merge(B.headers, t)).statusCode, 200);
  const res = await sync(A.headers, [old]);
  assert.deepEqual(res.duplicates, [old.clientEventId]);
  assert.equal(res.snapshot.xp.total, 20);
  const ledger = await (await db()).select().from(syncEvents).where(and(eq(syncEvents.userId, A.userId), eq(syncEvents.clientEventId, old.clientEventId)));
  assert.equal(ledger.length, 1);
});

test('seconds: lấy giá trị lớn hơn theo ngày; goal_met/freeze_used OR', async () => {
  const { A, B, t } = await pair();
  await sync(A.headers, [ev({ type: 'activity.set', day: '2026-11-20', seconds: 300 }), ev({ type: 'activity.set', day: '2026-11-19', seconds: 100 }), ev({ type: 'day.mark', day: '2026-11-19', goalMet: true })]);
  await sync(B.headers, [ev({ type: 'activity.set', day: '2026-11-20', seconds: 200 }), ev({ type: 'activity.set', day: '2026-11-19', seconds: 900 }), ev({ type: 'day.mark', day: '2026-11-20', freezeUsed: true })]);
  assert.equal((await merge(B.headers, t)).statusCode, 200);
  const s = await snap(A.headers);
  assert.deepEqual(s.activity, { '2026-11-19': 900, '2026-11-20': 300 });
  assert.deepEqual(s.dayFlags, { goalMet: ['2026-11-19'], frozen: ['2026-11-20'] });
});

test('Thẻ SRS: trùng item_ref giữ bản mới hơn; lịch sử ôn chuyển sang thẻ được giữ; thẻ riêng của khách chuyển sang', async () => {
  const { A, B, t } = await pair();
  await sync(A.headers, [card('k:new-on-A', 'A mới', '2026-11-20T10:00:00.000Z'), card('k:new-on-B', 'A cũ', '2026-11-19T10:00:00.000Z')]);
  await sync(B.headers, [card('k:new-on-A', 'B cũ', '2026-11-19T10:00:00.000Z'), card('k:new-on-B', 'B mới', '2026-11-20T10:00:00.000Z'), card('k:only-B', 'chỉ B', '2026-11-18T10:00:00.000Z')]);
  const d = await db();
  const bCards = await d.select().from(srsCards).where(eq(srsCards.userId, B.userId));
  await d.insert(srsReviews).values(bCards.map((c) => ({ cardId: c.id, quality: 4 })));
  const aCards = await d.select().from(srsCards).where(eq(srsCards.userId, A.userId));
  await d.insert(srsReviews).values(aCards.map((c) => ({ cardId: c.id, quality: 5 })));
  assert.equal((await merge(B.headers, t)).statusCode, 200);
  const s = await snap(A.headers);
  const byRef = Object.fromEntries(s.srs.map((c) => [c.itemRef, c.front]));
  assert.deepEqual(byRef, { 'k:new-on-A': 'A mới', 'k:new-on-B': 'B mới', 'k:only-B': 'chỉ B' });
  const kept = await d.select({ id: srsCards.id }).from(srsCards).where(eq(srsCards.userId, A.userId));
  const reviews = await d.select().from(srsReviews).where(sql`${srsReviews.cardId} in (${sql.join(kept.map((k) => sql`${k.id}`), sql`, `)})`);
  assert.equal(reviews.length, 5); // 3 của B + 2 của A, không mất lượt ôn nào
});

test('consents của đích không đổi (không chép đồng ý của khách)', async () => {
  const { A, B, t } = await pair();
  await sync(A.headers, [ev({ type: 'consent.grant', key: 'camera', version: '1' })]);
  await sync(B.headers, [ev({ type: 'consent.grant', key: 'voice', version: '2' })]);
  const before = await (await db()).select().from(consents).where(eq(consents.userId, A.userId));
  assert.equal((await merge(B.headers, t)).statusCode, 200);
  const afterRows = await (await db()).select().from(consents).where(eq(consents.userId, A.userId));
  assert.deepEqual(afterRows, before);
  assert.deepEqual((await snap(A.headers)).consents.map((c) => c.key), ['camera']);
});

test('ai_usage: cộng units theo (ngày, năng lực)', async () => {
  const { A, B, t } = await pair();
  const d = await db();
  await d.insert(aiUsage).values([
    { userId: A.userId, usageDayUtc: '2026-11-22', capability: 'turn', units: 4 },
    { userId: B.userId, usageDayUtc: '2026-11-22', capability: 'turn', units: 6 },
    { userId: B.userId, usageDayUtc: '2026-11-22', capability: 'tts', units: 100 }
  ]);
  assert.equal((await merge(B.headers, t)).statusCode, 200);
  const rows = await d.select().from(aiUsage).where(eq(aiUsage.userId, A.userId));
  const m = Object.fromEntries(rows.map((r) => [`${r.usageDayUtc}/${r.capability}`, r.units]));
  assert.deepEqual(m, { '2026-11-22/turn': 10, '2026-11-22/tts': 100 });
});

test('Hồ sơ/tùy chỉnh LWW; bài học completed thắng + best_score max; huy hiệu hợp; lessons_done max', async () => {
  const { A, B, t } = await pair();
  const prefs = (speed) => ({ voiceId: 'v', speed, dialect: 'south', correctionLevel: 'gentle', persona: 'be_cu_tit', uiLanguage: 'vi' });
  await sync(A.headers, [
    ev({ type: 'profile.set', profile: { onboarded: true, level: 2, goal: 'a', nativeLang: 'en', dialect: 'north' } }, '2026-11-19T00:00:00.000Z'),
    ev({ type: 'preferences.set', preferences: prefs(1.5) }, '2026-11-21T00:00:00.000Z'),
    ev({ type: 'lesson.progress', lessonId: 'l1', status: 'completed', score: 60 }),
    ev({ type: 'achievement.earn', key: 'first' }, '2026-11-15T00:00:00.000Z'),
    ev({ type: 'progress.set', lessonsDone: 9, freezes: 0, dailyGoal: 10 }, '2026-11-21T00:00:00.000Z')
  ]);
  await sync(B.headers, [
    ev({ type: 'profile.set', profile: { onboarded: true, level: 4, goal: 'b', nativeLang: 'en', dialect: 'central' } }, '2026-11-20T00:00:00.000Z'),
    ev({ type: 'preferences.set', preferences: prefs(0.75) }, '2026-11-20T00:00:00.000Z'),
    ev({ type: 'lesson.progress', lessonId: 'l1', status: 'started', score: 90 }),
    ev({ type: 'lesson.progress', lessonId: 'l2', status: 'completed', score: 70 }),
    ev({ type: 'achievement.earn', key: 'first' }, '2026-11-10T00:00:00.000Z'),
    ev({ type: 'achievement.earn', key: 'streak3' }),
    ev({ type: 'progress.set', lessonsDone: 12, freezes: 2, dailyGoal: 20 }, '2026-11-20T00:00:00.000Z')
  ]);
  assert.equal((await merge(B.headers, t)).statusCode, 200);
  const s = await snap(A.headers);
  assert.equal(s.profile.level, 4); // B mới hơn
  assert.equal(s.preferences.speed, 1.5); // A mới hơn
  const l = Object.fromEntries(s.lessons.map((x) => [x.lessonId, x]));
  assert.equal(l.l1.status, 'completed');
  assert.equal(l.l1.bestScore, 90);
  assert.equal(l.l2.status, 'completed');
  const ach = Object.fromEntries(s.achievements.map((x) => [x.key, x.earnedAt]));
  assert.equal(ach.first, '2026-11-10T00:00:00.000Z');
  assert.ok(ach.streak3);
  assert.deepEqual(s.progressState, { lessonsDone: 12, freezes: 0, dailyGoal: 10 }); // LWW theo A, riêng lessons_done = max
});

test('Lượt làm bài, phiên xếp lớp, phiên hội thoại chuyển sang đích', async () => {
  const { A, B, t } = await pair();
  await sync(B.headers, [ev({ type: 'attempt.add', attempt: { skill: 'drill', correct: true, at: '2026-11-20T08:00:00.000Z' } })]);
  const d = await db();
  const pid = randomUUID();
  await d.insert(schema.placementSessions).values({ id: pid, userId: B.userId, stateJson: {} });
  const [sess] = await d.insert(schema.sessions).values({ userId: B.userId }).returning({ id: schema.sessions.id });
  await d.insert(schema.messages).values({ sessionId: sess.id, role: 'user', text: 'xin chào' });
  assert.equal((await merge(B.headers, t)).statusCode, 200);
  assert.equal((await snap(A.headers)).attempts.length, 1);
  const [p] = await d.select().from(schema.placementSessions).where(eq(schema.placementSessions.id, pid));
  assert.equal(p.userId, A.userId);
  const [s] = await d.select().from(schema.sessions).where(eq(schema.sessions.id, sess.id));
  assert.equal(s.userId, A.userId);
  assert.equal((await d.select().from(schema.messages).where(eq(schema.messages.sessionId, sess.id))).length, 1);
});

test('Bạn bè: đổi U_B thành U_A, sắp lại user_a < user_b, bỏ cặp tự kết bạn, trùng cặp giữ dòng cũ hơn; social_profiles giữ của A', async () => {
  const { A, B, t } = await pair();
  const C = await newGuest();
  const D = await newGuest();
  const d = await db();
  const ord = (x, y) => (x < y ? { userA: x, userB: y } : { userA: y, userB: x });
  await d.insert(schema.friendships).values([
    { ...ord(A.userId, B.userId), createdAt: new Date('2026-11-01T00:00:00Z') }, // A–B: thành tự kết bạn => bỏ
    { ...ord(B.userId, C.userId), createdAt: new Date('2026-11-02T00:00:00Z') }, // B–C => A–C
    { ...ord(A.userId, D.userId), createdAt: new Date('2026-11-05T00:00:00Z'), goalMinutes: 30 },
    { ...ord(B.userId, D.userId), createdAt: new Date('2026-11-03T00:00:00Z'), goalMinutes: 90 } // trùng A–D, cũ hơn => giữ
  ]);
  await d.insert(schema.socialProfiles).values([
    { userId: A.userId, displayName: 'Mai' },
    { userId: B.userId, displayName: 'Khách' }
  ]);
  assert.equal((await merge(B.headers, t)).statusCode, 200);
  const rows = await d.select().from(schema.friendships).where(sql`${schema.friendships.userA} = ${A.userId} or ${schema.friendships.userB} = ${A.userId}`);
  const others = rows.map((r) => (r.userA === A.userId ? r.userB : r.userA)).sort();
  assert.deepEqual(others, [C.userId, D.userId].sort());
  for (const r of rows) assert.ok(r.userA < r.userB);
  const ad = rows.find((r) => r.userA === D.userId || r.userB === D.userId);
  assert.equal(ad.goalMinutes, 90);
  assert.equal(ad.createdAt.toISOString(), '2026-11-03T00:00:00.000Z');
  const [sp] = await d.select().from(schema.socialProfiles).where(eq(schema.socialProfiles.userId, A.userId));
  assert.equal(sp.displayName, 'Mai');
});

test('social_profiles: A chưa có => lấy của khách', async () => {
  const { A, B, t } = await pair();
  const d = await db();
  await d.insert(schema.socialProfiles).values({ userId: B.userId, displayName: 'Khách' });
  assert.equal((await merge(B.headers, t)).statusCode, 200);
  const [sp] = await d.select().from(schema.socialProfiles).where(eq(schema.socialProfiles.userId, A.userId));
  assert.equal(sp.displayName, 'Khách');
});

test('Mọi bảng có khóa ngoại tới users đều được merge.ts xử lý (thêm bảng mới mà quên => test đỏ)', async () => {
  const { HANDLED_USER_TABLES } = await import('../dist/services/auth/merge.js');
  const d = await db();
  const r = await d.execute(sql`
    select distinct cl.relname as t
    from pg_constraint c join pg_class cl on cl.oid = c.conrelid join pg_class ref on ref.oid = c.confrelid
    where c.contype = 'f' and ref.relname = 'users' and cl.relname <> 'users'`);
  const rows = Array.isArray(r) ? r : r.rows;
  const tables = rows.map((x) => x.t).sort();
  assert.deepEqual(tables, [...HANDLED_USER_TABLES].sort());
});

// ---------- Đồng thời ----------

test('Hai thiết bị gửi cùng một vé cùng lúc: đúng một lần thành công, XP cộng một lần', async () => {
  const { A, B, t } = await pair();
  await sync(A.headers, [xp(1)]);
  const rs = await Promise.all([merge(B.headers, t), merge(B.headers, t)]);
  const ok = rs.filter((r) => r.statusCode === 200);
  assert.equal(ok.length, 1, rs.map((r) => r.body).join(' | '));
  assert.equal((await snap(A.headers)).xp.total, 6);
});

test('Hai vé khác nhau của cùng khách (hai máy) gộp cùng lúc: một thành công, dữ liệu không nhân đôi', async () => {
  const A = await account();
  const B = await newGuest();
  await sync(B.headers, [xp(5)]);
  const t1 = await ticket(B.userId, A.userId);
  const t2 = await ticket(B.userId, A.userId);
  const rs = await Promise.all([merge(B.headers, t1), merge(B.headers, t2)]);
  assert.equal(rs.filter((r) => r.statusCode === 200).length, 1, rs.map((r) => r.body).join(' | '));
  assert.equal((await snap(A.headers)).xp.total, 5);
});

test('Hai khách gộp vào cùng một tài khoản cùng lúc: cả hai đúng', async () => {
  const A = await account();
  const B1 = await newGuest();
  const B2 = await newGuest();
  await sync(B1.headers, [xp(5), ev({ type: 'activity.set', day: '2026-11-20', seconds: 100 })]);
  await sync(B2.headers, [xp(8), ev({ type: 'activity.set', day: '2026-11-20', seconds: 400 })]);
  const [t1, t2] = [await ticket(B1.userId, A.userId), await ticket(B2.userId, A.userId)];
  const rs = await Promise.all([merge(B1.headers, t1), merge(B2.headers, t2)]);
  assert.deepEqual(rs.map((r) => r.statusCode), [200, 200], rs.map((r) => r.body).join(' | '));
  const s = await snap(A.headers);
  assert.equal(s.xp.total, 13);
  assert.equal(s.activity['2026-11-20'], 400);
});

test('Gộp đua với /v1/sync vào khách: sự kiện hoặc vào đích, hoặc bị từ chối — không bao giờ nhận rồi mất', async () => {
  for (let i = 0; i < 5; i++) {
    const { A, B, t } = await pair();
    const late = xp(100);
    const [m, s] = await Promise.all([merge(B.headers, t), a.inject({ method: 'POST', url: '/v1/sync', headers: B.headers, payload: { events: [late] } })]);
    assert.equal(m.statusCode, 200, m.body);
    const total = (await snap(A.headers)).xp.total;
    if (s.statusCode === 200 && s.json().accepted.includes(late.clientEventId)) assert.equal(total, 105, 'sync được nhận thì phải nằm trong đích');
    else assert.equal(total, 5);
  }
});
