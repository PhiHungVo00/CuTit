import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, or } from 'drizzle-orm';
import { schema } from '../dist/db/client.js';
import { clearChatEligibilityCache } from '../dist/services/social/eligibility.js';
import { befriend, boot, member, RUN } from './social-helpers.mjs';

/** Dự án 4 Task 3 — lời mời kết bạn bằng handle (spec 5.2): không dò người dùng, giới hạn, đua, quyền */
let ctx;
before(async () => {
  ctx = await boot();
});
after(() => ctx.close());

const { users, friendRequests, friendships, socialProfiles } = schema;
const send = (u, handle) => ctx.call(u, 'POST', '/v1/friends/requests', { handle });
const incoming = async (u) => (await ctx.call(u, 'GET', '/v1/friends/requests')).json().requests;
const friendsOf = async (u) => (await ctx.call(u, 'GET', '/v1/friends?today=2026-11-26')).json().friends;
const pairRows = async (x, y) =>
  (await ctx.db()).select().from(friendships).where(or(and(eq(friendships.userA, x.userId), eq(friendships.userB, y.userId)), and(eq(friendships.userA, y.userId), eq(friendships.userB, x.userId))));
const reqRows = async (x, y) =>
  (await ctx.db()).select().from(friendRequests).where(and(eq(friendRequests.fromUserId, x.userId), eq(friendRequests.toUserId, y.userId)));

test('Luồng chính: mời → người kia thấy tên hiển thị (không userId/handle) → chấp nhận → là bạn; chấp nhận lần hai → 404', async () => {
  const lan = await member(ctx, 'Lan');
  const tom = await member(ctx, 'Tom');
  const r = await send(lan, tom.handle.toUpperCase()); // hoa/thường không quan trọng
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json(), { status: 'pending' });

  const list = await incoming(tom);
  assert.equal(list.length, 1);
  assert.deepEqual(Object.keys(list[0]).sort(), ['createdAt', 'from', 'id']);
  assert.deepEqual(list[0].from, { displayName: 'Lan' });
  assert.doesNotMatch(JSON.stringify(list), new RegExp(lan.userId));
  assert.deepEqual(await incoming(lan), [], 'người gửi không thấy lời mời của chính mình ở hộp thư đến');

  const acc = await ctx.call(tom, 'POST', `/v1/friends/requests/${list[0].id}/accept`);
  assert.equal(acc.statusCode, 200, acc.body);
  assert.equal(acc.json().displayName, 'Lan');
  assert.equal(acc.json().questActive, true);
  assert.equal((await friendsOf(lan))[0].displayName, 'Tom');
  assert.equal((await pairRows(lan, tom)).length, 1);
  assert.deepEqual(await incoming(tom), []);
  assert.equal((await ctx.call(tom, 'POST', `/v1/friends/requests/${list[0].id}/accept`)).json().error, 'request_not_found');

  const again = await send(lan, tom.handle);
  assert.equal(again.statusCode, 409);
  assert.equal(again.json().error, 'already_friends');
});

test('Không dò người dùng: mọi lý do "không thấy" trả CÙNG một 404 handle_not_found, thân y hệt', async () => {
  const d = await ctx.db();
  const me = await member(ctx, 'Tho');
  const missing = 'khong.ton.tai' + RUN;
  const hidden = await member(ctx, 'An');
  await ctx.call(hidden, 'PUT', '/v1/chat/settings', { discoverable: false });
  const blocker = await member(ctx, 'ChanTa');
  await ctx.call(blocker, 'PUT', `/v1/chat/blocks/${me.userId}`);
  const iBlocked = await member(ctx, 'TaChan');
  await ctx.call(me, 'PUT', `/v1/chat/blocks/${iBlocked.userId}`);
  const pending = await member(ctx, 'ChoXoa');
  await d.update(users).set({ deleteAt: new Date('2026-12-20T00:00:00Z') }).where(eq(users.id, pending.userId));
  const minor = await member(ctx, 'Nho', { birthYear: 2016, handle: null });
  const guestG = await member(ctx, 'Khach', { guest: true, age: false });
  // khách/người dưới 18 có handle (dữ liệu cũ/đường tắt) vẫn không tìm thấy được
  for (const [u, h] of [[minor, 'be.nho'], [guestG, 'khach.ghe']]) {
    await d.update(socialProfiles).set({ handle: h + RUN }).where(eq(socialProfiles.userId, u.userId));
    u.handle = h + RUN;
  }
  const banned = await member(ctx, 'BiKhoa');
  await d.insert(schema.chatRestrictions).values({ userId: banned.userId, reason: 'x' });
  clearChatEligibilityCache();

  const targets = [missing, hidden.handle, blocker.handle, iBlocked.handle, pending.handle, minor.handle, guestG.handle, banned.handle, me.handle /* chính mình */];
  const bodies = [];
  for (const h of targets) {
    const r = await send(me, h);
    assert.equal(r.statusCode, 404, h);
    bodies.push(r.body);
  }
  assert.equal(new Set(bodies).size, 1, 'mọi thân trả lời phải giống hệt nhau');
  assert.equal(JSON.parse(bodies[0]).error, 'handle_not_found');
  assert.equal((await d.select().from(friendRequests).where(eq(friendRequests.fromUserId, me.userId))).length, 0, 'không để lại dấu vết');
});

