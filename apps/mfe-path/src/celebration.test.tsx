import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { learnerStore } from '@vietlearning/state';
import { progressStore } from '@vietlearning/state/progress';
import { LessonScreen } from './LessonScreen';
import { TestOutScreen } from './TestOutScreen';

const sfx = vi.hoisted(() => ({ playSfx: vi.fn(), haptic: vi.fn() }));
vi.mock('@vietlearning/shared/audio', () => sfx);
vi.mock('@vietlearning/exercises', () => ({ prefetchPack: vi.fn(async () => undefined) }));
vi.mock('./reminders', () => ({ syncReminders: vi.fn(async () => undefined), startGoalWatch: vi.fn() }));
// phiên giả: bấm “xong” là kết thúc ngay với kết quả cho trước
vi.mock('./session/SessionRunner', () => ({
  SessionRunner: ({ onFinish }: { onFinish(o: unknown): void }) => (
    <button type="button" onClick={() => onFinish({ total: 4, firstTryCorrect: 4, accuracy: 1, mistakes: [], skipped: 0, weakTones: [] })}>
      xong
    </button>
  )
}));

beforeEach(() => {
  vi.useFakeTimers();
  sfx.playSfx.mockClear();
  sfx.haptic.mockClear();
  learnerStore.getState().reset();
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
  progressStore.getState().resetProgress();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const renderLesson = () =>
  render(
    <MemoryRouter initialEntries={['/bai-hoc/u1l1']}>
      <Routes>
        <Route path="/bai-hoc/:lessonId" element={<LessonScreen />} />
      </Routes>
    </MemoryRouter>
  );

describe('ăn mừng cuối bài', () => {
  it('xong bài => âm hoàn thành + rung + Cu Tít ăn mừng; ngày đầu lên chuỗi => thêm âm chuỗi ngày', () => {
    renderLesson();
    fireEvent.click(screen.getByRole('button', { name: 'xong' }));
    expect(sfx.playSfx).toHaveBeenCalledWith('hoan-thanh');
    expect(sfx.haptic).toHaveBeenCalledWith('thanh-cong');
    expect(screen.getByRole('status').querySelector('img')?.getAttribute('alt')).toMatch(/ăn mừng/);
    act(() => void vi.advanceTimersByTime(1500));
    expect(sfx.playSfx).toHaveBeenCalledWith('chuoi-ngay');
  });

  it('bài thứ hai cùng ngày không lên chuỗi => không có âm chuỗi ngày', () => {
    progressStore.getState().completeLesson('u1l1', { total: 4, firstTryCorrect: 4 });
    renderLesson();
    fireEvent.click(screen.getByRole('button', { name: 'xong' }));
    act(() => void vi.advanceTimersByTime(1500));
    expect(sfx.playSfx).toHaveBeenCalledWith('hoan-thanh');
    expect(sfx.playSfx).not.toHaveBeenCalledWith('chuoi-ngay');
  });

  it('kiểm tra vượt unit: đạt => hoàn thành + ăn mừng; chưa đạt => động viên', () => {
    render(
      <MemoryRouter initialEntries={['/kiem-tra/u1']}>
        <Routes>
          <Route path="/kiem-tra/:unitId" element={<TestOutScreen />} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /Bắt đầu|Làm bài/ }));
    fireEvent.click(screen.getByRole('button', { name: 'xong' }));
    expect(sfx.playSfx).toHaveBeenCalledWith('hoan-thanh');
    expect(screen.getByRole('status').querySelector('img')?.getAttribute('alt')).toMatch(/ăn mừng/);
  });
});
