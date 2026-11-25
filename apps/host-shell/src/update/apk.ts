import type { AppVersionResponse } from '@vietlearning/contracts/api';
import type { ApkUpdaterPlugin } from '@vietlearning/native/apk-updater';
import type { ApkCard, ChannelUpdater, UpdaterHooks } from './channel';
import { safeHttpsUrl } from './safeUrl';

/**
 * Kênh APK cài tay (dự án 8, Task 7, spec 5.5a): tự tải ngầm khi có Wi-Fi, hỏi khi dùng dữ liệu di động,
 * xin quyền "nguồn không xác định" chỉ khi người dùng bấm, đẩy đồng bộ ≤ 3 s rồi cài qua cầu nối native `ApkUpdater`.
 * Mọi phụ thuộc đi qua `ApkDeps` để test bằng plugin giả; bản thật nạp plugin lười (chỉ khi kênh = apk).
 */
export const MAX_AUTO_FAILS = 3;
const FAIL_KEY = 'becutit.apkFail';

export interface ApkDeps {
  plugin(): Promise<ApkUpdaterPlugin>;
  /** Đẩy hàng đợi đồng bộ một lần; có thể treo/lỗi (đã bọc giới hạn thời gian ở dưới) */
  flushSync(): Promise<unknown>;
  isMetered(): boolean;
  openUrl(url: string): void;
  /** Gọi `cb` mỗi khi app quay lại (từ Cài đặt Android); trả hàm gỡ */
  onResume(cb: () => void): () => void;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  flushLimitMs?: number;
}

type FailRec = { build: number; count: number };

