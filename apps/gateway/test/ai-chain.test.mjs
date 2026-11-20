import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../dist/config.js';
import { GatewayError } from '../dist/pipeline/RequestPipeline.js';
import { LlmProviderError } from '../dist/providers/llm.js';
import { CircuitBreaker, FallbackLlmProvider, FallbackSttProvider } from '../dist/providers/chain.js';
import { OpenAiCompatLlmProvider, OpenAiCompatSttClient, extractJsonObject } from '../dist/providers/openaiCompat.js';
import { createAiProviders, parseChain } from '../dist/providers/registry.js';

const REQ = { system: 's', turns: [{ role: 'user', parts: [{ text: 'chào' }] }], schema: { type: 'OBJECT' } };
const IMG = { ...REQ, turns: [{ role: 'user', parts: [{ inline: { mimeType: 'image/jpeg', base64: 'AAAA' } }] }] };

/** Nguồn giả: ghi số lần gọi; `script` là danh sách kết quả lần lượt (Error => ném) */
function fake(name, script, extra = {}) {
  const p = {
    name,
    calls: 0,
    ...extra,
    async generateJson() {
      const step = script[Math.min(p.calls, script.length - 1)];
      p.calls++;
      if (step instanceof Error) throw step;
      return { json: step, tokens: 7 };
    }
  };
  return p;
}
const busy = () => new LlmProviderError(503, 'llm_busy', '429', 429);
const clock = () => {
  const c = { t: 1_000_000, now: () => c.t, advance: (ms) => (c.t += ms) };
  return c;
};
const chain = (sources, c = clock(), over = {}) => {
  const breaker = new CircuitBreaker({ openMs: 180_000, failureThreshold: 3, transientOpenMs: 60_000, now: c.now });
  const logs = [];
  const log = { info: (o, m) => logs.push(['info', o, m]), warn: (o, m) => logs.push(['warn', o, m]) };
  return { c, logs, breaker, llm: new FallbackLlmProvider('llm', sources.map((p) => ({ id: p.name, provider: p })), { breaker, budgetMs: 9000, now: c.now, log, ...over }) };
};

test('chuỗi: 429 ở nguồn đầu => nguồn kế trả lời; ghi nhận nguồn đã trả lời', async () => {
  const a = fake('a', [busy()]);
  const b = fake('b', [{ ok: 1 }]);
  const { llm, logs } = chain([a, b]);
  const r = await llm.generateJson(REQ);
  assert.deepEqual(r.json, { ok: 1 });
  assert.equal(r.provider, 'b');
  assert.ok(logs.some(([lvl, o]) => lvl === 'info' && o.source === 'b'));
  assert.ok(JSON.stringify(logs).indexOf('Bearer') < 0);
});

test('chuỗi: JSON sai Zod (accept=false) => thử nguồn kế, không phải lỗi', async () => {
  const a = fake('a', [{ reply: 42 }]);
  const b = fake('b', [{ reply: 'xin chào' }]);
  const { llm } = chain([a, b]);
  const r = await llm.generateJson({ ...REQ, accept: (j) => typeof j.reply === 'string' });
  assert.equal(r.provider, 'b');
  assert.equal(a.calls, 1);
});

test('chuỗi: hết nguồn => 503 llm_busy (không phải quota_exceeded), kèm retryAfterSec khi đang ngắt mạch', async () => {
  const a = fake('a', [busy()]);
  const b = fake('b', [new LlmProviderError(504, 'llm_timeout', 'chậm')]);
  const { llm } = chain([a, b]);
  await assert.rejects(llm.generateJson(REQ), (e) => e instanceof GatewayError && e.statusCode === 503 && e.code === 'llm_busy');
  // lần 2: a đang ngắt mạch => có gợi ý chờ
  await assert.rejects(llm.generateJson(REQ), (e) => e.code === 'llm_busy' && e.details?.retryAfterSec >= 1);
});

test('ngắt mạch: sau 429 nguồn bị bỏ qua vài phút (không gọi lại), hết hạn thì thử lại', async () => {
  const a = fake('a', [busy(), { from: 'a' }]);
  const b = fake('b', [{ from: 'b' }]);
  const { llm, c } = chain([a, b]);
  await llm.generateJson(REQ);
  assert.equal(a.calls, 1);
  for (let i = 0; i < 5; i++) assert.equal((await llm.generateJson(REQ)).provider, 'b');
  assert.equal(a.calls, 1, 'a đang ngắt mạch: không bị gọi');
  c.advance(181_000);
  assert.equal((await llm.generateJson(REQ)).provider, 'a');
  assert.equal(a.calls, 2);
});

