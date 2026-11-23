import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COURSE,
  HONORIFIC_PAIRS_20,
  SITUATIONS,
  STORIES,
  findSituation,
  findStory,
  resolveSituation,
  situationAnswer,
  speakableTexts,
  localizeText
} from '../dist/index.js';

const isNfc = (s) => s === s.normalize('NFC');
const lessonRefs = (u) => u.lessons.flatMap((l) => l.exercises);

test('GĐ2b xưng hô ngữ cảnh: mỗi tình huống có cờ reviewed, có cảnh vi + en, ngữ cảnh đủ giới tính', () => {
  assert.ok(SITUATIONS.length >= 6);
  const ids = new Set();
  for (const s of SITUATIONS) {
    assert.match(s.id, /^hs\d+$/);
    assert.ok(!ids.has(s.id), `trùng ${s.id}`);
    ids.add(s.id);
    assert.equal(typeof s.reviewed, 'boolean');
    assert.ok(s.scene && s.sceneEn && isNfc(s.scene), s.id);
    const c = s.context;
    assert.ok(Number.isInteger(c.speakerAge) && Number.isInteger(c.listenerAge), s.id);
    // A6 trả dạng gạch chéo (“bác/chú”) khi thiếu giới tính => luôn ghi rõ giới tính hai bên
    assert.ok(c.speakerGender && c.listenerGender, `${s.id}: cần giới tính hai bên`);
    assert.equal(c.pairId, undefined, `${s.id}: đáp án phải do luật A6 suy ra, không chỉ định cặp`);
  }
  assert.equal(findSituation('khong-co'), undefined);
});

test('GĐ2b: đáp án lấy từ luật A6 (HonorificInterpreter), không có dạng gạch chéo, cặp trỏ tới 20 cặp', () => {
  for (const s of SITUATIONS) {
    const r = resolveSituation(s);
    assert.ok(!r.speaker.includes('/') && !r.listener.includes('/'), `${s.id}: ${r.speaker} – ${r.listener}`);
    assert.ok(r.explanation, s.id);
    // bản chụp trong JSON phải đúng bằng kết quả luật A6 hiện tại
    assert.deepEqual(situationAnswer(s), r, `${s.id}: bản chụp a6 lệch luật A6 — chụp lại`);
    const pair = HONORIFIC_PAIRS_20.find((p) => p.id === r.pairId);
    assert.ok(pair, `${s.id}: ${r.pairId}`);
    assert.ok(r.explanationEn, `${s.id}: cần lời giải tiếng Anh`);
  }
  // giá trị cụ thể của vài tình huống (kiểm luật A6 không bị đổi âm thầm)
  const hs = (id) => resolveSituation(findSituation(id));
  assert.deepEqual([hs('hs1').speaker, hs('hs1').listener], ['em', 'anh']);
  assert.deepEqual([hs('hs4').speaker, hs('hs4').listener], ['cháu', 'bác']);
  assert.deepEqual([hs('hs6').speaker, hs('hs6').listener], ['cháu', 'ông']);
});

test('GĐ2b truyện: 1 truyện/unit, có cờ reviewed, câu ngắn NFC, 3 câu hỏi có đáp án không trùng nhiễu', () => {
  assert.deepEqual(STORIES.map((s) => s.unit), ['u1', 'u2', 'u3']);
  for (const s of STORIES) {
    assert.match(s.id, /^st\d+$/);
    assert.equal(typeof s.reviewed, 'boolean');
    assert.ok(s.title && s.titleEn, s.id);
    assert.ok(s.lines.length >= 4 && s.lines.length <= 8, `${s.id}: ${s.lines.length} câu`);
    for (const l of s.lines) {
      assert.ok(l.speaker && l.text && l.en && isNfc(l.text), `${s.id}: ${l.text}`);
      assert.ok(l.text.split(/\s+/).length <= 14, `${s.id}: câu A1 phải ngắn: ${l.text}`);
    }
    assert.equal(s.questions.length, 3, s.id);
    for (const q of s.questions) {
      assert.ok(q.q && q.qEn && q.answer && isNfc(q.q) && isNfc(q.answer), `${s.id}: ${q.q}`);
      assert.ok(q.distractors.length >= 2, `${s.id}: ${q.q}`);
      const all = [q.answer, ...q.distractors].map((x) => x.toLocaleLowerCase('vi'));
      assert.equal(new Set(all).size, all.length, `${s.id}: lựa chọn trùng ở “${q.q}”`);
      // đổi theo miền không được làm đáp án trùng với nhiễu
      for (const d of ['north', 'central', 'south']) {
        const loc = all.map((x) => localizeText(x, d));
        assert.equal(new Set(loc).size, loc.length, `${s.id}/${d}: “${q.q}”`);
      }
    }
  }
  assert.equal(findStory('khong-co'), undefined);
});

test('GĐ2b: mỗi unit có ≥ 2 bài xưng hô ngữ cảnh và đúng 1 truyện, ở bài thường (không phải bài 1)', () => {
  for (const u of COURSE.units) {
    const refs = lessonRefs(u);
    assert.ok(refs.filter((r) => r.type === 'situation').length >= 2, `${u.id} thiếu bài tình huống`);
    const stories = refs.filter((r) => r.type === 'story');
    assert.equal(stories.length, 1, `${u.id}: số truyện`);
    assert.equal(findStory(stories[0].story).unit, u.id);
    assert.ok(!u.lessons[0].exercises.some((r) => r.type === 'story'), 'bài 1 không có truyện (người mới < 60 giây)');
  }
});

test('GĐ2b: câu của truyện có trong gói âm thanh của unit, đã đổi từ theo miền (A7)', () => {
  for (const s of STORIES) {
    for (const d of ['north', 'central', 'south']) {
      const pack = speakableTexts(s.unit, d);
      for (const l of s.lines) {
        const text = localizeText(l.text, d).normalize('NFC').trim();
        assert.ok(pack.includes(text), `${s.unit}/${d} thiếu “${text}”`);
      }
    }
  }
  const south = speakableTexts('u2', 'south').join(' ');
  assert.ok(!/dứa/.test(south) && /thơm/.test(south), 'truyện chợ ở miền Nam đọc “thơm”');
});
