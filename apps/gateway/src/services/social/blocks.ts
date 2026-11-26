import { and, eq, inArray, or } from 'drizzle-orm';
import { ChatErrorCode, FriendErrorCode } from '@vietlearning/contracts/api';
import { schema, type Db } from '../../db/client.js';
import { GatewayError } from '../../pipeline/RequestPipeline.js';

/**
 * Dự án 4 (spec 5.2) — chặn người dùng. Chặn => xóa quan hệ bạn bè (nhiệm vụ tuần chung tính từ quan hệ nên mất theo)
 * + hủy lời mời đang chờ giữa hai người. Bỏ chặn KHÔNG tự kết bạn lại. Cả hai lệnh idempotent.
 */
const { userBlocks, friendships, friendRequests, users } = schema;

export const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Khóa hai hàng user theo thứ tự id (chống deadlock): kết bạn / chặn / bật nhiệm vụ của cùng một cặp phải xếp hàng,
 * nên "chặn" và "chấp nhận lời mời" đua nhau không để lại cặp bạn bè đã bị chặn. NO KEY UPDATE như acceptInvite.
 */
export async function lockUsers(tx: Tx, x: string, y: string): Promise<void> {
  await tx.select({ id: users.id }).from(users).where(inArray(users.id, [x, y])).orderBy(users.id).for('no key update');
}

export async function blockUser(db: Db, blockerId: string, targetId: string, now: Date = new Date()): Promise<void> {
  if (blockerId === targetId) throw new GatewayError(400, ChatErrorCode.forbidden, 'Không chặn được chính mình');
  const [t] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetId));
  if (!t) throw new GatewayError(404, FriendErrorCode.handleNotFound, 'Không tìm thấy người này');
  const [a, b] = pair(blockerId, targetId);
  await db.transaction(async (tx) => {
    await lockUsers(tx, blockerId, targetId);
    await tx.insert(userBlocks).values({ blockerId, blockedId: targetId, createdAt: now }).onConflictDoNothing();
    await tx.delete(friendships).where(and(eq(friendships.userA, a), eq(friendships.userB, b)));
    await tx
      .update(friendRequests)
      .set({ status: 'canceled', resolvedAt: now })
      .where(
        and(
          eq(friendRequests.status, 'pending'),
          or(
            and(eq(friendRequests.fromUserId, blockerId), eq(friendRequests.toUserId, targetId)),
            and(eq(friendRequests.fromUserId, targetId), eq(friendRequests.toUserId, blockerId))
          )
        )
      );
  });
}

export async function unblockUser(db: Db, blockerId: string, targetId: string): Promise<void> {
  await db.delete(userBlocks).where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, targetId)));
}

/** Một trong hai bên chặn bên kia? (Task 4, 5, 12, 13 dùng) */
export async function isBlockedEitherWay(db: Db | Tx, x: string, y: string): Promise<boolean> {
  const [r] = await db
    .select({ b: userBlocks.blockerId })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerId, x), eq(userBlocks.blockedId, y)),
        and(eq(userBlocks.blockerId, y), eq(userBlocks.blockedId, x))
      )
    )
    .limit(1);
  return Boolean(r);
}
