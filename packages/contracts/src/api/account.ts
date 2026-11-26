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
/** Hình dạng cũ (xóa cứng ngay) — giữ tới khi Task 4 dự án 3 chuyển sang DeleteMeRequestSchema/DeleteMeResultSchema */
export const DeleteMeResponseSchema = z.object({ deleted: z.literal(true) });

// ---------- Dự án 3: đăng nhập Google + tên đăng nhập/mật khẩu ----------
// Spec: docs/superpowers/specs/2026-11-21-dang-nhap-design.md. `/v1/auth/*` không Bearer; `/v1/me/*` có Bearer.

/** Mã lỗi máy đọc được (trường `error` của thân lỗi Gateway) cho luồng tài khoản */
export const AuthErrorCode = {
  // có từ GĐ0
  accountDeleted: 'account_deleted',
  invalidRefreshToken: 'invalid_refresh_token',
  invalidRecoveryCode: 'invalid_recovery_code',
  /** 401: sai tên đăng nhập HOẶC mật khẩu HOẶC mã dự phòng — MỘT mã, thân lỗi giống hệt (không lộ tên tồn tại) */
  invalidCredentials: 'invalid_credentials',
  /** 409: chỉ ở đăng ký (được phép lộ, spec 6) */
  usernameTaken: 'username_taken',
  /** 400: mật khẩu phổ biến / trùng tên đăng nhập */
  weakPassword: 'weak_password',
  /** 409: danh tính đã thuộc tài khoản khác (không gộp hai tài khoản thật) */
  identityInUse: 'identity_in_use',
  /** 409: gỡ phương thức đăng nhập cuối (mã dự phòng không tính) */
  lastIdentity: 'last_identity',
  /** 401: credential của khách đã được gộp vào tài khoản — mời đăng nhập, KHÔNG xóa dữ liệu máy */
  accountMerged: 'account_merged',
  /** 401: mã khôi phục của khách đã nâng cấp thành tài khoản — mời đăng nhập */
  accountUpgraded: 'account_upgraded',
  /** 403: tài khoản đang chờ xóa (30 ngày) */
  accountPendingDeletion: 'account_pending_deletion',
  /** 503: nhà cung cấp (mail/Google) chưa cấu hình hoặc hết trần ngày => giao diện chỉ đường mã dự phòng */
  providerUnavailable: 'provider_unavailable',
  otpInvalid: 'otp_invalid',
  otpExpired: 'otp_expired',
  /** sai ≥ 5 lần: mã bị hủy */
  otpLocked: 'otp_locked',
  /** 409: thao tác chỉ dành cho tài khoản có mật khẩu (gắn email, tạo mã dự phòng) */
  passwordRequired: 'password_required',
  /** 429: khóa tạm theo (IP, tên) / trần IP */
  rateLimited: 'rate_limited',
  /** 409: vé gộp sai / hết hạn / đã dùng / không thuộc khách này (POST /v1/me/merge) — đăng nhập lại để lấy vé mới */
  mergeTicketInvalid: 'merge_ticket_invalid'
} as const;
export type AuthErrorCodeValue = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

export const AuthProviderSchema = z.enum(['google', 'password', 'email']);
export type AuthProvider = z.infer<typeof AuthProviderSchema>;

/** Không được dùng làm tên đăng nhập (so sau khi chuẩn hóa) */
export const RESERVED_USERNAMES: readonly string[] = ['admin', 'cutit', 'becutit', 'support', 'root', 'system', 'moderator'];
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/**
 * Tên đăng nhập: trim => CHỈ ASCII `A-Za-z0-9._` (từ chối Unicode TRƯỚC khi viết thường, để vd. ký hiệu Kelvin U+212A
 * không lặng lẽ thành 'k') => viết thường => 3–24 ký tự, không bắt đầu/kết thúc bằng '.', không thuộc danh sách cấm.
 * Dùng cùng một schema ở đăng ký, đăng nhập, đặt lại mật khẩu => chuẩn hóa nhất quán.
 */
export const UsernameSchema = z
  .string()
  .max(64)
  .transform((s) => s.trim())
  .pipe(
    z
      .string()
      .regex(/^[A-Za-z0-9._]+$/, 'Tên đăng nhập chỉ gồm chữ không dấu, số, dấu chấm, gạch dưới')
      .transform((s) => s.toLowerCase())
      .pipe(
        z
          .string()
          .min(USERNAME_MIN)
          .max(USERNAME_MAX)
          .regex(/^[^.].*[^.]$/, 'Không bắt đầu/kết thúc bằng dấu chấm')
          .refine((s) => !RESERVED_USERNAMES.includes(s), 'Tên đăng nhập không dùng được')
      )
  );

/** Mật khẩu: 8–128 ký tự, KHÔNG trim/biến đổi (NIST SP 800-63B). Chặn mật khẩu phổ biến ở Gateway (weak_password). */
export const PasswordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

