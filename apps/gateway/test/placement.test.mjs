import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AdaptivePlacement, MIN_QUESTIONS, MAX_QUESTIONS } from '../dist/services/placement/adaptivePlacement.js';
import { PLACEMENT_QUESTIONS } from '@vietlearning/content';
import { loadConfig } from '../dist/config.js';
import { buildApp } from '../dist/app.js';

const byId = new Map(PLACEMENT_QUESTIONS.map((q) => [q.id, q]));

/** Người học giả lập trình độ thật L: đúng câu cấp ≤ L, sai câu cấp > L (tùy chọn: trượt tay với xác suất slip) */
function simulate(trueLevel, { slip = 0, seed = 1 } = {}) {
  const p = new AdaptivePlacement();
  const id = randomUUID();
  // mulberry32: PRNG chuẩn. (Bản LCG trước đó với seed nhỏ cho ra loạt số rất nhỏ ở đầu => "trượt tay"
  // gần như mọi câu thay vì 10%, làm test đổ lỗi oan cho A5.)
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let step = p.next(id);
  let asked = 0;
  while (!step.finished) {
    asked++;
    const q = byId.get(step.question.id);
    const knows = q.level <= trueLevel;
    const answerRight = slip && rand() < slip ? !knows : knows;
    const correctText = q.options[q.answer];
    const correctIdx = step.question.options.indexOf(correctText);
    const choice = answerRight ? correctIdx : (correctIdx + 1) % step.question.options.length;
    step = p.next(id, { questionId: q.id, choice });
  }
  return { level: step.assignedLevel, asked };
}

test('A5: người học ở mọi trình độ 1–6 được xếp đúng trình độ, sau 8–12 câu', () => {
  for (let L = 1; L <= 6; L++) {
    const r = simulate(L);
    assert.ok(Math.abs(r.level - L) <= 1, `trình độ thật ${L} => xếp ${r.level}`);
    assert.ok(r.asked >= MIN_QUESTIONS && r.asked <= MAX_QUESTIONS, `L=${L}: ${r.asked} câu`);
  }
});

test('A5: người học có trượt tay 10% vẫn được xếp lệch tối đa 1 cấp (20 lần chạy mỗi trình độ)', () => {
  for (let L = 1; L <= 6; L++) {
    const results = Array.from({ length: 20 }, (_, i) => simulate(L, { slip: 0.1, seed: 100 + i }).level);
    const within = results.filter((x) => Math.abs(x - L) <= 1).length;
    assert.ok(within >= 18, `L=${L}: chỉ ${within}/20 lần trong ±1 (${results.join(',')})`);
  }
});

test('A5: lựa chọn được xáo (đáp án không luôn ở vị trí đầu); gọi lại không kèm trả lời => gửi lại đúng câu đang chờ', () => {
  const p = new AdaptivePlacement();
  const id = randomUUID();
  const first = p.next(id);
  const again = p.next(id);
  assert.deepEqual(again.question, first.question);
  const positions = new Set();
  for (let i = 0; i < 30; i++) {
    const st = new AdaptivePlacement().next(randomUUID());
    const q = byId.get(st.question.id);
    positions.add(st.question.options.indexOf(q.options[q.answer]));
  }
  assert.ok(positions.size > 1, 'đáp án luôn ở cùng vị trí');
});

test('/placement/next: luồng HTTP thật, trả lời sai câu => 409, contract hợp lệ', async () => {
  const a = await buildApp(loadConfig({ NODE_ENV: 'test', CORS_ORIGIN: 'http://localhost:3000' }), { logger: false });
  const sessionId = randomUUID();
  const r1 = await a.inject({ method: 'POST', url: '/v1/placement/next', payload: { sessionId } });
  assert.equal(r1.statusCode, 200);
  const q = r1.json().question;
  assert.equal(q.index, 1);
  const stale = await a.inject({ method: 'POST', url: '/v1/placement/next', payload: { sessionId, answer: { questionId: 'p999', choice: 0 } } });
  assert.equal(stale.statusCode, 409);
  const r2 = await a.inject({ method: 'POST', url: '/v1/placement/next', payload: { sessionId, answer: { questionId: q.id, choice: 0 } } });
  assert.equal(r2.statusCode, 200);
  assert.equal(typeof r2.json().lastCorrect, 'boolean');
  assert.equal(r2.json().question.index, 2);
  await a.close();
});

test('Bộ giả lập: tỉ lệ trượt tay thực tế ~10% (để test A5 không đổ lỗi oan)', () => {
  let s = 12345 >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const n = 10000;
  let slips = 0;
  for (let i = 0; i < n; i++) if (rand() < 0.1) slips++;
  assert.ok(Math.abs(slips / n - 0.1) < 0.01, `${slips / n}`);
});
