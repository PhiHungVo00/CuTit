import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { learnerStore } from '@vietlearning/state';
import { ChoiceExercise } from './choice/ChoiceExercise';
import StoryExercise from './story/StoryExercise';
import { answerFeedback, FeedbackMascot } from './feedback';
import type { ExerciseItem } from './types';

const sfx = vi.hoisted(() => ({ playSfx: vi.fn(), haptic: vi.fn() }));
vi.mock('@vietlearning/shared/audio', () => sfx);
vi.mock('@vietlearning/native', () => ({ getDeviceSpeech: () => ({ speak: vi.fn(async () => undefined) }) }));
vi.mock('./audio/coursePlayer', () => ({ playText: vi.fn(async () => undefined), stopPlayback: vi.fn() }));

beforeEach(() => {
  sfx.playSfx.mockClear();
  sfx.haptic.mockClear();
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
});
afterEach(cleanup);

const item: Extract<ExerciseItem, { kind: 'choice' }> = {
  kind: 'choice',
  key: 'meaning:w1',
  variant: 'meaning',
  prompt: 'Nghĩa là gì?',
  options: ['hello', 'bye'],
  answer: 'hello',
  explanation: ''
};

describe('phản hồi đúng/sai (Cu Tít)', () => {
  it('answerFeedback: đúng ⇒ dung + thanh-cong; sai ⇒ sai + loi', () => {
    answerFeedback(true);
    expect(sfx.playSfx).toHaveBeenLastCalledWith('dung');
    expect(sfx.haptic).toHaveBeenLastCalledWith('thanh-cong');
    answerFeedback(false);
    expect(sfx.playSfx).toHaveBeenLastCalledWith('sai');
    expect(sfx.haptic).toHaveBeenLastCalledWith('loi');
  });

  it('FeedbackMascot: đúng ⇒ khen, sai ⇒ động viên', () => {
    const { rerender } = render(<FeedbackMascot correct />);
    expect(screen.getByRole('img').getAttribute('alt')).toMatch(/khen/);
    rerender(<FeedbackMascot correct={false} />);
    expect(screen.getByRole('img').getAttribute('alt')).toMatch(/động viên/);
  });

  it('trắc nghiệm: chọn đúng ⇒ âm đúng + Cu Tít khen, chỉ phát một lần', () => {
    render(<ChoiceExercise item={item} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'hello' }));
    expect(sfx.playSfx).toHaveBeenCalledTimes(1);
    expect(sfx.playSfx).toHaveBeenCalledWith('dung');
    expect(screen.getByRole('status').querySelector('img')?.getAttribute('alt')).toMatch(/khen/);
  });

  it('trắc nghiệm: chọn sai ⇒ âm sai + Cu Tít động viên', () => {
    render(<ChoiceExercise item={item} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'bye' }));
    expect(sfx.playSfx).toHaveBeenCalledWith('sai');
    expect(sfx.haptic).toHaveBeenCalledWith('loi');
    expect(screen.getByRole('status').querySelector('img')?.getAttribute('alt')).toMatch(/động viên/);
  });

  it('truyện: mỗi câu hỏi trả lời đều có phản hồi', () => {
    const story: Extract<ExerciseItem, { kind: 'story' }> = {
      kind: 'story', key: 's', prompt: 'p', title: 't', titleEn: 't', lines: [{ speaker: 'A', text: 'x', en: 'x' }],
      questions: [{ question: 'q', questionEn: 'q', options: ['a', 'b'], answer: 'a' }]
    };
    render(<StoryExercise item={story} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Trả lời câu hỏi/ }));
    fireEvent.click(screen.getByRole('button', { name: 'b' }));
    expect(sfx.playSfx).toHaveBeenCalledWith('sai');
  });
});
