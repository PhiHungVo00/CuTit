import type { RawData } from 'ws';
import { WS_LIMITS, WsCloseCode, type AppChannel, type WsClientFrame, type WsServerFrame } from '@vietlearning/contracts/api';
import type { RealtimeBus } from './RealtimeBus.js';
import type { WsVerifyResult } from './auth.js';
import { WsClose, encodeServerFrame, parseClientFrame } from './frames.js';
import type { RealtimeDirectory } from './presence.js';

/** Phần của `ws.WebSocket` mà hub dùng (để test bằng socket giả). */
export interface WsSocketLike {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: string, cb?: (err?: Error) => void): void;
  close(code?: number, reason?: string): void;
  terminate(): void;
  on(event: 'message', fn: (data: RawData, isBinary: boolean) => void): unknown;
  on(event: 'close', fn: () => void): unknown;
  on(event: 'error', fn: (err: Error) => void): unknown;
}

const OPEN = 1;
/** Báo `auth_expiring` trước hạn token chừng này (spec 5.6) */
const AUTH_EXPIRING_BEFORE_MS = 60_000;
/** Chờ bắt tay đóng chừng này rồi ngắt hẳn (peer chết không trả lời close) */
const CLOSE_GRACE_MS = 2_000;
/** "đang gõ": chuyển tiếp tối đa 1 khung / khoảng này cho mỗi (kết nối, cuộc trò chuyện) */
const TYPING_MIN_INTERVAL_MS = 2_000;

export interface RealtimeOptions {
  /** Kiểm token + điều kiện chat (`createWsVerifier`) */
  verify: (token: string) => Promise<WsVerifyResult>;
  directory: RealtimeDirectory;
  /** false ⇒ đóng 4426 */
  buildAllowed: (build: number, channel: AppChannel | undefined) => boolean;
  /** Test tiêm đồng hồ; mặc định `Date.now` */
  now?: () => number;
  limits?: Partial<{ [K in keyof typeof WS_LIMITS]: number }>;
  /** Chu kỳ quét (ping/hết hạn/im lặng); 0 = không tự quét (test gọi `sweep()`) */
  sweepMs?: number;
  log?: { warn: (o: object, msg: string) => void };
}

type ConnState = 'hello' | 'ready' | 'closed';

interface Conn {
  readonly socket: WsSocketLike;
  readonly channel: AppChannel | undefined;
  state: ConnState;
  userId: string | null;
  device: string | null;
  tokenExpMs: number;
  expiringSent: boolean;
  foreground: boolean;
  /** có một lượt hello/auth đang chờ DB — khung kế tiếp cùng loại bị coi là vi phạm */
  busy: boolean;
  readonly connectedAt: number;
  lastRxAt: number;
  nextPingAt: number;
  rateBucket: number;
  rateCount: number;
  readonly typingAt: Map<string, number>;
}

/**
 * Bộ phát tin trong tiến trình (spec 5.6). Một instance Gateway. Không lộ cấu trúc bên trong: mọi thứ qua `RealtimeBus`
 * cộng vài hàm vận hành (`closeUser`, `closeAll`, `sweep`). WebSocket KHÔNG là nguồn sự thật: mất khung thì client bù bằng REST.
 */
export class RealtimeHub implements RealtimeBus {
  private readonly byUser = new Map<string, Set<Conn>>();
  private readonly listeners = new Set<(userIds: readonly string[], frame: WsServerFrame) => void>();
  private readonly limits: typeof WS_LIMITS & Record<string, number>;
  private readonly now: () => number;
  private timer: NodeJS.Timeout | undefined;
  private clientFrameHandler: ((userId: string, frame: WsClientFrame) => void) | undefined;
  private disposed = false;
  /** userId → lúc gọi `closeUser` gần nhất (giữ ~30 giây): chặn hello đang chờ DB đăng ký sau khi quyền đã bị thu hồi */
  private readonly revokedAt = new Map<string, number>();

  constructor(private readonly opts: RealtimeOptions) {
    this.now = opts.now ?? Date.now;
    this.limits = { ...WS_LIMITS, ...opts.limits } as typeof this.limits;
    const every = opts.sweepMs ?? 1000;
    if (every > 0) {
      this.timer = setInterval(() => this.sweep(), every);
      this.timer.unref();
    }
  }

  // ---------------------------------------------------------------- RealtimeBus

