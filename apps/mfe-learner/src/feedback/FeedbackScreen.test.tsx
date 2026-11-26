import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GatewayRequestError } from '@vietlearning/api-client';
import { learnerStore } from '@vietlearning/state';

const submitFeedback = vi.fn();
vi.mock('@vietlearning/api-client/feedback', () => ({
  submitFeedback: (...a: unknown[]) => submitFeedback(...a),
  listMyFeedback: vi.fn(),
  unreadFeedbackCount: vi.fn(async () => 0),
  markFeedbackRead: vi.fn()
}));
const prepareImage = vi.fn(async (f: File) => new Blob([f.name], { type: 'image/webp' }));
vi.mock('./prepareImage', () => ({ prepareImage: (f: File) => prepareImage(f) }));
const readVideoDurationMs = vi.fn(async (_f: File) => 24_000);
vi.mock('./videoDuration', () => ({ readVideoDurationMs: (f: File) => readVideoDurationMs(f) }));

import { FeedbackScreen } from './FeedbackScreen';
import { DRAFT_KEY } from './feedbackDraft';

const context = { appVersion: '1.4.0', build: '1004000', platform: 'android' as const, osVersion: 'Android 15', locale: 'vi' as const, route: '/bai-hoc/u1l3', recentRoutes: ['/', '/bai-hoc/u1l3'] };
const BODY = 'Bấm nút nghe giọng Nam thì không có tiếng';
const OK = { id: '11111111-1111-4111-8111-111111111111' };
const show = (props: Partial<Parameters<typeof FeedbackScreen>[0]> = {}) =>
  render(
    <MemoryRouter>
      <FeedbackScreen context={context} {...props} />
    </MemoryRouter>
  );
const type = (text: string) => fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
const pick = (testId: string, ...files: File[]) => act(async () => void fireEvent.change(screen.getByTestId(testId), { target: { files } }));
const png = (n = 'a.png') => new File(['x'], n, { type: 'image/png' });
const mp4 = () => new File(['v'], 'v.mp4', { type: 'video/mp4' });
const sendBtn = () => screen.getByRole('button', { name: /^(Gửi|Gửi lại|Send|Send again)$/ }) as HTMLButtonElement;

beforeEach(() => {
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  localStorage.clear();
  submitFeedback.mockReset();
  prepareImage.mockClear();
  readVideoDurationMs.mockReset();
  readVideoDurationMs.mockResolvedValue(24_000);
});
afterEach(() => {
  cleanup();
  learnerStore.getState().reset();
});

