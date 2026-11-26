import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { schema } from '../dist/db/client.js';
import { WsServerFrameSchema } from '@vietlearning/contracts/api';
import { call, chatApp, openDm, person, sendHttp } from './chat-helpers.mjs';

/** Dự án 4 Task 4 — thu hồi / hoàn tác / tin của người đã chặn: không lộ nội dung qua REST lẫn khung bus */
let t;
before(async () => {
  t = await chatApp();
});
after(() => t.close());

const msgs = async (u, cid) => (await call(t, u, 'GET', `/v1/chat/conversations/${cid}/messages`)).json().messages;

test('Thu hồi: người kia chỉ thấy {deleted:true} không nội dung; người gửi vẫn thấy nội dung để hoàn tác; hoàn tác khôi phục', async () => {
  const a = await person(t, 'Thu A');
  const b = await person(t, 'Thu B');
  const cid = await openDm(t, a, b);
  const sent = (await sendHttp(t, a, cid, 'câu nhạy cảm')).json();
  t.bus.clear();
  assert.equal((await call(t, a, 'POST', `/v1/chat/messages/${sent.id}/recall`)).statusCode, 204);

  const forB = (await msgs(b, cid))[0];
  assert.equal(forB.deleted, true);
  assert.equal(forB.body, undefined);
  assert.equal(forB.attachment, undefined);
  assert.equal(JSON.stringify(forB).includes('nhạy cảm'), false);
  const forA = (await msgs(a, cid))[0];
  assert.equal(forA.deleted, true);
  assert.equal(forA.body, 'câu nhạy cảm', 'người gửi thấy lại để Hoàn tác');

  // khung bus: chỉ id + seq, tuyệt đối không có chữ
  const rf = t.bus.published.filter((p) => p.frame.t === 'recall');
  assert.equal(rf.length, 1);
  assert.deepEqual(rf[0].frame, { t: 'recall', cid, messageId: sent.id, seq: 1 });
  assert.equal(JSON.stringify(t.bus.published).includes('nhạy cảm'), false);

  // preview ở danh sách của người kia cũng không lộ
  const lb = (await call(t, b, 'GET', '/v1/chat/conversations')).json().conversations[0];
  assert.equal(lb.lastMessage.preview, undefined);
  assert.equal(JSON.stringify(lb).includes('nhạy cảm'), false);

  t.bus.clear();
  assert.equal((await call(t, a, 'POST', `/v1/chat/messages/${sent.id}/restore`)).statusCode, 204);
  assert.equal((await msgs(b, cid))[0].body, 'câu nhạy cảm');
  assert.equal((await msgs(b, cid))[0].deleted, undefined);
  const restoreFrames = t.bus.published.filter((p) => p.frame.t === 'restore');
  assert.equal(restoreFrames.length, 2, 'một cho máy khác của người gửi, một cho người kia');
  for (const p of restoreFrames) assert.ok(WsServerFrameSchema.safeParse(p.frame).success);
  const toB = t.bus.framesFor(b.userId).find((f) => f.t === 'restore');
  assert.equal(toB.message.mine, false);
  assert.equal(toB.message.body, 'câu nhạy cảm');
});

test('Thu hồi lặp lại / hoàn tác khi chưa thu hồi: không đổi gì, không phát lại', async () => {
  const a = await person(t, 'Lặp A');
  const b = await person(t, 'Lặp B');
  const cid = await openDm(t, a, b);
  const sent = (await sendHttp(t, a, cid, 'x')).json();
  t.bus.clear();
  assert.equal((await call(t, a, 'POST', `/v1/chat/messages/${sent.id}/restore`)).statusCode, 204);
  assert.equal(t.bus.published.length, 0);
  await call(t, a, 'POST', `/v1/chat/messages/${sent.id}/recall`);
  const n = t.bus.published.length;
  assert.equal((await call(t, a, 'POST', `/v1/chat/messages/${sent.id}/recall`)).statusCode, 204);
  assert.equal(t.bus.published.length, n);
});

test('Người kia (thành viên) thu hồi / hoàn tác tin của người khác trong 1-1 → 403; tin vẫn nguyên', async () => {
  const a = await person(t, 'Cấm A');
  const b = await person(t, 'Cấm B');
  const cid = await openDm(t, a, b);
  const sent = (await sendHttp(t, a, cid, 'của A')).json();
  const r = await call(t, b, 'POST', `/v1/chat/messages/${sent.id}/recall`);
  assert.equal(r.statusCode, 403);
  assert.equal(r.json().error, 'forbidden');
  assert.equal((await call(t, b, 'POST', `/v1/chat/messages/${sent.id}/restore`)).statusCode, 403);
  assert.equal((await msgs(a, cid))[0].deleted, undefined);
  // hoàn tác tin bị người khác... không có đường nào: tin id không tồn tại → 404
  assert.equal((await call(t, a, 'POST', '/v1/chat/messages/00000000-0000-4000-8000-000000000000/recall')).statusCode, 404);
  assert.equal((await call(t, a, 'POST', '/v1/chat/messages/khong-phai-uuid/recall')).statusCode, 400);
});

