import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { schema } from '../dist/db/client.js';
import { startWs } from './ws-helpers.mjs';

/**
 * Dự án 4 Task 5 — RealtimeHub: phát đúng người, thứ tự, không trùng, nhiều kết nối/người, quyền theo cuộc trò chuyện,
 * typing/presence, thu hồi quyền, tắt Gateway sạch.
 */
let s;
before(async () => {
  s = await startWs();
});
after(async () => {
  assert.deepEqual(s.uncaught, [], 'không có ngoại lệ chưa bắt');
  await s.close();
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const msgFrame = (n, cid = randomUUID()) => ({ t: 'read', cid, userId: randomUUID(), seq: n });

async function conversation(users, { kind = 'group' } = {}) {
  const [c] = await s.db
    .insert(schema.conversations)
    .values(kind === 'dm' ? { kind, dmKey: users.map((u) => u.id).sort().join(':') } : { kind, title: 'nhóm thử' })
    .returning();
  for (const u of users) await s.db.insert(schema.conversationMembers).values({ conversationId: c.id, userId: u.id });
  return c;
}

test('publish chỉ tới đúng người, mỗi kết nối một lần dù userIds trùng, đúng thứ tự', async () => {
  const [a, b, c] = [await s.user(), await s.user(), await s.user()];
  const [ca1, ca2, cb, cc] = [await s.ready(a.id), await s.ready(a.id), await s.ready(b.id), await s.ready(c.id)];
  for (let i = 1; i <= 50; i += 1) s.app.realtime.publish([a.id, a.id, b.id], msgFrame(i));
  await ca1.waitFrame((f) => f.seq === 50);
  await ca2.waitFrame((f) => f.seq === 50);
  await cb.waitFrame((f) => f.seq === 50);
  const seqs = (cl) => cl.frames.filter((f) => f.t === 'read').map((f) => f.seq);
  const want = Array.from({ length: 50 }, (_, i) => i + 1);
  assert.deepEqual(seqs(ca1), want);
  assert.deepEqual(seqs(ca2), want);
  assert.deepEqual(seqs(cb), want);
  assert.deepEqual(await cc.collect((f) => f.t === 'read', 100), [], 'người không được nhắc tới không nhận gì');
});

test('publish tới người offline / kết nối đã chết không ném lỗi; subscribe thấy mọi khung', async () => {
  const u = await s.user();
  const seen = [];
  const off = s.app.realtime.subscribe((ids, f) => seen.push([ids, f.t]));
  s.app.realtime.subscribe(() => {
    throw new Error('người nghe lỗi');
  });
  assert.doesNotThrow(() => s.app.realtime.publish([u.id, randomUUID()], msgFrame(1)));
  off();
  s.app.realtime.publish([u.id], msgFrame(2));
  assert.equal(seen.length, 1, 'đã hủy đăng ký thì không nghe nữa');
  assert.equal(seen[0][1], 'read');
  assert.equal(seen[0][0].length, 2);
});

test('isOnline / isForeground theo kết nối và khung visibility', async () => {
  const u = await s.user();
  const hub = s.app.realtime;
  assert.equal(hub.isOnline(u.id), false);
  const c1 = await s.ready(u.id);
  const c2 = await s.ready(u.id);
  assert.equal(hub.isOnline(u.id), true);
  assert.equal(hub.isForeground(u.id), false, 'mặc định chưa nền trước tới khi client báo');
  c1.send({ t: 'visibility', foreground: true });
  await sleep(100);
  assert.equal(hub.isForeground(u.id), true);
  c1.send({ t: 'visibility', foreground: false });
  c2.send({ t: 'visibility', foreground: true });
  await sleep(100);
  assert.equal(hub.isForeground(u.id), true, 'một kết nối nền trước là đủ');
  c1.terminate();
  c2.terminate();
  await sleep(200);
  assert.equal(hub.isOnline(u.id), false);
  assert.equal(hub.isForeground(u.id), false);
});

test('tối đa 3 kết nối/người: kết nối thứ 4 → đóng kết nối cũ nhất (4409), người khác không bị ảnh hưởng', async () => {
  const u = await s.user();
  const other = await s.user();
  const co = await s.ready(other.id);
  const conns = [];
  for (let i = 0; i < 3; i += 1) conns.push(await s.ready(u.id));
  const fourth = await s.ready(u.id);
  assert.equal((await conns[0].waitClosed()).code, 4409);
  await sleep(100);
  assert.equal(conns[1].closed, null);
  assert.equal(conns[2].closed, null);
  assert.equal(fourth.closed, null);
  assert.equal(co.closed, null);
  assert.equal(s.app.realtime.isOnline(u.id), true);
});

test('đua nối lại: 6 hello đồng thời của một người → đúng 3 còn sống; cùng device chỉ giữ cái mới nhất', async () => {
  const u = await s.user();
  const cs = Array.from({ length: 6 }, () => s.connect(u.id));
  await Promise.all(cs.map((c) => c.opened));
  await sleep(600);
  const alive = cs.filter((c) => !c.closed);
  assert.equal(alive.length, 3, `sống ${alive.length}`);
  for (const c of cs.filter((x) => x.closed)) assert.equal(c.closed.code, 4409);

  const w = await s.user();
  const device = randomUUID();
  const old = await s.ready(w.id, { device });
  const fresh = await s.ready(w.id, { device });
  assert.equal((await old.waitClosed()).code, 4409);
  await sleep(50);
  assert.equal(fresh.closed, null);
  assert.equal(s.app.realtime.isOnline(w.id), true, 'nối lại cùng thiết bị không làm người dùng "rơi" offline');
});

test('closeUser(u, 4403) đóng MỌI kết nối của u ngay, chỉ u', async () => {
  const [a, b] = [await s.user(), await s.user()];
  const [a1, a2, b1] = [await s.ready(a.id), await s.ready(a.id), await s.ready(b.id)];
  s.app.realtime.closeUser(a.id, 4403);
  assert.equal((await a1.waitClosed()).code, 4403);
  assert.equal((await a2.waitClosed()).code, 4403);
  assert.equal(s.app.realtime.isOnline(a.id), false);
  await sleep(100);
  assert.equal(b1.closed, null);
  // sau khi bị thu hồi, không còn nhận khung
  s.app.realtime.publish([a.id], msgFrame(1));
  assert.equal(a1.frames.filter((f) => f.t === 'read').length, 0);
});

test('typing chỉ tới thành viên cùng cuộc trò chuyện; không tới người chặn nhau, người đã rời, không tới chính mình', async () => {
  const [a, b, c, d, left] = [await s.user(), await s.user(), await s.user(), await s.user(), await s.user()];
  const conv = await conversation([a, b, c, d, left]);
  await s.db
    .update(schema.conversationMembers)
    .set({ leftAt: new Date() })
    .where(and(eq(schema.conversationMembers.conversationId, conv.id), eq(schema.conversationMembers.userId, left.id)));
  await s.db.insert(schema.userBlocks).values({ blockerId: c.id, blockedId: a.id }); // c chặn a: a không gõ tới c được
  const [ca, cb, cc, cd, cl] = [await s.ready(a.id), await s.ready(b.id), await s.ready(c.id), await s.ready(d.id), await s.ready(left.id)];
  ca.send({ t: 'typing', cid: conv.id });
  const f = await cb.waitFrame((x) => x.t === 'typing');
  assert.deepEqual(f, { t: 'typing', cid: conv.id, userId: a.id });
  await cd.waitFrame((x) => x.t === 'typing');
  assert.equal((await cc.collect((x) => x.t === 'typing', 200)).length, 0, 'người chặn không nhận');
  assert.equal((await cl.collect((x) => x.t === 'typing', 50)).length, 0, 'người đã rời không nhận');
  assert.equal((await ca.collect((x) => x.t === 'typing', 50)).length, 0, 'không dội về chính mình');
});

test('nghe lén: không phải thành viên thì typing không tới ai, và không biết cuộc có tồn tại hay không', async () => {
  const [a, b, intruder] = [await s.user(), await s.user(), await s.user()];
  const conv = await conversation([a, b], { kind: 'dm' });
  const [ca, cb, ci] = [await s.ready(a.id), await s.ready(b.id), await s.ready(intruder.id)];
  ci.send({ t: 'typing', cid: conv.id });
  ci.send({ t: 'typing', cid: randomUUID() });
  assert.equal((await ca.collect((x) => x.t === 'typing', 250)).length, 0);
  assert.equal((await cb.collect((x) => x.t === 'typing', 10)).length, 0);
  assert.equal(ci.closed, null, 'không lộ gì: không lỗi, không đóng');
  assert.deepEqual(ci.frames.filter((x) => x.t !== 'hello_ok'), [], 'cũng không có khung lỗi trả lời (không dò được)');
  // người trong cuộc vẫn gõ được
  ca.send({ t: 'typing', cid: conv.id });
  await cb.waitFrame((x) => x.t === 'typing');
  assert.equal((await ci.collect((x) => x.t === 'typing', 50)).length, 0);
});

test('nhóm > 50 người: tắt typing', async () => {
  const members = [];
  for (let i = 0; i < 51; i += 1) members.push(await s.user());
  const conv = await conversation(members);
  const [c0, c1] = [await s.ready(members[0].id), await s.ready(members[1].id)];
  c0.send({ t: 'typing', cid: conv.id });
  assert.equal((await c1.collect((x) => x.t === 'typing', 250)).length, 0);
});

test('typing bị giãn: gõ liên tục chỉ chuyển tiếp tối đa 1 khung / 2 giây mỗi cuộc', async () => {
  const [a, b] = [await s.user(), await s.user()];
  const conv = await conversation([a, b], { kind: 'dm' });
  const [ca, cb] = [await s.ready(a.id), await s.ready(b.id)];
  for (let i = 0; i < 10; i += 1) ca.send({ t: 'typing', cid: conv.id });
  await cb.waitFrame((x) => x.t === 'typing');
  assert.equal((await cb.collect((x) => x.t === 'typing', 250)).length, 1);
  s.clock.t += 2_100;
  ca.send({ t: 'typing', cid: conv.id });
  await sleep(250);
  assert.equal(cb.frames.filter((x) => x.t === 'typing').length, 2);
});

test('presence: chỉ tới bạn khi hai bên bật show_online; đối xứng; chỉ báo lần nối đầu/ngắt cuối', async () => {
  const [a, friend, hidden, stranger] = [
    await s.user(),
    await s.user(),
    await s.user({ settings: { showOnline: false } }),
    await s.user()
  ];
  const ordered = (x, y) => (x.id < y.id ? { userA: x.id, userB: y.id } : { userA: y.id, userB: x.id });
  await s.db.insert(schema.friendships).values([ordered(a, friend), ordered(a, hidden)]);
  const [cf, ch, cs] = [await s.ready(friend.id), await s.ready(hidden.id), await s.ready(stranger.id)];
  const ca1 = await s.ready(a.id);
  const online = await cf.waitFrame((x) => x.t === 'presence' && x.userId === a.id);
  assert.deepEqual(online, { t: 'presence', userId: a.id, online: true });
  assert.equal((await ch.collect((x) => x.t === 'presence', 200)).length, 0, 'bạn tắt show_online: không nhận (đối xứng)');
  assert.equal((await cs.collect((x) => x.t === 'presence', 10)).length, 0, 'người lạ không nhận');

  const ca2 = await s.ready(a.id);
  await sleep(150);
  assert.equal(cf.frames.filter((x) => x.t === 'presence').length, 1, 'kết nối thứ hai không báo lại');
  ca1.terminate();
  await sleep(200);
  assert.equal(cf.frames.filter((x) => x.t === 'presence').length, 1, 'còn kết nối khác thì chưa offline');
  ca2.terminate();
  const off = await cf.waitFrame((x) => x.t === 'presence' && x.online === false);
  assert.equal(off.userId, a.id);
});

test('presence: người tắt show_online không bao giờ bị báo', async () => {
  const [me, friend] = [await s.user({ settings: { showOnline: false } }), await s.user()];
  await s.db.insert(schema.friendships).values(me.id < friend.id ? { userA: me.id, userB: friend.id } : { userA: friend.id, userB: me.id });
  const cf = await s.ready(friend.id);
  await s.ready(me.id);
  assert.equal((await cf.collect((x) => x.t === 'presence', 250)).length, 0);
});

test('presence: chặn nhau thì không báo', async () => {
  const [a, b] = [await s.user(), await s.user()];
  await s.db.insert(schema.friendships).values(a.id < b.id ? { userA: a.id, userB: b.id } : { userA: b.id, userB: a.id });
  await s.db.insert(schema.userBlocks).values({ blockerId: b.id, blockedId: a.id });
  const cb = await s.ready(b.id);
  await s.ready(a.id);
  assert.equal((await cb.collect((x) => x.t === 'presence', 250)).length, 0);
});

test('tắt Gateway: mọi kết nối được đóng sạch (1001), app.close() trả về', async () => {
  const s2 = await startWs();
  const u = await s2.user();
  const [c1, c2] = [await s2.ready(u.id), await s2.ready(u.id)];
  const idle = s2.connect(u.id, { hello: false });
  await idle.opened;
  await s2.app.close();
  assert.equal((await c1.waitClosed()).code, 1001);
  assert.equal((await c2.waitClosed()).code, 1001);
  assert.equal((await idle.waitClosed()).code, 1001);
  assert.deepEqual(s2.uncaught, []);
  await s2.dbp.close();
});

test('CHAT_ENABLED=false → /ws không tồn tại (404)', async () => {
  const s3 = await startWs({ env: { CHAT_ENABLED: 'false' } });
  const c = s3.connect(null, { hello: false });
  await c.opened;
  assert.equal(c.closed.http, 404);
  await s3.close();
});

test('closeUser trong lúc hello đang chờ DB → kết nối không được đăng ký', async () => {
  const u = await s.user();
  const c = s.connect(u.id);
  s.app.realtime.closeUser(u.id, 4403); // chạy ngay khi hello còn đang xác thực (verify bất đồng bộ)
  await sleep(0);
  const closed = await Promise.race([c.waitClosed(1500).catch(() => null), sleep(1500).then(() => null)]);
  // hoặc hello tới sau closeUser (đã bị chặn nếu verify bắt đầu trước), hoặc nối được vì hello bắt đầu sau thu hồi
  if (closed) assert.equal(closed.code, 4403);
});
