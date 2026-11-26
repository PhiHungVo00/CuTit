import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { schema } from '../dist/db/client.js';
import { WsServerFrameSchema } from '@vietlearning/contracts/api';
import { befriend, call, chatApp, dbCounts, openDm, person, sendHttp } from './chat-helpers.mjs';

/** Dự án 4 Task 4 — lõi chat 1-1: tạo cuộc, gửi, danh sách, đọc, ẩn, cổng điều kiện, người ngoài cuộc */
let t;
before(async () => {
  t = await chatApp();
});
after(() => t.close());

test('Tạo cuộc 1-1: cùng một cuộc cho cả hai phía, gọi lặp hoặc đồng thời vẫn một cuộc', async () => {
  const a = await person(t, 'An');
  const b = await person(t, 'Bình');
  const fid = await befriend(t, a, b);
  const rs = await Promise.all([a, b, a, b].map((u) => call(t, u, 'POST', '/v1/chat/conversations', { peerFriendshipId: fid })));
  assert.ok(rs.every((r) => r.statusCode === 200), rs.map((r) => r.body).join('|'));
  assert.equal(new Set(rs.map((r) => r.json().id)).size, 1);
  assert.equal(rs[0].json().kind, 'dm');
  assert.equal(rs[0].json().peer.displayName, 'Bình');
  assert.equal(rs[1].json().peer.displayName, 'An');
  const db = await t.dbp.get();
  assert.equal((await db.select().from(schema.conversationMembers).where(eq(schema.conversationMembers.conversationId, rs[0].json().id))).length, 2);
});

test('Không là bạn / friendshipId của người khác → không tạo được cuộc, không để lại cuộc nào', async () => {
  const a = await person(t, 'An1');
  const b = await person(t, 'Bình1');
  const c = await person(t, 'Chi1');
  const fid = await befriend(t, b, c); // a không thuộc cặp này
  const before = await dbCounts(t);
  const r = await call(t, a, 'POST', '/v1/chat/conversations', { peerFriendshipId: fid });
  assert.equal(r.statusCode, 404);
  assert.equal(r.json().error, 'peer_unavailable');
  assert.equal((await call(t, a, 'POST', '/v1/chat/conversations', { peerFriendshipId: randomUUID() })).json().error, 'peer_unavailable');
  assert.deepEqual(await dbCounts(t), before);
});

test('Chặn nhau / người kia không đủ điều kiện → không tạo cuộc; người kia chặn mình thì mình không biết (peer_unavailable)', async () => {
  const a = await person(t, 'An2');
  const b = await person(t, 'Bình2');
  const c = await person(t, 'Chi2');
  const fab = await befriend(t, a, b);
  const fac = await befriend(t, a, c);
  const db = await t.dbp.get();
  await db.insert(schema.userBlocks).values({ blockerId: a.userId, blockedId: b.userId });
  const r1 = await call(t, a, 'POST', '/v1/chat/conversations', { peerFriendshipId: fab });
  assert.equal(r1.statusCode, 403);
  assert.equal(r1.json().error, 'blocked');
  const r2 = await call(t, b, 'POST', '/v1/chat/conversations', { peerFriendshipId: fab });
  assert.equal(r2.statusCode, 404);
  assert.equal(r2.json().error, 'peer_unavailable');
  t.gate.set(c.userId, 'minor');
  const r3 = await call(t, a, 'POST', '/v1/chat/conversations', { peerFriendshipId: fac });
  assert.equal(r3.statusCode, 404);
  assert.equal(r3.json().error, 'peer_unavailable', 'không lộ lý do (dưới 18)');
  t.gate.set(c.userId, null);
});

