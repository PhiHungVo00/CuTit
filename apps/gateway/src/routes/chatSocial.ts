import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  CHAT_LIMITS,
  ConversationCreateRequestSchema,
  ConversationIdParamsSchema,
  ConversationListSchema,
  ConversationSchema,
  ConversationsQuerySchema,
  MessageIdParamsSchema,
  MessagePageSchema,
  MuteRequestSchema,
  ReadRequestSchema,
  SendMessageRequestSchema,
  SendMessageResponseSchema
} from '@vietlearning/contracts/api';
import type { RouteDeps } from '../app.js';
import { parseOr400, respond } from '../lib/validate.js';
import { GatewayError, requireUserId } from '../pipeline/RequestPipeline.js';
import type { RealtimeBus } from '../services/realtime/RealtimeBus.js';
import { getOrCreateDm, getConversation, hideConversation, listConversations, muteConversation, unhideConversation, unreadSummary } from '../services/chat/conversations.js';
import { assertEligible, type ChatEligibilityFn } from '../services/chat/eligibility.js';
import type { ChatLimiter } from '../services/chat/limits.js';
import { listMessages, sendMessage } from '../services/chat/messages.js';
import { markRead } from '../services/chat/reads.js';
import { recallMessage, restoreMessage } from '../services/chat/recall.js';

export interface ChatSocialDeps extends RouteDeps {
  bus: RealtimeBus;
  /** Cổng điều kiện chat (Task 3 `chatEligibility`; tạm là bản giả — xem services/chat/eligibility.ts) */
  eligibility: ChatEligibilityFn;
  limiter: ChatLimiter;
}

/**
 * `afterSeq` được phép bằng 0 ("bù từ đầu"): `MessagesQuerySchema` của contract đang đòi ≥ 1 (cần PR nhỏ sửa contract — ghi trong PR),
 * nên route này tự đọc query. `limit` vượt trần thì CẮT về trần (không trả 400) để client cũ không vỡ.
 */
const MessagesQuery = z
  .object({
    beforeSeq: z.coerce.number().int().positive().optional(),
    afterSeq: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).default(CHAT_LIMITS.pageDefault).transform((n) => Math.min(n, CHAT_LIMITS.pageMax))
  })
  .refine((q) => !(q.beforeSeq !== undefined && q.afterSeq !== undefined), 'Chỉ một trong beforeSeq/afterSeq');

/**
 * Dự án 4, Task 4 — /v1/chat/*: lõi chat 1-1 (tin chữ, thu hồi, đọc, ẩn, tắt tiếng, danh sách). userId luôn lấy từ token.
 * MỌI route đi qua cùng một hook: cờ CHAT_ENABLED → xác thực thật → cổng điều kiện (đủ 18, không khách, có handle, không khóa) — cổng
 * chạy TRƯỚC khi đọc body/tham số nên người không đủ điều kiện không chạm được tới DB chat.
 * userId của tin gửi: tin chỉ dựng từ id trong token (không có trường "người gửi" nào nhận từ client).
 */
