import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { SENTENCE_ITEMS } from '@vietlearning/content';
import { shuffledIndices, useSentenceBuilder } from './useSentenceBuilder';
import { learnerStore } from '@vietlearning/state';

// Lời giải thích A8 trong test là tiếng Việt
beforeEach(() => learnerStore.getState().setPreferences({ uiLanguage: 'vi' }));

const s13 = SENTENCE_ITEMS.find((s) => s.id === 's13')!; // Cô ấy | mặc | áo | đỏ

describe('shuffledIndices', () => {
  it('với mọi câu và nhiều seed: là hoán vị và KHÔNG trùng thứ tự đúng nào', () => {
    for (const item of SENTENCE_ITEMS) {
      for (let seed = 1; seed < 6; seed++) {
        const a = shuffledIndices(item, seed);
        expect([...a].sort((x, y) => x - y)).toEqual([...Array(item.tokens.length).keys()]);
        expect(item.accepted.some((acc) => acc.every((v, i) => v === a[i]))).toBe(false);
      }
    }
  });
});

describe('useSentenceBuilder', () => {
  it('đặt từ theo thứ tự đúng => A8 chấm đúng', () => {
    const { result } = renderHook(() => useSentenceBuilder(s13, 3));
    act(() => [0, 1, 2, 3].forEach((i) => result.current.place(i)));
    expect(result.current.complete).toBe(true);
    act(() => {
      result.current.check();
    });
    expect(result.current.result?.valid).toBe(true);
  });

  it('sai trật tự => lỗi giải thích + đánh dấu từ lệch chỗ; gỡ từ và hoàn tác (Memento)', () => {
    const { result } = renderHook(() => useSentenceBuilder(s13, 3));
    act(() => [0, 1, 3, 2].forEach((i) => result.current.place(i))); // "đỏ áo"
    act(() => {
      result.current.check();
    });
    expect(result.current.result?.valid).toBe(false);
    expect(result.current.result?.errors.join(' ')).toContain('SAU danh từ');
    expect(result.current.result?.misplaced.length).toBeGreaterThan(0);

    act(() => result.current.remove(3)); // gỡ "áo"
    expect(result.current.placed).toEqual([0, 1, 3]);
    expect(result.current.result).toBeNull();
    act(() => result.current.undo());
    expect(result.current.placed).toEqual([0, 1, 3, 2]);
    act(() => result.current.undo());
    expect(result.current.placed).toEqual([0, 1, 3]);
  });

  it('không đặt trùng một từ hai lần', () => {
    const { result } = renderHook(() => useSentenceBuilder(s13, 3));
    act(() => result.current.place(0));
    act(() => result.current.place(0));
    expect(result.current.placed).toEqual([0]);
  });
});
