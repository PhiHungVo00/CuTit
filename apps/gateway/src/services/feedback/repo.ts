import { and, asc, count, desc, eq, gte, inArray } from 'drizzle-orm';
import type { FeedbackCreateMeta, FeedbackMedia, MyFeedback } from '@vietlearning/contracts/api';
import { schema, type Db } from '../../db/client.js';

const { feedbackReports, feedbackFiles, feedbackEvents, users } = schema;
const DAY_MS = 24 * 3600 * 1000;
/** Danh sách "của tôi" trả tối đa chừng này góp ý mới nhất (contract chưa có phân trang; 5 góp ý/ngày nên đủ rộng) */
const MINE_LIMIT = 100;

export class FeedbackLimitError extends Error {
  readonly statusCode = 429;
  readonly code = 'feedback_limit';
  constructor() {
    super('Bạn đã gửi đủ số góp ý cho hôm nay, mai gửi tiếp nhé');
  }
}

export interface NewFile {
  key: string;
  media: FeedbackMedia;
  contentType: string;
  bytes: number;
}

/** Số góp ý của người dùng trong 24 giờ qua (cửa sổ trượt, không phụ thuộc múi giờ) */
export async function countRecent(db: Db, userId: string, now: Date): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(feedbackReports)
    .where(and(eq(feedbackReports.userId, userId), gte(feedbackReports.createdAt, new Date(now.getTime() - DAY_MS))));
  return Number(r?.n ?? 0);
}

/**
 * Ghi góp ý + tệp trong MỘT transaction (chỉ gọi SAU khi mọi tệp đã ghi xong vào kho). Khóa dòng `users` rồi đếm lại:
 * hai yêu cầu song song của cùng một người không cùng lọt qua giới hạn ngày.
 */
export async function createFeedback(db: Db, o: { id: string; userId: string; meta: FeedbackCreateMeta; files: NewFile[]; now: Date; perDay: number }): Promise<void> {
  await db.transaction(async (tx) => {
    const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, o.userId)).for('update');
    if (!u) throw Object.assign(new Error('Tài khoản không còn'), { statusCode: 401, code: 'account_deleted' });
    const [r] = await tx
      .select({ n: count() })
      .from(feedbackReports)
      .where(and(eq(feedbackReports.userId, o.userId), gte(feedbackReports.createdAt, new Date(o.now.getTime() - DAY_MS))));
    if (Number(r?.n ?? 0) >= o.perDay) throw new FeedbackLimitError();
    await tx.insert(feedbackReports).values({
      id: o.id,
      userId: o.userId,
      kind: o.meta.kind,
      body: o.meta.body,
      context: o.meta.context,
      createdAt: o.now,
      updatedAt: o.now
    });
    if (o.files.length) {
      await tx.insert(feedbackFiles).values(o.files.map((f) => ({ feedbackId: o.id, blobKey: f.key, media: f.media, contentType: f.contentType, bytes: f.bytes, createdAt: o.now })));
    }
  });
}

/** Góp ý của CHÍNH người gọi (userId từ token). Tệp chỉ báo loại + đã dọn chưa — KHÔNG khóa/URL. */
export async function listMine(db: Db, userId: string): Promise<MyFeedback[]> {
  const reports = await db.select().from(feedbackReports).where(eq(feedbackReports.userId, userId)).orderBy(desc(feedbackReports.createdAt)).limit(MINE_LIMIT);
  if (reports.length === 0) return [];
  const ids = reports.map((r) => r.id);
  const [files, events] = await Promise.all([
    db
      .select({ feedbackId: feedbackFiles.feedbackId, media: feedbackFiles.media, purgedAt: feedbackFiles.purgedAt })
      .from(feedbackFiles)
      .where(inArray(feedbackFiles.feedbackId, ids))
      .orderBy(asc(feedbackFiles.createdAt), asc(feedbackFiles.id)),
    db
      .select({ feedbackId: feedbackEvents.feedbackId, status: feedbackEvents.status, message: feedbackEvents.message, createdAt: feedbackEvents.createdAt })
      .from(feedbackEvents)
      .where(inArray(feedbackEvents.feedbackId, ids))
      .orderBy(asc(feedbackEvents.createdAt), asc(feedbackEvents.id))
  ]);
  return reports.map((r) => ({
    id: r.id,
    kind: r.kind,
    body: r.body,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    unread: r.userUnread,
    files: files.filter((f) => f.feedbackId === r.id).map((f) => ({ media: f.media, purged: f.purgedAt !== null })),
    events: events.filter((e) => e.feedbackId === r.id).map((e) => ({ at: e.createdAt.toISOString(), status: e.status, message: e.message }))
  }));
}

export async function unreadCount(db: Db, userId: string): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(feedbackReports)
    .where(and(eq(feedbackReports.userId, userId), eq(feedbackReports.userUnread, true)));
  return Number(r?.n ?? 0);
}

/** Đánh dấu đã đọc góp ý CỦA MÌNH. false = không có (hoặc của người khác: cùng kết quả, không lộ sự tồn tại) */
export async function markRead(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(feedbackReports)
    .set({ userUnread: false })
    .where(and(eq(feedbackReports.id, id), eq(feedbackReports.userId, userId)))
    .returning({ id: feedbackReports.id });
  return rows.length > 0;
}
