import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDbProvider, schema } from '../dist/db/client.js';
import { makeApp, guest } from './helpers.mjs';

/** GĐ4c — bạn học hợp tác: mã mời, nhiệm vụ tuần chung, streak chung, riêng tư, trẻ em, xóa tài khoản */
const dbp = createDbProvider({ PGLITE_DIR: 'memory://' });
let a;
before(async () => {
  a = await makeApp({ AUTH_RATE_LIMIT_PER_MINUTE: '1000', RATE_LIMIT_PER_MINUTE: '1000', FRIEND_INVITE_RATE_LIMIT_PER_MINUTE: '1000' }, { db: dbp });
});
after(async () => {
  await a.close();
  await dbp.close();
});

// Thứ Tư 2026-11-18 => tuần 2026-11-16 (T2) … 2026-11-22 (CN)
const TODAY = '2026-11-18';
const call = (headers, method, url, payload) => a.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) });
const list = (u, today = TODAY) => call(u.headers, 'GET', `/v1/friends?today=${today}`);
const setName = (u, displayName) => call(u.headers, 'PUT', '/v1/friends/profile', { displayName });
const invite = (u) => call(u.headers, 'POST', '/v1/friends/invite');
const accept = (u, code) => call(u.headers, 'POST', '/v1/friends/accept', { code });
const study = (u, day, minutes) =>
  call(u.headers, 'POST', '/v1/sync', { events: [{ clientEventId: randomUUID(), at: new Date().toISOString(), type: 'activity.set', day, seconds: minutes * 60 }] });

async function person(name) {
  const g = await guest(a);
  const u = { headers: g.headers, userId: g.body.userId };
  if (name) assert.equal((await setName(u, name)).statusCode, 200);
  return u;
}

async function befriend(x, y) {
  const code = (await invite(x)).json().code;
  const r = await accept(y, code);
  assert.equal(r.statusCode, 200, r.body);
  // Ghim ngày kết bạn trước tuần đang xét để test không phụ thuộc đồng hồ máy
  const db = await dbp.get();
  await db.update(schema.friendships).set({ createdAt: new Date('2026-11-01T00:00:00Z') }).where(eq(schema.friendships.id, r.json().id));
  return r.json();
}

test('Chưa có tên hiển thị: xem được danh sách rỗng, nhưng không tạo/nhập mã được', async () => {
  const u = await person();
  const r = await list(u);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json(), { displayName: null, invite: null, maxFriends: 5, friends: [] });
  assert.equal((await invite(u)).json().error, 'display_name_required');
  assert.equal((await invite(u)).statusCode, 409);
  assert.equal((await setName(u, 'http://spam.example')).statusCode, 400);
  assert.equal((await setName(u, '  Lan   Anh ')).json().displayName, 'Lan Anh');
});

test('Kết bạn bằng mã: dùng một lần, mã của mình không nhập được, đã là bạn thì không tiêu mã', async () => {
  const lan = await person('Lan');
  const tom = await person('Tom');
  const inv = (await invite(lan)).json();
  assert.match(inv.code, /^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  assert.ok(Date.parse(inv.expiresAt) > Date.now() + 47 * 3600e3);
  assert.deepEqual((await list(lan)).json().invite, inv);

  // Tạo mã mới thay mã cũ
  const inv2 = (await invite(lan)).json();
  assert.notEqual(inv2.code, inv.code);
  assert.equal((await accept(tom, inv.code)).json().error, 'invite_invalid');

  assert.equal((await accept(lan, inv2.code)).json().error, 'self_invite');
  const r = await accept(tom, inv2.code.toLowerCase().replace('-', ' '));
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().displayName, 'Lan');
  assert.equal((await list(lan)).json().invite, null, 'mã đã dùng thì hết');
  const reuse = await accept(await person('Mai'), inv2.code);
  assert.equal(reuse.statusCode, 404);
  assert.equal(reuse.json().error, 'invite_invalid');

  const inv3 = (await invite(lan)).json();
  const again = await accept(tom, inv3.code);
  assert.equal(again.statusCode, 409);
  assert.equal(again.json().error, 'already_friends');
  assert.deepEqual((await list(lan)).json().invite, inv3, 'lỗi thì mã còn nguyên');

  assert.equal((await list(tom)).json().friends[0].displayName, 'Lan');
  assert.equal((await list(lan)).json().friends[0].displayName, 'Tom');
});

