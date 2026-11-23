import test from 'node:test';
import assert from 'node:assert/strict';
import { HONORIFIC_PAIRS_20, HonorificInterpreter, DIALECT_DICTIONARY, translateDialect } from '../dist/index.js';

const RELATIONS = new Set(['kin', 'social', 'teacher_student', 'stranger', 'work', 'civic', 'traditional']);
const GENDERS = new Set(['male', 'female', 'neutral']);

test('Dữ liệu 20 cặp (JSON): đúng hình dạng, id duy nhất, chuỗi chuẩn NFC', () => {
  const ids = new Set();
  for (const p of HONORIFIC_PAIRS_20) {
    assert.match(p.id, /^h\d+$/);
    assert.ok(!ids.has(p.id), `id trùng: ${p.id}`);
    ids.add(p.id);
    assert.ok(RELATIONS.has(p.relation), `${p.id}: relation lạ ${p.relation}`);
    assert.ok(Number.isInteger(p.speakerAge) && Number.isInteger(p.listenerAge), `${p.id}: tuổi phải là số nguyên`);
    for (const key of ['speaker', 'listener', 'politeParticle', 'example', 'explanation', 'wisdom', 'relationName']) {
      assert.equal(typeof p[key], 'string', `${p.id}.${key}`);
      assert.equal(p[key], p[key].normalize('NFC'), `${p.id}.${key} phải ở dạng NFC`);
    }
    if (p.listenerGender) assert.ok(GENDERS.has(p.listenerGender));
    if (p.speakerGender) assert.ok(GENDERS.has(p.speakerGender));
  }
  assert.equal(ids.size, 20);
});

test('Interpreter dùng đúng dữ liệu JSON khi chọn cặp tường minh', () => {
  const res = new HonorificInterpreter().interpret({ speakerAge: 20, listenerAge: 80, relation: 'kin', pairId: 'h1' });
  const h1 = HONORIFIC_PAIRS_20.find((p) => p.id === 'h1');
  assert.equal(res.speaker, h1.speaker);
  assert.equal(res.listener, h1.listener);
});

test('A7 phương ngữ: Bắc "thìa" ↔ Nam "muỗng", Bắc "roi" ↔ Nam "mận" (trước đây bị đảo)', () => {
  assert.equal(translateDialect('thìa', 'south'), 'muỗng');
  assert.equal(translateDialect('muỗng', 'north'), 'thìa');
  assert.equal(translateDialect('roi', 'south'), 'mận');
  assert.equal(translateDialect('Thơm', 'north'), 'dứa');
  assert.equal(translateDialect('không-có', 'north'), undefined);
  assert.ok(DIALECT_DICTIONARY.length >= 20);
  assert.equal(new Set(DIALECT_DICTIONARY.map((d) => d.id)).size, DIALECT_DICTIONARY.length);
  for (const d of DIALECT_DICTIONARY) assert.equal(typeof d.reviewed, 'boolean');
  assert.equal(translateDialect('mô', 'north'), 'đâu');
});

test('M10 văn hóa: đủ 20 thẻ, id duy nhất, có cờ reviewed; truy hồi đúng thẻ theo câu hỏi không dấu', async () => {
  const { CULTURE_CARDS, searchCulture } = await import('../dist/index.js');
  assert.equal(CULTURE_CARDS.length, 20);
  assert.equal(new Set(CULTURE_CARDS.map((c) => c.id)).size, 20);
  for (const c of CULTURE_CARDS) assert.equal(typeof c.reviewed, 'boolean', `${c.id} thiếu cờ reviewed`);
  assert.equal(searchCulture('Có được cắm đũa vào bát cơm không?')[0].id, 'c3');
  assert.equal(searchCulture('li xi ngay Tet la gi')[0].id, 'c5');
  assert.equal(searchCulture('Vì sao người Việt hỏi tuổi?')[0].id, 'c18');
  assert.deepEqual(searchCulture('xyz qwerty'), []);
});
