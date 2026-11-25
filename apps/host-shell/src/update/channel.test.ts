// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppVersionResponse } from '@vietlearning/contracts/api';
import type { UpdaterHooks } from './channel';

// Plugin Play giả (không có native trong test); khớp enum thật của @capawesome/capacitor-app-update 7.2.0
const plugin = vi.hoisted(() => ({
  getAppUpdateInfo: vi.fn(),
  startFlexibleUpdate: vi.fn(async () => ({ code: 0 })),
  completeFlexibleUpdate: vi.fn(async () => undefined),
  performImmediateUpdate: vi.fn(async () => ({ code: 0 })),
  openAppStore: vi.fn(async () => undefined),
  listener: undefined as undefined | ((s: { installStatus: number; bytesDownloaded?: number; totalBytesToDownload?: number }) => void),
  addListener: vi.fn(async (_name: string, cb: (s: never) => void) => {
    plugin.listener = cb as never;
    return { remove: async () => undefined };
  })
}));
vi.mock('@capawesome/capacitor-app-update', () => ({ AppUpdate: plugin }));

const pwa = vi.hoisted(() => ({
  updateSW: vi.fn(async () => undefined),
  opts: undefined as undefined | { onNeedRefresh?: () => void; onRegisteredSW?: (url: string, reg: unknown) => void }
}));
vi.mock('virtual:pwa-register', () => ({
  registerSW: (o: typeof pwa.opts) => {
    pwa.opts = o;
    return pwa.updateSW;
  }
}));

const R: AppVersionResponse = {
  channel: 'play',
  latestBuild: 2,
  latestVersion: '1.0.2',
  minBuild: 0,
  status: 'update_available',
  notes: null,
  apkFile: null,
  downloadUrl: null,
  checkAfterSec: 21_600
};
const mkHooks = (): UpdaterHooks & { [K in keyof UpdaterHooks]: ReturnType<typeof vi.fn> } => ({
  setProgress: vi.fn(),
  setReady: vi.fn(),
  setError: vi.fn()
});

beforeEach(() => {
  vi.clearAllMocks();
  plugin.listener = undefined;
});

describe('play', () => {
  it('nhắc mềm + UPDATE_AVAILABLE + flexibleUpdateAllowed ⇒ startFlexibleUpdate; tải xong ⇒ setReady(completeFlexibleUpdate)', async () => {
    const { updater } = await import('./play');
    plugin.getAppUpdateInfo.mockResolvedValue({ updateAvailability: 2, flexibleUpdateAllowed: true, immediateUpdateAllowed: true });
    const hooks = mkHooks();
    await updater.softUpdate(R, hooks);
    expect(plugin.startFlexibleUpdate).toHaveBeenCalledTimes(1);
    expect(plugin.openAppStore).not.toHaveBeenCalled();

    plugin.listener?.({ installStatus: 2, bytesDownloaded: 25, totalBytesToDownload: 100 });
    expect(hooks.setProgress).toHaveBeenLastCalledWith(25);
    plugin.listener?.({ installStatus: 11 });
    expect(hooks.setProgress).toHaveBeenLastCalledWith(null);
    const action = hooks.setReady.mock.calls.at(-1)?.[0] as () => Promise<void>;
    await action();
    expect(plugin.completeFlexibleUpdate).toHaveBeenCalledTimes(1);
  });

  it('UPDATE_NOT_AVAILABLE ⇒ openAppStore (không crash)', async () => {
    const { updater } = await import('./play');
    plugin.getAppUpdateInfo.mockResolvedValue({ updateAvailability: 1, flexibleUpdateAllowed: false, immediateUpdateAllowed: false });
    await updater.softUpdate(R, mkHooks());
    expect(plugin.openAppStore).toHaveBeenCalledTimes(1);
    expect(plugin.startFlexibleUpdate).not.toHaveBeenCalled();
  });

  it('bản cài ngoài Play (getAppUpdateInfo ném) ⇒ rơi về openAppStore', async () => {
    const { updater } = await import('./play');
    plugin.getAppUpdateInfo.mockRejectedValue(new Error('UNAVAILABLE'));
    await updater.softUpdate(R, mkHooks());
    expect(plugin.openAppStore).toHaveBeenCalledTimes(1);
  });

  it('không mở được cửa hàng ⇒ báo openStoreFailed', async () => {
    const { updater } = await import('./play');
    plugin.getAppUpdateInfo.mockResolvedValue({ updateAvailability: 1 });
    plugin.openAppStore.mockRejectedValueOnce(new Error('x'));
    const hooks = mkHooks();
    await updater.forcedUpdate({ ...R, status: 'update_required' }, hooks);
    expect(hooks.setError).toHaveBeenCalledWith('openStoreFailed');
  });

  it('bắt buộc + immediateUpdateAllowed ⇒ performImmediateUpdate; không cho phép ⇒ openAppStore', async () => {
    const { updater } = await import('./play');
    plugin.getAppUpdateInfo.mockResolvedValue({ updateAvailability: 2, immediateUpdateAllowed: true, flexibleUpdateAllowed: true });
    await updater.forcedUpdate({ ...R, status: 'update_required' }, mkHooks());
    expect(plugin.performImmediateUpdate).toHaveBeenCalledTimes(1);
    expect(plugin.openAppStore).not.toHaveBeenCalled();

    plugin.getAppUpdateInfo.mockResolvedValue({ updateAvailability: 2, immediateUpdateAllowed: false, flexibleUpdateAllowed: true });
    await updater.forcedUpdate({ ...R, status: 'update_required' }, mkHooks());
    expect(plugin.openAppStore).toHaveBeenCalledTimes(1);
  });
});

