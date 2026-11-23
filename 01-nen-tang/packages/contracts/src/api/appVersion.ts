import { z } from 'zod';

/**
 * Hợp đồng kiểm phiên bản app (dự án 8) — spec 5.2/5.3.
 * Mẫu min-version + "hạn chót" (minBuildEnforceAt) tự viết theo kiến trúc dự án; không chép mã ngoài.
 * Gateway tính `status`; host kiểm theo kênh. Host allowlist của apkFile.url kiểm ở Gateway, không ở đây.
 */
export const AppChannelSchema = z.enum(['web', 'play', 'apk']);
export type AppChannel = z.infer<typeof AppChannelSchema>;

// GET /v1/app/version?channel=play&build=123   (công khai, không cần token)
export const AppVersionQuerySchema = z.object({
  channel: AppChannelSchema,
  build: z.coerce.number().int().min(0).max(2_000_000_000)
});
export type AppVersionQuery = z.infer<typeof AppVersionQuerySchema>;

const NotesSchema = z.object({ vi: z.string().min(1).max(280), en: z.string().min(1).max(280) });
const HttpsUrlSchema = z.string().url().startsWith('https://');
const ApkFileSchema = z.object({
  url: HttpsUrlSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().min(1).max(200_000_000)
});
const VersionStringSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export const AppVersionResponseSchema = z.object({
  channel: AppChannelSchema,
  latestBuild: z.number().int().min(0),
  latestVersion: VersionStringSchema,
  minBuild: z.number().int().min(0),
  status: z.enum(['up_to_date', 'update_available', 'update_required']),
  notes: NotesSchema.nullable(),
  /** Chỉ kênh apk: tệp để app tự tải và cài; null nếu chưa có */
  apkFile: ApkFileSchema.nullable(),
  /** Chỉ kênh apk: trang tải dự phòng (mở bằng trình duyệt khi tự cài lỗi); null nếu chưa có */
  downloadUrl: HttpsUrlSchema.nullable(),
  /** Gợi ý client chờ bao lâu mới hỏi lại (giây) */
  checkAfterSec: z.number().int().min(300).max(86_400)
});
export type AppVersionResponse = z.infer<typeof AppVersionResponseSchema>;

// Lỗi 426 trên mọi route /v1 khi build < minBuild VÀ đã qua minBuildEnforceAt
export const AppUpdateRequiredErrorSchema = z.object({
  error: z.literal('app_update_required'),
  minBuild: z.number().int(),
  channel: AppChannelSchema
});
export type AppUpdateRequiredError = z.infer<typeof AppUpdateRequiredErrorSchema>;

export const APP_BUILD_HEADER = 'x-app-build';
export const APP_CHANNEL_HEADER = 'x-app-channel';

// Cấu hình Gateway (01-nen-tang/apps/gateway/config/app-versions.json)
const ChannelConfigSchema = z
  .object({
    latestBuild: z.number().int().min(0),
    latestVersion: VersionStringSchema,
    minBuild: z.number().int().min(0),
    /** Hạn chót trả 426 (ISO 8601 có múi giờ); null = chặn ngay (chỉ sự cố khẩn) */
    minBuildEnforceAt: z.string().datetime({ offset: true }).nullable(),
    notes: NotesSchema.nullable(),
    downloadUrl: HttpsUrlSchema.nullable(),
    apkFile: ApkFileSchema.nullable()
  })
  .refine((c) => c.minBuild <= c.latestBuild, {
    message: 'minBuild phải ≤ latestBuild',
    path: ['minBuild']
  });

export const AppVersionsConfigSchema = z
  .object({ web: ChannelConfigSchema, play: ChannelConfigSchema, apk: ChannelConfigSchema })
  .superRefine((cfg, ctx) => {
    for (const ch of ['web', 'play'] as const) {
      for (const key of ['downloadUrl', 'apkFile'] as const) {
        if (cfg[ch][key] !== null) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [ch, key], message: `${key} chỉ được có ở kênh apk` });
        }
      }
    }
  });
export type AppVersionsConfig = z.infer<typeof AppVersionsConfigSchema>;
