// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { learnerStore } from '@vietlearning/state';
import FeedbackDot, { FEEDBACK_UNREAD_EVENT } from './FeedbackDot';

const unreadFeedbackCount = vi.fn(async () => 0);
vi.mock('@vietlearning/api-client/feedback', () => ({ unreadFeedbackCount: () => unreadFeedbackCount() }));

/** Thanh tab giả: đúng cấu trúc mà TabBar vẽ (link /ho-so có .tab-icon) */
const show = () =>
  render(
    <MemoryRouter>
      <nav className="tabbar">
        <a href="/ho-so">
          <span className="tab-icon" data-testid="icon" />
          <span>Hồ sơ</span>
        </a>
      </nav>
      <FeedbackDot />
    </MemoryRouter>
  );
const dot = () => screen.getByTestId('icon').querySelector('[aria-hidden="true"]');

beforeEach(() => {
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
  unreadFeedbackCount.mockReset();
  unreadFeedbackCount.mockResolvedValue(0);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FeedbackDot (chấm đỏ tab Hồ sơ)', () => {
  it('Gateway báo có chưa đọc => chấm + chữ cho trình đọc màn hình, nằm trong tab Hồ sơ', async () => {
    unreadFeedbackCount.mockResolvedValue(2);
    show();
    await waitFor(() => expect(dot()).not.toBeNull());
    expect(screen.getByRole('link', { name: /Có tin mới/ }).getAttribute('href')).toBe('/ho-so');
  });

  it('0 chưa đọc => không có chấm; sự kiện từ mfe-learner bật/tắt chấm', async () => {
    show();
    await waitFor(() => expect(unreadFeedbackCount).toHaveBeenCalledTimes(1));
    expect(dot()).toBeNull();
    act(() => void window.dispatchEvent(new CustomEvent(FEEDBACK_UNREAD_EVENT, { detail: 1 })));
    await waitFor(() => expect(dot()).not.toBeNull());
    act(() => void window.dispatchEvent(new CustomEvent(FEEDBACK_UNREAD_EVENT, { detail: 0 })));
    await waitFor(() => expect(dot()).toBeNull());
  });

  it('en: chữ tiếng Anh', async () => {
    learnerStore.getState().setPreferences({ uiLanguage: 'en' });
    unreadFeedbackCount.mockResolvedValue(1);
    show();
    expect(await screen.findByText('New reply')).toBeTruthy();
  });

  it('offline => không gọi Gateway; lỗi mạng => không chấm, không ném', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    show();
    await new Promise((r) => setTimeout(r, 10));
    expect(unreadFeedbackCount).not.toHaveBeenCalled();
    cleanup();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    unreadFeedbackCount.mockRejectedValue(new Error('x'));
    show();
    await waitFor(() => expect(unreadFeedbackCount).toHaveBeenCalled());
    expect(dot()).toBeNull();
  });
});
