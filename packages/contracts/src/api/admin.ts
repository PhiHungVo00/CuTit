import { z } from 'zod';
import { PASSWORD_MAX, USERNAME_MAX } from './account.js';
import {
  FEEDBACK_LIMITS,
  FeedbackContextSchema,
  FeedbackFileTypeSchema,
  FeedbackKindSchema,
  FeedbackMediaSchema,
  FeedbackStatusSchema,
  MyFeedbackSchema
} from './feedback.js';

/**
 * Dự án 5a — Trang quản trị `/admin/v1` (spec §5.4–5.6). KHÔNG dùng Bearer của app: access JWT `typ:'admin'`
 * (ký bằng ADMIN_JWT_SECRET, 10 phút, chỉ giữ trong bộ nhớ trang quản trị), refresh là cookie HttpOnly.
 * Đăng nhập: mật khẩu → vé (5 phút) → mã 6 số (hoặc mã dự phòng) → phiên. Chưa đăng ký mã 6 số thì đi đường `enroll`.
 */

/** Mã lỗi máy đọc được của `/admin/v1` */
export const AdminErrorCode = {
  /** 404: ADMIN_API_ENABLED=false */
  adminDisabled: 'admin_disabled',
  /** 401: sai tên/mật khẩu HOẶC không có vai trò — MỘT mã, thân lỗi giống hệt (không lộ tên nào có quyền) */
  invalidCredentials: 'invalid_credentials',
  /** 401: mã 6 số/mã dự phòng sai hoặc đã dùng */
  totpInvalid: 'totp_invalid',
  /** 401: thao tác cần mã 6 số (vé chưa qua bước mã) */
  totpRequired: 'totp_required',
  /** 401: phiên hết hạn (rảnh 30 phút / quá 12 giờ / bị thu hồi) */
  sessionExpired: 'session_expired'
} as const;
export type AdminErrorCodeValue = (typeof AdminErrorCode)[keyof typeof AdminErrorCode];

const IsoDate = z.string().datetime();
const Ticket = z.string().min(16).max(256);

// ---------- Đăng nhập ----------

/** Không áp luật độ mạnh mật khẩu khi ĐĂNG NHẬP (chỉ chặn đầu vào quá dài) */
export const AdminLoginRequestSchema = z
  .object({ username: z.string().min(1).max(USERNAME_MAX), password: z.string().min(1).max(PASSWORD_MAX) })
  .strict();
export type AdminLoginRequest = z.infer<typeof AdminLoginRequestSchema>;

/** `next`: 'totp' = đã đăng ký mã 6 số; 'enroll' = chưa (lần đầu sau khi được cấp quyền) */
export const AdminLoginResponseSchema = z.object({ ticket: Ticket, next: z.enum(['totp', 'enroll']) });
export type AdminLoginResponse = z.infer<typeof AdminLoginResponseSchema>;

/** `POST /admin/v1/auth/totp/enroll` — chỉ khi next='enroll' */
export const AdminEnrollRequestSchema = z.object({ ticket: Ticket }).strict();
export const AdminEnrollResponseSchema = z.object({
  otpauthUrl: z.string().startsWith('otpauth://'),
  /** chuỗi bí mật để nhập tay (base32) */
  secret: z.string().min(8).max(128)
});
export type AdminEnrollResponse = z.infer<typeof AdminEnrollResponseSchema>;

export const TotpCodeSchema = z.string().regex(/^\d{6}$/);
/** 10 mã dự phòng dùng một lần, dạng `xxxxx-xxxxx` (chữ thường + số); gõ HOA vẫn nhận */
export const ADMIN_BACKUP_CODE_COUNT = 10;
export const AdminBackupCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]{5}-[a-z0-9]{5}$/);

/** `POST /admin/v1/auth/totp/confirm` — xác nhận lần đầu bằng mã 6 số, tạo phiên + trả 10 mã dự phòng */
export const AdminTotpConfirmSchema = z.object({ ticket: Ticket, code: TotpCodeSchema }).strict();

export const AdminSessionSchema = z.object({
  accessToken: z.string().min(1),
  /** giây (600 = 10 phút) */
  expiresIn: z.number().int().positive()
});
export type AdminSession = z.infer<typeof AdminSessionSchema>;

export const AdminTotpConfirmResponseSchema = AdminSessionSchema.extend({
  backupCodes: z.array(AdminBackupCodeSchema).length(ADMIN_BACKUP_CODE_COUNT)
});
export type AdminTotpConfirmResponse = z.infer<typeof AdminTotpConfirmResponseSchema>;

