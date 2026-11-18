import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COURSE,
  COURSE_WORDS,
  COURSE_SENTENCES,
  SENTENCE_ITEMS,
  HONORIFIC_PAIRS_20,
  DIALECT_DICTIONARY,
  PitchReferenceFlyweight,
  findLesson,
  findWord,
  findSentence
} from '../dist/index.js';

const TONE_IDS = new Set(PitchReferenceFlyweight.all().map((t) => t.id));
const allRefs = () => COURSE.units.flatMap((u) => [...u.lessons.flatMap((l) => l.exercises), ...u.testOut]);
const isNfc = (s) => s === s.normalize('NFC');

test('Khóa A1: 3 unit theo thứ tự, mỗi unit ≥ 4 bài 8–12 câu, kiểm tra vượt 8–12 câu', () => {
  assert.deepEqual(COURSE.units.map((u) => u.id), ['u1', 'u2', 'u3']);
  for (const u of COURSE.units) {
    assert.ok(u.lessons.length >= 4, `${u.id} cần ≥ 4 bài`);
    for (const l of u.lessons) assert.ok(l.exercises.length >= 8 && l.exercises.length <= 12, `${l.id}: ${l.exercises.length} câu`);
    assert.ok(u.testOut.length >= 8 && u.testOut.length <= 12, `${u.id} testOut`);
    assert.equal(u.level, 'A1');
    for (const k of ['title', 'titleEn', 'icon']) assert.ok(u[k], `${u.id}.${k}`);
  }
});

test('id bài duy nhất toàn khóa; findLesson trả đúng unit và vị trí', () => {
  const ids = COURSE.units.flatMap((u) => u.lessons.map((l) => l.id));
  assert.equal(new Set(ids).size, ids.length);
  const f = findLesson('u2l3');
  assert.equal(f.unit.id, 'u2');
  assert.equal(f.index, 2);
  assert.equal(findLesson('khong-co'), undefined);
});

test('Toàn vẹn tham chiếu: mọi exercise trỏ tới nội dung có thật', () => {
  for (const r of allRefs()) {
    const where = JSON.stringify(r);
    switch (r.type) {
      case 'meaning':
        assert.ok(findWord(r.word), where);
        assert.ok(['vi-en', 'en-vi'].includes(r.dir), where);
        break;
      case 'listen':
        assert.ok(findWord(r.word), where);
        break;
      case 'fill': {
        const s = findSentence(r.sentence);
        assert.ok(s, where);
        assert.ok(Number.isInteger(r.blank) && r.blank >= 0 && r.blank < s.tokens.length, where);
        break;
      }
      case 'build':
        assert.ok(findSentence(r.sentence), where);
        break;
      case 'tone':
        assert.ok(TONE_IDS.has(r.tone), where);
        assert.ok(r.word && isNfc(r.word), where);
        break;
      case 'pronoun':
        assert.ok(HONORIFIC_PAIRS_20.some((p) => p.id === r.pair), where);
        break;
      case 'dialect': {
        const e = DIALECT_DICTIONARY.find((d) => d.id === r.entry);
        assert.ok(e, where);
        assert.notEqual(e[r.region], e.north, `${where}: miền đích phải khác miền Bắc`);
        break;
      }
      case 'speak':
        assert.ok(findSentence(r.sentence), where);
        break;
      default:
        assert.fail(`dạng lạ ${where}`);
    }
  }
});

test('GĐ2: mỗi unit có ≥ 1 bài nói lại câu và thẻ miền trỏ mục phương ngữ có thật', () => {
  for (const u of COURSE.units) {
    assert.ok(u.lessons.some((l) => l.exercises.some((e) => e.type === 'speak')), `${u.id} thiếu bài speak`);
    assert.ok(Array.isArray(u.dialectNotes) && u.dialectNotes.length >= 3, `${u.id} dialectNotes`);
    for (const id of u.dialectNotes) assert.ok(DIALECT_DICTIONARY.some((d) => d.id === id), `${u.id}: ${id}`);
  }
});

test('Bài đầu tiên không cần micro hay giọng đọc (người mới xong < 60 giây)', () => {
  const first = COURSE.units[0].lessons[0];
  assert.equal(first.id, 'u1l1');
  assert.ok(first.exercises.every((r) => r.type !== 'tone' && r.type !== 'listen'));
});

test('Nội dung mới là bản nháp (reviewed:false), chuỗi NFC, id câu mới không đụng câu cũ', () => {
  for (const u of COURSE.units) assert.equal(u.reviewed, false);
  const wordIds = new Set();
  for (const w of COURSE_WORDS) {
    assert.match(w.id, /^w\d+$/);
    assert.ok(!wordIds.has(w.id), `trùng ${w.id}`);
    wordIds.add(w.id);
    assert.equal(w.reviewed, false);
    assert.ok(isNfc(w.vi) && isNfc(w.en), w.id);
    assert.equal(Boolean(w.note), Boolean(w.noteEn), `${w.id}: ghi chú cần cả vi và en`);
  }
  const old = new Set(SENTENCE_ITEMS.map((s) => s.id));
  for (const s of COURSE_SENTENCES) {
    assert.match(s.id, /^cs\d+$/);
    assert.ok(!old.has(s.id));
    assert.equal(s.reviewed, false);
    for (const t of s.tokens) assert.ok(isNfc(t.text));
    for (const acc of s.accepted) assert.deepEqual([...acc].sort((a, b) => a - b), [...s.tokens.keys()], `${s.id}: thứ tự phải là hoán vị`);
  }
  assert.equal(SENTENCE_ITEMS.length, 60, 'kho 60 câu cũ giữ nguyên');
});

test('Unit 2 có dứa/thơm/khóm (A7) và mọi unit đều dùng ít nhất 4 dạng bài', () => {
  const u2 = COURSE.units[1];
  const refs = [...u2.lessons.flatMap((l) => l.exercises)];
  assert.ok(refs.some((r) => r.type === 'dialect' && r.entry === 'd3'));
  assert.ok(COURSE_WORDS.some((w) => /khóm/.test(`${w.en} ${w.note ?? ''}`)));
  for (const u of COURSE.units) {
    const types = new Set(u.lessons.flatMap((l) => l.exercises.map((r) => r.type)));
    assert.ok(types.size >= 4, `${u.id}: ${[...types]}`);
  }
});
