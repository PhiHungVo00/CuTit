import { z } from 'zod';
import { PreferencesSchema } from './endpoints.js';

/**
 * Tài khoản khách + đồng bộ local-first (GĐ0).
 *
 * Luồng: lần gọi Gateway đầu tiên client tạo tài khoản khách (POST /v1/auth/guest) và nhận
 * access token ngắn hạn (JWT), refresh token (xoay vòng) và MÃ KHÔI PHỤC (chỉ trả một lần, server
 * chỉ giữ bản băm). Máy mới nhập mã khôi phục => POST /v1/auth/recover => token của cùng tài khoản.
 */

// ---------- Mã khôi phục ----------

/** Crockford base32 (bỏ I, L, O, U để không nhầm khi chép tay) */
export const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RECOVERY_CODE_LENGTH = 16;

/** Chuẩn hóa mã người học nhập: bỏ khoảng trắng/gạch, viết hoa, O→0, I/L→1 */
export function normalizeRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/** 'ABCDEFGHJKMNPQRS' => 'ABCD-EFGH-JKMN-PQRS' */
export const formatRecoveryCode = (code: string): string => normalizeRecoveryCode(code).replace(/(.{4})(?=.)/g, '$1-');

export const RecoveryCodeSchema = z
  .string()
  .max(40)
  .transform(normalizeRecoveryCode)
  .pipe(z.string().regex(new RegExp(`^[${RECOVERY_ALPHABET}]{${RECOVERY_CODE_LENGTH}}$`), 'Mã khôi phục không hợp lệ'));

// ---------- Auth ----------

export const AuthTokensSchema = z.object({
  accessToken: z.string().min(10),
  /** chuỗi ngẫu nhiên (không phải JWT), dùng một lần: mỗi lần làm mới nhận refresh token mới */
  refreshToken: z.string().min(20),
  /** số giây tới khi access token hết hạn */
  expiresIn: z.number().int().positive(),
  userId: z.string().uuid()
});
export type AuthTokens = z.infer<typeof AuthTokensSchema>;

// POST /v1/auth/guest (không body)
export const AuthGuestResponseSchema = AuthTokensSchema.extend({
  /** dạng XXXX-XXXX-XXXX-XXXX — chỉ trả MỘT lần, client lưu và hiển thị ở M12 */
  recoveryCode: z.string()
});
export type AuthGuestResponse = z.infer<typeof AuthGuestResponseSchema>;

// POST /v1/auth/refresh
export const AuthRefreshRequestSchema = z.object({ refreshToken: z.string().min(20).max(200) });

// POST /v1/auth/recover
export const AuthRecoverRequestSchema = z.object({ recoveryCode: RecoveryCodeSchema });

// DELETE /v1/me
export const DeleteMeResponseSchema = z.object({ deleted: z.literal(true) });

// ---------- Đồng bộ ----------

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD (giờ địa phương)');
const Dialect = z.enum(['north', 'central', 'south']);
export const SkillSchema = z.enum(['pronunciation', 'honorific', 'drill', 'sentence', 'dialect', 'vision', 'conversation']);

export const SyncProfileSchema = z.object({
  onboarded: z.boolean(),
  level: z.number().int().min(1).max(6),
  goal: z.string().max(40).nullable(),
  nativeLang: z.string().min(2).max(12),
  dialect: Dialect
});
export type SyncProfile = z.infer<typeof SyncProfileSchema>;

export const SyncCardSchema = z.object({
  itemRef: z.string().min(1).max(120),
  front: z.string().max(300),
  back: z.string().max(300),
  source: SkillSchema,
  ease: z.number().int().min(100).max(1000),
  intervalDays: z.number().int().min(0).max(36500),
  repetitions: z.number().int().min(0).max(10000),
  dueAt: z.string().datetime()
});
export type SyncCard = z.infer<typeof SyncCardSchema>;

export const SyncAttemptSchema = z.object({
  skill: SkillSchema,
  correct: z.boolean(),
  score: z.number().min(0).max(100).optional(),
  /** thời điểm làm bài (ISO) */
  at: z.string().datetime()
});
export type SyncAttempt = z.infer<typeof SyncAttemptSchema>;

/** Vượt unit (bài kiểm tra trong lộ trình) lưu ở lesson_progress với lessonId = `testout:<unitId>` */
export const TESTOUT_PREFIX = 'testout:';
export const MAX_FREEZES_HELD = 2;
export const DailyGoalSchema = z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]);

const base = {
  /** uuid client sinh cho MỖI sự kiện; gửi lại cùng id => server bỏ qua (idempotent) */
  clientEventId: z.string().uuid(),
  /** thời điểm thay đổi trên máy (ISO) — dùng cho luật “bản mới hơn thắng” */
  at: z.string().datetime()
};

