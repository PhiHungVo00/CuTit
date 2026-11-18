import test from 'node:test';
import assert from 'node:assert/strict';
import { AssessResponseSchema, AudioPackSchema, ExplainRequestSchema, ExplainResponseSchema } from '../dist/api/index.js';

test('A3: kết quả chấm câu nhận đủ 5 trạng thái âm tiết, từ chối trạng thái lạ', () => {
  const words = [
    { expected: 'tôi', heard: 'tôi', status: 'correct', pitch: { score: 80, bestMatch: 'ngang' } },
    { expected: 'là', heard: 'la', status: 'tone', expectedTone: 'huyen', heardTone: 'ngang' },
    { expected: 'lan', heard: 'nam', status: 'wrong' },
    { expected: 'ạ', heard: null, status: 'missing' },
    { expected: null, heard: 'lắm', status: 'extra' }
  ];
  const ok = AssessResponseSchema.safeParse({ transcript: 'tôi la nam lắm', words, score: 40, toneChecked: true, mock: false, hints: [] });
  assert.equal(ok.success, true);
  const bad = AssessResponseSchema.safeParse({ transcript: '', words: [{ expected: 'a', heard: 'a', status: 'ok' }], score: 0, toneChecked: false, mock: true, hints: [] });
  assert.equal(bad.success, false);
});

test('Gói âm thanh: khóa phải là sha256 hex; tên gói không chứa đường dẫn', () => {
  const key = 'a'.repeat(64);
  assert.equal(AudioPackSchema.safeParse({ version: 1, pack: 'u1', dialect: 'south', model: 'm', voice: 'v', items: { 'xin chào': key } }).success, true);
  assert.equal(AudioPackSchema.safeParse({ version: 1, pack: '../u1', dialect: 'south', model: 'm', voice: 'v', items: {} }).success, false);
  assert.equal(AudioPackSchema.safeParse({ version: 1, pack: 'u1', dialect: 'south', model: 'm', voice: 'v', items: { a: 'xyz' } }).success, false);
});

test('Giải thích: mặc định tiếng Việt, userAnswer rỗng được; lời giải dài quá bị từ chối', () => {
  const r = ExplainRequestSchema.parse({ kind: 'choice', question: 'Chọn nghĩa', answer: 'hello' });
  assert.equal(r.language, 'vi');
  assert.equal(r.userAnswer, '');
  assert.equal(ExplainRequestSchema.safeParse({ kind: 'html', question: 'a', answer: 'b' }).success, false);
  assert.equal(ExplainResponseSchema.safeParse({ explanation: 'x'.repeat(801), mock: false, cached: false }).success, false);
});
