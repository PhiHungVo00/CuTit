import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { learnerStore } from '@vietlearning/state';
import type { AssessResponse } from '@vietlearning/contracts/api';
import SpeakExercise, { SpeakResult } from './SpeakExercise';
import { gradeAssess } from './grade';
import type { ExerciseItem } from '../types';

vi.mock('@vietlearning/native', () => ({ getDeviceSpeech: () => ({ speak: vi.fn(async () => undefined) }) }));

beforeEach(() => {
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
});
afterEach(cleanup);

const item: Extract<ExerciseItem, { kind: 'speak' }> = { kind: 'speak', key: 'speak:cs2', prompt: 'Nghe rồi đọc', text: 'Tôi tên là Lan', translation: 'My name is Lan.' };

const result: AssessResponse = {
  transcript: 'tôi tên la nam lắm',
  words: [
    { expected: 'tôi', heard: 'tôi', status: 'correct', expectedTone: 'ngang' },
    { expected: 'tên', heard: null, status: 'missing', expectedTone: 'ngang' },
    { expected: 'là', heard: 'la', status: 'tone', expectedTone: 'huyen', heardTone: 'ngang' },
    { expected: 'lan', heard: 'nam', status: 'wrong', expectedTone: 'ngang', pitch: { score: 30, bestMatch: 'sac' } },
    { expected: null, heard: 'lắm', status: 'extra' }
  ],
  score: 33,
  toneChecked: true,
  mock: false,
  hints: []
};

describe('gradeAssess', () => {
  it('ngưỡng 70; chất lượng SM-2 theo điểm; mock => bỏ qua', () => {
    expect(gradeAssess({ score: 95, mock: false })).toEqual({ correct: true, skipped: false, quality: 5, score: 95 });
    expect(gradeAssess({ score: 82, mock: false }).quality).toBe(4);
    expect(gradeAssess({ score: 70, mock: false })).toMatchObject({ correct: true, quality: 3 });
    expect(gradeAssess({ score: 69.4, mock: false })).toMatchObject({ correct: false, quality: 1 });
    expect(gradeAssess({ score: 0, mock: true })).toMatchObject({ skipped: true, correct: false });
  });
});

describe('SpeakResult', () => {
  it('tô màu từng từ với nhãn đọc màn hình, liệt kê từ thừa và thanh lệch', () => {
    render(<SpeakResult result={result} />);
    const list = screen.getByRole('list', { name: 'Kết quả từng từ' });
    const items = [...list.querySelectorAll('li')];
    expect(items.map((li) => li.dataset.status)).toEqual(['correct', 'missing', 'tone', 'wrong']);
    expect(screen.getByLabelText('là: sai thanh — cần thanh huyền, bạn nói thanh ngang')).toBeTruthy();
    expect(screen.getByLabelText('lan: chưa đúng — bạn nói “nam”')).toBeTruthy();
    expect(screen.getByText('Bạn nói thêm: lắm')).toBeTruthy();
    expect(screen.getByText('“là”: cần thanh huyền, nghe ra thanh ngang')).toBeTruthy();
  });

  it('mock: không tô màu, có ghi chú chưa chấm được chữ', () => {
    render(<SpeakResult result={{ ...result, mock: true, transcript: '', words: result.words.slice(0, 2).map((w) => ({ ...w, status: 'correct' })) }} />);
    expect(screen.getByText(/chưa nối nhận dạng giọng nói/)).toBeTruthy();
    expect([...document.querySelectorAll('li')].every((li) => li.dataset.status === 'unchecked')).toBe(true);
  });
});

describe('SpeakExercise', () => {
  it('luôn có nút “Không nói được lúc này”; lần đầu bấm micro thì hỏi đồng ý gửi giọng nói', () => {
    learnerStore.setState({ consents: {} });
    const onSkip = vi.fn();
    render(<SpeakExercise item={item} onDone={vi.fn()} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu đọc câu' }));
    expect(screen.getByRole('dialog', { name: 'Gửi giọng nói để chấm?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Để sau' }));
    expect(learnerStore.getState().consents.voice).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: /Không nói được lúc này/ }));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('micro bị từ chối => báo lỗi, vẫn bỏ qua được', async () => {
    learnerStore.setState({ consents: { voice: true } });
    vi.doMock('@vietlearning/audio-dsp', async (orig) => ({
      ...(await orig<typeof import('@vietlearning/audio-dsp')>()),
      AudioCaptureBridge: class {
        record() {
          return Promise.reject(Object.assign(new Error('denied'), { code: 'permission-denied' }));
        }
        cancel() {}
      },
      WebAudioDriver: class {}
    }));
    render(<SpeakExercise item={item} onDone={vi.fn()} onSkip={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu đọc câu' }));
    });
    expect((await screen.findByRole('alert')).textContent).toMatch(/micro/);
    expect(screen.getByRole('button', { name: /Không nói được lúc này/ })).toBeTruthy();
    vi.doUnmock('@vietlearning/audio-dsp');
  });
});
