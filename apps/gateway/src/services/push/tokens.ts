import { and, asc, eq, inArray, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { PushToken } from '@vietlearning/contracts/api';
import { schema, type Db } from '../../db/client.js';

const { pushTokens } = schema;

/** Trần số token/người (một người có vài máy; vượt thì bỏ token cũ nhất của CHÍNH người đó). */
export const PUSH_TOKENS_PER_USER = 10;
/** Token đã bị nhà cung cấp loại: dọn sau 7 ngày; token không thấy hoạt động quá 60 ngày: dọn. */
const DISABLED_KEEP_MS = 7 * 86_400_000;
const STALE_MS = 60 * 86_400_000;

/**
 * Đăng ký token thiết bị. Một thiết bị một người: token đã có của NGƯỜI KHÁC được CHUYỂN cho người mới (đăng nhập tài khoản khác
 * trên cùng máy) và bật lại; đăng ký lặp chỉ làm mới `last_seen_at`. Vượt trần ⇒ xóa các token cũ nhất của người này.
 */
export async function registerPushToken(db: Db, userId: string, t: PushToken, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(pushTokens)
      .values({ userId, token: t.token, platform: t.platform, appBuild: t.appBuild, locale: t.locale, createdAt: now, lastSeenAt: now })
      .onConflictDoUpdate({
        target: pushTokens.token,
        set: { userId, platform: t.platform, appBuild: t.appBuild, locale: t.locale, lastSeenAt: now, disabledAt: null }
      });
    const mine = await tx
      .select({ id: pushTokens.id })
      .from(pushTokens)
      .where(and(eq(pushTokens.userId, userId), ne(pushTokens.token, t.token)))
      // token đã chết đi trước, rồi tới token lâu không thấy nhất
      .orderBy(sql`${pushTokens.disabledAt} is null`, asc(pushTokens.lastSeenAt));
    const excess = mine.length + 1 - PUSH_TOKENS_PER_USER;
    if (excess > 0) {
      await tx.delete(pushTokens).where(inArray(pushTokens.id, mine.slice(0, excess).map((r) => r.id)));
    }
  });
}

/** Hủy token CỦA CHÍNH MÌNH (đăng xuất). Token của người khác/không tồn tại: không làm gì (không lộ gì). */
export async function removePushToken(db: Db, userId: string, token: string): Promise<void> {
  await db.delete(pushTokens).where(and(eq(pushTokens.userId, userId), eq(pushTokens.token, token)));
}

export async function activeTokensOf(db: Db, userId: string): Promise<Array<{ token: string; locale: 'vi' | 'en' }>> {
  return db
    .select({ token: pushTokens.token, locale: pushTokens.locale })
    .from(pushTokens)
    .where(and(eq(pushTokens.userId, userId), isNull(pushTokens.disabledAt)));
}

export async function disableTokens(db: Db, tokens: readonly string[], now = new Date()): Promise<void> {
  if (!tokens.length) return;
  await db.update(pushTokens).set({ disabledAt: now }).where(and(inArray(pushTokens.token, [...tokens]), isNull(pushTokens.disabledAt)));
}

/** Dọn token mồ côi (đã chết quá 7 ngày hoặc quá 60 ngày không hoạt động). Trả số dòng đã xóa. */
export async function purgeStalePushTokens(db: Db, now = new Date()): Promise<number> {
  const rows = await db
    .delete(pushTokens)
    .where(
      or(
        and(isNotNull(pushTokens.disabledAt), lt(pushTokens.disabledAt, new Date(now.getTime() - DISABLED_KEEP_MS))),
        lt(pushTokens.lastSeenAt, new Date(now.getTime() - STALE_MS))
      )
    )
    .returning({ id: pushTokens.id });
  return rows.length;
}
