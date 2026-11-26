import { and, asc, eq, gt, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import {
  CHAT_LIMITS,
  ChatErrorCode,
  type Conversation,
  type SystemEvent
} from '@vietlearning/contracts/api';
import { schema, type Db } from '../../db/client.js';
import { GatewayError } from '../../pipeline/RequestPipeline.js';
import type { RealtimeBus } from '../realtime/RealtimeBus.js';
import { activeMembers, getConversation, type Q, type Tx } from './conversations.js';
import type { ChatEligibilityFn } from './eligibility.js';
import { GROUP_ADD_BATCH_MAX, GROUP_PUSH_MUTE_THRESHOLD, MUTED_FOREVER } from './groupRules.js';
import { bestEffort, safePublish, toMessage, type MessageRow } from './messages.js';

/**
 * Dự án 4, Task 12 — nhóm học (spec 6.1, 5.3, 5.6, 5.7). Cùng lõi chat với 1-1: MỘT dòng `chat_messages` cho mọi thành viên,
 * `seq` theo cuộc trò chuyện, `last_read_seq` theo thành viên (không nhân bản hộp thư).
 *
 * Bất biến: mỗi nhóm có ĐÚNG một `owner` đang ở trong nhóm. Mọi thao tác ghi chạy trong MỘT giao dịch và KHÓA DÒNG `conversations`
 * (`FOR UPDATE`) trước khi đọc quyền/số thành viên ⇒ hai yêu cầu thêm/xóa/rời/đổi vai trò cùng lúc được xếp hàng, không ai thấy trạng thái cũ.
 * Mọi lý do "không thêm được người này" (không là bạn, chặn hai chiều, dưới 18, khách, đang khóa/chờ xóa) cùng ra `peer_unavailable`
 * (không lộ ai dưới 18 / ai chặn mình). Tin hệ thống chỉ lưu `system_event` (không có chữ tiếng nào).
 * Cổng điều kiện (`gate`) gọi NGOÀI giao dịch (PGlite một kết nối sẽ treo nếu gọi trong transaction).
 */
const { conversations, conversationMembers, chatMessages, friendships, socialProfiles, userBlocks } = schema;

export interface GroupOpts {
  /** cổng điều kiện chat (Task 3). Bỏ trống = chỉ kiểm bạn bè + chặn (route luôn truyền cổng) */
  gate?: ChatEligibilityFn;
  /** trần mềm số thành viên đang ở trong nhóm (cấu hình `GROUP_SOFT_CAP`, mặc định 1000) */
  softCap?: number;
  now?: Date;
}

const DEFAULT_SOFT_CAP = 1000;
const DAY = 86_400_000;
const GATE_CHUNK = 25;

const unavailable = () => new GatewayError(404, ChatErrorCode.peerUnavailable, 'Có người không thể thêm vào nhóm');
const forbidden = (msg: string) => new GatewayError(403, ChatErrorCode.forbidden, msg);
const notMember = () => new GatewayError(403, ChatErrorCode.notAMember, 'Bạn không ở trong cuộc trò chuyện này');
const badRequest = (msg: string) => new GatewayError(400, 'invalid_request', msg);
const canManage = (role: string): boolean => role === 'owner' || role === 'admin';

type MemberRow = typeof conversationMembers.$inferSelect;
type ConvRow = typeof conversations.$inferSelect;

/** Khóa dòng cuộc trò chuyện, xác nhận là NHÓM và người gọi còn ở trong. Người ngoài → `not_a_member` (kể cả khi id là cuộc 1-1). */
async function lockGroup(tx: Tx, userId: string, cid: string): Promise<{ conv: ConvRow; me: MemberRow }> {
  const [conv] = await tx.select().from(conversations).where(eq(conversations.id, cid)).for('update');
  if (!conv) throw notMember(); // không tồn tại ≡ không ở trong (không cho dò id)
  const [me] = await tx
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, cid), eq(conversationMembers.userId, userId), isNull(conversationMembers.leftAt)));
  if (!me) throw notMember();
  if (conv.kind !== 'group') throw new GatewayError(404, ChatErrorCode.conversationNotFound, 'Đây không phải nhóm');
  return { conv, me };
}

