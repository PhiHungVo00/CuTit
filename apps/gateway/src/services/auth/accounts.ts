import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { EmailSchema, UsernameSchema, type AuthProvider, type AuthSignedIn } from '@vietlearning/contracts/api';
import type { DeletedReason } from '@vietlearning/contracts/db';
import { schema, type Db } from '../../db/client.js';
import { issueTokens } from './tokens.js';

/**
 * Truy vấn dùng chung của luồng mật khẩu/OTP (Task 2 dự án 3). Không sửa tokens.ts / repo.ts (Task 4 sở hữu).
 */

/** Lỗi vi phạm unique của Postgres (23505) — postgres-js và PGlite đều đặt `code`; drizzle mới có thể bọc trong `cause` */
export function uniqueViolation(err: unknown): { constraint?: string } | null {
  const e = err as { code?: string; constraint?: string; constraint_name?: string; cause?: unknown } | null;
  if (!e || typeof e !== 'object') return null;
  if (e.code === '23505') return { constraint: e.constraint ?? e.constraint_name };
  return e.cause ? uniqueViolation(e.cause) : null;
}

/** 'mai.le@gmail.com' => 'm***@gmail.com' (để hiển thị; KHÔNG dùng cho log) */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

export async function providersOf(db: Db, userId: string): Promise<AuthProvider[]> {
  const rows = await db.select({ provider: schema.identities.provider }).from(schema.identities).where(eq(schema.identities.userId, userId));
  const order: AuthProvider[] = ['google', 'password', 'email'];
  return order.filter((p) => rows.some((r) => r.provider === p));
}

/** Phản hồi `signed_in`: token mới + phương thức đã gắn + `restorable` nếu tài khoản đang chờ xóa (Task 4 dùng) */
export async function signedIn(app: FastifyInstance, db: Db, userId: string, now: Date): Promise<AuthSignedIn> {
  const [user] = await db.select({ deleteAt: schema.users.deleteAt }).from(schema.users).where(eq(schema.users.id, userId));
  const tokens = await issueTokens(app, db, userId, now);
  return {
    status: 'signed_in',
    ...tokens,
    isGuest: false,
    providers: await providersOf(db, userId),
    ...(user?.deleteAt ? { restorable: { deleteAt: user.deleteAt.toISOString() } } : {})
  };
}

/** Thu hồi MỌI refresh token còn hiệu lực của người dùng (đổi/đặt lại mật khẩu) */
export async function revokeAllRefreshTokens(db: Db, userId: string, now: Date): Promise<void> {
  const t = schema.refreshTokens;
  await db
    .update(t)
    .set({ revokedAt: now })
    .where(and(eq(t.userId, userId), isNull(t.revokedAt)));
}

/** Lý do credential nằm trong bia mộ (`deleted_accounts`), null = không có. /auth/recover cần phân biệt `upgraded`. */
export async function tombstoneReason(db: Db, credentialHash: string): Promise<DeletedReason | null> {
  const t = schema.deletedAccounts;
  const [row] = await db.select({ reason: t.reason }).from(t).where(eq(t.credentialHash, credentialHash));
  return row?.reason ?? null;
}

export interface PasswordAccount {
  userId: string;
  username: string;
  passwordHash: string;
  backupCodeHash: string | null;
}

/** Tài khoản có mật khẩu theo tên đăng nhập đã chuẩn hóa (chữ thường); null = không có */
export async function findPasswordAccount(db: Db, username: string): Promise<PasswordAccount | null> {
  const i = schema.identities;
  const c = schema.passwordCredentials;
  const [row] = await db
    .select({ userId: i.userId, username: i.subject, passwordHash: c.passwordHash, backupCodeHash: c.backupCodeHash })
    .from(i)
    .innerJoin(c, eq(c.userId, i.userId))
    .innerJoin(schema.users, and(eq(schema.users.id, i.userId), isNull(schema.users.deletedAt)))
    .where(and(eq(i.provider, 'password'), eq(i.subject, username)));
  return row ?? null;
}

export async function passwordAccountOf(db: Db, userId: string): Promise<PasswordAccount | null> {
  const i = schema.identities;
  const c = schema.passwordCredentials;
  const [row] = await db
    .select({ userId: c.userId, username: i.subject, passwordHash: c.passwordHash, backupCodeHash: c.backupCodeHash })
    .from(c)
    .innerJoin(i, and(eq(i.userId, c.userId), eq(i.provider, 'password')))
    .where(eq(c.userId, userId));
  return row ?? null;
}

/** Tên đăng nhập đang giữ chỗ (tài khoản cũ bị xóa hẳn < 30 ngày) — DB không đối chiếu với identities (lưu ý 2 kien-truc) */
export async function isUsernameReserved(db: Db, username: string, now: Date): Promise<boolean> {
  const t = schema.reservedUsernames;
  const [row] = await db
    .select({ u: t.username })
    .from(t)
    .where(and(eq(t.username, username), gt(t.until, now)));
  return Boolean(row);
}

export interface RecoveryTarget extends PasswordAccount {
  /** email đã xác minh gắn với tài khoản (chữ thường) */
  email: string;
}

/**
 * "Quên mật khẩu": tên đăng nhập HOẶC email => tài khoản có mật khẩu + email đã xác minh. null nếu thiếu bất kỳ thứ gì
 * (nơi gọi trả phản hồi giống hệt nhau để không lộ tài khoản nào tồn tại / có email).
 */
export async function findRecoveryTarget(db: Db, usernameOrEmail: string): Promise<RecoveryTarget | null> {
  const i = schema.identities;
  let account: PasswordAccount | null = null;
  if (usernameOrEmail.includes('@')) {
    const email = EmailSchema.safeParse(usernameOrEmail);
    if (!email.success) return null;
    const [row] = await db
      .select({ userId: i.userId })
      .from(i)
      .where(and(eq(i.provider, 'email'), eq(i.subject, email.data), eq(i.emailVerified, true)));
    if (!row) return null;
    account = await passwordAccountOf(db, row.userId);
  } else {
    const username = UsernameSchema.safeParse(usernameOrEmail);
    if (!username.success) return null;
    account = await findPasswordAccount(db, username.data);
  }
  if (!account) return null;
  const [emailRow] = await db
    .select({ email: i.subject })
    .from(i)
    .where(and(eq(i.userId, account.userId), eq(i.provider, 'email'), eq(i.emailVerified, true)));
  return emailRow ? { ...account, email: emailRow.email } : null;
}
