import { createHmac } from 'node:crypto';
import { lt } from 'drizzle-orm';
import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import { schema, type Db, type DbProvider } from '../../db/client.js';

/**
 * Nhật ký sự kiện bảo mật/quản trị (bảng `audit_events`) — slide vibecoder mục 04/08:
 * “cần có log để biết mình bị lộ” (báo cơ quan chuyên trách trong 72 giờ, docs/van-hanh/SU-CO-LO-DU-LIEU.md).
 *
 * - CHỈ THÊM dòng mới; không sửa dòng cũ (trừ ẩn danh hóa khi xóa tài khoản: FK ON DELETE SET NULL).
 * - Ghi bất đồng bộ: `record()` trả về ngay, request không chờ DB; lỗi ghi chỉ thành cảnh báo trong log.
 * - Không lưu IP thô (HMAC-SHA256 có muối AUDIT_IP_SALT), user-agent rút gọn, metadata theo danh sách trắng
 *   từng loại sự kiện => không lọt token, mã khôi phục, mã mời, dữ liệu học hay id người khác.
 * - Sự kiện có thể tới dồn dập (rate limit, token sai) được gộp: tối đa một dòng mỗi IP mỗi cửa sổ.
 */

export const AUDIT_RETENTION_DAYS = 180;
/** Gộp sự kiện dồn dập: cửa sổ 10 phút; ≥ 5 lỗi xác thực trong cửa sổ => một dòng auth.failure_burst */
export const AUDIT_BURST_WINDOW_MS = 10 * 60 * 1000;
export const AUDIT_FAILURE_THRESHOLD = 5;

export type AuditOutcome = 'success' | 'failure' | 'blocked';

const reason = z.string().regex(/^[a-z_]{1,40}$/);

/** Danh sách trắng metadata theo loại sự kiện. Trường lạ bị bỏ (Zod strip), sai kiểu => bỏ cả metadata. */
const METADATA = {
  'auth.guest_created': z.object({}),
  'auth.recover': z.object({ reason: reason.optional() }),
  'auth.refresh_reuse': z.object({}),
  'auth.rate_limited': z.object({ route: z.string().regex(/^\/[\w/.-]{0,80}$/) }),
  'auth.failure_burst': z.object({ count: z.number().int(), threshold: z.number().int(), windowMinutes: z.number().int(), lastReason: reason }),
  'auth.logout': z.object({ reason: reason.optional() }),
  'account.deleted': z.object({ reason: reason.optional() }),
  'account.deletion_scheduled': z.object({}),
  'account.restored': z.object({}),
  // Dự án 3 Task 2 (mật khẩu/OTP) — KHÔNG bao giờ ghi email, tên đăng nhập, mật khẩu, mã vào metadata
  'auth.register': z.object({ upgraded: z.boolean() }),
  'auth.signin': z.object({ provider: z.enum(['google', 'password', 'email']), reason: reason.optional() }),
  'auth.password_changed': z.object({}),
  'auth.password_reset': z.object({ method: z.enum(['email', 'backup']), reason: reason.optional() }),
  'auth.email_code_sent': z.object({ purpose: z.enum(['link', 'reset']) }),
  'auth.email_code_failed': z.object({ purpose: z.enum(['link', 'reset']), reason }),
  'auth.identity_linked': z.object({ provider: z.enum(['google', 'password', 'email']) }),
  'auth.backup_code_rotated': z.object({}),
  'friends.invite_created': z.object({}),
  'friends.invite_accepted': z.object({ reason: reason.optional() })
} as const;

export type AuditEventType = keyof typeof METADATA;
export const AUDIT_EVENT_TYPES = Object.keys(METADATA) as AuditEventType[];

export interface AuditContext {
  ip?: string;
  userAgent?: string;
}

export interface AuditEntry {
  outcome: AuditOutcome;
  userId?: string | null;
  ctx?: AuditContext;
  metadata?: Record<string, unknown>;
}

interface WarnLogger {
  warn: (obj: unknown, msg?: string) => void;
}

export interface AuditLogOptions {
  /** Muối HMAC cho IP (AUDIT_IP_SALT). Không đổi khi xoay JWT_SECRET để còn đối chiếu được trong sự cố. */
  salt: string;
  log?: WarnLogger;
  /** Số lần ghi đang chờ tối đa; vượt => bỏ dòng mới và cảnh báo (không giữ bộ nhớ vô hạn) */
  maxPending?: number;
  now?: () => number;
}

const UA_MAX = 120;

/** Mã lỗi Postgres (postgres-js đặt ở `code`; drizzle/PGlite có thể bọc trong `cause`) */
const pgErrorCode = (err: unknown): string | undefined => {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = e?.code ?? e?.cause?.code;
  return typeof code === 'string' ? code : undefined;
};

/** User-agent rút gọn ≤ 120 ký tự, bỏ ký tự điều khiển; rỗng => null */
export function shortUserAgent(ua: string | undefined): string | null {
  if (!ua) return null;
  // eslint-disable-next-line no-control-regex
  const clean = ua.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, UA_MAX) : null;
}

