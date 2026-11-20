import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatEventSchema, QuotaStatusSchema, RemainingSchema } from '@vietlearning/contracts';
import { createDbProvider } from '../dist/db/client.js';
import { DbGlobalQuotaStore, DbQuotaStore } from '../dist/pipeline/DbQuotaStore.js';
import { InMemoryGlobalQuotaStore, InMemoryQuotaStore, quotaDay, quotaResetAt } from '../dist/pipeline/QuotaStore.js';
import { LlmProviderError } from '../dist/providers/llm.js';
import { CircuitBreaker, FallbackLlmProvider } from '../dist/providers/chain.js';
import { makeApp, guest } from './helpers.mjs';

const SID = '7d444840-9dc0-11d1-b245-5ffdce74fad2';
const SECRET = 'q'.repeat(40);
const events = (body) => body.split('\n\n').filter(Boolean).map((c) => ChatEventSchema.parse(JSON.parse(c.replace(/^data: /, ''))));
const at = (iso) => new Date(iso);

const GOOD = { reply: 'Chào bạn!', correction: null, blocks: [], completedTasks: [], newWords: [] };
const okLlm = () => ({ name: 'ok', async generateJson() { return { json: GOOD, tokens: 40, provider: 'ok:model' }; } });
/** chuỗi mà MỌI nguồn đều 429 => llm_busy */
function deadChain() {
  const breaker = new CircuitBreaker({ openMs: 180_000, failureThreshold: 3, transientOpenMs: 60_000 });
  const src = { name: 'd', async generateJson() { throw new LlmProviderError(503, 'llm_busy', '429', 429); } };
  return new FallbackLlmProvider('llm', [{ id: 'd', provider: src }], { breaker, budgetMs: 9000 });
}
const turn = (a, headers, accept = 'text/event-stream') =>
  a.inject({ method: 'POST', url: '/v1/chat/turn', headers: { ...headers, accept }, payload: { sessionId: SID, userText: 'xin chào' } });
const quota = async (a, headers) => QuotaStatusSchema.parse((await a.inject({ method: 'GET', url: '/v1/quota', headers })).json());

// ---------- ngày giờ Việt Nam ----------
test('ngày hạn mức theo giờ Việt Nam: đổi ngày đúng 17:00 UTC (00:00 UTC+7), resetAt là 17:00 UTC kế tiếp', () => {
  assert.equal(quotaDay(at('2026-11-20T16:59:59.999Z')), '2026-11-20');
  assert.equal(quotaDay(at('2026-11-20T17:00:00.000Z')), '2026-11-21');
  assert.equal(quotaDay(at('2026-11-20T00:00:00.000Z')), '2026-11-20', '00:00 UTC = 07:00 VN: cùng ngày UTC');
  assert.equal(quotaDay(at('2026-12-31T17:00:00Z')), '2027-01-01', 'qua năm/tháng đúng');
  assert.equal(quotaResetAt(at('2026-11-20T16:59:59Z')), '2026-11-20T17:00:00.000Z');
  assert.equal(quotaResetAt(at('2026-11-20T17:00:00Z')), '2026-11-21T17:00:00.000Z');
  assert.equal(quotaResetAt(at('2026-02-28T20:00:00Z')), '2026-03-01T17:00:00.000Z', 'cuối tháng 2');
});

