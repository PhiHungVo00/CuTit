// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppVersionResponse } from '@vietlearning/contracts/api';
import type { ApkCard, UpdaterHooks } from './channel';
import { createApkFlow, MAX_AUTO_FAILS, type ApkDeps } from './apk';
import { createEngine, type EngineDeps } from './scheduler';

/** Test luồng APK với plugin giả (không có native): mọi phụ thuộc được tiêm qua `ApkDeps`. */
const BUILD = 1_004_002;
const NEW_BUILD = BUILD + 1000;
const APK = { url: 'https://cdn.example.com/becutit-1.5.2.apk', sha256: 'a'.repeat(64), sizeBytes: 31_457_280 };

function resp(over: Partial<AppVersionResponse> = {}): AppVersionResponse {
  return {
    channel: 'apk',
    latestBuild: NEW_BUILD,
    latestVersion: '1.5.2',
    minBuild: 0,
    status: 'update_available',
    notes: null,
    apkFile: APK,
    downloadUrl: 'https://example.com/tai-ve',
    checkAfterSec: 21_600,
    ...over
  };
}
const forced = (over: Partial<AppVersionResponse> = {}) => resp({ status: 'update_required', minBuild: NEW_BUILD, ...over });

type Listener = (p: never) => void;
function fakePlugin() {
  const listeners: Record<string, Listener> = {};
  return {
    emit: (e: string, p: unknown) => listeners[e]?.(p as never),
    download: vi.fn(async (_o: unknown) => ({ state: 'queued' as 'done' | 'queued' })),
    canInstall: vi.fn(async () => ({ allowed: true })),
    openInstallSettings: vi.fn(async () => undefined),
    install: vi.fn(async (_o: unknown) => undefined),
    cleanup: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    addListener: vi.fn(async (e: string, cb: Listener) => {
      listeners[e] = cb;
      return { remove() {} };
    })
  };
}

