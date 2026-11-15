import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { HONORIFIC_PAIRS_20 } from '@vietlearning/content';
import { toUiRelation, useHonorificPlayground } from './useHonorificPlayground';

const pair = (id: string) => HONORIFIC_PAIRS_20.find((p) => p.id === id)!;

describe('useHonorificPlayground (logic bàn điều khiển A6)', () => {
  it('mặc định: gia tộc, bề trên, trang trọng => cháu gọi bác', () => {
    const { result } = renderHook(() => useHonorificPlayground());
    expect(result.current.result.speaker).toBe('cháu');
    expect(result.current.state.explicitPair).toBeNull();
  });

  // Lưu ý (hàng chờ Q11): trong 'kin', preset "Nhỏ hơn" (28 vs 16, lệch đúng 12) chạm ngưỡng chú/cháu của A6.
  it('xã hội + đối phương nhỏ tuổi hơn => anh/em, đổi chiều nói thì đảo vai', () => {
    const { result } = renderHook(() => useHonorificPlayground());
    act(() => {
      result.current.setRelation('social');
      result.current.setAgeStep(3); // tôi lớn hơn
    });
    expect(result.current.result.speaker).toBe('anh');
    expect(result.current.result.listener).toBe('em');
    act(() => result.current.toggleReversed());
    expect(result.current.result.speaker).toBe('em');
  });

  it('áp dụng cặp h20 (relation civic): thuật toán dùng đúng cặp, giao diện đánh dấu nhóm "work"', () => {
    const { result } = renderHook(() => useHonorificPlayground());
    act(() => result.current.applyPair(pair('h20')));
    expect(result.current.result.pairId).toBe('h20');
    expect(result.current.state.relation).toBe('work'); // trước đây là 'civic' => không nút nào được chọn
    expect(result.current.state.explicitPair?.id).toBe('h20');
  });

  it('chỉnh tay bất kỳ lựa chọn nào sau khi áp dụng thì bỏ cặp tường minh', () => {
    const { result } = renderHook(() => useHonorificPlayground());
    act(() => result.current.applyPair(pair('h8')));
    expect(result.current.state.explicitPair).not.toBeNull();
    act(() => result.current.setContextStep(2));
    expect(result.current.state.explicitPair).toBeNull();
  });

  it('toUiRelation gộp civic→work, stranger→social', () => {
    expect(toUiRelation('civic')).toBe('work');
    expect(toUiRelation('stranger')).toBe('social');
    expect(toUiRelation('kin')).toBe('kin');
  });
});
