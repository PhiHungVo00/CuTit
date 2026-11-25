import { z } from 'zod';

/**
 * Dự án 5a — Góp ý / Báo lỗi (phía người dùng). Spec: docs/superpowers/specs/2026-11-21-gop-y-bao-loi-design.md §5.1–5.2.
 * `/v1/feedback*` có Bearer (khách cũng gửi được). Quản trị xem/xử lý ở `admin.ts` (`/admin/v1`).
 *
 * Riêng tư: ngữ cảnh chỉ gồm chẩn đoán ứng dụng (phiên bản, nền tảng, màn hình, lỗi) — KHÔNG nội dung bài học, tin nhắn,
 * email, tham số truy vấn của đường dẫn. Người dùng không nhận lại khóa/URL tệp (đã có bản trên máy).
 */

export const FEEDBACK_LIMITS = {
  bodyMin: 10,
  bodyMax: 2000,
  /** số ảnh tối đa mỗi góp ý */
  images: 3,
  /** số video tối đa mỗi góp ý */
  videos: 1,
  imageBytes: 5 * 2 ** 20,
  videoBytes: 50 * 2 ** 20,
  /** app tự kiểm độ dài (server không kiểm) */
  videoMs: 60_000,
  /** số góp ý mỗi người mỗi ngày (cộng giới hạn IP ở Gateway) */
  perDay: 5,
  /** độ dài lời nhắn của chủ app */
  replyMax: 1000
} as const;

/** Loại tệp được nhận — server xác định theo magic bytes, KHÔNG tin Content-Type/đuôi tệp */
export const FEEDBACK_IMAGE_TYPES = ['image/webp', 'image/jpeg', 'image/png'] as const;
export const FEEDBACK_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
export const FeedbackFileTypeSchema = z.enum([...FEEDBACK_IMAGE_TYPES, ...FEEDBACK_VIDEO_TYPES]);
export type FeedbackFileType = z.infer<typeof FeedbackFileTypeSchema>;
export const FeedbackMediaSchema = z.enum(['image', 'video']);
export type FeedbackMedia = z.infer<typeof FeedbackMediaSchema>;

/** Mã lỗi máy đọc được (trường `error` của thân lỗi Gateway) */
export const FeedbackErrorCode = {
  /** 429: quá 5 góp ý/ngày hoặc trần IP */
  feedbackLimit: 'feedback_limit',
  /** 413: ảnh > 5 MB hoặc video > 50 MB hoặc tổng > 66 MB */
  fileTooLarge: 'file_too_large',
  /** 400: không phải WebP/JPEG/PNG/MP4/WebM/MOV (theo magic bytes) */
  fileType: 'file_type',
  /** 400: quá 3 ảnh hoặc quá 1 video */
  tooManyFiles: 'too_many_files',
  /** 400: video quá 60 giây (app kiểm trước; mã dành cho khi app muốn báo cùng một kiểu lỗi) */
  videoTooLong: 'video_too_long',
  /** 507: kho tệp đầy — bản chỉ có chữ vẫn được nhận */
  storageFull: 'storage_full'
} as const;
export type FeedbackErrorCodeValue = (typeof FeedbackErrorCode)[keyof typeof FeedbackErrorCode];

export const FeedbackKindSchema = z.enum(['bug', 'idea', 'other']);
export type FeedbackKind = z.infer<typeof FeedbackKindSchema>;
export const FeedbackStatusSchema = z.enum(['received', 'in_progress', 'done']);
export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>;

const IsoDate = z.string().datetime();

/** Đường dẫn trong app: bắt đầu '/', KHÔNG có '?' (tham số truy vấn) hay '#', không khoảng trắng — chỉ path */
export const FeedbackRouteSchema = z
  .string()
  .max(200)
  .regex(/^\/[^?#\s]*$/);

export const FeedbackContextSchema = z
  .object({
    appVersion: z.string().min(1).max(32),
    build: z.string().min(1).max(64),
    platform: z.enum(['android', 'web']),
    osVersion: z.string().min(1).max(64),
    locale: z.enum(['vi', 'en']),
    /** màn trước khi vào Góp ý */
    route: FeedbackRouteSchema,
    /** tối đa 5 đường dẫn gần nhất */
    recentRoutes: z.array(FeedbackRouteSchema).max(5),
    /** có khi mở từ màn lỗi (ScreenErrorBoundary) */
    error: z.object({ name: z.string().min(1).max(100), firstFrame: z.string().max(300) }).strict().optional()
  })
  .strict();
export type FeedbackContext = z.infer<typeof FeedbackContextSchema>;

/** Phần `meta` (JSON) của yêu cầu multipart `POST /v1/feedback`; các phần `files[]` đi kèm */
export const FeedbackCreateMetaSchema = z
  .object({
    kind: FeedbackKindSchema,
    body: z.string().trim().min(FEEDBACK_LIMITS.bodyMin).max(FEEDBACK_LIMITS.bodyMax),
    context: FeedbackContextSchema
  })
  .strict();
export type FeedbackCreateMeta = z.infer<typeof FeedbackCreateMetaSchema>;

export const FeedbackCreateResponseSchema = z.object({ id: z.string().uuid() });
export type FeedbackCreateResponse = z.infer<typeof FeedbackCreateResponseSchema>;

/** Một lời nhắn/đổi trạng thái của chủ app (dòng thời gian) */
export const FeedbackEventSchema = z.object({
  at: IsoDate,
  status: FeedbackStatusSchema.nullable(),
  message: z.string().max(FEEDBACK_LIMITS.replyMax).nullable()
});
export type FeedbackEvent = z.infer<typeof FeedbackEventSchema>;

/** `GET /v1/feedback/mine` — tệp chỉ báo loại + đã dọn chưa, KHÔNG có khóa/URL */
export const MyFeedbackSchema = z.object({
  id: z.string().uuid(),
  kind: FeedbackKindSchema,
  body: z.string(),
  status: FeedbackStatusSchema,
  createdAt: IsoDate,
  /** có lời nhắn/đổi trạng thái chưa đọc => chấm đỏ */
  unread: z.boolean(),
  files: z.array(z.object({ media: FeedbackMediaSchema, purged: z.boolean() })),
  events: z.array(FeedbackEventSchema)
});
export type MyFeedback = z.infer<typeof MyFeedbackSchema>;

export const MyFeedbackListSchema = z.object({ items: z.array(MyFeedbackSchema) });
export type MyFeedbackList = z.infer<typeof MyFeedbackListSchema>;

/** `GET /v1/feedback/mine/unread-count` */
export const UnreadCountSchema = z.object({ count: z.number().int().min(0) });
export type UnreadCount = z.infer<typeof UnreadCountSchema>;
