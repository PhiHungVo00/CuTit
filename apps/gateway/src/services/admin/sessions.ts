import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';
import { schema, type Db } from '../../db/client.js';
import type { Tx } from './audit.js';
import { newOpaqueToken, sha256Hex } from './crypto.js';

/**
 * Phiên quản trị + token (spec §5.4, đề xuất §B7):
 * - access JWT `typ:'admin'`, HS256, ký bằng ADMIN_JWT_SECRET (RIÊNG với JWT_SECRET của app; dùng `jose`, không dùng `app.jwt`), sống 10 phút,
 *   mang `sid` (id phiên) để hook kiểm phiên còn sống mỗi request => đăng xuất/thu hồi có hiệu lực ngay.
 * - vé đăng nhập `typ:'admin_ticket'` sống 5 phút (sau bước mật khẩu), mang `next` nhưng nơi dùng LUÔN đối chiếu lại DB.
 * - refresh = chuỗi ngẫu nhiên 256 bit trong cookie HttpOnly; DB chỉ giữ sha256. XOAY VÒNG mỗi lần làm mới, có ân hạn 30 giây cho request
 *   song song, dùng lại token cũ quá ân hạn => thu hồi phiên (xem rotateSession). Cộng HttpOnly + SameSite=Strict + Path hẹp + hạn rảnh 30 phút / tối đa 12 giờ.
 * - phiên hết hạn khi: rảnh > 30 phút (tính từ lần refresh gần nhất), > 12 giờ kể từ lúc tạo (không gia hạn), hoặc bị thu hồi.
 */
export const ADMIN_ACCESS_TTL_S = 600;
export const ADMIN_TICKET_TTL_S = 300;
export const ADMIN_IDLE_MS = 30 * 60_000;
export const ADMIN_MAX_MS = 12 * 3600_000;
export const ADMIN_COOKIE_NAME = 'admin_refresh';
export const ADMIN_COOKIE_PATH = '/admin/v1/auth';
const ISSUER = 'becutit-admin';
const AUDIENCE = 'becutit-admin-api';

export type AdminKey = Uint8Array;

export const adminKeyOf = (secret: string): AdminKey => new TextEncoder().encode(secret);

export async function signAccess(key: AdminKey, userId: string, sessionId: string, now: Date): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({ typ: 'admin', sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ADMIN_ACCESS_TTL_S)
    .sign(key);
}

export interface AccessClaims {
  userId: string;
  sessionId: string;
}

/** Sai chữ ký / hết hạn / sai typ / thiếu sid => null */
export async function verifyAccess(key: AdminKey, token: string, now: Date): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE, currentDate: now });
    if (payload.typ !== 'admin' || typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    return null;
  }
}

export type TicketNext = 'totp' | 'enroll';

export async function signTicket(key: AdminKey, userId: string, next: TicketNext, ver: string, now: Date): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({ typ: 'admin_ticket', next, ver })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ADMIN_TICKET_TTL_S)
    .sign(key);
}

export async function verifyTicket(key: AdminKey, ticket: string, now: Date): Promise<{ userId: string; next: TicketNext; ver: string } | null> {
  try {
    const { payload } = await jwtVerify(ticket, key, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE, currentDate: now });
    if (payload.typ !== 'admin_ticket' || typeof payload.sub !== 'string') return null;
    if (payload.next !== 'totp' && payload.next !== 'enroll') return null;
    if (typeof payload.ver !== 'string') return null;
    return { userId: payload.sub, next: payload.next, ver: payload.ver };
  } catch {
    return null;
  }
}

export interface NewSession {
  sessionId: string;
  refreshToken: string;
  expiresAt: Date;
}

/** Tạo phiên (gọi trong transaction đăng nhập thành công) */
export async function createSession(
  tx: Tx | Db,
  userId: string,
  now: Date,
  meta: { ipHash?: string | null; userAgent?: string | null }
): Promise<NewSession> {
  const refreshToken = newOpaqueToken();
  const expiresAt = new Date(now.getTime() + ADMIN_MAX_MS);
  const [row] = await tx
    .insert(schema.adminSessions)
    .values({
      userId,
      refreshHash: sha256Hex(refreshToken),
      mfaAt: now,
      lastSeenAt: now,
      expiresAt,
      ipHash: meta.ipHash ?? null,
      userAgent: meta.userAgent ?? null,
      createdAt: now
    })
    .returning({ id: schema.adminSessions.id });
  return { sessionId: row.id, refreshToken, expiresAt };
}

/** Ân hạn xoay vòng: tab/yêu cầu song song còn gửi cookie cũ trong khoảng này vẫn được nhận (không đặt cookie mới) */
export const ADMIN_ROTATE_GRACE_MS = 30_000;

export type RotateResult =
  | { kind: 'rotated'; sessionId: string; userId: string; expiresAt: Date; refreshToken: string }
  | { kind: 'grace'; sessionId: string; userId: string; expiresAt: Date }
  | { kind: 'reuse'; userId: string }
  | null;

/**
 * Làm mới có XOAY VÒNG (rà kien-truc PR #50, TB4). Chỉ khớp phiên chưa thu hồi, chưa quá 12 giờ, chưa rảnh quá 30 phút.
 * - token hiện tại: cấp token mới, giữ băm token cũ + lúc xoay (UPDATE có điều kiện nguyên tử);
 * - token cũ trong ân hạn 30 giây: nhận access nhưng KHÔNG đặt cookie mới (cookie mới đã nằm trong trình duyệt);
 * - token cũ quá ân hạn: nghi bị đánh cắp => thu hồi cả phiên (`reuse`);
 * - không khớp / hết hạn: null (`session_expired`).
 */
