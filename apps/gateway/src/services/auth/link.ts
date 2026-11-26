import { randomBytes } from 'node:crypto';
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { AuthProvider } from '@vietlearning/contracts/api';
import { schema, type Db } from '../../db/client.js';
import type { VerifiedIdentity } from '../../providers/identity.js';
import { REFRESH_TTL_MS, sha256 } from './tokens.js';

/**
 * Dự án 3 Task 3 — liên kết danh tính (Google) với người dùng. Luật (spec + đề xuất A6.2):
 * - Danh tính khóa theo (provider, subject) = Google `sub`. KHÔNG BAO GIỜ tra/gộp theo email (chống chiếm tài khoản).
 * - Khách + danh tính chưa thuộc ai => nâng cấp chính khách (giữ users.id), tắt mã khôi phục (bia mộ 'upgraded', giữ mãi).
 * - Danh tính đã thuộc tài khoản A: khách rỗng => xóa khách (bia mộ 'merged') và đăng nhập A; khách có tiến độ =>
 *   vé gộp (Task 5 dùng). Đang là tài khoản thật => identity_in_use (không gộp hai tài khoản thật).
 * - Gỡ: không gỡ được phương thức đăng nhập cuối (google/password; email chỉ để lấy lại mật khẩu nên không tính).
 * Đồng thời: khóa hàng users của người gọi (FOR UPDATE) + unique (provider,subject) và (user_id,provider) của DB.
 *
 * Tham khảo ý (không chép mã): Lucia (MIT) — bảng oauth_account khóa chính (provider_id, provider_user_id),
 * https://lucia-auth.com/guides/oauth/multiple-providers ; Auth.js (ISC) — mặc định KHÔNG tự liên kết theo email
 * (`allowDangerousEmailAccountLinking` tắt), https://github.com/nextauthjs/next-auth/discussions/10631 .
 */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export const NONCE_TTL_S = 600;
export const MERGE_TICKET_TTL_MS = 10 * 60 * 1000;
/** Phương thức dùng để ĐĂNG NHẬP (email chỉ để lấy lại mật khẩu) */
const LOGIN_PROVIDERS = ['google', 'password'] as const;

const { users, identities, refreshTokens, deletedAccounts, authChallenges, passwordCredentials } = schema;

const opaque = () => randomBytes(32).toString('base64url');

// ---------- Nonce một lần ----------

export async function issueNonce(db: Db, now = new Date()): Promise<{ nonce: string; expiresIn: number }> {
  const nonce = opaque();
  await db.insert(authChallenges).values({ kind: 'oidc_nonce', keyHash: sha256(nonce), expiresAt: new Date(now.getTime() + NONCE_TTL_S * 1000) });
  return { nonce, expiresIn: NONCE_TTL_S };
}

/** Đánh dấu nonce đã dùng — nguyên tử: chỉ một request thắng. false = không do server cấp / hết hạn / đã dùng. */
export async function consumeNonce(db: Db, nonce: string, now = new Date()): Promise<boolean> {
  const rows = await db
    .update(authChallenges)
    .set({ consumedAt: now })
    .where(
      and(
        eq(authChallenges.kind, 'oidc_nonce'),
        eq(authChallenges.keyHash, sha256(nonce)),
        isNull(authChallenges.consumedAt),
        gt(authChallenges.expiresAt, now)
      )
    )
    .returning({ id: authChallenges.id });
  return rows.length === 1;
}

// ---------- Tra cứu ----------

export async function providersOf(db: Db | Tx, userId: string): Promise<AuthProvider[]> {
  const rows = await db.select({ p: identities.provider }).from(identities).where(eq(identities.userId, userId)).orderBy(asc(identities.createdAt));
  return rows.map((r) => r.p);
}

