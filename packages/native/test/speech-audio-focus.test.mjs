import test from 'node:test';
import assert from 'node:assert/strict';

// Web Speech giả (đặt TRƯỚC khi nạp module): speak() chờ test điều khiển
let lastUtterance = null;
const synth = {
  getVoices: () => [{ lang: 'vi-VN' }],
  addEventListener() {},
  removeEventListener() {},
  cancel() {},
  speak(u) {
    lastUtterance = u;
  }
};
globalThis.window = { speechSynthesis: synth };
globalThis.SpeechSynthesisUtterance = class {
  constructor(text) {
    this.text = text;
  }
};

const { isAudioBusy } = await import('@vietlearning/shared/audio/focus');
const { getDeviceSpeech } = await import('../dist/index.js');
const flush = () => new Promise((r) => setImmediate(r));

test('đang đọc ⇒ bận; đọc xong ⇒ hết bận', async () => {
  const p = getDeviceSpeech().speak('xin chào');
  await flush();
  assert.equal(isAudioBusy(), true);
  lastUtterance.onend();
  await p;
  assert.equal(isAudioBusy(), false);
});

test('lỗi khi đọc ⇒ hết bận', async () => {
  const p = getDeviceSpeech().speak('xin chào');
  await flush();
  lastUtterance.onerror({ error: 'synthesis-failed' });
  await assert.rejects(p);
  assert.equal(isAudioBusy(), false);
});

test('stop() giữa chừng ⇒ hết bận', async () => {
  const p = getDeviceSpeech().speak('xin chào');
  await flush();
  assert.equal(isAudioBusy(), true);
  await getDeviceSpeech().stop();
  lastUtterance.onerror({ error: 'canceled' });
  await assert.rejects(p);
  assert.equal(isAudioBusy(), false);
});

test('lượt mới thay lượt cũ ⇒ vẫn bận đúng một lần, xong lượt mới là hết bận', async () => {
  const p1 = getDeviceSpeech().speak('một');
  await flush();
  const u1 = lastUtterance;
  const p2 = getDeviceSpeech().speak('hai');
  await flush();
  u1.onerror({ error: 'interrupted' });
  await assert.rejects(p1);
  assert.equal(isAudioBusy(), true, 'lượt hai còn đang đọc');
  lastUtterance.onend();
  await p2;
  assert.equal(isAudioBusy(), false);
});

test('không có giọng tiếng Việt (ném lỗi sớm) ⇒ hết bận', async () => {
  synth.getVoices = () => [{ lang: 'en-US' }];
  await assert.rejects(getDeviceSpeech().speak('xin chào'));
  assert.equal(isAudioBusy(), false);
  synth.getVoices = () => [{ lang: 'vi-VN' }];
});
