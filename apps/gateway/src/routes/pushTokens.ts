import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { PushTokenParamsSchema, PushTokenSchema } from '@vietlearning/contracts/api';
import type { RouteDeps } from '../app.js';
import { parseOr400 } from '../lib/validate.js';
import { GatewayError, requireUserId } from '../pipeline/RequestPipeline.js';
import { assertEligible, closedChatEligibility, type ChatEligibilityFn } from '../services/chat/eligibility.js';
import { registerPushToken, removePushToken } from '../services/push/tokens.js';

export interface PushTokenDeps extends RouteDeps {
  eligibility?: ChatEligibilityFn;
}

/**
 * Dự án 4, Task 10 — token thiết bị cho thông báo đẩy. userId luôn lấy từ token đăng nhập.
 * - POST: chỉ người ĐỦ điều kiện chat (khách/dưới 18 không có lý do nhận push chat).
 * - DELETE: mọi người đã đăng nhập (đăng xuất/mất quyền vẫn phải hủy được); chỉ xóa token CỦA MÌNH, luôn 204
 *   (token lạ hoặc của người khác cũng 204: không lộ token nào thuộc ai).
 */
export const pushTokenRoutes: FastifyPluginAsync<PushTokenDeps> = async (server, { db, config, eligibility: gate, clock }) => {
  const eligibility = gate ?? closedChatEligibility;
  const perRoute = { config: { rateLimit: { max: config.CHAT_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' } } };
  const enabled = (): void => {
    if (!config.CHAT_ENABLED) throw new GatewayError(404, 'chat_disabled', 'Tính năng nhắn tin chưa được bật');
  };

  server.post('/chat/push-tokens', perRoute, async (req: FastifyRequest, reply) => {
    enabled();
    const userId = requireUserId(req);
    const d = await db.get();
    await assertEligible(d, eligibility, userId);
    const body = parseOr400(PushTokenSchema, req.body, reply);
    if (!body) return reply;
    await registerPushToken(d, userId, body, clock());
    return reply.status(204).send();
  });

  server.delete('/chat/push-tokens/:token', perRoute, async (req: FastifyRequest, reply) => {
    enabled();
    const userId = requireUserId(req);
    const p = parseOr400(PushTokenParamsSchema, req.params, reply);
    if (!p) return reply;
    await removePushToken(await db.get(), userId, p.token);
    return reply.status(204).send();
  });
};
