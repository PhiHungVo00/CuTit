import { and, asc, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { CHAT_LIMITS, ChatErrorCode, WsServerFrameSchema, type Message, type WsServerFrame } from '@vietlearning/contracts/api';
import { schema, type Db } from '../../db/client.js';
import { GatewayError } from '../../pipeline/RequestPipeline.js';
import type { RealtimeBus } from '../realtime/RealtimeBus.js';
import { activeMembers, assertDmReachable, blockersOf, dmPeerOf, getMembership, type Q } from './conversations.js';
import type { ChatEligibilityFn } from './eligibility.js';
import type { ChatLimiter } from './limits.js';

const { chatMessages, chatAttachments, conversations, conversationMembers, socialProfiles, userBlocks } = schema;

/** Dòng tin + tên người gửi + thông tin tệp (nếu có) — đủ để dựng `Message` cho một người xem cụ thể. */
const messageColumns = {
  m: chatMessages,
  name: socialProfiles.displayName,
  attId: chatAttachments.id,
  attMedia: chatAttachments.media,
  attDuration: chatAttachments.durationMs,
  attWidth: chatAttachments.width,
  attHeight: chatAttachments.height,
  attWaveform: chatAttachments.waveform
};
export type MessageRow = { m: typeof chatMessages.$inferSelect; name: string | null; attId: string | null; attMedia: 'image' | 'voice' | null; attDuration: number | null; attWidth: number | null; attHeight: number | null; attWaveform: number[] | null };

function selectMessages(q: Q) {
  return q
    .select(messageColumns)
    .from(chatMessages)
    .leftJoin(socialProfiles, eq(socialProfiles.userId, chatMessages.senderId))
    .leftJoin(chatAttachments, eq(chatAttachments.id, chatMessages.attachmentId));
}

/**
 * Dựng `Message` CHO MỘT NGƯỜI XEM (đây là cửa DUY NHẤT biến dòng DB thành thứ client thấy, kể cả khung đẩy qua bus):
 * - tin hệ thống: chỉ `system`;
 * - tin của người xem đã chặn: `blocked:true`, KHÔNG nội dung, KHÔNG người gửi;
 * - tin thu hồi: người gửi thấy lại nội dung (để "Hoàn tác"), người khác chỉ thấy `deleted:true`;
 * - tin của người đã xóa tài khoản: `deleted:true`, không người gửi.
 */
export function toMessage(r: MessageRow, viewerId: string, blockedSenders: ReadonlySet<string>): Message {
  const { m } = r;
  const mine = m.senderId === viewerId;
  const base = { id: m.id, cid: m.conversationId, seq: m.seq, kind: m.kind, createdAt: m.createdAt.toISOString(), mine };
  if (m.kind === 'system') return { ...base, system: m.systemEvent as Message['system'] };
  // người gửi đã xóa tài khoản (sender_id NULL do FK) nhưng dòng còn nội dung: luôn che, không phụ thuộc job dọn
  if (!m.senderId) return { ...base, deleted: true };
  if (!mine && blockedSenders.has(m.senderId)) return { ...base, blocked: true };
  const sender = m.senderId ? { sender: { id: m.senderId, displayName: r.name ?? '' } } : {};
  const content = {
    ...(m.body !== null ? { body: m.body } : {}),
    ...(r.attId && r.attMedia
      ? {
          attachment: {
            id: r.attId,
            media: r.attMedia,
            ...(r.attDuration !== null ? { durationMs: r.attDuration } : {}),
            ...(r.attWaveform ? { waveform: r.attWaveform } : {}),
            ...(r.attWidth !== null ? { width: r.attWidth } : {}),
            ...(r.attHeight !== null ? { height: r.attHeight } : {})
          }
        }
      : {})
  };
  if (m.deletedAt) {
    const ownRecalled = mine && m.deletedKind === 'recalled';
    return { ...base, ...sender, deleted: true, ...(ownRecalled ? content : {}) };
  }
  return { ...base, ...sender, ...content };
}

export async function loadMessageRow(q: Q, messageId: string): Promise<MessageRow | null> {
  const [r] = await selectMessages(q).where(eq(chatMessages.id, messageId));
  return (r as MessageRow | undefined) ?? null;
}

/**
 * Phát một khung SAU khi commit. `publish` không được ném lỗi và mất khung không được làm hỏng yêu cầu (client bù bằng `afterSeq`),
 * nên mọi lỗi (kể cả khung sai hợp đồng) bị nuốt ở đây. Khung được kiểm bằng `WsServerFrameSchema` trước khi phát.
 */
export function safePublish(bus: RealtimeBus, userIds: readonly string[], frame: WsServerFrame): void {
  if (!userIds.length) return;
  try {
    bus.publish(userIds, WsServerFrameSchema.parse(frame));
  } catch {
    // client sẽ bù bằng GET messages?afterSeq=
  }
}

/**
 * Đẩy tin tới thành viên: người gửi (các máy khác) nhận bản `mine:true`; người khác `mine:false`;
 * người đã CHẶN người gửi KHÔNG nhận khung nào (sẽ thấy `blocked:true` khi bù bằng REST).
 */
export async function publishMessageFrame(db: Db, bus: RealtimeBus, row: MessageRow, type: 'msg' | 'restore'): Promise<void> {
  // SAU commit: lỗi đọc DB ở đây không được biến một thao tác đã lưu thành 500 (client bù bằng afterSeq)
  await bestEffort(async () => {
    await publishMessageFrameUnsafe(db, bus, row, type);
  });
}

/** Chạy việc phát khung phụ; nuốt mọi lỗi (đã commit thì yêu cầu coi như thành công). */
export async function bestEffort(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch {
    // client sẽ bù bằng GET messages?afterSeq=
  }
}

async function publishMessageFrameUnsafe(db: Db, bus: RealtimeBus, row: MessageRow, type: 'msg' | 'restore'): Promise<void> {
  const members = (await activeMembers(db, row.m.conversationId)).map((x) => x.userId);
  const senderId = row.m.senderId;
  const blockers = senderId ? await blockersOf(db, senderId, members) : new Set<string>();
  const others = members.filter((u) => u !== senderId && !blockers.has(u));
  if (senderId && members.includes(senderId)) safePublish(bus, [senderId], { t: type, message: toMessage(row, senderId, new Set()) });
  // `mine` luôn false với người khác; nội dung tính theo người xem đầu tiên (không ai trong `others` chặn người gửi)
  if (others.length) safePublish(bus, others, { t: type, message: toMessage(row, others[0], new Set()) });
}

export interface SendArgs {
  conversationId: string;
  userId: string;
  clientMsgId: string;
  kind: 'text' | 'image' | 'voice';
  body?: string;
  /** cổng điều kiện của NGƯỜI KIA (1-1). Bỏ trống = chỉ kiểm bạn bè + chặn */
  peerGate?: ChatEligibilityFn;
  limiter?: ChatLimiter;
  now?: Date;
}

async function existingMessage(q: Q, conversationId: string, userId: string, clientMsgId: string): Promise<Message | null> {
  const [r] = await selectMessages(q).where(and(eq(chatMessages.conversationId, conversationId), eq(chatMessages.senderId, userId), eq(chatMessages.clientMsgId, clientMsgId)));
  return r ? toMessage(r as MessageRow, userId, new Set()) : null;
}

const isUniqueViolation = (err: unknown, constraint: string): boolean => {
  const e = err as { code?: string; constraint_name?: string; constraint?: string; cause?: { code?: string; constraint_name?: string; constraint?: string } };
  const code = e.code ?? e.cause?.code;
  const name = e.constraint_name ?? e.constraint ?? e.cause?.constraint_name ?? e.cause?.constraint;
  return code === '23505' && (name === undefined || name === constraint);
};

/**
 * Gửi tin chữ. Thứ tự (mọi lỗi xảy ra TRƯỚC khi ghi, nên người không đủ điều kiện không để lại dấu vết):
 * thành viên → (1-1) còn là bạn/không chặn/người kia còn đủ điều kiện → [transaction: thành viên → tin trùng `clientMsgId`
 * (trả lại, KHÔNG tăng seq) → giới hạn tốc độ → `UPDATE last_seq = last_seq + 1 RETURNING` (khóa dòng, tuần tự hóa người gửi) →
 * INSERT → đặt đã đọc của người gửi] → SAU commit mới `bus.publish`.
 * Gửi lại đồng thời cùng `clientMsgId`: giao dịch thua vấp chỉ mục duy nhất (rollback cả lần tăng seq) rồi đọc lại tin đã có.
 */
export async function sendMessage(db: Db, bus: RealtimeBus, args: SendArgs): Promise<{ message: Message; duplicate: boolean }> {
  const { conversationId, userId, clientMsgId, kind } = args;
  const now = args.now ?? new Date();
  if (kind !== 'text') throw new GatewayError(400, ChatErrorCode.attachmentInvalid, 'Tin kèm ảnh/giọng nói chưa được hỗ trợ ở API này');
  const body = args.body ?? '';
  // NUL ( ) làm Postgres từ chối cột text → phải chặn ở đây (400), không để lọt thành 500
  if (body.trim().length === 0 || body.length > CHAT_LIMITS.bodyMax || body.includes(' ')) throw new GatewayError(400, 'invalid_request', `Tin phải từ 1 đến ${CHAT_LIMITS.bodyMax} ký tự`);

  const { conv } = await getMembership(db, userId, conversationId);
  // gửi lại tin đã lưu thì trả tin cũ KỂ CẢ khi sau đó người kia chặn/không còn khả dụng (client mới biết tin đã tới nơi)
  const stored = await existingMessage(db, conversationId, userId, clientMsgId);
  if (stored) return { message: stored, duplicate: true };
  if (conv.kind === 'dm') {
    const peer = await dmPeerOf(db, conversationId, userId);
    if (!peer) throw new GatewayError(404, ChatErrorCode.peerUnavailable, 'Người này không còn khả dụng để nhắn tin');
    await assertDmReachable(db, userId, peer, args.peerGate);
  }

  const existing = (q: Q) => existingMessage(q, conversationId, userId, clientMsgId);

  const out: { release?: () => void; inserted?: MessageRow; duplicate?: Message } = {};
  try {
    await db.transaction(async (tx) => {
      await getMembership(tx, userId, conversationId);
      out.duplicate = (await existing(tx)) ?? undefined;
      if (out.duplicate) return;
      out.release = args.limiter?.enforceChatLimits(userId, conversationId, now, body);
      const [seqRow] = await tx
        .update(conversations)
        .set({ lastSeq: sql`${conversations.lastSeq} + 1`, lastMessageAt: sql`greatest(coalesce(${conversations.lastMessageAt}, ${now.toISOString()}::timestamptz), ${now.toISOString()}::timestamptz)` })
        .where(eq(conversations.id, conversationId))
        .returning({ seq: conversations.lastSeq });
      const [row] = await tx
        .insert(chatMessages)
        .values({ conversationId, seq: seqRow.seq, senderId: userId, clientMsgId, kind: 'text', body, createdAt: now })
        .returning({ id: chatMessages.id });
      // gửi tin = đã đọc tới tin này
      await tx
        .update(conversationMembers)
        .set({ lastReadSeq: sql`greatest(${conversationMembers.lastReadSeq}, ${seqRow.seq})` })
        .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));
      out.inserted = (await loadMessageRow(tx, row.id)) ?? undefined;
    });
  } catch (err) {
    out.release?.();
    if (isUniqueViolation(err, 'chat_messages_dedupe_uq')) {
      const again = await existing(db);
      if (again) return { message: again, duplicate: true };
    }
    throw err;
  }
  if (out.duplicate) return { message: out.duplicate, duplicate: true };
  if (!out.inserted) throw new GatewayError(500, 'internal_error', 'Không đọc lại được tin vừa gửi');
  await publishMessageFrame(db, bus, out.inserted, 'msg');
  return { message: toMessage(out.inserted, userId, new Set()), duplicate: false };
}

