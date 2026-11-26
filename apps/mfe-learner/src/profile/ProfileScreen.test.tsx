import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { dayKey, learnerStore } from '@vietlearning/state';
import { progressStore } from '@vietlearning/state/progress';
import { ProfileScreen } from './ProfileScreen';

const unreadFeedbackCount = vi.fn(async () => 0);
vi.mock('@vietlearning/api-client/feedback', () => ({
  unreadFeedbackCount: () => unreadFeedbackCount(),
  listMyFeedback: vi.fn(),
  markFeedbackRead: vi.fn(),
  submitFeedback: vi.fn()
}));

const lang = (uiLanguage: 'vi' | 'en') => learnerStore.getState().setPreferences({ uiLanguage });
const show = () =>
  render(
    <MemoryRouter>
      <ProfileScreen />
    </MemoryRouter>
  );

beforeEach(() => {
  lang('vi');
  unreadFeedbackCount.mockReset();
  unreadFeedbackCount.mockResolvedValue(0);
});
afterEach(() => {
  cleanup();
  learnerStore.getState().reset();
  progressStore.getState().resetProgress();
});

describe('ProfileScreen (phương án B)', () => {
  it('hiện 4 số liệu: chuỗi ngày, phút học, từ đã thuộc, huy hiệu', () => {
    const today = dayKey(new Date());
    learnerStore.setState({
      activity: { [today]: 600 },
      srs: {
        a: { itemRef: 'a', front: 'a', back: 'a', source: 'dialect', ease: 250, intervalDays: 30, repetitions: 5, dueAt: new Date().toISOString() },
        b: { itemRef: 'b', front: 'b', back: 'b', source: 'dialect', ease: 250, intervalDays: 0, repetitions: 0, dueAt: new Date().toISOString() }
      }
    });
    progressStore.setState({ badges: { x: { at: '2026-11-01T00:00:00.000Z', seen: true } } });
    show();
    const stats = screen.getByRole('list', { name: 'Số liệu của bạn' });
    expect(within(stats).getAllByRole('listitem')).toHaveLength(4);
    const value = (label: string) => within(stats).getByText(label).parentElement?.textContent ?? '';
    expect(value('Chuỗi ngày')).toContain('1 ngày');
    expect(value('Phút học')).toContain('10 phút');
    expect(value('Từ đã thuộc')).toContain('1');
    expect(value('Huy hiệu')).toContain('1');
  });

  it('mục cuối của danh sách là Cài đặt, trỏ tới /cai-dat (vi và en)', () => {
    show();
    let links = screen.getAllByRole('link');
    expect(links[links.length - 1].textContent).toContain('Cài đặt');
    expect(links[links.length - 1].getAttribute('href')).toBe('/cai-dat');
    cleanup();
    lang('en');
    show();
    links = screen.getAllByRole('link');
    expect(links[links.length - 1].textContent).toContain('Settings');
  });

  it('có lối vào Bạn bè và Tiến độ', () => {
    show();
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/ban-be');
    expect(hrefs).toContain('/tien-do');
  });

  it('có dòng "Góp ý / Báo lỗi" trỏ tới /gop-y (vi và en)', () => {
    show();
    const link = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/gop-y')!;
    expect(link.textContent).toContain('Góp ý / Báo lỗi');
    cleanup();
    lang('en');
    show();
    expect(screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/gop-y')!.textContent).toContain('Feedback / Report a bug');
  });

  it('có góp ý chưa đọc => chấm đỏ ở dòng Góp ý (có chữ cho trình đọc màn hình); không có => không chấm', async () => {
    unreadFeedbackCount.mockResolvedValue(2);
    show();
    expect(await screen.findByText('Có tin mới')).toBeTruthy();
    cleanup();
    unreadFeedbackCount.mockResolvedValue(0);
    show();
    await waitFor(() => expect(unreadFeedbackCount).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Có tin mới')).toBeNull();
  });
});

describe('Dòng Tin nhắn (Dự án 4)', () => {
  it('ẩn khi Host chưa bật; bật thì có dòng dẫn tới /tin-nhan và chấm đỏ khi có tin chưa đọc', async () => {
    show();
    expect(screen.queryByText('Tin nhắn')).toBeNull();
    cleanup();
    render(
      <MemoryRouter>
        <ProfileScreen messagesEnabled />
      </MemoryRouter>
    );
    const row = screen.getByText('Tin nhắn').closest('a')!;
    expect(row.getAttribute('href')).toBe('/tin-nhan');
    expect(screen.queryByText('Có tin nhắn chưa đọc')).toBeNull();
    window.dispatchEvent(new CustomEvent('becutit:chat-unread', { detail: 3 }));
    await waitFor(() => expect(screen.getByText('Có tin nhắn chưa đọc')).toBeTruthy());
    window.dispatchEvent(new CustomEvent('becutit:chat-unread', { detail: 0 }));
    await waitFor(() => expect(screen.queryByText('Có tin nhắn chưa đọc')).toBeNull());
  });
});
