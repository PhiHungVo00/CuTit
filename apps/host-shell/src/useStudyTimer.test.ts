// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { learnerStore } from '@vietlearning/state';
import { useStudyTimer } from './useStudyTimer';

const total = () => Object.values(learnerStore.getState().activity).reduce((a, b) => a + b, 0);
let visibility: DocumentVisibilityState = 'visible';

describe('useStudyTimer (M9: đếm thời gian học)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    learnerStore.getState().reset();
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('cộng giờ theo lô 15 s khi trang hiển thị và có tương tác', () => {
    renderHook(() => useStudyTimer());
    act(() => void vi.advanceTimersByTime(45_000));
    expect(total()).toBe(45);
  });

  it('không cộng khi để máy sáng mà không chạm quá 2 phút; chạm lại thì đếm tiếp từ lúc chạm', () => {
    renderHook(() => useStudyTimer());
    act(() => void vi.advanceTimersByTime(10 * 60_000));
    const idleTotal = total();
    expect(idleTotal).toBeLessThanOrEqual(120); // chỉ 2 phút đầu được tính
    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
      vi.advanceTimersByTime(30_000);
    });
    expect(total() - idleTotal).toBe(30);
  });

  it('ẩn trang (chuyển app khác) => ghi phần lẻ rồi ngừng đếm', () => {
    renderHook(() => useStudyTimer());
    act(() => {
      vi.advanceTimersByTime(20_000);
      visibility = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(total()).toBe(20);
    act(() => void vi.advanceTimersByTime(60_000));
    expect(total()).toBe(20);
  });
});