test('ngắt mạch: lỗi tạm thời liên tiếp (timeout) mới ngắt; một lần thành công làm lại bộ đếm', async () => {
  const t = () => new LlmProviderError(504, 'llm_timeout', 'chậm');
  const a = fake('a', [t(), t(), { ok: 1 }, t(), t(), t(), { ok: 2 }]);
  const b = fake('b', [{ from: 'b' }]);
  const { llm, c } = chain([a, b]);
  assert.equal((await llm.generateJson(REQ)).provider, 'b'); // a lỗi 1
  assert.equal((await llm.generateJson(REQ)).provider, 'b'); // a lỗi 2
  assert.equal((await llm.generateJson(REQ)).provider, 'a'); // a ok => reset
  for (let i = 0; i < 3; i++) await llm.generateJson(REQ); // 3 lỗi liên tiếp => ngắt
  const before = a.calls;
  await llm.generateJson(REQ);
  assert.equal(a.calls, before, 'đã ngắt mạch');
  c.advance(61_000);
  assert.equal((await llm.generateJson(REQ)).provider, 'a');
});

test('chuỗi: llm_blocked (bộ lọc an toàn) và lỗi do yêu cầu KHÔNG thử nguồn khác', async () => {
  const a = fake('a', [new GatewayError(422, 'llm_blocked', 'chặn')]);
  const b = fake('b', [{ ok: 1 }]);
  const { llm } = chain([a, b]);
  await assert.rejects(llm.generateJson(REQ), (e) => e.code === 'llm_blocked');
  assert.equal(b.calls, 0);
});

test('chuỗi: yêu cầu có ảnh bỏ qua nguồn không nhận ảnh (không tính là lỗi, không ngắt mạch)', async () => {
  const text = fake('text', [{ x: 1 }], { supportsImage: false });
  const vis = fake('vis', [{ items: [] }], { supportsImage: true });
  const { llm } = chain([text, vis]);
  assert.equal((await llm.generateJson(IMG)).provider, 'vis');
  assert.equal(text.calls, 0);
  assert.equal((await llm.generateJson(REQ)).provider, 'text');
});

test('chuỗi: ngân sách thời gian chung — không bắt đầu nguồn mới khi hết giờ, mỗi lần gọi nhận timeout còn lại', async () => {
  const c = clock();
  const seen = [];
  const slow = { name: 'slow', async generateJson(req) { seen.push(req.timeoutMs); c.advance(8800); throw new LlmProviderError(504, 'llm_timeout', 'chậm'); } };
  const next = fake('next', [{ ok: 1 }]);
  const { llm } = chain([slow, next], c);
  await assert.rejects(llm.generateJson(REQ), (e) => e.code === 'llm_busy');
  assert.equal(seen[0], 9000);
  assert.equal(next.calls, 0, 'chỉ còn 200 ms < ngưỡng tối thiểu');
});

// ---------- bộ điều hợp OpenAI-compatible ----------
const okBody = (content, tokens = 33) => new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: tokens } }), { status: 200 });
const compat = (fetchImpl, over = {}) =>
  new OpenAiCompatLlmProvider({ name: 'openrouter:m/x:free', baseUrl: 'https://example.test/v1/', apiKey: 'sk-secret-123', model: 'm/x:free', timeoutMs: 5000, ...over }, fetchImpl);

test('OpenAI-compatible LLM: khóa ở header (không ở URL/lỗi), JSON mode, bóc JSON khỏi rào markdown và <think>', async () => {
  let seen;
  const p = compat(async (url, init) => {
    seen = { url, headers: init.headers, body: JSON.parse(init.body) };
    return okBody('<think>suy nghĩ {nhiễu}</think>\n```json\n{"reply":"xin chào"}\n```');
  });
  const r = await p.generateJson({ ...REQ, maxOutputTokens: 55 });
  assert.deepEqual(r.json, { reply: 'xin chào' });
  assert.equal(r.tokens, 33);
  assert.equal(seen.url, 'https://example.test/v1/chat/completions');
  assert.equal(seen.headers.authorization, 'Bearer sk-secret-123');
  assert.ok(!seen.url.includes('sk-secret'));
  assert.deepEqual(seen.body.response_format, { type: 'json_object' });
  assert.equal(seen.body.model, 'm/x:free');
  assert.equal(seen.body.max_tokens, 55);
  assert.equal(seen.body.messages[0].role, 'system');
  assert.match(seen.body.messages[0].content, /JSON Schema/);

  const down = compat(async () => new Response('{"error":"sk-secret-123 hết quota"}', { status: 429, headers: { 'retry-after': '90' } }));
  await assert.rejects(down.generateJson(REQ), (e) => {
    assert.equal(e.code, 'llm_busy');
    assert.equal(e.statusCode, 503);
    assert.equal(e.retryAfterMs, 90_000);
    assert.ok(!e.message.includes('sk-secret'));
    return true;
  });
  const boom = compat(async () => { throw new Error('connect ECONNREFUSED sk-secret-123'); });
  await assert.rejects(boom.generateJson(REQ), (e) => e.code === 'llm_unavailable' && !e.message.includes('sk-secret'));
});

