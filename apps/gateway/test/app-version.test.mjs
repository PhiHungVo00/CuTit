import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../dist/config.js';
import { buildApp } from '../dist/app.js';
import { createAppVersionStore } from '../dist/services/appVersion/store.js';
import { computeStatus, updateGate } from '../dist/services/appVersion/updateGate.js';

const ORIGIN = 'http://localhost:3000';
const SHA = 'a'.repeat(64);

const channel = (over = {}) => ({
  latestBuild: 0,
  latestVersion: '0.0.0',
  minBuild: 0,
  minBuildEnforceAt: null,
  notes: null,
  downloadUrl: null,
  apkFile: null,
  ...over
});
const makeCfg = (over = {}) => ({ web: channel(), play: channel(), apk: channel(), ...over });

const dir = mkdtempSync(join(tmpdir(), 'appver-'));
let n = 0;
function writeCfg(cfg) {
  const file = join(dir, `cfg-${n++}.json`);
  writeFileSync(file, typeof cfg === 'string' ? cfg : JSON.stringify(cfg));
  return file;
}

async function app(cfg, env = {}) {
  const file = writeCfg(cfg);
  return buildApp(
    loadConfig({
      NODE_ENV: 'test',
      CORS_ORIGIN: ORIGIN,
      APP_VERSIONS_FILE: file,
      APP_VERSIONS_TTL_MS: '0',
      APK_DOWNLOAD_HOSTS: 'dl.example.com',
      ...env
    }),
    { logger: false }
  );
}

const apkFile = { url: 'https://dl.example.com/becutit.apk', sha256: SHA, sizeBytes: 1234 };

