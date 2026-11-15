// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioCaptureBridge } from '@vietlearning/audio-dsp';

const request = vi.fn();
vi.mock('@vietlearning/api-client', () => ({ request: (...a: unknown[]) => request(...a) }));

import { useVoiceInput } from './useVoiceInput';

function fakeBridge(opts: { fail?: string } = {}) {
  const b = {
    cancel: vi.fn(),
    record: vi.fn(async () => {
      if (opts.fail) throw Object.assign(new Error(opts.fail), { code: opts.fail });
    }),
    finish: vi.fn(async () => ({ pcm: new Float32Array(16000), sampleRate: 16000, durationMs: 1000 }))
  };
  return b as unknown as AudioCaptureBridge & typeof b;
}

afterEach(() => {
  request.mockReset();
  vi.useRealTimers();
});

describe('nhập bằng giọng nói', () => {
  it('ghi âm → gửi WAV multipart → trả chữ cho ô nhập (không tự gửi)', async () => {
    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
    request.mockResolvedValue({ text: ' Chào cô ', confidence: 0.9, words: [], mock: false });
    const bridge = fakeBridge();
    const onText = vi.fn();
    const { result } = renderHook(() => useVoiceInput(onText, async () => bridge));

    await act(() => result.current.start());
    expect(result.current.status).toBe('recording');
    vi.advanceTimersByTime(1200);
    await act(() => result.current.stop());

    expect(onText).toHaveBeenCalledWith({ text: 'Chào cô', mock: false });
    const [path, opts] = request.mock.calls[0];
    expect(path).toBe('/v1/speech/transcribe');
    const file = (opts.body as FormData).get('audio') as Blob;
    expect(file.type).toBe('audio/wav');
    expect(file.size).toBe(44 + 16000 * 2);
    expect(result.current.status).toBe('idle');
  });

  it('bấm dừng quá sớm => báo "too-short", không gửi', async () => {
    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
    const bridge = fakeBridge();
    const { result } = renderHook(() => useVoiceInput(vi.fn(), async () => bridge));
    await act(() => result.current.start());
    vi.advanceTimersByTime(100);
    await act(() => result.current.stop());
    expect(result.current.error).toBe('too-short');
    expect(bridge.cancel).toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('tự dừng sau 15 giây', async () => {
    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
    request.mockResolvedValue({ text: 'xin chào', confidence: 1, words: [], mock: true });
    const onText = vi.fn();
    const { result } = renderHook(() => useVoiceInput(onText, async () => fakeBridge()));
    await act(() => result.current.start());
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    await vi.waitFor(() => expect(onText).toHaveBeenCalledWith({ text: 'xin chào', mock: true }));
  });

  it('từ chối quyền micro / không nghe được lời / mất mạng => lỗi tương ứng', async () => {
    const denied = renderHook(() => useVoiceInput(vi.fn(), async () => fakeBridge({ fail: 'permission-denied' })));
    await act(() => denied.result.current.start());
    expect(denied.result.current.error).toBe('permission-denied');
    expect(denied.result.current.status).toBe('idle');

    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
    request.mockResolvedValueOnce({ text: '  ', confidence: 0, words: [], mock: false });
    const silent = renderHook(() => useVoiceInput(vi.fn(), async () => fakeBridge()));
    await act(() => silent.result.current.start());
    vi.advanceTimersByTime(1000);
    await act(() => silent.result.current.stop());
    expect(silent.result.current.error).toBe('no-speech');

    request.mockRejectedValueOnce(Object.assign(new Error('x'), { kind: 'offline' }));
    const off = renderHook(() => useVoiceInput(vi.fn(), async () => fakeBridge()));
    await act(() => off.result.current.start());
    vi.advanceTimersByTime(1000);
    await act(() => off.result.current.stop());
    expect(off.result.current.error).toBe('network');
  });
});