function setup(over: Partial<ApkDeps> = {}) {
  const plugin = fakePlugin();
  const store = new Map<string, string>();
  const resume = { cb: undefined as undefined | (() => void) };
  const deps: ApkDeps = {
    plugin: async () => plugin as never,
    flushSync: vi.fn(async () => undefined),
    isMetered: () => false,
    openUrl: vi.fn(),
    onResume: (cb) => {
      resume.cb = cb;
      return () => (resume.cb = undefined);
    },
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
    flushLimitMs: 3000,
    ...over
  };
  const cards: (ApkCard | null)[] = [];
  const hooks = {
    setProgress: vi.fn(),
    setReady: vi.fn(),
    setError: vi.fn(),
    setCard: vi.fn((c: ApkCard | null) => void cards.push(c))
  } satisfies UpdaterHooks;
  const flow = createApkFlow(deps);
  const lastCard = () => cards.at(-1) ?? null;
  return { plugin, deps, hooks, flow, cards, lastCard, resume, store };
}
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe('apk: tự tải', () => {
  it('update_available + apkFile ⇒ tự gọi download({ allowMetered: false }); tải xong ⇒ thẻ apkReady (không hiện % khi tải ngầm)', async () => {
    const s = setup();
    await s.flow.prepare?.(resp(), s.hooks);
    expect(s.plugin.download).toHaveBeenCalledTimes(1);
    expect(s.plugin.download).toHaveBeenCalledWith({ url: APK.url, sha256: APK.sha256, sizeBytes: APK.sizeBytes, build: NEW_BUILD, allowMetered: false });
    s.plugin.emit('downloadProgress', { percent: 40 });
    expect(s.hooks.setProgress).not.toHaveBeenCalled(); // không làm phiền
    s.plugin.emit('downloadState', { state: 'done' });
    await tick();
    expect(s.lastCard()).toMatchObject({ kind: 'ready', version: '1.5.2' });
  });

  it('tệp cùng build đã có (download trả done ngay) ⇒ thẻ sẵn sàng', async () => {
    const s = setup();
    s.plugin.download.mockResolvedValueOnce({ state: 'done' });
    await s.flow.prepare?.(resp(), s.hooks);
    expect(s.lastCard()).toMatchObject({ kind: 'ready' });
  });

  it('không tự tải khi không có apkFile, khi không phải update_available, hoặc đã tải build đó trong phiên', async () => {
    const s = setup();
    await s.flow.prepare?.(resp({ apkFile: null }), s.hooks);
    await s.flow.prepare?.(forced(), s.hooks);
    expect(s.plugin.download).not.toHaveBeenCalled();
    await s.flow.prepare?.(resp(), s.hooks);
    await s.flow.prepare?.(resp(), s.hooks);
    expect(s.plugin.download).toHaveBeenCalledTimes(1);
  });

  it('quá 3 lần lỗi cùng build ⇒ không tự tải lại (build khác thì có)', async () => {
    const s = setup();
    for (let i = 0; i < MAX_AUTO_FAILS; i++) {
      const f = setup({ storage: s.deps.storage });
      await f.flow.prepare?.(resp(), f.hooks);
      f.plugin.emit('downloadState', { state: 'failed', code: 'network' });
      await tick();
    }
    const again = setup({ storage: s.deps.storage });
    await again.flow.prepare?.(resp(), again.hooks);
    expect(again.plugin.download).not.toHaveBeenCalled();
    const other = setup({ storage: s.deps.storage });
    await other.flow.prepare?.(resp({ latestBuild: NEW_BUILD + 1 }), other.hooks);
    expect(other.plugin.download).toHaveBeenCalledTimes(1);
  });

  it('lỗi tải ⇒ thẻ failed có Thử lại và Mở trang tải (downloadUrl)', async () => {
    const s = setup();
    await s.flow.prepare?.(resp(), s.hooks);
    s.plugin.emit('downloadState', { state: 'failed', code: 'storage' });
    await tick();
    const c = s.lastCard();
    expect(c).toMatchObject({ kind: 'failed' });
    (c as Extract<ApkCard, { kind: 'failed' }>).openPage?.();
    expect(s.deps.openUrl).toHaveBeenCalledWith('https://example.com/tai-ve');
  });
});

describe('apk: bấm Cập nhật (nhắc mềm)', () => {
  it('đang dùng dữ liệu di động ⇒ hỏi apkMeteredAsk; "Tải ngay" ⇒ allowMetered: true', async () => {
    const s = setup({ isMetered: () => true });
    await s.flow.softUpdate(resp(), s.hooks);
    const c = s.lastCard() as Extract<ApkCard, { kind: 'metered' }>;
    expect(c).toMatchObject({ kind: 'metered', sizeMb: 30 });
    expect(s.plugin.download).not.toHaveBeenCalled();
    await c.downloadNow();
    expect(s.plugin.download).toHaveBeenLastCalledWith(expect.objectContaining({ allowMetered: true }));
  });

  it('"Đợi Wi-Fi" ⇒ không tải bằng dữ liệu di động, thẻ đóng', async () => {
    const s = setup({ isMetered: () => true });
    await s.flow.softUpdate(resp(), s.hooks);
    (s.lastCard() as Extract<ApkCard, { kind: 'metered' }>).waitWifi();
    expect(s.lastCard()).toBeNull();
    expect(s.plugin.download).not.toHaveBeenCalled();
  });

  it('mạng thường (Wi-Fi) ⇒ tải allowMetered: false và hiện tiến độ', async () => {
    const s = setup();
    await s.flow.softUpdate(resp(), s.hooks);
    expect(s.plugin.download).toHaveBeenCalledWith(expect.objectContaining({ allowMetered: false }));
    s.plugin.emit('downloadProgress', { percent: 55 });
    expect(s.hooks.setProgress).toHaveBeenLastCalledWith(55);
  });

  it('apkFile null + downloadUrl ⇒ mở trang; cả hai null ⇒ apkNoLink', async () => {
    const a = setup();
    await a.flow.softUpdate(resp({ apkFile: null }), a.hooks);
    expect(a.deps.openUrl).toHaveBeenCalledWith('https://example.com/tai-ve');
    expect(a.plugin.download).not.toHaveBeenCalled();
    const b = setup();
    await b.flow.softUpdate(resp({ apkFile: null, downloadUrl: null }), b.hooks);
    expect(b.deps.openUrl).not.toHaveBeenCalled();
    expect(b.hooks.setError).toHaveBeenCalledWith('apkNoLink');
  });

  it('downloadUrl không phải https ⇒ không mở (apkNoLink)', async () => {
    const s = setup();
    await s.flow.softUpdate(resp({ apkFile: null, downloadUrl: null }), s.hooks);
    expect(s.deps.openUrl).not.toHaveBeenCalled();
  });
});

