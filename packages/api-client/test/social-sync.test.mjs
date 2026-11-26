import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationSync } from '../dist/social/sync.js';
import { CID, CID2, msg, page, flush } from './social-helpers.mjs';

/** REST giả: `server` là kho tin theo cid; có thể chặn/ép lỗi */
function setup({ server = {}, conversations = [] } = {}) {
  const calls = [];
  const gate = { block: null, fail: false };
  const sync = createConversationSync({
    listMessages: async (cid, q) => {
      calls.push({ cid, ...q });
      if (gate.block) await gate.block;
      if (gate.fail) throw new Error('offline');
      const all = (server[cid] ?? []).filter((m) => m.seq > (q.afterSeq ?? 0)).sort((a, b) => a.seq - b.seq);
      const slice = all.slice(0, q.limit ?? 100);
      return page(slice, all.length > slice.length);
    },
    listConversations: async () => conversations
  });
  const got = [];
  sync.onMessage((e) => got.push(`${e.cid === CID ? 'A' : 'B'}${e.message.seq}`));
  return { sync, calls, got, gate, server };
}

test('đúng lastSeq+1 => nhận ngay, không gọi REST', async () => {
  const s = setup();
  s.sync.track(CID, 5);
  s.sync.handleFrame({ t: 'msg', message: msg(6) });
  assert.deepEqual(s.got, ['A6']);
  assert.equal(s.calls.length, 0);
  assert.equal(s.sync.lastSeq(CID), 6);
});

test('thiếu (5 → 8): gọi REST afterSeq=5 đúng MỘT lần; danh sách cuối 6,7,8 đúng thứ tự, không trùng', async () => {
  const s = setup({ server: { [CID]: [msg(6), msg(7), msg(8)] } });
  s.sync.track(CID, 5);
  s.sync.handleFrame({ t: 'msg', message: msg(8) });
  await s.sync.idle();
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].afterSeq, 5);
  assert.deepEqual(s.got, ['A6', 'A7', 'A8']);
  assert.equal(s.sync.lastSeq(CID), 8);
});

test('khung trùng (seq ≤ lastSeq) bị bỏ', async () => {
  const s = setup();
  s.sync.track(CID, 5);
  s.sync.handleFrame({ t: 'msg', message: msg(5) });
  s.sync.handleFrame({ t: 'msg', message: msg(3) });
  s.sync.handleFrame({ t: 'msg', message: msg(6) });
  s.sync.handleFrame({ t: 'msg', message: msg(6) });
  assert.deepEqual(s.got, ['A6']);
});

test('đến sai thứ tự (7 trước 6): bù một lần, ra 6 rồi 7', async () => {
  const s = setup({ server: { [CID]: [msg(6), msg(7)] } });
  s.sync.track(CID, 5);
  s.sync.handleFrame({ t: 'msg', message: msg(7) });
  s.sync.handleFrame({ t: 'msg', message: msg(6) }); // tới trong lúc đang bù
  await s.sync.idle();
  assert.deepEqual(s.got, ['A6', 'A7']);
  assert.equal(s.calls.length, 1);
});

test('khung đến trong lúc đang bù được xếp hàng, áp theo thứ tự sau khi bù xong', async () => {
  const s = setup({ server: { [CID]: [msg(6), msg(7), msg(8)] } });
  let release;
  s.gate.block = new Promise((r) => (release = r));
  s.sync.track(CID, 5);
  s.sync.handleFrame({ t: 'msg', message: msg(8) });
  await flush();
  s.sync.handleFrame({ t: 'msg', message: msg(9) }); // tới giữa lúc bù
  assert.deepEqual(s.got, []);
  s.server[CID].push(msg(9));
  release();
  await s.sync.idle();
  assert.deepEqual(s.got, ['A6', 'A7', 'A8', 'A9']);
});

test('máy chủ chỉ trả tới 7 còn 8 nằm ở bộ đệm => vẫn ra đủ 6,7,8', async () => {
  const s = setup({ server: { [CID]: [msg(6), msg(7)] } });
  s.sync.track(CID, 5);
  s.sync.handleFrame({ t: 'msg', message: msg(8) });
  await s.sync.idle();
  assert.deepEqual(s.got, ['A6', 'A7', 'A8']);
});