async function countActive(q: Q, cid: string): Promise<number> {
  const [r] = await q
    .select({ n: sql<number>`count(*)::int` })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, cid), isNull(conversationMembers.leftAt)));
  return r?.n ?? 0;
}

async function friendsAmong(q: Q, me: string, ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await q
    .select({ a: friendships.userA, b: friendships.userB })
    .from(friendships)
    .where(or(and(eq(friendships.userA, me), inArray(friendships.userB, [...ids])), and(eq(friendships.userB, me), inArray(friendships.userA, [...ids]))));
  return new Set(rows.map((r) => (r.a === me ? r.b : r.a)));
}

/** Những người trong `ids` đã chặn `me` hoặc bị `me` chặn */
async function blockedWith(q: Q, me: string, ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await q
    .select({ blocker: userBlocks.blockerId, blocked: userBlocks.blockedId })
    .from(userBlocks)
    .where(or(and(eq(userBlocks.blockerId, me), inArray(userBlocks.blockedId, [...ids])), and(eq(userBlocks.blockedId, me), inArray(userBlocks.blockerId, [...ids]))));
  return new Set(rows.map((r) => (r.blocker === me ? r.blocked : r.blocker)));
}

/** Cổng điều kiện từng người (ngoài giao dịch, từng đợt nhỏ). Một người không đủ điều kiện → cả yêu cầu bị từ chối. */
async function assertAllEligible(db: Db, gate: ChatEligibilityFn | undefined, ids: readonly string[]): Promise<void> {
  if (!gate) return;
  for (let i = 0; i < ids.length; i += GATE_CHUNK) {
    const rs = await Promise.all(ids.slice(i, i + GATE_CHUNK).map((u) => gate(db, u)));
    if (rs.some((r) => !r.ok)) throw unavailable();
  }
}

/** Trong giao dịch: tất cả là bạn của `me` và không chặn hai chiều (kiểm lại SAU khi khóa, phòng vừa hủy kết bạn/chặn) */
async function assertFriendsUnblocked(tx: Tx, me: string, ids: readonly string[]): Promise<void> {
  if (!ids.length) return;
  const friends = await friendsAmong(tx, me, ids);
  if (ids.some((u) => !friends.has(u))) throw unavailable();
  if ((await blockedWith(tx, me, ids)).size) throw unavailable();
}

/**
 * Cấp N số `seq` liên tiếp (một câu UPDATE khóa dòng) và ghi N tin hệ thống. Tin hệ thống KHÔNG qua bộ giới hạn tốc độ,
 * KHÔNG có người gửi, KHÔNG có chữ.
 */
async function appendSystemMessages(tx: Tx, cid: string, events: readonly SystemEvent[], now: Date): Promise<{ rows: MessageRow[]; pre: number; post: number }> {
  const n = events.length;
  const [r] = await tx
    .update(conversations)
    .set({ lastSeq: sql`${conversations.lastSeq} + ${n}`, lastMessageAt: sql`greatest(coalesce(${conversations.lastMessageAt}, ${now.toISOString()}::timestamptz), ${now.toISOString()}::timestamptz)` })
    .where(eq(conversations.id, cid))
    .returning({ seq: conversations.lastSeq });
  const first = r.seq - n + 1;
  const inserted = await tx
    .insert(chatMessages)
    .values(events.map((e, i) => ({ conversationId: cid, seq: first + i, senderId: null, kind: 'system' as const, systemEvent: e as Record<string, unknown>, createdAt: now })))
    .returning();
  const rows: MessageRow[] = inserted.map((m) => ({ m, name: null, attId: null, attMedia: null, attDuration: null, attWidth: null, attHeight: null, attWaveform: null }));
  return { rows, pre: first - 1, post: r.seq };
}

