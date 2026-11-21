import test from 'node:test';
import assert from 'node:assert/strict';

const { acquireAudio, isAudioBusy, onAudioBusyChange } = await import('../dist/audio/index.js');

test('hai nguồn acquire, một release ⇒ vẫn bận; release cả hai ⇒ hết bận', () => {
  const a = acquireAudio('speech');
  const b = acquireAudio('lesson-audio');
  assert.equal(isAudioBusy(), true);
  a();
  assert.equal(isAudioBusy(), true);
  b();
  assert.equal(isAudioBusy(), false);
});

test('gọi release hai lần vô hại (không làm nguồn khác hết bận)', () => {
  const a = acquireAudio('speech');
  const b = acquireAudio('call');
  a();
  a();
  assert.equal(isAudioBusy(), true);
  b();
  assert.equal(isAudioBusy(), false);
});

test('onAudioBusyChange chỉ báo khi trạng thái đổi, hủy đăng ký được', () => {
  const seen = [];
  const off = onAudioBusyChange((v) => seen.push(v));
  const a = acquireAudio('record');
  const b = acquireAudio('speech');
  b();
  a();
  assert.deepEqual(seen, [true, false]);
  off();
  acquireAudio('call')();
  assert.deepEqual(seen, [true, false]);
});