test('tệp cấu hình mặc định trong repo hợp lệ và không ai bị nhắc/chặn', async () => {
  const a = await buildApp(loadConfig({ NODE_ENV: 'test', CORS_ORIGIN: ORIGIN }), { logger: false });
  const res = await a.inject({ method: 'GET', url: '/v1/app/version?channel=web&build=1' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().status, 'up_to_date');
  assert.equal(res.json().minBuild, 0);
});

test('GET /v1/app/version công khai: play không nhận apkFile/downloadUrl, apk nhận đúng apkFile', async () => {
  const a = await app(
    makeCfg({ apk: channel({ latestBuild: 10, latestVersion: '0.0.10', apkFile, downloadUrl: 'https://dl.example.com/page' }) })
  );
  const play = await a.inject({ method: 'GET', url: '/v1/app/version?channel=play&build=5' });
  assert.equal(play.statusCode, 200);
  assert.equal(play.json().apkFile, null);
  assert.equal(play.json().downloadUrl, null);
  const apk = await a.inject({ method: 'GET', url: '/v1/app/version?channel=apk&build=5' });
  assert.equal(apk.statusCode, 200);
  assert.deepEqual(apk.json().apkFile, apkFile);
  assert.equal(apk.json().downloadUrl, 'https://dl.example.com/page');
});

test('tệp cấu hình đặt apkFile ở kênh play ⇒ tạo app ném lỗi', async () => {
  await assert.rejects(() => app(makeCfg({ play: channel({ apkFile }) })));
});

test('apkFile host không nằm trong APK_DOWNLOAD_HOSTS ⇒ khởi động ném', async () => {
  const evil = { ...apkFile, url: 'https://evil.example/x.apk' };
  await assert.rejects(() => app(makeCfg({ apk: channel({ apkFile: evil }) })));
  // danh sách rỗng cũng không cho phép apkFile
  await assert.rejects(() => app(makeCfg({ apk: channel({ apkFile }) }), { APK_DOWNLOAD_HOSTS: '' }));
});

test('tệp cấu hình JSON hỏng lúc khởi động ⇒ ném', async () => {
  await assert.rejects(() => app('{ hỏng'));
});

test('query sai ⇒ 400', async () => {
  const a = await app(makeCfg());
  for (const q of ['channel=ios&build=1', 'channel=web&build=-1', 'channel=web', 'build=1']) {
    const res = await a.inject({ method: 'GET', url: `/v1/app/version?${q}` });
    assert.equal(res.statusCode, 400, q);
  }
});

test('status, checkAfterSec và no-store', async () => {
  const a = await app(makeCfg({ web: channel({ latestBuild: 10, latestVersion: '0.0.10', minBuild: 5 }) }));
  const get = (build) => a.inject({ method: 'GET', url: `/v1/app/version?channel=web&build=${build}` });
  assert.equal((await get(4)).json().status, 'update_required');
  assert.equal((await get(5)).json().status, 'update_available');
  assert.equal((await get(9)).json().status, 'update_available');
  const upToDate = await get(10);
  assert.equal(upToDate.json().status, 'up_to_date');
  assert.equal(upToDate.json().checkAfterSec, 21600);
  assert.equal(upToDate.headers['cache-control'], 'no-store');
});

test('computeStatus', () => {
  const c = channel({ latestBuild: 10, minBuild: 5 });
  assert.equal(computeStatus(4, c), 'update_required');
  assert.equal(computeStatus(5, c), 'update_available');
  assert.equal(computeStatus(10, c), 'up_to_date');
  assert.equal(computeStatus(11, c), 'up_to_date');
});

test('hook 426: chỉ khi header hợp lệ và build < minBuild, trước cả 401', async () => {
  const a = await app(makeCfg({ play: channel({ latestBuild: 3, latestVersion: '0.0.3', minBuild: 2 }) }));
  const me = (headers) => a.inject({ method: 'GET', url: '/v1/quota', headers });
  const blocked = await me({ 'x-app-build': '1', 'x-app-channel': 'play' });
  assert.equal(blocked.statusCode, 426);
  assert.deepEqual(blocked.json(), { error: 'app_update_required', minBuild: 2, channel: 'play' });
  assert.notEqual((await me({})).statusCode, 426); // không header ⇒ qua (rồi 401)
  assert.notEqual((await me({ 'x-app-build': 'abc', 'x-app-channel': 'play' })).statusCode, 426);
  assert.notEqual((await me({ 'x-app-build': '1', 'x-app-channel': 'ios' })).statusCode, 426);
  assert.notEqual((await me({ 'x-app-build': '1' })).statusCode, 426);
  assert.notEqual((await me({ 'x-app-build': '2', 'x-app-channel': 'play' })).statusCode, 426); // = min
  // kênh khác không bị ảnh hưởng
  assert.notEqual((await me({ 'x-app-build': '1', 'x-app-channel': 'web' })).statusCode, 426);
});

test('miễn trừ: DELETE /v1/me, /v1/app/version, /v1/auth/*, /healthz không bị 426', async () => {
  const a = await app(makeCfg({ play: channel({ latestBuild: 3, latestVersion: '0.0.3', minBuild: 2 }) }));
  const h = { 'x-app-build': '1', 'x-app-channel': 'play' };
  assert.notEqual((await a.inject({ method: 'DELETE', url: '/v1/quota', headers: h })).statusCode, 426);
  assert.equal((await a.inject({ method: 'GET', url: '/v1/app/version?channel=play&build=1', headers: h })).statusCode, 200);
  assert.equal((await a.inject({ method: 'POST', url: '/v1/auth/guest', headers: h })).statusCode, 200);
  assert.equal((await a.inject({ method: 'GET', url: '/healthz', headers: h })).statusCode, 200);
});

test('ân hạn: dưới min nhưng chưa tới minBuildEnforceAt ⇒ /v1/quota không 426, /v1/app/version vẫn update_required', async () => {
  const NOW = Date.parse('2026-12-01T00:00:00Z');
  const h = { 'x-app-build': '1', 'x-app-channel': 'play' };
  const gateStatus = async (enforceAt) => {
    const file = writeCfg(makeCfg({ play: channel({ latestBuild: 3, latestVersion: '0.0.3', minBuild: 2, minBuildEnforceAt: enforceAt }) }));
    const store = createAppVersionStore({ file, ttlMs: 60_000, apkHosts: [] });
    const gate = updateGate(store, { now: () => NOW });
    const sent = {};
    const reply = {
      code(c) { sent.code = c; return this; },
      send(b) { sent.body = b; return this; }
    };
    await gate({ method: 'GET', url: '/v1/quota', headers: h }, reply);
    return sent.code;
  };
  assert.equal(await gateStatus(new Date(NOW + 3_600_000).toISOString()), undefined); // còn 1 giờ ⇒ qua
  assert.equal(await gateStatus(new Date(NOW - 60_000).toISOString()), 426); // quá hạn 1 phút
  assert.equal(await gateStatus(null), 426); // chặn ngay

  // và qua HTTP thật: cấu hình ân hạn xa ⇒ /v1/me qua, /v1/app/version báo update_required
  const far = new Date(Date.now() + 3_600_000).toISOString();
  const a = await app(makeCfg({ play: channel({ latestBuild: 3, latestVersion: '0.0.3', minBuild: 2, minBuildEnforceAt: far }) }));
  assert.notEqual((await a.inject({ method: 'GET', url: '/v1/quota', headers: h })).statusCode, 426);
  const v = await a.inject({ method: 'GET', url: '/v1/app/version?channel=play&build=1' });
  assert.equal(v.json().status, 'update_required');
});

test('preflight CORS cho phép x-app-build và x-app-channel', async () => {
  const a = await app(makeCfg());
  const res = await a.inject({
    method: 'OPTIONS',
    url: '/v1/me',
    headers: {
      origin: ORIGIN,
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'x-app-build,x-app-channel,authorization'
    }
  });
  const allowed = String(res.headers['access-control-allow-headers']).toLowerCase();
  assert.ok(allowed.includes('x-app-build'));
  assert.ok(allowed.includes('x-app-channel'));
});

test('426 mang header CORS (bản web đọc được mã app_update_required, không thành lỗi mạng)', async () => {
  const a = await app(makeCfg({ web: channel({ latestBuild: 3, latestVersion: '0.0.3', minBuild: 2 }) }));
  const res = await a.inject({ method: 'GET', url: '/v1/quota', headers: { origin: ORIGIN, 'x-app-build': '1', 'x-app-channel': 'web' } });
  assert.equal(res.statusCode, 426);
  assert.equal(res.headers['access-control-allow-origin'], ORIGIN);
});

test('Review Focus 3: tệp hỏng sau khi tạo store ⇒ giữ cấu hình cũ, không ném', () => {
  const file = writeCfg(makeCfg({ web: channel({ latestBuild: 7, latestVersion: '0.0.7' }) }));
  const errors = [];
  const store = createAppVersionStore({ file, ttlMs: 0, apkHosts: [], log: { error: (...a) => errors.push(a) } });
  assert.equal(store.get().web.latestBuild, 7);
  writeFileSync(file, '{ json hỏng');
  assert.equal(store.get().web.latestBuild, 7);
  assert.ok(errors.length >= 1);
  // sai luật (minBuild > latestBuild) cũng giữ bản cũ
  writeFileSync(file, JSON.stringify(makeCfg({ web: channel({ latestBuild: 1, minBuild: 5 }) })));
  assert.equal(store.get().web.latestBuild, 7);
  // sửa lại ⇒ nhận bản mới
  writeFileSync(file, JSON.stringify(makeCfg({ web: channel({ latestBuild: 9, latestVersion: '0.0.9' }) })));
  assert.equal(store.get().web.latestBuild, 9);
});

test('store chỉ đọc lại khi quá TTL', () => {
  const file = writeCfg(makeCfg({ web: channel({ latestBuild: 1, latestVersion: '0.0.1' }) }));
  let t = 1000;
  const store = createAppVersionStore({ file, ttlMs: 60_000, apkHosts: [], now: () => t });
  writeFileSync(file, JSON.stringify(makeCfg({ web: channel({ latestBuild: 2, latestVersion: '0.0.2' }) })));
  assert.equal(store.get().web.latestBuild, 1);
  t += 61_000;
  assert.equal(store.get().web.latestBuild, 2);
});

test('rate limit /v1/app/version: request thứ 31 cùng IP trong một phút ⇒ 429', async () => {
  const a = await app(makeCfg());
  let last;
  for (let i = 0; i < 31; i++) last = await a.inject({ method: 'GET', url: '/v1/app/version?channel=web&build=1' });
  assert.equal(last.statusCode, 429);
});
