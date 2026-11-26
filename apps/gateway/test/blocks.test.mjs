import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, or } from 'drizzle-orm';
import { schema } from '../dist/db/client.js';
import { isBlockedEitherWay } from '../dist/services/social/blocks.js';
import { clearChatEligibilityCache } from '../dist/services/social/eligibility.js';
import { befriend, boot, member } from './social-helpers.mjs';

/** Dự án 4 Task 3 — chặn: xóa bạn bè + nhiệm vụ chung, chặn kết bạn lại (lời mời và mã mời), bỏ chặn không tự kết bạn */
let ctx;
before(async () => {
  ctx = await boot();
});
after(() => ctx.close());

const { friendships, friendRequests, userBlocks } = schema;
const block = (u, target) => ctx.call(u, 'PUT', `/v1/chat/blocks/${target.userId}`);
const unblock = (u, target) => ctx.call(u, 'DELETE', `/v1/chat/blocks/${target.userId}`);
const send = (u, handle) => ctx.call(u, 'POST', '/v1/friends/requests', { handle });
const friendsOf = async (u) => (await ctx.call(u, 'GET', '/v1/friends?today=2026-11-26')).json().friends;
const pairRows = async (x, y) =>
  (await ctx.db()).select().from(friendships).where(or(and(eq(friendships.userA, x.userId), eq(friendships.userB, y.userId)), and(eq(friendships.userA, y.userId), eq(friendships.userB, x.userId))));

test('Chặn: xóa quan hệ bạn bè (và nhiệm vụ chung) của cả hai; mời kết bạn hai chiều → handle_not_found; bỏ chặn không tự kết bạn lại', async () => {
  const a = await member(ctx, 'Chan1');
  const b = await member(ctx, 'Bichan');
  await befriend(ctx, a, b);
  assert.equal((await friendsOf(a)).length, 1);

  const r = await block(a, b);
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json(), { blocked: true });
  assert.deepEqual(await friendsOf(a), []);
  assert.deepEqual(await friendsOf(b), []);
  assert.equal((await pairRows(a, b)).length, 0);

  assert.equal((await send(b, a.handle)).json().error, 'handle_not_found', 'người bị chặn mời người chặn');
  assert.equal((await send(a, b.handle)).json().error, 'handle_not_found', 'người chặn mời lại người bị chặn');

  assert.deepEqual((await unblock(a, b)).json(), { blocked: false });
  assert.equal((await pairRows(a, b)).length, 0, 'bỏ chặn không tự kết bạn lại');
  assert.equal((await send(b, a.handle)).statusCode, 200, 'bỏ chặn rồi thì mời được lại');
});

test('Chặn hủy lời mời đang chờ giữa hai người (hai chiều)', async () => {
  const a = await member(ctx, 'ChoChan1');
  const b = await member(ctx, 'ChoChan2');
  await send(a, b.handle);
  await block(b, a);
  const d = await ctx.db();
  const rows = await d.select().from(friendRequests).where(eq(friendRequests.fromUserId, a.userId));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'canceled');
  assert.deepEqual((await ctx.call(b, 'GET', '/v1/friends/requests')).json().requests, []);
});

test('Mã mời cũ giữa hai người đang chặn nhau → invite_invalid và mã còn nguyên cho người khác', async () => {
  const a = await member(ctx, 'MaChan1');
  const b = await member(ctx, 'MaChan2');
  const c = await member(ctx, 'MaChan3');
  await block(a, b);
  const inv = await ctx.call(a, 'POST', '/v1/friends/invite');
  const code = inv.json().code;
  const r = await ctx.call(b, 'POST', '/v1/friends/accept', { code });
  assert.equal(r.statusCode, 404);
  assert.equal(r.json().error, 'invite_invalid');
  assert.equal((await pairRows(a, b)).length, 0);
  assert.equal((await ctx.call(c, 'POST', '/v1/friends/accept', { code })).statusCode, 200, 'mã không bị tiêu');
  // chiều ngược lại: người bị chặn tạo mã, người chặn nhập
  const inv2 = await ctx.call(b, 'POST', '/v1/friends/invite');
  assert.equal((await ctx.call(a, 'POST', '/v1/friends/accept', { code: inv2.json().code })).json().error, 'invite_invalid');
});

