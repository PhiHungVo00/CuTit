import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { learnerStore } from '@vietlearning/state';
import { ExplainButton } from './ExplainButton';

beforeEach(() => learnerStore.getState().setPreferences({ uiLanguage: 'en' }));
afterEach(cleanup);

describe('ExplainButton', () => {
  it('bấm => gửi kèm ngôn ngữ giao diện, hiển thị chữ thuần (HTML không được render)', async () => {
    const explain = vi.fn(async () => ({ explanation: '<b>cá</b> means fish', tip: 'Rising tone goes up.', mock: false, cached: false }));
    render(<ExplainButton request={{ kind: 'choice', question: 'cá?', answer: 'fish', userAnswer: 'eggplant' }} explain={explain} />);
    fireEvent.click(screen.getByRole('button', { name: '💡 Explain more' }));
    expect(await screen.findByText('<b>cá</b> means fish')).toBeTruthy();
    expect(document.querySelector('b')).toBeNull();
    expect(screen.getByText(/Rising tone goes up/)).toBeTruthy();
    expect(explain).toHaveBeenCalledWith({ kind: 'choice', question: 'cá?', answer: 'fish', userAnswer: 'eggplant', language: 'en' });
  });

  it('lỗi mạng => báo lỗi, vẫn bấm lại được', async () => {
    const explain = vi.fn(async () => Promise.reject(new Error('offline')));
    render(<ExplainButton request={{ kind: 'build', question: 'q', answer: 'a', userAnswer: '' }} explain={explain} />);
    fireEvent.click(screen.getByRole('button', { name: '💡 Explain more' }));
    expect(await screen.findByText(/Couldn’t get an explanation/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '💡 Explain more' })).toHaveProperty('disabled', false);
  });
});
