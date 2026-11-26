import type { FastifyPluginAsync } from 'fastify';
import { AgeDeclareRequestSchema, AgeDeclareResponseSchema } from '@vietlearning/contracts/api';
import type { RouteDeps } from '../app.js';
import { parseOr400, respond } from '../lib/validate.js';
import { requireUserId } from '../pipeline/RequestPipeline.js';
import { AuditLog } from '../services/audit/audit.js';
import { declareAge } from '../services/social/age.js';

/**
 * Dự án 4 (spec 5.1) — PUT /v1/me/age { birthYear }. Năm sinh chỉ sống trong biến cục bộ của handler này và của
 * `declareAge` để tính cờ đủ/chưa đủ 18: KHÔNG vào DB, audit, log hay thông báo lỗi. Fastify mặc định không log body;
 * schema đặt thông báo lỗi cố định (không phản chiếu giá trị). Chống thử đi thử lại: giới hạn tần suất + khóa 12 tháng.
 */
export const meAgeRoutes: FastifyPluginAsync<RouteDeps> = async (server, { db, audit, clock }) => {
  server.put('/me/age', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const userId = requireUserId(req);
    const body = parseOr400(AgeDeclareRequestSchema, req.body, reply);
    if (!body) return reply;
    const ctx = AuditLog.context(req);
    try {
      const out = await declareAge(await db.get(), userId, body.birthYear, clock());
      audit.record('age.declared', { outcome: 'success', userId, ctx });
      return respond(AgeDeclareResponseSchema, out);
    } catch (err) {
      audit.record('age.declared', { outcome: 'failure', userId, ctx });
      throw err;
    }
  });
};