test('OpenAI-compatible LLM: json_schema khi cấu hình; response_format bị từ chối (400) => thử lại không có và nhớ', async () => {
  const bodies = [];
  const p = compat(async (_u, init) => {
    const b = JSON.parse(init.body);
    bodies.push(b);
    return b.response_format ? new Response('{}', { status: 400 }) : okBody('{"a":1}');
  }, { jsonMode: 'json_schema' });
  assert.deepEqual((await p.generateJson(REQ)).json, { a: 1 });
  assert.equal(bodies[0].response_format.type, 'json_schema');
  assert.equal(bodies[1].response_format, undefined);
  await p.generateJson(REQ);
  assert.equal(bodies[2].response_format, undefined, 'đã nhớ nhà cung cấp không hỗ trợ');
  assert.equal(extractJsonObject('không phải json'), null);
  assert.deepEqual(extractJsonObject('lời dẫn {"a":{"b":"}"}} đuôi'), { a: { b: '}' } });
});

test('OpenAI-compatible LLM (vision): ảnh => message image_url data URI; nguồn không bật vision từ chối ảnh; âm thanh luôn từ chối', async () => {
  let body;
  const v = compat(async (_u, init) => { body = JSON.parse(init.body); return okBody('{"items":[]}'); }, { vision: true });
  await v.generateJson({ ...IMG, turns: [{ role: 'user', parts: [{ inline: { mimeType: 'image/png', base64: 'QUJD' } }, { text: 'Liệt kê' }] }] });
  const content = body.messages[1].content;
  assert.deepEqual(content[0], { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } });
  assert.deepEqual(content[1], { type: 'text', text: 'Liệt kê' });

  const textOnly = compat(async () => okBody('{}'));
  await assert.rejects(textOnly.generateJson(IMG), (e) => e.code === 'llm_unsupported');
  await assert.rejects(v.generateJson({ ...REQ, turns: [{ role: 'user', parts: [{ inline: { mimeType: 'audio/wav', base64: 'AAAA' } }] }] }), (e) => e.code === 'llm_unsupported');
});

test('OpenAI-compatible LLM + chuỗi: nội dung không phải JSON => llm_bad_output => nguồn kế', async () => {
  const bad = compat(async () => okBody('xin lỗi, tôi không thể'));
  const good = fake('g', [{ ok: 1 }]);
  const { llm } = chain([{ name: 'bad', generateJson: (r) => bad.generateJson(r) }, good]);
  assert.equal((await llm.generateJson(REQ)).provider, 'g');
});

test('OpenAI-compatible STT: multipart tới /audio/transcriptions với Bearer, model, language; 429 => llm_busy', async () => {
  let seen;
  const stt = new OpenAiCompatSttClient({ name: 'groq:whisper-large-v3-turbo', baseUrl: 'https://api.example/openai/v1', apiKey: 'gsk-secret', model: 'whisper-large-v3-turbo', language: 'vi', timeoutMs: 5000 }, async (url, init) => {
    seen = { url, headers: init.headers, form: init.body };
    return new Response(JSON.stringify({ text: ' Xin chào ' }), { status: 200 });
  });
  const r = await stt.transcribe({ bytes: Buffer.from('RIFF'), mimetype: 'audio/wav' });
  assert.equal(r.text, 'Xin chào');
  assert.equal(seen.url, 'https://api.example/openai/v1/audio/transcriptions');
  assert.equal(seen.headers.authorization, 'Bearer gsk-secret');
  assert.equal(seen.form.get('model'), 'whisper-large-v3-turbo');
  assert.equal(seen.form.get('language'), 'vi');
  assert.equal(seen.form.get('file').name, 'audio.wav');

  const limited = new OpenAiCompatSttClient({ name: 'g', baseUrl: 'https://x/v1', apiKey: 'k', model: 'm', language: 'vi', timeoutMs: 1000 }, async () => new Response('', { status: 429 }));
  await assert.rejects(limited.transcribe({ bytes: Buffer.from('x'), mimetype: 'audio/wav' }), (e) => e.code === 'llm_busy');
});

