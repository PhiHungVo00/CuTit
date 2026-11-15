import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { configureGateway, request, streamEvents, GatewayRequestError, describeGatewayError } from '../dist/index.js';

const Schema = z.object({ answer: z.string() });
const realFetch = globalThis.fetch;
const mockFetch = (impl) => {
  globalThis.fetch = impl;
};
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

configureGateway({ baseUrl: 'http://gw.test/', getToken: () => 'tok', timeoutMs: 200 });

test('request: gửi Bearer token + JSON, kiểm tra phản hồi theo contract', async () => {
  let seen;
  mockFetch(async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ answer: 'Khoanh tay chào' }), { status: 200 });
  });
  const data = await request('/v1/culture/ask', { body: { question: 'Chào thế nào?' }, schema: Schema });
  assert.equal(data.answer, 'Khoanh tay chào');
  assert.equal(seen.url, 'http://gw.test/v1/culture/ask');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers.Authorization, 'Bearer tok');
  assert.equal(seen.init.headers['Content-Type'], 'application/json');
});

test('request: phản hồi lệch contract => lỗi kind "contract" (không đưa dữ liệu sai lên UI)', async () => {
  mockFetch(async () => new Response(JSON.stringify({ answer: 42 }), { status: 200 }));
  await assert.rejects(request('/x', { schema: Schema }), (e) => e instanceof GatewayRequestError && e.kind === 'contract');
});

test('request: chuẩn hóa lỗi HTTP theo mã', async () => {
  for (const [status, kind] of [
    [401, 'unauthorized'],
    [429, 'quota'],
    [503, 'unavailable'],
    [400, 'invalid-request'],
    [500, 'server']
  ]) {
    mockFetch(async () => new Response(JSON.stringify({ error: 'x' }), { status }));
    await assert.rejects(request('/x', { schema: Schema }), (e) => e.kind === kind && e.status === status && e.code === 'x');
  }
});

test('request: mất mạng => "offline"; quá giờ => "timeout"; có câu thông báo tiếng Việt', async () => {
  mockFetch(async () => {
    throw new TypeError('Failed to fetch');
  });
  await assert.rejects(request('/x', { schema: Schema }), (e) => e.kind === 'offline');

  mockFetch((_u, init) => new Promise((_r, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))));
  await assert.rejects(request('/x', { schema: Schema }), (e) => e.kind === 'timeout');

  assert.match(describeGatewayError(new GatewayRequestError('quota', '')), /hết lượt/);
});

test('streamEvents: đọc SSE bị cắt giữa chừng, kiểm tra từng sự kiện', async () => {
  const Event = z.discriminatedUnion('type', [
    z.object({ type: z.literal('token'), text: z.string() }),
    z.object({ type: z.literal('done') })
  ]);
  const chunks = ['data: {"type":"tok', 'en","text":"Chào "}\n\n', 'data: {"type":"token","text":"bạn"}\n\ndata: {"type":"done"}\n\n'];
  mockFetch(async () => new Response(new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch));
      c.close();
    }
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
  const events = [];
  await streamEvents('/v1/chat/turn', {}, Event, (e) => events.push(e));
  assert.deepEqual(events.map((e) => e.type), ['token', 'token', 'done']);
  assert.equal(events.filter((e) => e.type === 'token').map((e) => e.text).join(''), 'Chào bạn');
});
