import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const speak = vi.fn(async () => undefined);
vi.mock('@vietlearning/native', () => ({ getDeviceSpeech: () => ({ speak }) }));
vi.mock('@vietlearning/api-client', () => ({ gatewayBaseUrl: () => 'http://gw.test' }));

import { _resetPacks, findAudioKey, playText, prefetchPack, SLOW_RATE } from './coursePlayer';

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