describe('apk: cài đặt', () => {
  async function ready(s: ReturnType<typeof setup>, r = resp()) {
    s.plugin.download.mockResolvedValueOnce({ state: 'done' });
    await s.flow.prepare?.(r, s.hooks);
    return s.lastCard() as Extract<ApkCard, { kind: 'ready' }>;
  }

  it('canInstall true ⇒ flush sync rồi install({ build })', async () => {
    const s = setup();
    const c = await ready(s);
    await c.install();
    expect(s.deps.flushSync).toHaveBeenCalledTimes(1);
    expect(s.plugin.install).toHaveBeenCalledWith({ build: NEW_BUILD });
  });

  it('flush sync treo ⇒ vẫn cài sau 3 giây', async () => {
    const s = setup({ flushSync: () => new Promise(() => undefined) });
    const c = await ready(s);
    vi.useFakeTimers();
    const p = c.install();
    await vi.advanceTimersByTimeAsync(2900);
    expect(s.plugin.install).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    await p;
    expect(s.plugin.install).toHaveBeenCalledTimes(1);
  });

  it('flush sync lỗi ⇒ vẫn cài', async () => {
    const s = setup({ flushSync: async () => Promise.reject(new Error('offline')) });
    const c = await ready(s);
    await c.install();
    expect(s.plugin.install).toHaveBeenCalledTimes(1);
  });

  it('canInstall false ⇒ thẻ apkAllow; Review Focus 4: quay lại mà vẫn chưa bật ⇒ thẻ còn, KHÔNG tự mở Cài đặt', async () => {
    const s = setup();
    s.plugin.canInstall.mockResolvedValue({ allowed: false });
    const c = await ready(s);
    await c.install();
    expect(s.lastCard()).toMatchObject({ kind: 'allow' });
    expect(s.plugin.install).not.toHaveBeenCalled();
    expect(s.plugin.openInstallSettings).not.toHaveBeenCalled();

    const shown = s.cards.length;
    s.resume.cb?.(); // người dùng quay lại mà chưa bật
    await tick();
    expect(s.cards.length).toBe(shown); // thẻ không đổi
    expect(s.lastCard()).toMatchObject({ kind: 'allow' });
    expect(s.plugin.openInstallSettings).not.toHaveBeenCalled();

    await (s.lastCard() as Extract<ApkCard, { kind: 'allow' }>).openSettings(); // chỉ khi bấm
    expect(s.plugin.openInstallSettings).toHaveBeenCalledTimes(1);
  });

  it('bật quyền rồi quay lại ⇒ thẻ Cài đặt trở lại (một chạm nữa mới cài), không tự cài', async () => {
    const s = setup();
    s.plugin.canInstall.mockResolvedValueOnce({ allowed: false });
    const c = await ready(s);
    await c.install();
    s.plugin.canInstall.mockResolvedValue({ allowed: true });
    s.resume.cb?.();
    await tick();
    expect(s.lastCard()).toMatchObject({ kind: 'ready' });
    expect(s.plugin.install).not.toHaveBeenCalled();
  });

  it('installStatus cancelled ⇒ về thẻ Cài đặt', async () => {
    const s = setup();
    const c = await ready(s);
    await c.install();
    s.plugin.emit('installStatus', { status: 'cancelled' });
    await tick();
    expect(s.lastCard()).toMatchObject({ kind: 'ready' });
  });

  it('install bị từ chối verify_failed / installStatus failed ⇒ thẻ failed (+ mở trang tải)', async () => {
    const s = setup();
    const c = await ready(s);
    s.plugin.install.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'verify_failed' }));
    await c.install();
    expect(s.lastCard()).toMatchObject({ kind: 'failed' });

    const t = setup();
    const c2 = await ready(t);
    await c2.install();
    t.plugin.emit('installStatus', { status: 'failed', message: 'x' });
    await tick();
    expect(t.lastCard()).toMatchObject({ kind: 'failed' });
  });

  it('bấm Cài đặt hai lần liền ⇒ chỉ cài một lần', async () => {
    const s = setup({ flushSync: () => new Promise((r) => setTimeout(r, 10)) });
    const c = await ready(s);
    await Promise.all([c.install(), c.install()]);
    expect(s.plugin.install).toHaveBeenCalledTimes(1);
  });
});