describe('FeedbackScreen', () => {
  it('nội dung 9 ký tự => nút Gửi vô hiệu; đủ 10 => bật', () => {
    show();
    type('123456789');
    expect(sendBtn().disabled).toBe(true);
    type(BODY);
    expect(sendBtn().disabled).toBe(false);
  });

  it('chọn ảnh thứ 4 bị chặn: sau 3 ảnh nút thêm ảnh vô hiệu', async () => {
    show();
    const add = () => screen.getByRole('button', { name: /Thêm ảnh/ }) as HTMLButtonElement;
    await pick('fb-image-input', png('1.png'), png('2.png'));
    expect(add().disabled).toBe(false);
    await pick('fb-image-input', png('3.png'), png('4.png'));
    expect(add().disabled).toBe(true);
    expect(screen.getAllByRole('button', { name: /Bỏ ảnh/ })).toHaveLength(3);
    expect(prepareImage).toHaveBeenCalledTimes(3); // ảnh thứ 4 không được xử lý
  });

  it('video 61 giây => báo video_too_long, không thêm vào, không gửi kèm', async () => {
    readVideoDurationMs.mockResolvedValue(61_000);
    submitFeedback.mockResolvedValue(OK);
    show();
    await pick('fb-video-input', mp4());
    expect(screen.getByRole('alert').textContent).toMatch(/60 giây/);
    expect(screen.queryByRole('button', { name: /Bỏ video/ })).toBeNull();
    type(BODY);
    fireEvent.click(sendBtn());
    await waitFor(() => expect(submitFeedback.mock.calls[0]?.[1]).toEqual([]));
  });

  it('video hợp lệ hiện thời lượng và tắt nút thêm video (tối đa 1)', async () => {
    show();
    await pick('fb-video-input', mp4());
    expect(screen.getByText(/0:24/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Thêm video/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('video > 50 MB bị từ chối trước khi gửi', async () => {
    show();
    const big = mp4();
    Object.defineProperty(big, 'size', { value: 50 * 2 ** 20 + 1 });
    await pick('fb-video-input', big);
    expect(screen.getByRole('alert').textContent).toMatch(/50 MB/);
    expect(readVideoDurationMs).not.toHaveBeenCalled();
  });

  it('lỗi mạng: chữ + tệp còn nguyên, hiện "Gửi lại", nháp nằm trong localStorage', async () => {
    submitFeedback.mockRejectedValueOnce(new GatewayRequestError('offline', 'x'));
    show();
    type(BODY);
    await pick('fb-image-input', png());
    fireEvent.click(sendBtn());
    await screen.findByRole('alert');
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(BODY);
    expect(screen.getAllByRole('button', { name: /Bỏ ảnh/ })).toHaveLength(1);
    expect(sendBtn().textContent).toBe('Gửi lại');
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).body).toBe(BODY);

    submitFeedback.mockResolvedValueOnce(OK);
    fireEvent.click(sendBtn());
    await screen.findByText('Cảm ơn bạn! Mình sẽ xem sớm.');
    expect(submitFeedback).toHaveBeenCalledTimes(2);
    // lần gửi lại mang đúng tệp đã chọn
    expect((submitFeedback.mock.calls[1][1] as Blob[]).length).toBe(1);
  });

  it('gửi xong: xóa nháp, Cu Tít khen + lời cảm ơn', async () => {
    submitFeedback.mockResolvedValueOnce(OK);
    const { container } = show();
    type(BODY);
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
    fireEvent.click(sendBtn());
    await screen.findByText('Cảm ơn bạn! Mình sẽ xem sớm.');
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(container.querySelector('img[src*="cutit-khen"]')).not.toBeNull();
    expect(submitFeedback.mock.calls[0][0]).toMatchObject({ kind: 'bug', body: BODY, context: { appVersion: '1.4.0', route: '/bai-hoc/u1l3' } });
  });

  it('bản nháp cũ được nạp lại khi mở màn', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ kind: 'idea', body: 'Thêm chế độ tối nhé bạn' }));
    show();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Thêm chế độ tối nhé bạn');
    expect((screen.getByRole('radio', { name: /Góp ý/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('mở từ màn lỗi: loại "Báo lỗi" + gửi kèm tên lỗi', async () => {
    submitFeedback.mockResolvedValueOnce(OK);
    show({ initialKind: 'bug', error: { name: 'TypeError', firstFrame: 'at Foo (/assets/x.js:1:2)' } });
    expect((screen.getByRole('radio', { name: /Báo lỗi/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/TypeError/)).toBeTruthy();
    type(BODY);
    fireEvent.click(sendBtn());
    await waitFor(() => expect(submitFeedback.mock.calls[0][0].context.error).toEqual({ name: 'TypeError', firstFrame: 'at Foo (/assets/x.js:1:2)' }));
  });

  it('hiện dòng "Gửi kèm: …" đúng phiên bản và route', () => {
    show();
    const line = screen.getByText(/^Gửi kèm:/).textContent!;
    expect(line).toContain('1.4.0');
    expect(line).toContain('/bai-hoc/u1l3');
    expect(line).toContain('Android 15');
  });

  it('có thông báo quyền riêng tư đúng spec §5.8 (vi và en) và ghi chú video', () => {
    show();
    expect(screen.getByText(/Chủ app sẽ xem nội dung, ảnh và video bạn gửi để sửa lỗi\. Ảnh xóa sau 180 ngày, video sau 90 ngày kể từ khi xử lý xong \(chậm nhất 1 năm sau khi gửi\)\./)).toBeTruthy();
    expect(screen.getByText(/Video có thể chứa thông tin trên màn hình của bạn/)).toBeTruthy();
    cleanup();
    learnerStore.getState().setPreferences({ uiLanguage: 'en' });
    show();
    expect(screen.getByText(/The app owner will read the text, photos and videos you send to fix problems\. Photos are deleted 180 days, videos 90 days after the report is handled \(at most 1 year after sending\)\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Send$/ })).toBeTruthy();
  });

  it('mã lỗi Gateway → câu dễ hiểu (feedback_limit, storage_full)', async () => {
    submitFeedback.mockRejectedValueOnce(new GatewayRequestError('quota', 'x', 429, 'feedback_limit'));
    show();
    type(BODY);
    fireEvent.click(sendBtn());
    expect((await screen.findByRole('alert')).textContent).toMatch(/5 góp ý/);
    submitFeedback.mockRejectedValueOnce(new GatewayRequestError('server', 'x', 507, 'storage_full'));
    fireEvent.click(sendBtn());
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/chỉ chữ|bỏ ảnh/i));
  });

  it('có liên kết sang "Góp ý của tôi"', () => {
    show();
    expect(screen.getByRole('link', { name: /Góp ý của tôi/ }).getAttribute('href')).toBe('/gop-y/cua-toi');
  });
});
