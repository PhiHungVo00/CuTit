import { and, eq, gt, isNotNull, isNull, lte } from 'drizzle-orm';
import { ACCOUNT_DELETE_GRACE_DAYS } from '@vietlearning/contracts/api';
import { schema, type Db } from '../../db/client.js';

/**
 * Vòng đời tài khoản (dự án 3, Task 4): xóa mềm 30 ngày, khôi phục, xóa cứng + bia mộ, thu hồi token.
 *
 * Tham khảo (chỉ ý tưởng, không chép mã; tự viết theo kiến trúc dự án):
 *  - Refresh token xoay vòng + phát hiện dùng lại: OAuth 2.0 Security BCP, RFC 9700 §4.14 (Refresh Token Protection),
 *    https://www.rfc-editor.org/rfc/rfc9700 (đã xác nhận mục 4.14.2 là "Recommendations"; chưa đối chiếu từng câu chữ).
 *  - Mẫu "xóa mềm bằng cột hạn + job dọn định kỳ" là kỹ thuật phổ biến; KHÔNG tìm thấy/không dùng đoạn mã mẫu cụ thể nào.
 * Không có mã nguồn bên thứ ba nào được chép vào tệp này.
 */

const DAY_MS = 24 * 3600 * 1000;
export const GRACE_MS = ACCOUNT_DELETE_GRACE_DAYS * DAY_MS;
/** Bia mộ của refresh token: sau hạn dùng tối đa (90 ngày) token đó đằng nào cũng hết hạn => dọn */
export const REFRESH_TOMBSTONE_TTL_MS = 90 * DAY_MS;
/** Tên đăng nhập của tài khoản đã xóa cứng được giữ chỗ 30 ngày (spec 5.5) */
export const USERNAME_RESERVE_MS = 30 * DAY_MS;

const { users, refreshTokens, deletedAccounts, identities, reservedUsernames, friendInvites, authChallenges } = schema;

/** auth_challenges (nonce Google, mã OTP, bộ đếm giới hạn, vé gộp) hết hạn quá 1 ngày thì dọn (đề xuất A7) */
export const CHALLENGE_PURGE_AFTER_MS = DAY_MS;

/**
 * Đặt hạn xóa: tài khoản bị khóa ngay. Thu hồi MỌI refresh token, hủy mã mời bạn (ẩn khỏi bạn bè).
 * Gọi lại khi đã chờ xóa => giữ nguyên hạn đầu (không gia hạn). Trả hạn xóa cứng, hoặc null nếu không có user.
 */
export async function scheduleDeletion(db: Db, userId: string, now: Date): Promise<Date | null> {
  return db.transaction(async (tx) => {
    const [u] = await tx.select({ deleteAt: users.deleteAt }).from(users).where(eq(users.id, userId)).for('update');
    if (!u) return null;
    const deleteAt = u.deleteAt ?? new Date(now.getTime() + GRACE_MS);
    if (!u.deleteAt) await tx.update(users).set({ deleteAt }).where(eq(users.id, userId));
    await tx.update(refreshTokens).set({ revokedAt: now }).where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
    await tx.delete(friendInvites).where(eq(friendInvites.userId, userId));
    return deleteAt;
  });
}

/** Còn trong hạn khôi phục? => {deleteAt} (ISO) để đăng nhập trả `restorable`; null nếu đang hoạt động hoặc đã quá hạn. */
export async function restorableOf(db: Db, userId: string, now: Date): Promise<{ deleteAt: string } | null> {
  const [u] = await db.select({ deleteAt: users.deleteAt }).from(users).where(eq(users.id, userId));
  if (!u?.deleteAt || u.deleteAt.getTime() <= now.getTime()) return null;
  return { deleteAt: u.deleteAt.toISOString() };
}

