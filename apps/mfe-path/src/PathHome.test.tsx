import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { learnerStore } from '@vietlearning/state';
import { progressStore } from '@vietlearning/state/progress';
import { PathHome } from './PathHome';

vi.mock('@vietlearning/shared/audio', () => ({ playSfx: vi.fn(), haptic: vi.fn() }));
vi.mock('./reminders', () => ({ syncReminders: vi.fn(async () => undefined), startGoalWatch: vi.fn() }));

const show = () =>
  render(
    <MemoryRouter>
      <PathHome />
    </MemoryRouter>
  );

beforeEach(() => {
  learnerStore.getState().reset();
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
  progressStore.getState().resetProgress();
});
afterEach(cleanup);

describe('Trang Học (P1-1)', () => {
  it('không còn nút đổi ngôn ngữ (đã có ở Cài đặt)', () => {
    show();
    expect(screen.queryByRole('button', { name: /English|Switch the app/ })).toBeNull();
  });

  it('chuỗi/XP/đóng băng gọn trong một hàng chip nhỏ, vẫn đọc được bằng nhãn', () => {
    show();
    expect(screen.getByTestId('streak').textContent).toBe('🔥 0');
    expect(screen.getByTestId('xp').textContent).toBe('⭐ 0');
    const chips = screen.getByRole('list', { name: 'Chuỗi ngày, điểm và đóng băng' });
    expect(chips.querySelectorAll('li').length).toBe(3);
    expect(screen.getByLabelText('Tổng điểm kinh nghiệm')).toBeTruthy();
  });

  it('nút chính vẫn là “Bắt đầu bài đầu tiên” và nằm trước các thẻ phụ', () => {
    show();
    const cta = screen.getByRole('link', { name: /Bắt đầu bài đầu tiên/ });
    const review = screen.getByRole('link', { name: /Ôn hôm nay/ });
    expect(cta.compareDocumentPosition(review) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