test('Mã hết hạn => cùng lỗi invite_invalid', async () => {
  const lan = await person('Lan');
  const { code } = (await invite(lan)).json();
  const db = await dbp.get();
  await db.update(schema.friendInvites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.friendInvites.userId, lan.userId));
  const r = await accept(await person('Tom'), code);
  assert.equal(r.statusCode, 404);
  assert.equal(r.json().error, 'invite_invalid');
});

test('Nhiệm vụ tuần chung: cộng dồn phút của cả hai trong tuần, “mình” luôn đứng trước, không lộ userId', async () => {
  const lan = await person('Lan');
  const tom = await person('Tom');
  await befriend(lan, tom);
  await study(lan, '2026-11-16', 20);
  await study(tom, '2026-11-18', 45);
  await study(tom, '2026-11-15', 300); // Chủ nhật tuần trước: không tính
  await study(tom, '2026-11-23', 300); // tuần sau: không tính

  const body = (await list(lan)).json();
  const f = body.friends[0];
  assert.deepEqual(f.quest, {
    weekStart: '2026-11-16',
    weekEnd: '2026-11-22',
    goalMinutes: 60,
    totalMinutes: 65,
    completed: true,
    members: [
      { displayName: 'Lan', minutes: 20, me: true },
      { displayName: 'Tom', minutes: 45, me: false }
    ],
    streakWeeks: 2 // tuần trước Tom học 300 phút => cũng đạt
  });
  const tomView = (await list(tom)).json().friends[0].quest;
  assert.deepEqual(tomView.members.map((m) => [m.displayName, m.me]), [['Tom', true], ['Lan', false]]);
  assert.equal(tomView.totalMinutes, 65);

  // Riêng tư: không có id người dùng, lỗi, điểm, XP của bạn trong phản hồi
  const raw = (await list(lan)).body;
  assert.ok(!raw.includes(tom.userId) && !raw.includes(lan.userId));
  assert.ok(!/score|accuracy|attempt|xp/i.test(raw));
});

test('Đổi mục tiêu tuần: cả hai cùng thấy; chỉ người trong cặp mới đổi/xóa được', async () => {
  const lan = await person('Lan');
  const tom = await person('Tom');
  const mai = await person('Mai');
  const { id } = await befriend(lan, tom);
  await study(lan, TODAY, 70);
  assert.equal((await list(tom)).json().friends[0].quest.completed, true);

  assert.equal((await call(tom.headers, 'PUT', `/v1/friends/${id}/goal`, { goalMinutes: 45 })).statusCode, 400);
  const r = await call(tom.headers, 'PUT', `/v1/friends/${id}/goal`, { goalMinutes: 90 });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().quest.goalMinutes, 90);
  const q = (await list(lan)).json().friends[0].quest;
  assert.equal(q.goalMinutes, 90);
  assert.equal(q.completed, false);
  assert.equal(q.streakWeeks, 0);

  const other = await call(mai.headers, 'PUT', `/v1/friends/${id}/goal`, { goalMinutes: 30 });
  assert.equal(other.statusCode, 404);
  assert.equal(other.json().error, 'friend_not_found');
  assert.equal((await call(mai.headers, 'DELETE', `/v1/friends/${id}`)).statusCode, 404);
});

test('Streak chung: tuần liên tiếp cùng đạt, chỉ tính từ tuần kết bạn, tuần này chưa đạt thì tính tới tuần trước', async () => {
  const lan = await person('Lan');
  const tom = await person('Tom');
  const { id } = await befriend(lan, tom);
  const db = await dbp.get();
  // Kết bạn từ Thứ Năm 2026-10-22 (tuần 19/10)
  await db.update(schema.friendships).set({ createdAt: new Date('2026-10-22T10:00:00Z') }).where(eq(schema.friendships.id, id));
  await study(lan, '2026-10-13', 60); // trước khi kết bạn: không tính
  await study(lan, '2026-10-20', 30); // tuần 19/10: 30 + 30 = 60 ✓
  await study(tom, '2026-10-25', 30);
  await study(lan, '2026-10-27', 10); // tuần 26/10: 10 + 10 = 20 ✗
  await study(tom, '2026-10-28', 10);
  await study(tom, '2026-11-03', 60); // tuần 02/11 ✓
  await study(lan, '2026-11-12', 40); // tuần 09/11: 40 + 25 ✓
  await study(tom, '2026-11-15', 25);

  assert.equal((await list(lan)).json().friends[0].quest.streakWeeks, 2, 'tuần này chưa đạt: 02/11 + 09/11');
  await study(tom, TODAY, 60);
  assert.equal((await list(lan)).json().friends[0].quest.streakWeeks, 3);
  // Nhìn từ tuần 26/10: tuần đó chưa đạt => streak = tuần 19/10 = 1 (tuần 12/10 trước khi kết bạn)
  assert.equal((await list(tom, '2026-10-29')).json().friends[0].quest.streakWeeks, 1);
});

