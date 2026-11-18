import type { FastifyRequest } from 'fastify';
import { and, eq, isNotNull } from 'drizzle-orm';
import { FAMILY_ERROR } from '@vietlearning/contracts/api';
import { schema, type DbProvider } from '../db/client.js';
import { GatewayError } from './RequestPipeline.js';

/**
 * GĐ4b — Luật theo loại tài khoản (D4). MỘT nơi duy nhất để mọi route (kể cả GĐ4 bạn bè/xã hội) dùng lại:
 * - `isChild(req)`        : principal là hồ sơ trẻ (loại tài khoản lấy từ DB lúc xác thực, không tin client).
 * - `requireAdult(req)`   : 403 adult_only cho hồ sơ trẻ (quản lý gia đình, xóa tài khoản, tính năng xã hội…).
 * - `requireNotFreeChat`  : 403 child_free_chat_blocked (chat AI tự do / gọi thoại / hỏi đáp tự do).
 * - `requireMediaConsent` : 403 parent_consent_required khi trẻ gửi ảnh/ghi âm mà phụ huynh chưa cho phép.
 * Mọi kiểm tra chạy TRƯỚC khi đọc tệp tải lên và trước khi trừ hạn mức.
 */
export function isChild(request: FastifyRequest): boolean {
  return request.principal?.accountType === 'child';
}

export function requireAdult(request: FastifyRequest): void {
  if (isChild(request)) throw new GatewayError(403, FAMILY_ERROR.adultOnly, 'Chỉ tài khoản phụ huynh/người lớn dùng được');
}

export function requireNotFreeChat(request: FastifyRequest): void {
  if (isChild(request)) throw new GatewayError(403, FAMILY_ERROR.freeChat, 'Hồ sơ trẻ chỉ dùng nhập vai có kịch bản');
}

/** Đọc DB mỗi lần (không cache): phụ huynh thu hồi đồng ý => có hiệu lực ngay ở mọi instance */
export async function hasMediaConsent(db: DbProvider, request: FastifyRequest): Promise<boolean> {
  if (!isChild(request)) return true;
  const d = await db.get();
  const [row] = await d
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.id, request.principal!.id), isNotNull(schema.users.parentMediaConsentAt)));
  return Boolean(row);
}

export async function requireMediaConsent(db: DbProvider, request: FastifyRequest): Promise<void> {
  if (!(await hasMediaConsent(db, request))) {
    throw new GatewayError(403, FAMILY_ERROR.consent, 'Cần phụ huynh cho phép gửi ảnh/ghi âm');
  }
}