/** `POST /admin/v1/auth/totp` — ĐÚNG MỘT trong `code` hoặc `backupCode` */
export const AdminTotpRequestSchema = z
  .object({ ticket: Ticket, code: TotpCodeSchema.optional(), backupCode: AdminBackupCodeSchema.optional() })
  .strict()
  .refine((v) => (v.code === undefined) !== (v.backupCode === undefined), { message: 'Cần đúng một trong code hoặc backupCode' });
export type AdminTotpRequest = z.infer<typeof AdminTotpRequestSchema>;

// ---------- Hàng chờ ----------

/** Hiện chỉ 'feedback'; dự án 4 thêm 'chat_report' */
export const QueueTypeSchema = z.enum(['feedback']);
export const QUEUE_PAGE = { default: 30, max: 100 } as const;
export const QueueQuerySchema = z
  .object({
    type: QueueTypeSchema.default('feedback'),
    status: FeedbackStatusSchema.optional(),
    kind: FeedbackKindSchema.optional(),
    /** con trỏ mờ do server cấp */
    cursor: z.string().min(1).max(256).optional(),
    limit: z.coerce.number().int().min(1).max(QUEUE_PAGE.max).default(QUEUE_PAGE.default)
  })
  .strict();
export type QueueQuery = z.infer<typeof QueueQuerySchema>;

export const QueueItemSchema = z.object({
  type: QueueTypeSchema,
  id: z.string().uuid(),
  kind: FeedbackKindSchema,
  /** đoạn đầu nội dung */
  excerpt: z.string().max(120),
  status: FeedbackStatusSchema,
  appVersion: z.string(),
  route: z.string(),
  fileCount: z.number().int().min(0),
  createdAt: IsoDate,
  /** chủ tài khoản đã bấm xóa (30 ngày chờ) */
  accountPendingDeletion: z.boolean()
});
export type QueueItem = z.infer<typeof QueueItemSchema>;

export const QueueResponseSchema = z.object({
  items: z.array(QueueItemSchema),
  nextCursor: z.string().nullable(),
  /** số góp ý chưa 'done' (cho nhãn "chưa xử lý") */
  pendingCount: z.number().int().min(0)
});
export type QueueResponse = z.infer<typeof QueueResponseSchema>;

// ---------- Chi tiết + xử lý ----------

/** Chi tiết (quản trị): như MyFeedback nhưng thêm ngữ cảnh, tệp có id để xin URL ký; KHÔNG email, chỉ mã người dùng rút gọn */
export const AdminFeedbackDetailSchema = MyFeedbackSchema.omit({ files: true, unread: true }).extend({
  context: FeedbackContextSchema,
  userIdShort: z.string().min(1).max(16),
  accountPendingDeletion: z.boolean(),
  doneAt: IsoDate.nullable(),
  files: z.array(
    z.object({
      id: z.string().uuid(),
      media: FeedbackMediaSchema,
      contentType: FeedbackFileTypeSchema,
      bytes: z.number().int().min(0),
      durationMs: z.number().int().min(0).nullable(),
      purged: z.boolean()
    })
  )
});
export type AdminFeedbackDetail = z.infer<typeof AdminFeedbackDetailSchema>;

/** `POST /admin/v1/feedback/:id/status` */
export const AdminStatusRequestSchema = z
  .object({ status: FeedbackStatusSchema, message: z.string().trim().min(1).max(FEEDBACK_LIMITS.replyMax).optional() })
  .strict();
export type AdminStatusRequest = z.infer<typeof AdminStatusRequestSchema>;

/** `GET /admin/v1/feedback/:id/files/:fileId/url` — URL ký HMAC sống 5 phút */
export const SignedUrlSchema = z.object({ url: z.string().min(1), expiresAt: IsoDate });
export type SignedUrl = z.infer<typeof SignedUrlSchema>;
export const SIGNED_URL_TTL_SECONDS = 300;

// ---------- Nhật ký quản trị ----------

export const AUDIT_ACTIONS = [
  'auth.login',
  'auth.totp_enrolled',
  'auth.failed',
  'feedback.status',
  'feedback.view_file',
  'role.grant',
  'role.revoke',
  'totp.reset'
] as const;
export const AuditActionSchema = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof AuditActionSchema>;
/** Giữ 2 năm rồi xóa bằng `admin_audit_purge` */
export const AUDIT_RETENTION_DAYS = 730;

export const AuditEntrySchema = z.object({
  id: z.number().int().positive(),
  at: IsoDate,
  actorKind: z.enum(['user', 'cli']),
  actorUserIdShort: z.string().min(1).max(16).nullable(),
  action: AuditActionSchema,
  targetType: z.string().min(1).max(40),
  targetId: z.string().max(200).nullable(),
  meta: z.record(z.unknown())
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
export const AuditListResponseSchema = z.object({ items: z.array(AuditEntrySchema), nextCursor: z.string().nullable() });
export type AuditListResponse = z.infer<typeof AuditListResponseSchema>;
