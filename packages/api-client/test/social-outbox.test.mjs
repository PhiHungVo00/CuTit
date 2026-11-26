import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutbox, createMemoryStore, createLocalStorageStore } from '../dist/social/outbox.js';
import { GatewayRequestError } from '../dist/index.js';
import { fakeScheduler, flush, CID, CID2, cmid, mid } from './social-helpers.mjs';

const off = () => new GatewayRequestError('offline', 'Lỗi mạng');
const rej = (code, status = 403) => new GatewayRequestError('invalid-request', 'x', status, code);

/** Máy chủ giả: nhớ clientMsgId đã nhận (idempotent như Gateway thật) */
function setup(over = {}) {
  const server = { seen: new Map(), seq: 0, sends: [], uploads: 0, failNext: [], lostReply: 0 };
  const rest = {
    async sendMessage(cid, req) {
      server.sends.push({ cid, ...req });
      const fail = server.failNext.shift();
      if (fail === 'offline') throw off();
      if (fail instanceof Error) throw fail;
      let dup = true;
      let rec = server.seen.get(req.clientMsgId);
      if (!rec) {
        dup = false;
        rec = { id: mid(++server.seq), seq: server.seq, createdAt: '2026-11-26T01:00:00.000Z' };
        server.seen.set(req.clientMsgId, rec);
      }
      if (server.lostReply > 0) {
        server.lostReply--;
        throw off(); // máy chủ đã nhận nhưng phản hồi mất
      }
      return dup ? { ...rec, duplicate: true } : rec;
    },
    async uploadAttachment() {
      server.uploads++;
      return { attachmentId: `eeeeeeee-eeee-4eee-8eee-${String(server.uploads).padStart(12, '0')}` };
    }
  };
  const scheduler = fakeScheduler();
  const store = over.store ?? createMemoryStore();
  const ob = createOutbox({ rest, store, scheduler, random: () => 1 });
  const sent = [];
  ob.onSent((e) => sent.push(e));
  return { ob, server, sent, scheduler, store };
}

test('enqueue + flush: gửi đúng clientMsgId, xong thì rời hàng đợi và báo sent', async () => {
  const s = setup();
  await s.ob.enqueue({ cid: CID, clientMsgId: cmid(1), kind: 'text', body: 'xin chào' });
  await s.ob.flush();
  assert.equal(s.server.sends.length, 1);
  assert.equal(s.server.sends[0].clientMsgId, cmid(1));
  assert.equal(s.ob.pending().length, 0);
  assert.equal(s.sent.length, 1);
  assert.equal(s.sent[0].clientMsgId, cmid(1));
  assert.equal(s.sent[0].seq, 1);
});

test('mất mạng khi gửi: tin vào hàng đợi (còn pending), nối lại => gửi lại CÙNG clientMsgId, chỉ một tin', async () => {
  const s = setup();
  s.server.failNext.push('offline');
  await s.ob.enqueue({ cid: CID, clientMsgId: cmid(1), kind: 'text', body: 'a' });
  await s.ob.flush();
  assert.equal(s.ob.pending().length, 1);
  assert.equal(s.ob.pending()[0].status, 'pending');
  assert.equal(s.sent.length, 0);
  await s.ob.flush();
  assert.deepEqual(s.server.sends.map((x) => x.clientMsgId), [cmid(1), cmid(1)]);
  assert.equal(s.server.seen.size, 1);
  assert.equal(s.sent.length, 1);
});

test('máy chủ đã nhận nhưng phản hồi mất => gửi lại ra duplicate, giao diện thấy đúng MỘT tin', async () => {
  const s = setup();
  s.server.lostReply = 1;
  await s.ob.enqueue({ cid: CID, clientMsgId: cmid(7), kind: 'text', body: 'a' });
  await s.ob.flush();
  assert.equal(s.sent.length, 0);
  await s.ob.flush();
  assert.equal(s.server.seq, 1, 'máy chủ chỉ tạo một tin');
  assert.equal(s.sent.length, 1);
  assert.equal(s.sent[0].id, mid(1));
});

