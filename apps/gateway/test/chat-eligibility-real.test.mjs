import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDbProvider, schema } from '../dist/db/client.js';
import { clearChatEligibilityCache } from '../dist/services/social/eligibility.js';
import { InMemoryBus } from '../dist/services/realtime/RealtimeBus.js';
import { guest, makeApp } from './helpers.mjs';

/** Dự án 4 Task 4 — chat dùng cổng THẬT của Task 3 (không tiêm cổng giả): đủ 18 + bạn bè + không chặn mới nhắn được */
const dbp = createDbProvider({ PGLITE_DIR: 'memory://' });
const bus = new InMemoryBus();
let app;
before(async () => {
  app = await makeApp({ AUTH_RATE_LIMIT_PER_MINUTE: '1000', RATE_LIMIT_PER_MINUTE: '5000' }, { db: dbp, bus });
});
after(async () => {
  await app.close();
  await dbp.close();
});

const call = (u, method, url, payload) => app.inject({ method, url, headers: u.headers, ...(payload === undefined ? {} : { payload }) });

/** Người dùng thật trong DB: đã đăng ký, đã khai tuổi, có tên bạn bè (tuỳ chỉnh được để làm họ không đủ điều kiện) */
async function user(name, over = {}) {
  const g = await guest(app);
  const userId = g.body.userId;
  const db = await dbp.get();
  const o = { isGuest: false, isAdult: true, handle: `${name.toLowerCase()}_${userId.slice(0, 6)}`, ...over };
  await db
    .update(schema.users)
    .set({ isGuest: o.isGuest, isAdult: o.isAdult, ageDeclaredAt: o.isAdult === null ? null : new Date() })
    .where(eq(schema.users.id, userId));
  await db.insert(schema.socialProfiles).values({ userId, displayName: name, handle: o.handle });
  clearChatEligibilityCache();
  return { userId, headers: g.headers };
}
async function befriend(x, y) {
  const db = await dbp.get();
  const [a, b] = x.userId < y.userId ? [x.userId, y.userId] : [y.userId, x.userId];
  return (await db.insert(schema.friendships).values({ userA: a, userB: b }).returning({ id: schema.friendships.id }))[0].id;
}
const open = (u, fid) => call(u, 'POST', '/v1/chat/conversations', { peerFriendshipId: fid });
const send = (u, cid, body) => call(u, 'POST', `/v1/chat/conversations/${cid}/messages`, { clientMsgId: randomUUID(), kind: 'text', body });

test('Hai người bạn đủ 18, không chặn: một vòng mở cuộc, gửi, nhận, đọc, thu hồi', async () => {
  const a = await user('An');
  const b = await user('Binh');
  const fid = await befriend(a, b);
  const o = await open(a, fid);
  assert.equal(o.statusCode, 200, o.body);
  const cid = o.json().id;
  bus.clear();
  const s = await send(a, cid, 'Chào Bình, mình học tiếng Việt nhé');
  assert.equal(s.statusCode, 200, s.body);
  assert.equal(s.json().seq, 1);
  assert.equal(bus.framesFor(b.userId).filter((f) => f.t === 'msg').length, 1);
  const list = (await call(b, 'GET', `/v1/chat/conversations/${cid}/messages`)).json();
  assert.equal(list.messages[0].body, 'Chào Bình, mình học tiếng Việt nhé');
  assert.equal((await call(b, 'GET', '/v1/chat/conversations')).json().conversations[0].unread, 1);
  assert.equal((await call(b, 'POST', `/v1/chat/conversations/${cid}/read`, { seq: 1 })).statusCode, 204);
  assert.equal((await send(b, cid, 'Chào An')).json().seq, 2);
  assert.equal((await call(a, 'POST', `/v1/chat/messages/${s.json().id}/recall`)).statusCode, 204);
});

test('Cổng thật: khách, dưới 18, chưa khai tuổi, chưa có handle, bị khóa chat → từ chối đúng mã, không tạo cuộc', async () => {
  const peer = await user('Peer');
  const db = await dbp.get();
  const cases = [
    ['khách', { isGuest: true }, 'forbidden'],
    ['dưới 18 (đang khóa khai lại)', { isAdult: false }, 'adult_required'],
    ['chưa khai tuổi', { isAdult: null }, 'age_required'],
    ['chưa có handle', { handle: null }, 'handle_required']
  ];
  for (const [label, over, code] of cases) {
    const u = await user('X', over);
    const r = await open(u, await befriend(u, peer));
    assert.equal(r.json().error, code, label);
    assert.ok([403, 409].includes(r.statusCode), label);
  }
  const restricted = await user('Khoa');
  await db.insert(schema.chatRestrictions).values({ userId: restricted.userId, reason: 'test', until: new Date(Date.now() + 3600e3) });
  clearChatEligibilityCache();
  const r = await open(restricted, await befriend(restricted, peer));
  assert.equal(r.json().error, 'chat_restricted');
  assert.equal((await db.select().from(schema.conversations)).filter((c) => c.createdBy === restricted.userId).length, 0);
});

test('Cổng thật: người kia dưới 18 / khách / không là bạn / bị chặn → peer_unavailable, không tạo cuộc, không gửi được', async () => {
  const me = await user('Toi');
  const db = await dbp.get();
  const minor = await user('Nho', { isAdult: false });
  assert.equal((await open(me, await befriend(me, minor))).json().error, 'peer_unavailable');
  const guestPeer = await user('Khach', { isGuest: true });
  assert.equal((await open(me, await befriend(me, guestPeer))).json().error, 'peer_unavailable');
  const stranger = await user('La');
  const other = await user('Khac');
  assert.equal((await open(me, await befriend(stranger, other))).json().error, 'peer_unavailable', 'friendshipId không phải của mình');
  const friend = await user('Ban');
  const cid = (await open(me, await befriend(me, friend))).json().id;
  assert.equal((await send(me, cid, 'trước khi chặn')).statusCode, 200);
  await db.insert(schema.userBlocks).values({ blockerId: friend.userId, blockedId: me.userId });
  const r = await send(me, cid, 'sau khi bị chặn');
  assert.equal(r.statusCode, 404);
  assert.equal(r.json().error, 'peer_unavailable');
  const friend2 = await user('Ban2');
  const cid2 = (await open(me, await befriend(me, friend2))).json().id;
  await db.update(schema.users).set({ isAdult: false }).where(eq(schema.users.id, friend2.userId));
  clearChatEligibilityCache();
  assert.equal((await send(me, cid2, 'gửi cho người không đủ điều kiện')).json().error, 'peer_unavailable');
});
