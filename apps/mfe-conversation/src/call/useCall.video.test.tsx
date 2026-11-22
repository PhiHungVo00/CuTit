// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const grabFrame = vi.fn();
const send = vi.fn();
const deviceSpeak = vi.fn(async (..._a: unknown[]) => undefined);
let voiceStatus = 'idle';
let onHeard: (t: { text: string; mock: boolean }) => void = () => undefined;

vi.mock('@vietlearning/native', () => ({
  getDeviceSpeech: () => ({ speak: deviceSpeak, stop: vi.fn(async () => undefined) }),
  grabFrame: (...a: unknown[]) => grabFrame(...a)
}));
vi.mock('@vietlearning/state', () => ({
  learnerStore: { getState: () => ({ preferences: { voiceId: 'v', dialect: 'north' } }) },
  speechRate: (b: number) => b
}));
vi.mock('@vietlearning/api-client', () => ({ request: vi.fn(async () => ({ turns: { limit: 10, used: 3 } })) }));
vi.mock('../chat/useChatSession', () => ({ useChatSession: () => ({ send, retry: vi.fn(), cancel: vi.fn(), error: null, errorCode: null, messages: [] }) }));
vi.mock('../chat/useVoiceInput', () => ({
  useVoiceInput: (cb: typeof onHeard) => {
    onHeard = cb;
    return { status: voiceStatus, start: vi.fn(async () => undefined), cancel: vi.fn(), error: null, level: 0 };
  }
}));

import { useCall } from './useCall';

const video = document.createElement('video');

beforeEach(() => {
  grabFrame.mockReset().mockResolvedValue({ base64: 'IMG', previewUrl: 'data:x' });
  send.mockReset();
  deviceSpeak.mockClear();
  voiceStatus = 'idle';
});

async function startVideo(opts = { video: true }) {
  const hook = renderHook(() => useCall(undefined, opts));
  await act(async () => hook.result.current.dispatch({ type: 'START', video: opts.video }));
  act(() => hook.result.current.setVideoElement(video));
  return hook;
}
const setStatus = (hook: Awaited<ReturnType<typeof startVideo>>, s: string) => {
  voiceStatus = s;
  hook.rerender();
};

describe('useCall — gọi video theo lượt', () => {
  it('ngừng nói (recording → transcribing) ⇒ grabFrame đúng 1 lần, gửi kèm imageBase64', async () => {
    const hook = await startVideo();
    setStatus(hook, 'recording');
    expect(grabFrame).not.toHaveBeenCalled();
    setStatus(hook, 'transcribing');
    setStatus(hook, 'transcribing');
    await act(async () => undefined);
    expect(grabFrame).toHaveBeenCalledTimes(1);
    await act(async () => onHeard({ text: 'Xin chào', mock: false }));
    await act(async () => undefined);
    expect(send).toHaveBeenCalledWith('Xin chào', { image: { base64: 'IMG', previewUrl: 'data:x' } });
  });

  it('gõ thay nói trong gọi video (không qua micro) ⇒ vẫn chụp 1 khung lúc gửi và kèm ảnh', async () => {
    const hook = await startVideo();
    await act(async () => onHeard({ text: 'Xin chào', mock: false }));
    await act(async () => undefined);
    expect(grabFrame).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('Xin chào', { image: { base64: 'IMG', previewUrl: 'data:x' } });
    void hook;
  });

  it('gọi thường: không bao giờ grabFrame, gửi không kèm ảnh', async () => {
    const hook = await startVideo({ video: false });
    setStatus(hook, 'recording');
    setStatus(hook, 'transcribing');
    await act(async () => onHeard({ text: 'Chào', mock: false }));
    await act(async () => undefined);
    expect(grabFrame).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('Chào', undefined);
  });

  it('chụp khung hình lỗi ⇒ vẫn gửi lượt (không ảnh), cuộc gọi không treo', async () => {
    grabFrame.mockRejectedValue(new Error('not ready'));
    const hook = await startVideo();
    setStatus(hook, 'recording');
    setStatus(hook, 'transcribing');
    await act(async () => onHeard({ text: 'Chào', mock: false }));
    await act(async () => undefined);
    expect(send).toHaveBeenCalledWith('Chào', undefined);
  });

  it('quyền camera bị từ chối giữa cuộc gọi ⇒ gọi thường, lượt tiếp theo không chụp', async () => {
    const hook = await startVideo();
    act(() => hook.result.current.onCameraOff('permission-denied'));
    expect(hook.result.current.state.video).toBe(false);
    expect(hook.result.current.state.phase).toBe('listening');
    setStatus(hook, 'recording');
    setStatus(hook, 'transcribing');
    await act(async () => undefined);
    expect(grabFrame).not.toHaveBeenCalled();
  });

  it('chờ > 1 200 ms ở thinking ⇒ "ừm" một lần qua giọng máy', async () => {
    vi.useFakeTimers();
    try {
      const hook = await startVideo({ video: false });
      await act(async () => onHeard({ text: 'Chào', mock: false }));
      expect(hook.result.current.state.phase).toBe('thinking');
      await act(async () => vi.advanceTimersByTime(1300));
      expect(deviceSpeak).toHaveBeenCalledTimes(1);
      expect(deviceSpeak.mock.calls[0][0]).toBe('ừm');
    } finally {
      vi.useRealTimers();
    }
  });
});