const seqOf = (n: number | undefined): number | undefined => (n === undefined || !Number.isFinite(n) ? undefined : Math.max(0, Math.floor(n)));

/**
 * Trang tin theo `seq`, luôn trả theo thứ tự TĂNG. Chỉ từ `max(hidden_before_seq, joined_seq)` trở đi.
 * `afterSeq` → các tin mới hơn (bù tin; `afterSeq=0` = từ đầu); `beforeSeq` → các tin cũ hơn; không có → trang mới nhất.
 */
export async function listMessages(
  db: Db,
  userId: string,
  cid: string,
  opts: { beforeSeq?: number; afterSeq?: number; limit?: number } = {}
): Promise<{ messages: Message[]; hasMore: boolean }> {
  const { m } = await getMembership(db, userId, cid);
  const floor = Math.max(m.hiddenBeforeSeq, m.joinedSeq);
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? CHAT_LIMITS.pageDefault) || CHAT_LIMITS.pageDefault, 1), CHAT_LIMITS.pageMax);
  const after = seqOf(opts.afterSeq);
  const before = seqOf(opts.beforeSeq);
  if (after !== undefined && before !== undefined) throw new GatewayError(400, 'invalid_request', 'Chỉ một trong beforeSeq/afterSeq');

  const inConv = eq(chatMessages.conversationId, cid);
  let rows: MessageRow[];
  if (after !== undefined) {
    rows = (await selectMessages(db).where(and(inConv, gt(chatMessages.seq, Math.max(after, floor)))).orderBy(asc(chatMessages.seq)).limit(limit + 1)) as MessageRow[];
  } else {
    const cond = before !== undefined ? and(inConv, gt(chatMessages.seq, floor), lt(chatMessages.seq, before)) : and(inConv, gt(chatMessages.seq, floor));
    rows = (await selectMessages(db).where(cond).orderBy(desc(chatMessages.seq)).limit(limit + 1)) as MessageRow[];
  }
  const hasMore = rows.length > limit;
  rows = rows.slice(0, limit);
  if (after === undefined) rows.reverse();

  const senders = [...new Set(rows.map((r) => r.m.senderId).filter((s): s is string => !!s && s !== userId))];
  const blocked = senders.length
    ? new Set((await db.select({ b: userBlocks.blockedId }).from(userBlocks).where(and(eq(userBlocks.blockerId, userId), inArray(userBlocks.blockedId, senders)))).map((r) => r.b))
    : new Set<string>();
  return { messages: rows.map((r) => toMessage(r, userId, blocked)), hasMore };
}