test('Cổng điều kiện: mỗi lý do ra đúng mã, và KHÔNG ghi gì vào DB', async () => {
  const a = await person(t, 'An3');
  const b = await person(t, 'Bình3');
  const cid = await openDm(t, a, b);
  await sendHttp(t, b, cid, 'xin chào');
  const snapshot = await dbCounts(t);
  const expected = {
    guest: 'adult_required',
    minor: 'adult_required',
    age_unknown: 'age_required',
    no_handle: 'handle_required',
    restricted: 'chat_restricted',
    pending_deletion: 'account_pending_deletion'
  };
  for (const [reason, code] of Object.entries(expected)) {
    t.gate.set(a.userId, reason);
    const send = await sendHttp(t, a, cid, 'không được gửi');
    assert.equal(send.statusCode, 403, reason);
    assert.equal(send.json().error, code, reason);
    assert.equal((await call(t, a, 'POST', `/v1/chat/conversations/${cid}/read`, { seq: 1 })).json().error, code);
    assert.equal((await call(t, a, 'GET', `/v1/chat/conversations/${cid}/messages`)).json().error, code);
    assert.equal((await call(t, a, 'GET', '/v1/chat/conversations')).json().error, code);
    assert.equal((await call(t, a, 'POST', '/v1/chat/conversations', { peerFriendshipId: randomUUID() })).json().error, code);
  }
  t.gate.set(a.userId, null);
  assert.deepEqual(await dbCounts(t), snapshot, 'không dấu vết');
  const db = await t.dbp.get();
  const [m] = await db.select().from(schema.conversationMembers).where(eq(schema.conversationMembers.userId, a.userId));
  assert.equal(m.lastReadSeq, 0, 'đánh dấu đọc bị chặn cũng không ghi');
});

test('Cờ CHAT_ENABLED tắt → 404 chat_disabled', async () => {
  const off = await chatApp({ CHAT_ENABLED: 'false' });
  try {
    const a = await person(off, 'Tắt');
    const r = await call(off, a, 'GET', '/v1/chat/conversations');
    assert.equal(r.statusCode, 404);
    assert.equal(r.json().error, 'chat_disabled');
  } finally {
    await off.close();
  }
});

test('Gửi tin: trả id/seq, bên kia chưa đọc = 1, mình = 0; tin vào danh sách + xem trước', async () => {
  const a = await person(t, 'An4');
  const b = await person(t, 'Bình4');
  const cid = await openDm(t, a, b);
  const r = await sendHttp(t, a, cid, 'Xin chào Bình');
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().seq, 1);
  assert.equal(r.json().duplicate, undefined);
  const la = (await call(t, a, 'GET', '/v1/chat/conversations')).json().conversations.find((c) => c.id === cid);
  const lb = (await call(t, b, 'GET', '/v1/chat/conversations')).json().conversations.find((c) => c.id === cid);
  assert.equal(la.unread, 0);
  assert.equal(lb.unread, 1);
  assert.equal(lb.lastSeq, 1);
  assert.equal(lb.lastMessage.preview, 'Xin chào Bình');
  assert.deepEqual((await call(t, b, 'GET', '/v1/chat/conversations/unread')).json(), { total: 1, conversations: 1 });
  assert.deepEqual((await call(t, a, 'GET', '/v1/chat/conversations/unread')).json(), { total: 0, conversations: 0 });
  const page = (await call(t, b, 'GET', `/v1/chat/conversations/${cid}/messages`)).json();
  assert.equal(page.messages.length, 1);
  assert.equal(page.messages[0].mine, false);
  assert.equal(page.messages[0].sender.displayName, 'An4');
  assert.equal(page.messages[0].body, 'Xin chào Bình');
  assert.equal(page.hasMore, false);
});

test('Khung đẩy qua bus: người gửi (máy khác) mine:true, người kia mine:false, đúng hợp đồng WS', async () => {
  const a = await person(t, 'An5');
  const b = await person(t, 'Bình5');
  const cid = await openDm(t, a, b);
  t.bus.clear();
  await sendHttp(t, a, cid, 'tin đẩy');
  const fa = t.bus.framesFor(a.userId).filter((f) => f.t === 'msg');
  const fb = t.bus.framesFor(b.userId).filter((f) => f.t === 'msg');
  assert.equal(fa.length, 1);
  assert.equal(fb.length, 1);
  assert.equal(fa[0].message.mine, true);
  assert.equal(fb[0].message.mine, false);
  assert.equal(fb[0].message.body, 'tin đẩy');
  for (const f of [...fa, ...fb]) assert.ok(WsServerFrameSchema.safeParse(f).success);
});

