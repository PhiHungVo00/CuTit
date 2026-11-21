import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { schema, type Db } from '../../db/client.js';

/**
 * Mã OTP 6 số gửi qua email (spec 5.3; đề xuất A4). Ý tưởng tham khảo (không chép mã): hướng dẫn "email verification
 * codes" của Lucia / The Copenhagen Book (pilcrow, MIT — https://github.com/lucia-auth) và OWASP Forgot Password Cheat Sheet.
 *
 * - Mã 6 số chỉ có ~20 bit => KHÔNG lưu sha256 trần: lưu HMAC-SHA256(AUTH_OTP_PEPPER, mục_đích:email_hmac:mã).
 *   Mục đích ('link' = gắn email, 'reset' = đặt lại mật khẩu) nằm trong HMAC => mã gắn email không dùng để đặt lại được.
 * - `subject` = HMAC(pepper, email chữ thường): bảng auth_challenges không chứa email nguyên văn.
 * - Sống 10 phút; sai 5 lần => khóa mã (otp_locked); so sánh thời gian hằng (timingSafeEqual).
 * - Cấp mã mới XÓA mọi mã cũ cùng email trong cùng transaction (lưu ý 1 của kien-truc PR #11): nếu không, 5 lần thử
 *   tính theo từng dòng sẽ thành 5 × số mã.
 * - Kiểm và trừ lượt trong một transaction có `SELECT … FOR UPDATE` => hai request đồng thời không cùng dùng một mã.
 */
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export type OtpPurpose = 'link' | 'reset';
export type OtpResult = 'ok' | 'invalid' | 'expired' | 'locked';

export const hmacHex = (pepper: string, s: string): string => createHmac('sha256', pepper).update(s).digest('hex');

export class OtpService {
  constructor(private readonly pepper: string) {}

  /** email đã chuẩn hóa (EmailSchema: trim + chữ thường) */
  subjectOf(email: string): string {
    return hmacHex(this.pepper, 'email:' + email.normalize('NFC'));
  }

  private codeHash(purpose: OtpPurpose, subject: string, code: string): string {
    return hmacHex(this.pepper, `otp:${purpose}:${subject}:${code}`);
  }

  /**
   * Cấp mã mới cho `email` (hủy mọi mã cũ của email đó). `userId` = người được phép dùng mã: người đang gắn email
   * ('link') hoặc chủ tài khoản cần đặt lại mật khẩu ('reset'). Trả mã nguyên văn để gửi thư (KHÔNG log).
   */
  async issue(db: Db, purpose: OtpPurpose, email: string, userId: string, now: Date): Promise<string> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const subject = this.subjectOf(email);
    const t = schema.authChallenges;
    await db.transaction(async (tx) => {
      await tx.delete(t).where(and(eq(t.kind, 'email_otp'), eq(t.subject, subject)));
      await tx.insert(t).values({
        kind: 'email_otp',
        keyHash: this.codeHash(purpose, subject, code),
        subject,
        userId,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS)
      });
    });
    return code;
  }

  /** Kiểm mã; đúng => đánh dấu đã dùng. `userId` phải trùng người được cấp mã (sai người tính như sai mã). */
  async verify(db: Db, purpose: OtpPurpose, email: string, code: string, userId: string, now: Date): Promise<OtpResult> {
    const subject = this.subjectOf(email);
    const expected = Buffer.from(this.codeHash(purpose, subject, code), 'hex');
    const t = schema.authChallenges;
    return db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: t.id, keyHash: t.keyHash, userId: t.userId, attempts: t.attempts, expiresAt: t.expiresAt })
        .from(t)
        .where(and(eq(t.kind, 'email_otp'), eq(t.subject, subject), isNull(t.consumedAt)))
        .orderBy(desc(t.createdAt))
        .limit(1)
        .for('update');
      if (!row) return 'invalid';
      if (row.attempts >= OTP_MAX_ATTEMPTS) return 'locked';
      if (row.expiresAt.getTime() <= now.getTime()) return 'expired';
      const stored = Buffer.from(row.keyHash, 'hex');
      const match = stored.length === expected.length && timingSafeEqual(stored, expected) && row.userId === userId;
      if (match) {
        await tx.update(t).set({ consumedAt: now }).where(eq(t.id, row.id));
        return 'ok';
      }
      const [after] = await tx
        .update(t)
        .set({ attempts: sql`${t.attempts} + 1` })
        .where(eq(t.id, row.id))
        .returning({ attempts: t.attempts });
      return after.attempts >= OTP_MAX_ATTEMPTS ? 'locked' : 'invalid';
    });
  }
}
