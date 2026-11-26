import { randomInt } from 'node:crypto';
import { and, eq, gt, gte, inArray, lte, or, sql } from 'drizzle-orm';
import {
  DEFAULT_QUEST_GOAL,
  FriendErrorCode,
  INVITE_CODE_LENGTH,
  INVITE_TTL_HOURS,
  MAX_FRIENDS,
  RECOVERY_ALPHABET,
  formatInviteCode,
  type FriendInvite,
  type FriendQuest,
  type FriendsResponse
} from '@vietlearning/contracts/api';
import { schema, type Db } from '../../db/client.js';
import { GatewayError } from '../../pipeline/RequestPipeline.js';
import { isBlockedEitherWay, lockUsers } from './blocks.js';

/**
 * GĐ4c — bạn học HỢP TÁC. Mọi hàm nhận userId của principal đã xác thực; bạn bè chỉ đọc được tên hiển thị +
 * số phút học trong tuần (từ daily_activity), không bao giờ userId, lỗi, điểm hay XP của nhau.
 * Tiến độ/streak KHÔNG lưu: tính lúc đọc => xóa tài khoản (cascade) là đóng góp biến mất theo.
 */
const { users, socialProfiles, friendInvites, friendships, dailyActivity } = schema;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Giới hạn số tuần nhìn lại khi tính streak chung (2 năm) */
const MAX_STREAK_WEEKS = 104;

// ---------- Tuần theo ngày địa phương 'YYYY-MM-DD' (thứ Hai là ngày đầu tuần) ----------

const addDays = (day: string, n: number): string => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const weekStartOf = (day: string): string => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));

// ---------- Quyền ----------

async function displayNameOf(db: Db | Tx, userId: string): Promise<string | null> {
  const [p] = await db.select({ n: socialProfiles.displayName }).from(socialProfiles).where(eq(socialProfiles.userId, userId));
  return p?.n ?? null;
}

export async function setDisplayName(db: Db, userId: string, displayName: string, now = new Date()): Promise<string> {
  await db
    .insert(socialProfiles)
    .values({ userId, displayName, updatedAt: now })
    .onConflictDoUpdate({ target: socialProfiles.userId, set: { displayName, updatedAt: now } });
  return displayName;
}

// ---------- Mã mời ----------

function newInviteCode(): string {
  let s = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) s += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
  return s;
}

/** Tạo mã mới (thay mã cũ, mã cũ hết hiệu lực ngay) */
export async function createInvite(db: Db, userId: string, now = new Date()): Promise<FriendInvite> {
  if (!(await displayNameOf(db, userId))) throw new GatewayError(409, FriendErrorCode.nameRequired, 'Hãy đặt tên hiển thị trước');
  const code = newInviteCode();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_HOURS * 3600e3);
  await db
    .insert(friendInvites)
    .values({ userId, code, expiresAt, createdAt: now })
    .onConflictDoUpdate({ target: friendInvites.userId, set: { code, expiresAt, createdAt: now } });
  return { code: formatInviteCode(code), expiresAt: expiresAt.toISOString() };
}

const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

/**
 * Dự án 4: MAX_FRIENDS = 5 là giới hạn của NHIỆM VỤ TUẦN CHUNG (cặp có `quest_active`), không còn là giới hạn của việc
 * "là bạn" (nhắn tin). `excludeId` = bỏ một quan hệ khỏi phép đếm (khi bật lại chính nó).
 */
async function activeQuestCount(tx: Tx, userId: string, excludeId?: string): Promise<number> {
  const rows = await tx
    .select({ id: friendships.id })
    .from(friendships)
    .where(and(or(eq(friendships.userA, userId), eq(friendships.userB, userId)), eq(friendships.questActive, true)));
  return rows.filter((r) => r.id !== excludeId).length;
}

/**
 * Tạo quan hệ bạn bè (gọi SAU `lockUsers`). Cặp đã là bạn => trả quan hệ cũ (`created:false`).
 * `quest_active` = cả hai bên còn chỗ trong 5 nhiệm vụ tuần; bạn thứ 6+ vẫn là bạn nhưng không có nhiệm vụ.
 */
export async function createFriendship(tx: Tx, x: string, y: string, now: Date): Promise<{ id: string; created: boolean }> {
  const [a, b] = pair(x, y);
  const [existing] = await tx.select({ id: friendships.id }).from(friendships).where(and(eq(friendships.userA, a), eq(friendships.userB, b)));
  if (existing) return { id: existing.id, created: false };
  const questActive = (await activeQuestCount(tx, x)) < MAX_FRIENDS && (await activeQuestCount(tx, y)) < MAX_FRIENDS;
  const [f] = await tx
    .insert(friendships)
    .values({ userA: a, userB: b, goalMinutes: DEFAULT_QUEST_GOAL, createdAt: now, questActive })
    .returning({ id: friendships.id });
  return { id: f.id, created: true };
}