test('11 tra cứu sai trong giờ → request_limit; sang giờ mới thì lại được; tra cứu đúng không bị tính', async () => {
  const me = await member(ctx, 'Doan');
  const ok = await member(ctx, 'Dung');
  for (let i = 0; i < 10; i++) assert.equal((await send(me, `sai.so${i}${RUN}`)).statusCode, 404);
  const r = await send(me, `sai.so10${RUN}`);
  assert.equal(r.statusCode, 429);
  assert.equal(r.json().error, 'request_limit');
  assert.equal((await send(me, ok.handle)).statusCode, 429, 'đã hết lượt tra cứu thì cả tra đúng cũng chờ');
  ctx.clock.now = new Date(ctx.clock.now.getTime() + 61 * 60_000);
  assert.equal((await send(me, ok.handle)).statusCode, 200);
  ctx.clock.now = new Date('2026-11-26T08:00:00Z');
});

test('21 lời mời trong ngày → request_limit; qua 24 giờ thì gửi tiếp được', async () => {
  const me = await member(ctx, 'Spam');
  const others = [];
  for (let i = 0; i < 21; i++) others.push(await member(ctx, `Nan${i}`));
  for (let i = 0; i < 20; i++) assert.equal((await send(me, others[i].handle)).statusCode, 200, `lời mời ${i + 1}`);
  const r = await send(me, others[20].handle);
  assert.equal(r.statusCode, 429);
  assert.equal(r.json().error, 'request_limit');
  assert.equal((await reqRows(me, others[20])).length, 0);
  ctx.clock.now = new Date(ctx.clock.now.getTime() + 25 * 3600_000);
  assert.equal((await send(me, others[20].handle)).statusCode, 200);
  ctx.clock.now = new Date('2026-11-26T08:00:00Z');
});

test('Mời trùng khi đang chờ: trả lời mời cũ, không tạo thêm dòng, không tốn hạn mức; mời đồng thời cũng chỉ một dòng', async () => {
  const a = await member(ctx, 'Trung1');
  const b = await member(ctx, 'Trung2');
  assert.equal((await send(a, b.handle)).json().status, 'pending');
  assert.equal((await send(a, b.handle)).json().status, 'pending');
  assert.equal((await reqRows(a, b)).length, 1);
  const c = await member(ctx, 'Trung3');
  await Promise.all([send(a, c.handle), send(a, c.handle), send(a, c.handle)]);
  assert.equal((await reqRows(a, c)).length, 1);
});