describe('apk: bắt buộc', () => {
  it('forcedUpdate ⇒ tải allowMetered: true (bỏ điều kiện Wi-Fi), báo % cho màn chặn; tải xong ⇒ tự vào bước cài', async () => {
    const s = setup({ isMetered: () => true });
    await s.flow.forcedUpdate(forced(), s.hooks);
    expect(s.plugin.download).toHaveBeenCalledWith(expect.objectContaining({ allowMetered: true }));
    s.plugin.emit('downloadProgress', { percent: 70 });
    expect(s.hooks.setProgress).toHaveBeenLastCalledWith(70);
    s.plugin.emit('downloadState', { state: 'done' });
    await tick();
    await tick();
    expect(s.plugin.install).toHaveBeenCalledWith({ build: NEW_BUILD });
  });

  it('thiếu link ⇒ apkNoLink; có downloadUrl ⇒ mở trang', async () => {
    const a = setup();
    await a.flow.forcedUpdate(forced({ apkFile: null, downloadUrl: null }), a.hooks);
    expect(a.hooks.setError).toHaveBeenCalledWith('apkNoLink');
    const b = setup();
    await b.flow.forcedUpdate(forced({ apkFile: null }), b.hooks);
    expect(b.deps.openUrl).toHaveBeenCalledWith('https://example.com/tai-ve');
  });
});

describe('scheduler gọi prepare chỉ ở kênh apk', () => {
  function engineFor(channel: 'apk' | 'play') {
    const prepare = vi.fn(async () => undefined);
    const body = resp({ channel });
    const deps: EngineDeps = {
      build: BUILD,
      channel,
      now: () => Date.now(),
      isOnline: () => true,
      baseUrl: () => 'http://gw',
      fetch: (async () => ({ ok: true, json: async () => body })) as never,
      isAudioBusy: () => false,
      onAudioBusyChange: () => () => undefined,
      pauseSync: () => undefined,
      loadUpdater: async () => ({ softUpdate: async () => undefined, forcedUpdate: async () => undefined, prepare }),
      getPath: () => '/'
    };
    return { engine: createEngine(deps), prepare };
  }
  beforeEach(() => localStorage.clear());

  it('apk + update_available ⇒ prepare được gọi', async () => {
    const { engine, prepare } = engineFor('apk');
    await engine.check({ force: true });
    await tick();
    expect(prepare).toHaveBeenCalledTimes(1);
  });
  it('play ⇒ không gọi prepare', async () => {
    const { engine, prepare } = engineFor('play');
    await engine.check({ force: true });
    await tick();
    expect(prepare).not.toHaveBeenCalled();
  });
});
