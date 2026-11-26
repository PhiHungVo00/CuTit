import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GatewayRequestError } from '@vietlearning/api-client';
import { learnerStore } from '@vietlearning/state';

const listMyFeedback = vi.fn();
const markFeedbackRead = vi.fn(async (_id: string) => undefined);
const unreadFeedbackCount = vi.fn(async () => 0);
vi.mock('@vietlearning/api-client/feedback', () => ({
  submitFeedback: vi.fn(),
  listMyFeedback: (...a: unknown[]) => listMyFeedback(...a),
  markFeedbackRead: (id: string) => markFeedbackRead(id),
  unreadFeedbackCount: () => unreadFeedbackCount()
}));

import { MyFeedback } from './MyFeedback';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const items = [
  {
    id: A,
    kind: 'bug',
    body: 'Bấm nút nghe giọng Nam thì không có tiếng ở bài 3',
    status: 'in_progress',
    createdAt: '2026-11-21T14:02:00.000Z',
    unread: true,
    files: [{ media: 'image', purged: false }],
    events: [{ at: '2026-11-21T14:20:00.000Z', status: 'in_progress', message: 'Cảm ơn bạn, mình đã thấy lỗi, bản sau sẽ sửa.' }]
  },
  { id: B, kind: 'idea', body: 'Thêm chế độ tối cho ứng dụng', status: 'done', createdAt: '2026-11-18T10:00:00.000Z', unread: false, files: [], events: [{ at: '2026-11-19T10:00:00.000Z', status: 'done', message: 'Đã có trong bản 1.3!' }] }
];
const show = () =>
  render(
    <MemoryRouter>
      <MyFeedback />
    </MemoryRouter>
  );

beforeEach(() => {
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
  listMyFeedback.mockReset();
  markFeedbackRead.mockClear();
  unreadFeedbackCount.mockClear();
});
afterEach(() => {
  cleanup();
  learnerStore.getState().reset();
});

describe('MyFeedback', () => {
  it('liệt kê loại, dòng đầu, nhãn trạng thái; có chấm cho mục chưa đọc', async () => {
    listMyFeedback.mockResolvedValue({ items });
    show();
    await screen.findByText(/Bấm nút nghe giọng Nam/);
    expect(screen.getByText('Đang xử lý')).toBeTruthy();
    expect(screen.getByText('Đã xong')).toBeTruthy();
    expect(screen.getAllByText('Chưa đọc')).toHaveLength(1);
  });

  it('bấm vào một mục: hiện dòng thời gian lời nhắn và đánh dấu đã đọc (chỉ mục chưa đọc)', async () => {
    listMyFeedback.mockResolvedValue({ items });
    show();
    fireEvent.click(await screen.findByRole('button', { name: /Bấm nút nghe giọng Nam/ }));
    expect(screen.getByText(/mình đã thấy lỗi/)).toBeTruthy();
    await waitFor(() => expect(markFeedbackRead).toHaveBeenCalledWith(A));
    fireEvent.click(screen.getByRole('button', { name: /Thêm chế độ tối/ }));
    expect(screen.getByText('Đã có trong bản 1.3!')).toBeTruthy();
    expect(markFeedbackRead).toHaveBeenCalledTimes(1);
  });

  it('danh sách rỗng: lời mời gửi góp ý', async () => {
    listMyFeedback.mockResolvedValue({ items: [] });
    show();
    expect(await screen.findByText(/chưa gửi góp ý nào/i)).toBeTruthy();
  });

  it('lỗi mạng: báo + nút Thử lại gọi lại', async () => {
    listMyFeedback.mockRejectedValueOnce(new GatewayRequestError('offline', 'x'));
    show();
    expect(await screen.findByRole('alert')).toBeTruthy();
    listMyFeedback.mockResolvedValueOnce({ items: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByText(/chưa gửi góp ý nào/i);
    expect(listMyFeedback).toHaveBeenCalledTimes(2);
  });

  it('en: nhãn trạng thái tiếng Anh', async () => {
    learnerStore.getState().setPreferences({ uiLanguage: 'en' });
    listMyFeedback.mockResolvedValue({ items });
    show();
    await screen.findByText(/Bấm nút nghe giọng Nam/);
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
  });
});
