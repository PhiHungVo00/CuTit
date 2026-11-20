import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Giả lập giọng đọc của thiết bị: mỗi lượt speak trả về promise mà test tự quyết khi nào xong. */
const device = vi.hoisted(() => {
  const pending: { resolve: () => void; reject: (e: unknown) => void }[] = [];
  return {
    pending,
    mode: 'ok' as 'ok' | 'no-voice',
    speak: vi.fn(),
    stop: vi.fn(async () => undefined)
  };
});

vi.mock('@vietlearning/native', () => {
  class SpeechError extends Error {
    constructor(public code: string) {
      super(code);
    }
  }
  device.speak.mockImplementation(() => {
    if (device.mode === 'no-voice') return Promise.reject(new SpeechError('no-vietnamese-voice'));
    return new Promise<void>((resolve, reject) => device.pending.push({ resolve, reject }));
  });
  return { SpeechError, getDeviceSpeech: () => ({ speak: device.speak, stop: device.stop }) };
});

import { isAudioBusy } from '@vietlearning/shared/audio/focus';
const { speechService } = await import('./speechSynthesis');

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('speechService', () => {
  beforeEach(() => {
    device.pending.length = 0;
    device.mode = 'ok';
    device.speak.mockClear();
  });
  afterEach(() => {
    speechService.stop();
    vi.unstubAllGlobals();
  });

  it('lượt đọc xong thì gọi onEnd', async () => {
    const onEnd = vi.fn();
    void speechService.speak('Chào bác', { onEnd });
    await flush();
    device.pending[0].resolve();
    await flush();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('lượt mới thay lượt cũ: báo kết thúc cho lượt cũ (nút cũ không kẹt "Đang đọc")', async () => {
    const firstEnd = vi.fn();
    const secondEnd = vi.fn();
    void speechService.speak('Câu một', { onEnd: firstEnd });
    await flush();
    void speechService.speak('Câu hai', { onEnd: secondEnd });
    await flush();
    expect(firstEnd).toHaveBeenCalledTimes(1);
    expect(secondEnd).not.toHaveBeenCalled();

    // Lượt cũ có kết thúc muộn cũng không được gọi lại callback hay làm hỏng lượt mới
    device.pending[0].resolve();
    await flush();
    expect(firstEnd).toHaveBeenCalledTimes(1);
    expect(secondEnd).not.toHaveBeenCalled();
    expect(speechService.isSpeaking()).toBe(true);
  });

  it('máy không có giọng Việt + Gateway trả 503 => onError "no-voice-available" (không giả vờ đọc)', async () => {
    device.mode = 'no-voice';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"tts_provider_not_configured"}', { status: 503 })));
    const onError = vi.fn();
    const onEnd = vi.fn();
    await speechService.speak('Chào bác', { onError, onEnd });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'no-voice-available' }));
    expect(onEnd).not.toHaveBeenCalled();
    expect(speechService.isSpeaking()).toBe(false);
  });

  it('mất mạng khi gọi Gateway => onError "network"', async () => {
    device.mode = 'no-voice';
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const onError = vi.fn();
    await speechService.speak('Chào bác', { onError });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'network' }));
  });

  describe('báo điều phối âm thanh khi phát giọng Gateway', () => {
    function gateway(end: 'ended' | 'error' | 'never') {
      device.mode = 'no-voice';
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ audioUrl: 'http://gw.test/a.mp3', durationMs: 1000, cached: false }), { status: 200, headers: { 'content-type': 'application/json' } })));
      const seen: boolean[] = [];
      class A {
        onended: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(public src: string) {}
        play() {
          seen.push(isAudioBusy());
          if (end === 'ended') setTimeout(() => this.onended?.(), 0);
          if (end === 'error') setTimeout(() => this.onerror?.(), 0);
          return Promise.resolve();
        }
        pause() {}
      }
      vi.stubGlobal('Audio', A);
      return seen;
    }

    it('bận khi đang phát, hết bận khi xong', async () => {
      const seen = gateway('ended');
      await speechService.speak('Chào bác', {});
      await flush();
      await flush();
      expect(seen).toEqual([true]);
      expect(isAudioBusy()).toBe(false);
    });

    it('lỗi phát => hết bận', async () => {
      gateway('error');
      await speechService.speak('Chào bác', { onError: vi.fn() });
      await flush();
      await flush();
      expect(isAudioBusy()).toBe(false);
    });

    it('stop() giữa chừng => hết bận', async () => {
      gateway('never');
      await speechService.speak('Chào bác', {});
      await flush();
      expect(isAudioBusy()).toBe(true);
      speechService.stop();
      expect(isAudioBusy()).toBe(false);
    });
  });
});
