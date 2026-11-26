import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { and, count, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  AdminErrorCode,
  AdminFeedbackDetailSchema,
  AdminStatusRequestSchema,
  QUEUE_PAGE,
  QueueQuerySchema,
  QueueResponseSchema,
  SignedUrlSchema,
  type AdminFeedbackDetail
} from '@vietlearning/contracts/api';
import type { StaffRole } from '@vietlearning/contracts/db';
import type { RouteDeps } from '../../app.js';
import { schema, type Db } from '../../db/client.js';
import { parseOr400, respond } from '../../lib/validate.js';
import { AuditLog } from '../../services/audit/audit.js';
import { withAdminAudit, type Tx } from '../../services/admin/audit.js';
import type { BlobUrlSigner } from '../../services/admin/signedUrl.js';

const { feedbackReports: reports, feedbackFiles: files, feedbackEvents: events, users } = schema;

export type Guard = (role?: StaffRole) => (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | void>;

class AdminHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}
const notFound = () => new AdminHttpError(404, 'not_found', 'Không có góp ý này');
/** Dừng giữa transaction khi KHÔNG có gì đổi: rollback => không có dòng nhật ký thừa */
class NoChange extends Error {}

const IdParams = z.object({ id: z.string().uuid() });
const FileParams = z.object({ id: z.string().uuid(), fileId: z.string().uuid() });
const EXCERPT_MAX = 120;
const CURSOR_TS = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;

