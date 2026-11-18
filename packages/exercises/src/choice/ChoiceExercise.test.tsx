import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { learnerStore } from '@vietlearning/state';
import { ChoiceExercise } from './ChoiceExercise';
import type { ExerciseItem } from '../types';

vi.mock('@vietlearning/native', () => ({ getDeviceSpeech: () => ({ speak: vi.fn(async () => undefined) }) }));

beforeEach(() => learnerStore.getState().setPreferences({ uiLanguage: 'vi' }));
afterEach(cleanup);

const item: Extract<ExerciseItem, { kind: 'choice' }> = {
  kind: 'choice',
  key: 'listen:w1',
  variant: 'listen',
  prompt: 'Nghe và chọn',
  speak: 'xin chào',
  options: ['tạm biệt', 'xin chào', 'cảm ơn'],
  answer: 'xin chào',
  explanation: '“xin chào” = hello.'
};

describe('ChoiceExercise', () => {
  it('chọn sai => hiện đáp án, Tiếp trả kết quả sai (quality 1)', () => {
    const onDone = vi.fn();
    render(<ChoiceExercise item={item} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'cảm ơn' }));
    expect(screen.getByRole('status').textContent).toContain('Đáp án: “xin chào”');
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp →' }));
    expect(onDone).toHaveBeenCalledWith({ key: 'listen:w1', correct: false, skipped: false, quality: 1, answer: 'xin chào' });
  });

  it('chọn đúng => kết quả đúng (quality 5); không đổi được lựa chọn sau khi chọn', () => {
    const onDone = vi.fn();
    render(<ChoiceExercise item={item} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'xin chào' }));
    expect(screen.getByRole('button', { name: 'tạm biệt' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp →' }));
    expect(onDone.mock.calls[0][0]).toMatchObject({ correct: true, quality: 5 });
  });

  it('dạng nghe có nút “Không nghe được lúc này” gọi onSkip', () => {
    const onSkip = vi.fn();
    render(<ChoiceExercise item={item} onDone={vi.fn()} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole('button', { name: /Không nghe được lúc này/ }));
    expect(onSkip).toHaveBeenCalledOnce();
  });
});