/** Khách có tiến độ học trên server chưa (đề xuất A6.2(2)) */
async function hasProgress(tx: Tx, userId: string): Promise<boolean> {
  const r = await tx.execute<{ p: boolean }>(sql`select (
      exists(select 1 from ${schema.srsCards} where ${schema.srsCards.userId} = ${userId})
      or exists(select 1 from ${schema.attempts} where ${schema.attempts.userId} = ${userId})
      or exists(select 1 from ${schema.xpEvents} where ${schema.xpEvents.userId} = ${userId})
      or exists(select 1 from ${schema.lessonProgress} where ${schema.lessonProgress.userId} = ${userId})
    ) as p`);
  const rows = (Array.isArray(r) ? r : (r as { rows: { p: boolean }[] }).rows) as { p: boolean }[];
  return Boolean(rows[0]?.p);
}

async function ownerOf(tx: Db | Tx, subject: string): Promise<string | null> {
  const [row] = await tx
    .select({ userId: identities.userId })
    .from(identities)
    .where(and(eq(identities.provider, 'google'), eq(identities.subject, subject)));
  return row?.userId ?? null;
}

async function touch(db: Db | Tx, subject: string, now: Date) {
  await db.update(identities).set({ lastUsedAt: now }).where(and(eq(identities.provider, 'google'), eq(identities.subject, subject)));
}

const googleRow = (userId: string, v: VerifiedIdentity, now: Date) => ({
  userId,
  provider: 'google' as const,
  subject: v.subject,
  display: v.emailMasked,
  emailVerified: v.emailVerified,
  lastUsedAt: now
});

// ---------- Đăng nhập không Bearer ----------

/** POST /v1/auth/google: sub đã có => tài khoản đó; sub mới => tạo tài khoản thật mới (không phải khách) */
export async function signInWithGoogle(db: Db, v: VerifiedIdentity, now = new Date()): Promise<{ userId: string; created: boolean }> {
  const existing = await ownerOf(db, v.subject);
  if (existing) {
    await touch(db, v.subject, now);
    return { userId: existing, created: false };
  }
  return db.transaction(async (tx) => {
    const [u] = await tx.insert(users).values({ isGuest: false }).returning({ id: users.id });
    const [ins] = await tx.insert(identities).values(googleRow(u.id, v, now)).onConflictDoNothing().returning({ id: identities.id });
    if (ins) return { userId: u.id, created: true };
    // Máy khác vừa tạo cùng sub (đua): bỏ người dùng vừa tạo, dùng chủ đã có
    await tx.delete(users).where(eq(users.id, u.id));
    const owner = await ownerOf(tx, v.subject);
    if (!owner) throw new Error('identity race: owner vanished');
    return { userId: owner, created: false };
  });
}

// ---------- Liên kết có Bearer ----------

export type LinkResult =
  /** người gọi giữ nguyên userId (nâng cấp khách / liên kết thêm / đã liên kết từ trước) */
  | { kind: 'linked'; userId: string; upgraded: boolean }
  /** khách rỗng đã bị xóa; đăng nhập tài khoản chủ danh tính */
  | { kind: 'switched'; userId: string; removedGuestId: string }
  | { kind: 'needs_merge'; mergeTicket: string; targetCreatedAt: Date }
  | { kind: 'identity_in_use' }
  /** người gọi đang chờ xóa (Task 4) — đua với DELETE /v1/me sau khi pipeline đã cho qua */
  | { kind: 'pending_deletion' };