test('Người ngoài cuộc trò chuyện: đọc / gửi / đánh dấu đọc / ẩn / tắt tiếng → not_a_member; thu hồi → 404; không ghi gì', async () => {
  const a = await person(t, 'An6');
  const b = await person(t, 'Bình6');
  const x = await person(t, 'Xa6');
  const cid = await openDm(t, a, b);
  const sent = (await sendHttp(t, a, cid, 'bí mật')).json();
  const db = await t.dbp.get();
  const [row] = await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.conversationId, cid));
  const snapshot = await dbCounts(t);
  for (const [m, url, payload] of [
    ['GET', `/v1/chat/conversations/${cid}/messages`],
    ['GET', `/v1/chat/conversations/${cid}`],
    ['POST', `/v1/chat/conversations/${cid}/messages`, { clientMsgId: randomUUID(), kind: 'text', body: 'chen ngang' }],
    ['POST', `/v1/chat/conversations/${cid}/read`, { seq: 1 }],
    ['POST', `/v1/chat/conversations/${cid}/hide`],
    ['POST', `/v1/chat/conversations/${cid}/unhide`],
    ['PUT', `/v1/chat/conversations/${cid}/mute`, { mutedUntil: null }]
  ]) {
    const r = await call(t, x, m, url, payload);
    assert.equal(r.statusCode, 403, `${m} ${url}`);
    assert.equal(r.json().error, 'not_a_member', `${m} ${url}`);
  }
  for (const action of ['recall', 'restore']) {
    const r = await call(t, x, 'POST', `/v1/chat/messages/${sent.id}/${action}`);
    assert.equal(r.statusCode, 404, action);
    assert.equal(r.json().error, 'message_not_found');
  }
  assert.deepEqual(await dbCounts(t), snapshot);
  const [after] = await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.id, row.id));
  assert.equal(after.deletedAt, null);
  assert.equal(JSON.stringify((await call(t, x, 'GET', '/v1/chat/conversations')).json()).includes('bí mật'), false);
});

test('Tin sai hình dạng / quá dài / trống / có trường lạ → 400, không ghi', async () => {
  const a = await person(t, 'An7');
  const b = await person(t, 'Bình7');
  const cid = await openDm(t, a, b);
  const snapshot = await dbCounts(t);
  assert.equal((await sendHttp(t, a, cid, 'x'.repeat(4001))).statusCode, 400);
  assert.equal((await sendHttp(t, a, cid, '   ')).statusCode, 400);
  assert.equal((await call(t, a, 'POST', `/v1/chat/conversations/${cid}/messages`, { clientMsgId: 'không-phải-uuid', kind: 'text', body: 'x' })).statusCode, 400);
  assert.equal((await call(t, a, 'POST', `/v1/chat/conversations/${cid}/messages`, { clientMsgId: randomUUID(), kind: 'text', body: 'x', senderId: b.userId })).statusCode, 400);
  assert.equal((await call(t, a, 'POST', `/v1/chat/conversations/${cid}/messages`, { clientMsgId: randomUUID(), kind: 'system', body: 'x' })).statusCode, 400);
  assert.equal((await sendHttp(t, a, cid, 'x'.repeat(4000))).statusCode, 200, 'đúng 4000 vẫn nhận');
  assert.equal((await dbCounts(t)).messages, snapshot.messages + 1);
});

test('Tin kèm ảnh/giọng nói chưa hỗ trợ ở API này → attachment_invalid, không ghi', async () => {
  const a = await person(t, 'An8');
  const b = await person(t, 'Bình8');
  const cid = await openDm(t, a, b);
  const snapshot = await dbCounts(t);
  const r = await call(t, a, 'POST', `/v1/chat/conversations/${cid}/messages`, { clientMsgId: randomUUID(), kind: 'image', attachmentId: randomUUID() });
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().error, 'attachment_invalid');
  assert.deepEqual(await dbCounts(t), snapshot);
});

