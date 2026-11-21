import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatEventSchema, ChatSummarizeResponseSchema } from '@vietlearning/contracts';
import { SystemPromptBuilder } from '@vietlearning/prompts';
import { loadConfig } from '../dist/config.js';
import { buildApp } from '../dist/app.js';
import { LlmProviderError } from '../dist/providers/llm.js';

const SID = '7d444840-9dc0-11d1-b245-5ffdce74fad2';
const JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]).toString('base64');
const app = (opts = {}, env = {}) => buildApp(loadConfig({ NODE_ENV: 'test', AUTH_REQUIRED: 'false', ...env }), { logger: false, ...opts });
const events = (body) => body.split('\n\n').filter(Boolean).map((c) => ChatEventSchema.parse(JSON.parse(c.replace(/^data: /, ''))));
const turn = (a, payload) => a.inject({ method: 'POST', url: '/v1/chat/turn', headers: { accept: 'text/event-stream' }, payload: { sessionId: SID, ...payload } });
const doneOf = (res) => events(res.body).find((e) => e.type === 'done');
const TUTOR_JSON = { reply: 'Đây là quả cam. Bạn thích cam không?', correction: null, blocks: [], completedTasks: [], newWords: [] };

function fake(name, json, tokens = 40) {
  const calls = [];
  return { calls, provider: { name, async generateJson(req) { calls.push(req); if (json instanceof Error) throw json; return { json, tokens, provider: name }; } } };
}

test('history: 11 phần tử => 400; 10 => OK', async () => {
  const llm = fake('llm', TUTOR_JSON);
  const a = await app({ llm: llm.provider });
  const h = (n) => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'tutor' : 'user', text: `câu ${i}` }));
  assert.equal((await turn(a, { userText: 'chào', history: h(11) })).statusCode, 400);
  assert.equal((await turn(a, { userText: 'chào', history: h(10) })).statusCode, 200);
  await a.close();
});

test('summary > 600 ký tự => 400; summary xuất hiện trong prompt gửi đi', async () => {
  const llm = fake('llm', TUTOR_JSON);
  const a = await app({ llm: llm.provider });
  assert.equal((await turn(a, { userText: 'chào', summary: 'x'.repeat(601) })).statusCode, 400);
  const res = await turn(a, { userText: 'chào', summary: 'Người học tên Mai, xưng cháu.' });
  assert.equal(res.statusCode, 200);
  assert.match(llm.calls[0].system, /Người học tên Mai, xưng cháu\./);
  await a.close();
});

test('lượt có ảnh: đi VISION_CHAIN (không đi LLM), trừ 1 turns + 1 visionImages; ảnh nằm trong lượt gửi đi', async () => {
  const llm = fake('llm', TUTOR_JSON);
  const vis = fake('vis', TUTOR_JSON);
  const a = await app({ llm: llm.provider, vision: vis.provider });
  const before = doneOf(await turn(a, { userText: 'chào' })).remaining;
  const d = doneOf(await turn(a, { userText: 'đây là gì?', imageBase64: JPEG_B64 }));
  assert.equal(vis.calls.length, 1);
  assert.equal(llm.calls.length, 1, 'chỉ lượt chữ trước đó đi LLM');
  const last = vis.calls[0].turns.at(-1);
  assert.ok(last.parts.some((p) => p.inline?.mimeType === 'image/jpeg' && p.inline.base64 === JPEG_B64));
  assert.match(vis.calls[0].system, /hình/);
  assert.equal(d.remaining.visionImages, before.visionImages - 1);
  assert.equal(d.remaining.turns, before.turns - 1);
  await a.close();
});

test('lượt có ảnh: dữ liệu không phải JPEG/PNG => 415, không trừ gì', async () => {
  const vis = fake('vis', TUTOR_JSON);
  const a = await app({ vision: vis.provider, llm: vis.provider });
  const res = await turn(a, { userText: 'x', imageBase64: Buffer.from('không phải ảnh').toString('base64') });
  assert.equal(res.statusCode, 415);
  assert.equal(vis.calls.length, 0);
  await a.close();
});