  publish(userIds: readonly string[], frame: WsServerFrame): void {
    try {
      const unique = [...new Set(userIds)];
      const data = encodeServerFrame(frame);
      for (const id of unique) {
        const conns = this.byUser.get(id);
        if (!conns) continue;
        for (const c of [...conns]) this.send(c, data);
      }
      for (const fn of [...this.listeners]) {
        try {
          fn(unique, frame);
        } catch (err) {
          this.opts.log?.warn({ err }, 'ws: người nghe bus lỗi');
        }
      }
    } catch (err) {
      this.opts.log?.warn({ err }, 'ws: publish lỗi');
    }
  }

  subscribe(fn: (userIds: readonly string[], frame: WsServerFrame) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Số kết nối đang mở (kể cả chưa hello) — vận hành/test */
  get connectionCount(): number {
    return this.all.size;
  }

  isOnline(userId: string): boolean {
    return (this.byUser.get(userId)?.size ?? 0) > 0;
  }

  isForeground(userId: string): boolean {
    for (const c of this.byUser.get(userId) ?? []) if (c.foreground) return true;
    return false;
  }

  // ---------------------------------------------------------------- vận hành

  /** Thu hồi quyền (khóa chat, xóa tài khoản, đăng xuất mọi máy): đóng MỌI kết nối của người đó ngay. */
  closeUser(userId: string, code: number = WsCloseCode.forbidden, reason = 'revoked'): void {
    const now = this.now();
    this.revokedAt.set(userId, now);
    for (const [id, at] of this.revokedAt) if (now - at > 30_000) this.revokedAt.delete(id);
    for (const c of [...(this.byUser.get(userId) ?? [])]) this.closeConn(c, code, reason);
  }

  /** Tắt Gateway: đóng mọi kết nối (kể cả chưa hello). */
  closeAll(code: number = WsClose.goingAway, reason = 'server_shutdown'): void {
    for (const c of [...this.all]) this.closeConn(c, code, reason);
  }

  /** Dừng bộ hẹn giờ (gọi khi tắt app). */
  dispose(): void {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.closeAll();
  }

  /** Việc theo thời gian: hết hạn hello, ping, im lặng quá hạn pong, báo/hết hạn token. Test gọi tay với đồng hồ giả. */
  sweep(): void {
    const now = this.now();
    for (const c of [...this.all]) {
      try {
        if (c.state === 'hello') {
          if (now - c.connectedAt >= this.limits.helloTimeoutMs) this.closeConn(c, WsCloseCode.unauthorized, 'hello_timeout');
          continue;
        }
        if (c.state !== 'ready') continue;
        if (now >= c.tokenExpMs) {
          this.closeConn(c, WsCloseCode.unauthorized, 'token_expired');
          continue;
        }
        if (now - c.lastRxAt > this.limits.pongTimeoutMs) {
          this.closeConn(c, WsClose.timeout, 'pong_timeout');
          continue;
        }
        if (!c.expiringSent && c.tokenExpMs - now <= AUTH_EXPIRING_BEFORE_MS) {
          c.expiringSent = true;
          this.send(c, encodeServerFrame({ t: 'auth_expiring', inSec: Math.max(0, Math.ceil((c.tokenExpMs - now) / 1000)) }));
        }
        if (now >= c.nextPingAt) {
          c.nextPingAt = now + this.limits.pingMs;
          this.send(c, encodeServerFrame({ t: 'ping' }));
        }
      } catch (err) {
        this.opts.log?.warn({ err }, 'ws: sweep lỗi một kết nối');
      }
    }
  }

  /** Đăng ký xử lý khung `call.*` của client (Task 13). Mặc định bỏ qua. */
  onClientFrame(fn: (userId: string, frame: WsClientFrame) => void): void {
    this.clientFrameHandler = fn;
  }

  // ---------------------------------------------------------------- kết nối

  private readonly all = new Set<Conn>();

  /** Nhận một socket mới (đã bắt tay HTTP). Chưa xác thực: chỉ chấp nhận `hello` trong 5 giây. Không bao giờ ném lỗi. */
  attach(socket: WsSocketLike, ctx: { channel?: AppChannel }): void {
    const now = this.now();
    const conn: Conn = {
      socket,
      channel: ctx.channel,
      state: 'hello',
      userId: null,
      device: null,
      tokenExpMs: 0,
      expiringSent: false,
      foreground: false,
      busy: false,
      connectedAt: now,
      lastRxAt: now,
      nextPingAt: now + this.limits.pingMs,
      rateBucket: Math.floor(now / 1000),
      rateCount: 0,
      typingAt: new Map()
    };
    if (this.disposed) {
      this.closeConn(conn, WsClose.goingAway, 'server_shutdown');
      return;
    }
    this.all.add(conn);
    socket.on('message', (data, isBinary) => {
      this.onMessage(conn, data, isBinary).catch((err: unknown) => {
        this.opts.log?.warn({ err }, 'ws: lỗi xử lý khung');
        this.closeConn(conn, 1011, 'internal_error');
      });
    });
    socket.on('close', () => this.onClosed(conn));
    socket.on('error', () => {
      // lỗi socket (khung quá lớn, đứt giữa chừng…): `close` sẽ tới sau; chỉ cần không để thành ngoại lệ chưa bắt
      this.terminate(conn);
    });
  }

  private async onMessage(conn: Conn, data: RawData, isBinary: boolean): Promise<void> {
    if (conn.state === 'closed') return;
    const now = this.now();
    const bucket = Math.floor(now / 1000);
    if (bucket !== conn.rateBucket) {
      conn.rateBucket = bucket;
      conn.rateCount = 0;
    }
    conn.rateCount += 1;
    if (conn.rateCount > this.limits.framesPerSec) {
      this.closeConn(conn, WsCloseCode.tooManyFrames, 'too_many_frames');
      return;
    }
    const parsed = parseClientFrame(data, isBinary, this.limits.frameMaxBytes);
    if (!parsed.ok) {
      // trước khi xác thực mọi khung sai đều là 4401 (không nói thêm gì cho người chưa xác thực)
      this.closeConn(conn, conn.state === 'hello' ? WsCloseCode.unauthorized : parsed.code, parsed.reason);
      return;
    }
    const frame = parsed.frame;
    conn.lastRxAt = now;

    if (conn.state === 'hello') {
      if (frame.t !== 'hello' || conn.busy) {
        this.closeConn(conn, WsCloseCode.unauthorized, 'hello_required');
        return;
      }
      await this.onHello(conn, frame);
      return;
    }

    switch (frame.t) {
      case 'hello':
        this.closeConn(conn, WsClose.policy, 'already_authenticated');
        return;
      case 'auth':
        if (conn.busy) {
          this.closeConn(conn, WsClose.policy, 'auth_in_progress');
          return;
        }
        await this.onAuth(conn, frame.token);
        return;
      case 'pong':
        return;
      case 'visibility':
        conn.foreground = frame.foreground;
        return;
      case 'typing':
        await this.onTyping(conn, frame.cid, now);
        return;
      default:
        // call.* (Task 13); lỗi trong handler không được làm hỏng kết nối khác
        if (conn.userId && this.clientFrameHandler) {
          try {
            this.clientFrameHandler(conn.userId, frame);
          } catch (err) {
            this.opts.log?.warn({ err }, 'ws: handler khung call lỗi');
          }
        }
    }
  }

  private async onHello(conn: Conn, frame: Extract<WsClientFrame, { t: 'hello' }>): Promise<void> {
    conn.busy = true;
    const startedAt = this.now();
    let result: WsVerifyResult;
    try {
      result = await this.opts.verify(frame.token);
    } finally {
      conn.busy = false;
    }
    if (conn.state === 'closed') return; // đứt/hết hạn trong lúc chờ
    if (!result.ok) {
      this.closeConn(conn, result.code, result.reason);
      return;
    }
    if (!this.opts.buildAllowed(frame.build, conn.channel)) {
      this.closeConn(conn, WsCloseCode.updateRequired, 'update_required');
      return;
    }
    if ((this.revokedAt.get(result.userId) ?? -1) >= startedAt) {
      this.closeConn(conn, WsCloseCode.forbidden, 'revoked');
      return;
    }
    this.register(conn, result.userId, frame.device, result.expMs);
    const now = this.now();
    this.send(
      conn,
      encodeServerFrame({
        t: 'hello_ok',
        serverTime: new Date(now).toISOString(),
        expSec: Math.max(1, Math.floor((result.expMs - now) / 1000))
      })
    );
  }

  private async onAuth(conn: Conn, token: string): Promise<void> {
    conn.busy = true;
    let result: WsVerifyResult;
    try {
      result = await this.opts.verify(token);
    } finally {
      conn.busy = false;
    }
    if (conn.state === 'closed') return;
    if (!result.ok) {
      this.closeConn(conn, result.code, result.reason);
      return;
    }
    if (result.userId !== conn.userId) {
      this.closeConn(conn, WsCloseCode.forbidden, 'user_mismatch');
      return;
    }
    conn.tokenExpMs = result.expMs;
    conn.expiringSent = false;
  }

  /** Đồng bộ (không await): giới hạn kết nối/người đúng dù nhiều hello về cùng lúc. */
  private register(conn: Conn, userId: string, device: string, expMs: number): void {
    let set = this.byUser.get(userId);
    const wasOnline = (set?.size ?? 0) > 0;
    if (!set) {
      set = new Set();
      this.byUser.set(userId, set);
    }
    conn.state = 'ready';
    conn.userId = userId;
    conn.device = device;
    conn.tokenExpMs = expMs;
    set.add(conn);
    // cùng thiết bị nối lại: bỏ cái cũ (đã thêm cái mới TRƯỚC để người dùng không "rơi" offline giữa chừng)
    for (const other of [...set]) if (other !== conn && other.device === device) this.closeConn(other, WsClose.replaced, 'replaced');
    // quá giới hạn: đóng cái cũ nhất (Set giữ thứ tự thêm)
    while (set.size > this.limits.connectionsPerUser) {
      const oldest = set.values().next().value as Conn;
      this.closeConn(oldest, WsClose.replaced, 'too_many_connections');
    }
    if (!wasOnline) this.announcePresence(userId, true);
  }

  private async onTyping(conn: Conn, cid: string, now: number): Promise<void> {
    const last = conn.typingAt.get(cid);
    if (last !== undefined && now - last < TYPING_MIN_INTERVAL_MS) return;
    // ghi mốc TRƯỚC khi await: nhiều khung typing tới liền nhau không cùng lọt qua bộ giãn
    if (conn.typingAt.size > 200) conn.typingAt.clear();
    conn.typingAt.set(cid, now);
    const userId = conn.userId;
    if (!userId) return;
    try {
      const audience = await this.opts.directory.typingAudience(userId, cid);
      if (audience.length > 0 && conn.state === 'ready') this.publish(audience, { t: 'typing', cid, userId });
    } catch (err) {
      this.opts.log?.warn({ err }, 'ws: typing lỗi');
    }
  }

  private announcePresence(userId: string, online: boolean): void {
    this.opts.directory
      .presenceAudience(userId)
      .then((audience) => {
        // trạng thái đã đổi trong lúc truy vấn (nối rồi ngắt nhanh) thì bỏ khung cũ
        if (audience.length > 0 && this.isOnline(userId) === online) this.publish(audience, { t: 'presence', userId, online });
      })
      .catch((err: unknown) => this.opts.log?.warn({ err }, 'ws: presence lỗi'));
  }

  private onClosed(conn: Conn): void {
    const wasReady = conn.state === 'ready';
    conn.state = 'closed';
    this.all.delete(conn);
    const userId = conn.userId;
    if (!wasReady && !userId) return;
    this.removeFromUser(conn);
  }

  private removeFromUser(conn: Conn): void {
    const userId = conn.userId;
    if (!userId) return;
    const set = this.byUser.get(userId);
    if (!set || !set.delete(conn)) return;
    if (set.size === 0) {
      this.byUser.delete(userId);
      this.announcePresence(userId, false);
    }
  }

  // ---------------------------------------------------------------- gửi / đóng

  private send(conn: Conn, data: string): void {
    if (conn.state === 'closed' || conn.socket.readyState !== OPEN) return;
    if (conn.socket.bufferedAmount > this.limits.sendBufferMax) {
      this.closeConn(conn, WsClose.slowConsumer, 'slow_consumer');
      return;
    }
    try {
      conn.socket.send(data, (err) => {
        if (err) this.terminate(conn);
      });
    } catch {
      this.terminate(conn);
    }
  }

  /** Đóng một kết nối: ngừng nhận/gửi ngay (rời `byUser` ngay để thu hồi có hiệu lực tức thì), ngắt hẳn nếu peer không đóng. */
  private closeConn(conn: Conn, code: number, reason: string): void {
    if (conn.state === 'closed') return;
    const wasReady = conn.state === 'ready';
    conn.state = 'closed';
    this.all.delete(conn);
    if (wasReady) this.removeFromUser(conn);
    try {
      conn.socket.close(code, reason.slice(0, 100));
    } catch {
      this.terminate(conn);
      return;
    }
    const t = setTimeout(() => this.terminate(conn), CLOSE_GRACE_MS);
    t.unref();
  }

  private terminate(conn: Conn): void {
    try {
      conn.socket.terminate();
    } catch {
      // đã đóng
    }
    if (conn.state !== 'closed') {
      conn.state = 'closed';
      this.all.delete(conn);
      this.removeFromUser(conn);
    }
  }
}