test('Tối đa 5 bạn mỗi người; vượt giới hạn => friend_limit và mã không bị tiêu', async () => {
  const lan = await person('Lan');
  for (let i = 0; i < 5; i++) await befriend(await person(`Bạn ${i}`), lan);
  const extra = await person('Thừa');
  const { code } = (await invite(extra)).json();
  const r = await accept(lan, code);
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().error, 'friend_limit');
  const r2 = await accept(await person('Khác'), code);
  assert.equal(r2.statusCode, 200, 'mã vẫn dùng được cho người khác');
  // Phía người mời đầy cũng bị chặn
  const { code: lanCode } = (await invite(lan)).json();
  assert.equal((await accept(await person('Mới'), lanCode)).json().error, 'friend_limit');
});

test('Hủy kết bạn: cả hai không còn thấy nhau, kết bạn lại được', async () => {
  const lan = await person('Lan');
  const tom = await person('Tom');
  const { id } = await befriend(lan, tom);
  const r = await call(tom.headers, 'DELETE', `/v1/friends/${id}`);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json(), { removed: true });
  assert.deepEqual((await list(lan)).json().friends, []);
  assert.deepEqual((await list(tom)).json().friends, []);
  await befriend(tom, lan);
  assert.equal((await list(lan)).json().friends.length, 1);
});

test('Tài khoản trẻ em: mọi route bạn bè trả 403 social_not_allowed', async () => {
  const kid = await person();
  const lan = await person('Lan');
  const db = await dbp.get();
  await db.update(schema.users).set({ accountType: 'child' }).where(eq(schema.users.id, kid.userId));
  const { code } = (await invite(lan)).json();
  for (const r of [await list(kid), await setName(kid, 'Bé'), await invite(kid), await accept(kid, code)]) {
    assert.equal(r.statusCode, 403);
    assert.equal(r.json().error, 'social_not_allowed');
  }
  assert.deepEqual((await list(lan)).json().invite.code, code, 'mã của người lớn không bị tiêu');
});

test('Xóa tài khoản: quan hệ bạn bè, mã mời, tên hiển thị và đóng góp biến mất (cascade)', async () => {
  const lan = await person('Lan');
  const tom = await person('Tom');
  await befriend(lan, tom);
  await study(lan, TODAY, 50);
  await invite(lan);
  assert.equal((await call(lan.headers, 'DELETE', '/v1/me')).statusCode, 200);

  assert.deepEqual((await list(tom)).json().friends, []);
  const db = await dbp.get();
  assert.equal((await db.select().from(schema.friendInvites).where(eq(schema.friendInvites.userId, lan.userId))).length, 0);
  assert.equal((await db.select().from(schema.socialProfiles).where(eq(schema.socialProfiles.userId, lan.userId))).length, 0);
  assert.equal((await db.select().from(schema.friendships).where(eq(schema.friendships.userA, lan.userId))).length, 0);
  assert.equal((await db.select().from(schema.friendships).where(eq(schema.friendships.userB, lan.userId))).length, 0);
  assert.equal((await db.select().from(schema.dailyActivity).where(eq(schema.dailyActivity.userId, lan.userId))).length, 0);
});

test('Rate limit riêng cho tạo/nhập mã mời (không ảnh hưởng xem danh sách)', async () => {
  const app = await makeApp({ FRIEND_INVITE_RATE_LIMIT_PER_MINUTE: '2', AUTH_RATE_LIMIT_PER_MINUTE: '100' }, { db: dbp });
  try {
    const g = await guest(app);
    const h = g.headers;
    await app.inject({ method: 'PUT', url: '/v1/friends/profile', headers: h, payload: { displayName: 'Lan' } });
    const inv = () => app.inject({ method: 'POST', url: '/v1/friends/invite', headers: h });
    const acc = () => app.inject({ method: 'POST', url: '/v1/friends/accept', headers: h, payload: { code: 'ABCD-EFGH' } });
    assert.equal((await inv()).statusCode, 200);
    assert.equal((await inv()).statusCode, 200);
    assert.equal((await inv()).statusCode, 429);
    assert.equal((await acc()).statusCode, 404);
    assert.equal((await acc()).statusCode, 404);
    assert.equal((await acc()).statusCode, 429, 'đoán mã bị chặn');
    assert.equal((await app.inject({ method: 'GET', url: '/v1/friends', headers: h })).statusCode, 200);
  } finally {
    await app.close();
  }
});
