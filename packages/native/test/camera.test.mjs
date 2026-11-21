import test from 'node:test';
import assert from 'node:assert/strict';

const { fitWithin, encodeUnderLimit, toCameraError, CameraError, MAX_SIDE, MAX_BASE64_CHARS, capturePhoto, openPreview, grabFrame } =
  await import('../dist/index.js');

test('ảnh 4000×3000 ⇒ 768×576, không phóng to ảnh nhỏ, ảnh rỗng ⇒ 0', () => {
  assert.equal(MAX_SIDE, 768);
  assert.deepEqual(fitWithin(4000, 3000), { width: 768, height: 576 });
  assert.deepEqual(fitWithin(3000, 4000), { width: 576, height: 768 });
  assert.deepEqual(fitWithin(320, 200), { width: 320, height: 200 });
  assert.deepEqual(fitWithin(0, 100), { width: 0, height: 0 });
});

test('base64 > 204 800 ký tự ⇒ giảm chất lượng dần tới khi vừa, tối thiểu q=0.5', () => {
  assert.equal(MAX_BASE64_CHARS, 204_800);
  const tried = [];
  // chỉ vừa khi q ≤ 0.6
  const out = encodeUnderLimit((q) => {
    tried.push(q);
    return 'data:image/jpeg;base64,' + 'A'.repeat(q > 0.6 ? 300_000 : 100_000);
  });
  assert.ok(tried.length > 1);
  assert.ok(tried.every((q) => q >= 0.5));
  assert.ok(tried.every((q, i) => i === 0 || q < tried[i - 1]));
  assert.equal(out.base64.length, 100_000);
  assert.ok(out.previewUrl.startsWith('data:image/jpeg;base64,'));
});

test('quá lớn dù q=0.5 ⇒ dừng ở q=0.5, trả bản nhỏ nhất (không lặp vô hạn)', () => {
  const tried = [];
  const out = encodeUnderLimit((q) => {
    tried.push(q);
    return 'data:image/jpeg;base64,' + 'A'.repeat(500_000);
  });
  assert.equal(Math.min(...tried), 0.5);
  assert.equal(out.base64.length, 500_000);
});

test('ảnh nhỏ ⇒ mã hóa đúng 1 lần', () => {
  let n = 0;
  encodeUnderLimit(() => (n++, 'data:image/jpeg;base64,AAAA'));
  assert.equal(n, 1);
});

test('lỗi trình duyệt ⇒ CameraError chuẩn', () => {
  const named = (name) => Object.assign(new Error(name), { name });
  assert.equal(toCameraError(named('NotAllowedError')).code, 'permission-denied');
  assert.equal(toCameraError(named('SecurityError')).code, 'permission-denied');
  assert.equal(toCameraError(named('NotFoundError')).code, 'no-camera');
  assert.equal(toCameraError(named('OverconstrainedError')).code, 'no-camera');
  assert.equal(toCameraError(named('NotReadableError')).code, 'failed');
  const e = new CameraError('unsupported');
  assert.equal(toCameraError(e), e);
  assert.ok(e instanceof Error);
});

test('môi trường không có camera/DOM ⇒ unsupported, không ném lỗi lạ', async () => {
  await assert.rejects(() => openPreview({}), (e) => e instanceof CameraError && e.code === 'unsupported');
  await assert.rejects(() => grabFrame({ videoWidth: 0, videoHeight: 0 }), (e) => e instanceof CameraError);
  await assert.rejects(() => capturePhoto(), (e) => e instanceof CameraError && e.code === 'unsupported');
});