test('DbQuotaStore qua ranh giới 00:00 giờ VN: không reset trước, reset đúng lúc; hoàn lượt không sang ngày mới; không mất/cộng nhầm', async () => {
  const db = createDbProvider({ PGLITE_DIR: 'memory://' });
  const a = await makeApp({ JWT_SECRET: SECRET }, { db });
  const g = await guest(a);
  const id = g.body.userId;
  let now = at('2026-11-20T16:59:00Z'); // 23:59 VN
  const store = new DbQuotaStore(db, () => now);
  assert.deepEqual(await store.tryConsume(id, 'turn', 1, 2), { ok: true, used: 1 });
  assert.deepEqual(await store.tryConsume(id, 'turn', 1, 2), { ok: true, used: 2 });
  assert.equal((await store.tryConsume(id, 'turn', 1, 2)).ok, false);

  now = at('2026-11-20T16:59:59.999Z');
  assert.equal(await store.get(id, 'turn'), 2, 'trước 00:00 VN vẫn là ngày cũ');
  now = at('2026-11-20T17:00:00Z'); // 00:00 VN ngày kế
  assert.equal(await store.get(id, 'turn'), 0, 'đúng 00:00 VN: hạn mức mới');
  assert.deepEqual(await store.tryConsume(id, 'turn', 1, 2), { ok: true, used: 1 });

  // Hoàn lượt chỉ tác động ngày hiện tại: lượt của ngày cũ không bị "hoàn" vào ngày mới
  await store.refund(id, 'turn', 5);
  assert.equal(await store.get(id, 'turn'), 0, 'không xuống dưới 0');
  now = at('2026-11-20T16:00:00Z'); // quay lại ngày cũ (chỉ để kiểm dòng cũ còn nguyên)
  assert.equal(await store.get(id, 'turn'), 2);

  // 00:00–17:00 UTC cùng khóa với cách tính UTC cũ (đếm tiếp), tức là không cộng nhầm lúc triển khai giữa ngày
  now = at('2026-11-21T03:00:00Z');
  assert.equal(quotaDay(now), '2026-11-21');
  await a.close();
  await db.close();
});

test('InMemoryQuotaStore / GlobalQuotaStore: tự đổi ngày theo giờ VN', async () => {
  let now = at('2026-11-20T16:59:00Z');
  const m = new InMemoryQuotaStore(() => now);
  await m.tryConsume('u', 'llm', 10, 100);
  assert.equal(await m.get('u', 'llm'), 10);
  now = at('2026-11-20T17:00:01Z');
  assert.equal(await m.get('u', 'llm'), 0);
  const gl = new InMemoryGlobalQuotaStore(() => now);
  assert.equal((await gl.tryConsume('turn', 1, 1)).ok, true);
  assert.equal((await gl.tryConsume('turn', 1, 1)).ok, false);
  now = at('2026-11-21T17:00:01Z');
  assert.equal((await gl.tryConsume('turn', 1, 1)).ok, true);
});

test('DbGlobalQuotaStore: nguyên tử (20 song song, trần 5 => đúng 5), hoàn trả, đổi ngày VN', async () => {
  const db = createDbProvider({ PGLITE_DIR: 'memory://' });
  let now = at('2026-11-20T10:00:00Z');
  const store = new DbGlobalQuotaStore(db, () => now);
  const rs = await Promise.all(Array.from({ length: 20 }, () => store.tryConsume('turn', 1, 5)));
  assert.equal(rs.filter((r) => r.ok).length, 5);
  assert.equal(await store.get('turn'), 5);
  await store.refund('turn', 2);
  assert.equal(await store.get('turn'), 3);
  await store.refund('turn', 99);
  assert.equal(await store.get('turn'), 0);
  await store.tryConsume('turn', 5, 5);
  now = at('2026-11-20T17:00:00Z');
  assert.equal(await store.get('turn'), 0, 'ngày mới theo giờ VN');
  await db.close();
});

