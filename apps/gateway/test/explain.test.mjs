import test from 'node:test';
import assert from 'node:assert/strict';
import { ExplainResponseSchema } from '@vietlearning/contracts';
import { ExplainCache } from '../dist/services/explain/explain.js';
import { makeApp, guest } from './helpers.mjs';

const body = { kind: 'choice', question: '“cá” nghĩa là gì?', answer: 'fish', userAnswer: 'eggplant', language: 'vi' };

test('Giải thích: không có AI => lời giải theo mẫu có đáp án, mock: true', async () => {
  const app = await makeApp({}, { llm: null });
  const { headers } = await guest(app);
  const res = await app.inject({ method: 'POST', url: '/v1/practice/explain', headers, payload: body });
  assert.equal(res.statusCode, 200, res.body);
  const out = ExplainResponseSchema.parse(res.json());
  assert.equal(out.mock, true);
  assert.match(out.explanation, /“fish”/);
  assert.match(out.explanation, /“eggplant”/);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/practice/explain', headers, payload: { ...body, kind: 'html' } })).statusCode, 400);
  await app.close();
});

test('Giải thích: AI trả JSON hợp lệ; cùng câu lần 2 lấy từ cache (không gọi AI); prompt theo ngôn ngữ', async () => {
  const calls = [];
  const llm = {
    name: 'fake',
    async generateJson(req) {
      calls.push(req);
      return { json: { explanation: '“cá” là con cá (fish); “cà” mới là cà tím.', tip: 'Thanh sắc đi lên.' }, tokens: 50 };
    }
  };
  const app = await makeApp({}, { llm });
  const { headers } = await guest(app);
  const a = (await app.inject({ method: 'POST', url: '/v1/practice/explain', headers, payload: body })).json();
  assert.equal(a.mock, false);
  assert.equal(a.cached, false);
  assert.equal(a.tip, 'Thanh sắc đi lên.');
  const b = (await app.inject({ method: 'POST', url: '/v1/practice/explain', headers, payload: body })).json();
  assert.equal(b.cached, true);
  assert.equal(b.explanation, a.explanation);
  assert.equal(calls.length, 1);
  assert.match(calls[0].system, /tiếng Việt/);
  await app.inject({ method: 'POST', url: '/v1/practice/explain', headers, payload: { ...body, language: 'en' } });
  assert.equal(calls.length, 2, 'ngôn ngữ khác => khóa cache khác');
  assert.match(calls[1].system, /English/);
  await app.close();
});

test('Giải thích: AI trả sai schema => 502 llm_bad_output (không đưa dữ liệu sai lên UI)', async () => {
  const llm = { name: 'fake', generateJson: async () => ({ json: { text: '<b>hi</b>' }, tokens: 1 }) };
  const app = await makeApp({}, { llm });
  const { headers } = await guest(app);
  const res = await app.inject({ method: 'POST', url: '/v1/practice/explain', headers, payload: body });
  assert.equal(res.statusCode, 502);
  assert.equal(res.json().error, 'llm_bad_output');
  await app.close();
});

test('ExplainCache: LRU bỏ mục cũ nhất khi đầy', () => {
  const c = new ExplainCache(2);
  c.set('a', { explanation: 'A' });
  c.set('b', { explanation: 'B' });
  c.get('a');
  c.set('c', { explanation: 'C' });
  assert.equal(c.get('b'), undefined);
  assert.equal(c.get('a').explanation, 'A');
});
