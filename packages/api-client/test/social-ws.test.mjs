import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealtime } from '../dist/social/ws.js';
import { makeFakeWebSocket, fakeScheduler, fakeVisibility, flush, U1, CID, msg } from './social-helpers.mjs';

function setup(over = {}) {
  const WebSocket = makeFakeWebSocket();
  const scheduler = fakeScheduler();
  const visibility = fakeVisibility(true);
  let tokenN = 0;
  const calls = { refresh: 0, update: [] };
  const rt = createRealtime({
    url: 'ws://gw.test/ws',
    WebSocket,
    scheduler,
    visibility,
    random: () => 1, // không nhiễu: trễ đúng bằng mốc
    build: 1005000,
    device: U1,
    getToken: async () => `tok-${'a'.repeat(20)}-${tokenN}`,
    refreshToken: async () => {
      calls.refresh++;
      tokenN++;
      return `tok-${'a'.repeat(20)}-${tokenN}`;
    },
    onUpdateRequired: (i) => calls.update.push(i),
    ...over
  });
  const states = [];
  const notices = [];
  const frames = [];
  rt.onState((s) => states.push(s));
  rt.onNotice((n) => notices.push(n));
  rt.on((f) => frames.push(f));
  const last = () => WebSocket.instances[WebSocket.instances.length - 1];
  const hello = { t: 'hello_ok', serverTime: '2026-11-26T01:00:00.000Z', expSec: 900 };
  async function goOnline() {
    rt.connect();
    await flush();
    last().open();
    await flush();
    last().receive(hello);
    await flush();
  }
  return { rt, WebSocket, scheduler, visibility, states, notices, frames, last, calls, hello, goOnline };
}

test('mở xong gửi hello ngay (token từ phiên, không nằm trên URL); hello_ok => online', async () => {
  const s = setup();
  s.rt.connect();
  await flush();
  assert.equal(s.rt.state, 'connecting');
  assert.equal(s.last().url, 'ws://gw.test/ws');
  s.last().open();
  await flush();
  const hello = s.last().sent[0];
  assert.equal(hello.t, 'hello');
  assert.equal(hello.v, 1);
  assert.equal(hello.build, 1005000);
  assert.equal(hello.device, U1);
  assert.match(hello.token, /^tok-/);
  assert.equal(s.rt.state, 'connecting');
  s.last().receive(s.hello);
  await flush();
  assert.equal(s.rt.state, 'online');
  assert.deepEqual(s.states, ['connecting', 'online']);
  // báo nền trước cho server (quyết định có đẩy thông báo không)
  assert.deepEqual(s.last().sent[1], { t: 'visibility', foreground: true });
});

test('khung không qua Zod / không phải JSON / quá 16 KB bị bỏ và đếm, luồng vẫn chạy', async () => {
  const s = setup();
  await s.goOnline();
  s.last().receive('không phải json');
  s.last().receive({ t: 'msg', message: { id: 'x' } });
  s.last().receive({ t: 'lạ' });
  s.last().receive('x'.repeat(17 * 1024));
  s.last().receive({ t: 'typing', cid: CID, userId: U1 });
  assert.equal(s.rt.stats().invalid, 4);
  assert.equal(s.frames.length, 2); // hello_ok + typing
  assert.equal(s.frames[1].t, 'typing');
  assert.equal(s.rt.state, 'online');
});

test('server ping => client pong', async () => {
  const s = setup();
  await s.goOnline();
  s.last().receive({ t: 'ping' });
  assert.deepEqual(s.last().sent.at(-1), { t: 'pong' });
});

