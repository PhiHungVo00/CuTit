import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { learnerStore } from '@vietlearning/state';
import { progressStore } from '@vietlearning/state/progress';
import { LessonScreen } from './LessonScreen';
import { TestOutScreen } from './TestOutScreen';

const sfx = vi.hoisted(() => ({ playSfx: vi.fn(), haptic: vi.fn() }));
const outcome = vi.hoisted(() => ({ value: { total: 4, firstTryCorrect: 4, accuracy: 1, mistakes: [] as string[], skipped: 0, weakTones: [] as string[] } }));
vi.mock('@vietlearning/shared/audio', () => sfx);
vi.mock('@vietlearning/exercises', () => ({ prefetchPack: vi.fn(async () => undefined) }));
vi.mock('./reminders', () => ({ syncReminders: vi.fn(async () => undefined), startGoalWatch: vi.fn() }));
// phiên giả: bấm “xong” là kết thúc ngay với kết quả cho trước
vi.mock('./session/SessionRunner', () => ({
  SessionRunner: ({ onFinish }: { onFinish(o: unknown): void }) => (
    <button type="button" onClick={() => onFinish(outcome.value)}>
      xong
    </button>
  )
}));

beforeEach(() => {
  vi.useFakeTimers();
  sfx.playSfx.mockClear();
  sfx.haptic.mockClear();
  outcome.value = { total: 4, firstTryCorrect: 4, accuracy: 1, mistakes: [], skipped: 0, weakTones: [] };
  delete document.documentElement.dataset.reducedMotion;
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

describe('màn xong bài (P1-2)', () => {
  it('tiêu đề không có hai dấu “!” liền nhau', () => {
    renderLesson();
    fireEvent.click(screen.getByRole('button', { name: 'xong' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toMatch(/!”?!/);
  });

  it('XP đếm từ 0 lên đích (chữ cho trình đọc màn hình luôn là số cuối)', () => {
    renderLesson();
    fireEvent.click(screen.getByRole('button', { name: 'xong' }));
    const live = screen.getByTestId('xp-final').textContent;
    expect(live).toMatch(/^\+\d+ XP$/);
    expect(screen.getByTestId('xp-count').textContent).toBe('0');
    act(() => void vi.advanceTimersByTime(800));
    expect(`+${screen.getByTestId('xp-count').textContent} XP`).toBe(live);
  });

  it('có ≥ 1 câu đúng ngay lần đầu => hiện dòng độ chính xác', () => {
    outcome.value = { total: 4, firstTryCorrect: 2, accuracy: 0.5, mistakes: ['a', 'b'], skipped: 0, weakTones: [] };
    renderLesson();
    fireEvent.click(screen.getByRole('button', { name: 'xong' }));
    expect(screen.getByText('Đúng ngay lần đầu: 50%')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Ôn ngay' })).toBeNull();
  });

  it('0 câu đúng lần đầu => không hiện 0%, thay bằng lời mời ôn lại kèm nút tới Ôn tập', () => {
    outcome.value = { total: 4, firstTryCorrect: 0, accuracy: 0, mistakes: ['a', 'b', 'c', 'd'], skipped: 0, weakTones: [] };
    renderLesson();
    fireEvent.click(screen.getByRole('button', { name: 'xong' }));
    expect(screen.queryByText(/Đúng ngay lần đầu/)).toBeNull();
    expect(screen.getByText('Ôn lại 4 câu để nhớ lâu')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Ôn ngay' });
    expect(link.getAttribute('href')).toBe('/on-tap');
  });
});
