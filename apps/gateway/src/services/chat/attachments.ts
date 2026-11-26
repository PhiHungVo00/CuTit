import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { and, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import { CHAT_LIMITS, ChatErrorCode } from '@vietlearning/contracts/api';
import { schema, type Db } from '../../db/client.js';
import { GatewayError } from '../../pipeline/RequestPipeline.js';
import { BlobTooLargeError, type BlobStore } from '../blob/BlobStore.js';
import { SNIFF_BYTES, sniffMedia } from '../feedback/fileSniff.js';
import { deleteKeysOrQueue, drainBlobDeletions, TMP_MAX_AGE_MS } from '../feedback/purge.js';
import { getMembership, type Q, type Tx } from './conversations.js';
import type { ChatBlobUrlSigner } from './blobUrl.js';

/**
 * Ảnh + giọng nói trong chat (dự án 4, Task 8, spec 5.5), trên `BlobStore` của 5a.
 * Chống mồ côi: (1) tệp ghi vào kho TRƯỚC, dòng DB ghi SAU; lỗi/đứt/quá cỡ ở bất kỳ bước nào thì xóa tệp (xóa lỗi thì xếp hàng
 * `blob_deletions`); (2) khóa tệp do server sinh `chat/<cid>/<uuid>.<ext>`; (3) tệp chưa gắn quá 1 giờ bị dọn.
 */
const { chatAttachments, chatMessages, userBlocks, blobDeletions, users } = schema;

export const STORAGE_WARN_RATIO = 0.8;
const DAY_MS = 86_400_000;
const WARN_EVERY_MS = 3600_000;

export type AttachmentMedia = 'image' | 'voice';
export interface SniffedAttachment {
  media: AttachmentMedia;
  contentType: 'image/webp' | 'image/jpeg' | 'image/png' | 'audio/webm' | 'audio/ogg' | 'audio/mp4';
  /** đuôi khóa do SERVER chọn */
  ext: 'webp' | 'jpg' | 'png' | 'weba' | 'ogg' | 'm4a';
}

/**
 * Nhận dạng theo NỘI DUNG (magic bytes). Ảnh: WebP/JPEG/PNG (SVG bị loại vì không có chữ ký). Giọng nói: Ogg ("OggS"),
 * WebM (EBML + DocType webm), MP4/M4A (`ftyp`). Tệp WebM/MP4 là "giọng nói" theo đặc tả (không soi có track hình hay không: đã bị
 * chặn ở 3 MB và chỉ phát qua thẻ <audio>). PE/ELF/HTML/MKV/MOV/HEIC => null.
 */
export function sniffAttachment(head: Buffer): SniffedAttachment | null {
  if (head.length >= 4 && head.toString('latin1', 0, 4) === 'OggS') return { media: 'voice', contentType: 'audio/ogg', ext: 'ogg' };
  if (head.length >= 12 && head.toString('latin1', 4, 8) === 'ftyp' && head.toString('latin1', 8, 12) === 'M4A ') {
    return { media: 'voice', contentType: 'audio/mp4', ext: 'm4a' };
  }
  const s = sniffMedia(head);
  if (!s) return null;
  switch (s.contentType) {
    case 'image/png':
      return { media: 'image', contentType: 'image/png', ext: 'png' };
    case 'image/jpeg':
      return { media: 'image', contentType: 'image/jpeg', ext: 'jpg' };
    case 'image/webp':
      return { media: 'image', contentType: 'image/webp', ext: 'webp' };
    case 'video/webm':
      return { media: 'voice', contentType: 'audio/webm', ext: 'weba' };
    case 'video/mp4':
      return { media: 'voice', contentType: 'audio/mp4', ext: 'm4a' };
    default:
      return null; // mov (qt), ...
  }
}
export { SNIFF_BYTES };

export const maxBytesOf = (media: AttachmentMedia): number => (media === 'image' ? CHAT_LIMITS.imageBytes : CHAT_LIMITS.voiceBytes);
const perDayOf = (media: AttachmentMedia): number => (media === 'image' ? CHAT_LIMITS.imagesPerDay : CHAT_LIMITS.voicePerDay);

const invalid = (message = 'Tệp đính kèm không hợp lệ') => new GatewayError(400, ChatErrorCode.attachmentInvalid, message);
const storageFull = () => new GatewayError(507, ChatErrorCode.storageFull, 'Kho ảnh/giọng nói của chat đang đầy: gửi tin chữ nhé');

/**
 * Sổ đặt chỗ trong TIẾN TRÌNH (một instance Gateway, spec 5.6):
 * - `inflight`: byte đang nhận dở của MỌI lần tải lên (cộng ngay khi nhận chunk, trừ khi xong/lỗi/đứt);
 * - `delta`: byte đã chốt vào DB (cộng) hoặc đã dọn (trừ) KỂ TỪ khi chương trình chạy; mỗi lần tải lên chụp `delta` trước khi
 *   đọc tổng từ DB nên tệp của lần tải khác chốt xen giữa chỉ bị đếm DƯ (an toàn), không bao giờ thiếu;
 * - `pending`: số tệp đã nhận dạng nhưng chưa có dòng DB, theo (người, loại) để giới hạn/ngày không bị vượt khi gửi song song.
 * Trần = tổng DB + delta xen giữa + inflight ≤ CHAT_BLOB_TOTAL_CAP_MB => gửi song song không vượt trần.
 */
export class ChatBlobMeter {
  inflight = 0;
  delta = 0;
  private readonly pending = new Map<string, number>();
  private lastWarnAt = 0;

  pendingOf(userId: string, media: AttachmentMedia): number {
    return this.pending.get(`${userId}:${media}`) ?? 0;
  }
  addPending(userId: string, media: AttachmentMedia, n: number): void {
    const k = `${userId}:${media}`;
    const v = (this.pending.get(k) ?? 0) + n;
    if (v <= 0) this.pending.delete(k);
    else this.pending.set(k, v);
  }
  /** true nếu nên phát cảnh báo bây giờ (tối đa 1 lần/giờ) */
  shouldWarn(now: number): boolean {
    if (now - this.lastWarnAt < WARN_EVERY_MS) return false;
    this.lastWarnAt = now;
    return true;
  }
}

export interface ChatBlobUsage {
  usedBytes: number;
  capBytes: number;
  ratio: number;
  warning: boolean;
}

/** Dung lượng ảnh/giọng nói chat đang giữ (chỉ tệp chưa dọn), so với trần riêng của chat */
export async function chatBlobUsage(db: Db, capBytes: number): Promise<ChatBlobUsage> {
  const used = await usedBytesFromDb(db);
  const ratio = capBytes > 0 ? used / capBytes : 1;
  return { usedBytes: used, capBytes, ratio, warning: ratio >= STORAGE_WARN_RATIO };
}

async function usedBytesFromDb(q: Q): Promise<number> {
  const [r] = await q.select({ n: sql<string>`coalesce(sum(${chatAttachments.bytes}), 0)` }).from(chatAttachments).where(isNull(chatAttachments.purgedAt));
  return Number(r?.n ?? 0);
}

export interface UploadMeta {
  durationMs?: number;
  waveform?: number[];
  width?: number;
  height?: number;
}

export interface AttachmentDeps {
  db: Db;
  blob: BlobStore;
  meter: ChatBlobMeter;
  capBytes: number;
  /** cảnh báo ≥ 80% dung lượng (route ghi vào log; trang quản trị sẽ đọc `chatBlobUsage`) */
  onWarning?: (u: ChatBlobUsage) => void;
}

export interface SaveArgs {
  userId: string;
  conversationId: string;
  meta: UploadMeta;
  /** `SNIFF_BYTES` byte đầu của tệp (hoặc cả tệp nếu ngắn hơn) */
  first: Buffer;
  /** phần còn lại của dòng chảy; null = đã hết */
  rest: AsyncIterator<Buffer> | null;
  /** client đã ngắt giữa chừng? (kiểm sau khi ghi xong) */
  isAborted: () => boolean;
  now: Date;
}

/**
 * Nhận một tệp đã đọc xong phần đầu. Thứ tự: nhận dạng magic bytes → kiểm meta theo loại → giới hạn/ngày → ghi streaming (đếm byte,
 * đặt chỗ trần dung lượng từng chunk) → chốt dòng DB. Mọi lỗi sau khi bắt đầu ghi đều dọn tệp.
 */
export async function saveAttachment(deps: AttachmentDeps, a: SaveArgs): Promise<{ attachmentId: string; key: string }> {
  const { db, blob, meter } = deps;
  const kind = sniffAttachment(a.first);
  if (!kind) throw invalid('Chỉ nhận ảnh WebP/JPEG/PNG và giọng nói WebM/Ogg/MP4');
  const { media } = kind;

  // meta theo loại: giọng nói ≤ 120 s và sóng âm ≤ 64 số; ảnh có thể khai kích thước (≤ 1280). Trường không hợp loại bị bỏ.
  const durationMs = media === 'voice' ? a.meta.durationMs : undefined;
  const waveform = media === 'voice' ? a.meta.waveform : undefined;
  const width = media === 'image' ? a.meta.width : undefined;
  const height = media === 'image' ? a.meta.height : undefined;
  if (durationMs !== undefined && (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > CHAT_LIMITS.voiceMs)) throw invalid('Giọng nói tối đa 120 giây');
  if (waveform && (waveform.length > CHAT_LIMITS.waveformMax || waveform.some((n) => !Number.isInteger(n) || n < 0 || n > 255))) throw invalid('Sóng âm không hợp lệ');
  for (const d of [width, height]) if (d !== undefined && (!Number.isInteger(d) || d < 1 || d > CHAT_LIMITS.imageMaxEdge)) throw invalid('Kích thước ảnh không hợp lệ');

  // giới hạn/ngày (cửa sổ trượt 24 giờ): đã ghi DB + đang nhận dở trong tiến trình
  const since = new Date(a.now.getTime() - DAY_MS);
  const [cnt] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(chatAttachments)
    .where(and(eq(chatAttachments.uploaderId, a.userId), eq(chatAttachments.media, media), gt(chatAttachments.createdAt, since)));
  if ((cnt?.n ?? 0) + meter.pendingOf(a.userId, media) >= perDayOf(media)) {
    throw new GatewayError(429, ChatErrorCode.chatRate, media === 'image' ? 'Hôm nay bạn đã gửi đủ số ảnh' : 'Hôm nay bạn đã gửi đủ số tin thoại', { retryAfterSec: 3600 });
  }
  meter.addPending(a.userId, media, 1);

  // chụp `delta` TRƯỚC khi đọc tổng DB (xem ghi chú ChatBlobMeter)
  const delta0 = meter.delta;
  let reserved = 0;
  let committed = false;
  const key = `chat/${a.conversationId}/${randomUUID()}.${kind.ext}`;
  try {
    const base = await usedBytesFromDb(db);
    const check = (n: number): void => {
      reserved += n;
      meter.inflight += n;
      if (base + (meter.delta - delta0) + meter.inflight > deps.capBytes) throw storageFull();
    };
    async function* body(): AsyncGenerator<Buffer> {
      check(a.first.length);
      yield a.first;
      while (a.rest) {
        const r = await a.rest.next();
        if (r.done) break;
        check(r.value.length);
        yield r.value;
      }
    }
    let bytes: number;
    try {
      ({ bytes } = await blob.put(key, Readable.from(body()), { contentType: kind.contentType, maxBytes: maxBytesOf(media) }));
    } catch (err) {
      if (err instanceof BlobTooLargeError) throw new GatewayError(413, 'file_too_large', media === 'image' ? 'Ảnh quá lớn (tối đa 2 MB)' : 'Giọng nói quá lớn (tối đa 3 MB)');
      throw err;
    }
    // client ngắt giữa chừng nhưng luồng kết thúc "sạch": bỏ hết
    if (a.isAborted()) throw new GatewayError(400, 'upload_aborted', 'Kết nối bị ngắt khi đang gửi');
    if (bytes <= 0) throw invalid('Tệp rỗng');

    const [row] = await db
      .insert(chatAttachments)
      .values({ conversationId: a.conversationId, uploaderId: a.userId, blobKey: key, media, contentType: kind.contentType, bytes, durationMs, width, height, waveform, createdAt: a.now })
      .returning({ id: chatAttachments.id });
    committed = true;
    meter.delta += bytes; // chốt vào DB TRƯỚC khi nhả đặt chỗ (không có khoảng hở)
    if (base + (meter.delta - delta0) >= deps.capBytes * STORAGE_WARN_RATIO && meter.shouldWarn(a.now.getTime())) {
      deps.onWarning?.({ usedBytes: base + (meter.delta - delta0), capBytes: deps.capBytes, ratio: (base + (meter.delta - delta0)) / deps.capBytes, warning: true });
    }
    return { attachmentId: row.id, key };
  } catch (err) {
    if (!committed) await deleteKeysOrQueue(db, blob, [key], 'chat_upload_failed');
    throw err;
  } finally {
    meter.inflight -= reserved;
    meter.addPending(a.userId, media, -1);
  }
}

/** Hủy một tệp VỪA nhận (đã có dòng DB, chưa gắn tin): dùng khi yêu cầu lỗi SAU khi tệp đã được chốt (vd. phần tệp thứ hai). */
export async function discardFreshAttachment(deps: Pick<AttachmentDeps, 'db' | 'blob'>, saved: { attachmentId: string; key: string }): Promise<void> {
  await deps.db.delete(chatAttachments).where(and(eq(chatAttachments.id, saved.attachmentId), isNull(chatAttachments.purgedAt)));
  await deleteKeysOrQueue(deps.db, deps.blob, [saved.key], 'chat_upload_failed');
}

// ---------- gắn vào tin ----------

/**
 * Trong transaction gửi tin: khóa dòng tệp rồi kiểm — đúng người tải, cùng cuộc trò chuyện, đúng loại, chưa dọn, còn hạn 1 giờ, chưa
 * gắn vào tin nào. MỌI lý do hỏng trả cùng một lỗi (không cho dò tệp của người khác).
 */
export async function claimAttachment(tx: Tx, a: { id: string; userId: string; conversationId: string; kind: 'image' | 'voice'; now: Date }) {
  const [att] = await tx.select().from(chatAttachments).where(eq(chatAttachments.id, a.id)).for('update');
  const stale = att && a.now.getTime() - att.createdAt.getTime() > CHAT_LIMITS.unattachedTtlMs;
  if (!att || att.uploaderId !== a.userId || att.conversationId !== a.conversationId || att.media !== a.kind || att.purgedAt || stale) throw invalid();
  const [used] = await tx.select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.attachmentId, a.id)).limit(1);
  if (used) throw invalid();
  return att;
}

