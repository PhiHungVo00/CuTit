import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { learnerStore } from '@vietlearning/state';

const playText = vi.fn(async () => undefined);
vi.mock('./coursePlayer', () => ({ playText: (...a: unknown[]) => playText(...(a as [])), SLOW_RATE: 0.75 }));
vi.mock('@vietlearning/native', () => ({ getDeviceSpeech: () => ({ speak: vi.fn(async () => undefined) }) }));

import { SlowButton } from './SlowButton';
import { ChoiceExercise } from '../choice/ChoiceExercise';

beforeEach(() => {
  playText.mockClear();
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
});
afterEach(cleanup);

describe('Nút 🐢 đọc chậm (D9)', () => {
  it('bấm => đọc lại chậm (slow: true), nhãn song ngữ', () => {
    render(<SlowButton text="xin chào" />);
    fireEvent.click(screen.getByRole('button', { name: 'Nghe chậm' }));
    expect(playText).toHaveBeenCalledWith('xin chào', undefined, { slow: true });
    cleanup();
    learnerStore.getState().setPreferences({ uiLanguage: 'en' });
    render(<SlowButton text="xin chào" />);
    expect(screen.getByRole('button', { name: 'Listen slowly' })).toBeTruthy();
  });

  it('bài nghe chọn có nút 🐢 cạnh nút nghe lại', () => {
    render(
      <ChoiceExercise
        item={{ kind: 'choice', key: 'listen:w1', variant: 'listen', prompt: 'Nghe', speak: 'xin chào', options: ['xin chào', 'cảm ơn'], answer: 'xin chào', explanation: '' }}
        onDone={() => undefined}
      />
    );
    playText.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Nghe chậm' }));
    expect(playText).toHaveBeenCalledWith('xin chào', undefined, { slow: true });
  });
});