test('Tin của người đã xóa tài khoản và tin hệ thống không thu hồi được', async () => {
  const a = await person(t, 'Sys A');
  const b = await person(t, 'Sys B');
  const cid = await openDm(t, a, b);
  const db = await t.dbp.get();
  const [sys] = await db
    .insert(schema.chatMessages)
    .values({ conversationId: cid, seq: 1, senderId: null, kind: 'system', systemEvent: { type: 'call_missed', callId: '11111111-1111-4111-8111-111111111111', kind: 'voice' } })
    .returning({ id: schema.chatMessages.id });
  await db.update(schema.conversations).set({ lastSeq: 1 });
  const r = await call(t, a, 'POST', `/v1/chat/messages/${sys.id}/recall`);
  assert.equal(r.statusCode, 403);
  const page = await msgs(a, cid);
  assert.equal(page[0].kind, 'system');
  assert.equal(page[0].sender, undefined);
  assert.equal(page[0].system.type, 'call_missed');
});

test('Tin của người bạn đã chặn: cờ blocked, không nội dung, không người gửi; không hiện ở xem trước', async () => {
  const a = await person(t, 'Chặn A');
  const b = await person(t, 'Chặn B');
  const cid = await openDm(t, a, b);
  await sendHttp(t, b, cid, 'tin trước khi bị chặn');
  const db = await t.dbp.get();
  await db.insert(schema.userBlocks).values({ blockerId: a.userId, blockedId: b.userId });
  const forA = (await msgs(a, cid))[0];
  assert.equal(forA.blocked, true);
  assert.equal(forA.body, undefined);
  assert.equal(forA.sender, undefined);
  assert.equal(JSON.stringify(forA).includes('trước khi bị chặn'), false);
  const la = (await call(t, a, 'GET', '/v1/chat/conversations')).json().conversations[0];
  assert.equal(la.lastMessage.preview, undefined);
  assert.equal((await msgs(b, cid))[0].body, 'tin trước khi bị chặn', 'người bị chặn vẫn thấy tin của chính mình');
  // người bị chặn không gửi thêm được, và không biết vì sao
  const r = await sendHttp(t, b, cid, 'sau khi bị chặn');
  assert.equal(r.statusCode, 404);
  assert.equal(r.json().error, 'peer_unavailable');
  // người chặn cũng không gửi được (phải bỏ chặn trước)
  const r2 = await sendHttp(t, a, cid, 'tôi chặn mà vẫn gửi');
  assert.equal(r2.statusCode, 403);
  assert.equal(r2.json().error, 'blocked');
});

test('Gửi trong 1-1 sau khi hết là bạn / người kia không đủ điều kiện → peer_unavailable, không ghi', async () => {
  const a = await person(t, 'Hết A');
  const b = await person(t, 'Hết B');
  const cid = await openDm(t, a, b);
  await sendHttp(t, a, cid, 'còn bạn');
  const db = await t.dbp.get();
  t.gate.set(b.userId, 'pending_deletion');
  const r = await sendHttp(t, a, cid, 'b chờ xóa');
  assert.equal(r.statusCode, 404);
  assert.equal(r.json().error, 'peer_unavailable');
  t.gate.set(b.userId, null);
  await db.delete(schema.friendships);
  const r2 = await sendHttp(t, a, cid, 'không còn là bạn');
  assert.equal(r2.statusCode, 404);
  assert.equal(r2.json().error, 'peer_unavailable');
  assert.equal((await msgs(a, cid)).length, 1);
  // vẫn đọc được lịch sử
  assert.equal((await call(t, a, 'GET', `/v1/chat/conversations/${cid}/messages`)).statusCode, 200);
});

test('Tin của người đã xóa tài khoản (sender_id NULL, nội dung còn trong DB) KHÔNG lộ nội dung qua danh sách tin lẫn xem trước', async () => {
  const a = await person(t, 'Xóa A');
  const b = await person(t, 'Xóa B');
  const cid = await openDm(t, a, b);
  await sendHttp(t, a, cid, 'nội dung của người đã xóa');
  const db = await t.dbp.get();
  const { eq } = await import('drizzle-orm');
  await db.update(schema.chatMessages).set({ senderId: null }).where(eq(schema.chatMessages.conversationId, cid));
  const m = (await msgs(b, cid))[0];
  assert.equal(m.deleted, true);
  assert.equal(m.body, undefined);
  assert.equal(m.sender, undefined);
  const lb = (await call(t, b, 'GET', '/v1/chat/conversations')).json().conversations.find((c) => c.id === cid);
  assert.equal(lb.lastMessage.preview, undefined);
  assert.equal(JSON.stringify([m, lb]).includes('đã xóa'), false);
});
