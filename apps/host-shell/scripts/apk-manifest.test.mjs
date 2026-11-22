import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildApkManifest, writeApkManifest } from './apk-manifest.mjs';

const dir = mkdtempSync(join(tmpdir(), 'apkm-'));
const apk = join(dir, 'app-release.apk');
writeFileSync(apk, Buffer.from('pretend-apk-bytes'));
const sha = createHash('sha256').update('pretend-apk-bytes').digest('hex');

test('manifest đủ 5 trường đúng kiểu ApkRelease', () => {
  const m = buildApkManifest({ apkPath: apk, url: 'https://x.test/becutit.apk', version: '1.2.3', minAndroid: '6.0' });
  assert.deepEqual(m, { version: '1.2.3', url: 'https://x.test/becutit.apk', bytes: 17, sha256: sha, minAndroid: '6.0' });
});

test('bản debug không ghi tệp', () => {
  const out = join(dir, 'debug.json');
  const r = writeApkManifest({ apkPath: apk, url: 'https://x.test/a.apk', version: '1.0.0', minAndroid: '6.0', out, release: false });
  assert.equal(r, null);
  assert.equal(existsSync(out), false);
});

test('APK chưa ký bị từ chối, không ghi tệp', () => {
  const unsigned = join(dir, 'app-release-unsigned.apk');
  writeFileSync(unsigned, 'x');
  const out = join(dir, 'u.json');
  assert.throws(() => writeApkManifest({ apkPath: unsigned, url: 'https://x.test/a.apk', version: '1.0.0', minAndroid: '6.0', out, release: true }), /chưa ký/);
  assert.equal(existsSync(out), false);
});

test('bản release ký xong thì ghi tệp JSON', () => {
  const out = join(dir, 'apk-release.json');
  writeApkManifest({ apkPath: apk, url: 'https://x.test/a.apk', version: '1.2.3', minAndroid: '6.0', out, release: true });
  assert.equal(JSON.parse(readFileSync(out, 'utf8')).sha256, sha);
});

test('url không phải https hoặc đường dẫn gốc ⇒ lỗi', () => {
  assert.throws(() => buildApkManifest({ apkPath: apk, url: 'ftp://x', version: '1.0.0', minAndroid: '6.0' }), /url/);
});
