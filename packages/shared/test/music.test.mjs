import test from 'node:test';
import assert from 'node:assert/strict';

// ---- giả lập trình duyệt, đặt TRƯỚC khi nạp module ----
const audios = [];
let playImpl = () => Promise.resolve();
class FakeAudio {
  constructor(src) {
    this.src = src ?? '';
    this.volume = 1;
    this.loop = false;
    this.paused = true;
    this.playCalls = 0;
    audios.push(this);
  }
  play() {
    this.playCalls++;
    return playImpl().then((v) => {
      this.paused = false;
      return v;
    });
  }
  pause() {
    this.paused = true;
  }
}
globalThis.Audio = FakeAudio;

const sources = [];
let decodeCalls = 0;
class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.destination = {};
  }
  resume() {
    return Promise.resolve();
  }
  createGain() {
    return { gain: { value: 1 }, connect() {} };
  }
  createBufferSource() {
    const s = {
      buffer: null,
      connect() {},
      start() {
        this.started = true;
      }
    };
    sources.push(s);
    return s;
  }
  decodeAudioData() {
    decodeCalls++;
    return Promise.resolve({ duration: 0.3 });
  }
}
globalThis.AudioContext = FakeAudioContext;
globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });

const docListeners = new Map();
globalThis.document = {
  visibilityState: 'visible',
  addEventListener: (t, cb) => docListeners.set(t, cb),
  removeEventListener: () => {}
};

const { configureAudio, music, acquireAudio, unlockAudio, playSfx, haptic } = await import('../dist/audio/index.js');

const SETTINGS = { sfx: true, haptics: true, music: true, musicTrack: 'sang-lang', musicVolume: 0.5 };
let settings = { ...SETTINGS };
const flush = () => new Promise((r) => setImmediate(r));

function setup(t, patch = {}, env) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: new Date(2026, 10, 20, 9, 0).getTime() });
  audios.length = 0;
  sources.length = 0;
  playImpl = () => Promise.resolve();
  settings = { ...SETTINGS, ...patch };
  document.visibilityState = 'visible';
  configureAudio(() => settings, env);
}

test('nhạc đang phát + acquire record ⇒ volume về 0 rồi pause trong 300 ms; release ⇒ play lại sau 1000 ms', async (t) => {
  setup(t);
  music.start();
  await flush();
  const a = audios[0];
  assert.equal(a.playCalls, 1);
  assert.equal(a.loop, true);
  assert.equal(a.volume, 0.5);

  const release = acquireAudio('record');
  t.mock.timers.tick(300);
  assert.equal(a.volume, 0);
  assert.equal(a.paused, true);

  release();
  t.mock.timers.tick(999);
  await flush();
  assert.equal(a.playCalls, 1, 'chưa phát lại trước 1000 ms');
  t.mock.timers.tick(1);
  await flush();
  assert.equal(a.playCalls, 2);
  assert.equal(a.volume, 0.5, 'phát lại ở âm lượng cài đặt');
  music.stop();
});

test('release rồi acquire lại trong 1000 ms ⇒ không phát lại giữa chừng', async (t) => {
  setup(t);
  music.start();
  await flush();
  const a = audios[0];
  acquireAudio('speech')();
  t.mock.timers.tick(500);
  const r2 = acquireAudio('record');
  t.mock.timers.tick(5000);
  await flush();
  assert.equal(a.playCalls, 1);
  assert.equal(a.paused, true);
  r2();
  music.stop();
});

test('play() bị từ chối (NotAllowedError) ⇒ không ném, không thử lại cho tới unlockAudio()', async (t) => {
  setup(t);
  playImpl = () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
  music.start();
  await flush();
  const a = audios[0];
  assert.equal(a.playCalls, 1);
  acquireAudio('speech')();
  t.mock.timers.tick(5000);
  await flush();
  assert.equal(a.playCalls, 1, 'không phát dồn sau khi hết bận');

  playImpl = () => Promise.resolve();
  unlockAudio();
  await flush();
  assert.equal(a.playCalls, 2);
  music.stop();
});

