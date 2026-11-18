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
import { requireUserId } from '../pipeline/RequestPipeline.js';
import {
  acceptInvite,
  assertSocialAllowed,
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
export const friendsRoutes: FastifyPluginAsync<RouteDeps> = async (server, { db, config }) => {
  const inviteLimit = { rateLimit: { max: config.FRIEND_INVITE_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' } };

  /** Xác thực + chặn tài khoản trẻ em ở MỌI route bạn bè */
  const guard = async (req: FastifyRequest) => {
    const userId = requireUserId(req);
    const d = await db.get();
    await assertSocialAllowed(d, userId);
    return { userId, d };
  };

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
    return respond(FriendInviteResponseSchema, await createInvite(d, userId));
  });

  server.post('/friends/accept', { config: inviteLimit }, async (req, reply) => {
    const { userId, d } = await guard(req);
    const body = parseOr400(FriendAcceptRequestSchema, req.body, reply);
    if (!body) return reply;
    return respond(FriendQuestSchema, await acceptInvite(d, userId, body.code, todayOf(req)));
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
