import test from 'node:test';
import assert from 'node:assert/strict';
import { configureGateway } from '../dist/index.js';
import { createSocialClient, createMemoryStore, buildTimeline } from '../dist/social/index.js';
import { makeFakeWebSocket, fakeScheduler, fakeVisibility, flush, CID, U1, msg, page, mid, cmid } from './social-helpers.mjs';

const realFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = realFetch;
});
const json = (o, status = 200) => new Response(JSON.stringify(o), { status });

/** Gateway giả tối thiểu: kho tin + idempotent theo clientMsgId; `down` = rớt mạng */
function boot() {
  const gw = { down: false, msgs: [], seen: new Map(), requests: [] };
  globalThis.fetch = async (url, init) => {
    const u = String(url).replace('http://gw.test', '');
    gw.requests.push(`${init.method} ${u}`);
    if (gw.down) throw new TypeError('fetch failed');
    if (init.method === 'POST' && u.endsWith('/messages')) {
      const req = JSON.parse(init.body);
      let rec = gw.seen.get(req.clientMsgId);
      const dup = !!rec;
      if (!rec) {
        const seq = gw.msgs.length + 1;
        rec = { id: mid(seq), seq, createdAt: '2026-11-26T01:00:00.000Z' };
        gw.seen.set(req.clientMsgId, rec);
        gw.msgs.push(msg(seq, CID, { mine: true, body: req.body }));
      }
      return json(dup ? { ...rec, duplicate: true } : rec);
    }
    if (u.includes('/messages?')) {
      const after = Number(new URL('http://x' + u).searchParams.get('afterSeq') ?? 0);
      return json(page(gw.msgs.filter((m) => m.seq > after)));
    }
    if (u.startsWith('/v1/chat/conversations')) {
      return json({ conversations: [{ id: CID, kind: 'dm', title: null, lastSeq: gw.msgs.length, unread: 0, muted: false }], nextCursor: null });
    }
    return json({}, 404);
  };
  configureGateway({ baseUrl: 'http://gw.test', timeoutMs: 500, getToken: async () => 'tok-' + 'a'.repeat(20) });
  const WebSocket = makeFakeWebSocket();
  const scheduler = fakeScheduler();
  const visibility = fakeVisibility(true);
  const client = createSocialClient({
    realtime: { WebSocket, scheduler, visibility, random: () => 1, url: 'ws://gw.test/ws', device: U1, build: 1, getToken: async () => 'tok-' + 'a'.repeat(20), refreshToken: async () => null },
    outbox: { store: createMemoryStore(), scheduler, random: () => 1 }
  });
  const last = () => WebSocket.instances.at(-1);
  async function online() {
    client.start();
    await flush();
    last().open();
    await flush();
    last().receive({ t: 'hello_ok', serverTime: '2026-11-26T01:00:00.000Z', expSec: 900 });
    await flush();
  }
  return { gw, client, last, online, scheduler, WebSocket };
}

test('khung msg thiếu → giao diện nhận đúng thứ tự không trùng, bù bằng REST afterSeq', async () => {
  const s = boot();
  s.gw.msgs.push(msg(1), msg(2), msg(3), msg(4), msg(5), msg(6), msg(7), msg(8));
  s.client.sync.track(CID, 5);
  const seen = [];
  s.client.subscribe(CID, (e) => e.type === 'message' && seen.push(e.message.seq));
  await s.online();
  s.last().receive({ t: 'msg', message: msg(8) });
  await s.client.sync.idle();
  assert.deepEqual(seen, [6, 7, 8]);
  assert.equal(s.gw.requests.filter((r) => r.includes('afterSeq=5')).length, 1);
});

test('mất mạng khi gửi → vào hàng đợi; nối lại → gửi lại cùng clientMsgId; đúng một tin; tin của mình không hiện hai lần', async () => {
  const s = boot();
  await s.online();
  s.gw.down = true;
  const events = [];
  s.client.subscribe(CID, (e) => events.push(e));
  await s.client.send({ cid: CID, clientMsgId: cmid(1), kind: 'text', body: 'chào' });
  await flush();
  assert.equal(s.client.outbox.pending(CID).length, 1);
  assert.equal(s.gw.msgs.length, 0);
  s.gw.down = false;
  await s.scheduler.advance(1000); // hẹn giờ gửi lại
  assert.equal(s.client.outbox.pending(CID).length, 0);
  assert.equal(s.gw.msgs.length, 1);
  // WS cũng đẩy chính tin đó về: sync nhận (seq=1) và sent báo cùng id
  s.last().receive({ t: 'msg', message: s.gw.msgs[0] });
  await flush();
  const ids = new Set();
  const confirmed = [];
  for (const e of events) {
    if (e.type === 'sent') ids.add(e.clientMsgId);
    if (e.type === 'message') confirmed.push(e.message);
  }
  const tl = buildTimeline([...confirmed, ...confirmed], s.client.outbox.pending(CID), ids);
  assert.equal(tl.length, 1);
  assert.equal(tl[0].kind, 'message');
});

test('buildTimeline: tin có seq theo seq, tin chờ/lỗi nằm cuối theo thứ tự soạn', () => {
  const pend = (n, t, status = 'pending') => ({ cid: CID, clientMsgId: cmid(n), kind: 'text', body: 'p' + n, status, attempts: 0, createdAt: t });
  const tl = buildTimeline([msg(3), msg(1), msg(2)], [pend(2, 20), pend(1, 10, 'failed')]);
  assert.deepEqual(tl.map((x) => (x.kind === 'message' ? `m${x.message.seq}` : `p${x.item.body}`)), ['m1', 'm2', 'm3', 'pp1', 'pp2']);
});

test('nối lại → tự bù (resync) tin lỡ lúc mất kết nối', async () => {
  const s = boot();
  s.client.sync.track(CID, 0);
  const seen = [];
  s.client.subscribe(CID, (e) => e.type === 'message' && seen.push(e.message.seq));
  await s.online();
  s.last().serverClose(1006);
  await flush();
  s.gw.msgs.push(msg(1), msg(2)); // tin đến lúc mất kết nối
  await s.scheduler.advance(1000);
  s.last().open();
  await flush();
  s.last().receive({ t: 'hello_ok', serverTime: '2026-11-26T01:00:00.000Z', expSec: 900 });
  await flush();
  await s.client.sync.idle();
  assert.deepEqual(seen, [1, 2]);
});

test('khung thường (typing/read) tới giao diện của đúng cuộc; stop() dừng hẳn', async () => {
  const s = boot();
  await s.online();
  const got = [];
  s.client.subscribe(CID, (e) => e.type === 'frame' && got.push(e.frame.t));
  s.last().receive({ t: 'typing', cid: CID, userId: U1 });
  s.last().receive({ t: 'typing', cid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', userId: U1 });
  assert.deepEqual(got, ['typing']);
  s.client.stop();
  await flush();
  assert.equal(s.client.realtime.state, 'idle');
});