test("setTrack('rotate') lúc 13:00 ⇒ src chứa chieu-dong", async (t) => {
  setup(t, { musicTrack: 'rotate' });
  t.mock.timers.setTime(new Date(2026, 10, 20, 13, 0).getTime());
  music.start();
  await flush();
  assert.match(audios[0].src, /chieu-dong/);
  music.setTrack('sang-lang');
  assert.match(audios[0].src, /sang-lang/);
  music.setTrack('rotate');
  assert.match(audios[0].src, /chieu-dong/);
  music.stop();
});

test('music tắt trong cài đặt ⇒ start() không tạo nguồn phát', async (t) => {
  setup(t, { music: false });
  music.start();
  await flush();
  assert.equal(audios.length, 0);
});

test('máy đang im lặng (env.isSilent) ⇒ nhạc không bắt đầu', async (t) => {
  setup(t, {}, { isSilent: async () => true });
  music.start();
  await flush();
  assert.equal(audios.every((a) => a.playCalls === 0), true);
});

test('onFocusLost ⇒ nhạc dừng và không tự phát lại tới unlockAudio()', async (t) => {
  let lost = () => {};
  setup(t, {}, {
    onFocusLost: (cb) => {
      lost = cb;
      return () => {};
    }
  });
  music.start();
  await flush();
  const a = audios[0];
  lost();
  assert.equal(a.paused, true);
  acquireAudio('speech')();
  t.mock.timers.tick(5000);
  await flush();
  assert.equal(a.playCalls, 1);
  unlockAudio();
  await flush();
  assert.equal(a.playCalls, 2);
  music.stop();
});

test('trang bị ẩn ⇒ pause; hiện lại ⇒ phát lại', async (t) => {
  setup(t);
  music.start();
  await flush();
  const a = audios[0];
  document.visibilityState = 'hidden';
  docListeners.get('visibilitychange')();
  assert.equal(a.paused, true);
  document.visibilityState = 'visible';
  docListeners.get('visibilitychange')();
  await flush();
  assert.equal(a.playCalls, 2);
  music.stop();
});

test('setVolume kẹp 0..1 và áp lên nguồn đang phát', async (t) => {
  setup(t);
  music.start();
  await flush();
  music.setVolume(2);
  assert.equal(audios[0].volume, 1);
  music.setVolume(-1);
  assert.equal(audios[0].volume, 0);
  music.stop();
});

test('sfx=false ⇒ playSfx không tải, không tạo nguồn phát', async (t) => {
  setup(t, { sfx: false });
  const before = decodeCalls;
  playSfx('cham-nut');
  await flush();
  assert.equal(sources.length, 0);
  assert.equal(decodeCalls, before);
});

test('sfx=true ⇒ playSfx phát đúng một nguồn; đang thu âm ⇒ im', async (t) => {
  setup(t);
  playSfx('dung');
  await flush();
  await flush();
  assert.equal(sources.length, 1);
  assert.equal(sources[0].started, true);

  const release = acquireAudio('record');
  playSfx('dung');
  await flush();
  await flush();
  assert.equal(sources.length, 1, 'không phát hiệu ứng khi đang thu âm');
  release();
});

test('haptic: rung đúng mẫu; tắt cài đặt hoặc không hỗ trợ ⇒ no-op', (t) => {
  setup(t);
  const calls = [];
  Object.defineProperty(globalThis, 'navigator', { value: { vibrate: (p) => calls.push(p) }, configurable: true });
  haptic('nhe');
  haptic('thanh-cong');
  haptic('loi');
  assert.deepEqual(calls, [10, [10, 40, 10], 30]);
  settings = { ...settings, haptics: false };
  haptic('nhe');
  assert.equal(calls.length, 3);
  settings = { ...settings, haptics: true };
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  assert.doesNotThrow(() => haptic('nhe'));
});
