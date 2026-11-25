import { and, asc, eq, inArray, isNotNull, isNull, lt, sql, type SQL } from 'drizzle-orm';
import { schema, type Db } from '../../db/client.js';
import type { BlobStore } from '../blob/BlobStore.js';

/**
 * Dọn tệp góp ý. Nguyên tắc chống mồ côi: KHÓA TỆP được ghi vào `blob_deletions` TRONG CÙNG transaction với thao tác
 * làm mất khóa (xóa tài khoản / đặt purged_at), rồi mới xóa tệp SAU commit. Chết giữa chừng hay kho tệp lỗi thì dòng
 * `blob_deletions` còn đó và job hằng ngày thử lại — không tệp nào bị bỏ quên, và không xóa tệp khi DB chưa chốt.
 */
const DAY_MS = 24 * 3600 * 1000;
export const IMAGE_RETENTION_DAYS = 180;
export const VIDEO_RETENTION_DAYS = 90;
export const STALE_RETENTION_DAYS = 365;
/** Tệp tạm của lần gửi bị đứt (tiến trình chết giữa chừng) quá chừng này thì dọn */
export const TMP_MAX_AGE_MS = 3600_000;
const BATCH = 500;
const MAX_ROUNDS = 20;

const { feedbackFiles, feedbackReports, blobDeletions, users } = schema;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Exec = Db | Tx;

/** Đưa khóa vào hàng xóa (idempotent theo khóa) */
async function stageKeys(x: Exec, keys: string[], reason: string): Promise<void> {
  if (keys.length) await x.insert(blobDeletions).values(keys.map((blobKey) => ({ blobKey, reason }))).onConflictDoNothing();
}

/**
 * Xóa các khóa trong hàng xóa: thành công => bỏ dòng; lỗi => attempts+1 (thử lại lần sau). Trả số tệp đã xóa.
 * Chỉ xử lý đúng các khóa được truyền; bỏ trống = tối đa BATCH dòng cũ nhất.
 */
export async function drainBlobDeletions(db: Db, blob: BlobStore, keys?: string[]): Promise<number> {
  let done = 0;
  const one = async (blobKey: string): Promise<boolean> => {
    try {
      await blob.delete(blobKey);
      await db.delete(blobDeletions).where(eq(blobDeletions.blobKey, blobKey));
      done++;
      return true;
    } catch {
      await db.update(blobDeletions).set({ attempts: sql`${blobDeletions.attempts} + 1` }).where(eq(blobDeletions.blobKey, blobKey));
      return false;
    }
  };
  if (keys) {
    for (const k of keys) await one(k);
    return done;
  }
  // Hàng chung: ít lần thử trước (dòng hỏng vĩnh viễn dồn về cuối), có phân trang để >= BATCH dòng hỏng không chặn dòng tốt phía sau.
  // `offset` chỉ tăng theo số dòng THẤT BẠI (dòng xóa được đã rời khỏi bảng).
  let offset = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const rows = await db
      .select({ blobKey: blobDeletions.blobKey })
      .from(blobDeletions)
      .orderBy(asc(blobDeletions.attempts), asc(blobDeletions.createdAt), asc(blobDeletions.blobKey))
      .limit(BATCH)
      .offset(offset);
    if (rows.length === 0) break;
    for (const { blobKey } of rows) if (!(await one(blobKey))) offset++;
  }
  return done;
}

/** Xóa tệp ngay (đường lỗi lúc gửi góp ý); xóa lỗi thì ghi blob_deletions để thử lại. */
export async function deleteKeysOrQueue(db: Db, blob: BlobStore, keys: string[], reason: string): Promise<void> {
  const failed: string[] = [];
  for (const k of keys) {
    try {
      await blob.delete(k);
    } catch {
      failed.push(k);
    }
  }
  if (failed.length) await stageKeys(db, failed, reason).catch(() => undefined);
}

/** Trong transaction `tx`: ghi MỌI khóa tệp còn của người dùng vào hàng xóa. Trả danh sách khóa (để xóa sau commit). */
export async function stageUserBlobDeletions(tx: Tx, userId: string): Promise<string[]> {
  // Khóa dòng user TRƯỚC khi đọc danh sách khóa: createFeedback cũng khóa dòng này => một góp ý gửi xen giữa lúc xóa tài khoản
  // hoặc đã commit (khóa của nó được đọc ở dưới) hoặc phải chờ rồi thấy user không còn (tự xóa tệp của nó).
  await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
  const rows = await tx
    .select({ k: feedbackFiles.blobKey })
    .from(feedbackFiles)
    .innerJoin(feedbackReports, eq(feedbackFiles.feedbackId, feedbackReports.id))
    .where(and(eq(feedbackReports.userId, userId), isNull(feedbackFiles.purgedAt)));
  const keys = rows.map((r) => r.k);
  await stageKeys(tx, keys, 'account_deleted');
  return keys;
}

