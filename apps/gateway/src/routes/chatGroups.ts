import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  CHAT_LIMITS,
  ConversationIdParamsSchema,
  GroupLeaveRequestSchema,
  GroupMemberChangeSchema,
  GroupMemberParamsSchema,
  GroupMembersResponseSchema,
  GroupRoleRequestSchema,
  GroupTitleRequestSchema
} from '@vietlearning/contracts/api';
import type { RouteDeps } from '../app.js';
import { parseOr400, respond } from '../lib/validate.js';
import { GatewayError, requireUserId } from '../pipeline/RequestPipeline.js';
import type { RealtimeBus } from '../services/realtime/RealtimeBus.js';
import { assertEligible, closedChatEligibility, type ChatEligibilityFn } from '../services/chat/eligibility.js';
import { addMembers, deleteGroup, leaveGroup, listMembers, listReaders, removeMember, setRole, setTitle } from '../services/chat/groups.js';

export interface ChatGroupDeps extends RouteDeps {
  bus: RealtimeBus;
  eligibility?: ChatEligibilityFn;
}

const Page = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).default(CHAT_LIMITS.pageDefault).transform((n) => Math.min(n, CHAT_LIMITS.pageMax))
});
const ReadersQuery = Page.extend({ seq: z.coerce.number().int().positive() });
/** Chưa có trong contract (Task 1) — người làm màn nhóm (Task 14) chuyển vào contract bằng PR nhỏ nếu cần dùng kiểu chung */
const ReadersResponse = z.object({
  count: z.number().int().nonnegative(),
  readers: z.array(z.object({ id: z.string().uuid(), displayName: z.string().max(100) })),
  nextCursor: z.string().max(200).nullable()
});

/**
 * Dự án 4, Task 12 — /v1/chat/groups/*: quản lý nhóm học. Cùng hook với `chatSocialRoutes`: cờ CHAT_ENABLED → xác thực → cổng điều kiện
 * (đủ 18, không khách, có handle, không khóa) TRƯỚC khi đọc body/tham số. userId luôn lấy từ token. Mọi quyền (ai thêm/xóa/đổi tên/đổi vai trò)
 * kiểm trong service sau khi KHÓA dòng cuộc trò chuyện. Tạo nhóm đi qua `POST /chat/conversations` (routes/chatSocial.ts).
 */
export const chatGroupRoutes: FastifyPluginAsync<ChatGroupDeps> = async (server, { db, config, bus, eligibility: gate, clock }) => {
  const eligibility = gate ?? closedChatEligibility;
  const perRoute = { config: { rateLimit: { max: config.CHAT_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' } } };
  const softCap = config.GROUP_SOFT_CAP;

  server.addHook('preHandler', async (req: FastifyRequest) => {
    if (!config.CHAT_ENABLED) throw new GatewayError(404, 'chat_disabled', 'Tính năng nhắn tin chưa được bật');
    await assertEligible(await db.get(), eligibility, requireUserId(req));
  });
  const ctx = async (req: FastifyRequest) => ({ userId: requireUserId(req), d: await db.get() });

  server.get('/chat/groups/:id/members', perRoute, async (req, reply) => {
    const { userId, d } = await ctx(req);
    const p = parseOr400(ConversationIdParamsSchema, req.params, reply);
    const q = parseOr400(Page, req.query, reply);
    if (!p || !q) return reply;
    return respond(GroupMembersResponseSchema, await listMembers(d, userId, p.id, q));
  });

  server.post('/chat/groups/:id/members', perRoute, async (req, reply) => {
    const { userId, d } = await ctx(req);
    const p = parseOr400(ConversationIdParamsSchema, req.params, reply);
    const body = parseOr400(GroupMemberChangeSchema, req.body, reply);
    if (!p || !body) return reply;
    await addMembers(d, bus, userId, p.id, body.memberIds, { gate: eligibility, softCap, now: clock() });
    return reply.code(204).send();
  });

  server.delete('/chat/groups/:id/members/:userId', perRoute, async (req, reply) => {
    const { userId, d } = await ctx(req);
    const p = parseOr400(GroupMemberParamsSchema, req.params, reply);
    if (!p) return reply;
    await removeMember(d, bus, userId, p.id, p.userId, clock());
    return reply.code(204).send();
  });

  server.put('/chat/groups/:id/members/:userId/role', perRoute, async (req, reply) => {
    const { userId, d } = await ctx(req);
    const p = parseOr400(GroupMemberParamsSchema, req.params, reply);
    const body = parseOr400(GroupRoleRequestSchema, req.body, reply);
    if (!p || !body) return reply;
    await setRole(d, bus, userId, p.id, p.userId, body.role);
    return reply.code(204).send();
  });

  server.post('/chat/groups/:id/leave', perRoute, async (req, reply) => {
    const { userId, d } = await ctx(req);
    const p = parseOr400(ConversationIdParamsSchema, req.params, reply);
    const body = parseOr400(GroupLeaveRequestSchema, req.body ?? {}, reply);
    if (!p || !body) return reply;
    await leaveGroup(d, bus, userId, p.id, { successorId: body.successorId, now: clock() });
    return reply.code(204).send();
  });

  server.put('/chat/groups/:id/title', perRoute, async (req, reply) => {
    const { userId, d } = await ctx(req);
    const p = parseOr400(ConversationIdParamsSchema, req.params, reply);
    const body = parseOr400(GroupTitleRequestSchema, req.body, reply);
    if (!p || !body) return reply;
    await setTitle(d, bus, userId, p.id, body.title, clock());
    return reply.code(204).send();
  });

  server.delete('/chat/groups/:id', perRoute, async (req, reply) => {
    const { userId, d } = await ctx(req);
    const p = parseOr400(ConversationIdParamsSchema, req.params, reply);
    if (!p) return reply;
    await deleteGroup(d, bus, userId, p.id);
    return reply.code(204).send();
  });

  server.get('/chat/groups/:id/readers', perRoute, async (req, reply) => {
    const { userId, d } = await ctx(req);
    const p = parseOr400(ConversationIdParamsSchema, req.params, reply);
    const q = parseOr400(ReadersQuery, req.query, reply);
    if (!p || !q) return reply;
    return respond(ReadersResponse, await listReaders(d, userId, p.id, q.seq, { cursor: q.cursor, limit: q.limit }));
  });
};