/** POST /v1/me/identities/google */
export async function linkGoogle(db: Db, callerId: string, v: VerifiedIdentity, now = new Date()): Promise<LinkResult> {
  return db.transaction(async (tx) => {
    // Khóa người gọi: hai request cùng khách (hai lần bấm, hai máy) chạy lần lượt
    const [caller] = await tx
      .select({ id: users.id, isGuest: users.isGuest, code: users.recoveryCodeHash, deleteAt: users.deleteAt })
      .from(users)
      .where(eq(users.id, callerId))
      .for('update');
    if (!caller) return { kind: 'identity_in_use' } as const;
    if (caller.deleteAt) return { kind: 'pending_deletion' } as const;

    for (let attempt = 0; attempt < 2; attempt++) {
      const owner = await ownerOf(tx, v.subject);
      if (owner === callerId) {
        await touch(tx, v.subject, now);
        return { kind: 'linked', userId: callerId, upgraded: false } as const;
      }
      if (owner) return otherOwner(tx, caller, owner, now);

      // Danh tính chưa thuộc ai. Mỗi người dùng tối đa một Google.
      const [mine] = await tx
        .select({ id: identities.id })
        .from(identities)
        .where(and(eq(identities.userId, callerId), eq(identities.provider, 'google')));
      if (mine) return { kind: 'identity_in_use' } as const;

      const [ins] = await tx.insert(identities).values(googleRow(callerId, v, now)).onConflictDoNothing().returning({ id: identities.id });
      if (!ins) continue; // người khác vừa lấy đúng sub này (đua) => xét lại theo chủ mới
      if (caller.isGuest) {
        await tx.update(users).set({ isGuest: false, recoveryCodeHash: null }).where(eq(users.id, callerId));
        // Mã khôi phục nằm nguyên văn trên máy và được tự dùng => tắt; bia mộ giữ mãi để máy khác nhận "đã nâng cấp"
        if (caller.code) await tx.insert(deletedAccounts).values({ credentialHash: caller.code, reason: 'upgraded', deletedAt: now, expiresAt: null }).onConflictDoNothing();
      }
      return { kind: 'linked', userId: callerId, upgraded: caller.isGuest } as const;
    }
    return { kind: 'identity_in_use' } as const;
  });
}

async function otherOwner(tx: Tx, caller: { id: string; isGuest: boolean; code: string | null }, owner: string, now: Date): Promise<LinkResult> {
  // Không gộp hai tài khoản thật (đề xuất A6.2(4))
  if (!caller.isGuest) return { kind: 'identity_in_use' };
  const [target] = await tx.select({ createdAt: users.createdAt, deleteAt: users.deleteAt }).from(users).where(eq(users.id, owner));
  // Chủ danh tính đã QUÁ HẠN xóa (job dọn chưa chạy) => coi như không còn (luật như /login), nhưng `sub` vẫn bị giữ tới khi
  // job dọn xóa cứng => không gắn được cho khách. 409 chứ không 401: client tự gửi lại khi 401 (nonce đã tiêu).
  if (!target || (target.deleteAt && target.deleteAt.getTime() <= now.getTime())) return { kind: 'identity_in_use' };
  if (await hasProgress(tx, caller.id)) {
    const mergeTicket = opaque();
    await tx.insert(authChallenges).values({
      kind: 'merge_ticket',
      keyHash: sha256(mergeTicket),
      userId: caller.id,
      subject: owner,
      expiresAt: new Date(now.getTime() + MERGE_TICKET_TTL_MS)
    });
    return { kind: 'needs_merge', mergeTicket, targetCreatedAt: target.createdAt };
  }
  // Khách rỗng: chép credential vào bia mộ 'merged' (máy khác của khách được mời đăng nhập), rồi xóa khách (cascade)
  const tokens = await tx.select({ hash: refreshTokens.tokenHash }).from(refreshTokens).where(eq(refreshTokens.userId, caller.id));
  const tombs = [
    ...tokens.map((t) => ({ credentialHash: t.hash, reason: 'merged' as const, deletedAt: now, expiresAt: new Date(now.getTime() + REFRESH_TTL_MS) })),
    ...(caller.code ? [{ credentialHash: caller.code, reason: 'merged' as const, deletedAt: now, expiresAt: null }] : [])
  ];
  if (tombs.length) await tx.insert(deletedAccounts).values(tombs).onConflictDoNothing();
  // Góp ý (dự án 5a) không tính là "tiến độ": khách rỗng vẫn có thể có góp ý => chuyển sang tài khoản đích, KHÔNG để cascade xóa (mất góp ý + tệp mồ côi)
  await tx.execute(sql`update feedback_reports set user_id = ${owner}::uuid where user_id = ${caller.id}::uuid`);
  await tx.delete(users).where(eq(users.id, caller.id));
  await tx.update(identities).set({ lastUsedAt: now }).where(and(eq(identities.userId, owner), eq(identities.provider, 'google')));
  return { kind: 'switched', userId: owner, removedGuestId: caller.id };
}

