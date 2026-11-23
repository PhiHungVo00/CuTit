import { beforeEach, describe, expect, it } from 'vitest';
import { COURSE, COURSE_SENTENCES } from '@vietlearning/content';
import { checkSentenceOrder, type SentenceItem } from '@vietlearning/contracts/a8';
import { learnerStore } from '@vietlearning/state';
import { buildItem, parseRefKey, refKey } from './build';

beforeEach(() => learnerStore.getState().setPreferences({ uiLanguage: 'vi', dialect: 'north' }));

const allRefs = COURSE.units.flatMap((u) => [...u.lessons.flatMap((l) => l.exercises), ...u.testOut]);

describe('buildItem', () => {
  it('dựng được MỌI bài của khóa; lựa chọn chứa đáp án đúng một lần, không trùng, 3–4 lựa chọn', () => {
    for (const ref of allRefs) {
      for (const seed of [1, 7, 42]) {
        const item = buildItem(ref, seed);
        if (item.kind !== 'choice') continue;
        const norm = item.options.map((o) => o.normalize('NFC').toLowerCase());
        expect(new Set(norm).size, JSON.stringify(ref)).toBe(item.options.length);
        expect(item.options.filter((o) => o === item.answer)).toHaveLength(1);
        expect(item.options.length).toBeGreaterThanOrEqual(3);
        expect(item.options.length).toBeLessThanOrEqual(4);
      }
    }
  });

  it('xác định theo seed', () => {
    for (const ref of allRefs.slice(0, 20)) expect(buildItem(ref, 5)).toEqual(buildItem(ref, 5));
  });

  it('đề theo ngôn ngữ giao diện, nội dung học giữ tiếng Việt', () => {
    const ref = { type: 'meaning', word: 'w1', dir: 'vi-en' } as const;
    expect(buildItem(ref, 1).prompt).toBe('“xin chào” nghĩa là gì?');
    learnerStore.getState().setPreferences({ uiLanguage: 'en' });
    expect(buildItem(ref, 1).prompt).toBe('What does “xin chào” mean?');
  });

  it('điền từ: chỗ trống đúng vị trí, đáp án là từ bị ẩn', () => {
    const item = buildItem({ type: 'fill', sentence: 's30', blank: 2 }, 3);
    expect(item.kind === 'choice' && item.display).toBe('Em cảm ơn ____ nhiều');
    expect(item.kind === 'choice' && item.answer).toBe('chị');
  });

  it('từ theo miền: nhiễu không chứa tên gọi khác của cùng vật', () => {
    const item = buildItem({ type: 'dialect', entry: 'd3', region: 'south' }, 9);
    expect(item.kind === 'choice' && item.answer).toBe('thơm');
    expect(item.kind === 'choice' && item.options).not.toContain('dứa');
  });

  it('chọn đại từ: không lấy “tôi” hay cách xưng khác cũng đúng với cùng người nghe làm nhiễu', () => {
    for (const pair of ['h2', 'h10', 'h11', 'h12', 'h13', 'h14']) {
      for (const seed of [1, 2, 3, 99]) {
        const item = buildItem({ type: 'pronoun', pair }, seed);
        if (item.kind !== 'choice') throw new Error();
        const wrong = item.options.filter((o) => o !== item.answer);
        expect(wrong, pair).not.toContain('tôi');
        if (pair === 'h2') expect(wrong).not.toContain('con');
      }
    }
  });

  it('xưng hô ngữ cảnh (A6): cảnh tiếng Việt, đáp án “xưng – gọi” do luật A6 suy ra, nhiễu không chấp nhận được', () => {
    const item = buildItem({ type: 'situation', situation: 'hs4' }, 3);
    if (item.kind !== 'choice') throw new Error();
    expect(item.variant).toBe('situation');
    expect(item.display).toContain('55 tuổi');
    expect(item.answer).toBe('cháu – bác');
    expect(item.hint).toBeUndefined();
    expect(item.explanation).toContain('cháu');
    for (const id of ['hs1', 'hs2', 'hs3', 'hs4', 'hs5', 'hs6']) {
      for (const seed of [1, 2, 3, 42, 99]) {
        const it = buildItem({ type: 'situation', situation: id }, seed);
        if (it.kind !== 'choice') throw new Error();
        const [sp, li] = it.answer.split(' – ');
        for (const o of it.options.filter((x) => x !== it.answer)) {
          const [osp, oli] = o.split(' – ');
          // không cùng cách xưng, không cùng cách gọi; không lấy “tôi”; mình–bạn và tớ–cậu không làm nhiễu của nhau
          expect(osp, `${id}: ${o}`).not.toBe(sp);
          expect(oli, `${id}: ${o}`).not.toBe(li);
          expect(osp).not.toBe('tôi');
          expect(o).not.toMatch(/\//);
          if (it.answer === 'mình – bạn') expect(o).not.toBe('tớ – cậu');
          if (sp === 'cháu') expect(osp).not.toBe('con');
        }
      }
    }
    learnerStore.getState().setPreferences({ uiLanguage: 'en' });
    const en = buildItem({ type: 'situation', situation: 'hs4' }, 3);
    expect(en.kind === 'choice' && en.hint).toMatch(/55-year-old man/);
    expect(en.kind === 'choice' && en.display).toContain('55 tuổi');
    expect(en.prompt).toMatch(/[A-Za-z]/);
  });

  it('truyện: câu và câu hỏi đổi theo miền (A7), lựa chọn chứa đáp án, xác định theo seed', () => {
    const north = buildItem({ type: 'story', story: 'st2' }, 5);
    if (north.kind !== 'story') throw new Error();
    expect(north.title).toBe('Đi chợ mua dứa');
    expect(north.lines[0].text).toBe('Chị ơi, dứa bao nhiêu tiền một quả?');
    expect(north.questions).toHaveLength(3);
    for (const q of north.questions) {
      expect(q.options.filter((o) => o === q.answer)).toHaveLength(1);
      expect(q.options).toHaveLength(3);
    }
    expect(buildItem({ type: 'story', story: 'st2' }, 5)).toEqual(north);
    learnerStore.getState().setPreferences({ dialect: 'south' });
    const south = buildItem({ type: 'story', story: 'st2' }, 5);
    if (south.kind !== 'story') throw new Error();
    expect(south.lines[0].text).toBe('Chị ơi, thơm bao nhiêu tiền một trái?');
    expect(south.questions[0].answer).toBe('thơm');
    expect(south.questions[1].question).toBe('Lúc đầu, một trái giá bao nhiêu?');
  });

  it('ref lạ => ném lỗi (test toàn vẹn bắt được)', () => {
    expect(() => buildItem({ type: 'meaning', word: 'w999', dir: 'vi-en' }, 1)).toThrow();
  });
});

describe('refKey / parseRefKey', () => {
  it('khóa duy nhất cho mỗi ref khác nhau và giải ngược được', () => {
    const keys = new Map<string, string>();
    for (const ref of allRefs) {
      const k = refKey(ref);
      const prev = keys.get(k);
      if (prev) expect(prev).toBe(JSON.stringify(ref));
      keys.set(k, JSON.stringify(ref));
      expect(parseRefKey(k)).toEqual(ref);
    }
    expect(parseRefKey('lạ:x')).toBeNull();
    expect(parseRefKey('meaning:w1:sai')).toBeNull();
    expect(parseRefKey('fill:s1:x')).toBeNull();
  });
});

describe('câu ghép mới của khóa học (A8)', () => {
  it('mọi thứ tự chấp nhận của cs* đều được A8 chấm đúng', () => {
    for (const s of COURSE_SENTENCES) {
      for (const acc of s.accepted) {
        const r = checkSentenceOrder(s as unknown as SentenceItem, acc.map((i) => s.tokens[i].text));
        expect(r.valid, s.id).toBe(true);
      }
    }
  });
});

describe('Chế độ miền (A7)', () => {
  it('miền Nam/Trung: từ có trong A7 đổi theo miền; refKey giữ nguyên; bài luyện thanh không đổi', () => {
    learnerStore.getState().setPreferences({ dialect: 'south' });
    const m = buildItem({ type: 'meaning', word: 'w32', dir: 'en-vi' }, 3);
    expect(m.kind === 'choice' && m.answer).toBe('thơm');
    expect(m.key).toBe('meaning:w32:en-vi');
    const sp = buildItem({ type: 'speak', sentence: 'cs4' }, 1);
    expect(sp.kind === 'speak' && sp.text).toBe('Trái thơm này bao nhiêu tiền');
    const b = buildItem({ type: 'build', sentence: 'cs4' }, 1);
    expect(b.kind === 'build' && b.sentence.tokens.map((k) => k.text)).toEqual(['Trái', 'thơm', 'này', 'bao nhiêu tiền']);
    const tone = buildItem({ type: 'tone', tone: 'nga', word: 'ngã' }, 1);
    expect(tone.kind === 'tone' && tone.word).toBe('ngã');
    learnerStore.getState().setPreferences({ dialect: 'north' });
    const n = buildItem({ type: 'meaning', word: 'w32', dir: 'en-vi' }, 3);
    expect(n.kind === 'choice' && n.answer).toBe('dứa');
  });

  it('mọi bài vẫn dựng được ở cả 3 miền, lựa chọn không trùng', () => {
    for (const dialect of ['central', 'south'] as const) {
      learnerStore.getState().setPreferences({ dialect });
      for (const ref of allRefs) {
        const item = buildItem(ref, 5);
        if (item.kind !== 'choice') continue;
        const norm = item.options.map((o) => o.normalize('NFC').toLowerCase());
        expect(new Set(norm).size, `${dialect} ${JSON.stringify(ref)}`).toBe(item.options.length);
        expect(item.options).toContain(item.answer);
      }
    }
  });
});