// ---------- không trừ lượt khi AI lỗi ----------
test('AI hết chuỗi (llm_busy) => KHÔNG trừ lượt/token; phân biệt rõ với quota_exceeded; SSE và JSON', async () => {
  const db = createDbProvider({ PGLITE_DIR: 'memory://' });
  const a = await makeApp({ JWT_SECRET: SECRET, MAX_CHAT_TURNS_PER_DAY: '2' }, { db, llm: deadChain() });
  const g = await guest(a);

  for (let i = 0; i < 5; i++) {
    const sse = await turn(a, g.headers);
    assert.equal(sse.statusCode, 200);
    assert.equal(events(sse.body).find((e) => e.type === 'error').code, 'llm_busy');
    const json = await turn(a, g.headers, 'application/json');
    assert.equal(json.statusCode, 503);
    assert.equal(json.json().error, 'llm_busy');
    assert.notEqual(json.json().error, 'quota_exceeded');
  }
  const q = await quota(a, g.headers);
  assert.equal(q.turns.used, 0, '10 lượt lỗi AI không trừ lượt nào dù hạn mức chỉ 2');
  assert.equal(q.llmTokens.used, 0);
  await a.close();

  // Khi AI sống lại: dùng bình thường, sau 2 lượt thật mới hết lượt => quota_exceeded (mã khác llm_busy)
  const b = await makeApp({ JWT_SECRET: SECRET, MAX_CHAT_TURNS_PER_DAY: '2' }, { db, llm: okLlm() });
  assert.equal((await turn(b, g.headers)).statusCode, 200);
  assert.equal((await turn(b, g.headers)).statusCode, 200);
  const over = await turn(b, g.headers);
  assert.equal(over.statusCode, 429);
  assert.equal(over.json().error, 'quota_exceeded');
  assert.equal(over.json().scope, undefined, 'hết lượt riêng, không phải trần chung');
  await b.close();
  await db.close();
});

test('kết quả chat/turn kèm remaining (SSE done + JSON); lượt thật trừ đúng 1, token đối soát', async () => {
  const a = await makeApp({ JWT_SECRET: SECRET, MAX_CHAT_TURNS_PER_DAY: '5' }, { llm: okLlm() });
  const g = await guest(a);
  const done = events((await turn(a, g.headers)).body).find((e) => e.type === 'done');
  assert.equal(done.turnsLeft, 4);
  assert.deepEqual(RemainingSchema.parse(done.remaining), done.remaining);
  assert.equal(done.remaining.turns, 4);
  assert.ok(done.remaining.llmTokens < 100000);
  assert.equal(done.remaining.sttSeconds, 600);
  const json = await turn(a, g.headers, 'application/json');
  assert.equal(json.json().remaining.turns, 3);
  assert.equal(json.headers['x-ai-provider'], 'ok:model', 'header nội bộ ghi nguồn đã trả lời (tên, không khóa)');
  await a.close();
});

// ---------- trần toàn cục ----------
test('trần toàn cục: hết trần chung => 429 quota_exceeded scope=global, hoàn lại phần đã trừ của người dùng; ngày mới thì mở lại', async () => {
  let now = at('2026-11-20T10:00:00Z');
  const globalQuotaStore = new InMemoryGlobalQuotaStore(() => now);
  const quotaStore = new InMemoryQuotaStore(() => now);
  const a = await makeApp({ JWT_SECRET: SECRET, GLOBAL_MAX_TURNS_PER_DAY: '3', MAX_CHAT_TURNS_PER_DAY: '10' }, { llm: okLlm(), globalQuotaStore, quotaStore });
  const u1 = await guest(a);
  const u2 = await guest(a);
  assert.equal((await turn(a, u1.headers)).statusCode, 200);
  assert.equal((await turn(a, u1.headers)).statusCode, 200);
  assert.equal((await turn(a, u2.headers)).statusCode, 200);
  const over = await turn(a, u2.headers);
  assert.equal(over.statusCode, 429);
  const body = over.json();
  assert.equal(body.error, 'quota_exceeded');
  assert.equal(body.scope, 'global');
  assert.equal(body.capability, 'turn');
  assert.equal(body.resetAt, '2026-11-20T17:00:00.000Z');
  // lượt bị từ chối vì trần chung KHÔNG làm người dùng mất lượt riêng
  assert.equal((await quota(a, u2.headers)).turns.used, 1);
  assert.equal(await globalQuotaStore.get('turn'), 3);

  now = at('2026-11-20T17:00:00Z'); // 00:00 VN
  assert.equal((await turn(a, u2.headers)).statusCode, 200);
  await a.close();
});

