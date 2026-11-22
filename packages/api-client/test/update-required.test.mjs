import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { configureGateway, request, streamEvents, GatewayRequestError, describeGatewayError } from '../dist/index.js';

const Schema = z.object({ ok: z.boolean() });
const realFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

const body426 = () => new Response(JSON.stringify({ error: 'app_update_required', minBuild: 1005000, channel: 'play' }), { status: 426 });

test('có appBuild/appChannel => request mang 2 header; không có => không header', async () => {
  const seen = [];
  globalThis.fetch = async (_u, init) => {
    seen.push(init.headers);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  configureGateway({ baseUrl: 'http://gw.test', timeoutMs: 200, appBuild: 1004002, appChannel: 'play' });
  await request('/v1/x', { schema: Schema });
  assert.equal(seen[0]['x-app-build'], '1004002');
  assert.equal(seen[0]['x-app-channel'], 'play');

  configureGateway({ appBuild: undefined, appChannel: undefined });
  await request('/v1/x', { schema: Schema });
  assert.equal('x-app-build' in seen[1], false);
  assert.equal('x-app-channel' in seen[1], false);
});

test('426 => kind update-required; onUpdateRequired gọi đúng 1 lần dù nhiều request 426; Review Focus 5: SSE reject ngay', async () => {
  const calls = [];
  configureGateway({ baseUrl: 'http://gw.test', timeoutMs: 5000, appBuild: 1, appChannel: 'play', onUpdateRequired: (i) => calls.push(i) });
  globalThis.fetch = async () => body426();
  const isUpdate = (e) => e instanceof GatewayRequestError && e.kind === 'update-required' && e.status === 426;
  await assert.rejects(request('/v1/a', { schema: Schema }), isUpdate);
  await assert.rejects(request('/v1/b', { schema: Schema }), isUpdate);
  const t0 = Date.now();
  await assert.rejects(streamEvents('/v1/chat/turn', {}, Schema, () => {}), isUpdate);
  assert.ok(Date.now() - t0 < 1000, 'không chờ watchdog');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { minBuild: 1005000, channel: 'play' });
});

test('describeGatewayError có câu vi/en cho update-required', () => {
  const e = new GatewayRequestError('update-required', '', 426);
  assert.equal(describeGatewayError(e, 'vi'), 'Cần cập nhật ứng dụng để tiếp tục.');
  assert.equal(describeGatewayError(e, 'en'), 'Please update the app to continue.');
});
