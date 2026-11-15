import type { FastifyReply, FastifyRequest } from 'fastify';
import type { GatewayConfig } from '../config.js';
import type { Capability, QuotaStore } from './QuotaStore.js';

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

export class RequestPipeline {
  private readonly limits: Record<Capability, number>;

  constructor(private config: GatewayConfig, private quota: QuotaStore) {
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
      try {
        const payload = await request.jwtVerify<{ sub?: string }>();
        if (!payload.sub) throw new Error('missing sub');
        request.principal = { id: payload.sub, anonymous: false };
        return;
      } catch {
        // Token có gửi nhưng sai/hết hạn: luôn từ chối, kể cả ở dev
        reply.status(401).send({ error: 'invalid_token' });
        return;
      }
    }

    if (this.config.AUTH_REQUIRED) {
      reply.status(401).send({ error: 'unauthorized', message: 'Thiếu Bearer token' });
      return;
    }

    request.principal = { id: `anon:${request.ip}`, anonymous: true };
  };

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
