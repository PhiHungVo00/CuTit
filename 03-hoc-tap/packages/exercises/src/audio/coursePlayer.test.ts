import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const speak = vi.fn(async () => undefined);
vi.mock('@vietlearning/native', () => ({ getDeviceSpeech: () => ({ speak, stop: async () => undefined }) }));
vi.mock('@vietlearning/api-client', () => ({ gatewayBaseUrl: () => 'http://gw.test' }));

import { isAudioBusy } from '@vietlearning/shared/audio/focus';
import { _resetPacks, findAudioKey, playText, prefetchPack, SLOW_RATE, stopPlayback } from './coursePlayer';

const KEY = 'a'.repeat(64);

/** Cache Storage giả trong RAM */
function fakeCaches() {
  const store = new Map<string, Response>();
  const cache = {
    put: vi.fn(async (url: string, res: Response) => void store.set(url, res)),
    match: vi.fn(async (url: string) => store.get(url)?.clone()),
    add: vi.fn(async (url: string) => void store.set(url, new Response(new Blob(['RIFF'])))),
  };
  vi.stubGlobal('caches', { open: async () => cache });
  return { store, cache };
}

beforeEach(() => {
  _resetPacks();
  speak.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('coursePlayer', () => {
  it('tải gói: lưu manifest + tệp vào Cache Storage, bỏ khóa không hợp lệ', async () => {
    const { store } = fakeCaches();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: { 'Xin chào': KEY, xấu: '../../x' } }))));
    expect(await prefetchPack('u1', 'south')).toBe(1);
    expect(store.has('http://gw.test/audio/packs/u1-south.json')).toBe(true);
    expect(store.has(`http://gw.test/audio/${KEY}.wav`)).toBe(true);
    expect(findAudioKey('Xin chào', 'south')).toBe(KEY);
    expect(findAudioKey('Xin chào', 'north')).toBeUndefined();
    expect(findAudioKey('xấu', 'south')).toBeUndefined();
  });

  it('mất mạng: đọc manifest đã lưu; không có gì => 0, không ném lỗi', async () => {
    const { store } = fakeCaches();
    store.set('http://gw.test/audio/packs/u1-south.json', new Response(JSON.stringify({ items: { 'cảm ơn': KEY } })));
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    await prefetchPack('u1', 'south');
    expect(findAudioKey('cảm ơn', 'south')).toBe(KEY);
    _resetPacks();
    fakeCaches();
    expect(await prefetchPack('u2', 'north')).toBe(0);
  });

  it('chưa có tệp dựng sẵn => đọc bằng TTS của máy', async () => {
    fakeCaches();
    await playText('câu chưa có', 'south');
    expect(speak).toHaveBeenCalledWith('câu chưa có', expect.anything());
  });

  it('đọc chậm (🐢): TTS của máy giảm tốc 0.75 lần', async () => {
    fakeCaches();
    await playText('câu chưa có', 'south', { slow: true });
    const rate = (speak.mock.calls[0] as unknown as [string, { rate: number }])[1].rate;
    expect(rate).toBeCloseTo(0.85 * SLOW_RATE);
  });

  it('đọc chậm (🐢): tệp dựng sẵn phát playbackRate 0.75, giữ cao độ', async () => {
    fakeCaches();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: { 'Xin chào': KEY } }))));
    await prefetchPack('u1', 'north');
    const made: { playbackRate: number; preservesPitch: boolean }[] = [];
    class FakeAudio {
      playbackRate = 1;
      preservesPitch = false;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        made.push(this);
      }
      play() {
        setTimeout(() => this.onended?.(), 0);
        return Promise.resolve();
      }
      pause() {}
    }
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }));
    await playText('Xin chào', 'north', { slow: true });
    await playText('Xin chào', 'north');
    expect(made.map((a) => [a.playbackRate, a.preservesPitch])).toEqual([
      [SLOW_RATE, true],
      [1, true]
    ]);
    expect(speak).not.toHaveBeenCalled();
  });
});

describe('coursePlayer báo điều phối âm thanh (nhạc nền phải dừng)', () => {
  async function ready() {
    fakeCaches();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: { 'Xin chào': KEY } }))));
    await prefetchPack('u1', 'north');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }));
  }
  const fakeAudio = (end: 'ended' | 'error' | 'never') => {
    const seenBusy: boolean[] = [];
    class A {
      playbackRate = 1;
      preservesPitch = false;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      play() {
        seenBusy.push(isAudioBusy());
        if (end === 'ended') setTimeout(() => this.onended?.(), 0);
        if (end === 'error') setTimeout(() => this.onerror?.(), 0);
        return Promise.resolve();
      }
      pause() {}
    }
    vi.stubGlobal('Audio', A);
    return seenBusy;
  };

  it('tệp dựng sẵn: bận khi đang phát, hết bận khi phát xong', async () => {
    await ready();
    const seen = fakeAudio('ended');
    await playText('Xin chào', 'north');
    expect(seen).toEqual([true]);
    expect(isAudioBusy()).toBe(false);
  });

  it('tệp lỗi giữa chừng => hết bận (rơi về TTS của máy)', async () => {
    await ready();
    fakeAudio('error');
    await playText('Xin chào', 'north');
    expect(isAudioBusy()).toBe(false);
  });

  it('stopPlayback() khi đang phát => hết bận', async () => {
    await ready();
    fakeAudio('never');
    void playText('Xin chào', 'north');
    await new Promise((r) => setTimeout(r, 30));
    expect(isAudioBusy()).toBe(true);
    stopPlayback();
    expect(isAudioBusy()).toBe(false);
  });
});