test('thứ tự: trong một cuộc gửi tuần tự; lỗi mạng ở tin đầu dừng cả cuộc (không nhảy cóc), cuộc khác vẫn chạy', async () => {
  const s = setup();
  await s.ob.enqueue({ cid: CID, clientMsgId: cmid(1), kind: 'text', body: '1' });
  await s.ob.enqueue({ cid: CID, clientMsgId: cmid(2), kind: 'text', body: '2' });
  await s.ob.enqueue({ cid: CID2, clientMsgId: cmid(3), kind: 'text', body: '3' });
  s.ob.pending().length; // đã vào hàng đợi
  s.server.sends.length = 0;
  s.server.failNext.push('offline'); // tin 1 (CID) lỗi mạng
  await s.ob.flush();
  const ids = s.server.sends.map((x) => x.clientMsgId);
  assert.ok(ids.includes(cmid(1)));
  assert.ok(!ids.includes(cmid(2)), 'tin 2 không được vượt tin 1');
  assert.ok(ids.includes(cmid(3)));
  await s.ob.flush();
  assert.equal(s.ob.pending().length, 0);
  const order = s.sent.filter((x) => x.cid === CID).map((x) => x.clientMsgId);
  assert.deepEqual(order, [cmid(1), cmid(2)]);
});

test('lỗi vĩnh viễn (bị chặn / không phải thành viên) => status failed + mã, giữ để "Gửi lại", tin sau vẫn đi', async () => {
  const s = setup();
  s.server.failNext.push(rej('blocked'));
  await s.ob.enqueue({ cid: CID, clientMsgId: cmid(1), kind: 'text', body: '1' });
  await s.ob.enqueue({ cid: CID, clientMsgId: cmid(2), kind: 'text', body: '2' });
  await s.ob.flush();
  const p = s.ob.pending();
  assert.equal(p.length, 1);
  assert.equal(p[0].clientMsgId, cmid(1));
  assert.equal(p[0].status, 'failed');
  assert.equal(p[0].error, 'blocked');
  assert.equal(s.sent.length, 1);
  // flush lại không tự gửi tin đã failed
  await s.ob.flush();
  assert.equal(s.server.sends.filter((x) => x.clientMsgId === cmid(1)).length, 1);
  // bấm "Gửi lại" => cùng clientMsgId
  await s.ob.retry(cmid(1));
  assert.equal(s.ob.pending().length, 0);
  assert.equal(s.server.sends.filter((x) => x.clientMsgId === cmid(1)).length, 2);
});

test('chat_rate (429) là tạm thời: giữ pending và hẹn gửi lại', async () => {
  const s = setup();
  s.server.failNext.push(new GatewayRequestError('quota', 'x', 429, 'chat_rate'));
  await s.ob.enqueue({ cid: CID, clientMsgId: cmid(1), kind: 'text', body: '1' });
  await s.ob.flush();
  assert.equal(s.ob.pending()[0].status, 'pending');
  await s.scheduler.advance(1000);
  assert.equal(s.ob.pending().length, 0);
});

test('lỗi mạng => tự hẹn gửi lại có lùi (không cần ai gọi flush)', async () => {
  const s = setup();
  s.server.failNext.push('offline', 'offline');
  await s.ob.enqueue({ cid: CID, clientMsgId: cmid(1), kind: 'text', body: '1' });
  await s.ob.flush();
  assert.deepEqual(s.scheduler.pending(), [1000]);
  await s.scheduler.advance(1000);
  assert.deepEqual(s.scheduler.pending(), [2000]);
  await s.scheduler.advance(2000);
  assert.equal(s.ob.pending().length, 0);
  assert.deepEqual(s.scheduler.pending(), []);
});

test('401 sau khi client đã thử làm mới (unauthorized) => dừng, KHÔNG đánh failed', async () => {
  const s = setup();
  s.server.failNext.push(new GatewayRequestError('unauthorized', 'x', 401));
  await s.ob.enqueue({ cid: CID, clientMsgId: cmid(1), kind: 'text', body: '1' });
  await s.ob.flush();
  assert.equal(s.ob.pending()[0].status, 'pending');
});

test('enqueue trùng clientMsgId => không thêm bản thứ hai', async () => {
  const s = setup();
  s.server.failNext.push('offline');
  await s.ob.enqueue({ cid: CID, clientMsgId: cmid(1), kind: 'text', body: 'a' });
  await s.ob.enqueue({ cid: CID, clientMsgId: cmid(1), kind: 'text', body: 'a' });
  assert.equal(s.ob.pending().length, 1);
});

test('enqueue sai schema (tin trống / quá dài / không phải uuid) => từ chối ngay, không vào hàng đợi', async () => {
  const s = setup();
  await assert.rejects(s.ob.enqueue({ cid: CID, clientMsgId: cmid(1), kind: 'text', body: '   ' }));
  await assert.rejects(s.ob.enqueue({ cid: CID, clientMsgId: cmid(2), kind: 'text', body: 'x'.repeat(4001) }));
  await assert.rejects(s.ob.enqueue({ cid: CID, clientMsgId: 'khong-phai-uuid', kind: 'text', body: 'a' }));
  assert.equal(s.ob.pending().length, 0);
});

