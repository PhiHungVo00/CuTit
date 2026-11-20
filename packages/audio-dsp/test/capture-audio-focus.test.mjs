import test from 'node:test';
import assert from 'node:assert/strict';
import { isAudioBusy } from '@vietlearning/shared/audio/focus';
import { AudioCaptureBridge } from '../dist/index.js';

const rec = { pcm: new Float32Array(4), sampleRate: 16000, durationMs: 10 };
const driver = (over = {}) => ({ start: async () => {}, stop: async () => rec, cancel() {}, ...over });

test('bắt đầu thu ⇒ bận; finish ⇒ hết bận', async () => {
  const b = new AudioCaptureBridge(driver());
  await b.record();
  assert.equal(isAudioBusy(), true);
  await b.finish();
  assert.equal(isAudioBusy(), false);
});

test('micro bị từ chối (start ném lỗi) ⇒ hết bận', async () => {
  const b = new AudioCaptureBridge(
    driver({
      start: async () => {
        throw new Error('permission-denied');
      }
    })
  );
  await assert.rejects(b.record());
  assert.equal(isAudioBusy(), false);
});

test('cancel ⇒ hết bận; finish lỗi cũng hết bận', async () => {
  const b = new AudioCaptureBridge(driver());
  await b.record();
  b.cancel();
  assert.equal(isAudioBusy(), false);

  const b2 = new AudioCaptureBridge(
    driver({
      stop: async () => {
        throw new Error('x');
      }
    })
  );
  await b2.record();
  await assert.rejects(b2.finish());
  assert.equal(isAudioBusy(), false);
});

test('đã bận NGAY khi gọi record() (trước khi micro mở) để nhạc hạ sớm', async () => {
  let busyDuringStart = false;
  const b = new AudioCaptureBridge(
    driver({
      start: async () => {
        busyDuringStart = isAudioBusy();
      }
    })
  );
  await b.record();
  assert.equal(busyDuringStart, true);
  b.cancel();
});

test('record() hai lần liên tiếp rồi cancel một lần ⇒ không kẹt bận', async () => {
  const b = new AudioCaptureBridge(driver());
  await b.record();
  await b.record();
  b.cancel();
  assert.equal(isAudioBusy(), false);
});
