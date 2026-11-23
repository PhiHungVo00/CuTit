// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { learnerStore } from '@vietlearning/state';

vi.mock('./PathHomeRoute', () => ({ default: () => <p>lộ trình</p> }));
vi.mock('./HomeLookup', () => ({ default: () => null }));

import { Home } from './Home';

beforeEach(() => {
  learnerStore.getState().reset();
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
});
afterEach(cleanup);

const show = () =>
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  );

describe('Trang Học: tiêu đề (P1-1)', () => {
  it('h1 “Chào bạn!” có ngay (chữ thường trực, không đợi chunk lộ trình) và không có nút đổi ngôn ngữ', () => {
    show();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Chào bạn!');
    expect(screen.queryByRole('button', { name: /English|Switch the app/ })).toBeNull();
  });

  it('Cu Tít chào 64px bên trái tiêu đề (nạp lười)', async () => {
    const { container } = show();
    await vi.waitFor(() => expect(container.querySelector('img')).toBeTruthy());
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toContain('cutit-chao');
    expect(img.getAttribute('width')).toBe('64');
  });

  it('đã làm quen => dòng phụ có trình độ; en có đủ chữ', () => {
    learnerStore.setState((s) => ({ profile: { ...s.profile, onboarded: true, level: 2 as never } }));
    show();
    expect(screen.getByText(/Trình độ .* · Mỗi ngày một bài ngắn/)).toBeTruthy();
    cleanup();
    learnerStore.getState().setPreferences({ uiLanguage: 'en' });
    show();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hi there!');
  });
});