test('trần toàn cục = 0 là tắt; lỗi AI hoàn lượt người dùng, nhưng lần gọi đã chạm nhà cung cấp vẫn tính vào trần chung', async () => {
  const globalQuotaStore = new InMemoryGlobalQuotaStore();
  const off = await makeApp({ JWT_SECRET: SECRET, GLOBAL_MAX_TURNS_PER_DAY: '0' }, { llm: okLlm(), globalQuotaStore });
  const g = await guest(off);
  for (let i = 0; i < 3; i++) assert.equal((await turn(off, g.headers)).statusCode, 200);
  assert.equal(await globalQuotaStore.get('turn'), 0, 'trần tắt: không đếm');
  await off.close();

  const store2 = new InMemoryGlobalQuotaStore();
  const dead = await makeApp({ JWT_SECRET: SECRET, GLOBAL_MAX_TURNS_PER_DAY: '50' }, { llm: deadChain(), globalQuotaStore: store2 });
  const g2 = await guest(dead);
  await turn(dead, g2.headers); // lần đầu chạm nhà cung cấp (429) => đã đốt hạn mức nhà cung cấp => vẫn tính vào trần chung
  assert.equal(await store2.get('turn'), 1, 'lần gọi thật chạm nhà cung cấp không được hoàn trần chung');
  for (let i = 0; i < 5; i++) await turn(dead, g2.headers); // nguồn đã ngắt mạch: không chạm nhà cung cấp => hoàn trần chung
  assert.equal(await store2.get('turn'), 1, 'ngắt mạch: không gọi nhà cung cấp nên không đốt trần chung');
  assert.equal((await quota(dead, g2.headers)).turns.used, 0, 'người dùng luôn được hoàn lượt');
  assert.equal((await turn(dead, g2.headers, 'application/json')).json().error, 'llm_busy');
  await dead.close();
});

test('route AI khác: STT hết chuỗi => hoàn giây đã trừ; ảnh hết chuỗi => hoàn lượt ảnh; kết quả kèm remaining', async () => {
  const sttDead = { name: 'x', async transcribe() { throw new (await import('../dist/pipeline/RequestPipeline.js')).GatewayError(503, 'llm_busy', 'bận'); } };
  const a = await makeApp({ JWT_SECRET: SECRET }, { llm: okLlm(), stt: sttDead, vision: deadChain() });
  const g = await guest(a);

  const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]).toString('base64');
  const v = await a.inject({ method: 'POST', url: '/v1/vision/label', headers: g.headers, payload: { imageBase64: JPEG } });
  assert.equal(v.statusCode, 503);
  assert.equal(v.json().error, 'llm_busy');
  assert.equal((await a.inject({ method: 'GET', url: '/v1/quota', headers: g.headers })).statusCode, 200);

  const boundary = '----x';
  const wav = Buffer.alloc(44 + 3200);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + 3200, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(3200, 40);
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-disposition: form-data; name="audio"; filename="a.wav"\r\ncontent-type: audio/wav\r\n\r\n`),
    wav,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const t = await a.inject({ method: 'POST', url: '/v1/speech/transcribe', headers: { ...g.headers, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
  assert.equal(t.statusCode, 503);
  assert.equal(t.json().error, 'llm_busy');
  const q = await quota(a, g.headers);
  assert.equal(q.sttSeconds.used, 0, 'STT lỗi không trừ giây');
  await a.close();

  // thành công: có remaining
  const good = { name: 's', async transcribe() { return { text: 'xin chào', confidence: 0.9, tokens: 0, provider: 's:m' }; } };
  const b = await makeApp({ JWT_SECRET: SECRET }, { llm: okLlm(), stt: good });
  const g2 = await guest(b);
  const ok = await b.inject({ method: 'POST', url: '/v1/speech/transcribe', headers: { ...g2.headers, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().remaining.sttSeconds, 600 - 1);
  assert.equal(ok.headers['x-ai-provider'], 's:m');
  await b.close();
});
