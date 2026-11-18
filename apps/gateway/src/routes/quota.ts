import { FastifyPluginAsync } from 'fastify';
import { QuotaStatusSchema } from '@vietlearning/contracts';
import type { RouteDeps } from '../app.js';
import { respond } from '../lib/validate.js';
import { quotaResetAt, utcDay } from '../pipeline/QuotaStore.js';

/** GET /v1/quota — hạn mức AI hôm nay của người đang đăng nhập (để giao diện báo "còn N lượt") */
export const quotaRoutes: FastifyPluginAsync<RouteDeps> = async (server, { pipeline }) => {
  server.get('/quota', async (req) => {
    const [turns, llm, stt] = await Promise.all([pipeline.used(req, 'turn'), pipeline.used(req, 'llm'), pipeline.used(req, 'stt')]);
    return respond(QuotaStatusSchema, {
      day: utcDay(),
      resetAt: quotaResetAt(),
      turns: { used: turns, limit: pipeline.limitFor(req, 'turn') },
      llmTokens: { used: llm, limit: pipeline.limitFor(req, 'llm') },
      sttSeconds: { used: stt, limit: pipeline.limitFor(req, 'stt') }
    });
  });
};