/**
 * Nhập mã: tất cả trong MỘT transaction. Mọi lỗi sau khi “giữ” mã đều ném GatewayError => rollback => mã còn nguyên.
 * Mã sai / hết hạn / đã dùng / của tài khoản không còn được phép: cùng một lỗi `invite_invalid`.
 */
export async function acceptInvite(db: Db, userId: string, code: string, today: string, now = new Date()): Promise<FriendQuest> {
  if (!(await displayNameOf(db, userId))) throw new GatewayError(409, FriendErrorCode.nameRequired, 'Hãy đặt tên hiển thị trước');
  const friendshipId = await db.transaction(async (tx) => {
    const [inv] = await tx
      .delete(friendInvites)
      .where(and(eq(friendInvites.code, code), gt(friendInvites.expiresAt, now)))
      .returning({ inviter: friendInvites.userId });
    if (!inv) throw new GatewayError(404, FriendErrorCode.inviteInvalid, 'Mã mời không đúng hoặc đã hết hạn');
    if (inv.inviter === userId) throw new GatewayError(400, FriendErrorCode.selfInvite, 'Đây là mã của chính bạn');
    // Khóa hai hàng user theo thứ tự id trước khi đếm/tạo: hai lượt đồng thời chạm cùng một người xếp hàng nhau
    // (chặn và kết bạn cũng dùng chung khóa này => không còn cặp bạn bè đã bị chặn).
    await lockUsers(tx, userId, inv.inviter);
    // Đang chặn nhau: cùng lỗi `invite_invalid` (không lộ ai đã chặn ai), mã còn nguyên vì rollback
    if (await isBlockedEitherWay(tx, userId, inv.inviter)) throw new GatewayError(404, FriendErrorCode.inviteInvalid, 'Mã mời không đúng hoặc đã hết hạn');
    const f = await createFriendship(tx, userId, inv.inviter, now);
    if (!f.created) throw new GatewayError(409, FriendErrorCode.alreadyFriends, 'Hai bạn đã là bạn học');
    return f.id;
  });
  return (await friendQuest(db, userId, friendshipId, today))!;
}

// ---------- Bạn bè + nhiệm vụ tuần chung ----------

type FriendshipRow = typeof friendships.$inferSelect;

async function questFor(db: Db, userId: string, f: FriendshipRow, today: string): Promise<FriendQuest> {
  const friendId = f.userA === userId ? f.userB : f.userA;
  const weekStart = weekStartOf(today);
  const weekEnd = addDays(weekStart, 6);
  // createdAt là giờ UTC còn tuần theo ngày địa phương của người hỏi: kẹp để tuần kết bạn không “ở tương lai”
  const firstWeek = [weekStartOf(f.createdAt.toISOString().slice(0, 10)), weekStart].sort()[0];
  const from = [firstWeek, addDays(weekStart, -7 * MAX_STREAK_WEEKS)].sort().at(-1)!;
  const rows = await db
    .select({ userId: dailyActivity.userId, day: dailyActivity.day, seconds: dailyActivity.seconds })
    .from(dailyActivity)
    .where(and(inArray(dailyActivity.userId, [userId, friendId]), gte(dailyActivity.day, from), lte(dailyActivity.day, weekEnd)));

  // giây theo (tuần, người) => phút làm tròn xuống từng người rồi mới cộng (khớp số hiển thị)
  const secs = new Map<string, number>();
  for (const r of rows) {
    const k = `${weekStartOf(r.day)}|${r.userId}`;
    secs.set(k, (secs.get(k) ?? 0) + r.seconds);
  }
  const minutes = (week: string, who: string) => Math.floor((secs.get(`${week}|${who}`) ?? 0) / 60);
  const total = (week: string) => minutes(week, userId) + minutes(week, friendId);

  const goal = f.goalMinutes;
  let streak = 0;
  if (weekStart >= firstWeek) {
    let w = total(weekStart) >= goal ? weekStart : addDays(weekStart, -7);
    while (w >= from && total(w) >= goal) {
      streak++;
      w = addDays(w, -7);
    }
  }

  const [myName, friendName] = await Promise.all([displayNameOf(db, userId), displayNameOf(db, friendId)]);
  const totalMinutes = total(weekStart);
  return {
    id: f.id,
    questActive: f.questActive,
    displayName: friendName ?? '—',
    since: f.createdAt.toISOString(),
    quest: {
      weekStart,
      weekEnd,
      goalMinutes: goal,
      totalMinutes,
      completed: totalMinutes >= goal,
      members: [
        { displayName: myName ?? '—', minutes: minutes(weekStart, userId), me: true },
        { displayName: friendName ?? '—', minutes: minutes(weekStart, friendId), me: false }
      ],
      streakWeeks: streak
    }
  };
}

