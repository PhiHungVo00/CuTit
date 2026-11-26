import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { ChatErrorCode, CHAT_LIMITS, type Conversation } from '@vietlearning/contracts/api';
import { schema, type Db } from '../../db/client.js';
import { GatewayError } from '../../pipeline/RequestPipeline.js';
import type { ChatEligibilityFn } from './eligibility.js';

const { conversations, conversationMembers, chatMessages, friendships, socialProfiles, userBlocks } = schema;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Q = Db | Tx;

export const dmKeyOf = (x: string, y: string): string => (x < y ? `${x}:${y}` : `${y}:${x}`);
export const pairOf = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

type ConversationRow = typeof conversations.$inferSelect;
type MemberRow = typeof conversationMembers.$inferSelect;

/**
 * Người dùng PHẢI là thành viên đang ở trong cuộc trò chuyện (chưa rời). Người ngoài → 403 `not_a_member`
 * (id cuộc trò chuyện là uuid ngẫu nhiên, không dò được). Ném TRƯỚC mọi thao tác ghi.
 */
export async function getMembership(q: Q, userId: string, cid: string): Promise<{ conv: ConversationRow; m: MemberRow }> {
  const [row] = await q
    .select({ conv: conversations, m: conversationMembers })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(and(eq(conversationMembers.conversationId, cid), eq(conversationMembers.userId, userId), isNull(conversationMembers.leftAt)));
  if (!row) throw new GatewayError(403, ChatErrorCode.notAMember, 'Bạn không ở trong cuộc trò chuyện này');
  return row;
}

/** Các thành viên đang ở trong cuộc trò chuyện (kèm cài đặt "đã xem" để lọc khung `read`). */
export async function activeMembers(q: Q, cid: string): Promise<Array<{ userId: string; showReadReceipts: boolean }>> {
  return q
    .select({ userId: conversationMembers.userId, showReadReceipts: sql<boolean>`coalesce(${socialProfiles.showReadReceipts}, true)` })
    .from(conversationMembers)
    .leftJoin(socialProfiles, eq(socialProfiles.userId, conversationMembers.userId))
    .where(and(eq(conversationMembers.conversationId, cid), isNull(conversationMembers.leftAt)));
}

/** Ai trong `candidates` đã chặn `blockerOf`'s sender? → tập người nhận KHÔNG được thấy tin của `senderId`. */
export async function blockersOf(q: Q, senderId: string, candidates: readonly string[]): Promise<Set<string>> {
  if (!candidates.length) return new Set();
  const rows = await q
    .select({ b: userBlocks.blockerId })
    .from(userBlocks)
    .where(and(eq(userBlocks.blockedId, senderId), inArray(userBlocks.blockerId, [...candidates])));
  return new Set(rows.map((r) => r.b));
}

/** Trạng thái chặn giữa hai người (cả hai chiều). */
export async function blockState(q: Q, me: string, peer: string): Promise<'none' | 'i_blocked' | 'blocked_me'> {
  const rows = await q
    .select({ blocker: userBlocks.blockerId })
    .from(userBlocks)
    .where(or(and(eq(userBlocks.blockerId, me), eq(userBlocks.blockedId, peer)), and(eq(userBlocks.blockerId, peer), eq(userBlocks.blockedId, me))));
  if (rows.some((r) => r.blocker === me)) return 'i_blocked';
  return rows.length ? 'blocked_me' : 'none';
}

/**
 * Điều kiện nhắn trong 1-1: còn là bạn, không chặn nhau, người kia còn đủ điều kiện chat.
 * Người kia chặn mình → báo như "không khả dụng" (không cho người bị chặn biết mình bị chặn).
 * GỌI NGOÀI giao dịch (cổng điều kiện dùng `db`, PGlite một kết nối sẽ treo nếu gọi trong transaction).
 */
export async function assertDmReachable(db: Db, me: string, peer: string, gate?: ChatEligibilityFn): Promise<void> {
  const [a, b] = pairOf(me, peer);
  const [f] = await db.select({ id: friendships.id }).from(friendships).where(and(eq(friendships.userA, a), eq(friendships.userB, b)));
  if (!f) throw new GatewayError(404, ChatErrorCode.peerUnavailable, 'Người này không còn khả dụng để nhắn tin');
  const bs = await blockState(db, me, peer);
  if (bs === 'i_blocked') throw new GatewayError(403, ChatErrorCode.blocked, 'Bạn đã chặn người này');
  if (bs === 'blocked_me') throw new GatewayError(404, ChatErrorCode.peerUnavailable, 'Người này không còn khả dụng để nhắn tin');
  if (gate) {
    const r = await gate(db, peer);
    if (!r.ok) throw new GatewayError(404, ChatErrorCode.peerUnavailable, 'Người này không còn khả dụng để nhắn tin');
  }
}

/** Người kia trong cuộc 1-1 (null nếu không tìm thấy). */
export async function dmPeerOf(q: Q, cid: string, me: string): Promise<string | null> {
  const [r] = await q
    .select({ u: conversationMembers.userId })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, cid), sql`${conversationMembers.userId} <> ${me}`));
  return r?.u ?? null;
}

