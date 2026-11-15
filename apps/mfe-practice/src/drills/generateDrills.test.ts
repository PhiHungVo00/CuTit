import { beforeEach, describe, expect, it } from 'vitest';
import { learnerStore } from '@vietlearning/state';
import { drillFromKey, generateSession, type ChoiceDrill } from './generateDrills';

// Các khẳng định đề bài bên dưới dùng câu tiếng Việt
beforeEach(() => learnerStore.getState().setPreferences({ uiLanguage: 'vi' }));

describe('generateSession (M5)', () => {
  it('đủ 8 bài, có cả 5 dạng, không trùng nội dung, xác định theo seed', () => {
    const a = generateSession({ level: 2, seed: 42 });
    const b = generateSession({ level: 2, seed: 42 });
    expect(a).toHaveLength(8);
    expect(new Set(a.map((d) => d.type))).toEqual(new Set(['quiz', 'fill', 'listen', 'match', 'repeat']));
    expect(new Set(a.map((d) => d.key)).size).toBe(8);
    expect(a.map((d) => d.key)).toEqual(b.map((d) => d.key));
  });

  it('mọi bài trắc nghiệm qua 50 seed: đáp án nằm trong lựa chọn, lựa chọn không trùng, đúng số lượng theo trình độ', () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (const level of [1, 3]) {
        for (const d of generateSession({ level, seed })) {
          if (d.type === 'match' || d.type === 'repeat') continue;
          const c = d as ChoiceDrill;
          expect(c.options).toContain(c.answer);
          expect(new Set(c.options).size).toBe(c.options.length);
          expect(c.options.length).toBe(level <= 1 ? 3 : 4);
        }
      }
    }
  });

  it('thích ứng: thẻ đến hạn ôn được đưa lên đầu phiên', () => {
    const s = generateSession({ level: 2, seed: 7, dueKeys: ['dialect:d13:south', 'honorific:h8'] });
    expect(s[0].key).toBe('dialect:d13:south');
    expect(s[1].key).toBe('honorific:h8');
    expect((s[0] as ChoiceDrill).answer).toBe('heo');
  });

  it('drillFromKey bỏ qua khóa không còn nội dung', () => {
    expect(drillFromKey('dialect:khong-co:south', 2, 1)).toBeNull();
    expect(drillFromKey('fill:s1:0', 2, 1)).toBeNull();
  });

  it('bài ghép: 4 cặp Bắc–Nam khác nhau', () => {
    const m = generateSession({ level: 2, seed: 3 }).find((d) => d.type === 'match');
    expect(m && m.type === 'match' && m.pairs.every((p) => p.left !== p.right)).toBe(true);
  });
});

describe('chất lượng câu hỏi phương ngữ', () => {
  it('không bao giờ hỏi miền có từ trùng miền Bắc', () => {
    for (let seed = 1; seed <= 100; seed++) {
      for (const d of generateSession({ level: 2, seed })) {
        if (d.key.startsWith('dialect:')) {
          const m = d.prompt.match(/gọi “(.+)” là gì/);
          expect(m && (d as ChoiceDrill).answer !== m[1]).toBe(true);
        }
      }
    }
  });

  it('giao diện tiếng Anh: đề bài tiếng Anh, từ cần học vẫn là tiếng Việt', () => {
    learnerStore.getState().setPreferences({ uiLanguage: 'en' });
    const d = drillFromKey('dialect:d1:south', 2, 1) as ChoiceDrill;
    expect(d.prompt).toBe('What do Southern speakers call “ngô”?');
    expect(d.answer).toBe('bắp');
    expect(d.explanation).toMatch(/^Corn: North “ngô”/);
  });
});
