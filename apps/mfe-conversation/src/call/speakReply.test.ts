import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpeaker, speakTimeoutMs, type SpeakerDeps } from './speakReply';

function deps(over: Partial<SpeakerDeps> = {}): SpeakerDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    synth: vi.fn(async () => {
      calls.push('synth');
      return 'https://cdn.test/a.mp3';
    }),
    play: vi.fn(async (_url: string, rate: number) => {
      calls.push(`play:${rate}`);
    }),
    device: {
      speak: vi.fn(async (_t: string, o?: { rate?: number }) => {
        calls.push(`device:${o?.rate}`);
      }),
      stop: vi.fn(async () => undefined)
    },
    deviceRate: (base: number) => base,
    ...over
  };
}

afterEach(() => vi.useRealTimers());

describe('speakReply — đọc câu trả lời của Bé Cu Tít', () => {
  it('Gateway có TTS => phát âm thanh; nói chậm => playbackRate 0.75', async () => {
    const d = deps();
    const speak = createSpeaker(d);
    expect(await speak('Chào bạn', { slow: false })).toBe('server');
    expect(await speak('Chào bạn', { slow: true })).toBe('server');
    expect(d.calls).toEqual(['synth', 'play:1', 'synth', 'play:0.75']);
    // luôn xin giọng tốc độ chuẩn (một khóa cache), chỉ chậm lại lúc phát => không chậm hai lần (~0.56×)
    expect(d.synth).toHaveBeenNthCalledWith(1, 'Chào bạn');
    expect(d.synth).toHaveBeenNthCalledWith(2, 'Chào bạn');
  });

  it('âm thanh máy chủ treo => watchdog dừng phát (gác máy không còn tiếng)', async () => {
    vi.useFakeTimers();
    const stopPlayback = vi.fn();
    const d = deps({ play: () => new Promise<void>(() => undefined), stopPlayback });
    const p = createSpeaker(d)('Chào bạn', { slow: false });
    await vi.advanceTimersByTimeAsync(speakTimeoutMs('Chào bạn', false) + 10);
    await expect(p).resolves.toBe('none');
    expect(stopPlayback).toHaveBeenCalled();
  });

  it('Gateway chưa có TTS (503) => TTS của máy, và không hỏi lại Gateway trong cả cuộc gọi', async () => {
    const synth = vi.fn(async () => {
      throw Object.assign(new Error('x'), { kind: 'unavailable' });
    });
    const d = deps({ synth });
    const speak = createSpeaker(d);
    expect(await speak('a', { slow: false })).toBe('device');
    expect(await speak('b', { slow: true })).toBe('device');
    expect(synth).toHaveBeenCalledTimes(1);
    expect(d.calls).toEqual(['device:0.95', 'device:0.7']);
  });

  it('phát âm thanh lỗi => đọc bằng máy', async () => {
    const d = deps({ play: vi.fn(async () => Promise.reject(new Error('NotAllowedError'))) });
    expect(await createSpeaker(d)('a', { slow: false })).toBe('device');
  });

  it('TTS treo (không bao giờ báo xong) => vẫn trả về sau watchdog để vòng gọi đi tiếp', async () => {
    vi.useFakeTimers();
    const d = deps({ synth: vi.fn(async () => null), device: { speak: () => new Promise<void>(() => undefined), stop: vi.fn(async () => undefined) } });
    const p = createSpeaker(d)('Một câu khá dài để đọc', { slow: false });
    await vi.advanceTimersByTimeAsync(speakTimeoutMs('Một câu khá dài để đọc', false) + 10);
    await expect(p).resolves.toBe('none');
    expect(d.device.stop).toHaveBeenCalled();
  });

  it('watchdog: tối thiểu 3 s, tăng theo độ dài, dài hơn khi nói chậm', () => {
    expect(speakTimeoutMs('a', false)).toBe(3000);
    expect(speakTimeoutMs('x'.repeat(100), false)).toBe(9000);
    expect(speakTimeoutMs('x'.repeat(100), true)).toBeGreaterThan(9000);
  });
});
