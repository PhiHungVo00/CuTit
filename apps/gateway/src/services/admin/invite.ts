import { randomInt } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { schema } from '../../db/client.js';
import type { Exec } from './totp.js';
import type { AdminCrypto } from './crypto.js';

/**
 * Mã mời đăng ký mã 6 số lần đầu (rà kien-truc PR #50, TB3): `admin:grant` / `admin:reset-totp` sinh một mã dùng một lần, in ra cho
 * người vận hành, lưu BĂM (HMAC), hết hạn sau 24 giờ. `totp/enroll` bắt buộc mã này => biết mật khẩu mà không có mã mời thì không
 * giành được đăng ký TOTP của chủ. Mã được XÓA khi xác nhận TOTP thành công (cùng transaction).
 */
export const INVITE_TTL_MS = 24 * 3600_000;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function newInviteCode(): string {
  const group = () => Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `${group()}-${group()}-${group()}`;
}

/** Cấp mã mời mới (thay mã cũ nếu có); trả mã nguyên văn để in ra MỘT lần */
export async function issueInvite(db: Exec, crypto: AdminCrypto, userId: string, now: Date): Promise<string> {
  const code = newInviteCode();
  const t = schema.staffInvites;
  const values = { codeHash: crypto.hashBackupCode(code), expiresAt: new Date(now.getTime() + INVITE_TTL_MS), createdAt: now };
  await db.insert(t).values({ userId, ...values }).onConflictDoUpdate({ target: t.userId, set: values });
  return code;
}

/** Mã mời còn hạn và khớp? */
export async function inviteMatches(db: Exec, crypto: AdminCrypto, userId: string, code: string, now: Date): Promise<boolean> {
  const t = schema.staffInvites;
  const [row] = await db
    .select({ id: t.userId })
    .from(t)
    .where(and(eq(t.userId, userId), eq(t.codeHash, crypto.hashBackupCode(code)), gt(t.expiresAt, now)));
  return Boolean(row);
}

/** Có mã mời còn hạn (chưa dùng)? Dùng ở bước confirm */
export async function hasLiveInvite(db: Exec, userId: string, now: Date): Promise<boolean> {
  const t = schema.staffInvites;
  const [row] = await db.select({ id: t.userId }).from(t).where(and(eq(t.userId, userId), gt(t.expiresAt, now)));
  return Boolean(row);
}

/** Tiêu mã mời (xóa); false = không có/đã hết hạn. Dùng trong transaction xác nhận TOTP */
export async function consumeInvite(db: Exec, userId: string, now: Date): Promise<boolean> {
  const t = schema.staffInvites;
  const rows = await db
    .delete(t)
    .where(and(eq(t.userId, userId), gt(t.expiresAt, now)))
    .returning({ id: t.userId });
  return rows.length > 0;
}
