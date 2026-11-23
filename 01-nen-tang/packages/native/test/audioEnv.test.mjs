import test from 'node:test';
import assert from 'node:assert/strict';

const { getAudioEnv } = await import('../dist/index.js');

test('web: không im lặng', async () => {
  assert.equal(await getAudioEnv().isSilent(), false);
});

test('web: onFocusLost trả hàm hủy gọi được, không ném', () => {
  const off = getAudioEnv().onFocusLost(() => assert.fail('web không mất focus'));
  assert.equal(typeof off, 'function');
  off();
  off();
});