test('rớt mạng: lùi cấp số nhân 1s→30s, mỗi lần chỉ một socket; hello_ok đặt lại bộ đếm', async () => {
  const s = setup();
  await s.goOnline();
  s.last().serverClose(1006);
  await flush();
  assert.equal(s.rt.state, 'reconnecting');
  const delays = [];
  for (let i = 0; i < 7; i++) {
    const before = s.WebSocket.instances.length;
    const [next] = s.scheduler.pending();
    delays.push(next);
    await s.scheduler.advance(next - 1);
    assert.equal(s.WebSocket.instances.length, before, 'chưa tới hạn thì chưa mở');
    await s.scheduler.advance(1);
    assert.equal(s.WebSocket.instances.length, before + 1);
    s.last().serverClose(1006); // lỗi tiếp
    await flush();
  }
  assert.deepEqual(delays, [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  // nối được => bộ đếm về 0
  await s.scheduler.advance(30000);
  s.last().open();
  await flush();
  s.last().receive(s.hello);
  await flush();
  s.last().serverClose(1006);
  await flush();
  assert.equal(s.scheduler.pending()[0], 1000);
});

test('nhiễu ngẫu nhiên: trễ nằm trong [50%, 100%] mốc', async () => {
  const s = setup({ random: () => 0 });
  await s.goOnline();
  s.last().serverClose(1006);
  await flush();
  assert.equal(s.scheduler.pending()[0], 500);
});

test('ra nền => đóng socket, không hẹn giờ nối lại; trở lại => nối lại', async () => {
  const s = setup();
  await s.goOnline();
  s.visibility.set(false);
  await flush();
  assert.equal(s.rt.state, 'idle');
  assert.equal(s.last().closedBy, 'client');
  assert.deepEqual(s.scheduler.pending(), []);
  const n = s.WebSocket.instances.length;
  await s.scheduler.advance(120_000);
  assert.equal(s.WebSocket.instances.length, n);
  s.visibility.set(true);
  await s.scheduler.advance(1000);
  assert.equal(s.WebSocket.instances.length, n + 1);
  assert.equal(s.rt.state, 'connecting');
});

test('đang ở nền mà connect() => chờ tới khi trở lại', async () => {
  const s = setup();
  s.visibility.set(false);
  s.rt.connect();
  await flush();
  assert.equal(s.WebSocket.instances.length, 0);
  s.visibility.set(true);
  await s.scheduler.advance(1000);
  assert.equal(s.WebSocket.instances.length, 1);
});

test('nối lại dồn dập: ra/vào nền 20 lần trong 1 giây không mở 20 socket', async () => {
  const s = setup();
  await s.goOnline();
  for (let i = 0; i < 20; i++) {
    s.visibility.set(false);
    await flush();
    s.visibility.set(true);
    await s.scheduler.advance(40);
  }
  await s.scheduler.advance(3000);
  assert.ok(s.WebSocket.instances.length <= 3, `mở ${s.WebSocket.instances.length} socket`);
  const open = s.WebSocket.instances.filter((w) => w.readyState !== 3);
  assert.ok(open.length <= 1);
});

test('auth_expiring => làm mới token rồi gửi auth', async () => {
  const s = setup();
  await s.goOnline();
  s.last().receive({ t: 'auth_expiring', inSec: 60 });
  await flush();
  assert.equal(s.calls.refresh, 1);
  const auth = s.last().sent.at(-1);
  assert.equal(auth.t, 'auth');
  assert.match(auth.token, /-1$/);
});

test('4401: làm mới một lần rồi nối lại; 4401 lần nữa chưa kịp hello_ok => signed_out và dừng', async () => {
  const s = setup();
  await s.goOnline();
  s.last().serverClose(4401);
  await flush();
  await s.scheduler.advance(0);
  assert.equal(s.calls.refresh, 1);
  const n = s.WebSocket.instances.length;
  assert.equal(n, 2, 'nối lại ngay sau khi làm mới');
  s.last().open();
  await flush();
  assert.match(s.last().sent[0].token, /-1$/);
  s.last().serverClose(4401);
  await flush();
  await s.scheduler.advance(120_000);
  assert.equal(s.calls.refresh, 1, 'không làm mới lần hai');
  assert.equal(s.WebSocket.instances.length, n, 'không nối lại');
  assert.deepEqual(s.notices, ['signed_out']);
  assert.equal(s.rt.state, 'idle');
});

test('4403 => restricted, không nối lại', async () => {
  const s = setup();
  await s.goOnline();
  s.last().serverClose(4403);
  await flush();
  await s.scheduler.advance(120_000);
  assert.deepEqual(s.notices, ['restricted']);
  assert.equal(s.WebSocket.instances.length, 1);
  assert.equal(s.rt.state, 'idle');
});

test('4426 => update_required + onUpdateRequired của dự án 8, không nối lại', async () => {
  const s = setup();
  await s.goOnline();
  s.last().serverClose(4426);
  await flush();
  await s.scheduler.advance(120_000);
  assert.deepEqual(s.notices, ['update_required']);
  assert.equal(s.calls.update.length, 1);
  assert.equal(s.WebSocket.instances.length, 1);
});

test('4429 (gửi dồn) => nối lại có lùi như lỗi thường', async () => {
  const s = setup();
  await s.goOnline();
  s.last().serverClose(4429);
  await flush();
  assert.equal(s.rt.state, 'reconnecting');
  assert.equal(s.scheduler.pending()[0], 1000);
});

test('không có tin gì 60 giây => tự đóng và nối lại (pong timeout phía client)', async () => {
  const s = setup();
  await s.goOnline();
  await s.scheduler.advance(59_000);
  assert.equal(s.last().readyState, 1);
  s.last().receive({ t: 'ping' }); // có tin => đặt lại đồng hồ
  await s.scheduler.advance(59_000);
  assert.equal(s.last().readyState, 1);
  await s.scheduler.advance(2000);
  assert.equal(s.rt.state, 'reconnecting');
});

test('không nhận hello_ok trong hạn => đóng và nối lại', async () => {
  const s = setup();
  s.rt.connect();
  await flush();
  s.last().open();
  await flush();
  await s.scheduler.advance(11_000);
  assert.equal(s.rt.state, 'reconnecting');
});

test('close() dừng hẳn: không nối lại dù socket đóng', async () => {
  const s = setup();
  await s.goOnline();
  s.rt.close();
  await flush();
  await s.scheduler.advance(120_000);
  assert.equal(s.rt.state, 'idle');
  assert.equal(s.WebSocket.instances.length, 1);
});

test('send: chỉ khung client hợp lệ; offline => false', async () => {
  const s = setup();
  assert.equal(s.rt.send({ t: 'typing', cid: CID }), false);
  await s.goOnline();
  assert.equal(s.rt.send({ t: 'typing', cid: CID }), true);
  assert.throws(() => s.rt.send({ t: 'send_message', body: 'x' }));
});

test('getToken null (chưa có phiên) => signed_out, không online', async () => {
  const s = setup({ getToken: async () => null });
  s.rt.connect();
  await flush();
  s.last().open();
  await flush();
  assert.deepEqual(s.notices, ['signed_out']);
  assert.equal(s.rt.state, 'idle');
});

test('lỗi trong handler người nghe không làm sập luồng', async () => {
  const s = setup();
  s.rt.on(() => {
    throw new Error('lỗi giao diện');
  });
  await s.goOnline();
  s.last().receive({ t: 'typing', cid: CID, userId: U1 });
  assert.equal(s.rt.state, 'online');
  s.last().receive({ t: 'msg', message: msg(1) });
  assert.equal(s.frames.at(-1).t, 'msg');
});

test('connect() lại sau signed_out: trạng thái 4401/backoff được đặt lại (vẫn thử làm mới một lần)', async () => {
  const s = setup();
  await s.goOnline();
  s.last().serverClose(4401);
  await flush();
  s.last().open();
  await flush();
  s.last().serverClose(4401);
  await flush();
  assert.deepEqual(s.notices, ['signed_out']);
  const before = s.calls.refresh;
  s.rt.connect();
  await s.scheduler.advance(1000);
  s.last().open();
  await flush();
  s.last().receive(s.hello);
  await flush();
  s.last().serverClose(4401);
  await flush();
  assert.equal(s.calls.refresh, before + 1, 'lần này vẫn thử làm mới');
});