// ---------- URL ký ----------

/**
 * Cấp URL ký 5 phút cho MỘT tệp. Chỉ thành viên đang ở trong cuộc trò chuyện; tệp chưa gắn chỉ người tải thấy. Dùng chung luật hiển thị
 * với `toMessage`: tin thu hồi (trừ chính người gửi), tin của người mình đã chặn, tin ở trước mốc "xóa cho riêng mình"/ngày vào nhóm,
 * tin của tài khoản đã xóa => 404 (như không có tệp).
 */
export async function attachmentUrl(db: Db, signer: ChatBlobUrlSigner, userId: string, attachmentId: string): Promise<{ url: string; expiresAt: string }> {
  const [att] = await db.select().from(chatAttachments).where(eq(chatAttachments.id, attachmentId));
  if (!att) throw notFound();
  const { m } = await getMembership(db, userId, att.conversationId); // người ngoài => 403 not_a_member
  if (att.purgedAt) throw notFound();
  const [msg] = await db.select().from(chatMessages).where(eq(chatMessages.attachmentId, att.id));
  if (!msg) {
    if (att.uploaderId !== userId) throw notFound(); // chưa gắn: chỉ người tải xem trước
  } else {
    const mine = msg.senderId === userId;
    if (!msg.senderId || msg.seq <= Math.max(m.hiddenBeforeSeq, m.joinedSeq)) throw notFound();
    if (msg.deletedAt && !(mine && msg.deletedKind === 'recalled')) throw notFound();
    if (!mine) {
      const blocked = await db.select({ b: userBlocks.blockedId }).from(userBlocks).where(and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, msg.senderId)));
      if (blocked.length) throw notFound();
    }
  }
  return signer.sign(att.blobKey);
}
const notFound = () => new GatewayError(404, 'not_found', 'Không tìm thấy tệp');

