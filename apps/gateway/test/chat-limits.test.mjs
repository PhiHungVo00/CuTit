import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ChatLimiter } from '../dist/services/chat/limits.js';
import { chatApp, dbCounts, openDm, person, sendHttp } from './chat-helpers.mjs';

/** Dự án 4 Task 4 — giới hạn tốc độ và chống spam */
const T0 = new Date('2026-11-26T08:00:00Z');
const at = (ms) => new Date(T0.getTime() + ms);
const code = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.code;
  }
  return null;
};

test('Bộ đếm: tin thứ 21 trong 10 giây/cuộc → chat_rate; sang cuộc khác hoặc sau 10 giây thì được', () => {
  const l = new ChatLimiter();
  for (let i = 0; i < 20; i++) assert.equal(code(() => l.enforceChatLimits('u', 'c1', at(i * 100), `n${i}`)), null);
  assert.equal(code(() => l.enforceChatLimits('u', 'c1', at(2000), 'n21')), 'chat_rate');
  assert.equal(code(() => l.enforceChatLimits('u', 'c2', at(2000), 'n21')), null, 'cuộc khác');
  assert.equal(code(() => l.enforceChatLimits('u', 'c1', at(10_500), 'n22')), null, 'đã qua 10 giây');
  assert.equal(code(() => l.enforceChatLimits('khac', 'c1', at(2000), 'n21')), null, 'người khác');
});

test('Bộ đếm: 121 tin/phút/người (nhiều cuộc) → chat_rate; sang phút mới thì được', () => {
  const l = new ChatLimiter();
  for (let i = 0; i < 120; i++) assert.equal(code(() => l.enforceChatLimits('u', `c${i % 12}`, at(i * 400), `n${i}`)), null, `tin ${i}`);
  assert.equal(code(() => l.enforceChatLimits('u', 'c0', at(120 * 400), 'n120')), 'chat_rate');
  assert.equal(code(() => l.enforceChatLimits('u', 'c0', at(61_000), 'n121')), null);
});

test('Bộ đếm: 601 tin/ngày/người → chat_rate; sau 24 giờ thì được', () => {
  const l = new ChatLimiter();
  for (let i = 0; i < 600; i++) assert.equal(code(() => l.enforceChatLimits('u', 'c', at(i * 5000), `n${i}`)), null, `tin ${i}`);
  assert.equal(code(() => l.enforceChatLimits('u', 'c', at(600 * 5000), 'n600')), 'chat_rate');
  assert.equal(code(() => l.enforceChatLimits('u', 'c', at(24 * 3600e3 + 1000), 'sau-1-ngay')), null);
});

test('Bộ đếm: cùng nội dung 6 lần/phút → chat_duplicate (bỏ qua hoa thường/khoảng trắng); qua 1 phút thì được', () => {
  const l = new ChatLimiter();
  for (let i = 0; i < 5; i++) assert.equal(code(() => l.enforceChatLimits('u', 'c', at(i * 1000), i % 2 ? '  Xin  CHÀO ' : 'xin chào')), null);
  assert.equal(code(() => l.enforceChatLimits('u', 'c', at(5000), 'xin chào')), 'chat_duplicate');
  assert.equal(code(() => l.enforceChatLimits('u', 'c', at(5000), 'câu khác')), null);
  assert.equal(code(() => l.enforceChatLimits('khac', 'c', at(5000), 'xin chào')), null, 'chỉ tính theo từng người');
  assert.equal(code(() => l.enforceChatLimits('u', 'c', at(66_000), 'xin chào')), null);
});

