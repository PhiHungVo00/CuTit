import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import {
  AccountInfoSchema,
  AnalyticsSummaryResponseSchema,
  AuthTokensSchema,
  ChildConsentRequestSchema,
  ChildIdParamsSchema,
  ChildListResponseSchema,
  ChildProfileSchema,
  DeleteMeResponseSchema,
  FAMILY_ERROR,
  MAX_CHILDREN
} from '@vietlearning/contracts/api';
import type { RouteDeps } from '../app.js';
import { schema, type Db } from '../db/client.js';
import { parseOr400, respond } from '../lib/validate.js';
import { GatewayError, requireUserId } from '../pipeline/RequestPipeline.js';
import { hasMediaConsent, isChild, requireAdult } from '../pipeline/accountPolicy.js';
import { issueTokens } from '../services/auth/tokens.js';
import { deleteUser, summary } from '../services/learner/repo.js';

const { users } = schema;
const SummaryQuery = z.object({ today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

type ChildRow = { id: string; createdAt: Date; parentMediaConsentAt: Date | null };
const childCols = { id: users.id, createdAt: users.createdAt, parentMediaConsentAt: users.parentMediaConsentAt };
const toProfile = (c: ChildRow) => ({
  userId: c.id,
  createdAt: c.createdAt.toISOString(),
  mediaConsent: c.parentMediaConsentAt !== null,
  mediaConsentAt: c.parentMediaConsentAt?.toISOString() ?? null
});

/** Hồ sơ trẻ CỦA phụ huynh này; không phải => 404 (không lộ là id đó có tồn tại) */
async function ownChild(d: Db, parentId: string, childId: string): Promise<ChildRow> {
  const [row] = await d
    .select(childCols)
    .from(users)
    .where(and(eq(users.id, childId), eq(users.parentUserId, parentId), eq(users.accountType, 'child'), isNull(users.deletedAt)));
  if (!row) throw new GatewayError(404, 'child_not_found');
  return row;
}

/**
 * GĐ4b — Gia đình (D4). Mọi route /v1/family/* chỉ cho tài khoản NGƯỜI LỚN (hồ sơ trẻ => 403 adult_only),
 * và chỉ chạm hồ sơ trẻ có parent_user_id = người gọi. Server không lưu tên trẻ (biệt danh ở trên máy).
 */
export const familyRoutes: FastifyPluginAsync<RouteDeps> = async (server, { db, pipeline }) => {
  // GET /v1/me/account — loại tài khoản do server quyết định (client khóa tính năng theo đây)
  server.get('/me/account', async (req) => {
    const userId = requireUserId(req);
    const d = await db.get();
    const [u] = await d.select({ parentUserId: users.parentUserId }).from(users).where(eq(users.id, userId));
    const [{ n }] = isChild(req) ? [{ n: 0 }] : await d.select({ n: count() }).from(users).where(eq(users.parentUserId, userId));
    return respond(AccountInfoSchema, {
      userId,
      accountType: req.principal!.accountType,
      parentUserId: u?.parentUserId ?? null,
      mediaConsent: await hasMediaConsent(db, req),
      childCount: Number(n)
    });
  });

  server.register(
    async (fam) => {
      fam.addHook('preHandler', async (req) => {
        requireUserId(req);
        requireAdult(req);
      });

      // POST /v1/family/children — tạo hồ sơ trẻ (không mã khôi phục: phụ huynh cấp phiên cho trẻ)
      fam.post('/children', async (req) => {
        const parentId = requireUserId(req);
        const d = await db.get();
        const row = await d.transaction(async (tx) => {
          const [{ n }] = await tx.select({ n: count() }).from(users).where(eq(users.parentUserId, parentId));
          if (Number(n) >= MAX_CHILDREN) throw new GatewayError(409, FAMILY_ERROR.childLimit, `Tối đa ${MAX_CHILDREN} hồ sơ trẻ`);
          const [created] = await tx.insert(users).values({ isGuest: true, accountType: 'child', parentUserId: parentId }).returning(childCols);
          return created;
        });
        return respond(ChildProfileSchema, toProfile(row));
      });

      // GET /v1/family/children
      fam.get('/children', async (req) => {
        const parentId = requireUserId(req);
        const rows = await (await db.get())
          .select(childCols)
          .from(users)
          .where(and(eq(users.parentUserId, parentId), isNull(users.deletedAt)))
          .orderBy(asc(users.createdAt));
        return respond(ChildListResponseSchema, { children: rows.map(toProfile) });
      });

      // POST /v1/family/children/:id/session — phụ huynh cấp phiên cho trẻ (chuyển hồ sơ trên máy)
      fam.post('/children/:id/session', async (req, reply) => {
        const p = parseOr400(ChildIdParamsSchema, req.params, reply);
        if (!p) return reply;
        const d = await db.get();
        const child = await ownChild(d, requireUserId(req), p.id);
        return respond(AuthTokensSchema, await issueTokens(server, d, child.id));
      });

      // PUT /v1/family/children/:id/consent — phụ huynh cho phép / thu hồi gửi ảnh, ghi âm lên server
      fam.put('/children/:id/consent', async (req, reply) => {
        const p = parseOr400(ChildIdParamsSchema, req.params, reply);
        const body = p && parseOr400(ChildConsentRequestSchema, req.body, reply);
        if (!p || !body) return reply;
        const d = await db.get();
        const child = await ownChild(d, requireUserId(req), p.id);
        const at = body.media ? (child.parentMediaConsentAt ?? new Date()) : null;
        const [row] = await d.update(users).set({ parentMediaConsentAt: at }).where(eq(users.id, child.id)).returning(childCols);
        req.log.info({ child: child.id, media: body.media }, 'parent media consent changed');
        return respond(ChildProfileSchema, toProfile(row));
      });

      // GET /v1/family/children/:id/summary?today= — phụ huynh xem tiến độ của trẻ
      fam.get('/children/:id/summary', async (req, reply) => {
        const p = parseOr400(ChildIdParamsSchema, req.params, reply);
        const q = p && parseOr400(SummaryQuery, req.query, reply);
        if (!p || !q) return reply;
        const d = await db.get();
        const child = await ownChild(d, requireUserId(req), p.id);
        const now = new Date();
        return respond(AnalyticsSummaryResponseSchema, await summary(d, child.id, q.today ?? now.toISOString().slice(0, 10), now));
      });

      // DELETE /v1/family/children/:id — xóa cứng hồ sơ trẻ (máy của trẻ nhận account_deleted)
      fam.delete('/children/:id', async (req, reply) => {
        const p = parseOr400(ChildIdParamsSchema, req.params, reply);
        if (!p) return reply;
        const d = await db.get();
        const child = await ownChild(d, requireUserId(req), p.id);
        (await deleteUser(d, child.id)).forEach((id) => pipeline.forgetUser(id));
        return respond(DeleteMeResponseSchema, { deleted: true });
      });
    },
    { prefix: '/family' }
  );
};