/** Phát tin hệ thống + các khung thay đổi tới thành viên HIỆN TẠI (sau commit; mất khung thì client bù bằng REST) */
async function announce(
  db: Db,
  bus: RealtimeBus,
  cid: string,
  rows: readonly MessageRow[],
  frames: (members: string[]) => Array<{ to: readonly string[]; frame: Parameters<typeof safePublish>[2] }>
): Promise<void> {
  await bestEffort(async () => {
    const members = (await activeMembers(db, cid)).map((m) => m.userId);
    for (const row of rows) safePublish(bus, members, { t: 'msg', message: toMessage(row, '', new Set()) });
    for (const f of frames(members)) safePublish(bus, f.to, f.frame);
  });
}

/** Nhóm vừa chạm ≥ 200 thành viên: tắt sẵn thông báo đẩy (chỉ lưu cờ). Người đã có cài đặt riêng (đã tắt) giữ nguyên. */
async function defaultMuteLargeGroup(tx: Tx, cid: string, oldCount: number, newCount: number, newIds: readonly string[]): Promise<void> {
  if (newCount < GROUP_PUSH_MUTE_THRESHOLD) return;
  const crossed = oldCount < GROUP_PUSH_MUTE_THRESHOLD;
  await tx
    .update(conversationMembers)
    .set({ mutedUntil: MUTED_FOREVER })
    .where(
      and(
        eq(conversationMembers.conversationId, cid),
        isNull(conversationMembers.leftAt),
        isNull(conversationMembers.mutedUntil),
        crossed ? undefined : inArray(conversationMembers.userId, [...newIds])
      )
    );
}

// ───────────────────────────── tạo nhóm ─────────────────────────────

/**
 * Tạo nhóm: người tạo = `owner`; `memberIds` chỉ là BẠN của người tạo, không chặn hai chiều, còn đủ điều kiện chat; ≤ 5 nhóm/24 giờ/người;
 * tổng thành viên (kể cả người tạo) ≤ `softCap`. Một người không hợp lệ → KHÔNG tạo gì. Có tin hệ thống `group_created` (seq 1).
 */
