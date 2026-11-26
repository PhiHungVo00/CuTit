import { type ChatIneligibleReasonSchema } from '@vietlearning/contracts/api';
import type { z } from 'zod';
import type { Db } from '../../db/client.js';
import { eligibilityError } from '../social/eligibility.js';

/**
 * CỔNG ĐIỀU KIỆN CHAT (spec 5.1): logic thật là `chatEligibility` của Task 3 (`services/social/eligibility.ts`, cửa duy nhất, có cache 60 giây).
 * Chat chỉ NHẬN hàm đó qua giao diện này (để test tiêm cổng giả) và dùng cùng bảng mã lỗi của Task 3. Không tự kiểm tuổi ở đây.
 */
export type IneligibleReason = z.infer<typeof ChatIneligibleReasonSchema>;
export type EligibilityResult = { ok: true } | { ok: false; reason: IneligibleReason };
export type ChatEligibilityFn = (db: Db, userId: string) => Promise<EligibilityResult>;

/** Cổng ĐÓNG: dùng khi route chat được dựng mà không có cổng nào (không bao giờ mở ngầm). */
export const closedChatEligibility: ChatEligibilityFn = async () => ({ ok: false, reason: 'age_unknown' });

/** Người chưa đủ điều kiện → ném lỗi (mã lỗi của Task 3); dùng ở hook của mọi route chat. */
export async function assertEligible(db: Db, gate: ChatEligibilityFn, userId: string): Promise<void> {
  const r = await gate(db, userId);
  if (!r.ok) throw eligibilityError(r.reason);
}
