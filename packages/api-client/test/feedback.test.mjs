import test from 'node:test';
import assert from 'node:assert/strict';
import { configureGateway, GatewayRequestError } from '../dist/index.js';
import { AUTH_STORAGE_KEY, resetAuthSessionForTest } from '../dist/session.js';
import { submitFeedback, listMyFeedback, unreadFeedbackCount, markFeedbackRead } from '../dist/feedback.js';

const realFetch = globalThis.fetch;
const realXhr = globalThis.XMLHttpRequest;
test.afterEach(() => {
  globalThis.fetch = realFetch;
  globalThis.XMLHttpRequest = realXhr;
});

const META = {
  kind: 'bug',
  body: 'Bấm nút nghe giọng Nam thì không có tiếng',
  context: { appVersion: '1.0.0', build: '1000000', platform: 'web', osVersion: 'Chrome 120', locale: 'vi', route: '/ho-so', recentRoutes: ['/', '/ho-so'] }
};
const ID = '11111111-1111-4111-8111-111111111111';

/** XHR giả: mỗi lần `send` lấy một kịch bản từ hàng đợi */
function installXhr(scripts) {
  const calls = [];
  globalThis.XMLHttpRequest = class {
    constructor() {
      this.upload = {};
      this.headers = {};
      this.status = 0;
      this.responseText = '';
    }
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(k, v) {
      this.headers[k] = v;
    }
    abort() {
      this.aborted = true;
      this.onabort?.();
    }
    send(body) {
      const script = scripts.shift();
      calls.push({ method: this.method, url: this.url, headers: this.headers, body });
      queueMicrotask(() => {
        if (script.network) return this.onerror?.();
        script.progress?.forEach((p) => this.upload.onprogress?.({ lengthComputable: true, loaded: p, total: 100 }));
        this.status = script.status;
        this.responseText = JSON.stringify(script.json ?? {});
        this.onload?.();
      });
    }
  };
  return calls;
}

test('submitFeedback: multipart có meta + files, Bearer, tiến độ 0..1, trả {id}', async () => {
  configureGateway({ baseUrl: 'http://gw.test/', getToken: () => 'tok', onUnauthorized: undefined, timeoutMs: 200 });
  const calls = installXhr([{ status: 200, json: { id: ID }, progress: [25, 100] }]);
  const seen = [];
  const res = await submitFeedback(META, [new Blob(['a'], { type: 'image/webp' }), new Blob(['b'], { type: 'video/mp4' })], (p) => seen.push(p));
  assert.deepEqual(res, { id: ID });
  assert.equal(calls[0].url, 'http://gw.test/v1/feedback');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.Authorization, 'Bearer tok');
  assert.equal(calls[0].headers['Content-Type'], undefined, 'để trình duyệt tự đặt boundary');
  const form = calls[0].body;
  assert.ok(form instanceof FormData);
  assert.deepEqual(JSON.parse(form.get('meta')), META);
  assert.equal(form.getAll('files').length, 2);
  assert.deepEqual(seen, [0, 0.25, 1]);
});

test('submitFeedback: 401 => làm mới phiên rồi gửi lại ĐÚNG MỘT lần', async () => {
  let refreshed = 0;
  let token = 'old';
  configureGateway({ baseUrl: 'http://gw.test', getToken: () => token, onUnauthorized: async () => ((refreshed += 1), (token = 'new'), true), timeoutMs: 200 });
  const calls = installXhr([{ status: 401 }, { status: 200, json: { id: ID } }]);
  await submitFeedback(META, [], () => {});
  assert.equal(refreshed, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].headers.Authorization, 'Bearer new');
});

test('submitFeedback: 401 hai lần => ném unauthorized (không lặp vô hạn)', async () => {
  configureGateway({ baseUrl: 'http://gw.test', getToken: () => 't', onUnauthorized: async () => true, timeoutMs: 200 });
  const calls = installXhr([{ status: 401 }, { status: 401 }]);
  await assert.rejects(submitFeedback(META, [], () => {}), (e) => e instanceof GatewayRequestError && e.kind === 'unauthorized');
  assert.equal(calls.length, 2);
});