export function createApkFlow(d: ApkDeps): ChannelUpdater {
  let hooks: UpdaterHooks | undefined;
  let resp: AppVersionResponse | null = null;
  let mode: 'soft' | 'forced' = 'soft';
  let showProgress = false;
  let downloaded: number | null = null; // build đã tải + kiểm xong
  let prepared: number | null = null; // build đã được tự tải trong phiên này
  let listening = false;
  let installing = false;
  let awaitingAllow = false;
  let offResume: (() => void) | null = null;

  const store = (): Pick<Storage, 'getItem' | 'setItem'> | undefined => {
    try {
      return d.storage ?? localStorage;
    } catch {
      return undefined;
    }
  };
  function fails(build: number): number {
    try {
      const v = JSON.parse(store()?.getItem(FAIL_KEY) ?? 'null') as FailRec | null;
      return v && v.build === build && typeof v.count === 'number' ? v.count : 0;
    } catch {
      return 0;
    }
  }
  function bumpFail(build: number): void {
    try {
      store()?.setItem(FAIL_KEY, JSON.stringify({ build, count: fails(build) + 1 } satisfies FailRec));
    } catch {
      /* không ghi được: vẫn chạy trong phiên */
    }
  }

  const card = (c: ApkCard | null) => hooks?.setCard?.(c);
  const codeOf = (e: unknown) => (e as { code?: string })?.code;

  function openPage(): (() => void) | null {
    const url = safeHttpsUrl(resp?.downloadUrl);
    return url ? () => d.openUrl(url) : null;
  }

  function showReady(): void {
    if (!resp) return;
    card({ kind: 'ready', version: resp.latestVersion, install });
  }

  function fail(build: number, count = true): void {
    if (count) bumpFail(build);
    awaitingAllow = false;
    showProgress = false;
    hooks?.setProgress(null);
    card({
      kind: 'failed',
      retry: () => (mode === 'forced' ? forcedUpdate(resp!, hooks) : softUpdate(resp!, hooks)),
      openPage: openPage()
    });
  }

  async function ensureListeners(p: ApkUpdaterPlugin): Promise<void> {
    if (listening) return;
    listening = true;
    await p.addListener('downloadProgress', ({ percent }) => {
      if (showProgress) hooks?.setProgress(Math.min(100, Math.max(0, Math.round(percent))));
    });
    await p.addListener('downloadState', (s) => {
      if (!resp) return;
      if (s.state === 'done') void onDownloaded();
      else fail(resp.latestBuild);
    });
    await p.addListener('installStatus', (s) => {
      if (!resp) return;
      installing = false;
      if (s.status === 'cancelled') card(mode === 'forced' ? null : { kind: 'ready', version: resp.latestVersion, install });
      else if (s.status === 'failed') fail(resp.latestBuild, false);
    });
  }

  async function onDownloaded(): Promise<void> {
    if (!resp) return;
    downloaded = resp.latestBuild;
    showProgress = false;
    hooks?.setProgress(null);
    if (mode === 'forced') await install();
    else showReady();
  }

  async function startDownload(allowMetered: boolean, show: boolean): Promise<void> {
    const r = resp;
    const file = r?.apkFile;
    const url = safeHttpsUrl(file?.url);
    if (!r || !file || !url) return fail(r?.latestBuild ?? 0, false);
    showProgress = show;
    card(null);
    if (show) hooks?.setProgress(0);
    try {
      const p = await d.plugin();
      await ensureListeners(p);
      const res = await p.download({ url, sha256: file.sha256, sizeBytes: file.sizeBytes, build: r.latestBuild, allowMetered });
      if (res.state === 'done') await onDownloaded();
    } catch {
      fail(r.latestBuild);
    }
  }

  function waitResume(p: ApkUpdaterPlugin): void {
    awaitingAllow = true;
    offResume ??= d.onResume(() => {
      if (!awaitingAllow) return;
      void p
        .canInstall()
        .then(({ allowed }) => {
          if (!allowed || !awaitingAllow) return; // vẫn chưa bật: để nguyên thẻ, KHÔNG tự mở Cài đặt lại
          awaitingAllow = false;
          if (mode === 'forced') void install();
          else showReady();
        })
        .catch(() => undefined);
    });
  }

  async function install(): Promise<void> {
    const r = resp;
    if (!r || installing) return;
    installing = true;
    try {
      const p = await d.plugin();
      await ensureListeners(p);
      if (!(await p.canInstall()).allowed) {
        installing = false;
        card({ kind: 'allow', openSettings: () => p.openInstallSettings() });
        waitResume(p);
        return;
      }
      awaitingAllow = false;
      await flushWithLimit();
      card(null);
      await p.install({ build: r.latestBuild });
      // Android hiện hộp xác nhận; kết quả tới qua sự kiện installStatus
    } catch (e) {
      installing = false;
      fail(r.latestBuild, codeOf(e) === 'verify_failed' ? false : true);
    }
  }

  /** Tối đa `flushLimitMs` (3 s): dữ liệu vẫn nằm trong bộ nhớ máy, sống qua cập nhật, nên không chờ lâu hơn */
  function flushWithLimit(): Promise<void> {
    return new Promise<void>((resolve) => {
      const t = setTimeout(resolve, d.flushLimitMs ?? 3000);
      d.flushSync().then(
        () => (clearTimeout(t), resolve()),
        () => (clearTimeout(t), resolve())
      );
    });
  }

  function noFile(r: AppVersionResponse): boolean {
    if (r.apkFile) return false;
    const url = safeHttpsUrl(r.downloadUrl);
    if (url) d.openUrl(url);
    else hooks?.setError('apkNoLink');
    return true;
  }

  function init(r: AppVersionResponse, h: UpdaterHooks | undefined, m: 'soft' | 'forced'): void {
    resp = r;
    hooks = h;
    mode = m;
  }

  async function softUpdate(r: AppVersionResponse, h?: UpdaterHooks): Promise<void> {
    init(r, h, 'soft');
    if (noFile(r)) return;
    if (downloaded === r.latestBuild) return install();
    if (d.isMetered()) {
      const sizeMb = Math.max(1, Math.round((r.apkFile?.sizeBytes ?? 0) / 1_048_576));
      card({ kind: 'metered', sizeMb, downloadNow: () => startDownload(true, true), waitWifi: () => card(null) });
      return;
    }
    return startDownload(false, true);
  }

  async function forcedUpdate(r: AppVersionResponse, h?: UpdaterHooks): Promise<void> {
    init(r, h, 'forced');
    if (noFile(r)) return;
    if (downloaded === r.latestBuild) return install();
    return startDownload(true, true); // bắt buộc: bỏ điều kiện Wi-Fi sau khi người dùng bấm
  }

  async function prepare(r: AppVersionResponse, h?: UpdaterHooks): Promise<void> {
    if (!r.apkFile || r.status !== 'update_available') return;
    if (prepared === r.latestBuild || fails(r.latestBuild) >= MAX_AUTO_FAILS) return;
    prepared = r.latestBuild;
    init(r, h, 'soft');
    try {
      await (await d.plugin()).cleanup(); // dọn APK cũ (≤ bản đang chạy)
    } catch {
      /* dọn không được cũng không sao */
    }
    return startDownload(false, false);
  }

  return { softUpdate, forcedUpdate, prepare };
}

/** Bản thật: plugin và đồng bộ đều nạp lười; chỉ chunk này (kênh apk) mới đụng tới */
export const updater: ChannelUpdater = createApkFlow({
  plugin: async () => (await import('@vietlearning/native/apk-updater')).ApkUpdater,
  flushSync: async () => (await import('@vietlearning/state/sync')).getSyncEngine()?.flush(),
  isMetered: () => {
    const c = (navigator as { connection?: { type?: string; saveData?: boolean } }).connection;
    return c?.type === 'cellular' || c?.saveData === true;
  },
  // `_system`: Capacitor mở bằng trình duyệt ngoài
  openUrl: (url) => void window.open(url, '_system'),
  onResume: (cb) => {
    const h = () => document.visibilityState === 'visible' && cb();
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }
});
