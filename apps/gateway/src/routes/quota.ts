import { FastifyPluginAsync } from 'fastify';
import { QuotaStatusSchema } from '@vietlearning/contracts';
import type { RouteDeps } from '../app.js';
import { respond } from '../lib/validate.js';
import { quotaDay, quotaResetAt } from '../pipeline/QuotaStore.js';

/** GET /v1/quota — hạn mức AI hôm nay (ngày giờ Việt Nam) của người đang đăng nhập (để giao diện báo "còn N lượt") */
export const quotaRoutes: FastifyPluginAsync<RouteDeps> = async (server, { pipeline }) => {
  server.get('/quota', async (req) => {
    const [turns, llm, stt, turnLimit, llmLimit, sttLimit] = await Promise.all([
      pipeline.used(req, 'turn'),
      pipeline.used(req, 'llm'),
      pipeline.used(req, 'stt'),
      // dự án 3: khách có hạn mức GUEST_QUOTA_FACTOR × tài khoản
      pipeline.limitFor(req, 'turn'),
      pipeline.limitFor(req, 'llm'),
      pipeline.limitFor(req, 'stt')
    ]);
    return respond(QuotaStatusSchema, {
      day: quotaDay(),
      resetAt: quotaResetAt(),
      turns: { used: turns, limit: turnLimit },
      llmTokens: { used: llm, limit: llmLimit },
      sttSeconds: { used: stt, limit: sttLimit }
    });
  });
};
