// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppVersionResponse } from '@vietlearning/contracts/api';
import { createEngine, type EngineDeps } from './scheduler';
import { STATE_KEY } from './state';
import type { ChannelUpdater, UpdaterHooks } from './channel';

const BUILD = 1_004_002;
const MIN = 30 * 60_000;
const DAY = 86_400_000;

function response(over: Partial<AppVersionResponse> = {}): AppVersionResponse {
  return {
    channel: 'play',
    latestBuild: BUILD,
    latestVersion: '1.4.2',
    minBuild: 0,
    status: 'up_to_date',
    notes: null,
    apkFile: null,
    downloadUrl: null,
    checkAfterSec: 21_600,
    ...over
  };
}
const available = (over: Partial<AppVersionResponse> = {}) =>
  response({ latestBuild: BUILD + 1000, latestVersion: '1.5.2', status: 'update_available', ...over });
const required = (over: Partial<AppVersionResponse> = {}) =>
  response({ minBuild: BUILD + 1, latestBuild: BUILD + 1, latestVersion: '1.4.3', status: 'update_required', ...over });

type Mock = ReturnType<typeof vi.fn>;
interface Harness {
  deps: EngineDeps;
  fetch: Mock;
  updater: { softUpdate: Mock; forcedUpdate: Mock };
  pauseSync: Mock;
  audio: { busy: boolean; cbs: Set<(b: boolean) => void>; set(b: boolean): void };
  online: { value: boolean };
  path: { value: string };
  next(body: unknown): void;
}

function harness(over: Partial<EngineDeps> = {}): Harness {
  let body: unknown = response();
  const fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));
  const updater = { softUpdate: vi.fn(async () => undefined), forcedUpdate: vi.fn(async () => undefined) };
  const pauseSync = vi.fn();
  const audio = {
    busy: false,
    cbs: new Set<(b: boolean) => void>(),
    set(b: boolean) {
      this.busy = b;
      for (const cb of [...this.cbs]) cb(b);
    }
  };
  const online = { value: true };
  const path = { value: '/' };
  const deps: EngineDeps = {
    build: BUILD,
    channel: 'play',
    now: () => Date.now(),
    isOnline: () => online.value,
    baseUrl: () => 'http://gw.test',
    fetch: fetchFn as unknown as typeof fetch,
    isAudioBusy: () => audio.busy,
    onAudioBusyChange: (cb) => {
      audio.cbs.add(cb);
      return () => void audio.cbs.delete(cb);
    },
    pauseSync,
    loadUpdater: async () => updater as unknown as ChannelUpdater,
    getPath: () => path.value,
    ...over
  };
  return { deps, fetch: fetchFn, updater, pauseSync, audio, online, path, next: (b) => void (body = b) };
}

const flush = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  Object.defineProperty(document, 'hidden', { value: state === 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-25T08:00:00Z'));
  localStorage.clear();
  setVisibility('visible');
});
// Engine bỏ lại listener trên document/window: phải dừng sau mỗi test, nếu không lần kiểm của test trước ghi đè state test sau
const stops: (() => void)[] = [];
const begin = (e: ReturnType<typeof createEngine>) => void stops.push(e.start());
afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  vi.useRealTimers();
});