export class AuditLog {
  private readonly pending = new Set<Promise<void>>();
  private readonly maxPending: number;
  private readonly now: () => number;
  /** ipHash => { count, windowStart, reported } cho lỗi xác thực */
  private readonly failures = new Map<string, { count: number; start: number; reported: boolean }>();
  /** `${route}|${ipHash}` => đầu cửa sổ đã ghi rate_limited */
  private readonly limited = new Map<string, number>();
  private dropped = 0;

  constructor(private readonly db: DbProvider, private readonly opts: AuditLogOptions) {
    this.maxPending = opts.maxPending ?? 1000;
    this.now = opts.now ?? Date.now;
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  get droppedCount(): number {
    return this.dropped;
  }

  hashIp(ip: string): string {
    return createHmac('sha256', this.opts.salt).update(ip).digest('hex').slice(0, 32);
  }

  static context(req: FastifyRequest): AuditContext {
    const ua = req.headers['user-agent'];
    return { ip: req.ip, userAgent: Array.isArray(ua) ? ua[0] : ua };
  }

  /** Ghi một sự kiện — KHÔNG chờ, KHÔNG ném lỗi. */
  record(type: AuditEventType, entry: AuditEntry): void {
    if (this.pending.size >= this.maxPending) {
      this.dropped++;
      this.opts.log?.warn({ type, dropped: this.dropped }, 'audit queue full: event dropped');
      return;
    }
    const parsed = METADATA[type].safeParse(entry.metadata ?? {});
    const row = {
      type,
      outcome: entry.outcome,
      userId: entry.userId ?? null,
      ipHash: entry.ctx?.ip ? this.hashIp(entry.ctx.ip) : null,
      userAgent: shortUserAgent(entry.ctx?.userAgent),
      metadata: (parsed.success ? parsed.data : {}) as Record<string, string | number | boolean>,
      createdAt: new Date(this.now())
    };
    const p: Promise<void> = this.write(row)
      .catch((err: unknown) => this.opts.log?.warn({ err, type }, 'audit write failed'))
      .finally(() => this.pending.delete(p));
    this.pending.add(p);
  }

  private async write(row: typeof schema.auditEvents.$inferInsert): Promise<void> {
    const db = await this.db.get();
    try {
      await db.insert(schema.auditEvents).values(row);
    } catch (err) {
      // Tài khoản vừa bị xóa trước khi dòng kịp ghi (vi phạm FK) => ghi ẩn danh, không mất sự kiện
      if (row.userId && pgErrorCode(err) === '23503') {
        await db.insert(schema.auditEvents).values({ ...row, userId: null });
        return;
      }
      throw err;
    }
  }

  /**
   * Lỗi xác thực (token sai, refresh/mã khôi phục sai). Không ghi mỗi lần (chống ghi tràn):
   * đạt ngưỡng trong cửa sổ => MỘT dòng auth.failure_burst cho IP đó.
   */
  noteAuthFailure(ctx: AuditContext, why: string): void {
    if (!ctx.ip) return;
    const key = this.hashIp(ctx.ip);
    const t = this.now();
    let s = this.failures.get(key);
    if (!s || t - s.start >= AUDIT_BURST_WINDOW_MS) {
      if (this.failures.size > 10_000) this.prune(this.failures, (v) => t - v.start >= AUDIT_BURST_WINDOW_MS);
      s = { count: 0, start: t, reported: false };
      this.failures.set(key, s);
    }
    s.count++;
    if (!s.reported && s.count >= AUDIT_FAILURE_THRESHOLD) {
      s.reported = true;
      this.record('auth.failure_burst', {
        outcome: 'failure',
        ctx,
        metadata: { count: s.count, threshold: AUDIT_FAILURE_THRESHOLD, windowMinutes: AUDIT_BURST_WINDOW_MS / 60_000, lastReason: why }
      });
    }
  }

  /** Vượt rate limit: một dòng mỗi (route, IP) mỗi cửa sổ. */
  noteRateLimited(ctx: AuditContext, route: string): void {
    const key = `${route}|${ctx.ip ? this.hashIp(ctx.ip) : '-'}`;
    const t = this.now();
    const start = this.limited.get(key);
    if (start !== undefined && t - start < AUDIT_BURST_WINDOW_MS) return;
    if (this.limited.size > 10_000) this.prune(this.limited, (v) => t - v >= AUDIT_BURST_WINDOW_MS);
    this.limited.set(key, t);
    this.record('auth.rate_limited', { outcome: 'blocked', ctx, metadata: { route } });
  }

  private prune<V>(map: Map<string, V>, stale: (v: V) => boolean): void {
    for (const [k, v] of map) if (stale(v)) map.delete(k);
    if (map.size > 10_000) map.clear();
  }

  /** Chờ mọi lần ghi đang dở (test, và khi đóng app trước khi đóng DB). */
  async flush(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }
}

/** Xóa dòng cũ hơn `days` ngày. Trả số dòng đã xóa. */
export async function purgeAuditEvents(db: Db, now = new Date(), days = AUDIT_RETENTION_DAYS): Promise<number> {
  const cutoff = new Date(now.getTime() - days * 24 * 3600 * 1000);
  const deleted = await db.delete(schema.auditEvents).where(lt(schema.auditEvents.createdAt, cutoff)).returning({ id: schema.auditEvents.id });
  return deleted.length;
}
