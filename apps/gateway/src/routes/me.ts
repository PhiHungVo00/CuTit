import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  AnalyticsSummaryResponseSchema,
  DeleteMeResponseSchema,
  PreferencesSchema,
  SrsDueResponseSchema,
  SyncRequestSchema,
  SyncResponseSchema
} from '@vietlearning/contracts/api';
import type { RouteDeps } from '../app.js';
import { parseOr400, respond } from '../lib/validate.js';
import { requireUserId } from '../pipeline/RequestPipeline.js';
import { requireAdult } from '../pipeline/accountPolicy.js';
import { applyEvents, deleteUser, dueCards, getPreferences, putPreferences, snapshot, summary } from '../services/learner/repo.js';

/** Mặc định khi người học chưa từng lưu tùy chỉnh (khớp giá trị mặc định của client) */
const DEFAULT_PREFERENCES = {
  voiceId: 'vi-VN-Standard-A',
  speed: 1,
  dialect: 'north',
  correctionLevel: 'gentle',
  persona: 'be_cu_tit',
  uiLanguage: 'en'
} as const;

const SummaryQuery = z.object({ today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

/**
 * Dữ liệu của CHÍNH người đang đăng nhập (userId lấy từ token, không bao giờ từ request)
 * => không có đường nào đọc/ghi dữ liệu người khác.
 */
export const meRoutes: FastifyPluginAsync<RouteDeps> = async (server, { db, pipeline }) => {
  // GET /v1/srs/due
  server.get('/srs/due', async (req) => {
    const userId = requireUserId(req);
    const cards = await dueCards(await db.get(), userId, new Date());
    return respond(
      SrsDueResponseSchema,
      cards.map((c) => ({
        id: c.id,
        itemRef: c.itemRef,
        ease: c.ease,
        intervalDays: c.intervalDays,
        repetitions: c.repetitions,
        dueAt: c.dueAt.toISOString(),
        front: c.front,
        back: c.back,
        source: c.source
      }))
    );
  });

  // GET /v1/analytics/summary?today=YYYY-MM-DD (ngày địa phương của người học; mặc định ngày UTC)
  server.get('/analytics/summary', async (req, reply) => {
    const userId = requireUserId(req);
    const q = parseOr400(SummaryQuery, req.query, reply);
    if (!q) return reply;
    const now = new Date();
    return respond(AnalyticsSummaryResponseSchema, await summary(await db.get(), userId, q.today ?? now.toISOString().slice(0, 10), now));
  });

  // GET /v1/preferences
  server.get('/preferences', async (req) => {
    const userId = requireUserId(req);
    return respond(PreferencesSchema, (await getPreferences(await db.get(), userId)) ?? DEFAULT_PREFERENCES);
  });

  // PUT /v1/preferences
  server.put('/preferences', async (req, reply) => {
    const userId = requireUserId(req);
    const body = parseOr400(PreferencesSchema, req.body, reply);
    if (!body) return reply;
    const d = await db.get();
    await putPreferences(d, userId, body, new Date());
    return respond(PreferencesSchema, (await getPreferences(d, userId)) ?? body);
  });

  // POST /v1/sync: lô sự kiện (idempotent theo clientEventId) => ảnh chụp tiến độ đầy đủ
  server.post('/sync', async (req, reply) => {
    const userId = requireUserId(req);
    const body = parseOr400(SyncRequestSchema, req.body, reply);
    if (!body) return reply;
    const d = await db.get();
    const result = await applyEvents(d, userId, body.events);
    return respond(SyncResponseSchema, { ...result, snapshot: await snapshot(d, userId) });
  });

  // DELETE /v1/me: xóa cứng tài khoản + mọi dữ liệu (kể cả xp_events, refresh token)
  server.delete('/me', async (req) => {
    const userId = requireUserId(req);
    // GĐ4b: hồ sơ trẻ không tự xóa được — phụ huynh xóa (DELETE /v1/family/children/:id)
    requireAdult(req);
    const ids = await deleteUser(await db.get(), userId);
    ids.forEach((id) => pipeline.forgetUser(id));
    req.log.info('account deleted');
    return respond(DeleteMeResponseSchema, { deleted: true });
  });
};