test('Hai lời mời chéo A→B và B→A (tuần tự hoặc đồng thời): thành bạn đúng một lần, không còn lời mời chờ', async () => {
  const a = await member(ctx, 'Cheo1');
  const b = await member(ctx, 'Cheo2');
  assert.equal((await send(a, b.handle)).json().status, 'pending');
  const r = await send(b, a.handle);
  assert.equal(r.json().status, 'accepted');
  assert.equal((await pairRows(a, b)).length, 1);
  assert.deepEqual(await incoming(a), []);
  assert.deepEqual(await incoming(b), []);

  const c = await member(ctx, 'Cheo3');
  const e = await member(ctx, 'Cheo4');
  const rs = await Promise.all([send(c, e.handle), send(e, c.handle)]);
  assert.ok(rs.every((x) => x.statusCode === 200), JSON.stringify(rs.map((x) => x.body)));
  assert.equal((await pairRows(c, e)).length, 1);
  const d = await ctx.db();
  const pend = await d.select().from(friendRequests).where(and(eq(friendRequests.status, 'pending'), or(eq(friendRequests.fromUserId, c.userId), eq(friendRequests.fromUserId, e.userId))));
  assert.equal(pend.length, 0);
});

test('Từ chối: lời mời xong; gửi lại được (dòng mới); người khác không trả lời hộ được', async () => {
  const a = await member(ctx, 'Tuchoi1');
  const b = await member(ctx, 'Tuchoi2');
  const c = await member(ctx, 'Nguoi3');
  await send(a, b.handle);
  const id = (await incoming(b))[0].id;
  assert.equal((await ctx.call(c, 'POST', `/v1/friends/requests/${id}/decline`)).json().error, 'request_not_found', 'người khác');
  assert.equal((await ctx.call(c, 'POST', `/v1/friends/requests/${id}/accept`)).json().error, 'request_not_found');
  assert.equal((await ctx.call(a, 'POST', `/v1/friends/requests/${id}/accept`)).json().error, 'request_not_found', 'người gửi tự chấp nhận');
  assert.equal((await ctx.call(b, 'POST', `/v1/friends/requests/${'00000000-0000-4000-8000-000000000000'}/decline`)).statusCode, 404);
  assert.equal((await ctx.call(b, 'POST', '/v1/friends/requests/khong-phai-uuid/decline')).statusCode, 400);
  assert.equal((await pairRows(a, b)).length, 0);

  const dec = await ctx.call(b, 'POST', `/v1/friends/requests/${id}/decline`);
  assert.deepEqual(dec.json(), { declined: true });
  assert.deepEqual(await incoming(b), []);
  assert.equal((await ctx.call(b, 'POST', `/v1/friends/requests/${id}/decline`)).json().error, 'request_not_found');
  assert.equal((await send(a, b.handle)).statusCode, 200);
  assert.equal((await reqRows(a, b)).length, 2);
});

test('Người dưới 18 / khách / chưa khai tuổi / chưa có handle: gửi, nhận, trả lời lời mời đều bị đóng', async () => {
  const ok = await member(ctx, 'Lon');
  const minor = await member(ctx, 'Nho', { birthYear: 2016, handle: null });
  const guestG = await member(ctx, 'Khach', { guest: true, age: false });
  const unknown = await member(ctx, 'Chua', { age: false, handle: null });
  const noHandle = await member(ctx, 'KhongHandle', { handle: null });
  const cases = [
    [minor, 'adult_required'],
    [guestG, 'forbidden'],
    [unknown, 'age_required'],
    [noHandle, 'handle_required']
  ];
  for (const [u, code] of cases) {
    const s = await send(u, ok.handle);
    assert.equal(s.json().error, code);
    assert.equal(s.statusCode >= 400, true);
    assert.equal((await ctx.call(u, 'GET', '/v1/friends/requests')).json().error, code);
    assert.equal((await ctx.call(u, 'POST', `/v1/friends/requests/${'00000000-0000-4000-8000-000000000000'}/accept`)).json().error, code);
  }
  assert.equal((await reqRows(minor, ok)).length, 0);
  assert.equal((await ctx.app.inject({ method: 'POST', url: '/v1/friends/requests', payload: { handle: 'abc' } })).statusCode, 401);
  assert.equal((await send(ok, 'ab')).statusCode, 400);
});

test('Người nhận đã có 50 lời mời chờ → người thứ 51 nhận cùng handle_not_found (không lộ)', async () => {
  const d = await ctx.db();
  const target = await member(ctx, 'Noitieng');
  const rows = await d.insert(users).values(Array.from({ length: 50 }, () => ({}))).returning({ id: users.id });
  await d.insert(friendRequests).values(rows.map((r) => ({ fromUserId: r.id, toUserId: target.userId })));
  const me = await member(ctx, 'Thu51');
  const r = await send(me, target.handle);
  const miss = await send(me, 'khong.co.ai' + RUN);
  assert.equal(r.statusCode, 404);
  assert.equal(r.body, miss.body);
});

