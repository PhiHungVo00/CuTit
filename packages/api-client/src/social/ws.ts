/**
 * Client WebSocket của Bạn bè (dự án 4, spec 5.6) — subpath `@vietlearning/api-client/social` (lười, KHÔNG vào gói đầu).
 *
 * - Xác thực bằng khung `hello` ngay khi mở (token lấy từ phiên hiện có, KHÔNG nằm trên URL, KHÔNG giữ ở đâu khác);
 *   `auth_expiring` => làm mới token rồi gửi `auth`.
 * - Mất kết nối => nối lại theo lùi cấp số nhân 1 s → 30 s có nhiễu; ra nền => đóng và KHÔNG hẹn giờ (đã có thông báo đẩy);
 *   trở lại nền trước => nối lại (cách nhau tối thiểu 1 s để ra/vào nền dồn dập không mở hàng loạt socket).
 * - Mã đóng: 4401 => làm mới và thử lại MỘT lần (lần nữa chưa kịp `hello_ok` => `signed_out`); 4403 => `restricted`;
 *   4426 => `update_required` (+ `onUpdateRequired` của dự án 8); mã khác => nối lại.
 * - Mọi khung nhận về đều qua `WsServerFrameSchema`; khung rác/quá 16 KB bị bỏ và đếm, không làm hỏng luồng.
 * - Đồng hồ sống còn: quá 60 s không nhận gì (server ping mỗi 25 s) => tự đóng và nối lại.
 */
import {
  WS_LIMITS,
  WsClientFrameSchema,
  WsCloseCode,
  WsServerFrameSchema,
  type WsClientFrame,
  type WsServerFrame
} from '@vietlearning/contracts/api';
import { gatewayConfig } from '../config.js';

export type RealtimeState = 'idle' | 'connecting' | 'online' | 'reconnecting';
export type RealtimeNotice = 'signed_out' | 'restricted' | 'update_required';

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}
export interface VisibilitySource {
  isVisible(): boolean;
  subscribe(cb: (visible: boolean) => void): () => void;
}
interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}
type WebSocketCtor = new (url: string) => WebSocketLike;

export interface RealtimeOptions {
  /** Mặc định suy từ baseUrl của Gateway (http→ws) + `/ws` */
  url?: string;
  WebSocket?: WebSocketCtor;
  scheduler?: Scheduler;
  visibility?: VisibilitySource;
  random?: () => number;
  build?: number;
  /** id thiết bị (uuid); mặc định mỗi client một id ngẫu nhiên */
  device?: string;
  getToken?: () => Promise<string | null>;
  /** Làm mới access token (Gateway 401 / `auth_expiring`); null => không làm mới được */
  refreshToken?: () => Promise<string | null>;
  onUpdateRequired?: (info: { minBuild: number; channel: 'web' | 'play' | 'apk' }) => void;
}

export const BACKOFF_MIN_MS = 1000;
export const BACKOFF_MAX_MS = 30_000;
/** Cách nhau tối thiểu giữa hai lần mở socket (chống nối lại dồn dập) */
export const MIN_OPEN_GAP_MS = 1000;
const HELLO_WAIT_MS = 10_000;
const MAX_SEND_PER_SEC = 25; // server đóng 4429 ở 30 khung/giây

export function backoffDelay(attempt: number, random: () => number): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** Math.min(attempt, 10));
  return Math.round(base * (0.5 + 0.5 * random()));
}

const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => Date.now()
};

function defaultVisibility(): VisibilitySource {
  return {
    isVisible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
    subscribe(cb) {
      if (typeof document === 'undefined') return () => {};
      const fn = () => cb(document.visibilityState !== 'hidden');
      document.addEventListener('visibilitychange', fn);
      return () => document.removeEventListener('visibilitychange', fn);
    }
  };
}

function wsUrlFromBase(base: string): string {
  return `${base.replace(/^http/i, 'ws').replace(/\/$/, '')}/ws`;
}

function randomId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const h = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, h);
}

export interface Realtime {
  readonly state: RealtimeState;
  connect(): void;
  close(): void;
  /** false khi chưa online hoặc gửi quá nhanh; ném lỗi nếu khung không hợp lệ theo contract */
  send(frame: WsClientFrame): boolean;
  on(cb: (frame: WsServerFrame) => void): () => void;
  onState(cb: (state: RealtimeState) => void): () => void;
  onNotice(cb: (notice: RealtimeNotice) => void): () => void;
  stats(): { invalid: number; opened: number };
}

