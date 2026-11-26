import { eq } from 'drizzle-orm';
import { ChatErrorCode, type ChatIneligibleReasonSchema } from '@vietlearning/contracts/api';
import type { z } from 'zod';
import { schema, type Db } from '../../db/client.js';
import { GatewayError } from '../../pipeline/RequestPipeline.js';

/**
 * CỔNG ĐIỀU KIỆN CHAT (dự án 4, spec 5.1): "đủ 18, không phải khách, không chờ xóa, có handle, không bị khóa chat".
 * Logic thật nằm ở Task 3 (`services/social/eligibility.ts`, hàm `chatEligibility`) — Task 4 CHỈ dùng giao diện này, không tự
 * kiểm tuổi. Khi Task 3 vào main: trong `app.ts` thay `stubChatEligibility` bằng `chatEligibility` (cùng chữ ký), không sửa gì khác.
 */
export type IneligibleReason = z.infer<typeof ChatIneligibleReasonSchema>;
export type EligibilityResult = { ok: true } | { ok: false; reason: IneligibleReason };
export type ChatEligibilityFn = (db: Db, userId: string) => Promise<EligibilityResult>;

/**
 * BẢN GIẢ tạm cho tới khi Task 3 vào main. CHỈ loại khách và tài khoản chờ xóa (hai cột sẵn có), KHÔNG có logic tuổi/handle/khóa chat
 * (đó là việc của Task 3). Vì thế cờ `CHAT_ENABLED` mặc định TẮT ở production: không bật chat thật trước khi ghép cổng thật.
 */
export const stubChatEligibility: ChatEligibilityFn = async (db, userId) => {
  const [u] = await db.select({ isGuest: schema.users.isGuest, deleteAt: schema.users.deleteAt }).from(schema.users).where(eq(schema.users.id, userId));
  if (!u) return { ok: false, reason: 'guest' };
  if (u.deleteAt) return { ok: false, reason: 'pending_deletion' };
  if (u.isGuest) return { ok: false, reason: 'guest' };
  return { ok: true };
};

/** Lý do không đủ điều kiện → lỗi chuẩn (mã trùng contract). */
export function ineligibleError(reason: IneligibleReason): GatewayError {
  switch (reason) {
    case 'age_unknown':
      return new GatewayError(403, ChatErrorCode.ageRequired, 'Cần khai tuổi trước khi nhắn tin');
    case 'minor':
      return new GatewayError(403, ChatErrorCode.adultRequired, 'Tính năng nhắn tin dành cho người từ đủ 18 tuổi');
    case 'guest':
      return new GatewayError(403, ChatErrorCode.adultRequired, 'Cần tài khoản đã đăng ký (không phải khách) để nhắn tin');
    case 'pending_deletion':
      return new GatewayError(403, 'account_pending_deletion', 'Tài khoản đang chờ xóa');
    case 'no_handle':
      return new GatewayError(403, ChatErrorCode.handleRequired, 'Hãy đặt tên bạn bè (handle) trước');
    case 'restricted':
      return new GatewayError(403, ChatErrorCode.chatRestricted, 'Tài khoản đang bị tạm khóa chat');
  }
}

/** Người chưa đủ điều kiện → ném lỗi; dùng ở hook của mọi route chat. */
export async function assertEligible(db: Db, gate: ChatEligibilityFn, userId: string): Promise<void> {
  const r = await gate(db, userId);
  if (!r.ok) throw ineligibleError(r.reason);
}
