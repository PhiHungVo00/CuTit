import { z } from 'zod';

/**
 * GĐ4b — Chế độ trẻ em (quyết định D4).
 *
 * - Hồ sơ trẻ do PHỤ HUYNH tạo (tài khoản người lớn), lưu `users.account_type = 'child'`, `parent_user_id`.
 * - Server KHÔNG lưu tên trẻ: biệt danh chỉ nằm trên máy (giảm dữ liệu cá nhân của trẻ ở server).
 * - Trẻ không có mã khôi phục: phụ huynh cấp lại phiên cho trẻ (POST /v1/family/children/:id/session).
 * - Đồng ý của phụ huynh cho gửi ảnh/ghi âm lên server = `users.parent_media_consent_at` của hồ sơ trẻ,
 *   chỉ đổi được bằng token phụ huynh (PUT .../consent). KHÔNG đi qua `consent.grant` của /v1/sync.
 * - Gateway ép luật theo account_type (client chỉ là lớp ngoài, Nguyên tắc 2).
 */

export const AccountTypeSchema = z.enum(['adult', 'child']);
export type AccountType = z.infer<typeof AccountTypeSchema>;

/** Mã lỗi 403 của chế độ trẻ em — client đổi thành lời thân thiện */
export const FAMILY_ERROR = {
  /** trẻ gọi chat AI tự do (M1) / gọi thoại tự do / hỏi đáp văn hóa tự do */
  freeChat: 'child_free_chat_blocked',
  /** trẻ gửi ảnh/ghi âm khi phụ huynh chưa cho phép */
  consent: 'parent_consent_required',
  /** chỉ tài khoản người lớn (phụ huynh) — vd. quản lý hồ sơ trẻ, xóa tài khoản, tính năng xã hội */
  adultOnly: 'adult_only',
  /** đã đủ số hồ sơ trẻ tối đa */
  childLimit: 'child_limit_reached'
} as const;
export type FamilyErrorCode = (typeof FAMILY_ERROR)[keyof typeof FAMILY_ERROR];

/** Số hồ sơ trẻ tối đa mỗi phụ huynh (mỗi hồ sơ là một hạn mức AI mới => giới hạn chống lạm dụng) */
export const MAX_CHILDREN = 5;

// GET /v1/me/account — thông tin tài khoản do server quyết định (client dùng để khóa tính năng)
export const AccountInfoSchema = z.object({
  userId: z.string().uuid(),
  accountType: AccountTypeSchema,
  /** chỉ có ở hồ sơ trẻ */
  parentUserId: z.string().uuid().nullable(),
  /** hồ sơ trẻ: phụ huynh đã cho phép gửi ảnh/ghi âm chưa. Người lớn: luôn true */
  mediaConsent: z.boolean(),
  /** số hồ sơ trẻ (người lớn) — để cảnh báo trước khi xóa tài khoản */
  childCount: z.number().int().min(0)
});
export type AccountInfo = z.infer<typeof AccountInfoSchema>;

export const ChildProfileSchema = z.object({
  userId: z.string().uuid(),
  createdAt: z.string().datetime(),
  mediaConsent: z.boolean(),
  mediaConsentAt: z.string().datetime().nullable()
});
export type ChildProfile = z.infer<typeof ChildProfileSchema>;

// POST /v1/family/children (không body) => hồ sơ mới
// GET /v1/family/children
export const ChildListResponseSchema = z.object({ children: z.array(ChildProfileSchema).max(MAX_CHILDREN) });
export type ChildListResponse = z.infer<typeof ChildListResponseSchema>;

// PUT /v1/family/children/:id/consent
export const ChildConsentRequestSchema = z.object({ media: z.boolean() });

// :id trong đường dẫn
export const ChildIdParamsSchema = z.object({ id: z.string().uuid() });

// POST /v1/family/children/:id/session => AuthTokensSchema (account.ts)
// GET /v1/family/children/:id/summary?today= => AnalyticsSummaryResponseSchema (endpoints.ts)
// DELETE /v1/family/children/:id => DeleteMeResponseSchema (account.ts)
