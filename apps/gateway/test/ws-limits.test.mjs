import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startWs } from './ws-helpers.mjs';
import { RealtimeHub } from '../dist/services/realtime/RealtimeHub.js';

/**
 * Dự án 4 Task 5 — giới hạn và sống còn: khung quá lớn / nhị phân / JSON sai / `t` lạ / spam khung, ping-pong,
 * người nhận chậm, giới hạn handshake theo IP. Khung rác KHÔNG làm sập tiến trình.
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
const stillServing = async (u) => {
  const c = await s.ready(u.id);
  assert.equal(c.closed, null);
  const h = await s.app.inject({ method: 'GET', url: '/healthz' });
  assert.equal(h.statusCode, 200);
};

test('khung quá 16 KB → đóng 1009, Gateway vẫn phục vụ', async () => {
  const u = await s.user();
  const c = await s.ready(u.id);
  c.send(JSON.stringify({ t: 'typing', cid: '11111111-1111-4111-8111-111111111111', pad: 'x'.repeat(17 * 1024) }));
  assert.equal((await c.waitClosed()).code, 1009);
  assert.equal(s.app.realtime.isOnline(u.id), false);
  await stillServing(await s.user());
});

test('khung nhị phân / JSON sai / t lạ / khung của server / thừa trường → đóng, không ném lỗi', async () => {
  const u = await s.user();
  const cid = '11111111-1111-4111-8111-111111111111';
  const cases = [
    ['nhị phân', (c) => c.sendBinary(Buffer.from([1, 2, 3])), 1003],
    ['json sai', (c) => c.send('{"t":'), 1007],
    ['không phải object', (c) => c.send('[1,2,3]'), 1007],
    ['thiếu t', (c) => c.send({ cid }), 1007],
    ['t lạ', (c) => c.send({ t: 'rm_rf' }), 1007],
    ['khung server gửi từ client', (c) => c.send({ t: 'msg', message: {} }), 1007],
    ['thừa trường', (c) => c.send({ t: 'typing', cid, extra: 1 }), 1007],
    ['gửi tin qua ws (không có)', (c) => c.send({ t: 'send', body: 'hi' }), 1007],
    ['hello lần hai', (c) => c.send({ t: 'hello', v: 1, token: 'x'.repeat(30), build: 1, device: cid }), 1008]
  ];
  for (const [name, act, code] of cases) {
    const c = await s.ready(u.id);
    act(c);
    assert.equal((await c.waitClosed()).code, code, name);
  }
  await stillServing(u);
});

test('hơn 30 khung/giây → đóng 4429', async () => {
  const u = await s.user();
  const c = await s.ready(u.id);
  for (let i = 0; i < 40; i += 1) c.send({ t: 'visibility', foreground: i % 2 === 0 });
  assert.equal((await c.waitClosed()).code, 4429);
  // đủ 30 khung thì chưa sao; sang giây mới đếm lại
  const d = await s.ready(u.id);
  for (let i = 0; i < 25; i += 1) d.send({ t: 'pong' });
  await sleep(200);
  s.clock.t += 1_100;
  for (let i = 0; i < 25; i += 1) d.send({ t: 'pong' });
  await sleep(250);
  assert.equal(d.closed, null);
});

test('ping mỗi 25 giây; có pong thì sống; im 60 giây thì đóng', async () => {
  const u = await s.user();
  const quiet = await s.ready(u.id);
  const chatty = await s.ready(u.id);
  s.clock.t += 24_900;
  s.app.realtime.sweep();
  assert.equal(quiet.frames.filter((f) => f.t === 'ping').length, 0);
  s.clock.t += 200;
  s.app.realtime.sweep();
  await quiet.waitFrame((f) => f.t === 'ping');
  await chatty.waitFrame((f) => f.t === 'ping');
  chatty.send({ t: 'pong' });
  await sleep(100);
  s.clock.t += 30_000; // quiet im 55 giây tính từ ping đầu → chưa đóng
  s.app.realtime.sweep();
  chatty.send({ t: 'pong' });
  await sleep(100);
  assert.equal(quiet.closed, null);
  s.clock.t += 10_000; // quiet im > 60 giây
  s.app.realtime.sweep();
  assert.equal((await quiet.waitClosed()).code, 4408);
  assert.equal(chatty.closed, null);
});

test('người nhận chậm (bộ đệm gửi > 1 MB) bị đóng; kết nối khác của người đó không bị', async () => {
  const sent = [];
  const closes = [];
  const handlers = {};
  let buffered = 0;
  const fake = () => ({
    readyState: 1,
    get bufferedAmount() {
      return buffered;
    },
    send: (d) => sent.push(d),
    close: (code) => closes.push(code),
    terminate: () => closes.push('terminate'),
    on(ev, fn) {
      handlers[ev] = fn;
      return this;
    }
  });
  const hub = new RealtimeHub({
    verify: async () => ({ ok: true, userId: 'u1', expMs: Date.now() + 900_000 }),
    directory: { typingAudience: async () => [], presenceAudience: async () => [] },
    buildAllowed: () => true,
    sweepMs: 0
  });
  const slow = fake();
  hub.attach(slow, {});
  handlers.message(Buffer.from(JSON.stringify({ t: 'hello', v: 1, token: 'x'.repeat(30), build: 1, device: '11111111-1111-4111-8111-111111111111' })), false);
  await sleep(50);
  assert.ok(hub.isOnline('u1'));
  buffered = 2 * 2 ** 20;
  hub.publish(['u1'], { t: 'ping' });
  assert.equal(closes[0], 1013);
  assert.equal(sent.filter((d) => d.includes('"ping"')).length, 0, 'không gửi thêm cho người nhận chậm');
  hub.dispose();
});

test('giới hạn handshake theo IP (429) — khung không đi qua hook /v1', async () => {
  const s2 = await startWs({ env: { WS_RATE_LIMIT_PER_MINUTE: '3' } });
  const u = await s2.user();
  const results = [];
  for (let i = 0; i < 5; i += 1) {
    const c = s2.connect(u.id, { hello: false });
    results.push(await c.opened);
    c.terminate();
  }
  assert.deepEqual(results, [true, true, true, false, false]);
  await s2.close();
});

test('bão khung rác từ nhiều kết nối không sập tiến trình và không rò kết nối', async () => {
  const before = s.app.realtime.connectionCount;
  const cs = [];
  for (let i = 0; i < 30; i += 1) {
    const c = s.connect(null, { hello: false });
    cs.push(c);
    c.send(['{"t":', Buffer.from('ff00ff', 'hex'), 'x'.repeat(40_000), '{"t":"hello"}', 'null', '"s"'][i % 6]);
  }
  await Promise.all(cs.map((c) => c.waitClosed(4000)));
  await sleep(100);
  assert.equal(s.app.realtime.connectionCount, before);
  assert.deepEqual(s.uncaught, []);
  await stillServing(await s.user());
});