test('submitFeedback: lỗi mạng => kind "offline"; mã lỗi Gateway giữ trong .code', async () => {
  configureGateway({ baseUrl: 'http://gw.test', getToken: () => 't', onUnauthorized: undefined, timeoutMs: 200 });
  installXhr([{ network: true }]);
  await assert.rejects(submitFeedback(META, [], () => {}), (e) => e instanceof GatewayRequestError && e.kind === 'offline');
  for (const [status, code, kind] of [
    [429, 'feedback_limit', 'quota'],
    [413, 'file_too_large', 'invalid-request'],
    [400, 'file_type', 'invalid-request'],
    [507, 'storage_full', 'server']
  ]) {
    installXhr([{ status, json: { error: code } }]);
    await assert.rejects(submitFeedback(META, [], () => {}), (e) => e instanceof GatewayRequestError && e.code === code && e.kind === kind && e.status === status);
  }
});

test('submitFeedback: phản hồi lệch contract => kind "contract"; hủy bằng AbortSignal', async () => {
  configureGateway({ baseUrl: 'http://gw.test', getToken: () => 't', onUnauthorized: undefined, timeoutMs: 200 });
  installXhr([{ status: 200, json: { id: 'không-phải-uuid' } }]);
  await assert.rejects(submitFeedback(META, [], () => {}), (e) => e instanceof GatewayRequestError && e.kind === 'contract');

  globalThis.XMLHttpRequest = class {
    constructor() {
      this.upload = {};
    }
    open() {}
    setRequestHeader() {}
    send() {}
    abort() {
      this.onabort?.();
    }
  };
  const ac = new AbortController();
  const p = submitFeedback(META, [], () => {}, ac.signal);
  setTimeout(() => ac.abort(), 5);
  await assert.rejects(p, (e) => e.name === 'AbortError');
});

test('listMyFeedback / unreadFeedbackCount / markFeedbackRead: đúng đường dẫn + kiểm schema', async () => {
  configureGateway({ baseUrl: 'http://gw.test', getToken: () => 't', onUnauthorized: undefined, timeoutMs: 200 });
  const urls = [];
  globalThis.fetch = async (url, init) => {
    urls.push([init.method, url]);
    if (url.endsWith('/mine')) return new Response(JSON.stringify({ items: [] }), { status: 200 });
    if (url.endsWith('/unread-count')) return new Response(JSON.stringify({ count: 2 }), { status: 200 });
    return new Response(null, { status: 204 });
  };
  const mem = new Map([[AUTH_STORAGE_KEY, JSON.stringify({ userId: '00000000-0000-4000-8000-000000000001', refreshToken: 'refresh-0-xxxxxxxxxxxxxxxx', recoveryCode: null })]]);
  configureGateway({ storage: { get: async (k) => mem.get(k) ?? null, set: async (k, v) => void mem.set(k, v), remove: async (k) => void mem.delete(k) } });
  resetAuthSessionForTest();
  assert.deepEqual(await listMyFeedback(), { items: [] });
  assert.equal(await unreadFeedbackCount(), 2);
  await markFeedbackRead(ID);
  assert.deepEqual(urls, [
    ['GET', 'http://gw.test/v1/feedback/mine'],
    ['GET', 'http://gw.test/v1/feedback/mine/unread-count'],
    ['POST', `http://gw.test/v1/feedback/${ID}/read`]
  ]);
});

test('unreadFeedbackCount: chưa có phiên => 0, KHÔNG gọi mạng (không tự tạo khách chỉ để hỏi chấm đỏ)', async () => {
  const mem = new Map();
  configureGateway({ baseUrl: 'http://gw.test', getToken: () => 't', storage: { get: async (k) => mem.get(k) ?? null, set: async (k, v) => void mem.set(k, v), remove: async (k) => void mem.delete(k) }, timeoutMs: 200 });
  resetAuthSessionForTest();
  let calls = 0;
  globalThis.fetch = async () => (calls++, new Response('{}', { status: 500 }));
  assert.equal(await unreadFeedbackCount(), 0);
  assert.equal(calls, 0);
});