// ---------- Liệt kê / gỡ ----------

const FALLBACK_DISPLAY: Record<AuthProvider, string> = { google: 'Google', password: '***', email: '***' };

/** Email (danh tính 'email') luôn che khi hiện; display NULL => giá trị thay (lưu ý 5 của kien-truc) */
function displayOf(provider: AuthProvider, display: string | null, subject: string): string {
  if (display) return display;
  if (provider === 'password') return subject; // tên đăng nhập không phải bí mật
  if (provider === 'email') {
    const at = subject.lastIndexOf('@');
    return at > 0 ? `${subject[0]}***${subject.slice(at)}` : FALLBACK_DISPLAY.email;
  }
  return FALLBACK_DISPLAY[provider];
}

export async function listIdentities(db: Db | Tx, userId: string): Promise<{ id: string; provider: AuthProvider; display: string }[]> {
  const rows = await db
    .select({ id: identities.id, provider: identities.provider, display: identities.display, subject: identities.subject })
    .from(identities)
    .where(eq(identities.userId, userId))
    .orderBy(asc(identities.createdAt));
  return rows.map((r) => ({ id: r.id, provider: r.provider, display: displayOf(r.provider, r.display, r.subject) }));
}

export type UnlinkResult = { kind: 'ok'; provider: AuthProvider } | { kind: 'not_found' } | { kind: 'last_identity' } | { kind: 'pending_deletion' };

/** DELETE /v1/me/identities/:id — chỉ danh tính của chính mình; không gỡ phương thức đăng nhập cuối */
export async function unlinkIdentity(db: Db, userId: string, identityId: string): Promise<UnlinkResult> {
  return db.transaction(async (tx) => {
    // Khóa người dùng: hai lệnh gỡ đồng thời không cùng vượt qua bước đếm
    const [me] = await tx.select({ deleteAt: users.deleteAt }).from(users).where(eq(users.id, userId)).for('update');
    if (me?.deleteAt) return { kind: 'pending_deletion' } as const;
    const [target] = await tx
      .select({ provider: identities.provider })
      .from(identities)
      .where(and(eq(identities.id, identityId), eq(identities.userId, userId)));
    if (!target) return { kind: 'not_found' } as const;
    if ((LOGIN_PROVIDERS as readonly string[]).includes(target.provider)) {
      const logins = await tx
        .select({ id: identities.id })
        .from(identities)
        .where(and(eq(identities.userId, userId), inArray(identities.provider, [...LOGIN_PROVIDERS])));
      if (logins.length <= 1) return { kind: 'last_identity' } as const;
    }
    await tx.delete(identities).where(and(eq(identities.id, identityId), eq(identities.userId, userId)));
    // Gỡ mật khẩu => bỏ luôn băm mật khẩu + mã dự phòng (mã dự phòng chỉ dùng để đặt lại mật khẩu)
    // và email đã gắn: email CHỈ để lấy lại mật khẩu (spec 6) => không còn mục đích, không giữ thừa dữ liệu cá nhân
    // (tối thiểu hóa dữ liệu, NĐ 13/2023) — rà kien-truc RA-DOT2
    if (target.provider === 'password') {
      await tx.delete(passwordCredentials).where(eq(passwordCredentials.userId, userId));
      await tx.delete(identities).where(and(eq(identities.userId, userId), eq(identities.provider, 'email')));
    }
    return { kind: 'ok', provider: target.provider } as const;
  });
}
