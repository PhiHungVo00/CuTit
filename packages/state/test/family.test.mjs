import test from 'node:test';
import assert from 'node:assert/strict';
import { familyStore, hashPin, verifyPin, isValidPin, lockMs } from '../dist/family.js';

const s = () => familyStore.getState();
test.beforeEach(() => s().resetFamily());

test('PIN phụ huynh: chỉ lưu muối + PBKDF2 (không có PIN thô), kiểm tra đúng/sai', async () => {
  const rec = await hashPin('2580', 1000);
  assert.ok(!JSON.stringify(rec).includes('2580'));
  assert.equal(await verifyPin('2580', rec), true);
  assert.equal(await verifyPin('2581', rec), false);
  const again = await hashPin('2580', 1000);
  assert.notEqual(again.hash, rec.hash, 'muối ngẫu nhiên => băm khác nhau');
  assert.equal(isValidPin('123'), false);
  assert.equal(isValidPin('1234'), true);
  assert.equal(isValidPin('12a4'), false);
});

test('sai PIN nhiều lần => khóa tăng dần; đúng => mở khóa', () => {
  const t = 1_000_000;
  for (let i = 0; i < 3; i++) s().recordAttempt(false, t);
  assert.equal(s().lockedUntil, 0, '3 lần sai đầu không khóa');
  s().recordAttempt(false, t);
  assert.equal(s().lockedUntil, t + 30_000);
  s().recordAttempt(false, t);
  assert.equal(s().lockedUntil, t + 60_000);
  assert.equal(lockMs(100), 15 * 60_000);
  s().recordAttempt(true, t);
  assert.deepEqual([s().failedAttempts, s().lockedUntil], [0, 0]);
});

test('chế độ trẻ: người lớn luôn được gửi media; trẻ theo đồng ý của phụ huynh; tên chỉ trên máy', () => {
  s().setAccount({ mode: 'child', mediaConsent: false, activeChildId: 'c1' });
  assert.equal(s().mode, 'child');
  assert.equal(s().mediaConsent, false);
  s().setAccount({ mode: 'adult', mediaConsent: false, childCount: 2 });
  assert.equal(s().mediaConsent, true);
  assert.equal(s().activeChildId, null);
  assert.equal(s().childCount, 2);
  s().setName('c1', '  Bin  ');
  assert.equal(s().names.c1, 'Bin');
  s().forgetChild('c1');
  assert.equal(s().names.c1, undefined);
  assert.equal(s().childCount, 1);
});
