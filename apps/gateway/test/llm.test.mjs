import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatEventSchema } from '@vietlearning/contracts';
import { loadConfig } from '../dist/config.js';
import { buildApp } from '../dist/app.js';
import { GeminiProvider } from '../dist/providers/llm.js';

const ORIGIN = 'http://localhost:3000';
const SID = '7d444840-9dc0-11d1-b245-5ffdce74fad2';
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]).toString('base64');

/** Nhà cung cấp giả: ghi lại request, trả JSON định sẵn (hoặc ném lỗi) — test không gọi mạng */
function fakeLlm(respond) {
  const calls = [];
  return {
    calls,
    provider: {
      name: 'fake',
      async generateJson(req) {
        calls.push(req);
        const json = typeof respond === 'function' ? respond(req) : respond;
        if (json instanceof Error) throw json;
        return { json, tokens: 50 };
      }
    }
  };
}

const app = (llm) => buildApp(loadConfig({ NODE_ENV: 'test', AUTH_REQUIRED: 'false', CORS_ORIGIN: ORIGIN }), { logger: false, llm });

function events(body) {
  return body
    .split('\n\n')
    .filter(Boolean)
    .map((c) => ChatEventSchema.parse(JSON.parse(c.replace(/^data: /, ''))));
}

test('chat với AI thật: mock=false, prompt có kịch bản + ngôn ngữ giải thích, lọc chỉ số nhiệm vụ sai', async () => {
  const llm = fakeLlm({
    reply: 'Chào cháu! Cháu mua gì nào?',
    correction: { original: 'chao co', corrected: 'Chào cô ạ!', explanation: 'Add "ạ" to be polite.' },
    blocks: [{ type: 'culture_pill', title: 'Politeness', note: 'Use ạ with elders.' }],
    completedTasks: [0, 0, 7, -1]
  });
  const a = await app(llm.provider);
  const res = await a.inject({
    method: 'POST',
    url: '/v1/chat/turn',
    headers: { accept: 'text/event-stream', origin: ORIGIN },
    payload: { sessionId: SID, userText: 'chao co', scenarioId: 'sc1', explanationLanguage: 'en', history: [{ role: 'tutor', text: 'Chào cháu' }] }
  });
  assert.equal(res.statusCode, 200);
  const ev = events(res.body);
  const done = ev.find((e) => e.type === 'done');
  assert.equal(done.mock, false);
  assert.deepEqual(done.completedTasks, [0]);
  assert.equal(ev.filter((e) => e.type === 'token').map((e) => e.text).join(''), done.reply);
  assert.equal(ev.find((e) => e.type === 'correction').correction.corrected, 'Chào cô ạ!');
  assert.ok(!ev.some((e) => e.type === 'blocks'), 'nhập vai không chèn block');

  const req = llm.calls[0];
  assert.match(req.system, /NHẬP VAI/);
  assert.match(req.system, /tiếng Anh/);
  assert.equal(req.turns[0].role, 'user', 'lượt đầu gửi cho Gemini phải là user (bỏ lượt tutor mở đầu)');
  assert.equal(req.turns.at(-1).parts[0].text, 'chao co');
});

test('chat: AI trả JSON sai hình dạng hoặc lỗi => vẫn trả lời bằng bộ giả lập, mock=true', async () => {
  for (const bad of [{ reply: 42 }, new Error('boom')]) {
    const a = await app(fakeLlm(bad).provider);
    const res = await a.inject({ method: 'POST', url: '/v1/chat/turn', headers: { accept: 'text/event-stream' }, payload: { sessionId: SID, userText: 'xin chao' } });
    assert.equal(res.statusCode, 200);
    assert.equal(events(res.body).find((e) => e.type === 'done').mock, true);
  }
});

test('chat: block AI chỉ là văn bản theo trường cố định, tối đa 2, loại lạ bị bỏ', async () => {
  const llm = fakeLlm({
    reply: 'Chào bạn!',
    correction: null,
    blocks: [
      { type: 'honorific_card', title: 'Xưng hô', note: 'anh/chị/em' },
      { type: 'culture_pill', title: 'Chào', note: 'ạ' },
      { type: 'pitch_visualizer', title: 'Thanh', note: 'x' }
    ],
    completedTasks: []
  });
  const res = await (await app(llm.provider)).inject({ method: 'POST', url: '/v1/chat/turn', payload: { sessionId: SID, userText: 'Xin chào' } });
  const body = res.json();
  assert.equal(body.uiBlocks.length, 2);
  assert.deepEqual(body.uiBlocks[1].payload, { tip: 'ạ' });

  const evil = fakeLlm({ reply: 'x', correction: null, blocks: [{ type: 'script_tag', title: '<b>', note: '' }], completedTasks: [] });
  const r2 = await (await app(evil.provider)).inject({ method: 'POST', url: '/v1/chat/turn', payload: { sessionId: SID, userText: 'Xin chào' } });
  assert.deepEqual(r2.json().uiBlocks, [], 'loại block ngoài danh sách => bỏ cả mảng');
});

