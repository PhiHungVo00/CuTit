// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const openPreview = vi.fn();
vi.mock('@vietlearning/native', () => ({
  openPreview: (...a: unknown[]) => openPreview(...a),
  CameraError: class CameraError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
}));

import { CameraError } from '@vietlearning/native';
import { VideoCallView } from './VideoCallView';

afterEach(() => {
  cleanup();
  openPreview.mockReset();
});

describe('VideoCallView', () => {
  it('mở camera trước (user) vào thẻ video, báo sẵn sàng với phần tử video', async () => {
    const stop = vi.fn();
    openPreview.mockResolvedValue(stop);
    const onVideo = vi.fn();
    const { unmount } = render(<VideoCallView onVideo={onVideo} onCameraOff={vi.fn()} />);
    await act(async () => undefined);
    expect(openPreview).toHaveBeenCalledTimes(1);
    expect(openPreview.mock.calls[0][1]).toBe('user');
    expect(onVideo).toHaveBeenCalledWith(expect.any(HTMLVideoElement));
    unmount();
    expect(stop).toHaveBeenCalled(); // tắt đèn camera khi rời màn
  });

  it('quyền bị từ chối ⇒ onCameraOff("permission-denied"), không ném lỗi', async () => {
    openPreview.mockRejectedValue(new CameraError('permission-denied'));
    const onCameraOff = vi.fn();
    render(<VideoCallView onVideo={vi.fn()} onCameraOff={onCameraOff} />);
    await act(async () => undefined);
    expect(onCameraOff).toHaveBeenCalledWith('permission-denied');
  });

  it('lỗi khác ⇒ onCameraOff("failed")', async () => {
    openPreview.mockRejectedValue(new Error('boom'));
    const onCameraOff = vi.fn();
    render(<VideoCallView onVideo={vi.fn()} onCameraOff={onCameraOff} />);
    await act(async () => undefined);
    expect(onCameraOff).toHaveBeenCalledWith('failed');
  });

  it('người dùng bấm tắt camera ⇒ đóng stream và báo "user"', async () => {
    const stop = vi.fn();
    openPreview.mockResolvedValue(stop);
    const onCameraOff = vi.fn();
    render(<VideoCallView onVideo={vi.fn()} onCameraOff={onCameraOff} />);
    await act(async () => undefined);
    await act(async () => screen.getByRole('button').click());
    expect(stop).toHaveBeenCalled();
    expect(onCameraOff).toHaveBeenCalledWith('user');
  });

  it('nút tắt có nhãn theo ngôn ngữ (không rỗng)', async () => {
    openPreview.mockResolvedValue(vi.fn());
    render(<VideoCallView onVideo={vi.fn()} onCameraOff={vi.fn()} />);
    await act(async () => undefined);
    expect(screen.getByRole('button').getAttribute('aria-label') || screen.getByRole('button').textContent).toBeTruthy();
  });
});
