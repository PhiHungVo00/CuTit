import { and, count, desc, eq, gt, sql } from 'drizzle-orm';
import {
  CHAT_LIMITS,
  FriendErrorCode,
  type FriendRequest,
  type FriendRequestCreateResponse
} from '@vietlearning/contracts/api';
import { schema, type Db } from '../../db/client.js';
import { GatewayError } from '../../pipeline/RequestPipeline.js';
import { uniqueViolation } from '../auth/accounts.js';
import type { RateCounters } from '../auth/rateCounter.js';
import { isBlockedEitherWay, lockUsers } from './blocks.js';
import { chatEligibility, requireChatEligible } from './eligibility.js';
import { createFriendship } from './friends.js';

/**
 * Dự án 4 (spec 5.2) — lời mời kết bạn bằng handle. Quy tắc quan trọng nhất: KHÔNG dò người dùng.
 * Mọi lý do "không thấy" (không tồn tại, không `discoverable`, bị chặn, chờ xóa, dưới 18, khách, bị khóa chat, chính mình,
 * người nhận đã đủ 50 lời mời chờ) đều trả CÙNG MỘT lỗi 404 `handle_not_found` với thân y hệt.
 */
const { friendRequests, friendships, socialProfiles, users } = schema;

export const MAX_PENDING_PER_RECIPIENT = 50;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const notFound = () => new GatewayError(404, FriendErrorCode.handleNotFound, 'Không tìm thấy tên này');
const requestNotFound = () => new GatewayError(404, FriendErrorCode.requestNotFound, 'Không tìm thấy lời mời');

export interface RequestEnv {
  now: Date;
  /** Bộ đếm dùng chung DB (auth_challenges) cho "tra cứu sai/giờ" */
  counters: RateCounters;
}

const badLookupKey = (userId: string) => `friend-bad-lookup:${userId}`;

export async function createFriendRequest(db: Db, fromId: string, handle: string, env: RequestEnv): Promise<FriendRequestCreateResponse> {
  const { now, counters } = env;
  await requireChatEligible(db, fromId, now);

  // Hai giới hạn kiểm TRƯỚC khi tra: người gửi tự biết số lần của mình, không lộ gì về người nhận
  const [{ n: sentToday }] = await db
    .select({ n: count() })
    .from(friendRequests)
    .where(and(eq(friendRequests.fromUserId, fromId), gt(friendRequests.createdAt, new Date(now.getTime() - DAY_MS))));
  if (sentToday >= CHAT_LIMITS.friendRequestsPerDay) throw new GatewayError(429, FriendErrorCode.requestLimit, 'Hôm nay bạn đã gửi quá nhiều lời mời');
  if ((await counters.count(db, badLookupKey(fromId), now)) >= CHAT_LIMITS.badHandleLookupsPerHour) {
    throw new GatewayError(429, FriendErrorCode.requestLimit, 'Bạn đã thử quá nhiều tên sai, hãy thử lại sau');
  }

  try {
    return await sendTo(db, fromId, handle, now);
  } catch (err) {
    if (err instanceof GatewayError && err.code === FriendErrorCode.handleNotFound) await counters.hit(db, badLookupKey(fromId), HOUR_MS, now);
    throw err;
  }
}

async function sendTo(db: Db, fromId: string, handle: string, now: Date): Promise<FriendRequestCreateResponse> {
  const [target] = await db
    .select({ id: socialProfiles.userId, discoverable: socialProfiles.discoverable })
    .from(socialProfiles)
    .where(sql`lower(${socialProfiles.handle}) = ${handle.toLowerCase()}`);
  if (!target || target.id === fromId || !target.discoverable) throw notFound();
  // người nhận phải đủ điều kiện chat: không phải khách, không chờ xóa, đủ 18, có handle, không bị khóa chat
  if (!(await chatEligibility(db, target.id, now)).ok) throw notFound();
  if (await isBlockedEitherWay(db, fromId, target.id)) throw notFound();

  const toId = target.id;
  return db.transaction(async (tx) => {
    // Khóa cặp theo thứ tự id: hai lời mời chéo A→B / B→A đồng thời không bỏ lỡ nhau; chặn đồng thời cũng xếp hàng
    await lockUsers(tx, fromId, toId);
    if (await isBlockedEitherWay(tx, fromId, toId)) throw notFound();

    // Lời mời chéo: bên kia đã mời mình => ghép thành bạn ngay
    const [reverse] = await tx
      .select({ id: friendRequests.id })
      .from(friendRequests)
      .where(and(eq(friendRequests.fromUserId, toId), eq(friendRequests.toUserId, fromId), eq(friendRequests.status, 'pending')));
    if (reverse) {
      await tx.update(friendRequests).set({ status: 'accepted', resolvedAt: now }).where(eq(friendRequests.id, reverse.id));
      await createFriendship(tx, fromId, toId, now);
      return { status: 'accepted' } as const;
    }

    // Đã là bạn: người gửi vốn biết điều này nên không lộ gì thêm
    const [a, b] = fromId < toId ? [fromId, toId] : [toId, fromId];
    const [friend] = await tx.select({ id: friendships.id }).from(friendships).where(and(eq(friendships.userA, a), eq(friendships.userB, b)));
    if (friend) throw new GatewayError(409, FriendErrorCode.alreadyFriends, 'Hai bạn đã là bạn');

    // Đã mời rồi và còn chờ: trả lại lời mời cũ, không tạo thêm (không tốn hạn mức)
    const [dup] = await tx
      .select({ id: friendRequests.id })
      .from(friendRequests)
      .where(and(eq(friendRequests.fromUserId, fromId), eq(friendRequests.toUserId, toId), eq(friendRequests.status, 'pending')));
    if (dup) return { status: 'pending' } as const;

    // Người nhận bị dồn lời mời: cùng lỗi "không thấy" (không lộ rằng người đó có/được nhiều lời mời)
    const [{ n: pending }] = await tx
      .select({ n: count() })
      .from(friendRequests)
      .where(and(eq(friendRequests.toUserId, toId), eq(friendRequests.status, 'pending')));
    if (pending >= MAX_PENDING_PER_RECIPIENT) throw notFound();

    try {
      await tx.insert(friendRequests).values({ fromUserId: fromId, toUserId: toId, createdAt: now });
    } catch (err) {
      if (!uniqueViolation(err)) throw err; // đã có lời mời chờ (đua): coi như trả lại lời mời cũ
    }
    return { status: 'pending' } as const;
  });
}

