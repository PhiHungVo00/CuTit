// Review kiến trúc nhánh gateway-ai-du-phong (21/11/2026): các lỗi tái hiện trước khi sửa.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { QuotaStatusSchema } from '@vietlearning/contracts';
import { InMemoryGlobalQuotaStore, InMemoryQuotaStore } from '../dist/pipeline/QuotaStore.js';
import { GatewayError } from '../dist/pipeline/RequestPipeline.js';
import { LlmProviderError } from '../dist/providers/llm.js';
import { CircuitBreaker, FallbackLlmProvider } from '../dist/providers/chain.js';
import { createDbProvider } from '../dist/db/client.js';
import { makeApp as makeAppRaw, guest } from './helpers.mjs';

// Một DB PGlite dùng chung cho cả tệp: mỗi makeApp() riêng phải mở PGlite + chạy toàn bộ migration ở request đầu
// (~5 s CPU; dưới tải/chạy cùng cả bộ test thành hàng chục giây, 7 lần => hết giờ). Các ca chỉ dùng tài khoản khách
// mới (userId riêng) và kho hạn mức trong RAM riêng từng app nên không đụng nhau.
const dbp = createDbProvider({ PGLITE_DIR: 'memory://' });
after(() => dbp.close());
const makeApp = (env, opts = {}) => makeAppRaw(env, { db: dbp, ...opts });

const SECRET = 'r'.repeat(40);
const SID = '7d444840-9dc0-11d1-b245-5ffdce74fad2';
const at = (iso) => new Date(iso);
const GOOD = { reply: 'Chào bạn!', correction: null, blocks: [], completedTasks: [], newWords: [] };
const turn = (a, headers) =>
  a.inject({ method: 'POST', url: '/v1/chat/turn', headers: { ...headers, accept: 'application/json' }, payload: { sessionId: SID, userText: 'xin chào' } });
const quota = async (a, headers) => QuotaStatusSchema.parse((await a.inject({ method: 'GET', url: '/v1/quota', headers })).json());

test('llm_blocked (bộ lọc an toàn từ chối nội dung người dùng gửi) KHÔNG hoàn lượt: chặn đốt trần chung miễn phí', async () => {
  const blocked = { name: 'b', async generateJson() { throw new GatewayError(422, 'llm_blocked', 'chặn'); } };
  const globalQuotaStore = new InMemoryGlobalQuotaStore();
  const a = await makeApp({ JWT_SECRET: SECRET, MAX_CHAT_TURNS_PER_DAY: '3', GLOBAL_MAX_TURNS_PER_DAY: '100' }, { llm: blocked, globalQuotaStore });
  const g = await guest(a);
  const r = await turn(a, g.headers);
  assert.equal(r.statusCode, 422);
  assert.equal(r.json().error, 'llm_blocked');
  assert.equal((await quota(a, g.headers)).turns.used, 1, 'lượt bị chặn vẫn tính cho người gửi');
  assert.equal(await globalQuotaStore.get('turn'), 1);
  for (let i = 0; i < 5; i++) await turn(a, g.headers);
  assert.equal(await globalQuotaStore.get('turn'), 3, 'một người không thể đốt trần chung quá hạn mức riêng của mình');
  await a.close();
});

test('ngắt mạch: 4xx do YÊU CẦU (400/413/415/422 từ nhà cung cấp) không ngắt nguồn cho mọi người', () => {
  const t = 0;
  const b = new CircuitBreaker({ openMs: 180_000, failureThreshold: 3, transientOpenMs: 60_000, now: () => t });
  for (const s of [400, 413, 415, 422, 400, 400]) b.recordFailure('v', new LlmProviderError(502, 'llm_unavailable', `x (${s})`, s));
  assert.equal(b.isOpen('v'), false, 'ảnh/âm thanh hỏng của một người không làm nguồn bị nghỉ');
  for (let i = 0; i < 3; i++) b.recordFailure('v', new LlmProviderError(502, 'llm_unavailable', 'x (500)', 500));
  assert.equal(b.isOpen('v'), true, '5xx liên tiếp vẫn ngắt như cũ');
});

