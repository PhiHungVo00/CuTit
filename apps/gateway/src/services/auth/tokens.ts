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

/**
 * `familyId`: khi XOAY VÒNG phải truyền họ của token cũ (tường minh). Bỏ trống = đăng nhập mới => họ mới (mặc định DB).
 * Quên truyền khi xoay vòng sẽ âm thầm tạo họ mới và làm hỏng việc thu hồi theo họ.
 */
export async function issueTokens(app: FastifyInstance, db: Db, userId: string, now = new Date(), familyId?: string): Promise<AuthTokens> {
  const refreshToken = randomBytes(32).toString('base64url');
  await db.insert(schema.refreshTokens).values({
    userId,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
    ...(familyId ? { familyId } : {})
  });
  const accessToken = app.jwt.sign({ sub: userId, typ: 'access' }, { expiresIn: ACCESS_TTL_S });
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_S, userId };
}

export type RefreshFailure =
  | { kind: 'reused'; userId: string }
  | { kind: 'pending_deletion'; userId: string }
  | { kind: 'unknown' };

/**
 * Sau khi xoay vòng thất bại, phân loại để route trả đúng mã:
 *  - 'pending_deletion': chủ token đang chờ xóa (token bị thu hồi lúc bấm xóa) => client giữ dữ liệu, hỏi người dùng.
 *  - 'reused': token từng hợp lệ nhưng đã bị thu hồi/xoay vòng => dấu hiệu bị lộ; THU HỒI CẢ HỌ (RFC 9700 §4.14.2).
 *  - 'unknown': token lạ.
 */
export async function classifyRefreshFailure(db: Db, refreshToken: string, now = new Date()): Promise<RefreshFailure> {
  const [row] = await db
    .select({ userId: schema.refreshTokens.userId, familyId: schema.refreshTokens.familyId, revokedAt: schema.refreshTokens.revokedAt, deleteAt: schema.users.deleteAt })
    .from(schema.refreshTokens)
    .innerJoin(schema.users, eq(schema.users.id, schema.refreshTokens.userId))
    .where(eq(schema.refreshTokens.tokenHash, sha256(refreshToken)));
  if (!row) return { kind: 'unknown' };
  if (row.deleteAt && row.deleteAt.getTime() > now.getTime()) return { kind: 'pending_deletion', userId: row.userId };
  if (!row.revokedAt) return { kind: 'unknown' }; // hết hạn tự nhiên
  await db
    .update(schema.refreshTokens)
    .set({ revokedAt: now })
    .where(and(eq(schema.refreshTokens.familyId, row.familyId), isNull(schema.refreshTokens.revokedAt)));
  return { kind: 'reused', userId: row.userId };
}

/** Đổi refresh token hợp lệ lấy cặp token mới CÙNG HỌ; token cũ bị thu hồi. null = không hợp lệ/hết hạn/đã dùng/chủ đang chờ xóa. */
export async function rotateRefreshToken(app: FastifyInstance, db: Db, refreshToken: string, now = new Date()): Promise<AuthTokens | null> {
  const hash = sha256(refreshToken);
  const next = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.refreshTokens)
      .set({ revokedAt: now, lastUsedAt: now })
      .where(and(eq(schema.refreshTokens.tokenHash, hash), isNull(schema.refreshTokens.revokedAt), gt(schema.refreshTokens.expiresAt, now)))
      .returning({ userId: schema.refreshTokens.userId, familyId: schema.refreshTokens.familyId });
    if (!row) return null;
    const [user] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.id, row.userId), isNull(schema.users.deletedAt), isNull(schema.users.deleteAt)));
    return user ? { userId: user.id, familyId: row.familyId } : null;
  });
  return next ? issueTokens(app, db, next.userId, now, next.familyId) : null;
}
