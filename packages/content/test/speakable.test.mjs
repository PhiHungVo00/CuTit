import test from 'node:test';
import assert from 'node:assert/strict';
import { speakableTexts, sentenceText, findSentence } from '../dist/index.js';

test('Gói âm thanh u1: có từ và câu chuẩn, không trùng, đã NFC', () => {
  const north = speakableTexts('u1', 'north');
  assert.ok(north.includes('xin chào'));
  assert.ok(north.includes(sentenceText(findSentence('cs1'))));
  assert.equal(new Set(north).size, north.length);
  assert.ok(north.every((t) => t === t.normalize('NFC')));
  assert.deepEqual(speakableTexts('khong-co', 'north'), []);
});

test('Gói theo miền: câu có từ A7 đổi theo miền; từ luyện thanh giữ nguyên', () => {
  const allNorth = ['u1', 'u2', 'u3'].flatMap((u) => speakableTexts(u, 'north'));
  const allSouth = ['u1', 'u2', 'u3'].flatMap((u) => speakableTexts(u, 'south'));
  assert.ok(allNorth.some((t) => /dứa/.test(t)), 'khóa có câu chứa "dứa"');
  assert.ok(!allSouth.some((t) => t.includes('dứa')), 'gói miền Nam không còn "dứa"');
  assert.ok(allSouth.some((t) => /thơm/.test(t)));
});