test('chuỗi: 400 ở nguồn đầu vẫn thử nguồn kế (chỉ không tính vào ngắt mạch)', async () => {
  const breaker = new CircuitBreaker({ openMs: 180_000, failureThreshold: 1, transientOpenMs: 60_000 });
  const bad = { name: 'a', async generateJson() { throw new LlmProviderError(502, 'llm_unavailable', 'x (400)', 400); } };
  const ok = { name: 'b', async generateJson() { return { json: GOOD, tokens: 1 }; } };
  const chain = new FallbackLlmProvider('llm', [{ id: 'a', provider: bad }, { id: 'b', provider: ok }], { breaker, budgetMs: 9000 });
  assert.equal((await chain.generateJson({ system: '', turns: [], schema: {} })).provider, 'b');
  assert.equal(breaker.isOpen('a'), false);
});

test('trần token chung đếm token THẬT (bù chênh lệch), không chỉ ước lượng', async () => {
  const big = { name: 'big', async generateJson() { return { json: GOOD, tokens: 5000, provider: 'big:m' }; } };
  const globalQuotaStore = new InMemoryGlobalQuotaStore();
  const a = await makeApp({ JWT_SECRET: SECRET, GLOBAL_MAX_LLM_TOKENS_PER_DAY: '1000000' }, { llm: big, globalQuotaStore });
  const g = await guest(a);
  assert.equal((await turn(a, g.headers)).statusCode, 200);
  assert.equal((await quota(a, g.headers)).llmTokens.used, 5000);
  assert.equal(await globalQuotaStore.get('llm'), 5000, 'trần chung khớp token thật của nhà cung cấp');
  await a.close();
});

test('hoàn lượt qua 00:00 giờ VN: hoàn vào ngày ĐÃ trừ, không tặng lượt cho ngày mới', async () => {
  let now = at('2026-11-20T16:59:59Z'); // 23:59:59 VN
  const clock = () => now;
  const quotaStore = new InMemoryQuotaStore(clock);
  const globalQuotaStore = new InMemoryGlobalQuotaStore(clock);
  let release;
  let started;
  const reached = new Promise((r) => (started = r));
  const slow = {
    name: 'slow',
    async generateJson() {
      await new Promise((r) => {
        release = r;
        started();
      });
      throw new LlmProviderError(503, 'llm_busy', '429', 429);
    }
  };
  const a = await makeApp({ JWT_SECRET: SECRET, MAX_CHAT_TURNS_PER_DAY: '5' }, { llm: slow, quotaStore, globalQuotaStore, clock });
  const g = await guest(a);
  const pending = turn(a, g.headers);
  await reached; // lời gọi AI đã chạy tới chỗ chờ (không quay vòng đợi: tốn CPU và nghẽn khi máy tải)
  now = at('2026-11-20T17:00:01Z'); // 00:00:01 VN ngày mới
  await quotaStore.tryConsume(g.body.userId, 'turn', 2, 5); // người dùng đã dùng 2 lượt ở ngày mới (request khác)
  await globalQuotaStore.tryConsume('turn', 2, 100);
  release();
  assert.equal((await pending).statusCode, 503);
  assert.equal(await quotaStore.get(g.body.userId, 'turn'), 2, 'lượt ngày mới không bị trừ bớt bởi lần hoàn của ngày cũ');
  assert.equal(await globalQuotaStore.get('turn'), 2, 'trần chung ngày mới cũng không bị trừ bớt');
  await a.close();
});

test('consume: kho trần chung lỗi (ném) => hoàn phần đã trừ của người dùng', async () => {
  const globalQuotaStore = { async tryConsume() { throw new Error('db down'); }, async refund() {}, async add() {}, async get() { return 0; } };
  const quotaStore = new InMemoryQuotaStore();
  const ok = { name: 'ok', async generateJson() { return { json: GOOD, tokens: 1 }; } };
  const a = await makeApp({ JWT_SECRET: SECRET }, { llm: ok, quotaStore, globalQuotaStore });
  const g = await guest(a);
  assert.equal((await turn(a, g.headers)).statusCode, 500);
  assert.equal(await quotaStore.get(g.body.userId, 'turn'), 0);
  await a.close();
});

