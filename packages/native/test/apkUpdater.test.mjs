import test from 'node:test';
import assert from 'node:assert/strict';

const { ApkUpdater, isApkUpdaterAvailable, createApkUpdater } = await import('../dist/apkUpdater.js');

function fakeNative() {
  const calls = [];
  const raw = {
    download: async (o) => (calls.push(['download', o]), { state: 'queued' }),
    canInstall: async () => (calls.push(['canInstall']), { allowed: true }),
    openInstallSettings: async () => void calls.push(['openInstallSettings']),
    install: async (o) => void calls.push(['install', o]),
    cleanup: async () => void calls.push(['cleanup']),
    cancel: async () => void calls.push(['cancel']),
    addListener: async (e, cb) => (calls.push(['addListener', e]), { remove() {} }),
  };
  return { raw, calls };
}

const opts = { url: 'https://x.test/a.apk', sha256: 'a'.repeat(64), sizeBytes: 10, build: 1004002, allowMetered: false };

test('trên web (không native) isApkUpdaterAvailable() = false', () => {
  assert.equal(isApkUpdaterAvailable(), false);
});

test('không khả dụng ⇒ mọi hàm reject mã "unavailable", không gọi native', async () => {
  const { raw, calls } = fakeNative();
  const u = createApkUpdater(raw, () => false);
  for (const fn of [() => u.download(opts), () => u.canInstall(), () => u.openInstallSettings(), () => u.install({ build: 1 }), () => u.cleanup(), () => u.cancel()]) {
    await assert.rejects(fn, (e) => e.code === 'unavailable');
  }
  const h = await u.addListener('installStatus', () => {});
  assert.equal(typeof h.remove, 'function');
  h.remove();
  assert.deepEqual(calls, []);
});

test('khả dụng ⇒ chuyển nguyên tham số xuống native', async () => {
  const { raw, calls } = fakeNative();
  const u = createApkUpdater(raw, () => true);
  assert.deepEqual(await u.download(opts), { state: 'queued' });
  assert.deepEqual(await u.canInstall(), { allowed: true });
  await u.openInstallSettings();
  await u.install({ build: 1004002 });
  await u.cleanup();
  await u.cancel();
  await u.addListener('downloadProgress', () => {});
  assert.deepEqual(
    calls.map((c) => c[0]),
    ['download', 'canInstall', 'openInstallSettings', 'install', 'cleanup', 'cancel', 'addListener'],
  );
  assert.deepEqual(calls[0][1], opts);
  assert.deepEqual(calls[3][1], { build: 1004002 });
});

test('ApkUpdater mặc định trên web: reject "unavailable", không ném đồng bộ', async () => {
  await assert.rejects(() => ApkUpdater.canInstall(), (e) => e.code === 'unavailable');
});
