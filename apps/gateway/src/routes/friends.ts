import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import {
  BlockResponseSchema,
  BlockUserParamsSchema,
  FriendAcceptRequestSchema,
  FriendGoalRequestSchema,
  FriendIdParamsSchema,
  FriendInviteResponseSchema,
  FriendProfileRequestSchema,
  FriendProfileResponseSchema,
  FriendQuestActiveRequestSchema,
  FriendRequestCreateResponseSchema,
  FriendRequestCreateSchema,
  FriendRequestDeclineResponseSchema,
  FriendRequestIdParamsSchema,
  FriendRequestListSchema,
  HandleSetRequestSchema,
  HandleSetResponseSchema,
  FriendQuestSchema,
  FriendRemoveResponseSchema,
  FriendsQuerySchema,
  FriendsResponseSchema,
  SocialMeSchema,
  SocialSettingsSchema,
  SocialSettingsUpdateSchema
} from '@vietlearning/contracts/api';
import type { RouteDeps } from '../app.js';
import { parseOr400, respond } from '../lib/validate.js';
import { AuditLog } from '../services/audit/audit.js';
import { requireUserId } from '../pipeline/RequestPipeline.js';
import { RateCounters } from '../services/auth/rateCounter.js';
import { blockUser, unblockUser } from '../services/social/blocks.js';
import { requireChatEligible } from '../services/social/eligibility.js';
import {
  acceptInvite,
  createInvite,
  friendQuest,
  listFriends,
  removeFriend,
  setDisplayName,
  setGoal,
  setQuestActive
} from '../services/social/friends.js';
import { getSocialMe, setHandle, updateSocialSettings } from '../services/social/handle.js';
import { createFriendRequest, listIncomingRequests, respondRequest } from '../services/social/requests.js';

/** `?today=` = ngày địa phương của người hỏi (như /analytics/summary); không có => ngày UTC */
const todayOf = (req: FastifyRequest): string => {
  const q = FriendsQuerySchema.safeParse(req.query);
  return (q.success && q.data.today) || new Date().toISOString().slice(0, 10);
};

/**
 * GĐ4c — /v1/friends: bạn học hợp tác (không xếp hạng, D7). userId luôn lấy từ token.
 * Tạo/nhập mã mời có rate limit riêng mỗi route (chống dò mã), ngoài giới hạn chung của /v1.
 */
export const friendsRoutes: FastifyPluginAsync<RouteDeps> = async (server, { db, config, audit, clock }) => {
  const counters = new RateCounters(config.AUTH_OTP_PEPPER ?? '');
  const inviteLimit = { rateLimit: { max: config.FRIEND_INVITE_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' } };

  /** Chặn/bỏ chặn: người bị khóa chat hoặc chưa có handle vẫn tự bảo vệ được (khách và dưới 18 thì không) */
  const BLOCK_ALLOWED: ('restricted' | 'no_handle')[] = ['restricted', 'no_handle'];

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

  // ---------- Dự án 4: handle, lời mời bằng handle, nhiệm vụ tuần, chặn ----------
  // Các route dưới đây gọi `requireChatEligible` (cửa duy nhất, services/social/eligibility.ts); đọc/sửa cài đặt của
  // chính mình thì không cần đủ điều kiện (để client biết cổng nào còn đóng).

  server.get('/chat/settings', async (req) => {
    const { userId, d } = await guard(req);
    return respond(SocialMeSchema, await getSocialMe(d, userId, clock()));
  });

  server.put('/chat/settings', async (req, reply) => {
    const { userId, d } = await guard(req);
    const body = parseOr400(SocialSettingsUpdateSchema, req.body, reply);
    if (!body) return reply;
    return respond(SocialSettingsSchema, await updateSocialSettings(d, userId, body, clock()));
  });

  server.put('/chat/handle', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { userId, d } = await guard(req);
    const body = parseOr400(HandleSetRequestSchema, req.body, reply);
    if (!body) return reply;
    return respond(HandleSetResponseSchema, { handle: await setHandle(d, userId, body.handle, clock()) });
  });

  server.post('/friends/requests', async (req, reply) => {
    const { userId, d } = await guard(req);
    const body = parseOr400(FriendRequestCreateSchema, req.body, reply);
    if (!body) return reply;
    const ctx = AuditLog.context(req);
    try {
      const out = await createFriendRequest(d, userId, body.handle, { now: clock(), counters });
      audit.record('friends.request_sent', { outcome: 'success', userId, ctx });
      return respond(FriendRequestCreateResponseSchema, out);
    } catch (err) {
      audit.record('friends.request_sent', { outcome: 'failure', userId, ctx });
      throw err;
    }
  });

  server.get('/friends/requests', async (req) => {
    const { userId, d } = await guard(req);
    await requireChatEligible(d, userId, clock());
    return respond(FriendRequestListSchema, { requests: await listIncomingRequests(d, userId) });
  });

  server.post('/friends/requests/:id/accept', async (req, reply) => {
    const { userId, d } = await guard(req);
    const params = parseOr400(FriendRequestIdParamsSchema, req.params, reply);
    if (!params) return reply;
    await requireChatEligible(d, userId, clock());
    const out = await respondRequest(d, userId, params.id, 'accept', clock());
    audit.record('friends.request_accepted', { outcome: 'success', userId, ctx: AuditLog.context(req) });
    const quest = await friendQuest(d, userId, (out as { friendshipId: string }).friendshipId, todayOf(req));
    return respond(FriendQuestSchema, quest!);
  });

  server.post('/friends/requests/:id/decline', async (req, reply) => {
    const { userId, d } = await guard(req);
    const params = parseOr400(FriendRequestIdParamsSchema, req.params, reply);
    if (!params) return reply;
    await requireChatEligible(d, userId, clock());
    await respondRequest(d, userId, params.id, 'decline', clock());
    return respond(FriendRequestDeclineResponseSchema, { declined: true });
  });

  server.post('/friends/:id/quest-active', async (req, reply) => {
    const { userId, d } = await guard(req);
    const params = parseOr400(FriendIdParamsSchema, req.params, reply);
    if (!params) return reply;
    const body = parseOr400(FriendQuestActiveRequestSchema, req.body, reply);
    if (!body) return reply;
    return respond(FriendQuestSchema, await setQuestActive(d, userId, params.id, body.questActive, todayOf(req)));
  });

  server.put('/chat/blocks/:userId', async (req, reply) => {
    const { userId, d } = await guard(req);
    const params = parseOr400(BlockUserParamsSchema, req.params, reply);
    if (!params) return reply;
    await requireChatEligible(d, userId, clock(), BLOCK_ALLOWED);
    await blockUser(d, userId, params.userId, clock());
    audit.record('chat.user_blocked', { outcome: 'success', userId, ctx: AuditLog.context(req) });
    return respond(BlockResponseSchema, { blocked: true });
  });

  server.delete('/chat/blocks/:userId', async (req, reply) => {
    const { userId, d } = await guard(req);
    const params = parseOr400(BlockUserParamsSchema, req.params, reply);
    if (!params) return reply;
    await requireChatEligible(d, userId, clock(), BLOCK_ALLOWED);
    await unblockUser(d, userId, params.userId);
    return respond(BlockResponseSchema, { blocked: false });
  });
};