export function createRealtime(opts: RealtimeOptions = {}): Realtime {
  const sched = opts.scheduler ?? defaultScheduler;
  const random = opts.random ?? Math.random;
  const device = opts.device ?? randomId();
  const visibility = opts.visibility ?? defaultVisibility();
  const cfg = () => gatewayConfig();
  const getToken = opts.getToken ?? (async () => (await cfg().getToken?.()) ?? null);
  const refreshToken =
    opts.refreshToken ??
    (async () => {
      const refresh = cfg().onUnauthorized;
      if (!refresh || !(await refresh())) return null;
      return (await cfg().getToken?.()) ?? null;
    });

  const frameListeners = new Set<(f: WsServerFrame) => void>();
  const stateListeners = new Set<(s: RealtimeState) => void>();
  const noticeListeners = new Set<(n: RealtimeNotice) => void>();
  const emit = <T>(set: Set<(v: T) => void>, v: T): void => {
    for (const cb of [...set]) {
      try {
        cb(v);
      } catch {
        /* lỗi của người nghe (giao diện) không được làm sập luồng */
      }
    }
  };

  let state: RealtimeState = 'idle';
  let wanted = false;
  let ws: WebSocketLike | null = null;
  let gen = 0; // đổi mỗi lần bỏ một socket => sự kiện muộn của socket cũ bị bỏ qua
  let attempt = 0;
  let refreshedInStreak = false;
  let lastOpenAt = -Infinity;
  let openTimer: unknown = null;
  let helloTimer: unknown = null;
  let watchdog: unknown = null;
  let unsubVisibility: (() => void) | null = null;
  const stats = { invalid: 0, opened: 0 };
  const sentAt: number[] = [];

  const setState = (next: RealtimeState): void => {
    if (state === next) return;
    state = next;
    emit(stateListeners, next);
  };
  const clearTimers = (): void => {
    if (openTimer != null) sched.clearTimeout(openTimer);
    if (helloTimer != null) sched.clearTimeout(helloTimer);
    if (watchdog != null) sched.clearTimeout(watchdog);
    openTimer = helloTimer = watchdog = null;
  };
  const armWatchdog = (): void => {
    if (watchdog != null) sched.clearTimeout(watchdog);
    watchdog = sched.setTimeout(() => handleLoss(), WS_LIMITS.pongTimeoutMs);
  };
  const dropSocket = (): void => {
    gen++;
    const old = ws;
    ws = null;
    clearTimers();
    if (old) {
      old.onopen = old.onmessage = old.onclose = old.onerror = null;
      try {
        old.close(1000);
      } catch {
        /* đã đóng */
      }
    }
  };
  const visible = (): boolean => visibility.isVisible();

  /** Mất kết nối (đứt, quá hạn hello/pong): bỏ socket, hẹn nối lại có lùi */
  function handleLoss(): void {
    dropSocket();
    if (!wanted || !visible()) {
      setState('idle');
      return;
    }
    const delay = backoffDelay(attempt, random);
    attempt++;
    setState('reconnecting');
    openTimer = sched.setTimeout(() => {
      openTimer = null;
      openSocket();
    }, delay);
  }

  function stopWith(notice?: RealtimeNotice): void {
    wanted = false;
    dropSocket();
    setState('idle');
    if (notice) emit(noticeListeners, notice);
  }

  function scheduleOpen(): void {
    if (openTimer != null) return;
    const gap = lastOpenAt + MIN_OPEN_GAP_MS - sched.now();
    if (gap <= 0) {
      openSocket();
      return;
    }
    setState('connecting');
    openTimer = sched.setTimeout(() => {
      openTimer = null;
      openSocket();
    }, gap);
  }

  function openSocket(): void {
    if (!wanted || !visible() || ws) return;
    const Ctor = opts.WebSocket ?? (globalThis.WebSocket as unknown as WebSocketCtor | undefined);
    if (!Ctor) {
      stopWith();
      return;
    }
    const myGen = ++gen;
    lastOpenAt = sched.now();
    stats.opened++;
    setState(attempt > 0 ? 'reconnecting' : 'connecting');
    let sock: WebSocketLike;
    try {
      sock = new Ctor(opts.url ?? wsUrlFromBase(cfg().baseUrl));
    } catch {
      handleLoss();
      return;
    }
    ws = sock;
    helloTimer = sched.setTimeout(() => {
      if (myGen === gen) handleLoss();
    }, HELLO_WAIT_MS);

    sock.onopen = () => {
      if (myGen !== gen) return;
      void (async () => {
        let token: string | null = null;
        try {
          token = await getToken();
        } catch {
          // không lấy được token (thường là mất mạng) => như đứt kết nối
          if (myGen === gen) handleLoss();
          return;
        }
        if (myGen !== gen) return;
        if (!token) return stopWith('signed_out');
        const hello = { t: 'hello', v: 1, token, build: opts.build ?? cfg().appBuild ?? 0, device };
        try {
          sock.send(JSON.stringify(hello));
        } catch {
          handleLoss();
        }
      })();
    };
    sock.onmessage = (ev) => {
      if (myGen !== gen) return;
      onData(ev.data, sock, myGen);
    };
    sock.onerror = () => {
      /* onclose sẽ tới ngay sau; xử lý ở đó */
    };
    sock.onclose = (ev) => {
      if (myGen !== gen) return;
      onClosed(ev.code);
    };
  }

  function onData(data: unknown, sock: WebSocketLike, myGen: number): void {
    if (typeof data !== 'string' || data.length > WS_LIMITS.frameMaxBytes) {
      stats.invalid++;
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      stats.invalid++;
      return;
    }
    const parsed = WsServerFrameSchema.safeParse(json);
    if (!parsed.success) {
      stats.invalid++;
      return;
    }
    const frame = parsed.data;
    if (state !== 'online' && frame.t !== 'hello_ok') {
      stats.invalid++; // khung trước khi xác thực xong: không hợp lệ
      return;
    }
    if (watchdog != null || frame.t === 'hello_ok') armWatchdog();
    switch (frame.t) {
      case 'hello_ok':
        if (helloTimer != null) sched.clearTimeout(helloTimer);
        helloTimer = null;
        attempt = 0;
        refreshedInStreak = false;
        setState('online');
        try {
          sock.send(JSON.stringify({ t: 'visibility', foreground: true }));
        } catch {
          /* socket đóng giữa chừng: onclose lo */
        }
        break;
      case 'ping':
        try {
          sock.send(JSON.stringify({ t: 'pong' }));
        } catch {
          /* như trên */
        }
        break;
      case 'auth_expiring':
        void (async () => {
          let token: string | null = null;
          try {
            token = await refreshToken();
          } catch {
            return; // mất mạng: server sẽ đóng 4401 khi quá hạn, đường 4401 xử lý tiếp
          }
          if (myGen !== gen || !token) return;
          try {
            sock.send(JSON.stringify({ t: 'auth', token }));
          } catch {
            /* như trên */
          }
        })();
        break;
      default:
        break;
    }
    emit(frameListeners, frame);
  }

  function onClosed(code: number): void {
    dropSocket();
    if (!wanted) {
      setState('idle');
      return;
    }
    if (code === WsCloseCode.forbidden) return stopWith('restricted');
    if (code === WsCloseCode.updateRequired) {
      const c = cfg();
      stopWith('update_required');
      // Khung đóng không mang `minBuild`; báo "cần cập nhật" cho màn bắt buộc của dự án 8 (nó chỉ cần kích hoạt)
      try {
        (opts.onUpdateRequired ?? c.onUpdateRequired)?.({ minBuild: (opts.build ?? c.appBuild ?? 0) + 1, channel: c.appChannel ?? 'web' });
      } catch {
        /* giao diện lỗi không lan ra */
      }
      return;
    }
    if (code === WsCloseCode.unauthorized) {
      if (refreshedInStreak) return stopWith('signed_out');
      refreshedInStreak = true;
      setState('reconnecting');
      const myGen = gen;
      void (async () => {
        let token: string | null = null;
        try {
          token = await refreshToken();
        } catch {
          token = null;
          if (myGen === gen && wanted) return handleLoss(); // mất mạng khi làm mới: thử lại có lùi
          return;
        }
        if (myGen !== gen || !wanted) return;
        if (!token) return stopWith('signed_out');
        openSocket(); // token mới đã vào kho phiên; hello sẽ lấy lại bằng getToken
      })();
      return;
    }
    handleLoss();
  }

  function onVisibility(v: boolean): void {
    if (!wanted) return;
    if (!v) {
      dropSocket();
      attempt = 0;
      setState('idle');
      return;
    }
    if (!ws && openTimer == null) scheduleOpen();
  }

  return {
    get state() {
      return state;
    },
    connect() {
      wanted = true;
      if (!unsubVisibility) unsubVisibility = visibility.subscribe(onVisibility);
      if (!visible()) return; // trở lại nền trước sẽ nối
      if (!ws && openTimer == null) scheduleOpen();
    },
    close() {
      wanted = false;
      unsubVisibility?.();
      unsubVisibility = null;
      attempt = 0;
      dropSocket();
      setState('idle');
    },
    send(frame) {
      const parsed = WsClientFrameSchema.parse(frame);
      const now = sched.now();
      while (sentAt.length && now - sentAt[0]! >= 1000) sentAt.shift();
      if (!ws || state !== 'online' || sentAt.length >= MAX_SEND_PER_SEC) return false;
      try {
        ws.send(JSON.stringify(parsed));
      } catch {
        return false;
      }
      sentAt.push(now);
      return true;
    },
    on(cb) {
      frameListeners.add(cb);
      return () => frameListeners.delete(cb);
    },
    onState(cb) {
      stateListeners.add(cb);
      return () => stateListeners.delete(cb);
    },
    onNotice(cb) {
      noticeListeners.add(cb);
      return () => noticeListeners.delete(cb);
    },
    stats: () => ({ ...stats })
  };
}