// ---------- dọn dẹp ----------

const BATCH = 500;
const MAX_ROUNDS = 20;

/**
 * Dọn tệp chưa gắn quá `unattachedTtlMs` (1 giờ) và không bị báo cáo ghim: đặt `purged_at` + ghi `blob_deletions` trong MỘT transaction,
 * xóa tệp SAU commit (lỗi => còn dòng `blob_deletions`, job thử lại). Tệp đã gắn vào tin thì KHÔNG bao giờ bị dọn ở đây
 * (khóa dòng tệp rồi mới đọc bảng tin, nên không đua với `claimAttachment`). Trả số tệp đã đặt purged.
 */
export async function purgeUnattachedAttachments(db: Db, blob: BlobStore, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - CHAT_LIMITS.unattachedTtlMs);
  let total = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { keys, n, more } = await db.transaction(async (tx) => {
      const cand = await tx
        .select({ id: chatAttachments.id, k: chatAttachments.blobKey })
        .from(chatAttachments)
        .where(and(isNull(chatAttachments.purgedAt), eq(chatAttachments.pinnedByReport, false), lt(chatAttachments.createdAt, cutoff)))
        .limit(BATCH)
        .for('update', { skipLocked: true });
      if (!cand.length) return { keys: [] as string[], n: 0, more: false };
      const ids = cand.map((c) => c.id);
      const attached = new Set((await tx.select({ id: chatMessages.attachmentId }).from(chatMessages).where(inArray(chatMessages.attachmentId, ids))).map((r) => r.id));
      const dead = cand.filter((c) => !attached.has(c.id));
      if (dead.length) {
        await tx.update(chatAttachments).set({ purgedAt: now }).where(inArray(chatAttachments.id, dead.map((d) => d.id)));
        await tx.insert(blobDeletions).values(dead.map((d) => ({ blobKey: d.k, reason: 'chat_unattached' }))).onConflictDoNothing();
      }
      return { keys: dead.map((d) => d.k), n: dead.length, more: cand.length === BATCH && dead.length > 0 };
    });
    await drainBlobDeletions(db, blob, keys);
    total += n;
    if (!more) break;
  }
  return total;
}