test('Phân trang: afterSeq (kể cả 0), beforeSeq, limit > 100 bị cắt', async () => {
  const a = await person(t, 'An9');
  const b = await person(t, 'Bình9');
  const cid = await openDm(t, a, b);
  const { sendMessage } = await import('../dist/services/chat/messages.js');
  const db = await t.dbp.get();
  for (let i = 1; i <= 105; i++) await sendMessage(db, t.bus, { conversationId: cid, userId: i % 2 ? a.userId : b.userId, clientMsgId: randomUUID(), kind: 'text', body: `tin ${i}` });
  const seqs = async (qs) => (await call(t, a, 'GET', `/v1/chat/conversations/${cid}/messages?${qs}`)).json();
  const latest = await seqs('');
  assert.equal(latest.messages.length, 40);
  assert.deepEqual(latest.messages.map((m) => m.seq).slice(0, 2), [66, 67]);
  assert.equal(latest.messages.at(-1).seq, 105);
  assert.equal(latest.hasMore, true);
  const older = await seqs('beforeSeq=66&limit=5');
  assert.deepEqual(older.messages.map((m) => m.seq), [61, 62, 63, 64, 65]);
  assert.equal(older.hasMore, true);
  const gap = await seqs('afterSeq=100');
  assert.deepEqual(gap.messages.map((m) => m.seq), [101, 102, 103, 104, 105]);
  assert.equal(gap.hasMore, false);
  const fromStart = await seqs('afterSeq=0&limit=3');
  assert.deepEqual(fromStart.messages.map((m) => m.seq), [1, 2, 3]);
  assert.equal(fromStart.hasMore, true);
  const big = await seqs('limit=500');
  assert.equal(big.messages.length, 100, 'cắt về 100');
  assert.equal((await call(t, a, 'GET', `/v1/chat/conversations/${cid}/messages?afterSeq=1&beforeSeq=9`)).statusCode, 400);
  // mine tính theo người xem
  const m1 = (await seqs('afterSeq=0&limit=2')).messages;
  assert.deepEqual(m1.map((m) => m.mine), [true, false]);
});

test('Ẩn cuộc trò chuyện chỉ cho riêng mình: chỉ thấy tin mới hơn; hết hiện trong danh sách tới khi có tin mới; unhide xem lại', async () => {
  const a = await person(t, 'An10');
  const b = await person(t, 'Bình10');
  const cid = await openDm(t, a, b);
  await sendHttp(t, a, cid, 'cũ 1');
  await sendHttp(t, a, cid, 'cũ 2');
  assert.equal((await call(t, b, 'POST', `/v1/chat/conversations/${cid}/hide`)).statusCode, 204);
  assert.equal((await call(t, b, 'GET', `/v1/chat/conversations/${cid}/messages`)).json().messages.length, 0);
  assert.equal((await call(t, b, 'GET', '/v1/chat/conversations')).json().conversations.some((c) => c.id === cid), false);
  assert.equal((await call(t, a, 'GET', `/v1/chat/conversations/${cid}/messages`)).json().messages.length, 2, 'bên kia vẫn thấy');
  await sendHttp(t, a, cid, 'mới 3');
  const lb = (await call(t, b, 'GET', '/v1/chat/conversations')).json().conversations.find((c) => c.id === cid);
  assert.equal(lb.unread, 1);
  assert.deepEqual((await call(t, b, 'GET', `/v1/chat/conversations/${cid}/messages`)).json().messages.map((m) => m.body), ['mới 3']);
  assert.equal((await call(t, b, 'POST', `/v1/chat/conversations/${cid}/unhide`)).statusCode, 204);
  assert.equal((await call(t, b, 'GET', `/v1/chat/conversations/${cid}/messages`)).json().messages.length, 3);
});

