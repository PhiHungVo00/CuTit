import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AppChannelSchema,
  AppVersionQuerySchema,
  AppVersionResponseSchema,
  AppVersionsConfigSchema,
  AppUpdateRequiredErrorSchema,
  APP_BUILD_HEADER,
  APP_CHANNEL_HEADER
} from '../dist/api/index.js';

const SHA = 'a'.repeat(64);
const response = (over = {}) => ({
  channel: 'apk',
  latestBuild: 1004002,
  latestVersion: '1.4.2',
  minBuild: 1000000,
  status: 'update_available',
  notes: { vi: 'Sửa lỗi', en: 'Bug fixes' },
  apkFile: { url: 'https://example.com/becutit.apk', sha256: SHA, sizeBytes: 1234567 },
  downloadUrl: 'https://example.com/tai',
  checkAfterSec: 21600,
  ...over
});
const channelCfg = (over = {}) => ({
  latestBuild: 4,
  latestVersion: '0.0.4',
  minBuild: 0,
  minBuildEnforceAt: null,
  notes: null,
  downloadUrl: null,
  apkFile: null,
  ...over
});
const config = (over = {}) => ({ web: channelCfg(), play: channelCfg(), apk: channelCfg(), ...over });

test('Hằng số header và kênh', () => {
  assert.equal(APP_BUILD_HEADER, 'x-app-build');
  assert.equal(APP_CHANNEL_HEADER, 'x-app-channel');
  assert.deepEqual(AppChannelSchema.options, ['web', 'play', 'apk']);
});

test('Query: build ép số từ chuỗi, từ chối âm / kênh lạ', () => {
  assert.equal(AppVersionQuerySchema.parse({ channel: 'play', build: '123' }).build, 123);
  assert.equal(AppVersionQuerySchema.safeParse({ channel: 'play', build: '-1' }).success, false);
  assert.equal(AppVersionQuerySchema.safeParse({ channel: 'ios', build: '1' }).success, false);
});

test('Response hợp lệ parse được; apkFile/downloadUrl null cũng được', () => {
  assert.equal(AppVersionResponseSchema.safeParse(response()).success, true);
  assert.equal(AppVersionResponseSchema.safeParse(response({ channel: 'web', apkFile: null, downloadUrl: null, notes: null })).success, true);
});

test('Response: apkFile.url http:// bị từ chối', () => {
  const r = response({ apkFile: { url: 'http://example.com/a.apk', sha256: SHA, sizeBytes: 10 } });
  assert.equal(AppVersionResponseSchema.safeParse(r).success, false);
});

test('Response: sha256 63 ký tự (hoặc chữ hoa) bị từ chối', () => {
  const bad = (sha256) => response({ apkFile: { url: 'https://example.com/a.apk', sha256, sizeBytes: 10 } });
  assert.equal(AppVersionResponseSchema.safeParse(bad('a'.repeat(63))).success, false);
  assert.equal(AppVersionResponseSchema.safeParse(bad('A'.repeat(64))).success, false);
});

test('Response: checkAfterSec ngoài [300, 86400], status lạ bị từ chối', () => {
  assert.equal(AppVersionResponseSchema.safeParse(response({ checkAfterSec: 299 })).success, false);
  assert.equal(AppVersionResponseSchema.safeParse(response({ checkAfterSec: 86_401 })).success, false);
  assert.equal(AppVersionResponseSchema.safeParse(response({ status: 'maybe' })).success, false);
});

test('Lỗi 426 đúng dạng', () => {
  assert.equal(AppUpdateRequiredErrorSchema.safeParse({ error: 'app_update_required', minBuild: 5, channel: 'web' }).success, true);
  assert.equal(AppUpdateRequiredErrorSchema.safeParse({ error: 'other', minBuild: 5, channel: 'web' }).success, false);
});

test('Config: mặc định (toàn 0/null) hợp lệ', () => {
  const zero = channelCfg({ latestBuild: 0, latestVersion: '0.0.0' });
  assert.equal(AppVersionsConfigSchema.safeParse({ web: zero, play: zero, apk: zero }).success, true);
});

test('Config: kênh apk có downloadUrl + apkFile hợp lệ', () => {
  const apk = channelCfg({
    downloadUrl: 'https://example.com/tai',
    apkFile: { url: 'https://example.com/a.apk', sha256: SHA, sizeBytes: 99 }
  });
  assert.equal(AppVersionsConfigSchema.safeParse(config({ apk })).success, true);
});

test('Config: downloadUrl hoặc apkFile ở kênh play/web bị từ chối', () => {
  const file = { url: 'https://example.com/a.apk', sha256: SHA, sizeBytes: 99 };
  assert.equal(AppVersionsConfigSchema.safeParse(config({ play: channelCfg({ downloadUrl: 'https://example.com/x' }) })).success, false);
  assert.equal(AppVersionsConfigSchema.safeParse(config({ web: channelCfg({ apkFile: file }) })).success, false);
});

test('Config: minBuild 5 > latestBuild 4 bị từ chối; bằng nhau thì được', () => {
  assert.equal(AppVersionsConfigSchema.safeParse(config({ web: channelCfg({ minBuild: 5, latestBuild: 4 }) })).success, false);
  assert.equal(AppVersionsConfigSchema.safeParse(config({ web: channelCfg({ minBuild: 4, latestBuild: 4 }) })).success, true);
});

test('Config: minBuildEnforceAt — "ngày mai" và thiếu offset bị từ chối; có offset và null hợp lệ', () => {
  const at = (v) => AppVersionsConfigSchema.safeParse(config({ web: channelCfg({ minBuildEnforceAt: v }) })).success;
  assert.equal(at('ngày mai'), false);
  assert.equal(at('2026-12-01T10:00:00'), false);
  assert.equal(at('2026-12-01T10:00:00+07:00'), true);
  assert.equal(at('2026-12-01T03:00:00Z'), true);
  assert.equal(at(null), true);
});

test('Config: thiếu minBuildEnforceAt (undefined) bị từ chối — phải ghi rõ null', () => {
  const { minBuildEnforceAt, ...rest } = channelCfg();
  assert.equal(AppVersionsConfigSchema.safeParse(config({ web: rest })).success, false);
});
