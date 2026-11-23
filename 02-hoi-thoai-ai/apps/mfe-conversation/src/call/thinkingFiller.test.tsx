// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FILLER_DELAY_MS, useThinkingFiller } from './thinkingFiller';

describe('useThinkingFiller', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('chờ > 1 200 ms ở thinking ⇒ phát "ừm" đúng một lần', () => {
    const say = vi.fn();
    const { rerender } = renderHook(({ phase }) => useThinkingFiller(phase, say), { initialProps: { phase: 'thinking' as string } });
    vi.advanceTimersByTime(FILLER_DELAY_MS - 1);
    expect(say).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(say).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(say).toHaveBeenCalledTimes(1);
    rerender({ phase: 'thinking' });
    expect(say).toHaveBeenCalledTimes(1);
  });

  it('trả lời về trước 1 200 ms ⇒ không phát', () => {
    const say = vi.fn();
    const { rerender } = renderHook(({ phase }) => useThinkingFiller(phase, say), { initialProps: { phase: 'thinking' as string } });
    vi.advanceTimersByTime(800);
    rerender({ phase: 'speaking' });
    vi.advanceTimersByTime(5000);
    expect(say).not.toHaveBeenCalled();
  });

  it('lượt kế tiếp lại được phát một lần', () => {
    const say = vi.fn();
    const { rerender } = renderHook(({ phase }) => useThinkingFiller(phase, say), { initialProps: { phase: 'thinking' as string } });
    vi.advanceTimersByTime(1300);
    rerender({ phase: 'speaking' });
    rerender({ phase: 'listening' });
    rerender({ phase: 'thinking' });
    vi.advanceTimersByTime(1300);
    expect(say).toHaveBeenCalledTimes(2);
  });
});