test('Chưa đọc: markRead không lùi, không vượt last_seq, phát khung read; tin mình gửi không tăng chưa đọc của mình; tắt tiếng không vào chấm đỏ', async () => {
  const a = await person(t, 'An11');
  const b = await person(t, 'Bình11');
  const cid = await openDm(t, a, b);
  for (let i = 0; i < 5; i++) await sendHttp(t, a, cid, `m${i}`);
  const unread = async (u) => (await call(t, u, 'GET', '/v1/chat/conversations')).json().conversations.find((c) => c.id === cid).unread;
  assert.equal(await unread(b), 5);
  t.bus.clear();
  assert.equal((await call(t, b, 'POST', `/v1/chat/conversations/${cid}/read`, { seq: 3 })).statusCode, 204);
  assert.equal(await unread(b), 2);
  assert.deepEqual(t.bus.framesFor(a.userId).filter((f) => f.t === 'read'), [{ t: 'read', cid, userId: b.userId, seq: 3 }]);
  await call(t, b, 'POST', `/v1/chat/conversations/${cid}/read`, { seq: 1 }); // lùi
  assert.equal(await unread(b), 2, 'không lùi');
  t.bus.clear();
  await call(t, b, 'POST', `/v1/chat/conversations/${cid}/read`, { seq: 2 });
  assert.equal(t.bus.framesFor(a.userId).length, 0, 'không tiến thì không phát lại');
  await call(t, b, 'POST', `/v1/chat/conversations/${cid}/read`, { seq: 9999 });
  assert.equal(await unread(b), 0, 'vượt last_seq được kẹp ở last_seq');
  const db = await t.dbp.get();
  const [mb] = await db.select().from(schema.conversationMembers).where(eq(schema.conversationMembers.userId, b.userId));
  assert.ok(mb.lastReadSeq <= 5);
  // người gửi tắt "đã xem" ⇒ không phát khung read (đối xứng)
  await sendHttp(t, a, cid, 'm5');
  await db.update(schema.socialProfiles).set({ showReadReceipts: false }).where(eq(schema.socialProfiles.userId, b.userId));
  t.bus.clear();
  await call(t, b, 'POST', `/v1/chat/conversations/${cid}/read`, { seq: 6 });
  assert.equal(t.bus.framesFor(a.userId).length, 0);
  // tắt tiếng: không tính vào chấm đỏ
  await sendHttp(t, a, cid, 'm6');
  assert.equal((await call(t, b, 'GET', '/v1/chat/conversations/unread')).json().total, 1);
  const until = new Date(Date.now() + 3600e3).toISOString();
  assert.equal((await call(t, b, 'PUT', `/v1/chat/conversations/${cid}/mute`, { mutedUntil: until })).statusCode, 204);
  assert.equal((await call(t, b, 'GET', '/v1/chat/conversations/unread')).json().total, 0);
  assert.equal((await call(t, b, 'GET', '/v1/chat/conversations')).json().conversations.find((c) => c.id === cid).muted, true);
  assert.equal((await call(t, b, 'PUT', `/v1/chat/conversations/${cid}/mute`, { mutedUntil: null })).statusCode, 204);
  assert.equal((await call(t, b, 'GET', '/v1/chat/conversations')).json().conversations.find((c) => c.id === cid).muted, false);
});

test('Danh sách cuộc trò chuyện: mới nhất trước, phân trang bằng cursor không trùng/sót', async () => {
  const me = await person(t, 'An12');
  const cids = [];
  for (let i = 0; i < 5; i++) {
    const p = await person(t, `Bạn12-${i}`);
    const cid = await openDm(t, me, p);
    await sendHttp(t, p, cid, `chào ${i}`);
    cids.push(cid);
  }
  const first = (await call(t, me, 'GET', '/v1/chat/conversations?limit=2')).json();
  assert.equal(first.conversations.length, 2);
  assert.ok(first.nextCursor);
  const second = (await call(t, me, 'GET', `/v1/chat/conversations?limit=2&cursor=${first.nextCursor}`)).json();
  const third = (await call(t, me, 'GET', `/v1/chat/conversations?limit=2&cursor=${second.nextCursor}`)).json();
  const all = [...first.conversations, ...second.conversations, ...third.conversations].map((c) => c.id);
  assert.deepEqual(all, [...cids].reverse());
  assert.equal(third.nextCursor, null);
  assert.equal((await call(t, me, 'GET', '/v1/chat/conversations?cursor=%25%25')).statusCode, 400);
});