test('lượt có ảnh: AI bận => hoàn cả turns lẫn visionImages (không trừ lượt người dùng)', async () => {
  const llm = fake('llm', TUTOR_JSON);
  const vis = fake('vis', new LlmProviderError(503, 'llm_busy', '429', 429));
  const a = await app({ llm: llm.provider, vision: vis.provider });
  const base = doneOf(await turn(a, { userText: 'chào' })).remaining;
  const res = await turn(a, { userText: 'đây là gì?', imageBase64: JPEG_B64 });
  assert.ok(events(res.body).some((e) => e.type === 'error' && e.code === 'llm_busy'));
  const after = doneOf(await turn(a, { userText: 'chào lại' })).remaining;
  assert.equal(after.visionImages, base.visionImages, 'ảnh được hoàn');
  assert.equal(after.turns, base.turns - 1, 'chỉ lượt chữ thứ hai bị trừ');
  await a.close();
});

test('/chat/summarize: trả summary ≤ 600 qua Zod, không đổi remaining.turns, tính vào trần llm chung', async () => {
  const llm = fake('llm', { summary: 'Mai (cháu), đang học chào hỏi; hay quên dấu hỏi.' });
  const a = await app({ llm: llm.provider });
  const before = doneOf(await turn(a, { userText: 'chào' })).remaining;
  const res = await a.inject({
    method: 'POST',
    url: '/v1/chat/summarize',
    payload: { sessionId: SID, previousSummary: 'Mai.', history: [{ role: 'user', text: 'chào cô' }, { role: 'tutor', text: 'chào em' }], explanationLanguage: 'vi' }
  });
  assert.equal(res.statusCode, 200, res.body);
  const body = ChatSummarizeResponseSchema.parse(res.json());
  assert.ok(body.summary.length <= 600);
  assert.equal(body.remaining.turns, before.turns, 'không trừ lượt');
  assert.match(llm.calls[1].system, /tóm tắt/i);
  assert.match(JSON.stringify(llm.calls[1].turns), /Mai\./, 'tóm tắt cũ được đưa vào');
  assert.ok(body.remaining.llmTokens < before.llmTokens, 'token thật được ghi (đi vào trần chung)');
  await a.close();
});

test('/chat/summarize: history 21 phần tử => 400; AI bận => 503 llm_busy và hoàn token; bản dài quá 600 => không trả', async () => {
  const items = (n) => Array.from({ length: n }, () => ({ role: 'user', text: 'a' }));
  const busyLlm = fake('llm', new LlmProviderError(503, 'llm_busy', '429', 429));
  const a = await app({ llm: busyLlm.provider });
  const post = (history) => a.inject({ method: 'POST', url: '/v1/chat/summarize', payload: { sessionId: SID, history } });
  assert.equal((await post(items(21))).statusCode, 400);
  const res = await post(items(2));
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, 'llm_busy');
  await a.close();

  const longLlm = fake('llm', { summary: 'y'.repeat(700) });
  const b = await app({ llm: longLlm.provider });
  const r2 = await b.inject({ method: 'POST', url: '/v1/chat/summarize', payload: { sessionId: SID, history: items(2) } });
  assert.notEqual(r2.statusCode, 200);
  await b.close();
});

test('/chat/summarize: chưa cấu hình AI => 503 llm_busy (không bịa tóm tắt)', async () => {
  const a = await app({ llm: null, vision: null, stt: null });
  const res = await a.inject({ method: 'POST', url: '/v1/chat/summarize', payload: { sessionId: SID, history: [{ role: 'user', text: 'a' }] } });
  assert.equal(res.statusCode, 503);
  await a.close();
});

test('prompt mode:call gọn ≤ 1200 token (ước lượng ký tự/4) kể cả có kịch bản + tóm tắt 600 ký tự + ảnh', () => {
  const b = new SystemPromptBuilder()
    .setScenario({ title: 'Gọi phở', location: 'quán phở', tasks: ['chào chủ quán', 'gọi một tô phở', 'hỏi giá', 'cảm ơn và tạm biệt'] })
    .setMode('call')
    .setSummary('s'.repeat(600))
    .setHasImage(true)
    .setExplanationLanguage('en');
  const text = b.build();
  assert.ok(text.length / 4 <= 1200, `quá dài: ${Math.ceil(text.length / 4)} token`);
  assert.match(text, /s{50}/);
  const chat = new SystemPromptBuilder().setMode('chat').build();
  assert.ok(text.length < chat.length + 600, 'bản gọi không dài hơn bản chat đáng kể');
});