/**
 * Xóa tệp góp ý của người dùng. `deleteUser` (tùy chọn) chạy TRONG cùng transaction, SAU khi đã ghi khóa vào hàng xóa
 * (vd. `(tx) => hardDeleteUserTx(tx, userId, now)`): lấy khóa TRƯỚC khi xóa user, xóa tệp SAU commit.
 * Trả kết quả của deleteUser (true nếu không truyền).
 */
export async function purgeUserFeedbackBlobs(db: Db, blob: BlobStore, userId: string, deleteUser?: (tx: Tx) => Promise<boolean>): Promise<boolean> {
  const { ok, keys } = await db.transaction(async (tx) => {
    const k = await stageUserBlobDeletions(tx, userId);
    const done = deleteUser ? await deleteUser(tx) : true;
    return { ok: done, keys: k };
  });
  await drainBlobDeletions(db, blob, keys);
  return ok;
}

export interface FeedbackPurgeResult {
  images: number;
  videos: number;
  stale: number;
  retried: number;
}

const pickIds = (db: Db, media: 'image' | 'video' | null, cond: SQL | undefined) =>
  db
    .select({ id: feedbackFiles.id })
    .from(feedbackFiles)
    .innerJoin(feedbackReports, eq(feedbackFiles.feedbackId, feedbackReports.id))
    .where(and(isNull(feedbackFiles.purgedAt), media ? eq(feedbackFiles.media, media) : undefined, cond))
    .limit(BATCH);

/** Với các tệp thỏa điều kiện: đặt purged_at + ghi hàng xóa trong MỘT transaction, rồi xóa tệp sau commit */
async function purgeMatching(db: Db, blob: BlobStore, now: Date, media: 'image' | 'video' | null, cond: SQL | undefined, reason: string): Promise<number> {
  let total = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const ids = await pickIds(db, media, cond);
    if (ids.length === 0) break;
    const keys = await db.transaction(async (tx) => {
      const rows = await tx
        .update(feedbackFiles)
        .set({ purgedAt: now })
        .where(and(inArray(feedbackFiles.id, ids.map((i) => i.id)), isNull(feedbackFiles.purgedAt)))
        .returning({ k: feedbackFiles.blobKey });
      const ks = rows.map((r) => r.k);
      await stageKeys(tx, ks, reason);
      return ks;
    });
    await drainBlobDeletions(db, blob, keys);
    total += keys.length;
    if (ids.length < BATCH) break;
  }
  return total;
}

/**
 * Job dọn hằng ngày (idempotent, an toàn chạy nhiều instance). Mốc theo `done_at` (lúc chủ app đặt "Đã xong"):
 *  - ảnh: done_at quá 180 ngày; video: quá 90 ngày; góp ý chưa xong: mọi tệp quá 365 ngày kể từ created_at.
 * Chữ giữ lại, dòng `feedback_files` giữ lại với purged_at. Thử lại các lần xóa lỗi trước đó (`retried`).
 */
export async function runFeedbackPurge(db: Db, blob: BlobStore, now: Date): Promise<FeedbackPurgeResult> {
  const retried = await drainBlobDeletions(db, blob);
  await blob.sweepTemp?.(TMP_MAX_AGE_MS, now).catch(() => undefined);
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const images = await purgeMatching(db, blob, now, 'image', and(isNotNull(feedbackReports.doneAt), lt(feedbackReports.doneAt, ago(IMAGE_RETENTION_DAYS))), 'retention_image');
  const videos = await purgeMatching(db, blob, now, 'video', and(isNotNull(feedbackReports.doneAt), lt(feedbackReports.doneAt, ago(VIDEO_RETENTION_DAYS))), 'retention_video');
  const stale = await purgeMatching(db, blob, now, null, and(isNull(feedbackReports.doneAt), lt(feedbackReports.createdAt, ago(STALE_RETENTION_DAYS))), 'retention_stale');
  return { images, videos, stale, retried };
}
