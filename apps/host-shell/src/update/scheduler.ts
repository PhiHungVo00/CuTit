import { AppVersionResponseSchema, type AppChannel, type AppVersionResponse } from '@vietlearning/contracts/api';
import { isBusy } from './busy';
import type { ApkCard, ChannelUpdater, UpdaterHooks } from './channel';
import { readState, writeState } from './state';
import type { UpdateErrorKey } from './updateI18n';

/**
 * Bộ điều phối kiểm/nhắc cập nhật (dự án 8, spec 5.5). Toàn bộ phụ thuộc ngoài (đồng hồ, mạng, fetch, âm thanh,
 * route, kênh) được tiêm qua `EngineDeps` để test bằng đồng hồ giả; `start.ts` ghép bản thật.
 *
 * Quy tắc cốt lõi:
 * - Kiểm lúc mở, khi quay lại màn hình, mỗi `checkAfterSec`; không hỏi lại < 30 phút (trừ khi có mạng lại / 426).
 * - "Bận" = đang dùng âm thanh HOẶC ở màn bài học/bài tập ⇒ giữ kết quả, KHÔNG hiện gì cho tới khi hết bận.
 * - Offline không bao giờ hiện màn chặn, chỉ dải nhỏ.
 */
export const MIN_RECHECK_MS = 30 * 60_000;
export const SNOOZE_MS = 3 * 86_400_000;
const FETCH_TIMEOUT_MS = 10_000;

export interface EngineDeps {
  /** Số build của bản đang chạy; <= 0 (bản dev) ⇒ không kiểm */
  build: number;
  channel: AppChannel;
  now(): number;
  isOnline(): boolean;
  baseUrl(): string;
  fetch: typeof fetch;
  isAudioBusy(): boolean;
  onAudioBusyChange(cb: (busy: boolean) => void): () => void;
  pauseSync(): void;
  resumeSync?(): void;
  loadUpdater(): Promise<ChannelUpdater>;
  getPath(): string;
}

export interface UpdateView {
  /** Response mới nhất (có thể là bản lưu từ lần trước); null nếu chưa từng hỏi được */
  response: AppVersionResponse | null;
  /** Màn che toàn bộ (có mạng, không bận) */
  forced: boolean;
  /** Dải nhỏ "Cần cập nhật khi có mạng" */
  forcedOffline: boolean;
  /** Thẻ nhắc mềm (update_available, chưa "Để sau", không bận) */
  soft: AppVersionResponse | null;
  /** Đang tải 0–100 (kênh báo) */
  progress: number | null;
  /** Tải xong, chờ người dùng bấm (Play: khởi động lại) */
  ready: (() => Promise<void>) | null;
  /** Chỉ kênh apk: thẻ hỏi dữ liệu di động / xin quyền cài / sẵn sàng cài / lỗi */
  card: ApkCard | null;
  /** SW web báo có bản mới / tab này lỡ bản mới */
  webReload: boolean;
  error: UpdateErrorKey | null;
}

export interface Engine {
  start(): () => void;
  check(opts?: { force?: boolean }): Promise<void>;
  forceRequired(info: { minBuild: number; channel: AppChannel }): void;
  setPath(path: string): void;
  snooze(): void;
  runSoft(): Promise<void>;
  runForced(): Promise<void>;
  markWebRefresh(): void;
  dismissWebRefresh(): void;
  dismissError(): void;
  /** Đóng thẻ APK (xin quyền/lỗi) — thẻ "sẵn sàng cài" dùng `snooze` */
  dismissCard(): void;
  getView(): UpdateView;
  subscribe(cb: () => void): () => void;
}

