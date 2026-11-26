import { eq } from 'drizzle-orm';
import { AGE_LOCK_MONTHS, ChatErrorCode, isAdultFromBirthYear, type AgeDeclareResponse } from '@vietlearning/contracts/api';
import { schema, type Db } from '../../db/client.js';
import { GatewayError } from '../../pipeline/RequestPipeline.js';
import { invalidateChatEligibility } from './eligibility.js';

/**
 * Dự án 4 (spec 5.1) — khai tuổi. Nhận NĂM SINH chỉ để tính cờ đủ/chưa đủ 18 rồi BỎ NGAY:
 * không ghi DB (không có cột), không ghi audit, không ghi log, không đưa vào thông báo lỗi.
 * Hàm này cũng không nhận `logger`/`audit` để không thể vô tình ghi.
 *
 *  - đã `true`: không đổi ngược (trả lại `true`, không ghi gì);
 *  - đã `false`: khóa 12 tháng từ `age_declared_at` (khai trong thời gian khóa => `age_locked`), hết hạn khai lại được.
 */
export const addMonthsUtc = (d: Date, months: number): Date => {
  const r = new Date(d.getTime());
  r.setUTCMonth(r.getUTCMonth() + months);
  return r;
};

export async function declareAge(db: Db, userId: string, birthYear: number, now: Date = new Date()): Promise<AgeDeclareResponse> {
  const { users } = schema;
  const result = await db.transaction(async (tx) => {
    // Khóa hàng người dùng: hai lần khai đồng thời không vượt được khóa 12 tháng
    const [u] = await tx
      .select({ isAdult: users.isAdult, declaredAt: users.ageDeclaredAt })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');
    if (!u) throw new GatewayError(404, 'not_found', 'Không tìm thấy tài khoản');
    if (u.isAdult === true) return { isAdult: true, lockedUntil: null } as const;
    if (u.isAdult === false && u.declaredAt) {
      const unlock = addMonthsUtc(u.declaredAt, AGE_LOCK_MONTHS);
      if (now < unlock) throw new GatewayError(403, ChatErrorCode.ageLocked, 'Chưa khai lại được', { lockedUntil: unlock.toISOString() });
    }
    const isAdult = isAdultFromBirthYear(birthYear, now);
    await tx.update(users).set({ isAdult, ageDeclaredAt: now }).where(eq(users.id, userId));
    return { isAdult, lockedUntil: isAdult ? null : addMonthsUtc(now, AGE_LOCK_MONTHS).toISOString() };
  });
  invalidateChatEligibility(userId);
  return result;
}
