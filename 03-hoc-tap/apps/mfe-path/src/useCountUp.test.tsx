import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useCountUp } from './useCountUp';

function Probe({ to }: { to: number }) {
  return <span data-testid="n">{useCountUp(to, 600)}</span>;
}

beforeEach(() => {
  vi.useFakeTimers();
  delete document.documentElement.dataset.reducedMotion;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete document.documentElement.dataset.reducedMotion;
});

describe('useCountUp', () => {
  it('đếm từ 0 lên đích trong ~600ms rồi dừng ở đích', () => {
    const { getByTestId } = render(<Probe to={10} />);
    expect(getByTestId('n').textContent).toBe('0');
    act(() => void vi.advanceTimersByTime(300));
    const mid = Number(getByTestId('n').textContent);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(10);
    act(() => void vi.advanceTimersByTime(500));
    expect(getByTestId('n').textContent).toBe('10');
  });

  it('giảm chuyển động (công tắc của app) => hiện thẳng đích', () => {
    document.documentElement.dataset.reducedMotion = 'true';
    const { getByTestId } = render(<Probe to={10} />);
    expect(getByTestId('n').textContent).toBe('10');
  });

  it('đích bằng 0 => 0', () => {
    const { getByTestId } = render(<Probe to={0} />);
    expect(getByTestId('n').textContent).toBe('0');
  });
});
