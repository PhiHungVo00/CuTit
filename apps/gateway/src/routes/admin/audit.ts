import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AuditListResponseSchema, type AuditAction } from '@vietlearning/contracts/api';
import type { RouteDeps } from '../../app.js';
import { parseOr400, respond } from '../../lib/validate.js';
import { listAdminAudit } from '../../services/admin/audit.js';
import type { Guard } from './feedback.js';

const AuditQuery = z
  .object({
    cursor: z.string().regex(/^[1-9]\d{0,15}$/).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  })
  .strict();

/** `GET /admin/v1/audit` — nhật ký quản trị, mới nhất lên đầu, con trỏ = id dòng cuối của trang trước. Chỉ owner. */
export const adminAuditRoutes: FastifyPluginAsync<RouteDeps & { guard: Guard }> = async (server, { db, guard }) => {
  server.get('/audit', { preHandler: guard('owner') }, async (req, reply) => {
    const q = parseOr400(AuditQuery, req.query, reply);
    if (!q) return reply;
    const d = await db.get();
    const rows = await listAdminAudit(d, q.limit + 1, q.cursor ? Number(q.cursor) : undefined);
    const page = rows.slice(0, q.limit);
    return respond(AuditListResponseSchema, {
      items: page.map((r) => ({
        id: r.id,
        at: r.createdAt.toISOString(),
        actorKind: r.actorKind,
        actorUserIdShort: r.actorUserId ? r.actorUserId.slice(0, 8) : null,
        action: r.action as AuditAction,
        targetType: r.targetType,
        // targetId của người dùng cũng rút gọn như actor (cùng quy ước userIdShort)
        targetId: r.targetType === 'user' && r.targetId ? r.targetId.slice(0, 8) : r.targetId,
        // ipHash/userAgent KHÔNG trả ra (dữ liệu điều tra, không cần cho màn hình)
        meta: r.meta ?? {}
      })),
      nextCursor: rows.length > q.limit ? String(page[page.length - 1]!.id) : null
    });
  });
};
