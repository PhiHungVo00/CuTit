import { and, eq, gt, sql } from 'drizzle-orm';
import { schema, type Db } from '../../db/client.js';
import { hmacHex } from './otp.js';

/**
 * Bộ đếm giới hạn tần suất cho đăng nhập/OTP, lưu ở `auth_challenges` kind 'rate_counter' (dùng chung DB => đúng cả khi
 * chạy nhiều instance Gateway, không reset khi khởi động lại). Khóa đếm được HMAC bằng AUTH_OTP_PEPPER => DB không chứa
 * IP / tên đăng nhập / email nguyên văn.
 *
 * Tăng nguyên tử bằng INSERT … ON CONFLICT (kind, key_hash) WHERE kind <> 'email_otp' DO UPDATE (phải lặp lại vị từ của
 * index một phần `auth_challenges_kind_key_uq`). Cửa sổ đã hết => đếm lại từ 1 với cửa sổ mới (cửa sổ cố định).
 */
export class RateCounters {
  constructor(private readonly pepper: string) {}

  private hash(key: string): string {
    return hmacHex(this.pepper, 'rate:' + key);
  }

  /** Cộng một lần, trả số lần trong cửa sổ hiện tại (kể cả lần này) */
  async hit(db: Db, key: string, windowMs: number, now: Date): Promise<number> {
    const t = schema.authChallenges;
    const nowSql = sql`${now.toISOString()}::timestamptz`;
    const exp = new Date(now.getTime() + windowMs);
    const expSql = sql`${exp.toISOString()}::timestamptz`;
    const [row] = await db
      .insert(t)
      .values({ kind: 'rate_counter', keyHash: this.hash(key), attempts: 1, expiresAt: exp })
      .onConflictDoUpdate({
        target: [t.kind, t.keyHash],
        targetWhere: sql`${t.kind} <> 'email_otp'`,
        set: {
          attempts: sql`case when ${t.expiresAt} <= ${nowSql} then 1 else ${t.attempts} + 1 end`,
          expiresAt: sql`case when ${t.expiresAt} <= ${nowSql} then ${expSql} else ${t.expiresAt} end`
        }
      })
      .returning({ attempts: t.attempts });
    return row.attempts;
  }

  /** Số lần trong cửa sổ còn hiệu lực (0 nếu chưa có / đã hết cửa sổ) — không cộng */
  async count(db: Db, key: string, now: Date): Promise<number> {
    const t = schema.authChallenges;
    const [row] = await db
      .select({ attempts: t.attempts })
      .from(t)
      .where(and(eq(t.kind, 'rate_counter'), eq(t.keyHash, this.hash(key)), gt(t.expiresAt, now)));
    return row?.attempts ?? 0;
  }

  async clear(db: Db, key: string): Promise<void> {
    const t = schema.authChallenges;
    await db.delete(t).where(and(eq(t.kind, 'rate_counter'), eq(t.keyHash, this.hash(key))));
  }
}
