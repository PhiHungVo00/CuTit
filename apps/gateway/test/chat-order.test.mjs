import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { schema } from '../dist/db/client.js';
import { sendMessage } from '../dist/services/chat/messages.js';
import { chatApp, openDm, person } from './chat-helpers.mjs';

/**
 * Dự án 4 Task 4 — thứ tự và chống trùng. PGlite chỉ có MỘT kết nối nên giao dịch xếp hàng tuần tự: test này kiểm LOGIC
 * (seq liên tục, khóa chống trùng); tranh chấp thật giữa nhiều kết nối kiểm riêng trên Postgres thật (TEST_DATABASE_URL).
 */
let t;
before(async () => {
  t = await chatApp();
});
after(() => t.close());

const seqsOf = async (cid) => {
  const db = await t.dbp.get();
  const rows = await db.select({ seq: schema.chatMessages.seq }).from(schema.chatMessages).where(eq(schema.chatMessages.conversationId, cid));
  return rows.map((r) => r.seq).sort((a, b) => a - b);
};
const lastSeqOf = async (cid) => {
  const db = await t.dbp.get();
  return (await db.select().from(schema.conversations).where(eq(schema.conversations.id, cid)))[0].lastSeq;
};

test('50 lời gọi gửi ĐỒNG THỜI từ hai người → seq đúng 1..50, không lỗ, không trùng', async () => {
  const a = await person(t, 'Đua A');
  const b = await person(t, 'Đua B');
  const cid = await openDm(t, a, b);
  const db = await t.dbp.get();
  const results = await Promise.all(
    Array.from({ length: 50 }, (_, i) => sendMessage(db, t.bus, { conversationId: cid, userId: i % 2 ? a.userId : b.userId, clientMsgId: randomUUID(), kind: 'text', body: `đua ${i}` }))
  );
  assert.equal(results.filter((r) => r.duplicate).length, 0);
  assert.deepEqual(await seqsOf(cid), Array.from({ length: 50 }, (_, i) => i + 1));
  assert.equal(await lastSeqOf(cid), 50);
  assert.deepEqual(results.map((r) => r.message.seq).sort((x, y) => x - y), Array.from({ length: 50 }, (_, i) => i + 1));
});

test('Gửi lại cùng clientMsgId (lần lượt) → cùng một tin, last_seq không tăng, KHÔNG phát khung lần hai', async () => {
  const a = await person(t, 'Trùng A');
  const b = await person(t, 'Trùng B');
  const cid = await openDm(t, a, b);
  const db = await t.dbp.get();
  const clientMsgId = randomUUID();
  t.bus.clear();
  const first = await sendMessage(db, t.bus, { conversationId: cid, userId: a.userId, clientMsgId, kind: 'text', body: 'một lần thôi' });
  const framesAfterFirst = t.bus.published.length;
  assert.ok(framesAfterFirst > 0);
  const again = await sendMessage(db, t.bus, { conversationId: cid, userId: a.userId, clientMsgId, kind: 'text', body: 'một lần thôi' });
  const third = await sendMessage(db, t.bus, { conversationId: cid, userId: a.userId, clientMsgId, kind: 'text', body: 'nội dung khác cũng trả tin cũ' });
  assert.equal(first.duplicate, false);
  assert.equal(again.duplicate, true);
  assert.equal(again.message.id, first.message.id);
  assert.equal(third.message.id, first.message.id);
  assert.equal(third.message.body, 'một lần thôi', 'trả đúng tin đã có, không ghi đè');
  assert.equal(await lastSeqOf(cid), 1);
  assert.deepEqual(await seqsOf(cid), [1]);
  assert.equal(t.bus.published.length, framesAfterFirst, 'không phát lại');
  assert.equal(t.bus.framesFor(b.userId).filter((f) => f.t === 'msg').length, 1);
});

test('Gửi lại ĐỒNG THỜI cùng clientMsgId → một tin, một seq, một lần phát', async () => {
  const a = await person(t, 'Trùng C');
  const b = await person(t, 'Trùng D');
  const cid = await openDm(t, a, b);
  const db = await t.dbp.get();
  const clientMsgId = randomUUID();
  t.bus.clear();
  const rs = await Promise.all(Array.from({ length: 6 }, () => sendMessage(db, t.bus, { conversationId: cid, userId: a.userId, clientMsgId, kind: 'text', body: 'đồng thời' })));
  assert.equal(new Set(rs.map((r) => r.message.id)).size, 1);
  assert.equal(rs.filter((r) => !r.duplicate).length, 1);
  assert.deepEqual(await seqsOf(cid), [1]);
  assert.equal(await lastSeqOf(cid), 1);
  assert.equal(t.bus.framesFor(b.userId).filter((f) => f.t === 'msg').length, 1);
});

test('Cùng clientMsgId nhưng KHÁC người gửi là hai tin khác nhau (khóa chống trùng theo người gửi)', async () => {
  const a = await person(t, 'Khóa A');
  const b = await person(t, 'Khóa B');
  const cid = await openDm(t, a, b);
  const db = await t.dbp.get();
  const clientMsgId = randomUUID();
  const ra = await sendMessage(db, t.bus, { conversationId: cid, userId: a.userId, clientMsgId, kind: 'text', body: 'của A' });
  const rb = await sendMessage(db, t.bus, { conversationId: cid, userId: b.userId, clientMsgId, kind: 'text', body: 'của B' });
  assert.notEqual(ra.message.id, rb.message.id);
  assert.deepEqual(await seqsOf(cid), [1, 2]);
});

test('Gửi thất bại (vấp giới hạn) KHÔNG làm hụt seq: tin kế tiếp vẫn liên tục', async () => {
  const a = await person(t, 'Hụt A');
  const b = await person(t, 'Hụt B');
  const cid = await openDm(t, a, b);
  const db = await t.dbp.get();
  const { createChatLimiter } = await import('../dist/services/chat/limits.js');
  const limiter = createChatLimiter();
  const now = new Date('2026-11-26T10:00:00Z');
  for (let i = 0; i < 20; i++) await sendMessage(db, t.bus, { conversationId: cid, userId: a.userId, clientMsgId: randomUUID(), kind: 'text', body: `t${i}`, limiter, now });
  await assert.rejects(sendMessage(db, t.bus, { conversationId: cid, userId: a.userId, clientMsgId: randomUUID(), kind: 'text', body: 'thứ 21', limiter, now }), (e) => e.code === 'chat_rate');
  assert.equal(await lastSeqOf(cid), 20);
  const r = await sendMessage(db, t.bus, { conversationId: cid, userId: b.userId, clientMsgId: randomUUID(), kind: 'text', body: 'người kia', limiter, now });
  assert.equal(r.message.seq, 21);
  assert.deepEqual(await seqsOf(cid), Array.from({ length: 21 }, (_, i) => i + 1));
});