test('STT_CHAIN: nguồn đầu 429 => nguồn kế; hết chuỗi => llm_busy', async () => {
  const mk = (name, step) => ({ name, async transcribe() { if (step instanceof Error) throw step; return { text: step, confidence: 1, tokens: 0 }; } });
  const c = clock();
  const breaker = new CircuitBreaker({ openMs: 180_000, failureThreshold: 3, transientOpenMs: 60_000, now: c.now });
  const opts = { breaker, budgetMs: 9000, now: c.now };
  const ok = new FallbackSttProvider([{ id: 'g', provider: mk('g', busy()) }, { id: 'w', provider: mk('w', 'xin chào') }], opts);
  const r = await ok.transcribe({ bytes: Buffer.alloc(1), mimetype: 'audio/wav' });
  assert.equal(r.text, 'xin chào');
  assert.equal(r.provider, 'w');
  const dead = new FallbackSttProvider([{ id: 'g2', provider: mk('g2', busy()) }], opts);
  await assert.rejects(dead.transcribe({ bytes: Buffer.alloc(1), mimetype: 'audio/wav' }), (e) => e.code === 'llm_busy');
});

// ---------- cấu hình ----------
test('parseChain: tách ở dấu : đầu tiên; model giữ nguyên / và :', () => {
  assert.deepEqual(parseChain('gemini, openrouter:google/gemma-3-27b-it:free ,groq:openai/gpt-oss-120b'), [
    { provider: 'gemini', id: 'gemini' },
    { provider: 'openrouter', model: 'google/gemma-3-27b-it:free', id: 'openrouter:google/gemma-3-27b-it:free' },
    { provider: 'groq', model: 'openai/gpt-oss-120b', id: 'groq:openai/gpt-oss-120b' }
  ]);
  assert.deepEqual(parseChain(undefined), []);
});

const cfg = (env) => loadConfig({ NODE_ENV: 'test', ...env });

test('registry: mục thiếu khóa/model bị bỏ qua có báo; chuỗi rỗng => null (bộ giả lập); mặc định = gemini nếu có khóa', () => {
  const none = createAiProviders(cfg({}));
  assert.equal(none.llm, null);
  assert.equal(none.vision, null);
  assert.equal(none.stt, null);

  const def = createAiProviders(cfg({ GEMINI_API_KEY: 'k'.repeat(30) }));
  assert.match(def.llm.name, /gemini:/);
  assert.ok(def.stt && def.vision);

  const r = createAiProviders(cfg({ LLM_CHAIN: 'gemini,openrouter:m/a:free,groq:b,nous,together:x', GROQ_API_KEY: 'g'.repeat(20) }));
  assert.equal(r.llm.name, 'chain(groq:b)');
  assert.equal(r.skipped.length, 4);
  assert.ok(r.skipped.some((s) => s.includes('OPENROUTER_API_KEY')));
  assert.ok(r.skipped.some((s) => s.includes('thiếu model')));
  assert.ok(r.skipped.some((s) => s.includes('TOGETHER_API_KEY')));
  assert.ok(!JSON.stringify(r.skipped).includes('g'.repeat(20)), 'không lộ khóa');
});

test('registry: cloudflare cần CLOUDFLARE_ACCOUNT_ID; nhà cung cấp tùy ý cần <TÊN>_BASE_URL; vision/stt dựng độc lập', async () => {
  const urls = [];
  const fetchImpl = async (url) => { urls.push(String(url)); return okBody('{"items":[]}'); };
  const r = createAiProviders(
    cfg({
      LLM_CHAIN: 'cloudflare:@cf/m,together:foo',
      VISION_CHAIN: 'openrouter:v/vision:free',
      STT_CHAIN: 'groq:whisper-large-v3-turbo',
      CLOUDFLARE_API_KEY: 'c'.repeat(20),
      CLOUDFLARE_ACCOUNT_ID: 'acc1',
      TOGETHER_API_KEY: 't'.repeat(20),
      TOGETHER_BASE_URL: 'https://together.test/v1',
      OPENROUTER_API_KEY: 'o'.repeat(20),
      GROQ_API_KEY: 'g'.repeat(20)
    }),
    { fetchImpl }
  );
  assert.equal(r.skipped.length, 0);
  assert.equal(r.llm.name, 'chain(cloudflare:@cf/m,together:foo)');
  assert.equal(r.vision.name, 'chain(openrouter:v/vision:free)');
  assert.equal(r.stt.name, 'chain(groq:whisper-large-v3-turbo)');
  await r.llm.generateJson(REQ);
  assert.equal(urls[0], 'https://api.cloudflare.com/client/v4/accounts/acc1/ai/v1/chat/completions');
  await r.vision.generateJson(IMG);
  assert.equal(urls[1], 'https://openrouter.ai/api/v1/chat/completions');
  // chuỗi LLM mặc định KHÔNG nhận ảnh (nguồn chưa khai báo vision) => ảnh bị bỏ qua => llm_busy
  await assert.rejects(r.llm.generateJson(IMG), (e) => e.code === 'llm_busy');
});