export async function createGroup(db: Db, bus: RealtimeBus, userId: string, input: { title: string; memberIds: readonly string[] }, opts: GroupOpts = {}): Promise<Conversation> {
  const now = opts.now ?? new Date();
  const softCap = opts.softCap ?? DEFAULT_SOFT_CAP;
  const title = input.title.trim();
  const ids = [...new Set(input.memberIds)];
  if (!title || title.length > CHAT_LIMITS.groupTitleMax || title.includes('\u0000')) throw badRequest(`Tên nhóm phải từ 1 đến ${CHAT_LIMITS.groupTitleMax} ký tự`);
  if (!ids.length || ids.includes(userId)) throw badRequest('Danh sách thành viên không hợp lệ');
  if (ids.length + 1 > softCap) throw new GatewayError(409, ChatErrorCode.groupFull, `Nhóm tối đa ${softCap} thành viên`, { softCap });

  await assertAllEligible(db, opts.gate, ids);

  const cid = await db.transaction(async (tx) => {
    // tuần tự hóa các lần tạo nhóm của CÙNG một người để hạn mức 5/ngày không bị vượt khi gửi song song
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`group_create:${userId}`}))`);
    const [recent] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(conversations)
      .where(and(eq(conversations.kind, 'group'), eq(conversations.createdBy, userId), gt(conversations.createdAt, new Date(now.getTime() - DAY))));
    if ((recent?.n ?? 0) >= CHAT_LIMITS.groupsPerDay) {
      throw new GatewayError(429, ChatErrorCode.chatRate, 'Hôm nay bạn đã tạo quá nhiều nhóm', { retryAfterSec: 3600 });
    }
    await assertFriendsUnblocked(tx, userId, ids);

    const [conv] = await tx.insert(conversations).values({ kind: 'group', title, createdBy: userId, createdAt: now }).returning({ id: conversations.id });
    const { post } = await appendSystemMessages(tx, conv.id, [{ type: 'group_created', byUserId: userId }], now);
    // người vào từ đầu thấy tin hệ thống đầu tiên (joined_seq = 0); không có "chưa đọc" do chính việc tạo nhóm
    await tx.insert(conversationMembers).values([
      { conversationId: conv.id, userId, role: 'owner' as const, joinedAt: now, joinedSeq: 0, lastReadSeq: post },
      ...ids.map((u) => ({ conversationId: conv.id, userId: u, role: 'member' as const, joinedAt: now, joinedSeq: 0, lastReadSeq: post }))
    ]);
    await defaultMuteLargeGroup(tx, conv.id, 0, ids.length + 1, ids);
    return conv.id;
  });

  await bestEffort(async () => {
    const members = (await activeMembers(db, cid)).map((m) => m.userId);
    safePublish(bus, members, { t: 'conv', cid, change: 'created' });
  });
  return getConversation(db, userId, cid, now);
}

// ───────────────────────────── thêm / xóa / rời ─────────────────────────────

/**
 * Thêm thành viên (chủ/quản trị). Chỉ thêm BẠN của người thêm (không có link mời nhóm). Người đã ở trong nhóm thì bỏ qua (idempotent);
 * người từng rời/bị xóa vào lại = NGƯỜI MỚI (không thấy tin lúc vắng). Vượt `softCap` → `group_full`, không thêm ai.
 */
export async function addMembers(db: Db, bus: RealtimeBus, userId: string, cid: string, memberIds: readonly string[], opts: GroupOpts = {}): Promise<{ added: string[] }> {
  const now = opts.now ?? new Date();
  const softCap = opts.softCap ?? DEFAULT_SOFT_CAP;
  const ids = [...new Set(memberIds)];
  if (!ids.length || ids.length > GROUP_ADD_BATCH_MAX || ids.includes(userId)) throw badRequest('Danh sách thành viên không hợp lệ');

  // quyền TRƯỚC khi chạm cổng điều kiện (người ngoài/thành viên thường không dò được ai đủ điều kiện)
  await db.transaction(async (tx) => {
    const { me } = await lockGroup(tx, userId, cid);
    if (!canManage(me.role)) throw forbidden('Chỉ chủ hoặc quản trị nhóm được thêm thành viên');
  });
  await assertAllEligible(db, opts.gate, ids);

  const out = await db.transaction(async (tx) => {
    const { me } = await lockGroup(tx, userId, cid);
    if (!canManage(me.role)) throw forbidden('Chỉ chủ hoặc quản trị nhóm được thêm thành viên');
    const present = await tx
      .select({ u: conversationMembers.userId })
      .from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, cid), inArray(conversationMembers.userId, ids), isNull(conversationMembers.leftAt)));
    const here = new Set(present.map((r) => r.u));
    const toAdd = ids.filter((u) => !here.has(u));
    if (!toAdd.length) return { added: [] as string[], rows: [] as MessageRow[] };

    const oldCount = await countActive(tx, cid);
    if (oldCount + toAdd.length > softCap) throw new GatewayError(409, ChatErrorCode.groupFull, `Nhóm tối đa ${softCap} thành viên`, { softCap });
    await assertFriendsUnblocked(tx, userId, toAdd);

    const { rows, pre, post } = await appendSystemMessages(
      tx,
      cid,
      toAdd.map((u) => ({ type: 'member_added' as const, userId: u, byUserId: userId })),
      now
    );
    // người mới: joined_seq = last_seq TRƯỚC khi thêm (thấy tin "đã được thêm" nhưng không thấy tin cũ); vào lại = làm mới dòng cũ
    await tx
      .insert(conversationMembers)
      .values(toAdd.map((u) => ({ conversationId: cid, userId: u, role: 'member' as const, joinedAt: now, joinedSeq: pre, lastReadSeq: post })))
      .onConflictDoUpdate({
        target: [conversationMembers.conversationId, conversationMembers.userId],
        set: { role: 'member', joinedAt: now, joinedSeq: pre, leftAt: null, lastReadSeq: post, hiddenBeforeSeq: 0, mutedUntil: null },
        setWhere: isNotNull(conversationMembers.leftAt)
      });
    await defaultMuteLargeGroup(tx, cid, oldCount, oldCount + toAdd.length, toAdd);
    return { added: toAdd, rows };
  });

  if (out.added.length) {
    await announce(db, bus, cid, out.rows, (members) => out.added.map((u) => ({ to: members, frame: { t: 'member' as const, cid, userId: u, change: 'added' as const } })));
  }
  return { added: out.added };
}

/**
 * Xóa thành viên. Chủ xóa được quản trị và thành viên; quản trị chỉ xóa được thành viên thường; không ai xóa được chủ; tự xóa mình = `leaveGroup`.
 * Người bị xóa không đọc/ghi được nữa (`not_a_member`).
 */
export async function removeMember(db: Db, bus: RealtimeBus, userId: string, cid: string, targetId: string, now = new Date()): Promise<void> {
  if (targetId === userId) throw badRequest('Muốn rời nhóm hãy dùng chức năng rời nhóm');
  const rows = await db.transaction(async (tx) => {
    const { me } = await lockGroup(tx, userId, cid);
    if (!canManage(me.role)) throw forbidden('Chỉ chủ hoặc quản trị nhóm được xóa thành viên');
    const [t] = await tx
      .select()
      .from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, cid), eq(conversationMembers.userId, targetId), isNull(conversationMembers.leftAt)));
    if (!t) throw new GatewayError(404, ChatErrorCode.notAMember, 'Người này không ở trong nhóm');
    if (t.role === 'owner' || (me.role === 'admin' && t.role !== 'member')) throw forbidden('Bạn không có quyền xóa người này');
    await tx
      .update(conversationMembers)
      .set({ leftAt: now, role: 'member' })
      .where(and(eq(conversationMembers.conversationId, cid), eq(conversationMembers.userId, targetId)));
    return (await appendSystemMessages(tx, cid, [{ type: 'member_removed', userId: targetId, byUserId: userId }], now)).rows;
  });
  await announce(db, bus, cid, rows, (members) => [
    { to: [...members, targetId], frame: { t: 'member', cid, userId: targetId, change: 'removed' } }
  ]);
}

/**
 * Rời nhóm. Chủ rời: bắt buộc còn người kế vị — `successorId` (phải là thành viên đang ở trong nhóm) hoặc tự chọn quản trị rồi thành viên
 * vào SỚM nhất. Người cuối cùng rời → xóa nhóm. Người rời không đọc được tin về sau.
 */
export async function leaveGroup(db: Db, bus: RealtimeBus, userId: string, cid: string, opts: { successorId?: string; now?: Date } = {}): Promise<{ deleted: boolean }> {
  const now = opts.now ?? new Date();
  const out = await db.transaction(async (tx) => {
    const { me } = await lockGroup(tx, userId, cid);
    if (opts.successorId !== undefined && me.role !== 'owner') throw badRequest('Chỉ chủ nhóm mới chọn người kế vị');
    const others = await tx
      .select({ userId: conversationMembers.userId, role: conversationMembers.role, joinedAt: conversationMembers.joinedAt })
      .from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, cid), isNull(conversationMembers.leftAt), ne(conversationMembers.userId, userId)))
      .orderBy(asc(conversationMembers.joinedAt), asc(conversationMembers.userId));
    if (!others.length) {
      const all = await tx.select({ u: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, cid));
      await tx.delete(conversations).where(eq(conversations.id, cid)); // cascade thành viên + tin
      return { deleted: true as const, audience: all.map((r) => r.u), rows: [] as MessageRow[], successor: null as string | null };
    }
    let successor: string | null = null;
    if (me.role === 'owner') {
      if (opts.successorId !== undefined) {
        if (!others.some((o) => o.userId === opts.successorId)) throw new GatewayError(404, ChatErrorCode.notAMember, 'Người kế vị không ở trong nhóm');
        successor = opts.successorId;
      } else {
        successor = (others.find((o) => o.role === 'admin') ?? others[0]).userId;
      }
      await tx
        .update(conversationMembers)
        .set({ role: 'owner' })
        .where(and(eq(conversationMembers.conversationId, cid), eq(conversationMembers.userId, successor)));
    }
    await tx
      .update(conversationMembers)
      .set({ leftAt: now, role: 'member' })
      .where(and(eq(conversationMembers.conversationId, cid), eq(conversationMembers.userId, userId)));
    const { rows } = await appendSystemMessages(tx, cid, [{ type: 'member_left', userId }], now);
    return { deleted: false as const, audience: [] as string[], rows, successor };
  });

  if (out.deleted) {
    for (const u of out.audience) safePublish(bus, [u], { t: 'member', cid, userId: u, change: 'removed' });
    return { deleted: true };
  }
  await announce(db, bus, cid, out.rows, (members) => [
    { to: [...members, userId], frame: { t: 'member', cid, userId, change: 'left' } },
    ...(out.successor ? [{ to: members, frame: { t: 'member' as const, cid, userId: out.successor, change: 'role' as const } }] : [])
  ]);
  return { deleted: false };
}

// ───────────────────────────── tên, vai trò, giải tán ─────────────────────────────

/** Đổi tên nhóm (chủ/quản trị). Tin hệ thống `title_changed` mang tên mới (dữ liệu, không phải câu chữ). */
export async function setTitle(db: Db, bus: RealtimeBus, userId: string, cid: string, rawTitle: string, now = new Date()): Promise<void> {
  const title = rawTitle.trim();
  if (!title || title.length > CHAT_LIMITS.groupTitleMax || title.includes('\u0000')) throw badRequest(`Tên nhóm phải từ 1 đến ${CHAT_LIMITS.groupTitleMax} ký tự`);
  const rows = await db.transaction(async (tx) => {
    const { me } = await lockGroup(tx, userId, cid);
    if (!canManage(me.role)) throw forbidden('Chỉ chủ hoặc quản trị nhóm được đổi tên');
    await tx.update(conversations).set({ title }).where(eq(conversations.id, cid));
    return (await appendSystemMessages(tx, cid, [{ type: 'title_changed', byUserId: userId, title }], now)).rows;
  });
  await announce(db, bus, cid, rows, (members) => [{ to: members, frame: { t: 'conv', cid, change: 'title' } }]);
}

/** Đổi vai trò (CHỈ chủ): `admin` ⇄ `member`. Không đổi vai trò chính mình, không đặt ai làm `owner` ở đây (dùng `transferOwner`). */
export async function setRole(db: Db, bus: RealtimeBus, userId: string, cid: string, targetId: string, role: 'admin' | 'member'): Promise<void> {
  if (role !== 'admin' && role !== 'member') throw badRequest('Vai trò không hợp lệ');
  if (targetId === userId) throw badRequest('Không đổi được vai trò của chính mình');
  const changed = await db.transaction(async (tx) => {
    const { me } = await lockGroup(tx, userId, cid);
    if (me.role !== 'owner') throw forbidden('Chỉ chủ nhóm được đổi vai trò');
    const [t] = await tx
      .select()
      .from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, cid), eq(conversationMembers.userId, targetId), isNull(conversationMembers.leftAt)));
    if (!t) throw new GatewayError(404, ChatErrorCode.notAMember, 'Người này không ở trong nhóm');
    if (t.role === role) return false;
    await tx
      .update(conversationMembers)
      .set({ role })
      .where(and(eq(conversationMembers.conversationId, cid), eq(conversationMembers.userId, targetId)));
    return true;
  });
  if (changed) await announce(db, bus, cid, [], (members) => [{ to: members, frame: { t: 'member', cid, userId: targetId, change: 'role' } }]);
}

/** Chuyển quyền chủ (CHỈ chủ) cho một thành viên đang ở trong nhóm; chủ cũ thành `admin`. */
export async function transferOwner(db: Db, bus: RealtimeBus, userId: string, cid: string, targetId: string): Promise<void> {
  if (targetId === userId) throw badRequest('Bạn đang là chủ nhóm');
  await db.transaction(async (tx) => {
    const { me } = await lockGroup(tx, userId, cid);
    if (me.role !== 'owner') throw forbidden('Chỉ chủ nhóm được chuyển quyền');
    const moved = await tx
      .update(conversationMembers)
      .set({ role: 'owner' })
      .where(and(eq(conversationMembers.conversationId, cid), eq(conversationMembers.userId, targetId), isNull(conversationMembers.leftAt)))
      .returning({ u: conversationMembers.userId });
    if (!moved.length) throw new GatewayError(404, ChatErrorCode.notAMember, 'Người này không ở trong nhóm');
    await tx
      .update(conversationMembers)
      .set({ role: 'admin' })
      .where(and(eq(conversationMembers.conversationId, cid), eq(conversationMembers.userId, userId)));
  });
  await announce(db, bus, cid, [], (members) => [
    { to: members, frame: { t: 'member', cid, userId: targetId, change: 'role' } },
    { to: members, frame: { t: 'member', cid, userId, change: 'role' } }
  ]);
}

/** Giải tán nhóm (CHỈ chủ): xóa nhóm, thành viên và tin (cascade). Mọi thành viên nhận khung `member removed` của chính họ. */
export async function deleteGroup(db: Db, bus: RealtimeBus, userId: string, cid: string): Promise<void> {
  const audience = await db.transaction(async (tx) => {
    const { me } = await lockGroup(tx, userId, cid);
    if (me.role !== 'owner') throw forbidden('Chỉ chủ nhóm được giải tán nhóm');
    const all = await tx
      .select({ u: conversationMembers.userId })
      .from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, cid), isNull(conversationMembers.leftAt)));
    await tx.delete(conversations).where(eq(conversations.id, cid));
    return all.map((r) => r.u);
  });
  await bestEffort(async () => {
    for (const u of audience) safePublish(bus, [u], { t: 'member', cid, userId: u, change: 'removed' });
  });
}

// ───────────────────────────── đọc: danh sách thành viên, "đã xem bởi" ─────────────────────────────

const encodeCursor = (a: string, b: string): string => Buffer.from(`${a}|${b}`).toString('base64url');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function decodeCursor(c: string | undefined, kind: 'iso+id' | 'id'): { at?: Date; id: string } | null {
  if (!c) return null;
  const bad = () => badRequest('Cursor không hợp lệ');
  const parts = Buffer.from(c, 'base64url').toString().split('|');
  if (kind === 'id') {
    if (parts.length !== 1 || !UUID_RE.test(parts[0])) throw bad();
    return { id: parts[0] };
  }
  if (parts.length !== 2 || !ISO_RE.test(parts[0]) || !UUID_RE.test(parts[1])) throw bad();
  const at = new Date(parts[0]);
  if (Number.isNaN(at.getTime()) || at.getUTCFullYear() < 2000 || at.getUTCFullYear() > 2200) throw bad();
  return { at, id: parts[1] };
}

async function requireGroupMember(db: Db, userId: string, cid: string): Promise<{ conv: ConvRow; me: MemberRow }> {
  const [row] = await db
    .select({ conv: conversations, me: conversationMembers })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(and(eq(conversationMembers.conversationId, cid), eq(conversationMembers.userId, userId), isNull(conversationMembers.leftAt)));
  if (!row) throw notMember();
  if (row.conv.kind !== 'group') throw new GatewayError(404, ChatErrorCode.conversationNotFound, 'Đây không phải nhóm');
  return row;
}

/** Danh sách thành viên đang ở trong nhóm (cũ nhất trước), phân trang theo (joined_at, id) — dùng chỉ mục khóa chính (conversation_id, user_id). */
export async function listMembers(
  db: Db,
  userId: string,
  cid: string,
  opts: { cursor?: string; limit?: number } = {}
): Promise<{ members: Array<{ id: string; displayName: string; role: 'owner' | 'admin' | 'member'; joinedAt: string }>; nextCursor: string | null }> {
  await requireGroupMember(db, userId, cid);
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? CHAT_LIMITS.pageDefault) || CHAT_LIMITS.pageDefault, 1), CHAT_LIMITS.pageMax);
  const cur = decodeCursor(opts.cursor, 'iso+id');
  const rows = await db
    .select({ id: conversationMembers.userId, name: socialProfiles.displayName, role: conversationMembers.role, joinedAt: conversationMembers.joinedAt })
    .from(conversationMembers)
    .leftJoin(socialProfiles, eq(socialProfiles.userId, conversationMembers.userId))
    .where(
      and(
        eq(conversationMembers.conversationId, cid),
        isNull(conversationMembers.leftAt),
        cur ? sql`(${conversationMembers.joinedAt}, ${conversationMembers.userId}) > (${cur.at!.toISOString()}::timestamptz, ${cur.id}::uuid)` : undefined
      )
    )
    .orderBy(asc(conversationMembers.joinedAt), asc(conversationMembers.userId))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    members: page.map((r) => ({ id: r.id, displayName: r.name ?? '', role: r.role, joinedAt: r.joinedAt.toISOString() })),
    nextCursor: rows.length > limit && last ? encodeCursor(last.joinedAt.toISOString(), last.id) : null
  };
}

/**
 * "Đã xem bởi N" cho nhóm lớn (tải lười, phân trang). Chỉ tính người đã đọc tới `seq` VÀ có quyền thấy tin đó (`joined_seq < seq`),
 * bật "đã xem" — và đối xứng: người xem tắt "đã xem" của mình thì không thấy của người khác (spec 5.7). Không tính chính người hỏi.
 */
export async function listReaders(
  db: Db,
  userId: string,
  cid: string,
  seq: number,
  opts: { cursor?: string; limit?: number } = {}
): Promise<{ count: number; readers: Array<{ id: string; displayName: string }>; nextCursor: string | null }> {
  await requireGroupMember(db, userId, cid);
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? CHAT_LIMITS.pageDefault) || CHAT_LIMITS.pageDefault, 1), CHAT_LIMITS.pageMax);
  const [mine] = await db.select({ v: sql<boolean>`coalesce(${socialProfiles.showReadReceipts}, true)` }).from(socialProfiles).where(eq(socialProfiles.userId, userId));
  if (mine && mine.v === false) return { count: 0, readers: [], nextCursor: null };
  const cur = decodeCursor(opts.cursor, 'id');
  // người gửi tin đó luôn có last_read_seq ≥ seq nhưng không phải "người đã xem"
  const [msg] = await db.select({ s: chatMessages.senderId }).from(chatMessages).where(and(eq(chatMessages.conversationId, cid), eq(chatMessages.seq, seq)));
  const base = and(
    msg?.s ? ne(conversationMembers.userId, msg.s) : undefined,
    eq(conversationMembers.conversationId, cid),
    isNull(conversationMembers.leftAt),
    ne(conversationMembers.userId, userId),
    sql`${conversationMembers.lastReadSeq} >= ${seq}`,
    sql`${conversationMembers.joinedSeq} < ${seq}`,
    sql`coalesce(${socialProfiles.showReadReceipts}, true)`
  );
  const [c] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(conversationMembers)
    .leftJoin(socialProfiles, eq(socialProfiles.userId, conversationMembers.userId))
    .where(base);
  const rows = await db
    .select({ id: conversationMembers.userId, name: socialProfiles.displayName })
    .from(conversationMembers)
    .leftJoin(socialProfiles, eq(socialProfiles.userId, conversationMembers.userId))
    .where(and(base, cur ? gt(conversationMembers.userId, cur.id) : undefined))
    .orderBy(asc(conversationMembers.userId))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    count: c?.n ?? 0,
    readers: page.map((r) => ({ id: r.id, displayName: r.name ?? '' })),
    nextCursor: rows.length > limit && page.length ? Buffer.from(page[page.length - 1].id).toString('base64url') : null
  };
}
