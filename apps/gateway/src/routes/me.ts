import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  AnalyticsSummaryResponseSchema,
  DeleteMeRequestSchema,
  DeleteMeResultSchema,
  RestoreAccountRequestSchema,
  PreferencesSchema,
  SrsDueResponseSchema,
  SyncRequestSchema,
  SyncResponseSchema
} from '@vietlearning/contracts/api';
import type { RouteDeps } from '../app.js';
import { parseOr400, respond } from '../lib/validate.js';
import { AuditLog } from '../services/audit/audit.js';
import { requireUserId } from '../pipeline/RequestPipeline.js';
import { hardDeleteUserTx, restoreAccount, scheduleDeletion } from '../services/auth/lifecycle.js';
import { purgeUserFeedbackBlobs } from '../services/feedback/purge.js';
import { applyEvents, dueCards, getPreferences, putPreferences, snapshot, summary } from '../services/learner/repo.js';

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
export const meRoutes: FastifyPluginAsync<RouteDeps> = async (server, { db, pipeline, audit, blob }) => {
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

  // DELETE /v1/me {mode:'grace'|'now'}
  //  - grace: khóa ngay, thu hồi mọi refresh token, xóa cứng sau 30 ngày (khôi phục được: POST /v1/me/restore)
  //  - now: xóa cứng ngay như trước (kể cả xp_events, refresh token)
  //  - KHÔNG gửi thân (client cũ trước dự án 3): giữ hành vi cũ = 'now', và vẫn trả { deleted: true } cho client cũ.
  server.delete('/me', async (req, reply) => {
    const userId = requireUserId(req);
    const d = await db.get();
    const now = pipeline.now();
    let mode: 'grace' | 'now' = 'now';
    if (req.body !== undefined && req.body !== null) {
      const body = parseOr400(DeleteMeRequestSchema, req.body, reply);
      if (!body) return reply;
      mode = body.mode;
    }
    if (mode === 'grace') {
      const deleteAt = await scheduleDeletion(d, userId, now);
      pipeline.forgetUser(userId);
      if (!deleteAt) return reply.status(401).send({ error: 'account_deleted' });
      audit.record('account.deletion_scheduled', { outcome: 'success', userId, ctx: AuditLog.context(req) });
      req.log.info('account deletion scheduled');
      return respond(DeleteMeResultSchema, { deleteAt: deleteAt.toISOString() });
    }
    // Góp ý + tệp đính kèm: lấy khóa tệp TRƯỚC khi xóa user (cascade làm mất khóa), xóa tệp SAU commit; lỗi => blob_deletions
    await purgeUserFeedbackBlobs(d, blob, userId, (tx) => hardDeleteUserTx(tx, userId, now));
    pipeline.forgetUser(userId);
    // Các dòng audit cũ của user đã tự ẩn danh (FK ON DELETE SET NULL); dòng này cũng KHÔNG gắn user_id
    audit.record('account.deleted', { outcome: 'success', userId: null, ctx: AuditLog.context(req) });
    req.log.info('account deleted');
    return { deleted: true, ...DeleteMeResultSchema.parse({ deleteAt: null }) };
  });

  // POST /v1/me/restore: bỏ hạn xóa (chỉ trong 30 ngày). Không có thân (hoặc {}). Gọi cho tài khoản đang hoạt động: vô hại.
  server.post('/me/restore', async (req, reply) => {
    const userId = requireUserId(req);
    if (!parseOr400(RestoreAccountRequestSchema, req.body ?? {}, reply)) return reply;
    const ok = await restoreAccount(await db.get(), userId, pipeline.now());
    pipeline.forgetUser(userId);
    if (!ok) return reply.status(401).send({ error: 'account_deleted' });
    audit.record('account.restored', { outcome: 'success', userId, ctx: AuditLog.context(req) });
    return respond(DeleteMeResultSchema, { deleteAt: null });
  });
};
