import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../dist/config.js';
import { buildApp } from '../dist/app.js';

const app = () => buildApp(loadConfig({ NODE_ENV: 'test', CORS_ORIGIN: 'http://localhost:3000' }), { logger: false });
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]).toString('base64');
const html = Buffer.from('<html><script>alert(1)</script>' + 'x'.repeat(200)).toString('base64');

test('/vision/label: ảnh JPEG => nhãn mẫu có cờ mock; không phải ảnh => 415; không phải base64 => 400', async () => {
  const a = await app();
  const ok = await a.inject({ method: 'POST', url: '/v1/vision/label', payload: { imageBase64: jpeg } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().mock, true);
  assert.ok(ok.json().items.length > 0);
  const notImage = await a.inject({ method: 'POST', url: '/v1/vision/label', payload: { imageBase64: html } });
  assert.equal(notImage.statusCode, 415);
  const notB64 = await a.inject({ method: 'POST', url: '/v1/vision/label', payload: { imageBase64: 'data:image/jpeg;base64,' + jpeg } });
  assert.equal(notB64.statusCode, 400);
  await a.close();
});
