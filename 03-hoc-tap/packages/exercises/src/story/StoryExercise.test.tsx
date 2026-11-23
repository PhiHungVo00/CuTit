import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { learnerStore } from '@vietlearning/state';
import StoryExercise, { gradeStory } from './StoryExercise';
import type { ExerciseItem } from '../types';

const played: string[] = [];
vi.mock('../audio/coursePlayer', () => ({
  playText: vi.fn(async (text: string) => {
    played.push(text);
  }),
  stopPlayback: vi.fn()
}));

beforeEach(() => {
  played.length = 0;
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
});
afterEach(cleanup);

const item: Extract<ExerciseItem, { kind: 'story' }> = {
  kind: 'story',
  key: 'story:st9',
  prompt: 'Nghe truyện rồi trả lời câu hỏi',
  title: 'Gặp bạn mới',
  titleEn: 'Meeting someone new',
  lines: [
    { speaker: 'Lan', text: 'Xin chào! Tôi tên là Lan.', en: 'Hello! My name is Lan.' },
    { speaker: 'Nam', text: 'Chào chị! Em tên là Nam.', en: 'Hello! My name is Nam.' }
  ],
  questions: [
    { question: 'Chị ấy tên là gì?', questionEn: 'What is her name?', options: ['Nam', 'Lan', 'Mai'], answer: 'Lan' },
    { question: 'Nam gọi Lan là gì?', questionEn: 'What does Nam call Lan?', options: ['chị', 'em', 'bà'], answer: 'chị' },
    { question: 'Anh ấy tên là gì?', questionEn: 'What is his name?', options: ['Mai', 'Lan', 'Nam'], answer: 'Nam' }
  ]
};

describe('gradeStory', () => {
  it('đạt khi đúng ≥ 2/3 số câu; SM-2: đúng hết 5, đạt 3, chưa đạt 1', () => {
    expect(gradeStory(3, 3)).toEqual({ correct: true, quality: 5 });
    expect(gradeStory(2, 3)).toEqual({ correct: true, quality: 3 });
    expect(gradeStory(1, 3)).toEqual({ correct: false, quality: 1 });
  });
});

describe('StoryExercise', () => {
  it('đọc cả truyện theo thứ tự từng câu; nghe lại một câu', async () => {
    render(<StoryExercise item={item} onDone={vi.fn()} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Nghe cả truyện/ })));
    expect(played).toEqual(['Xin chào! Tôi tên là Lan.', 'Chào chị! Em tên là Nam.']);
    played.length = 0;
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Nghe câu 2' })));
    expect(played).toEqual(['Chào chị! Em tên là Nam.']);
  });

  it('bản dịch ẩn mặc định, bấm để hiện; có nút “không nghe được” gọi onSkip', () => {
    const onSkip = vi.fn();
    render(<StoryExercise item={item} onDone={vi.fn()} onSkip={onSkip} />);
    expect(screen.queryByText('Hello! My name is Lan.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hiện bản dịch' }));
    expect(screen.getByText('Hello! My name is Lan.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Không nghe được lúc này/ }));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('trả lời từng câu có phản hồi ngay; đúng 2/3 => đạt, thẻ ôn là câu sai', () => {
    const onDone = vi.fn();
    render(<StoryExercise item={item} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: /Trả lời câu hỏi/ }));
    expect(screen.getByText('Câu hỏi 1/3')).toBeTruthy();
    expect(screen.getByText('Chị ấy tên là gì?').getAttribute('lang')).toBe('vi');

    const choose = (name: string) => fireEvent.click(within(screen.getByRole('group', { name: 'Lựa chọn' })).getByRole('button', { name }));
    choose('Lan');
    expect(screen.getByRole('status').textContent).toMatch(/Đúng rồi/);
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp →' }));
    choose('em');
    expect(screen.getByRole('status').textContent).toMatch(/Đáp án: “chị”/);
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp →' }));
    choose('Nam');
    expect(screen.getByRole('status').textContent).toMatch(/2\/3/);
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp →' }));
    expect(onDone).toHaveBeenCalledWith({
      key: 'story:st9',
      correct: true,
      skipped: false,
      quality: 3,
      answer: 'chị',
      front: 'Gặp bạn mới — Nam gọi Lan là gì?'
    });
  });

  it('giao diện tiếng Anh: chữ giao diện tiếng Anh, câu hỏi vẫn tiếng Việt kèm bản dịch', () => {
    learnerStore.getState().setPreferences({ uiLanguage: 'en' });
    render(<StoryExercise item={item} onDone={vi.fn()} />);
    expect(screen.getByText('Meeting someone new')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Answer the questions/ }));
    expect(screen.getByText('Question 1/3')).toBeTruthy();
    expect(screen.getByText('Chị ấy tên là gì?')).toBeTruthy();
    expect(screen.getByText('What is her name?')).toBeTruthy();
  });
});