/** Khôi phục: bỏ hạn xóa. false = không còn user hoặc đã quá hạn. Người đang hoạt động => true (idempotent). */
export async function restoreAccount(db: Db, userId: string, now: Date): Promise<boolean> {
  const [u] = await db.select({ deleteAt: users.deleteAt }).from(users).where(eq(users.id, userId));
  if (!u) return false;
  if (!u.deleteAt) return true;
  // Điều kiện hạn nằm TRONG câu UPDATE: job dọn chạy xen giữa không thể bị "hồi sinh" nhầm
  const res = await db
    .update(users)
    .set({ deleteAt: null })
    .where(and(eq(users.id, userId), gt(users.deleteAt, now)))
    .returning({ id: users.id });
  return res.length > 0;
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Xóa cứng MỘT người dùng trong transaction `tx`: chép băm credential vào bia mộ, giữ chỗ tên đăng nhập, rồi xóa user
 * (mọi bảng con cascade). Tên đăng nhập giữ chỗ nằm CÙNG transaction với lệnh xóa => không ai chen vào lấy tên giữa hai bước.
 * - refresh token: bia mộ hết hạn sau 90 ngày (expires_at) vì token đó đằng nào cũng hết hạn.
 * - mã khôi phục: expires_at = null (giữ mãi; mã không tự hết hạn nên bia mộ cũng không được dọn).
 */
export async function hardDeleteUserTx(tx: Tx, userId: string, now: Date): Promise<boolean> {
  const [u] = await tx.select({ code: users.recoveryCodeHash }).from(users).where(eq(users.id, userId)).for('update');
  if (!u) return false;
  const tokens = await tx.select({ hash: refreshTokens.tokenHash }).from(refreshTokens).where(eq(refreshTokens.userId, userId));
  const rtExpires = new Date(now.getTime() + REFRESH_TOMBSTONE_TTL_MS);
  const rows = [
    ...tokens.map((t) => ({ credentialHash: t.hash, deletedAt: now, reason: 'deleted' as const, expiresAt: rtExpires })),
    ...(u.code ? [{ credentialHash: u.code, deletedAt: now, reason: 'deleted' as const, expiresAt: null }] : [])
  ];
  if (rows.length) await tx.insert(deletedAccounts).values(rows).onConflictDoNothing();

  const names = await tx
    .select({ subject: identities.subject })
    .from(identities)
    .where(and(eq(identities.userId, userId), eq(identities.provider, 'password')));
  if (names.length) {
    const until = new Date(now.getTime() + USERNAME_RESERVE_MS);
    await tx
      .insert(reservedUsernames)
      .values(names.map((n) => ({ username: n.subject, until })))
      .onConflictDoUpdate({ target: reservedUsernames.username, set: { until } });
  }
  await tx.delete(users).where(eq(users.id, userId));
  return true;
}

/** Xóa cứng ngay (mode 'now'). */
export async function hardDeleteUser(db: Db, userId: string, now: Date): Promise<boolean> {
  return db.transaction((tx) => hardDeleteUserTx(tx, userId, now));
}

/** Dọn bia mộ + tên giữ chỗ hết hạn (theo expires_at / until, KHÔNG theo deleted_at; expires_at null = giữ mãi). */
export async function purgeExpiredTombstones(db: Db, now: Date): Promise<void> {
  await db.delete(deletedAccounts).where(and(isNotNull(deletedAccounts.expiresAt), lte(deletedAccounts.expiresAt, now)));
  await db.delete(reservedUsernames).where(lte(reservedUsernames.until, now));
  // Không dọn thì bảng phình mãi (mỗi GET /v1/auth/nonce một dòng). Chừa 1 ngày để mã vừa hết hạn vẫn báo otp_expired.
  await db.delete(authChallenges).where(lte(authChallenges.expiresAt, new Date(now.getTime() - CHALLENGE_PURGE_AFTER_MS)));
}

/**
 * Job dọn: xóa cứng mọi tài khoản đã quá hạn xóa (`delete_at <= now`), mỗi tài khoản một transaction riêng
 * (một tài khoản lỗi không chặn các tài khoản khác), rồi dọn bia mộ/tên giữ chỗ hết hạn. Trả số tài khoản đã xóa.
 * Idempotent: chạy lại hoặc chạy trên nhiều instance cùng lúc đều an toàn (hàng bị khóa `for update`, đã xóa thì bỏ qua).
 */
export async function purgeExpiredAccounts(db: Db, now: Date, onError?: (err: unknown, userId: string) => void): Promise<number> {
  const due = await db.select({ id: users.id }).from(users).where(and(isNotNull(users.deleteAt), lte(users.deleteAt, now)));
  let n = 0;
  for (const { id } of due) {
    try {
      const ok = await db.transaction(async (tx) => {
        // Kiểm lại trong transaction: có thể vừa được khôi phục hoặc đã bị xóa bởi instance khác
        const [u] = await tx.select({ deleteAt: users.deleteAt }).from(users).where(eq(users.id, id)).for('update');
        if (!u?.deleteAt || u.deleteAt.getTime() > now.getTime()) return false;
        return hardDeleteUserTx(tx, id, now);
      });
      if (ok) n++;
    } catch (err) {
      onError?.(err, id);
    }
  }
  await purgeExpiredTombstones(db, now);
  return n;
}

// ---------- Đăng xuất ----------

/** Thu hồi refresh token này (hoặc mọi token của chủ nó nếu everywhere). Token lạ => không làm gì (không lộ). Trả userId nếu có. */
export async function logoutByRefreshToken(db: Db, tokenHash: string, everywhere: boolean, now: Date): Promise<string | null> {
  const [row] = await db
    .select({ userId: refreshTokens.userId, familyId: refreshTokens.familyId, revokedAt: refreshTokens.revokedAt, expiresAt: refreshTokens.expiresAt })
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash));
  if (!row) return null;
  // "Mọi máy" chỉ với token CÒN HIỆU LỰC: token cũ đã xoay vòng/hết hạn (có thể bị lộ từ bản sao lưu, log…) không được
  // dùng để đá mọi máy của chủ tài khoản ra (rà kien-truc RA-DOT2). Token cũ chỉ thu hồi họ của chính nó (vô hại).
  const live = !row.revokedAt && row.expiresAt.getTime() > now.getTime();
  if (everywhere && live) await revokeAllTokens(db, row.userId, now);
  else await revokeFamily(db, row.familyId, now);
  return row.userId;
}

/** Đăng xuất một máy = thu hồi cả họ token của máy đó (token đã xoay vòng của họ cũng chết) */
export async function revokeFamily(db: Db, familyId: string, now: Date): Promise<void> {
  await db.update(refreshTokens).set({ revokedAt: now }).where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}

export async function revokeAllTokens(db: Db, userId: string, now: Date): Promise<void> {
  await db.update(refreshTokens).set({ revokedAt: now }).where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}
