import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { RECOVERY_ALPHABET, RECOVERY_CODE_LENGTH, formatRecoveryCode, type AuthTokens } from '@vietlearning/contracts/api';
import { schema, type Db } from '../../db/client.js';

/**
 * Phát hành và xoay vòng token cho tài khoản khách.
 * - Access token: JWT HS256 { sub, typ: 'access' }, hết hạn sau ACCESS_TTL_S.
 * - Refresh token: 32 byte ngẫu nhiên, DB chỉ lưu sha256; dùng một lần (mỗi lần làm mới => token mới).
 * - Mã khôi phục: 16 ký tự Crockford base32 (80 bit), DB chỉ lưu sha256 (đủ entropy nên không cần băm chậm;
 *   /auth/recover còn bị giới hạn số lần theo IP).
 */
export const ACCESS_TTL_S = 15 * 60;
export const REFRESH_TTL_MS = 90 * 24 * 3600 * 1000;

export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

export function newRecoveryCode(): string {
  // 256 chia hết cho 32 => lấy 5 bit thấp của mỗi byte vẫn phân bố đều
  return [...randomBytes(RECOVERY_CODE_LENGTH)].map((b) => RECOVERY_ALPHABET[b & 31]).join('');
}

export { formatRecoveryCode };

export async function issueTokens(app: FastifyInstance, db: Db, userId: string, now = new Date()): Promise<AuthTokens> {
  const refreshToken = randomBytes(32).toString('base64url');
  await db.insert(schema.refreshTokens).values({
    userId,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(now.getTime() + REFRESH_TTL_MS)
  });
  const accessToken = app.jwt.sign({ sub: userId, typ: 'access' }, { expiresIn: ACCESS_TTL_S });
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_S, userId };
}

/**
 * Sau khi xoay vòng thất bại: token này TỪNG hợp lệ và đã bị thu hồi (đã dùng) => trả chủ token (để ghi audit
 * “dùng lại refresh token”). Token lạ / chưa từng tồn tại => null.
 */
export async function refreshTokenOwnerIfReused(db: Db, refreshToken: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: schema.refreshTokens.userId, revokedAt: schema.refreshTokens.revokedAt })
    .from(schema.refreshTokens)
    .where(eq(schema.refreshTokens.tokenHash, sha256(refreshToken)));
  return row?.revokedAt ? row.userId : null;
}

/** Đổi refresh token hợp lệ lấy cặp token mới; token cũ bị thu hồi. null = không hợp lệ/hết hạn/đã dùng. */
export async function rotateRefreshToken(app: FastifyInstance, db: Db, refreshToken: string, now = new Date()): Promise<AuthTokens | null> {
  const hash = sha256(refreshToken);
  const userId = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(schema.refreshTokens.tokenHash, hash), isNull(schema.refreshTokens.revokedAt), gt(schema.refreshTokens.expiresAt, now)))
      .returning({ userId: schema.refreshTokens.userId });
    if (!row) return null;
    const [user] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.id, row.userId), isNull(schema.users.deletedAt)));
    return user?.id ?? null;
  });
  return userId ? issueTokens(app, db, userId, now) : null;
}
