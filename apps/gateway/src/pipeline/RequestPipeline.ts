import type { FastifyReply, FastifyRequest } from 'fastify';
import type { GatewayConfig } from '../config.js';
import { quotaDay, quotaResetAt, type Capability, type Clock, type GlobalQuotaStore, type QuotaStore } from './QuotaStore.js';
import type { Remaining } from '@vietlearning/contracts';
import { and, eq, isNull } from 'drizzle-orm';
import { schema, type DbProvider } from '../db/client.js';
import { AuditLog } from '../services/audit/audit.js';

/** Nhớ “user còn tồn tại” trong thời gian ngắn để không truy vấn DB ở mọi request */
const USER_CACHE_MS = 60_000;

/**
 * GoF Chain of Responsibility Pattern (15)
 * Chuỗi kiểm tra tuần tự cho mỗi request: Xác thực -> Hạn mức (Quota).
 * Mỗi mắt xích có thể dừng chuỗi bằng cách gửi phản hồi lỗi.
 */

export interface Principal {
  /** sub của JWT, hoặc "anon:<ip>" khi dev cho phép khách ẩn danh */
  id: string;
  anonymous: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
}

export class GatewayError extends Error {
  constructor(public statusCode: number, public code: string, message?: string, public details?: Record<string, unknown>) {
    super(message ?? code);
  }
}

/** Route dữ liệu người học cần tài khoản thật (không chấp nhận principal ẩn danh `anon:<ip>`) */
export function requireUserId(request: FastifyRequest): string {
  const p = request.principal;
  if (!p || p.anonymous) throw new GatewayError(401, 'unauthorized', 'Cần tài khoản (POST /v1/auth/guest)');
  return p.id;
}

/**
 * Lỗi này có nghĩa là đã gọi tới nhà cung cấp AI chưa? Hết chuỗi: theo `providerCalls`; lỗi AI khác (mã `llm_*`, vd. nội dung
 * bị chặn, JSON sai): coi là đã gọi; lỗi khác (kiểm tra đầu vào…): chưa gọi.
 */
function providerWasCalled(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false;
  const calls = (cause as { providerCalls?: unknown }).providerCalls;
  if (typeof calls === 'number') return calls > 0;
  return typeof (cause as { code?: unknown }).code === 'string' && (cause as { code: string }).code.startsWith('llm_');
}

/**
 * Lỗi do chính yêu cầu của người dùng mà nhà cung cấp đã xử lý (và tính phí): KHÔNG hoàn lượt.
 * `llm_blocked` = bộ lọc an toàn từ chối nội dung; `llm_rejected` = mọi nguồn trả 4xx cho dữ liệu gửi lên (ảnh/âm thanh hỏng).
 */
const NO_REFUND = new Set(['llm_blocked', 'llm_rejected']);

export class RequestPipeline {
  private readonly limits: Record<Capability, number>;
  /** trần dùng chung toàn app (0 = không giới hạn); tts không có trần chung (không tốn hạn mức nhà cung cấp AI) */
  private readonly globalLimits: Partial<Record<Capability, number>>;

  private knownUsers = new Map<string, number>();

  constructor(private config: GatewayConfig, private quota: QuotaStore, private db: DbProvider, private audit?: AuditLog, private globalQuota?: GlobalQuotaStore, private clock: Clock = () => new Date()) {
    this.limits = {
      tts: config.MAX_TTS_CHARS_PER_DAY,
      stt: config.MAX_STT_SECONDS_PER_DAY,
      llm: config.MAX_LLM_TOKENS_PER_DAY,
      vision: 200,
      turn: config.MAX_CHAT_TURNS_PER_DAY
    };
    this.globalLimits = {
      turn: config.GLOBAL_MAX_TURNS_PER_DAY,
      llm: config.GLOBAL_MAX_LLM_TOKENS_PER_DAY,
      stt: config.GLOBAL_MAX_STT_SECONDS_PER_DAY,
      vision: config.GLOBAL_MAX_VISION_PER_DAY
    };
  }

  /** Mắt xích 1: xác thực. Gắn vào hook onRequest cho mọi route trừ healthz. */
  authenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const hasBearer = request.headers.authorization?.startsWith('Bearer ') ?? false;