test('Bạn thứ 6 vẫn là bạn nhưng questActive=false; bật khi đủ 5 → friend_limit; tắt một cái thì bật được; không đụng cặp người khác', async () => {
  const lan = await member(ctx, 'Lan6');
  const ids = [];
  for (let i = 0; i < 6; i++) ids.push(await befriend(ctx, await member(ctx, `Ban${i}`), lan));
  const list = await friendsOf(lan);
  assert.equal(list.length, 6);
  assert.deepEqual(list.map((f) => f.questActive), [true, true, true, true, true, false]);

  const full = await ctx.call(lan, 'POST', `/v1/friends/${ids[5]}/quest-active`, { questActive: true });
  assert.equal(full.statusCode, 409);
  assert.equal(full.json().error, 'friend_limit');
  assert.equal((await ctx.call(lan, 'POST', `/v1/friends/${ids[0]}/quest-active`, { questActive: false })).json().questActive, false);
  assert.equal((await ctx.call(lan, 'POST', `/v1/friends/${ids[5]}/quest-active`, { questActive: true })).json().questActive, true);
  assert.equal((await ctx.call(lan, 'POST', `/v1/friends/${ids[5]}/quest-active`, { questActive: true })).statusCode, 200, 'bật lại khi đã bật: idempotent');

  // quyền: không bật/tắt được quan hệ của người khác; id lạ / sai kiểu
  const stranger = await member(ctx, 'LaMat');
  const other = await ctx.call(stranger, 'POST', `/v1/friends/${ids[1]}/quest-active`, { questActive: false });
  assert.equal(other.statusCode, 404);
  assert.equal(other.json().error, 'friend_not_found');
  assert.equal((await ctx.call(lan, 'POST', `/v1/friends/${ids[1]}/quest-active`, { questActive: 'x' })).statusCode, 400);
  const [row] = await (await ctx.db()).select().from(friendships).where(eq(friendships.id, ids[1]));
  assert.equal(row.questActive, true);
});

test('Bên kia đã đủ 5 nhiệm vụ: cặp mới là bạn nhưng questActive=false', async () => {
  const busy = await member(ctx, 'Ban.ron');
  for (let i = 0; i < 5; i++) await befriend(ctx, await member(ctx, `Dong${i}`), busy);
  const fresh = await member(ctx, 'Moi.den');
  await befriend(ctx, fresh, busy);
  assert.equal((await friendsOf(fresh))[0].questActive, false);
  assert.equal((await friendsOf(busy)).filter((f) => f.questActive).length, 5);
});

test('Người gửi bị xóa/khóa sau khi mời: không chấp nhận được (request_not_found), không tạo bạn; bị ẩn khỏi hộp thư', async () => {
  const d = await ctx.db();
  const a = await member(ctx, 'Roi1');
  const b = await member(ctx, 'Roi2');
  await send(a, b.handle);
  const id = (await incoming(b))[0].id;
  await d.update(users).set({ deleteAt: new Date('2026-12-20T00:00:00Z') }).where(eq(users.id, a.userId));
  clearChatEligibilityCache();
  assert.deepEqual(await incoming(b), []);
  assert.equal((await ctx.call(b, 'POST', `/v1/friends/requests/${id}/accept`)).json().error, 'request_not_found');
  assert.equal((await pairRows(a, b)).length, 0);
});

test('Luồng mã mời cũ vẫn mở cho khách và người dưới 18 (không bị cổng tuổi chặn)', async () => {
  const minor = await member(ctx, 'Be', { birthYear: 2016, handle: null });
  const guestG = await member(ctx, 'Khach2', { guest: true, age: false });
  const inv = await ctx.call(minor, 'POST', '/v1/friends/invite');
  assert.equal(inv.statusCode, 200, inv.body);
  const acc = await ctx.call(guestG, 'POST', '/v1/friends/accept', { code: inv.json().code });
  assert.equal(acc.statusCode, 200, acc.body);
  assert.equal(acc.json().questActive, true);
});