test('tệp: tải lên MỘT lần; gửi tin lỗi mạng rồi nối lại không tải lại, dùng lại attachmentId', async () => {
  const s = setup();
  s.server.failNext.push('offline');
  await s.ob.enqueue({ cid: CID, clientMsgId: cmid(1), kind: 'image', blob: { size: 10 } });
  await s.ob.flush();
  assert.equal(s.server.uploads, 1);
  assert.ok(s.ob.pending()[0].attachmentId);
  await s.ob.flush();
  assert.equal(s.server.uploads, 1);
  assert.equal(s.server.sends.length, 2);
  assert.equal(s.server.sends[0].attachmentId, s.server.sends[1].attachmentId);
  assert.equal(s.server.sends[1].clientMsgId, cmid(1));
});

test('tải tệp lỗi mạng => tải lại lần sau', async () => {
  const s = setup();
  let first = true;
  const orig = s.ob;
  // thay uploadAttachment bằng bản lỗi lần đầu
  const rest = {
    sendMessage: async (cid, req) => ({ id: mid(1), seq: 1, createdAt: '2026-11-26T01:00:00.000Z' }),
    uploadAttachment: async () => {
      if (first) {
        first = false;
        throw off();
      }
      return { attachmentId: 'eeeeeeee-eeee-4eee-8eee-000000000001' };
    }
  };
  const ob = createOutbox({ rest, store: createMemoryStore(), scheduler: fakeScheduler(), random: () => 1 });
  await ob.enqueue({ cid: CID, clientMsgId: cmid(1), kind: 'voice', blob: { size: 5 } });
  await ob.flush();
  assert.equal(ob.pending().length, 1);
  await ob.flush();
  assert.equal(ob.pending().length, 0);
  void orig;
});

test('bền vững: tạo lại Outbox từ kho => tin chờ còn, gửi lại đúng clientMsgId', async () => {
  const store = createMemoryStore();
  const s1 = setup({ store });
  s1.server.failNext.push('offline');
  await s1.ob.enqueue({ cid: CID, clientMsgId: cmid(1), kind: 'text', body: 'còn đó' });
  await s1.ob.flush();
  const s2 = setup({ store });
  await s2.ob.ready;
  assert.equal(s2.ob.pending().length, 1);
  await s2.ob.flush();
  assert.equal(s2.server.sends[0].clientMsgId, cmid(1));
  assert.equal(s2.server.sends[0].body, 'còn đó');
});

test('kho localStorage dự phòng: lưu/đọc JSON; tin tệp (Blob) không lưu được thì bỏ và báo', async () => {
  const mem = new Map();
  const ls = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
  const store = createLocalStorageStore(ls);
  await store.save([
    { cid: CID, clientMsgId: cmid(1), kind: 'text', body: 'a', status: 'pending', attempts: 0, createdAt: 1 },
    { cid: CID, clientMsgId: cmid(2), kind: 'image', blob: { size: 1 }, status: 'pending', attempts: 0, createdAt: 2 }
  ]);
  const back = await store.load();
  assert.equal(back.length, 1);
  assert.equal(back[0].clientMsgId, cmid(1));
  // kho hỏng => rỗng, không ném
  mem.set('becutit.social.outbox', '{hỏng');
  assert.deepEqual(await store.load(), []);
});

test('flush chạy lồng nhau không gửi trùng song song', async () => {
  const s = setup();
  await s.ob.enqueue({ cid: CID, clientMsgId: cmid(1), kind: 'text', body: 'a' });
  await Promise.all([s.ob.flush(), s.ob.flush(), s.ob.flush()]);
  await flush();
  assert.equal(s.server.sends.length, 1);
});

test('attach(realtime): khi chuyển sang online thì tự flush', async () => {
  const s = setup();
  s.server.failNext.push('offline');
  await s.ob.enqueue({ cid: CID, clientMsgId: cmid(1), kind: 'text', body: 'a' });
  await s.ob.flush();
  let cb;
  s.ob.attach({ onState: (f) => ((cb = f), () => {}) });
  cb('online');
  await flush();
  assert.equal(s.ob.pending().length, 0);
});

test('discard: bỏ tin chờ/lỗi khỏi hàng đợi', async () => {
  const s = setup();
  s.server.failNext.push(rej('blocked'));
  await s.ob.enqueue({ cid: CID, clientMsgId: cmid(1), kind: 'text', body: 'a' });
  await s.ob.flush();
  await s.ob.discard(cmid(1));
  assert.equal(s.ob.pending().length, 0);
});