const floorSeq = (m: MemberRow): number => Math.max(m.hiddenBeforeSeq, m.joinedSeq);
const unreadOf = (conv: ConversationRow, m: MemberRow): number => Math.max(0, conv.lastSeq - Math.max(m.lastReadSeq, floorSeq(m)));
const PREVIEW_MAX = 120;

/** Dựng `Conversation` cho một loạt dòng (gộp truy vấn: người kia + tin cuối). Không lộ nội dung tin thu hồi / của người đã chặn. */
async function toViews(db: Db, userId: string, rows: Array<{ conv: ConversationRow; m: MemberRow }>, now: Date): Promise<Conversation[]> {
  if (!rows.length) return [];
  const dmIds = rows.filter((r) => r.conv.kind === 'dm').map((r) => r.conv.id);
  const peers = dmIds.length
    ? await db
        .select({ cid: conversationMembers.conversationId, id: conversationMembers.userId, name: socialProfiles.displayName })
        .from(conversationMembers)
        .leftJoin(socialProfiles, eq(socialProfiles.userId, conversationMembers.userId))
        .where(and(inArray(conversationMembers.conversationId, dmIds), sql`${conversationMembers.userId} <> ${userId}`))
    : [];
  const peerOf = new Map(peers.map((p) => [p.cid, p]));

  const withLast = rows.filter((r) => r.conv.lastSeq > floorSeq(r.m));
  const lasts = withLast.length
    ? await db
        .select({
          cid: chatMessages.conversationId,
          seq: chatMessages.seq,
          kind: chatMessages.kind,
          body: chatMessages.body,
          senderId: chatMessages.senderId,
          deletedAt: chatMessages.deletedAt,
          createdAt: chatMessages.createdAt
        })
        .from(chatMessages)
        .where(or(...withLast.map((r) => and(eq(chatMessages.conversationId, r.conv.id), eq(chatMessages.seq, r.conv.lastSeq)))))
    : [];
  const senderIds = [...new Set(lasts.map((l) => l.senderId).filter((s): s is string => !!s && s !== userId))];
  const blocked = senderIds.length
    ? new Set(
        (await db.select({ b: userBlocks.blockedId }).from(userBlocks).where(and(eq(userBlocks.blockerId, userId), inArray(userBlocks.blockedId, senderIds)))).map((r) => r.b)
      )
    : new Set<string>();
  const lastOf = new Map(lasts.map((l) => [l.cid, l]));

  return rows.map(({ conv, m }) => {
    const p = peerOf.get(conv.id);
    const l = lastOf.get(conv.id);
    const hidePreview = !l || !!l.deletedAt || l.kind !== 'text' || (l.senderId !== null && l.senderId !== userId && blocked.has(l.senderId));
    return {
      id: conv.id,
      kind: conv.kind,
      title: conv.title,
      ...(conv.kind === 'dm' && p ? { peer: { id: p.id, displayName: p.name ?? '' } } : {}),
      lastSeq: conv.lastSeq,
      ...(l
        ? {
            lastMessage: {
              seq: l.seq,
              // tin thu hồi / bị chặn: chỉ báo "có tin", KHÔNG có chữ
              kind: l.kind,
              ...(hidePreview ? {} : { preview: (l.body ?? '').slice(0, PREVIEW_MAX) }),
              createdAt: l.createdAt.toISOString()
            }
          }
        : {}),
      unread: unreadOf(conv, m),
      muted: !!m.mutedUntil && m.mutedUntil.getTime() > now.getTime(),
      ...(conv.kind === 'group' ? { myRole: m.role } : {})
    };
  });
}

export async function getConversation(db: Db, userId: string, cid: string, now = new Date()): Promise<Conversation> {
  const row = await getMembership(db, userId, cid);
  return (await toViews(db, userId, [row], now))[0];
}

/**
 * Tạo/lấy cuộc 1-1 theo quan hệ bạn bè. Điều kiện: là bạn (của mình), không chặn nhau, người kia còn đủ điều kiện.
 * Mọi lý do "không được" từ phía người kia → `peer_unavailable` (không lộ lý do: tuổi, khách, chặn). Mỗi cặp ĐÚNG một cuộc
 * trò chuyện (`dm_key` duy nhất); gọi đồng thời vẫn ra cùng một cuộc.
 */
