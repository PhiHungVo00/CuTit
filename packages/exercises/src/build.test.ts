import { beforeEach, describe, expect, it } from 'vitest';
import { COURSE, COURSE_SENTENCES } from '@vietlearning/content';
import { checkSentenceOrder, type SentenceItem } from '@vietlearning/contracts/a8';
import { learnerStore } from '@vietlearning/state';
import { buildItem, parseRefKey, refKey } from './build';

beforeEach(() => learnerStore.getState().setPreferences({ uiLanguage: 'vi' }));

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
