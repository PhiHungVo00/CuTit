import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { dayKey, learnerStore } from '@vietlearning/state';
import { ProgressScreen } from './ProgressScreen';

const lang = (uiLanguage: 'vi' | 'en') => learnerStore.getState().setPreferences({ uiLanguage });
const show = () =>
  render(
    <MemoryRouter>
      <ProgressScreen />
    </MemoryRouter>
  );
const card = (n: string) => ({ itemRef: n, front: n, back: n, source: 'dialect' as const, ease: 250, intervalDays: 0, repetitions: 0, dueAt: new Date(Date.now() - 1000).toISOString() });

beforeEach(() => lang('vi'));
afterEach(() => {
  cleanup();
  learnerStore.getState().reset();
});

describe('ProgressScreen (M9, mở từ tab Hồ sơ)', () => {
  it('có thẻ SM-2 đến hạn thì có nút ôn và bấm vào bắt đầu phiên ôn (vi)', () => {
    learnerStore.setState({ srs: { a: card('a'), b: card('b') } });
    show();
    fireEvent.click(screen.getByRole('button', { name: /Ôn 2 thẻ/ }));
    expect(screen.queryByRole('button', { name: /Ôn 2 thẻ/ })).toBeNull();
  });

  it('chưa có thẻ: nhắc luyện tập; link Cài đặt trỏ /cai-dat; không còn panel bạn bè (en)', () => {
    lang('en');
    show();
    expect(screen.getByRole('link', { name: /Settings/ }).getAttribute('href')).toBe('/cai-dat');
    expect(screen.getByRole('heading', { name: /Minutes studied/ })).toBeTruthy();
    expect(screen.queryByText(/Open study buddies/)).toBeNull();
  });

  it('tuần này chưa học phút nào => Cu Tít + lời mời thay cho biểu đồ trống; có phút học thì vẽ biểu đồ', () => {
    const { container } = show();
    expect(screen.getByRole('heading', { name: 'Chưa có phút học nào' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Học ngay' }).getAttribute('href')).toBe('/');
    expect(container.querySelectorAll('img[src*="cutit-chao"]').length).toBeGreaterThan(0);
    cleanup();
    learnerStore.setState({ activity: { [dayKey(new Date())]: 720 } });
    show();
    expect(screen.queryByRole('heading', { name: 'Chưa có phút học nào' })).toBeNull();
  });
});