export async function getOrCreateDm(db: Db, userId: string, friendshipId: string, opts: { gate?: ChatEligibilityFn; now?: Date } = {}): Promise<Conversation> {
  const [f] = await db
    .select({ a: friendships.userA, b: friendships.userB })
    .from(friendships)
    .where(and(eq(friendships.id, friendshipId), or(eq(friendships.userA, userId), eq(friendships.userB, userId))));
  if (!f) throw new GatewayError(404, ChatErrorCode.peerUnavailable, 'Người này không còn khả dụng để nhắn tin');
  const peer = f.a === userId ? f.b : f.a;
  await assertDmReachable(db, userId, peer, opts.gate);

  const key = dmKeyOf(userId, peer);
  const cid = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(conversations)
      .values({ kind: 'dm', dmKey: key, createdBy: userId })
      .onConflictDoNothing({ target: conversations.dmKey })
      .returning({ id: conversations.id });
    const id = created?.id ?? (await tx.select({ id: conversations.id }).from(conversations).where(eq(conversations.dmKey, key)))[0].id;
    await tx
      .insert(conversationMembers)
      .values([
        { conversationId: id, userId, role: 'member' },
        { conversationId: id, userId: peer, role: 'member' }
      ])
      .onConflictDoNothing();
    return id;
  });
  return getConversation(db, userId, cid, opts.now);
}

/** Danh sách cuộc trò chuyện của tôi (mới nhất trước). Cuộc đã "xóa cho riêng mình" chỉ hiện lại khi có tin mới. */
export async function listConversations(
  db: Db,
  userId: string,
  opts: { cursor?: string; limit?: number; now?: Date } = {}
): Promise<{ conversations: Conversation[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? CHAT_LIMITS.pageDefault, 1), CHAT_LIMITS.pageMax);
  const sortAt = sql<Date>`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`;
  const cur = decodeCursor(opts.cursor);
  const rows = await db
    .select({ conv: conversations, m: conversationMembers, at: sortAt })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(
      and(
        eq(conversationMembers.userId, userId),
        isNull(conversationMembers.leftAt),
        or(eq(conversationMembers.hiddenBeforeSeq, 0), gt(conversations.lastSeq, conversationMembers.hiddenBeforeSeq)),
        cur ? sql`(${sortAt}, ${conversations.id}) < (${cur.at.toISOString()}::timestamptz, ${cur.id}::uuid)` : undefined
      )
    )
    .orderBy(desc(sortAt), desc(conversations.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const views = await toViews(db, userId, page, opts.now ?? new Date());
  const last = page[page.length - 1];
  return { conversations: views, nextCursor: rows.length > limit && last ? encodeCursor(new Date(last.at), last.conv.id) : null };
}

const encodeCursor = (at: Date, id: string): string => Buffer.from(`${at.toISOString()}|${id}`).toString('base64url');
function decodeCursor(c?: string): { at: Date; id: string } | null {
  if (!c) return null;
  const [iso, id] = Buffer.from(c, 'base64url').toString().split('|');
  const at = new Date(iso ?? '');
  if (!id || Number.isNaN(at.getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) throw new GatewayError(400, 'invalid_request', 'Cursor không hợp lệ');
  return { at, id };
}

/** Tổng số tin chưa đọc (cuộc đã tắt tiếng không tính vào chấm đỏ). */
export async function unreadSummary(db: Db, userId: string, now = new Date()): Promise<{ total: number; conversations: number }> {
  const unread = sql<number>`greatest(0, ${conversations.lastSeq} - greatest(${conversationMembers.lastReadSeq}, ${conversationMembers.hiddenBeforeSeq}, ${conversationMembers.joinedSeq}))`;
  const [r] = await db
    .select({ total: sql<number>`coalesce(sum(${unread}), 0)::int`, convs: sql<number>`count(*) filter (where ${unread} > 0)::int` })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(
      and(
        eq(conversationMembers.userId, userId),
        isNull(conversationMembers.leftAt),
        or(isNull(conversationMembers.mutedUntil), sql`${conversationMembers.mutedUntil} <= ${now.toISOString()}::timestamptz`)
      )
    );
  return { total: r?.total ?? 0, conversations: r?.convs ?? 0 };
}

/** "Xóa cuộc trò chuyện cho riêng mình": chỉ thấy tin MỚI hơn từ giờ (tin vẫn lưu, `unhide` để xem lại). */
export async function hideConversation(db: Db, userId: string, cid: string): Promise<void> {
  const { conv } = await getMembership(db, userId, cid);
  await db
    .update(conversationMembers)
    .set({ hiddenBeforeSeq: conv.lastSeq, lastReadSeq: sql`greatest(${conversationMembers.lastReadSeq}, ${conv.lastSeq})` })
    .where(and(eq(conversationMembers.conversationId, cid), eq(conversationMembers.userId, userId)));
}

export async function unhideConversation(db: Db, userId: string, cid: string): Promise<void> {
  await getMembership(db, userId, cid);
  await db
    .update(conversationMembers)
    .set({ hiddenBeforeSeq: 0 })
    .where(and(eq(conversationMembers.conversationId, cid), eq(conversationMembers.userId, userId)));
}

/** Tắt thông báo tới `mutedUntil` (null = bật lại). */
export async function muteConversation(db: Db, userId: string, cid: string, mutedUntil: Date | null): Promise<void> {
  await getMembership(db, userId, cid);
  await db
    .update(conversationMembers)
    .set({ mutedUntil })
    .where(and(eq(conversationMembers.conversationId, cid), eq(conversationMembers.userId, userId)));
}