/** Lời mời đang chờ gửi tới tôi: chỉ thấy tên hiển thị người gửi (không userId), bỏ người đang chờ xóa */
export async function listIncomingRequests(db: Db, userId: string): Promise<FriendRequest[]> {
  const rows = await db
    .select({ id: friendRequests.id, displayName: socialProfiles.displayName, createdAt: friendRequests.createdAt })
    .from(friendRequests)
    .innerJoin(socialProfiles, eq(socialProfiles.userId, friendRequests.fromUserId))
    .innerJoin(users, eq(users.id, friendRequests.fromUserId))
    .where(and(eq(friendRequests.toUserId, userId), eq(friendRequests.status, 'pending'), sql`${users.deleteAt} is null`))
    .orderBy(desc(friendRequests.createdAt))
    .limit(CHAT_LIMITS.pageMax);
  return rows.map((r) => ({ id: r.id, from: { displayName: r.displayName }, createdAt: r.createdAt.toISOString() }));
}

/**
 * Trả lời lời mời GỬI TỚI TÔI. Không phải của tôi / không tồn tại / đã xử lý => cùng `request_not_found`.
 * Chấp nhận => tạo quan hệ bạn bè (nếu người gửi còn đủ điều kiện và không chặn nhau) và trả `friendshipId`.
 */
export async function respondRequest(
  db: Db,
  userId: string,
  requestId: string,
  action: 'accept' | 'decline',
  now: Date = new Date()
): Promise<{ friendshipId: string } | { declined: true }> {
  const [req] = await db
    .select({ from: friendRequests.fromUserId })
    .from(friendRequests)
    .where(and(eq(friendRequests.id, requestId), eq(friendRequests.toUserId, userId), eq(friendRequests.status, 'pending')));
  if (!req) throw requestNotFound();
  if (action === 'decline') {
    // chỉ chuyển trạng thái khi còn pending (hai lệnh đồng thời: lệnh sau không làm gì thêm)
    await db
      .update(friendRequests)
      .set({ status: 'declined', resolvedAt: now })
      .where(and(eq(friendRequests.id, requestId), eq(friendRequests.status, 'pending')));
    return { declined: true };
  }
  const senderOk = (await chatEligibility(db, req.from, now)).ok;
  if (!senderOk) {
    // người gửi không còn đủ điều kiện: lời mời không còn ý nghĩa, đóng lại để khỏi nằm mãi trong hộp thư
    await db.update(friendRequests).set({ status: 'canceled', resolvedAt: now }).where(and(eq(friendRequests.id, requestId), eq(friendRequests.status, 'pending')));
    throw requestNotFound();
  }
  return db.transaction(async (tx) => {
    await lockUsers(tx, userId, req.from);
    const claimed = await tx
      .update(friendRequests)
      .set({ status: 'accepted', resolvedAt: now })
      .where(and(eq(friendRequests.id, requestId), eq(friendRequests.toUserId, userId), eq(friendRequests.status, 'pending')))
      .returning({ id: friendRequests.id });
    if (!claimed.length) throw requestNotFound();
    if (await isBlockedEitherWay(tx, userId, req.from)) {
      // đã chặn nhau (lời mời bị hủy bởi lệnh chặn): rollback và báo như không tìm thấy
      throw requestNotFound();
    }
    // lời mời ngược của chính tôi tới người đó (nếu có) cũng xong
    await tx
      .update(friendRequests)
      .set({ status: 'accepted', resolvedAt: now })
      .where(and(eq(friendRequests.fromUserId, userId), eq(friendRequests.toUserId, req.from), eq(friendRequests.status, 'pending')));
    const f = await createFriendship(tx, userId, req.from, now);
    return { friendshipId: f.id };
  });
}
