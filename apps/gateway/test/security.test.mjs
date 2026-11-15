import test from 'node:test';
import assert from 'node:assert/strict';
import { createSigner } from 'fast-jwt';
import { loadConfig } from '../dist/config.js';
import { buildApp } from '../dist/app.js';
import { TTSCacheProxy, ttsCacheKey } from '../dist/cache/TTSCacheProxy.js';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const baseEnv = { NODE_ENV: 'test', CORS_ORIGIN: 'http://localhost:3000' };

async function app(env = {}, opts = {}) {
  return buildApp(loadConfig({ ...baseEnv, ...env }), { logger: false, ...opts });
}

test('CORS: không phản chiếu origin lạ, cho phép origin trong danh sách', async () => {
  const a = await app();
  const evil = await a.inject({
    method: 'OPTIONS',
    url: '/v1/speech/voices',
    headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' }
  });
  assert.equal(evil.headers['access-control-allow-origin'], undefined);

  const ok = await a.inject({
    method: 'OPTIONS',
    url: '/v1/speech/voices',
    headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'GET' }
  });
  assert.equal(ok.headers['access-control-allow-origin'], 'http://localhost:3000');
  await a.close();
});

test('Cấu hình: từ chối CORS wildcard và AUTH_REQUIRED thiếu JWT_SECRET', () => {
  assert.throws(() => loadConfig({ ...baseEnv, CORS_ORIGIN: '*' }), /wildcard/);
  assert.throws(() => loadConfig({ ...baseEnv, AUTH_REQUIRED: 'true' }), /JWT_SECRET/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /JWT_SECRET/);
});

test('Xác thực: bắt buộc token khi AUTH_REQUIRED, chấp nhận JWT hợp lệ, từ chối token sai', async () => {
  const a = await app({ AUTH_REQUIRED: 'true', JWT_SECRET: SECRET });
  assert.equal((await a.inject({ url: '/v1/speech/voices' })).statusCode, 401);

  const sign = createSigner({ key: SECRET });
  const good = await a.inject({
    url: '/v1/speech/voices',
    headers: { authorization: `Bearer ${sign({ sub: 'user-1' })}` }
  });
  assert.equal(good.statusCode, 200);

  const bad = await a.inject({ url: '/v1/speech/voices', headers: { authorization: 'Bearer abc.def.ghi' } });
  assert.equal(bad.statusCode, 401);

  assert.equal((await a.inject({ url: '/healthz' })).statusCode, 200);
  await a.close();
});

test('Validation: body rỗng bị 400 thay vì 200', async () => {
  const a = await app();
  const res = await a.inject({ method: 'POST', url: '/v1/speech/synthesize', payload: {} });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'invalid_request');

  const turn = await a.inject({ method: 'POST', url: '/v1/chat/turn', payload: { sessionId: 'x' } });
  assert.equal(turn.statusCode, 400);
  await a.close();
});

test('Contract: /chat/turn trả turnId dạng uuid', async () => {
  const a = await app();
  const res = await a.inject({
    method: 'POST',
    url: '/v1/chat/turn',
    payload: { sessionId: '7d444840-9dc0-11d1-b245-5ffdce74fad2', userText: 'Xin chào' }
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.json().turnId, /^[0-9a-f-]{36}$/);
  await a.close();
});

test('TTS: báo 503 rõ ràng khi chưa có Provider thay vì URL giả', async () => {
  const a = await app();
  const res = await a.inject({ method: 'POST', url: '/v1/speech/synthesize', payload: { text: 'Chào bạn' } });
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, 'tts_provider_not_configured');
  await a.close();
});

test('TTS cache: các câu cùng tiền tố không còn trùng khóa; NFC/NFD cùng khóa', async () => {
  const p = { voiceId: 'v', speed: 1, dialect: 'north' };
  assert.notEqual(ttsCacheKey({ ...p, text: 'Chào bạn nhé' }), ttsCacheKey({ ...p, text: 'Chào em nhé' }));
  assert.equal(ttsCacheKey({ ...p, text: 'Chào'.normalize('NFD') }), ttsCacheKey({ ...p, text: 'Chào' }));
  assert.notEqual(ttsCacheKey({ ...p, text: 'Chào' }), ttsCacheKey({ ...p, text: 'Chào', speed: 1.2 }));

  let calls = 0;
  const proxy = new TTSCacheProxy(async (_params, key) => {
    calls++;
    return `https://cdn.test/${key}.mp3`;
  });
  const first = await proxy.getAudio({ ...p, text: 'Chào bạn' });
  const second = await proxy.getAudio({ ...p, text: 'Chào bạn' });
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(calls, 1);
});

test('Quota: vượt hạn mức TTS trong ngày trả 429', async () => {
  let n = 0;
  const tts = new TTSCacheProxy(async () => `https://cdn.test/${n++}.mp3`);
  const a = await app({ MAX_TTS_CHARS_PER_DAY: '20' }, { ttsCache: tts });
  const send = (text) => a.inject({ method: 'POST', url: '/v1/speech/synthesize', payload: { text } });
  assert.equal((await send('Xin chào các bạn')).statusCode, 200); // 16 ký tự
  const over = await send('Chào cụ ạ');
  assert.equal(over.statusCode, 429);
  assert.equal(over.json().error, 'quota_exceeded');
  await a.close();
});
