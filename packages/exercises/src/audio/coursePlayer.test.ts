import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const speak = vi.fn(async () => undefined);
vi.mock('@vietlearning/native', () => ({ getDeviceSpeech: () => ({ speak }) }));
vi.mock('@vietlearning/api-client', () => ({ gatewayBaseUrl: () => 'http://gw.test' }));

import { _resetPacks, findAudioKey, playText, prefetchPack } from './coursePlayer';

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
});