describe('lịch kiểm', () => {
  it('kiểm lúc start, khi quay lại màn hình quá 30 phút, và sau checkAfterSec', async () => {
    const h = harness();
    const e = createEngine(h.deps);
    const stop = e.start();
    await flush();
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(String(h.fetch.mock.calls[0][0])).toBe('http://gw.test/v1/app/version?channel=play&build=1004002');

    vi.advanceTimersByTime(MIN + 1000);
    setVisibility('hidden');
    setVisibility('visible');
    await flush();
    expect(h.fetch).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(21_600_000);
    expect(h.fetch.mock.calls.length).toBeGreaterThanOrEqual(3);
    stop();
  });

  it('lần thứ hai trong vòng 30 phút bị bỏ', async () => {
    const h = harness();
    const e = createEngine(h.deps);
    begin(e);
    await flush();
    vi.advanceTimersByTime(10 * 60_000);
    setVisibility('visible');
    await flush();
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it('bản dev (build 0) không kiểm và không phát sinh timer', async () => {
    const h = harness({ build: 0 });
    const e = createEngine(h.deps);
    const timersBefore = vi.getTimerCount();
    begin(e);
    await flush();
    expect(h.fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(timersBefore);
  });

  it('response sai schema: im lặng, không nhắc', async () => {
    const h = harness();
    h.next({ rac: true });
    const e = createEngine(h.deps);
    begin(e);
    await flush();
    expect(e.getView().soft).toBeNull();
    expect(e.getView().forced).toBe(false);
  });
});

describe('nhắc mềm + "Để sau"', () => {
  it('update_available ⇒ hiện nhắc mềm', async () => {
    const h = harness();
    h.next(available());
    const e = createEngine(h.deps);
    begin(e);
    await flush();
    expect(e.getView().soft?.latestVersion).toBe('1.5.2');
  });

  it('"Để sau" ẩn cùng latestBuild trong 3 ngày; latestBuild lớn hơn hiện ngay', async () => {
    const h = harness();
    h.next(available());
    const e = createEngine(h.deps);
    begin(e);
    await flush();
    e.snooze();
    expect(e.getView().soft).toBeNull();

    vi.advanceTimersByTime(2 * DAY);
    await e.check({ force: true });
    expect(e.getView().soft).toBeNull();

    h.next(available({ latestBuild: BUILD + 2000, latestVersion: '1.6.2' }));
    await e.check({ force: true });
    expect(e.getView().soft?.latestVersion).toBe('1.6.2');
  });

  it('hết 3 ngày thì nhắc lại cùng bản đó', async () => {
    const h = harness();
    h.next(available());
    const e = createEngine(h.deps);
    begin(e);
    await flush();
    e.snooze();
    vi.advanceTimersByTime(3 * DAY + 1000);
    await e.check({ force: true });
    expect(e.getView().soft).not.toBeNull();
  });

  it('isAudioBusy() ⇒ không hiện; onAudioBusyChange(false) ⇒ hiện', async () => {
    const h = harness();
    h.audio.busy = true;
    h.next(available());
    const e = createEngine(h.deps);
    begin(e);
    await flush();
    expect(e.getView().soft).toBeNull();
    h.audio.set(false);
    expect(e.getView().soft).not.toBeNull();
  });

  it('đang ở màn bài tập thì giữ kết quả, rời màn mới hiện', async () => {
    const h = harness();
    h.path.value = '/ghep-cau';
    h.next(available());
    const e = createEngine(h.deps);
    begin(e);
    await flush();
    expect(e.getView().soft).toBeNull();
    e.setPath('/');
    expect(e.getView().soft).not.toBeNull();
  });

  it('ghi chú là chữ thuần (chuỗi <b> được giữ nguyên, không thành HTML)', async () => {
    const h = harness();
    h.next(available({ notes: { vi: '<b>x</b>', en: '<b>x</b>' } }));
    const e = createEngine(h.deps);
    begin(e);
    await flush();
    expect(e.getView().soft?.notes?.vi).toBe('<b>x</b>');
  });
});

describe('bắt buộc', () => {
  it('Review Focus 1: update_required lúc ở /luyen-tap ⇒ không hiện; sang / ⇒ hiện ForcedUpdate và gọi pauseSync', async () => {
    const h = harness();
    h.path.value = '/luyen-tap';
    h.next(required());
    const e = createEngine(h.deps);
    begin(e);
    await flush();
    expect(e.getView().forced).toBe(false);
    expect(h.pauseSync).not.toHaveBeenCalled();
    e.setPath('/');
    expect(e.getView().forced).toBe(true);
    expect(h.pauseSync).toHaveBeenCalledTimes(1);
  });

  it('đang thu âm ⇒ đợi xong lượt rồi mới hiện', async () => {
    const h = harness();
    h.audio.busy = true;
    h.next(required());
    const e = createEngine(h.deps);
    begin(e);
    await flush();
    expect(e.getView().forced).toBe(false);
    h.audio.set(false);
    expect(e.getView().forced).toBe(true);
  });

  it('offline + lastResponse update_required ⇒ chỉ dải forcedOffline; có mạng ⇒ kiểm lại ngay', async () => {
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({ lastCheckAt: Date.now() - 1000, lastResponse: required(), snoozedBuild: 0, snoozedUntil: 0 })
    );
    const h = harness();
    h.online.value = false;
    const e = createEngine(h.deps);
    begin(e);
    await flush();
    expect(h.fetch).not.toHaveBeenCalled();
    expect(e.getView().forcedOffline).toBe(true);
    expect(e.getView().forced).toBe(false);

    h.online.value = true;
    h.next(response());
    window.dispatchEvent(new Event('online'));
    await flush();
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(e.getView().forcedOffline).toBe(false);
  });

  it('có mạng nhưng lần kiểm hỏng vì mạng (cổng Wi-Fi/Gateway không tới được) ⇒ coi như offline: chỉ dải, KHÔNG chặn', async () => {
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({ lastCheckAt: Date.now() - 2 * MIN, lastResponse: required(), snoozedBuild: 0, snoozedUntil: 0 })
    );
    const h = harness({ fetch: vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch });
    const e = createEngine(h.deps);
    begin(e);
    await flush();
    expect(e.getView().forced).toBe(false);
    expect(e.getView().forcedOffline).toBe(true);
  });

  it('lỗi HTTP 5xx KHÔNG phải offline: màn bắt buộc vẫn hiện nếu đã biết cần cập nhật', async () => {
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({ lastCheckAt: Date.now() - 2 * MIN, lastResponse: required(), snoozedBuild: 0, snoozedUntil: 0 })
    );
    const h = harness({ fetch: vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch });
    const e = createEngine(h.deps);
    begin(e);
    await flush();
    expect(e.getView().forced).toBe(true);
  });

  it('lastResponse cũ (app đã lên bản mới) không còn ép cập nhật', async () => {
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({ lastCheckAt: Date.now() - 1000, lastResponse: required({ minBuild: BUILD }), snoozedBuild: 0, snoozedUntil: 0 })
    );
    const h = harness();
    h.online.value = false;
    const e = createEngine(h.deps);
    begin(e);
    await flush();
    expect(e.getView().forcedOffline).toBe(false);
  });

  it('nhận 426 (forceRequired) ⇒ hiện màn bắt buộc dù chưa có response, rồi lấy ghi chú từ Gateway', async () => {
    const h = harness();
    const e = createEngine(h.deps);
    e.forceRequired({ minBuild: BUILD + 1, channel: 'play' });
    expect(e.getView().forced).toBe(true);
    await flush();
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it('426 khi offline: chỉ dải', () => {
    const h = harness();
    h.online.value = false;
    const e = createEngine(h.deps);
    e.forceRequired({ minBuild: BUILD + 1, channel: 'play' });
    expect(e.getView().forced).toBe(false);
    expect(e.getView().forcedOffline).toBe(true);
  });
});

describe('hành động theo kênh', () => {
  it('runSoft/runForced gọi đúng hàm của kênh với response hiện có', async () => {
    const h = harness();
    h.next(available());
    const e = createEngine(h.deps);
    begin(e);
    await flush();
    await e.runSoft();
    expect(h.updater.softUpdate).toHaveBeenCalledTimes(1);
    expect(h.updater.softUpdate.mock.calls[0][0].latestBuild).toBe(BUILD + 1000);

    h.next(required());
    await e.check({ force: true });
    await e.runForced();
    expect(h.updater.forcedUpdate).toHaveBeenCalledTimes(1);
  });

  it('hook của kênh: tiến độ, "tải xong" (ẩn khi bận)', async () => {
    const h = harness();
    h.next(available());
    h.updater.softUpdate.mockImplementation(async (_r: unknown, hooks: UpdaterHooks) => {
      hooks.setProgress(40);
    });
    const e = createEngine(h.deps);
    begin(e);
    await flush();
    await e.runSoft();
    expect(e.getView().progress).toBe(40);

    const complete = vi.fn(async () => undefined);
    h.updater.softUpdate.mockImplementation(async (_r: unknown, hooks: UpdaterHooks) => {
      hooks.setProgress(null);
      hooks.setReady(complete);
    });
    await e.runSoft();
    expect(e.getView().ready).toBe(complete);
    h.audio.set(true);
    expect(e.getView().ready).toBeNull();
    h.audio.set(false);
    expect(e.getView().ready).toBe(complete);
  });

  it('lỗi do kênh báo (vd. không mở được cửa hàng) hiện ở view.error', async () => {
    const h = harness();
    h.next(available());
    h.updater.softUpdate.mockImplementation(async (_r: unknown, hooks: UpdaterHooks) => hooks.setError('openStoreFailed'));
    const e = createEngine(h.deps);
    begin(e);
    await flush();
    await e.runSoft();
    expect(e.getView().error).toBe('openStoreFailed');
  });
});

describe('web: bản mới do Service Worker báo', () => {
  it('markWebRefresh ⇒ thẻ webReload (tôn trọng bận); dismiss ẩn', async () => {
    const h = harness({ channel: 'web' });
    const e = createEngine(h.deps);
    begin(e);
    await flush();
    e.markWebRefresh();
    expect(e.getView().webReload).toBe(true);
    h.audio.set(true);
    expect(e.getView().webReload).toBe(false);
    h.audio.set(false);
    expect(e.getView().webReload).toBe(true);
    e.dismissWebRefresh();
    expect(e.getView().webReload).toBe(false);
  });
});
