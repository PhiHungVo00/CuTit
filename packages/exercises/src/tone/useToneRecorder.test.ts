import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { CaptureError, type AudioCaptureBridge } from '@vietlearning/audio-dsp';

const analyzer = vi.hoisted(() => ({ result: null as unknown }));
vi.mock('./toneAnalyzer', () => ({
  analyzeInWorker: vi.fn(async () => analyzer.result),
  disposeAnalyzer: vi.fn()
}));

const { useToneRecorder } = await import('./useToneRecorder');

function fakeBridge(opts: { startError?: CaptureError } = {}) {
  return {
    record: vi.fn(async (onLevel?: (r: number) => void) => {
      if (opts.startError) throw opts.startError;
      for (let i = 0; i < 16; i++) onLevel?.(0.1);
    }),
    finish: vi.fn(async () => ({ pcm: new Float32Array(16000), sampleRate: 16000, durationMs: 1000 })),
    cancel: vi.fn()
  } as unknown as AudioCaptureBridge;
}

const okResult = {
  ok: true,
  target: 'sac',
  targetScore: { score: 88, dtwScore: 90, dtwDistanceSemitones: 0.3, pearson: 0.95 },
  bestMatch: 'sac',
  scores: { ngang: 40, huyen: 10, sac: 88, hoi: 30, nga: 70, nang: 5 },
  contour: [0, 1, 2],
  timesMs: [0, 10, 20],
  medianHz: 180,
  voicedRatio: 1,
  processingMs: 12
};

afterEach(() => vi.useRealTimers());

describe('useToneRecorder', () => {
  it('idle → recording → analyzing → done, có kết quả và mức âm lượng', async () => {
    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
    analyzer.result = okResult;
    const bridge = fakeBridge();
    const { result } = renderHook(() => useToneRecorder('sac', () => bridge));
    expect(result.current.status).toBe('idle');

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe('recording');
    expect(result.current.level).toBeGreaterThan(0);

    vi.advanceTimersByTime(800);
    await act(async () => {
      await result.current.stop();
    });
    expect(result.current.status).toBe('done');
    expect(result.current.result?.targetScore.score).toBe(88);
    expect(bridge.finish).toHaveBeenCalled();
  });

  it('tự dừng sau MAX_RECORD_MS', async () => {
    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
    analyzer.result = okResult;
    const bridge = fakeBridge();
    const { result } = renderHook(() => useToneRecorder('sac', () => bridge));
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });
    expect(bridge.finish).toHaveBeenCalled();
    expect(result.current.status).toBe('done');
  });

  it('bị từ chối quyền micro => lỗi permission-denied', async () => {
    const { result } = renderHook(() =>
      useToneRecorder('sac', () => fakeBridge({ startError: new CaptureError('permission-denied') }))
    );
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('permission-denied');
  });

  it('không nghe thấy giọng => lỗi no-voice', async () => {
    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
    analyzer.result = { ok: false, reason: 'no-voice', processingMs: 5 };
    const { result } = renderHook(() => useToneRecorder('sac', () => fakeBridge()));
    await act(async () => {
      await result.current.start();
    });
    vi.advanceTimersByTime(800);
    await act(async () => {
      await result.current.stop();
    });
    expect(result.current.error).toBe('no-voice');
  });

  it('bấm dừng ngay (< 300 ms) => too-short, không phân tích', async () => {
    const bridge = fakeBridge();
    const { result } = renderHook(() => useToneRecorder('sac', () => bridge));
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });
    expect(result.current.error).toBe('too-short');
    expect(bridge.cancel).toHaveBeenCalled();
    expect(bridge.finish).not.toHaveBeenCalled();
  });

  it('đổi thanh mục tiêu thì xóa kết quả cũ', async () => {
    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
    analyzer.result = okResult;
    const { result, rerender } = renderHook(({ t }) => useToneRecorder(t, () => fakeBridge()), {
      initialProps: { t: 'sac' as 'sac' | 'huyen' }
    });
    await act(async () => {
      await result.current.start();
    });
    vi.advanceTimersByTime(800);
    await act(async () => {
      await result.current.stop();
    });
    expect(result.current.result).not.toBeNull();
    rerender({ t: 'huyen' });
    expect(result.current.result).toBeNull();
    expect(result.current.status).toBe('idle');
  });
});
