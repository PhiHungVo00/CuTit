import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { learnerStore } from '@vietlearning/state';
import { SlowListen, say } from './listen';

const speak = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@vietlearning/native', () => ({ getDeviceSpeech: () => ({ speak }) }));

beforeEach(() => {
  speak.mockClear();
  learnerStore.getState().setPreferences({ uiLanguage: 'vi', speed: 1 });
});
afterEach(() => {
  cleanup();
  learnerStore.getState().reset();
});

describe('Nút đọc chậm (việc sót GĐ4a)', () => {
  it('đọc lại bằng TTS của máy ở 0,75× tốc độ gốc của màn (nhân tốc độ M12)', () => {
    render(<SlowListen text="xin chào" base={0.85} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nghe chậm' }));
    expect(speak).toHaveBeenCalledTimes(1);
    const [text, opts] = speak.mock.calls[0] as unknown as [string, { rate: number }];
    expect(text).toBe('xin chào');
    expect(opts.rate).toBeCloseTo(0.85 * 0.75);
  });

  it('tốc độ M12 vẫn áp dụng; nút thường đọc ở tốc độ gốc', async () => {
    learnerStore.getState().setPreferences({ speed: 1.2 });
    render(<SlowListen text="xin chào" base={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nghe chậm' }));
    expect((speak.mock.calls[0] as unknown as [string, { rate: number }])[1].rate).toBeCloseTo(1.2 * 0.75);
    await say('xin chào', 0.9);
    expect((speak.mock.calls[1] as unknown as [string, { rate: number }])[1].rate).toBeCloseTo(1.2 * 0.9);
  });

  it('tiếng Anh', () => {
    learnerStore.getState().setPreferences({ uiLanguage: 'en' });
    render(<SlowListen text="xin chào" base={0.85} />);
    expect(screen.getByRole('button', { name: 'Listen slowly' }).textContent).toContain('0.75×');
  });
});