test('Tạo nhóm chưa có ở API này (Task 12) → 501, không ghi', async () => {
  const a = await person(t, 'An13');
  const b = await person(t, 'Bình13');
  const snapshot = await dbCounts(t);
  const r = await call(t, a, 'POST', '/v1/chat/conversations', { title: 'Nhóm', memberIds: [b.userId] });
  assert.equal(r.statusCode, 501);
  assert.deepEqual(await dbCounts(t), snapshot);
});

test('Giới hạn yêu cầu/phút của route chat cao hơn trần chung của /v1', async () => {
  const lim = await chatApp({ RATE_LIMIT_PER_MINUTE: '5', CHAT_RATE_LIMIT_PER_MINUTE: '8' });
  try {
    const a = await person(lim, 'Giới hạn');
    const codes = [];
    for (let i = 0; i < 10; i++) codes.push((await call(lim, a, 'GET', '/v1/chat/conversations/unread')).statusCode);
    assert.deepEqual(codes, [200, 200, 200, 200, 200, 200, 200, 200, 429, 429]);
  } finally {
    await lim.close();
  }
});

test('Tin chứa ký tự NUL (\u0000) → 400 invalid_request (không phải 500 lộ lỗi DB), không ghi', async () => {
  const a = await person(t, 'Nul A');
  const b = await person(t, 'Nul B');
  const cid = await openDm(t, a, b);
  const snapshot = await dbCounts(t);
  for (const body of ['xin\u0000chào', '\u0000']) {
    const r = await sendHttp(t, a, cid, body);
    assert.equal(r.statusCode, 400, body);
    assert.equal(r.json().error, 'invalid_request');
  }
  assert.deepEqual(await dbCounts(t), snapshot);
});

test('Cursor hỏng (id không phải uuid, ngày không hợp lệ/ngoài khoảng) → 400 invalid_request, không phải 500', async () => {
  const a = await person(t, 'Cur A');
  const enc = (s) => Buffer.from(s).toString('base64url');
  const good = '11111111-1111-4111-8111-111111111111';
  for (const c of [enc(`2026-01-01T00:00:00.000Z|khong-phai-uuid`), enc(`+275760-09-13T00:00:00.000Z|${good}`), enc(`0001-01-01T00:00:00.000Z|${good}`), enc(`không-phải-ngày|${good}`), enc('chỉ-một-phần'), '']) {
    const r = await call(t, a, 'GET', `/v1/chat/conversations?cursor=${c}`);
    if (c === '') assert.equal(r.statusCode, 200);
    else {
      assert.equal(r.statusCode, 400, c);
      assert.equal(r.json().error, 'invalid_request');
    }
  }
});

test('Cổng mặc định ngoài test là ĐÓNG; chỉ NODE_ENV=test dùng bản giả', async () => {
  const { defaultChatEligibility, closedChatEligibility, stubChatEligibility } = await import('../dist/services/chat/eligibility.js');
  for (const env of ['production', 'development', undefined]) assert.equal(defaultChatEligibility(env), closedChatEligibility, String(env));
  assert.equal(defaultChatEligibility('test'), stubChatEligibility);
  assert.deepEqual(await closedChatEligibility(null, 'x'), { ok: false, reason: 'age_unknown' });
});

test('last_message_at không bao giờ lùi (đồng hồ lệch không làm cuộc trò chuyện nhảy xuống cũ hơn)', async () => {
  const a = await person(t, 'Gre A');
  const b = await person(t, 'Gre B');
  const cid = await openDm(t, a, b);
  const { sendMessage } = await import('../dist/services/chat/messages.js');
  const db = await t.dbp.get();
  const later = new Date('2030-01-01T00:00:00Z');
  await sendMessage(db, t.bus, { conversationId: cid, userId: a.userId, clientMsgId: randomUUID(), kind: 'text', body: 'tương lai', now: later });
  await sendMessage(db, t.bus, { conversationId: cid, userId: b.userId, clientMsgId: randomUUID(), kind: 'text', body: 'quá khứ', now: new Date('2029-01-01T00:00:00Z') });
  const [c] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, cid));
  assert.equal(c.lastMessageAt.toISOString(), later.toISOString());
});
