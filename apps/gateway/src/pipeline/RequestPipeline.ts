import type { FastifyReply, FastifyRequest } from 'fastify';
import type { GatewayConfig } from '../config.js';
import type { Capability, QuotaStore } from './QuotaStore.js';
import { and, eq, isNull } from 'drizzle-orm';
import { schema, type DbProvider } from '../db/client.js';

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
  constructor(public statusCode: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

/** Route dữ liệu người học cần tài khoản thật (không chấp nhận principal ẩn danh `anon:<ip>`) */
export function requireUserId(request: FastifyRequest): string {
  const p = request.principal;
  if (!p || p.anonymous) throw new GatewayError(401, 'unauthorized', 'Cần tài khoản (POST /v1/auth/guest)');
  return p.id;
}

export class RequestPipeline {
  private readonly limits: Record<Capability, number>;

  private knownUsers = new Map<string, number>();

  constructor(private config: GatewayConfig, private quota: QuotaStore, private db: DbProvider) {
    this.limits = {
      tts: config.MAX_TTS_CHARS_PER_DAY,
      stt: config.MAX_STT_SECONDS_PER_DAY,
      llm: config.MAX_LLM_TOKENS_PER_DAY,
      vision: 200
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
      } catch {
        // Token có gửi nhưng sai/hết hạn: luôn từ chối, kể cả ở dev
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

  /** Mắt xích 2: trừ hạn mức theo năng lực. Gọi trong handler trước khi gọi Provider trả phí. */
  async consume(request: FastifyRequest, capability: Capability, units: number): Promise<void> {
    const principal = request.principal;
    if (!principal) throw new GatewayError(401, 'unauthorized');

    const key = `${principal.id}:${capability}`;
    const used = await this.quota.get(key);
    if (used + units > this.limits[capability]) {
      throw new GatewayError(429, 'quota_exceeded', `Đã hết hạn mức ${capability} hôm nay`);
    }
    await this.quota.increment(key, units);
  }
}