describe('web', () => {
  class FakeSw extends EventTarget {
    controller: unknown = {};
  }
  let sw: FakeSw;

  async function loadWeb(opts: { hadController: boolean }) {
    vi.resetModules();
    sw = new FakeSw();
    sw.controller = opts.hadController ? {} : null;
    Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });
    return import('./web');
  }

  it('softUpdate ⇒ updateSW(true) khi SW đã có bản chờ', async () => {
    const web = await loadWeb({ hadController: true });
    await web.registerWeb({ onNeedRefresh: vi.fn(), onStaleTab: vi.fn() });
    pwa.opts?.onRegisteredSW?.('/sw.js', { update: async () => undefined, waiting: {}, installing: null });
    await web.updater.softUpdate(R);
    expect(pwa.updateSW).toHaveBeenCalledWith(true);
  });

  it('SW chưa có bản mới ⇒ tải lại trang', async () => {
    const web = await loadWeb({ hadController: true });
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, reload }, configurable: true });
    await web.registerWeb({ onNeedRefresh: vi.fn(), onStaleTab: vi.fn() });
    pwa.opts?.onRegisteredSW?.('/sw.js', { update: async () => undefined, waiting: null, installing: null });
    await web.updater.forcedUpdate({ ...R, status: 'update_required' });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(pwa.updateSW).not.toHaveBeenCalled();
  });

  it('onNeedRefresh được chuyển lên engine', async () => {
    const web = await loadWeb({ hadController: true });
    const onNeedRefresh = vi.fn();
    await web.registerWeb({ onNeedRefresh, onStaleTab: vi.fn() });
    pwa.opts?.onNeedRefresh?.();
    expect(onNeedRefresh).toHaveBeenCalledTimes(1);
  });

  it('Review Focus 2: controllerchange ở tab KHÔNG bấm cập nhật ⇒ thẻ webReload', async () => {
    const web = await loadWeb({ hadController: true });
    const onStaleTab = vi.fn();
    await web.registerWeb({ onNeedRefresh: vi.fn(), onStaleTab });
    sw.dispatchEvent(new Event('controllerchange'));
    expect(onStaleTab).toHaveBeenCalledTimes(1);
  });

  it('tab tự bấm cập nhật thì không hiện thẻ; lần cài SW đầu tiên (chưa có controller) cũng không', async () => {
    const web = await loadWeb({ hadController: true });
    const onStaleTab = vi.fn();
    await web.registerWeb({ onNeedRefresh: vi.fn(), onStaleTab });
    pwa.opts?.onRegisteredSW?.('/sw.js', { update: async () => undefined, waiting: {}, installing: null });
    await web.updater.softUpdate(R);
    sw.dispatchEvent(new Event('controllerchange'));
    expect(onStaleTab).not.toHaveBeenCalled();

    const web2 = await loadWeb({ hadController: false });
    const stale2 = vi.fn();
    await web2.registerWeb({ onNeedRefresh: vi.fn(), onStaleTab: stale2 });
    sw.dispatchEvent(new Event('controllerchange'));
    expect(stale2).not.toHaveBeenCalled();
  });
});

describe('apk (tạm, Task 5)', () => {
  it('có downloadUrl ⇒ mở trang tải; không có ⇒ báo apkNoLink', async () => {
    const { updater } = await import('./apk');
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await updater.softUpdate({ ...R, channel: 'apk', downloadUrl: 'https://becutit.example/tai' }, mkHooks());
    expect(open).toHaveBeenCalledWith('https://becutit.example/tai', '_system');
    const hooks = mkHooks();
    await updater.forcedUpdate({ ...R, channel: 'apk' }, hooks);
    expect(hooks.setError).toHaveBeenCalledWith('apkNoLink');
  });

  it.each(['http://becutit.example/tai', 'javascript:alert(1)', 'intent://x#Intent;scheme=https;end', 'https://becutit.example@evil.example/x', 'khong phai url'])(
    'URL không an toàn không được mở, báo apkNoLink: %s',
    async (bad) => {
      const { updater } = await import('./apk');
      const open = vi.spyOn(window, 'open').mockImplementation(() => null);
      open.mockClear();
      const hooks = mkHooks();
      await updater.forcedUpdate({ ...R, channel: 'apk', downloadUrl: bad }, hooks);
      expect(open).not.toHaveBeenCalled();
      expect(hooks.setError).toHaveBeenCalledWith('apkNoLink');
    }
  );
});
