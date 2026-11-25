import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';
import { schema, type Db } from '../../db/client.js';
import type { Tx } from './audit.js';
import { newOpaqueToken, sha256Hex } from './crypto.js';

/**
 * Phiên quản trị + token (spec §5.4, đề xuất §B7):
 * - access JWT `typ:'admin'`, HS256, ký bằng ADMIN_JWT_SECRET (RIÊNG với JWT_SECRET của app; dùng `jose`, không dùng `app.jwt`), sống 10 phút,
 *   mang `sid` (id phiên) để hook kiểm phiên còn sống mỗi request => đăng xuất/thu hồi có hiệu lực ngay.
 * - vé đăng nhập `typ:'admin_ticket'` sống 5 phút (sau bước mật khẩu), mang `next` nhưng nơi dùng LUÔN đối chiếu lại DB.
 * - refresh = chuỗi ngẫu nhiên 256 bit trong cookie HttpOnly; DB chỉ giữ sha256. KHÔNG xoay vòng (xoay vòng làm hai tab/tải lại nhanh
 *   đá nhau ra khỏi phiên); rủi ro đánh cắp cookie bị chặn bằng HttpOnly + SameSite=Strict + Path hẹp + hạn rảnh 30 phút / tối đa 12 giờ.
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

export async function signTicket(key: AdminKey, userId: string, next: TicketNext, now: Date): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({ typ: 'admin_ticket', next })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ADMIN_TICKET_TTL_S)
    .sign(key);
}

export async function verifyTicket(key: AdminKey, ticket: string, now: Date): Promise<{ userId: string; next: TicketNext } | null> {
  try {
    const { payload } = await jwtVerify(ticket, key, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE, currentDate: now });
    if (payload.typ !== 'admin_ticket' || typeof payload.sub !== 'string') return null;
    if (payload.next !== 'totp' && payload.next !== 'enroll') return null;
    return { userId: payload.sub, next: payload.next };
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

/**
 * Làm mới: chỉ khớp khi chưa thu hồi, chưa quá 12 giờ và chưa rảnh quá 30 phút; cập nhật `last_seen_at` nguyên tử.
 * null = hết hạn / không có / bị thu hồi (nơi gọi trả `session_expired`).
 */
export async function touchSessionByRefresh(db: Db, refreshToken: string, now: Date): Promise<{ sessionId: string; userId: string; expiresAt: Date } | null> {
  const t = schema.adminSessions;
  const idleCutoff = new Date(now.getTime() - ADMIN_IDLE_MS);
  const rows = await db
    .update(t)
    .set({ lastSeenAt: now })
    .where(and(eq(t.refreshHash, sha256Hex(refreshToken)), isNull(t.revokedAt), gt(t.expiresAt, now), gt(t.lastSeenAt, idleCutoff)))
    .returning({ sessionId: t.id, userId: t.userId, expiresAt: t.expiresAt });
  return rows[0] ?? null;
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