test('vision với AI thật: gửi ảnh inline đúng MIME, bỏ trùng, mock=false; AI lỗi => lỗi trung thực (không nhãn mẫu)', async () => {
  const llm = fakeLlm({ items: [{ vi: 'Cái Cốc', en: 'Cup' }, { vi: 'cái cốc', en: 'mug' }, { vi: 'quyển sách', en: 'book' }] });
  const res = await (await app(llm.provider)).inject({ method: 'POST', url: '/v1/vision/label', payload: { imageBase64: JPEG } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { items: [{ vi: 'cái cốc', en: 'cup' }, { vi: 'quyển sách', en: 'book' }], mock: false });
  assert.equal(llm.calls[0].turns[0].parts[0].inline.mimeType, 'image/jpeg');

  const { GatewayError } = await import('../dist/pipeline/RequestPipeline.js');
  const down = fakeLlm(new GatewayError(504, 'llm_timeout', 'chậm'));
  const r2 = await (await app(down.provider)).inject({ method: 'POST', url: '/v1/vision/label', payload: { imageBase64: JPEG } });
  assert.equal(r2.statusCode, 504);
  assert.equal(r2.json().error, 'llm_timeout');
});

test('culture/ask với AI: chỉ giữ nguồn là thẻ đã truy hồi; không có thẻ khớp => không gọi AI', async () => {
  const llm = fakeLlm((req) => ({ answer: 'Greet elders first.', sources: ['khong-ton-tai', req.turns[0].parts[0].text.match(/\[([\w-]+)\]/)[1]] }));
  const a = await app(llm.provider);
  const res = await a.inject({ method: 'POST', url: '/v1/culture/ask', payload: { question: 'chào hỏi người lớn tuổi', language: 'en' } });
  const body = res.json();
  assert.equal(body.mock, false);
  assert.equal(body.sources.length, 1);
  assert.ok(!body.sources.includes('khong-ton-tai'));

  const before = llm.calls.length;
  const r2 = await a.inject({ method: 'POST', url: '/v1/culture/ask', payload: { question: 'xyzzy qwerty', language: 'en' } });
  assert.match(r2.json().answer, /no culture card/);
  assert.equal(llm.calls.length, before);
});

test('GeminiProvider: khóa ở header (không ở URL), lỗi nhà cung cấp không lộ ra ngoài, timeout => 504', async () => {
  let seen;
  const ok = new GeminiProvider('k'.repeat(30), 'gemini-x', 1000, async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }], usageMetadata: { totalTokenCount: 9 } }), { status: 200 });
  });
  assert.deepEqual(await ok.generateJson({ system: 's', turns: [{ role: 'user', parts: [{ text: 'hi' }] }], schema: {} }), { json: { a: 1 }, tokens: 9 });
  assert.ok(!String(seen.url).includes('k'.repeat(30)));
  assert.equal(seen.init.headers['x-goog-api-key'], 'k'.repeat(30));

  const leaky = new GeminiProvider('k'.repeat(30), 'm', 1000, async () => new Response('{"error":{"message":"API key xyz invalid"}}', { status: 400 }));
  await assert.rejects(leaky.generateJson({ system: 's', turns: [], schema: {} }), (e) => e.statusCode === 502 && !e.message.includes('xyz'));

  const slow = new GeminiProvider('k'.repeat(30), 'm', 20, (_u, init) => new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason))));
  await assert.rejects(slow.generateJson({ system: 's', turns: [], schema: {} }), (e) => e.statusCode === 504);
});

test('cấu hình: khóa giữ chỗ/quá ngắn trong .env cũ => chạy bộ giả lập thay vì không khởi động được', async () => {
  assert.equal(loadConfig({ NODE_ENV: 'development', GEMINI_API_KEY: 'AIzaSy...' }).GEMINI_API_KEY, undefined);
  assert.equal(loadConfig({ NODE_ENV: 'development', GEMINI_API_KEY: 'short' }).GEMINI_API_KEY, undefined);
  assert.equal(loadConfig({ NODE_ENV: 'development', GEMINI_API_KEY: 'x'.repeat(39) }).GEMINI_API_KEY, 'x'.repeat(39));
  assert.throws(() => loadConfig({ NODE_ENV: 'development', LLM_TIMEOUT_MS: '15000' }), /LLM_TIMEOUT_MS/);
});