/** trim => kiểm dạng email (Zod: chỉ ASCII) TRƯỚC khi viết thường — tránh ký tự Unicode (vd. Kelvin U+212A) lặng lẽ thành ASCII */
export const EmailSchema = z
  .string()
  .max(254)
  .transform((s) => s.trim())
  .pipe(z.string().email().transform((s) => s.toLowerCase()));

export const OtpCodeSchema = z.string().regex(/^\d{6}$/, 'Mã gồm 6 chữ số');

/** Mã dự phòng: cùng bảng chữ/độ dài/chuẩn hóa với mã khôi phục của khách */
export const BackupCodeSchema = RecoveryCodeSchema;

const Opaque = z.string().min(16).max(200);
const IsoDate = z.string().datetime();

// GET /v1/auth/nonce
export const AuthNonceResponseSchema = z.object({ nonce: Opaque, expiresIn: z.number().int().positive() });
export type AuthNonceResponse = z.infer<typeof AuthNonceResponseSchema>;

// POST /v1/auth/google (không Bearer: đăng nhập) · POST /v1/me/identities/google (Bearer: nâng cấp/liên kết)
export const AuthGoogleRequestSchema = z.object({ idToken: z.string().min(20).max(4096), nonce: Opaque });

// POST /v1/auth/register (Bearer khách tùy chọn: có thì nâng cấp chính khách đó)
export const AuthRegisterRequestSchema = z.object({ username: UsernameSchema, password: PasswordSchema });
// POST /v1/auth/login
export const AuthPasswordLoginRequestSchema = z.object({ username: UsernameSchema, password: z.string().min(1).max(PASSWORD_MAX) });

export const AuthSignedInSchema = AuthTokensSchema.extend({
  status: z.literal('signed_in'),
  isGuest: z.literal(false),
  providers: z.array(AuthProviderSchema),
  /** có khi tài khoản đang chờ xóa: client hỏi "Khôi phục tài khoản?" (POST /v1/me/restore) */
  restorable: z.object({ deleteAt: IsoDate }).optional()
});
export type AuthSignedIn = z.infer<typeof AuthSignedInSchema>;

export const AuthNeedsMergeSchema = z.object({
  status: z.literal('needs_merge'),
  /** dùng một lần, sống 10 phút, gắn cặp (khách hiện tại, tài khoản đích) */
  mergeTicket: Opaque,
  target: z.object({ createdAt: IsoDate, hasProgress: z.literal(true) })
});

export const AuthSignInResponseSchema = z.discriminatedUnion('status', [AuthSignedInSchema, AuthNeedsMergeSchema]);
export type AuthSignInResponse = z.infer<typeof AuthSignInResponseSchema>;

/** Đăng ký luôn signed_in (nâng cấp khách giữ userId) + mã dự phòng hiện MỘT lần */
export const AuthRegisterResponseSchema = AuthSignedInSchema.extend({ backupCode: z.string() });
export type AuthRegisterResponse = z.infer<typeof AuthRegisterResponseSchema>;

// POST /v1/me/merge (Bearer khách) → AuthSignedInSchema · 409 merge_ticket_invalid · 409 account_pending_deletion (đích đang chờ xóa: khôi phục trước)
export const AuthMergeRequestSchema = z.object({ mergeTicket: Opaque, strategy: z.enum(['merge', 'discard_device']) });

// POST /v1/auth/logout (xác thực bằng chính refresh token)
export const AuthLogoutRequestSchema = z.object({ refreshToken: z.string().min(20).max(200), everywhere: z.boolean().optional() });

/** Mật khẩu hiện tại: bắt buộc cho thao tác /v1/me/* có thể dẫn tới chiếm tài khoản (access token lộ ≠ chiếm vĩnh viễn) */
export const CurrentPasswordSchema = z.string().min(1).max(PASSWORD_MAX);
// POST /v1/me/email/start (202) · POST /v1/me/email/verify — start đòi mật khẩu hiện tại (rà kien-truc PR #18 mục 1)
export const EmailStartRequestSchema = z.object({ email: EmailSchema, currentPassword: CurrentPasswordSchema });
export const EmailVerifyRequestSchema = z.object({ email: EmailSchema, code: OtpCodeSchema });