test('Bộ đếm: lần bị từ chối KHÔNG được ghi nhận; hàm hoàn lại trả lại lượt', () => {
  const l = new ChatLimiter();
  for (let i = 0; i < 20; i++) l.enforceChatLimits('u', 'c', at(i), `n${i}`);
  for (let i = 0; i < 50; i++) assert.equal(code(() => l.enforceChatLimits('u', 'c', at(100 + i), `spam${i}`)), 'chat_rate');
  // nếu lần từ chối bị ghi, cửa sổ sẽ còn đầy sau 10 giây — thực tế chỉ còn 20 lần cũ nên đã trống
  assert.equal(code(() => l.enforceChatLimits('u', 'c', at(10_100), 'sau')), null);
  const l2 = new ChatLimiter();
  const releases = Array.from({ length: 20 }, (_, i) => l2.enforceChatLimits('u', 'c', at(0), `m${i}`));
  assert.equal(code(() => l2.enforceChatLimits('u', 'c', at(1), 'đầy')), 'chat_rate');
  releases[0]();
  assert.equal(code(() => l2.enforceChatLimits('u', 'c', at(2), 'được lại')), null);
});

test('Bộ đếm: khóa hết hạn được dọn (không phình bộ nhớ)', () => {
  const l = new ChatLimiter();
  for (let i = 0; i < 400; i++) l.enforceChatLimits(`u${i}`, `c${i}`, at(0), `n${i}`);
  assert.ok(l.size >= 800);
  for (let i = 0; i < 200; i++) l.enforceChatLimits('mới', 'cm', at(2 * 24 * 3600e3 + i * 1000));
  assert.ok(l.size < 20, `còn ${l.size} khóa`);
});

let t;
before(async () => {
  t = await chatApp();
});
after(() => t.close());

test('Qua REST: tin thứ 21 trong 10 giây → 429 chat_rate (kèm retryAfterSec), không ghi; tin lặp thứ 6 → chat_duplicate', async () => {
  const a = await person(t, 'Spam A');
  const b = await person(t, 'Spam B');
  const cid = await openDm(t, a, b);
  for (let i = 0; i < 20; i++) assert.equal((await sendHttp(t, a, cid, `tin ${i}`)).statusCode, 200, `tin ${i}`);
  const before = await dbCounts(t);
  const r = await sendHttp(t, a, cid, 'tin 21');
  assert.equal(r.statusCode, 429);
  assert.equal(r.json().error, 'chat_rate');
  assert.ok(r.json().retryAfterSec > 0);
  assert.deepEqual(await dbCounts(t), before);
  // người kia vẫn gửi bình thường (đếm theo từng người)
  assert.equal((await sendHttp(t, b, cid, 'tôi vẫn gửi được')).statusCode, 200);

  const c = await person(t, 'Lặp C');
  const cid2 = await openDm(t, a, c);
  const now = Date.now();
  void now;
  const aa = await person(t, 'Lặp A');
  const cc = await person(t, 'Lặp D');
  const cid3 = await openDm(t, aa, cc);
  for (let i = 0; i < 5; i++) assert.equal((await sendHttp(t, aa, cid3, 'giống hệt')).statusCode, 200);
  const dup = await sendHttp(t, aa, cid3, 'giống hệt');
  assert.equal(dup.statusCode, 429);
  assert.equal(dup.json().error, 'chat_duplicate');
  assert.equal(cid2 !== cid3, true);
});

test('Gửi lại cùng clientMsgId khi đã sát trần tốc độ vẫn trả tin cũ (không tính thêm lượt, không 429)', async () => {
  const a = await person(t, 'Sát A');
  const b = await person(t, 'Sát B');
  const cid = await openDm(t, a, b);
  const first = randomUUID();
  assert.equal((await sendHttp(t, a, cid, 'đầu tiên', first)).statusCode, 200);
  for (let i = 1; i < 20; i++) assert.equal((await sendHttp(t, a, cid, `tin ${i}`)).statusCode, 200);
  assert.equal((await sendHttp(t, a, cid, 'quá trần')).statusCode, 429);
  const again = await sendHttp(t, a, cid, 'đầu tiên', first);
  assert.equal(again.statusCode, 200);
  assert.equal(again.json().duplicate, true);
  assert.equal(again.json().seq, 1);
});