test('remaining đọc lỗi sau khi AI đã trả lời => vẫn 200 (bỏ remaining), không biến lần gọi đã tốn tiền thành 500', async () => {
  const quotaStore = new InMemoryQuotaStore();
  quotaStore.getAll = async () => { throw new Error('db hiccup'); };
  const ok = { name: 'ok', async generateJson() { return { json: { explanation: 'Vì vậy.', tip: 'Nhớ nhé' }, tokens: 1 }; } };
  const a = await makeApp({ JWT_SECRET: SECRET }, { llm: ok, quotaStore });
  const g = await guest(a);
  const r = await a.inject({ method: 'POST', url: '/v1/practice/explain', headers: g.headers, payload: { kind: 'choice', question: 'Chọn từ đúng', answer: 'ăn', userAnswer: 'uống', language: 'vi' } });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().remaining, undefined);
  await a.close();
});

test('mọi nguồn đã gọi đều trả 4xx do YÊU CẦU (ảnh hỏng) => llm_rejected (422), KHÔNG hoàn lượt (không đốt trần chung miễn phí)', async () => {
  const breaker = new CircuitBreaker({ openMs: 180_000, failureThreshold: 3, transientOpenMs: 60_000 });
  const bad = { name: 'v', supportsImage: true, async generateJson() { throw new LlmProviderError(502, 'llm_unavailable', 'x (400)', 400); } };
  const vision = new FallbackLlmProvider('vision', [{ id: 'v', provider: bad }], { breaker, budgetMs: 9000 });
  const quotaStore = new InMemoryQuotaStore();
  const globalQuotaStore = new InMemoryGlobalQuotaStore();
  const a = await makeApp({ JWT_SECRET: SECRET, GLOBAL_MAX_VISION_PER_DAY: '100' }, { llm: null, vision, quotaStore, globalQuotaStore });
  const g = await guest(a);
  const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]).toString('base64');
  for (let i = 0; i < 4; i++) {
    const r = await a.inject({ method: 'POST', url: '/v1/vision/label', headers: g.headers, payload: { imageBase64: JPEG } });
    assert.equal(r.statusCode, 422);
    assert.equal(r.json().error, 'llm_rejected');
  }
  assert.equal(await quotaStore.get(g.body.userId, 'vision'), 4, 'ảnh bị nhà cung cấp từ chối vẫn tính lượt người gửi');
  assert.equal(await globalQuotaStore.get('vision'), 4);
  await a.close();
});

test('chuỗi: một nguồn 400 + một nguồn 429 => vẫn llm_busy (lỗi hỗn hợp, hoàn lượt như cũ)', async () => {
  const breaker = new CircuitBreaker({ openMs: 180_000, failureThreshold: 3, transientOpenMs: 60_000 });
  const bad = { name: 'a', async generateJson() { throw new LlmProviderError(502, 'llm_unavailable', 'x (400)', 400); } };
  const busy = { name: 'b', async generateJson() { throw new LlmProviderError(503, 'llm_busy', '429', 429); } };
  const chain = new FallbackLlmProvider('llm', [{ id: 'a', provider: bad }, { id: 'b', provider: busy }], { breaker, budgetMs: 9000 });
  const err = await chain.generateJson({ system: '', turns: [], schema: {} }).catch((e) => e);
  assert.equal(err.code, 'llm_busy');
});

test('trả lời mẫu (không gọi nhà cung cấp) KHÔNG trừ trần chung: /culture/ask không khớp thẻ, /practice/generate giả lập', async () => {
  const globalQuotaStore = new InMemoryGlobalQuotaStore();
  const a = await makeApp({ JWT_SECRET: SECRET, GLOBAL_MAX_LLM_TOKENS_PER_DAY: '1000000' }, { llm: null, globalQuotaStore });
  const g = await guest(a);
  const r1 = await a.inject({ method: 'POST', url: '/v1/culture/ask', headers: g.headers, payload: { question: 'zzqxw không khớp gì cả', language: 'vi' } });
  assert.equal(r1.statusCode, 200);
  const r2 = await a.inject({ method: 'POST', url: '/v1/practice/generate', headers: g.headers, payload: { count: 3 } });
  assert.ok(r2.statusCode < 500);
  assert.equal(await globalQuotaStore.get('llm'), 0, 'trần chung chỉ dành cho lời gọi nhà cung cấp thật');
});