    if (hasBearer && this.config.JWT_SECRET) {
      let sub: string;
      try {
        const payload = await request.jwtVerify<{ sub?: string; typ?: string }>();
        if (!payload.sub || payload.typ !== 'access') throw new Error('not an access token');
        sub = payload.sub;
      } catch (err) {
        // Token có gửi nhưng sai/hết hạn: luôn từ chối, kể cả ở dev.
        // Token SAI (không phải chỉ hết hạn — chuyện thường, client tự làm mới) lặp nhiều lần từ một IP => audit (gộp)
        if ((err as { code?: string }).code !== 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
          this.audit?.noteAuthFailure(AuditLog.context(request), 'invalid_token');
        }
        reply.status(401).send({ error: 'invalid_token' });
        return;
      }
      // Tài khoản đã xóa (DELETE /v1/me) => access token còn hạn cũng không dùng được nữa
      if (!(await this.userExists(sub))) {
        reply.status(401).send({ error: 'account_deleted' });
        return;
      }
      request.principal = { id: sub, anonymous: false };
      return;
    }

    if (this.config.AUTH_REQUIRED) {
      reply.status(401).send({ error: 'unauthorized', message: 'Thiếu Bearer token' });
      return;
    }

    request.principal = { id: `anon:${request.ip}`, anonymous: true };
  };

  private async userExists(id: string): Promise<boolean> {
    const until = this.knownUsers.get(id);
    if (until && until > Date.now()) return true;
    const db = await this.db.get();
    const [row] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.id, id), isNull(schema.users.deletedAt)));
    if (!row) return false;
    if (this.knownUsers.size > 50_000) this.knownUsers.clear();
    this.knownUsers.set(id, Date.now() + USER_CACHE_MS);
    return true;
  }

  /** Gọi sau khi xóa tài khoản để token cũ bị từ chối ngay (một instance; nhiều instance: trễ ≤ 60 s) */
  forgetUser(id: string): void {
    this.knownUsers.delete(id);
  }

  /**
   * Mắt xích 2: trừ hạn mức theo năng lực (nguyên tử, lưu DB). Gọi trong handler trước khi gọi Provider trả phí.
   * Hết hạn mức người dùng => 429 { error: 'quota_exceeded', capability, resetAt }.
   * Hết TRẦN DÙNG CHUNG cả app => cùng mã, thêm scope: 'global' (phần đã trừ của người dùng được hoàn lại).
   * Trả tổng đã dùng hôm nay của người dùng.
   * `providerCall: false` = trả lời mẫu/giả lập không gọi nhà cung cấp ⇒ chỉ trừ hạn mức người dùng, KHÔNG trừ trần chung
   * (trần chung bảo vệ hạn mức của nhà cung cấp; trừ cho trả lời mẫu làm một người đốt hết trần của cả app).
   */
  async consume(request: FastifyRequest, capability: Capability, units: number, opts: { providerCall?: boolean } = {}): Promise<number> {
    return this.charge(request, capability, units, quotaDay(this.clock()), opts.providerCall ?? true);
  }

  /** Trừ người dùng rồi trần chung, cùng một khóa ngày `day`; trần chung từ chối HOẶC lỗi => hoàn phần của người dùng */
  private async charge(request: FastifyRequest, capability: Capability, units: number, day: string, providerCall = true): Promise<number> {
    const id = this.principalId(request);
    const r = await this.quota.tryConsume(id, capability, units, this.limits[capability], day);
    if (!r.ok) {
      throw new GatewayError(429, 'quota_exceeded', `Đã hết hạn mức ${capability} hôm nay`, { capability, resetAt: quotaResetAt(this.clock()) });
    }
    const globalLimit = this.globalLimits[capability] ?? 0;
    if (providerCall && this.globalQuota && globalLimit > 0) {
      let g: { ok: boolean };
      try {
        g = await this.globalQuota.tryConsume(capability, units, globalLimit, day);
      } catch (err) {
        await this.quota.refund(id, capability, units, day).catch(() => undefined);
        throw err;
      }
      if (!g.ok) {
        await this.quota.refund(id, capability, units, day).catch(() => undefined);
        throw new GatewayError(429, 'quota_exceeded', 'Cu Tít hôm nay đã học rất nhiều, mai quay lại nhé', { capability, resetAt: quotaResetAt(this.clock()), scope: 'global' });
      }
    }
    return r.used;
  }

  /**
   * Hoàn trả hạn mức đã trừ vào đúng ngày `day` đã trừ (vắng = hôm nay). Không ném lỗi. Trần DÙNG CHUNG chỉ hoàn khi
   * `includeGlobal`: trần này bảo vệ hạn mức của nhà cung cấp nên lần gọi đã chạm nhà cung cấp (kể cả khi lỗi/JSON sai)
   * vẫn được tính; chỉ hoàn khi chưa gọi nhà cung cấp nào.
   */
  async refund(request: FastifyRequest, capability: Capability, units: number, includeGlobal = true, day?: string): Promise<void> {
    if (units <= 0) return;
    await this.quota.refund(this.principalId(request), capability, units, day).catch(() => undefined);
    if (includeGlobal && this.globalQuota && (this.globalLimits[capability] ?? 0) > 0) await this.globalQuota.refund(capability, units, day).catch(() => undefined);
  }

  /**
   * Trừ nhiều khoản cùng lúc (cùng một khóa ngày); khoản sau thất bại thì hoàn các khoản trước. Trả `hold.refund(cause)`
   * (chạy một lần): AI lỗi / hết chuỗi dự phòng => hoàn => KHÔNG trừ lượt của người dùng.
   * Ngoại lệ `llm_blocked`: nội dung NGƯỜI DÙNG gửi bị bộ lọc an toàn từ chối — lỗi do người gửi, nhà cung cấp đã tính phí
   * và lặp lại được tùy ý => KHÔNG hoàn (nếu hoàn, một người đốt được hết trần chung của cả app mà không tốn lượt nào).
   */
  async reserve(request: FastifyRequest, charges: [Capability, number][]): Promise<{ refund: (cause?: unknown) => Promise<void> }> {
    const day = quotaDay(this.clock());
    const done: [Capability, number][] = [];
    try {
      for (const [cap, units] of charges) {
        await this.charge(request, cap, units, day);
        done.push([cap, units]);
      }
    } catch (err) {
      await Promise.all(done.map(([c, u]) => this.refund(request, c, u, true, day)));
      throw err;
    }
    let refunded = false;
    return {
      refund: async (cause?: unknown) => {
        if (refunded) return;
        refunded = true;
        if (NO_REFUND.has(String((cause as { code?: unknown } | undefined)?.code))) return;
        const includeGlobal = !providerWasCalled(cause);
        await Promise.all(done.map(([c, u]) => this.refund(request, c, u, includeGlobal, day)));
      }
    };
  }

  /** reserve + chạy `fn`; `fn` ném lỗi => hoàn lại rồi ném tiếp */
  async run<T>(request: FastifyRequest, charges: [Capability, number][], fn: () => Promise<T>): Promise<T> {
    const hold = await this.reserve(request, charges);
    try {
      return await fn();
    } catch (err) {
      await hold.refund(err);
      throw err;
    }
  }

  /**
   * Hạn mức còn lại hôm nay (đính vào kết quả mọi route AI để giao diện hiện "Còn N lượt"). Không ném lỗi: đọc DB hỏng
   * SAU khi AI đã trả lời (đã tốn phí) thì bỏ `remaining` (trường tùy chọn), không biến kết quả thành 500.
   */
  async remaining(request: FastifyRequest): Promise<Remaining | undefined> {
    try {
      const used = await this.quota.getAll(this.principalId(request));
      const left = (cap: Capability) => Math.max(0, this.limits[cap] - used[cap]);
      return { turns: left('turn'), llmTokens: left('llm'), sttSeconds: left('stt'), visionImages: left('vision') };
    } catch {
      return undefined;
    }
  }

  /**
   * Cộng phần chênh lệch sau khi biết chi phí thật (không chặn, không ném lỗi hạn mức). Cộng cả vào trần chung: trần token
   * chung phải theo token THẬT nhà cung cấp tính (prompt gia sư ≈ 3 000 token/lượt, ước lượng chỉ vài trăm).
   */
  async addUsage(request: FastifyRequest, capability: Capability, units: number): Promise<void> {
    if (units <= 0) return;
    await this.quota.add(this.principalId(request), capability, units);
    if (this.globalQuota && (this.globalLimits[capability] ?? 0) > 0) await this.globalQuota.add(capability, units).catch(() => undefined);
  }

  limit(capability: Capability): number {
    return this.limits[capability];
  }

  async used(request: FastifyRequest, capability: Capability): Promise<number> {
    return this.quota.get(this.principalId(request), capability);
  }

  private principalId(request: FastifyRequest): string {
    const principal = request.principal;
    if (!principal) throw new GatewayError(401, 'unauthorized');
    return principal.id;
  }
}