test('lỗ lớn nhiều trang: bù từng trang tiếp nối afterSeq', async () => {
  const many = Array.from({ length: 250 }, (_, i) => msg(i + 2));
  const s = setup({ server: { [CID]: many } });
  s.sync.track(CID, 1);
  s.sync.handleFrame({ t: 'msg', message: msg(251) });
  await s.sync.idle();
  assert.equal(s.got.length, 250);
  assert.deepEqual(s.calls.map((c) => c.afterSeq), [1, 101, 201]);
  assert.equal(s.sync.lastSeq(CID), 251);
});

test('REST lỗi (mất mạng giữa chừng): không áp tin lệch, giữ bộ đệm; resync() sau đó bù đủ', async () => {
  const s = setup({
    server: { [CID]: [msg(6), msg(7), msg(8)] },
    conversations: [{ id: CID, kind: 'dm', title: null, lastSeq: 8, unread: 3, muted: false }]
  });
  const errors = [];
  s.sync.onError((e) => errors.push(e));
  s.gate.fail = true;
  s.sync.track(CID, 5);
  s.sync.handleFrame({ t: 'msg', message: msg(8) });
  await s.sync.idle();
  assert.deepEqual(s.got, []);
  assert.equal(errors.length, 1);
  assert.equal(s.sync.lastSeq(CID), 5);
  s.gate.fail = false;
  await s.sync.resync();
  assert.deepEqual(s.got, ['A6', 'A7', 'A8']);
});

test('resync: chỉ bù cuộc có lastSeq máy chủ lớn hơn; cuộc chưa theo dõi được báo qua onConversations', async () => {
  const conversations = [
    { id: CID, kind: 'dm', title: null, lastSeq: 7, unread: 1, muted: false },
    { id: CID2, kind: 'dm', title: null, lastSeq: 4, unread: 0, muted: false }
  ];
  const s = setup({ server: { [CID]: [msg(6), msg(7)], [CID2]: [msg(4, CID2)] }, conversations });
  s.sync.track(CID, 5);
  s.sync.track(CID2, 4);
  const list = [];
  s.sync.onConversations((c) => list.push(c));
  await s.sync.resync();
  assert.deepEqual(s.got, ['A6', 'A7']);
  assert.equal(s.calls.length, 1);
  assert.equal(list.length, 1);
  assert.equal(list[0].length, 2);
});

test('cuộc chưa theo dõi: nhận khung msg và bắt đầu theo dõi từ seq đó (giao diện tải trang bằng REST khi mở)', async () => {
  const s = setup();
  s.sync.handleFrame({ t: 'msg', message: msg(12) });
  assert.deepEqual(s.got, ['A12']);
  assert.equal(s.sync.lastSeq(CID), 12);
  assert.equal(s.calls.length, 0);
});

test('track không lùi lastSeq', async () => {
  const s = setup();
  s.sync.track(CID, 10);
  s.sync.track(CID, 4);
  assert.equal(s.sync.lastSeq(CID), 10);
});

test('hai cuộc trò chuyện độc lập: lỗ ở A không chặn B', async () => {
  const s = setup({ server: { [CID]: [msg(6), msg(7)] } });
  let release;
  s.gate.block = new Promise((r) => (release = r));
  s.sync.track(CID, 5);
  s.sync.track(CID2, 1);
  s.sync.handleFrame({ t: 'msg', message: msg(7) });
  s.sync.handleFrame({ t: 'msg', message: msg(2, CID2) });
  assert.deepEqual(s.got, ['B2']);
  release();
  await s.sync.idle();
  assert.deepEqual(s.got, ['B2', 'A6', 'A7']);
});

test('khung không phải msg bị bỏ qua; người nghe lỗi không làm hỏng luồng', async () => {
  const s = setup();
  s.sync.onMessage(() => {
    throw new Error('giao diện lỗi');
  });
  s.sync.track(CID, 1);
  s.sync.handleFrame({ t: 'typing', cid: CID, userId: 'x' });
  s.sync.handleFrame({ t: 'msg', message: msg(2) });
  s.sync.handleFrame({ t: 'msg', message: msg(3) });
  assert.deepEqual(s.got, ['A2', 'A3']);
});