export async function rotateSession(db: Db, refreshToken: string, now: Date): Promise<RotateResult> {
  const t = schema.adminSessions;
  const h = sha256Hex(refreshToken);
  const idleCutoff = new Date(now.getTime() - ADMIN_IDLE_MS);
  const live = and(isNull(t.revokedAt), gt(t.expiresAt, now), gt(t.lastSeenAt, idleCutoff));
  for (let attempt = 0; attempt < 2; attempt++) {
    const [row] = await db.select().from(t).where(or(eq(t.refreshHash, h), eq(t.prevRefreshHash, h)));
    if (!row || row.revokedAt || row.expiresAt <= now || row.lastSeenAt <= idleCutoff) return null;
    if (row.refreshHash === h) {
      const fresh = newOpaqueToken();
      const rows = await db
        .update(t)
        .set({ refreshHash: sha256Hex(fresh), prevRefreshHash: h, rotatedAt: now, lastSeenAt: now })
        .where(and(eq(t.id, row.id), eq(t.refreshHash, h), live))
        .returning({ id: t.id });
      if (rows.length) return { kind: 'rotated', sessionId: row.id, userId: row.userId, expiresAt: row.expiresAt, refreshToken: fresh };
      continue; // thua một request song song vừa xoay: đọc lại, lần này khớp token cũ trong ân hạn
    }
    // khớp token CŨ
    if (row.rotatedAt && now.getTime() - row.rotatedAt.getTime() <= ADMIN_ROTATE_GRACE_MS) {
      await db.update(t).set({ lastSeenAt: now }).where(and(eq(t.id, row.id), live));
      return { kind: 'grace', sessionId: row.id, userId: row.userId, expiresAt: row.expiresAt };
    }
    await db.update(t).set({ revokedAt: now }).where(and(eq(t.id, row.id), isNull(t.revokedAt)));
    return { kind: 'reuse', userId: row.userId };
  }
  return null;
}

/** Tài khoản còn dùng được cho quản trị: chưa xóa, không đang chờ xóa (rà kien-truc PR #50, TB1) */
export async function accountUsable(db: Db | Tx, userId: string): Promise<boolean> {
  const [u] = await db.select({ deletedAt: schema.users.deletedAt, deleteAt: schema.users.deleteAt }).from(schema.users).where(eq(schema.users.id, userId));
  return Boolean(u && !u.deletedAt && !u.deleteAt);
}

/** Phiên (theo id + chủ) còn dùng được không: chưa thu hồi, chưa quá 12 giờ, chưa rảnh quá 30 phút */
export async function isSessionActive(db: Db, sessionId: string, userId: string, now: Date): Promise<boolean> {
  const t = schema.adminSessions;
  const [row] = await db
    .select({ id: t.id })
    .from(t)
    .where(
      and(eq(t.id, sessionId), eq(t.userId, userId), isNull(t.revokedAt), gt(t.expiresAt, now), gt(t.lastSeenAt, new Date(now.getTime() - ADMIN_IDLE_MS)))
    );
  return Boolean(row);
}

export async function revokeSessionByRefresh(db: Db, refreshToken: string, now: Date): Promise<boolean> {
  const t = schema.adminSessions;
  const rows = await db
    .update(t)
    .set({ revokedAt: now })
    .where(and(eq(t.refreshHash, sha256Hex(refreshToken)), isNull(t.revokedAt)))
    .returning({ id: t.id });
  return rows.length > 0;
}

/** Thu hồi mọi phiên còn sống của một người (reset TOTP, thu hết vai trò) */
export async function revokeAllSessions(db: Db | Tx, userId: string, now: Date): Promise<number> {
  const t = schema.adminSessions;
  const rows = await db
    .update(t)
    .set({ revokedAt: now })
    .where(and(eq(t.userId, userId), isNull(t.revokedAt)))
    .returning({ id: t.id });
  return rows.length;
}

/** Dọn phiên đã hết hạn quá 30 ngày (job hằng ngày) */
export async function purgeExpiredSessions(db: Db, now: Date, graceMs = 30 * 24 * 3600_000): Promise<number> {
  const t = schema.adminSessions;
  const rows = await db
    .delete(t)
    .where(lt(t.expiresAt, new Date(now.getTime() - graceMs)))
    .returning({ id: t.id });
  return rows.length;
}

/** Cookie refresh: HttpOnly; Secure; SameSite=Strict; Path hẹp. `maxAgeS` ≤ 0 => xóa cookie */
export function refreshCookie(token: string, maxAgeS: number): string {
  const base = `${ADMIN_COOKIE_NAME}=${maxAgeS > 0 ? token : ''}; HttpOnly; Secure; SameSite=Strict; Path=${ADMIN_COOKIE_PATH}`;
  return maxAgeS > 0 ? `${base}; Max-Age=${Math.floor(maxAgeS)}` : `${base}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/** Lấy refresh từ header Cookie; sai dạng => null (không tin chuỗi lạ) */
export function readRefreshCookie(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== ADMIN_COOKIE_NAME) continue;
    const v = part.slice(i + 1).trim();
    return /^[A-Za-z0-9_-]{43}$/.test(v) ? v : null;
  }
  return null;
}
