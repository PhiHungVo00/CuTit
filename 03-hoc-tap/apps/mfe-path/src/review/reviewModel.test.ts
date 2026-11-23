import { describe, expect, it } from 'vitest';
import { mistakeRefs, toneDrill } from './reviewModel';

describe('reviewModel', () => {
  it('lỗi gần đây: mới nhất trước, bỏ khóa hỏng/không còn nội dung, bỏ trùng, có giới hạn', () => {
    const m = [
      { key: 'meaning:w1:vi-en', at: '1' },
      { key: 'rác', at: '2' },
      { key: 'meaning:w999:vi-en', at: '3' },
      { key: 'build:s9', at: '4' },
      { key: 'meaning:w1:vi-en', at: '5' }
    ];
    expect(mistakeRefs(m)).toEqual([
      { type: 'meaning', word: 'w1', dir: 'vi-en' },
      { type: 'build', sentence: 's9' }
    ]);
    const many = Array.from({ length: 20 }, (_, i) => ({ key: `meaning:w${i + 1}:vi-en`, at: String(i) }));
    expect(mistakeRefs(many, 8)).toHaveLength(8);
    expect(mistakeRefs(many, 8)[0]).toEqual({ type: 'meaning', word: 'w20', dir: 'vi-en' });
  });

  it('luyện thanh yếu nhất: 3 câu cùng thanh, từ mẫu thuộc đúng thanh', () => {
    const refs = toneDrill('hoi');
    expect(refs).toHaveLength(3);
    expect(refs.every((r) => r.type === 'tone' && r.tone === 'hoi')).toBe(true);
  });
});