/** Đúng lịch (tháng 1–12, ngày có thật, giờ 0–23...): Postgres sẽ ném lỗi (500) với "2020-13-45" nên chặn ở đây thành 400 */
function validCalendar(ts: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(ts);
  if (!m) return false;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  if (h > 23 || mi > 59 || s > 59 || y < 1) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function excerptOf(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  let out = flat.slice(0, EXCERPT_MAX);
  // Không cắt đôi một cặp thay thế (emoji): ký tự cuối là nửa đầu => bỏ nó
  const last = out.charCodeAt(out.length - 1);
  if (flat.length > EXCERPT_MAX && last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out;
}

/**
 * Con trỏ mờ (base64url JSON). Mốc thời gian đi nguyên văn dạng chữ của Postgres (đủ micro giây): cắt xuống mili giây
 * làm so sánh (created_at, id) lệch => dòng nằm giữa hai mốc bị mất. Đọc lại bằng regex chặt, không tin cursor.
 */
function encodeCursor(ts: string, id: string): string {
  return Buffer.from(JSON.stringify({ t: ts, i: id })).toString('base64url');
}
function decodeCursor(raw: string): { t: string; i: string } | null {
  try {
    const v = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { t?: unknown; i?: unknown };
    if (typeof v.t !== 'string' || typeof v.i !== 'string') return null;
    if (!CURSOR_TS.test(v.t) || !validCalendar(v.t) || !z.string().uuid().safeParse(v.i).success) return null;
    return { t: v.t, i: v.i };
  } catch {
    return null;
  }
}

async function loadDetail(db: Db | Tx, id: string): Promise<AdminFeedbackDetail | null> {
  const [r] = await db
    .select({ report: reports, deleteAt: users.deleteAt })
    .from(reports)
    .leftJoin(users, eq(users.id, reports.userId))
    .where(eq(reports.id, id));
  if (!r) return null;
  const [fs, es] = await Promise.all([
    db.select().from(files).where(eq(files.feedbackId, id)).orderBy(files.createdAt, files.id),
    db.select().from(events).where(eq(events.feedbackId, id)).orderBy(events.createdAt, events.id)
  ]);
  return respond(AdminFeedbackDetailSchema, {
    id: r.report.id,
    kind: r.report.kind,
    body: r.report.body,
    status: r.report.status,
    createdAt: r.report.createdAt.toISOString(),
    doneAt: r.report.doneAt ? r.report.doneAt.toISOString() : null,
    context: r.report.context,
    userIdShort: r.report.userId.slice(0, 8),
    accountPendingDeletion: r.deleteAt !== null,
    files: fs.map((f) => ({ id: f.id, media: f.media, contentType: f.contentType as AdminFeedbackDetail['files'][number]['contentType'], bytes: f.bytes, durationMs: f.durationMs, purged: f.purgedAt !== null })),
    events: es.map((e) => ({ at: e.createdAt.toISOString(), status: e.status, message: e.message }))
  });
}

/**
 * Hàng chờ góp ý cho chủ app. Mọi route qua `requireAdmin('owner')` (đọc vai trò từ DB mỗi lần). Thao tác ghi (đổi trạng thái,
 * xem tệp) ghi nhật ký quản trị TRONG cùng transaction. `signer` null (thiếu ADMIN_BLOB_URL_SECRET) => cấp URL tệp trả 503.
 */
export const adminFeedbackRoutes: FastifyPluginAsync<RouteDeps & { guard: Guard; signer: BlobUrlSigner | null }> = async (server, { db, config, clock, audit, guard, signer }) => {
  const meta = (req: FastifyRequest) => {
    const ctx = AuditLog.context(req);
    return { ipHash: ctx.ip ? audit.hashIp(ctx.ip) : null, userAgent: ctx.userAgent ?? null };
  };

  server.get('/queue', { preHandler: guard('owner') }, async (req, reply) => {
    const q = parseOr400(QueueQuerySchema, req.query, reply);
    if (!q) return reply;
    const cur = q.cursor ? decodeCursor(q.cursor) : null;
    if (q.cursor && !cur) return reply.status(400).send({ error: 'invalid_request', message: 'cursor không hợp lệ' });
    const d = await db.get();
    const limit = q.limit ?? QUEUE_PAGE.default;
    const rows = await d
      .select({
        r: reports,
        createdAtText: sql<string>`${reports.createdAt}::text`,
        deleteAt: users.deleteAt
      })
      .from(reports)
      .leftJoin(users, eq(users.id, reports.userId))
      .where(
        and(
          q.status ? eq(reports.status, q.status) : undefined,
          q.kind ? eq(reports.kind, q.kind) : undefined,
          cur ? sql`(${reports.createdAt}, ${reports.id}) < (${cur.t}::timestamptz, ${cur.i}::uuid)` : undefined
        )
      )
      .orderBy(desc(reports.createdAt), desc(reports.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const counts = page.length
      ? await d.select({ id: files.feedbackId, n: count() }).from(files).where(inArray(files.feedbackId, page.map((p) => p.r.id))).groupBy(files.feedbackId)
      : [];
    const [pending] = await d.select({ n: count() }).from(reports).where(ne(reports.status, 'done'));
    const last = page[page.length - 1];
    return respond(QueueResponseSchema, {
      items: page.map((p) => ({
        type: 'feedback' as const,
        id: p.r.id,
        kind: p.r.kind,
        excerpt: excerptOf(p.r.body),
        status: p.r.status,
        appVersion: p.r.context.appVersion,
        route: p.r.context.route,
        fileCount: Number(counts.find((c) => c.id === p.r.id)?.n ?? 0),
        createdAt: p.r.createdAt.toISOString(),
        accountPendingDeletion: p.deleteAt !== null
      })),
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAtText, last.r.id) : null,
      pendingCount: Number(pending?.n ?? 0)
    });
  });

  server.get('/feedback/:id', { preHandler: guard('owner') }, async (req, reply) => {
    const p = parseOr400(IdParams, req.params, reply);
    if (!p) return reply;
    const detail = await loadDetail(await db.get(), p.id);
    if (!detail) throw notFound();
    return detail;
  });

  server.post('/feedback/:id/status', { preHandler: guard('owner') }, async (req, reply) => {
    const p = parseOr400(IdParams, req.params, reply);
    if (!p) return reply;
    const body = parseOr400(AdminStatusRequestSchema, req.body, reply);
    if (!body) return reply;
    const d = await db.get();
    const now = clock();
    const admin = req.admin!;
    const entry = {
      actorUserId: admin.userId,
      actorKind: 'user' as const,
      action: 'feedback.status' as const,
      targetType: 'feedback',
      targetId: p.id,
      meta: {} as Record<string, unknown>,
      ...meta(req)
    };
    try {
      await withAdminAudit(d, entry, async (tx) => {
        const [cur] = await tx.select().from(reports).where(eq(reports.id, p.id)).for('update');
        if (!cur) throw notFound();
        const changed = cur.status !== body.status;
        if (!changed && !body.message) throw new NoChange();
        await tx
          .update(reports)
          .set({
            status: body.status,
            // đã xong thì giữ mốc cũ (lời nhắn thêm không dời mốc dọn tệp); mở lại thì xóa (CHECK ép khớp status)
            doneAt: body.status === 'done' ? (cur.doneAt ?? now) : null,
            userUnread: true,
            updatedAt: now
          })
          .where(eq(reports.id, p.id));
        await tx.insert(events).values({ feedbackId: p.id, actorUserId: admin.userId, status: changed ? body.status : null, message: body.message ?? null, createdAt: now });
        // Không đưa nội dung lời nhắn vào nhật ký (chỉ có/không)
        Object.assign(entry.meta, { from: cur.status, to: body.status, hasMessage: body.message !== undefined });
      });
    } catch (e) {
      if (!(e instanceof NoChange)) throw e;
    }
    const detail = await loadDetail(d, p.id);
    if (!detail) throw notFound();
    return detail;
  });

  server.get('/feedback/:id/files/:fileId/url', { preHandler: guard('owner') }, async (req, reply) => {
    const p = parseOr400(FileParams, req.params, reply);
    if (!p) return reply;
    if (!signer) return reply.status(503).send({ error: AdminErrorCode.adminDisabled });
    const d = await db.get();
    const entry = {
      actorUserId: req.admin!.userId,
      actorKind: 'user' as const,
      action: 'feedback.view_file' as const,
      targetType: 'feedback',
      targetId: p.id,
      meta: { fileId: p.fileId } as Record<string, unknown>,
      ...meta(req)
    };
    // Tệp không thuộc góp ý này / không có => 404; đã dọn => 410: đều ném TRƯỚC khi ghi nhật ký (rollback, không dòng thừa)
    const signed = await withAdminAudit(d, entry, async (tx) => {
      const [f] = await tx.select().from(files).where(and(eq(files.id, p.fileId), eq(files.feedbackId, p.id)));
      if (!f) throw new AdminHttpError(404, 'not_found', 'Không có tệp này');
      if (f.purgedAt) throw new AdminHttpError(410, 'file_purged', 'Tệp đã được dọn');
      entry.meta.media = f.media;
      return signer.signBlobUrl(f.blobKey);
    });
    // Gốc URL: PUBLIC_BASE_URL (sau proxy) hoặc chính Host của yêu cầu. Chữ ký không buộc gốc, nên Host giả chỉ ảnh hưởng người gọi
    const base = (config.PUBLIC_BASE_URL ?? `${req.protocol}://${req.headers.host ?? 'localhost'}`).replace(/\/+$/, '');
    return respond(SignedUrlSchema, { url: base + signed.url, expiresAt: signed.expiresAt });
  });
};