export const SyncEventSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('profile.set'), profile: SyncProfileSchema }),
  z.object({ ...base, type: z.literal('preferences.set'), preferences: PreferencesSchema }),
  z.object({ ...base, type: z.literal('srs.upsert'), card: SyncCardSchema }),
  z.object({ ...base, type: z.literal('attempt.add'), attempt: SyncAttemptSchema }),
  /** tổng số giây đã học trong `day` (server giữ giá trị lớn nhất) */
  z.object({ ...base, type: z.literal('activity.set'), day: Day, seconds: z.number().int().min(0).max(86400) }),
  z.object({ ...base, type: z.literal('consent.grant'), key: z.string().regex(/^[\w.-]{1,40}$/), version: z.string().regex(/^[\w.-]{1,20}$/) }),
  // ---- GĐ1 (lộ trình, XP, huy hiệu): chỉ ghi/đọc tối thiểu ở GĐ0 ----
  z.object({
    ...base,
    type: z.literal('xp.add'),
    source: z.string().regex(/^[\w.:-]{1,40}$/),
    amount: z.number().int().min(1).max(1000),
    /** ngày địa phương được cộng XP */
    day: Day,
    lessonId: z.string().max(80).optional()
  }),
  z.object({
    ...base,
    type: z.literal('lesson.progress'),
    lessonId: z.string().min(1).max(80),
    status: z.enum(['started', 'completed']),
    score: z.number().int().min(0).max(100).optional()
  }),
  z.object({ ...base, type: z.literal('achievement.earn'), key: z.string().regex(/^[\w.:-]{1,60}$/) }),
  // ---- Nối GĐ0 ↔ GĐ1: cờ ngày + trạng thái lộ trình ----
  /** cờ của một ngày địa phương, chỉ BẬT (không tắt lại): đạt mục tiêu ngày / đã dùng đóng băng streak */
  z.object({ ...base, type: z.literal('day.mark'), day: Day, goalMet: z.literal(true).optional(), freezeUsed: z.literal(true).optional() }),
  /** trạng thái lộ trình không suy ra được từ sự kiện khác (bản mới hơn thắng — LWW) */
  z.object({
    ...base,
    type: z.literal('progress.set'),
    lessonsDone: z.number().int().min(0).max(100000),
    freezes: z.number().int().min(0).max(MAX_FREEZES_HELD),
    dailyGoal: DailyGoalSchema
  })
]);
export type SyncEvent = z.infer<typeof SyncEventSchema>;
export type SyncEventType = SyncEvent['type'];

export const SYNC_BATCH_MAX = 200;
export const SyncRequestSchema = z.object({ events: z.array(SyncEventSchema).max(SYNC_BATCH_MAX) });

export const ProgressSnapshotSchema = z.object({
  userId: z.string().uuid(),
  /** null = server chưa từng nhận hồ sơ */
  profile: SyncProfileSchema.nullable(),
  preferences: PreferencesSchema.nullable(),
  srs: z.array(SyncCardSchema),
  /** tối đa 1000 lượt gần nhất, cũ → mới */
  attempts: z.array(SyncAttemptSchema).max(1000),
  /** giây học theo ngày địa phương */
  activity: z.record(Day, z.number().int().min(0)),
  consents: z.array(z.object({ key: z.string(), version: z.string(), grantedAt: z.string().datetime() })),
  xp: z.object({ total: z.number().int().min(0), byDay: z.record(Day, z.number().int().min(0)) }),
  lessons: z.array(
    z.object({
      lessonId: z.string(),
      status: z.enum(['started', 'completed']),
      bestScore: z.number().int().nullable(),
      completedAt: z.string().datetime().nullable()
    })
  ),
  achievements: z.array(z.object({ key: z.string(), earnedAt: z.string().datetime() })),
  /** ngày đạt mục tiêu / ngày đã dùng đóng băng (tăng dần) */
  dayFlags: z.object({ goalMet: z.array(Day), frozen: z.array(Day) }).default({ goalMet: [], frozen: [] }),
  /** null = chưa từng nhận progress.set */
  progressState: z
    .object({ lessonsDone: z.number().int().min(0), freezes: z.number().int().min(0), dailyGoal: DailyGoalSchema })
    .nullable()
    .default(null)
});
export type ProgressSnapshot = z.infer<typeof ProgressSnapshotSchema>;

export const SyncResponseSchema = z.object({
  /** id đã áp dụng ở lần gửi này */
  accepted: z.array(z.string().uuid()),
  /** id đã nhận từ trước (gửi lại) — client cũng xóa khỏi hàng đợi */
  duplicates: z.array(z.string().uuid()),
  snapshot: ProgressSnapshotSchema
});
export type SyncResponse = z.infer<typeof SyncResponseSchema>;
