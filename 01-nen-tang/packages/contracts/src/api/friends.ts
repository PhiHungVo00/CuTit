import { z } from 'zod';
import { RECOVERY_ALPHABET } from './account.js';

/**
 * GĐ4c — Bạn học HỢP TÁC (D7 = không xếp hạng cạnh tranh).
 *
 * - Kết bạn bằng mã mời ngắn, dùng một lần, có hạn (tài khoản khách không có email/tên thật).
 * - Mỗi cặp bạn có MỘT nhiệm vụ tuần chung: cùng cộng dồn N phút học/tuần (tuần bắt đầu thứ Hai, theo ngày
 *   địa phương `today` của người hỏi). Số phút lấy từ thời gian học đã đồng bộ (`/v1/sync`, activity.set).
 * - Streak chung = số tuần liên tiếp cặp cùng đạt mục tiêu (tính từ tuần kết bạn).
 * - Riêng tư: bạn chỉ thấy tên hiển thị + số phút đóng góp vào nhiệm vụ chung. Không lộ userId, lỗi, điểm.
 */

export const MAX_FRIENDS = 5;
export const INVITE_CODE_LENGTH = 8;
export const INVITE_TTL_HOURS = 48;
export const QUEST_GOAL_OPTIONS = [30, 60, 90, 120] as const;
export const DEFAULT_QUEST_GOAL = 60;

/** Mã lỗi máy đọc được (trường `error` của thân lỗi Gateway) */
export const FriendErrorCode = {
  /** 409: chưa đặt tên hiển thị */
  nameRequired: 'display_name_required',
  /** 404: mã sai / hết hạn / đã dùng (cùng một lỗi để không dò được mã nào từng tồn tại) */
  inviteInvalid: 'invite_invalid',
  /** 400: nhập mã của chính mình */
  selfInvite: 'self_invite',
  /** 409 */
  alreadyFriends: 'already_friends',
  /** 409: một trong hai bên đã đủ MAX_FRIENDS bạn */
  friendLimit: 'friend_limit',
  /** 404 */
  friendNotFound: 'friend_not_found'
} as const;

/** 'abcd efgh' / 'ABCD-EFGH' => 'ABCDEFGH' (O→0, I/L→1 như mã khôi phục) */
export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

/** 'ABCDEFGH' => 'ABCD-EFGH' */
export const formatInviteCode = (code: string): string => normalizeInviteCode(code).replace(/(.{4})(?=.)/g, '$1-');

export const InviteCodeSchema = z
  .string()
  .max(20)
  .transform(normalizeInviteCode)
  .pipe(z.string().regex(new RegExp(`^[${RECOVERY_ALPHABET}]{${INVITE_CODE_LENGTH}}$`), 'Mã mời không hợp lệ'));

/**
 * Tên hiển thị tự chọn: 2–24 ký tự sau khi bỏ khoảng trắng thừa; chỉ chữ (mọi ngôn ngữ, có dấu), số,
 * khoảng trắng, . _ - ' — không cho link, @, emoji hay ký tự điều khiển.
 */
export const DisplayNameSchema = z
  .string()
  .max(100)
  .transform((s) => s.normalize('NFC').trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(2, 'Tên quá ngắn')
      .max(24, 'Tên quá dài')
      .regex(/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} ._'-]*$/u, 'Tên chỉ gồm chữ, số, khoảng trắng và . _ - \'')
  );

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// GET /v1/friends?today=YYYY-MM-DD
export const FriendsQuerySchema = z.object({ today: Day.optional() });

// PUT /v1/friends/profile
export const FriendProfileRequestSchema = z.object({ displayName: DisplayNameSchema });
export const FriendProfileResponseSchema = z.object({ displayName: z.string() });

// POST /v1/friends/invite (không body) => mã mới thay mã cũ
export const FriendInviteResponseSchema = z.object({
  /** dạng XXXX-XXXX */
  code: z.string(),
  expiresAt: z.string().datetime()
});
export type FriendInvite = z.infer<typeof FriendInviteResponseSchema>;

// POST /v1/friends/accept
export const FriendAcceptRequestSchema = z.object({ code: InviteCodeSchema });

// PUT /v1/friends/:id/goal
export const FriendGoalRequestSchema = z.object({
  goalMinutes: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(120)])
});

export const FriendIdParamsSchema = z.object({ id: z.string().uuid() });

/** Một người trong nhiệm vụ chung: KHÔNG có userId, chỉ tên + phút đóng góp tuần này */
export const QuestMemberSchema = z.object({
  displayName: z.string(),
  minutes: z.number().int().nonnegative(),
  me: z.boolean()
});

/** Bạn học + nhiệm vụ tuần chung của cặp. `id` là id quan hệ bạn bè (không phải id người dùng) */
export const FriendQuestSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  since: z.string().datetime(),
  quest: z.object({
    weekStart: Day,
    weekEnd: Day,
    goalMinutes: z.number().int().positive(),
    /** tổng “chúng ta” tuần này */
    totalMinutes: z.number().int().nonnegative(),
    completed: z.boolean(),
    /** thứ tự cố định: mình trước, bạn sau — không sắp theo đóng góp */
    members: z.array(QuestMemberSchema).length(2),
    /** số tuần liên tiếp cùng đạt (tuần này chưa đạt thì tính tới tuần trước) */
    streakWeeks: z.number().int().nonnegative()
  })
});
export type FriendQuest = z.infer<typeof FriendQuestSchema>;

export const FriendsResponseSchema = z.object({
  displayName: z.string().nullable(),
  invite: FriendInviteResponseSchema.nullable(),
  maxFriends: z.number().int().positive(),
  /** không .max(MAX_FRIENDS): hai lượt nhập mã đồng thời có thể vượt 1 bạn, GET không được vì thế mà lỗi 500 */
  friends: z.array(FriendQuestSchema)
});
export type FriendsResponse = z.infer<typeof FriendsResponseSchema>;

export const FriendRemoveResponseSchema = z.object({ removed: z.literal(true) });