export const chatSocialRoutes: FastifyPluginAsync<ChatSocialDeps> = async (server, { db, config, bus, eligibility, limiter, clock }) => {
  const perRoute = { config: { rateLimit: { max: config.CHAT_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' } } };

  server.addHook('preHandler', async (req: FastifyRequest) => {
    if (!config.CHAT_ENABLED) throw new GatewayError(404, 'chat_disabled', 'Tính năng nhắn tin chưa được bật');
    await assertEligible(await db.get(), eligibility, requireUserId(req));
  });

  const ctx = async (req: FastifyRequest) => ({ userId: requireUserId(req), d: await db.get() });

  server.get('/chat/conversations', perRoute, async (req, reply) => {
    const { userId, d } = await ctx(req);
    const q = parseOr400(ConversationsQuerySchema, req.query, reply);
    if (!q) return reply;
    return respond(ConversationListSchema, await listConversations(d, userId, { cursor: q.cursor, limit: q.limit, now: clock() }));
  });

  // số chưa đọc cho chấm đỏ (spec 9). Khai báo tĩnh nên không đụng `:id`
  server.get('/chat/conversations/unread', perRoute, async (req) => {
    const { userId, d } = await ctx(req);
    return unreadSummary(d, userId, clock());
  });

  server.post('/chat/conversations', perRoute, async (req, reply) => {
    const { userId, d } = await ctx(req);
    const body = parseOr400(ConversationCreateRequestSchema, req.body, reply);
    if (!body) return reply;
    if (!('peerFriendshipId' in body)) throw new GatewayError(501, 'not_implemented', 'Tạo nhóm chưa có ở bản này (Task 12)');
    return respond(ConversationSchema, await getOrCreateDm(d, userId, body.peerFriendshipId, { gate: eligibility, now: clock() }));
  });

  server.get('/chat/conversations/:id', perRoute, async (req, reply) => {
    const { userId, d } = await ctx(req);
    const p = parseOr400(ConversationIdParamsSchema, req.params, reply);
    if (!p) return reply;
    return respond(ConversationSchema, await getConversation(d, userId, p.id, clock()));
  });

  server.get('/chat/conversations/:id/messages', perRoute, async (req, reply) => {
    const { userId, d } = await ctx(req);
    const p = parseOr400(ConversationIdParamsSchema, req.params, reply);
    const q = parseOr400(MessagesQuery, req.query, reply);
    if (!p || !q) return reply;
    return respond(MessagePageSchema, await listMessages(d, userId, p.id, q));
  });

  server.post('/chat/conversations/:id/messages', perRoute, async (req, reply) => {
    const { userId, d } = await ctx(req);
    const p = parseOr400(ConversationIdParamsSchema, req.params, reply);
    const body = parseOr400(SendMessageRequestSchema, req.body, reply);
    if (!p || !body) return reply;
    const { message, duplicate } = await sendMessage(d, bus, {
      conversationId: p.id,
      userId,
      clientMsgId: body.clientMsgId,
      kind: body.kind,
      body: body.kind === 'text' ? body.body : undefined,
      peerGate: eligibility,
      limiter,
      now: clock()
    });
    return respond(SendMessageResponseSchema, { id: message.id, seq: message.seq, createdAt: message.createdAt, ...(duplicate ? { duplicate: true } : {}) });
  });

  server.post('/chat/conversations/:id/read', perRoute, async (req, reply) => {
    const { userId, d } = await ctx(req);
    const p = parseOr400(ConversationIdParamsSchema, req.params, reply);
    const body = parseOr400(ReadRequestSchema, req.body, reply);
    if (!p || !body) return reply;
    await markRead(d, bus, userId, p.id, body.seq);
    return reply.code(204).send();
  });

  server.post('/chat/conversations/:id/hide', perRoute, async (req, reply) => {
    const { userId, d } = await ctx(req);
    const p = parseOr400(ConversationIdParamsSchema, req.params, reply);
    if (!p) return reply;
    await hideConversation(d, userId, p.id);
    return reply.code(204).send();
  });

  server.post('/chat/conversations/:id/unhide', perRoute, async (req, reply) => {
    const { userId, d } = await ctx(req);
    const p = parseOr400(ConversationIdParamsSchema, req.params, reply);
    if (!p) return reply;
    await unhideConversation(d, userId, p.id);
    return reply.code(204).send();
  });

  server.put('/chat/conversations/:id/mute', perRoute, async (req, reply) => {
    const { userId, d } = await ctx(req);
    const p = parseOr400(ConversationIdParamsSchema, req.params, reply);
    const body = parseOr400(MuteRequestSchema, req.body, reply);
    if (!p || !body) return reply;
    await muteConversation(d, userId, p.id, body.mutedUntil ? new Date(body.mutedUntil) : null);
    return reply.code(204).send();
  });

  server.post('/chat/messages/:id/recall', perRoute, async (req, reply) => {
    const { userId, d } = await ctx(req);
    const p = parseOr400(MessageIdParamsSchema, req.params, reply);
    if (!p) return reply;
    await recallMessage(d, bus, userId, p.id, clock());
    return reply.code(204).send();
  });

  server.post('/chat/messages/:id/restore', perRoute, async (req, reply) => {
    const { userId, d } = await ctx(req);
    const p = parseOr400(MessageIdParamsSchema, req.params, reply);
    if (!p) return reply;
    await restoreMessage(d, bus, userId, p.id);
    return reply.code(204).send();
  });
};