const mine = (userId: string) => or(eq(friendships.userA, userId), eq(friendships.userB, userId));

/** null = không có quan hệ đó HOẶC không phải của người này (cùng một kết quả => không dò được id) */
export async function friendQuest(db: Db, userId: string, friendshipId: string, today: string): Promise<FriendQuest | null> {
  const [f] = await db.select().from(friendships).where(and(eq(friendships.id, friendshipId), mine(userId)));
  return f ? questFor(db, userId, f, today) : null;
}

/** Bạn đang chờ xóa tài khoản (30 ngày) bị ẩn; khôi phục thì hiện lại nguyên vẹn (quan hệ không bị xóa) */
async function withoutPendingDeletion(db: Db, userId: string, rows: FriendshipRow[]): Promise<FriendshipRow[]> {
  if (!rows.length) return rows;
  const others = rows.map((f) => (f.userA === userId ? f.userB : f.userA));
  const pending = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, others), sql`${users.deleteAt} is not null`));
  const hidden = new Set(pending.map((p) => p.id));
  return rows.filter((f) => !hidden.has(f.userA === userId ? f.userB : f.userA));
}

export async function listFriends(db: Db, userId: string, today: string, now = new Date()): Promise<FriendsResponse> {
  const [displayName, inv, rows] = await Promise.all([
    displayNameOf(db, userId),
    db.select().from(friendInvites).where(and(eq(friendInvites.userId, userId), gt(friendInvites.expiresAt, now))),
    db.select().from(friendships).where(mine(userId)).orderBy(friendships.createdAt)
  ]);
  const visible = await withoutPendingDeletion(db, userId, rows);
  return {
    displayName,
    invite: inv[0] ? { code: formatInviteCode(inv[0].code), expiresAt: inv[0].expiresAt.toISOString() } : null,
    maxFriends: MAX_FRIENDS,
    friends: await Promise.all(visible.map((f) => questFor(db, userId, f, today)))
  };
}

export async function setGoal(db: Db, userId: string, friendshipId: string, goalMinutes: number, today: string): Promise<FriendQuest> {
  const [f] = await db.update(friendships).set({ goalMinutes }).where(and(eq(friendships.id, friendshipId), mine(userId))).returning();
  if (!f) throw new GatewayError(404, FriendErrorCode.friendNotFound, 'Không tìm thấy bạn học');
  return questFor(db, userId, f, today);
}

export async function removeFriend(db: Db, userId: string, friendshipId: string): Promise<void> {
  const del = await db.delete(friendships).where(and(eq(friendships.id, friendshipId), mine(userId))).returning({ id: friendships.id });
  if (!del.length) throw new GatewayError(404, FriendErrorCode.friendNotFound, 'Không tìm thấy bạn học');
}

/** Bật/tắt nhiệm vụ tuần của một cặp. Bật khi một trong hai bên đã đủ 5 nhiệm vụ => `friend_limit`. */
export async function setQuestActive(db: Db, userId: string, friendshipId: string, active: boolean, today: string): Promise<FriendQuest> {
  const f = await db.transaction(async (tx) => {
    const [cur] = await tx.select().from(friendships).where(and(eq(friendships.id, friendshipId), mine(userId)));
    if (!cur) throw new GatewayError(404, FriendErrorCode.friendNotFound, 'Không tìm thấy bạn học');
    await lockUsers(tx, cur.userA, cur.userB);
    if (active && !cur.questActive) {
      if ((await activeQuestCount(tx, cur.userA, cur.id)) >= MAX_FRIENDS || (await activeQuestCount(tx, cur.userB, cur.id)) >= MAX_FRIENDS) {
        throw new GatewayError(409, FriendErrorCode.friendLimit, `Mỗi người tối đa ${MAX_FRIENDS} nhiệm vụ tuần cùng lúc`);
      }
    }
    const [upd] = await tx.update(friendships).set({ questActive: active }).where(eq(friendships.id, cur.id)).returning();
    return upd;
  });
  return questFor(db, userId, f, today);
}
