import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { versionToBuild, readAppVersion } from './version.mjs';

test('versionToBuild: công thức x·1e6 + y·1e3 + z', () => {
  assert.equal(versionToBuild('1.4.2'), 1004002);
  assert.equal(versionToBuild('1.0.0'), 1000000);
  assert.equal(versionToBuild('0.0.0'), 0);
  assert.equal(versionToBuild('2.999.999'), 2999999);
});

test('versionToBuild: ném lỗi khi y hoặc z > 999', () => {
  assert.throws(() => versionToBuild('1.1000.0'));
  assert.throws(() => versionToBuild('1.0.1000'));
});

test('versionToBuild: ném lỗi khi sai dạng x.y.z', () => {
  for (const bad of ['1.4', '1.4.2.3', 'v1.4.2', '1.4.2-beta', '1.a.2', '', ' 1.4.2', '1.4.2\n']) {
    assert.throws(() => versionToBuild(bad), undefined, JSON.stringify(bad));
  }
  assert.throws(() => versionToBuild(undefined));
  assert.throws(() => versionToBuild(142));
});

test('readAppVersion: khớp package.json của host-shell', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const r = readAppVersion();
  assert.equal(r.version, pkg.version);
  assert.equal(r.build, versionToBuild(pkg.version));
});