test('Idempotent; chặn chính mình → 400; người không tồn tại → 404 handle_not_found; id sai kiểu → 400', async () => {
  const a = await member(ctx, 'Idem');
  const b = await member(ctx, 'Idem2');
  assert.equal((await block(a, b)).statusCode, 200);
  assert.equal((await block(a, b)).statusCode, 200);
  const d = await ctx.db();
  assert.equal((await d.select().from(userBlocks).where(eq(userBlocks.blockerId, a.userId))).length, 1);
  assert.equal((await unblock(a, b)).statusCode, 200);
  assert.equal((await unblock(a, b)).statusCode, 200);
  assert.equal((await block(a, a)).statusCode, 400);
  const ghost = await ctx.call(a, 'PUT', '/v1/chat/blocks/00000000-0000-4000-8000-000000000000');
  assert.equal(ghost.statusCode, 404);
  assert.equal(ghost.json().error, 'handle_not_found');
  assert.equal((await ctx.call(a, 'PUT', '/v1/chat/blocks/abc')).statusCode, 400);
  assert.equal((await ctx.app.inject({ method: 'PUT', url: `/v1/chat/blocks/${b.userId}` })).statusCode, 401);
});

test('Quyền: chặn chỉ ghi dưới tên người chặn; người bị chặn không thấy mình bị chặn; bỏ chặn của người khác không gỡ được', async () => {
  const a = await member(ctx, 'Q1');
  const b = await member(ctx, 'Q2');
  const c = await member(ctx, 'Q3');
  await block(a, b);
  await unblock(c, b); // c không có lệnh chặn nào: không đụng lệnh của a
  await unblock(b, a); // b không chặn a
  assert.equal(await isBlockedEitherWay(await ctx.db(), a.userId, b.userId), true);
  assert.equal(await isBlockedEitherWay(await ctx.db(), b.userId, a.userId), true, 'đối xứng khi dùng làm cổng');
  assert.equal(await isBlockedEitherWay(await ctx.db(), a.userId, c.userId), false);
  const rows = await (await ctx.db()).select().from(userBlocks).where(eq(userBlocks.blockedId, b.userId));
  assert.deepEqual(rows.map((r) => r.blockerId), [a.userId]);
});

test('Khách / dưới 18 / chưa khai tuổi không dùng được lệnh chặn', async () => {
  const ok = await member(ctx, 'Nan');
  const minor = await member(ctx, 'Nho', { birthYear: 2016, handle: null });
  const guestG = await member(ctx, 'Khach', { guest: true, age: false });
  assert.equal((await block(minor, ok)).json().error, 'adult_required');
  assert.equal((await block(guestG, ok)).statusCode, 403);
  assert.equal((await unblock(minor, ok)).statusCode, 403);
});

test('Đua "chặn" và "chấp nhận lời mời": kết quả cuối không bao giờ có cặp bạn bè đang bị chặn', async () => {
  for (let i = 0; i < 5; i++) {
    const a = await member(ctx, `Dua${i}a`);
    const b = await member(ctx, `Dua${i}b`);
    await send(a, b.handle);
    const id = (await ctx.call(b, 'GET', '/v1/friends/requests')).json().requests[0].id;
    await Promise.all([ctx.call(b, 'POST', `/v1/friends/requests/${id}/accept`), block(a, b)]);
    assert.equal(await isBlockedEitherWay(await ctx.db(), a.userId, b.userId), true);
    assert.equal((await pairRows(a, b)).length, 0, `vòng ${i}`);
  }
});

test('Người bị khóa chat hoặc chưa có handle vẫn chặn/bỏ chặn được để tự bảo vệ', async () => {
  const a = await member(ctx, 'BiKhoaChan');
  const b = await member(ctx, 'KeQuay');
  const noHandle = await member(ctx, 'ChuaHandle', { handle: null });
  await (await ctx.db()).insert(schema.chatRestrictions).values({ userId: a.userId, reason: 'x' });
  clearChatEligibilityCache();
  assert.equal((await block(a, b)).statusCode, 200);
  assert.equal((await unblock(a, b)).statusCode, 200);
  assert.equal((await block(noHandle, b)).statusCode, 200);
});