export function createEngine(deps: EngineDeps): Engine {
  let path = deps.getPath();
  let forcedBy426: number | null = null; // minBuild báo trong lỗi 426 (null = chưa nhận)
  let progress: number | null = null;
  let ready: (() => Promise<void>) | null = null;
  let webReload = false;
  let card: ApkCard | null = null;
  let error: UpdateErrorKey | null = null;
  /** Lần kiểm gần nhất hỏng vì mạng (timeout/không tới được Gateway, vd. cổng đăng nhập Wi-Fi): coi như offline */
  let networkFailed = false;
  let syncPaused = false;
  let lastFailAt = 0;
  let inflight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  let view!: UpdateView; // gán sau khi mọi hàm đã khai báo (tránh TDZ)

  const enabled = () => deps.build > 0;
  const busy = () => deps.isAudioBusy() || isBusy(path);

  function isRequired(r: AppVersionResponse | null): boolean {
    if (forcedBy426 !== null) return true;
    // Bản lưu cũ (app đã lên bản mới hơn) không được ép nữa
    return !!r && r.status === 'update_required' && deps.build < r.minBuild;
  }

  function compute(): UpdateView {
    const st = readState();
    const r = st.lastResponse;
    const req = isRequired(r);
    const online = deps.isOnline() && !networkFailed;
    const idle = !busy();
    const snoozed = !!r && st.snoozedBuild === r.latestBuild && deps.now() < st.snoozedUntil;
    const softOk = !!r && !req && r.status === 'update_available' && deps.build < r.latestBuild && !snoozed;
    return {
      response: r,
      forced: req && online && idle,
      forcedOffline: req && !online,
      soft: softOk && idle ? r : null,
      // Bản bắt buộc cũng hiện % tải (màn chặn); thẻ "sẵn sàng cài" tôn trọng "Để sau" như nhắc mềm
      progress: idle ? progress : null,
      ready: idle && !req ? ready : null,
      card: idle && card && (req || card.kind !== 'ready' || !snoozed) ? card : null,
      webReload: webReload && idle && !req,
      error
    };
  }

  function same(a: UpdateView, b: UpdateView): boolean {
    return (Object.keys(a) as (keyof UpdateView)[]).every((k) => a[k] === b[k]);
  }

  function evaluate(): void {
    const next = compute();
    if (next.forced && !syncPaused) {
      syncPaused = true;
      deps.pauseSync();
    } else if (!next.forced && !next.forcedOffline && syncPaused) {
      syncPaused = false;
      deps.resumeSync?.();
    }
    if (same(view, next)) return;
    view = next;
    for (const cb of [...listeners]) cb();
  }

  function arm(afterSec: number): void {
    clearTimeout(timer);
    timer = setTimeout(() => {
      // chỉ khi trang đang hiện (spec 5.5); lần kích hoạt kế (visible) sẽ kiểm bù
      if (document.visibilityState !== 'hidden') void check({ force: true });
      else arm(afterSec);
    }, afterSec * 1000);
  }

  async function fetchResponse(): Promise<AppVersionResponse | null> {
    const url = `${deps.baseUrl()}/v1/app/version?channel=${deps.channel}&build=${deps.build}`;
    const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(FETCH_TIMEOUT_MS) : undefined;
    const res = await deps.fetch(url, { signal, headers: { accept: 'application/json' } });
    networkFailed = false; // Gateway trả lời (kể cả lỗi HTTP) ⇒ có mạng
    if (!res.ok) return null; // 5xx/429: im lặng, thử lại ở lần kích hoạt kế
    const parsed = AppVersionResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  }

  async function doCheck(): Promise<void> {
    try {
      const r = await fetchResponse();
      if (!r) {
        lastFailAt = deps.now();
        return;
      }
      writeState({ lastCheckAt: deps.now(), lastResponse: r });
      if (r.status !== 'update_required') forcedBy426 = null; // Gateway đã hạ yêu cầu
      arm(r.checkAfterSec);
    } catch (e) {
      networkFailed = e instanceof TypeError || (e as { name?: string })?.name === 'TimeoutError' || (e as { name?: string })?.name === 'AbortError';
      lastFailAt = deps.now(); // mạng lỗi/timeout/JSON hỏng: im lặng
    }
  }

  function check(opts: { force?: boolean } = {}): Promise<void> {
    if (!enabled()) return Promise.resolve();
    if (inflight) return inflight;
    if (!deps.isOnline()) {
      evaluate();
      return Promise.resolve();
    }
    if (!opts.force && deps.now() - Math.max(readState().lastCheckAt, lastFailAt) < MIN_RECHECK_MS) {
      evaluate();
      maybePrepare(readState().lastResponse);
      return Promise.resolve();
    }
    inflight = doCheck().finally(() => {
      inflight = null;
      evaluate();
      maybePrepare(readState().lastResponse);
    });
    return inflight;
  }

  const hooks: UpdaterHooks = {
    setProgress(p) {
      progress = p;
      evaluate();
    },
    setReady(action) {
      ready = action;
      evaluate();
    },
    setError(key) {
      error = key;
      evaluate();
    },
    setCard(c) {
      card = c;
      evaluate();
    }
  };

  /** Kênh apk: tự tải ngầm bản mới (prepare lo chuyện chỉ làm một lần/build và giới hạn số lần lỗi) */
  function maybePrepare(r: AppVersionResponse | null): void {
    if (deps.channel !== 'apk' || !r || r.status !== 'update_available' || deps.build >= r.latestBuild) return;
    void deps
      .loadUpdater()
      .then((u) => u.prepare?.(r, hooks))
      .catch(() => undefined);
  }

  function fallbackResponse(): AppVersionResponse {
    return {
      channel: deps.channel,
      latestBuild: deps.build,
      latestVersion: '0.0.0',
      minBuild: forcedBy426 ?? deps.build + 1,
      status: 'update_required',
      notes: null,
      apkFile: null,
      downloadUrl: null,
      checkAfterSec: 21_600
    };
  }

  async function run(kind: 'softUpdate' | 'forcedUpdate'): Promise<void> {
    const r = readState().lastResponse ?? fallbackResponse();
    error = null;
    evaluate();
    try {
      const updater = await deps.loadUpdater();
      await updater[kind](r, hooks);
    } catch {
      /* mỗi kênh tự báo lỗi hiển thị qua hooks.setError; ở đây không để lỗi làm sập giao diện */
    }
  }

  view = compute();

  return {
    start() {
      if (!enabled()) return () => undefined;
      const onVisible = () => {
        if (document.visibilityState === 'visible') void check();
      };
      const onOnline = () => {
        evaluate();
        void check({ force: true });
      };
      const onOffline = () => evaluate();
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      const offAudio = deps.onAudioBusyChange(() => evaluate());
      evaluate();
      void check();
      return () => {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
        offAudio();
        clearTimeout(timer);
      };
    },
    check,
    forceRequired(info) {
      forcedBy426 = info.minBuild;
      networkFailed = false; // vừa nhận 426 từ Gateway ⇒ rõ ràng có mạng
      evaluate();
      void check({ force: true }); // lấy ghi chú/đường tải (nếu mạng cho phép)
    },
    setPath(p) {
      path = p;
      evaluate();
    },
    snooze() {
      const r = readState().lastResponse;
      if (r) writeState({ snoozedBuild: r.latestBuild, snoozedUntil: deps.now() + SNOOZE_MS });
      evaluate();
    },
    runSoft: () => run('softUpdate'),
    runForced: () => run('forcedUpdate'),
    markWebRefresh() {
      webReload = true;
      evaluate();
    },
    dismissWebRefresh() {
      webReload = false;
      evaluate();
    },
    dismissError() {
      error = null;
      evaluate();
    },
    dismissCard() {
      card = null;
      evaluate();
    },
    getView: () => view,
    subscribe(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    }
  };
}