/**
 * Xóa tệp chat của MỘT người dùng (xóa tài khoản). Task 18 gọi hàm này trong luồng xóa toàn dự án.
 * Trong MỘT transaction: khóa dòng user, gỡ tệp khỏi các tin của họ (tin => `deleted_kind='account_deleted'`, `attachment_id` NULL — đúng
 * ràng buộc `chat_messages_content_ck`), đặt `purged_at`, ghi `blob_deletions`; rồi `deleteUser(tx)` (nếu có); xóa tệp SAU commit.
 * Tệp bị báo cáo ghim (`pinned_by_report`) được GIỮ (bằng chứng). Trả kết quả của `deleteUser` (true nếu không truyền).
 */
export async function purgeUserChatAttachments(db: Db, blob: BlobStore, userId: string, now: Date, deleteUser?: (tx: Tx) => Promise<boolean>): Promise<boolean> {
  const { ok, keys } = await db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
    const rows = await tx
      .select({ id: chatAttachments.id, k: chatAttachments.blobKey })
      .from(chatAttachments)
      .where(and(eq(chatAttachments.uploaderId, userId), isNull(chatAttachments.purgedAt), eq(chatAttachments.pinnedByReport, false)))
      .for('update');
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      await tx
        .update(chatMessages)
        .set({ attachmentId: null, deletedAt: now, deletedKind: 'account_deleted' })
        .where(inArray(chatMessages.attachmentId, ids));
      await tx.update(chatAttachments).set({ purgedAt: now }).where(inArray(chatAttachments.id, ids));
      await tx.insert(blobDeletions).values(rows.map((r) => ({ blobKey: r.k, reason: 'account_deleted' }))).onConflictDoNothing();
    }
    const done = deleteUser ? await deleteUser(tx) : true;
    return { ok: done, keys: rows.map((r) => r.k) };
  });
  await drainBlobDeletions(db, blob, keys);
  return ok;
}

/** Job nền: dọn tệp chưa gắn + thử lại hàng xóa + dọn `.tmp/` cũ */
export async function runChatBlobMaintenance(db: Db, blob: BlobStore, now: Date): Promise<{ unattached: number; retried: number; temp: number }> {
  const unattached = await purgeUnattachedAttachments(db, blob, now);
  const retried = await drainBlobDeletions(db, blob);
  const temp = (await blob.sweepTemp?.(TMP_MAX_AGE_MS, now).catch(() => 0)) ?? 0;
  return { unattached, retried, temp };
}