// POST /v1/auth/password/forgot (luôn 202, không lộ)
export const PasswordForgotRequestSchema = z.object({ usernameOrEmail: z.string().trim().min(1).max(254) });
// POST /v1/auth/password/reset-email
export const PasswordResetWithEmailRequestSchema = z.object({
  usernameOrEmail: z.string().trim().min(1).max(254),
  code: OtpCodeSchema,
  newPassword: PasswordSchema
});
// POST /v1/auth/password/reset-backup → BackupCodeResponseSchema (mã MỚI, mã cũ hết hiệu lực)
export const PasswordResetWithBackupRequestSchema = z.object({ username: UsernameSchema, backupCode: BackupCodeSchema, newPassword: PasswordSchema });
// POST /v1/me/backup-code (tạo mã mới; đòi mật khẩu hiện tại) → BackupCodeResponseSchema
export const BackupCodeRotateRequestSchema = z.object({ currentPassword: CurrentPasswordSchema });
/** cũng là phản hồi của POST /v1/me/backup-code (tạo mã mới) */
export const BackupCodeResponseSchema = z.object({ backupCode: z.string() });

// POST /v1/me/password (đổi; thu hồi mọi refresh token khác)
export const PasswordChangeRequestSchema = z.object({ currentPassword: CurrentPasswordSchema, newPassword: PasswordSchema });

// GET /v1/me/identities · DELETE /v1/me/identities/:id
export const IdentityListResponseSchema = z.object({
  identities: z.array(z.object({ id: z.string().uuid(), provider: AuthProviderSchema, /** đã che */ display: z.string() }))
});
export type IdentityListResponse = z.infer<typeof IdentityListResponseSchema>;

// DELETE /v1/me (dự án 3) — grace: khóa ngay, xóa cứng sau 30 ngày; now: xóa cứng ngay
export const ACCOUNT_DELETE_GRACE_DAYS = 30;
export const DeleteMeRequestSchema = z.object({ mode: z.enum(['grace', 'now']) });
/** deleteAt = hạn xóa cứng (grace) hoặc null (đã xóa ngay) */
export const DeleteMeResultSchema = z.object({ deleteAt: IsoDate.nullable() });
// POST /v1/me/restore
export const RestoreAccountRequestSchema = z.object({}).strict();

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
  /** `version` = phiên bản NỘI DUNG hộp đồng ý người học đã đọc (bảng tra: docs/phap-ly/DANH-GIA-TAC-DONG.md) */
  z.object({ ...base, type: z.literal('consent.grant'), key: z.string().regex(/^[\w.-]{1,40}$/), version: z.string().regex(/^[\w.-]{1,20}$/) }),
  /** Rút lại đồng ý (Luật 91/2025 Điều 4, 10): server xóa bản ghi đồng ý của khóa này */
  z.object({ ...base, type: z.literal('consent.revoke'), key: z.string().regex(/^[\w.-]{1,40}$/) }),
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

// ---------- Dự án 4: cổng tuổi (chỉ lưu cờ đủ/chưa đủ 18, KHÔNG lưu năm sinh) ----------

/** Đủ 18 ⇔ năm hiện tại − năm sinh ≥ 18 (người dùng chốt 26/11; không có ngày sinh nên người sinh đúng 18 năm trước có thể chưa đủ 18 tuổi thực). */
export const ADULT_AGE = 18;
export const AGE_LOCK_MONTHS = 12;
export const BIRTH_YEAR_MIN = 1900;

export function isAdultFromBirthYear(birthYear: number, now: Date = new Date()): boolean {
  return now.getUTCFullYear() - birthYear >= ADULT_AGE;
}

/**
 * Năm sinh: số nguyên 1900..năm hiện tại (so lúc kiểm tra, không đóng băng lúc nạp mô-đun).
 * Thông báo lỗi CỐ ĐỊNH — không phản chiếu giá trị đã gửi (năm sinh không được lọt vào log/phản hồi).
 */
export const AgeDeclareRequestSchema = z
  .object({
    birthYear: z
      .number({ invalid_type_error: 'Năm sinh không hợp lệ', required_error: 'Năm sinh không hợp lệ' })
      .int('Năm sinh không hợp lệ')
      .min(BIRTH_YEAR_MIN, 'Năm sinh không hợp lệ')
      .refine((y) => y <= new Date().getUTCFullYear(), 'Năm sinh không hợp lệ')
  })
  .strict();
export type AgeDeclareRequest = z.infer<typeof AgeDeclareRequestSchema>;

export const AgeDeclareResponseSchema = z.object({
  isAdult: z.boolean(),
  /** chỉ khi isAdult=false: tới lúc này mới khai lại được */
  lockedUntil: z.string().datetime().nullable()
});
export type AgeDeclareResponse = z.infer<typeof AgeDeclareResponseSchema>;

/**
 * Handle (tên bạn bè, dự án 4): cùng luật tên đăng nhập (ASCII trước khi viết thường, 3–24, không đầu/cuối '.', danh sách cấm)
 * và thêm: không có hai dấu '.' liền nhau. Chữ hoa được chuẩn hóa về chữ thường (không bị từ chối).
 */
export const HandleSchema = UsernameSchema.refine((s) => !s.includes('..'), 'Tên không dùng được');
export type Handle = z.infer<typeof HandleSchema>;
