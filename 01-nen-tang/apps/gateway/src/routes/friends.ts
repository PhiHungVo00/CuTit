import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import {
  FriendAcceptRequestSchema,
  FriendGoalRequestSchema,
  FriendIdParamsSchema,
  FriendInviteResponseSchema,
  FriendProfileRequestSchema,
  FriendProfileResponseSchema,
  FriendQuestSchema,
  FriendRemoveResponseSchema,
  FriendsQuerySchema,
  FriendsResponseSchema
} from '@vietlearning/contracts/api';
import type { RouteDeps } from '../app.js';
import { parseOr400, respond } from '../lib/validate.js';
import { AuditLog } from '../services/audit/audit.js';
import { requireUserId } from '../pipeline/RequestPipeline.js';
import {
  acceptInvite,
  createInvite,
  listFriends,
  removeFriend,
  setDisplayName,
  setGoal
} from '../services/social/friends.js';

/** `?today=` = ngày địa phương của người hỏi (như /analytics/summary); không có => ngày UTC */
const todayOf = (req: FastifyRequest): string => {
  const q = FriendsQuerySchema.safeParse(req.query);
  return (q.success && q.data.today) || new Date().toISOString().slice(0, 10);
};

/**
 * GĐ4c — /v1/friends: bạn học hợp tác (không xếp hạng, D7). userId luôn lấy từ token.
 * Tạo/nhập mã mời có rate limit riêng mỗi route (chống dò mã), ngoài giới hạn chung của /v1.
 */
export const friendsRoutes: FastifyPluginAsync<RouteDeps> = async (server, { db, config, audit }) => {
  const inviteLimit = { rateLimit: { max: config.FRIEND_INVITE_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' } };

  /** Xác thực ở MỌI route bạn bè */
  const guard = async (req: FastifyRequest) => ({ userId: requireUserId(req), d: await db.get() });

  server.get('/friends', async (req, reply) => {
    const { userId, d } = await guard(req);
    if (!parseOr400(FriendsQuerySchema, req.query, reply)) return reply;
    return respond(FriendsResponseSchema, await listFriends(d, userId, todayOf(req)));
  });

  server.put('/friends/profile', async (req, reply) => {
    const { userId, d } = await guard(req);
    const body = parseOr400(FriendProfileRequestSchema, req.body, reply);
    if (!body) return reply;
    return respond(FriendProfileResponseSchema, { displayName: await setDisplayName(d, userId, body.displayName) });
  });

  server.post('/friends/invite', { config: inviteLimit }, async (req) => {
    const { userId, d } = await guard(req);
    const invite = await createInvite(d, userId);
    audit.record('friends.invite_created', { outcome: 'success', userId, ctx: AuditLog.context(req) });
    return respond(FriendInviteResponseSchema, invite);
  });

  server.post('/friends/accept', { config: inviteLimit }, async (req, reply) => {
    const { userId, d } = await guard(req);
    const body = parseOr400(FriendAcceptRequestSchema, req.body, reply);
    if (!body) return reply;
    const ctx = AuditLog.context(req);
    try {
      const quest = await acceptInvite(d, userId, body.code, todayOf(req));
      audit.record('friends.invite_accepted', { outcome: 'success', userId, ctx });
      return respond(FriendQuestSchema, quest);
    } catch (err) {
      // Chỉ lưu mã lỗi (vd. invite_invalid) — không lưu mã đã nhập, không lưu id người mời
      const code = (err as { code?: unknown }).code;
      audit.record('friends.invite_accepted', { outcome: 'failure', userId, ctx, metadata: { reason: typeof code === 'string' ? code : 'error' } });
      throw err;
    }
  });

  server.put('/friends/:id/goal', async (req, reply) => {
    const { userId, d } = await guard(req);
    const params = parseOr400(FriendIdParamsSchema, req.params, reply);
    if (!params) return reply;
    const body = parseOr400(FriendGoalRequestSchema, req.body, reply);
    if (!body) return reply;
    return respond(FriendQuestSchema, await setGoal(d, userId, params.id, body.goalMinutes, todayOf(req)));
  });

  server.delete('/friends/:id', async (req, reply) => {
    const { userId, d } = await guard(req);
    const params = parseOr400(FriendIdParamsSchema, req.params, reply);
    if (!params) return reply;
    await removeFriend(d, userId, params.id);
    return respond(FriendRemoveResponseSchema, { removed: true });
  });
};
