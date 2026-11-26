import { and, eq, gt, isNull, or } from 'drizzle-orm';
import type { z } from 'zod';
import { ChatErrorCode, type ChatIneligibleReasonSchema } from '@vietlearning/contracts/api';
import { schema, type Db } from '../../db/client.js';
import { GatewayError } from '../../pipeline/RequestPipeline.js';

/**
 * Dự án 4 (spec 5.1) — CỬA DUY NHẤT: ai dùng được chat / gọi / nhóm / lời mời bằng handle.
 * Mọi route, WebSocket `hello`, gọi, nhóm đều gọi hàm này; không nơi nào tự kiểm lại điều kiện.
 * Cờ tuổi KHÔNG nằm trong JWT: đọc từ DB, nhớ 60 giây; ai đổi điều kiện (khai tuổi, đặt handle, khóa chat…) gọi
 * `invalidateChatEligibility(userId)` để có hiệu lực ngay (chỉ đúng trong MỘT tiến trình Gateway — bản đầu một instance).
 */
type ChatIneligibleReason = z.infer<typeof ChatIneligibleReasonSchema>;
export type ChatEligibility = { ok: true } | { ok: false; reason: ChatIneligibleReason };

export const ELIGIBILITY_TTL_MS = 60_000;
const CACHE_MAX = 20_000;

const cache = new Map<string, { until: number; value: ChatEligibility }>();

export function invalidateChatEligibility(userId: string): void {
  cache.delete(userId);
}
/** Chỉ cho test */
export function clearChatEligibilityCache(): void {
  cache.clear();
}

async function compute(db: Db, userId: string, now: Date): Promise<ChatEligibility> {
  const { users, socialProfiles, chatRestrictions } = schema;
  const [u] = await db
    .select({ isGuest: users.isGuest, deleteAt: users.deleteAt, isAdult: users.isAdult, handle: socialProfiles.handle })
    .from(users)
    .leftJoin(socialProfiles, eq(socialProfiles.userId, users.id))
    .where(eq(users.id, userId));
  // Không còn tài khoản => coi như đang chờ xóa (không có đường nào dùng tiếp)
  if (!u || u.deleteAt) return { ok: false, reason: 'pending_deletion' };
  if (u.isGuest) return { ok: false, reason: 'guest' };
  if (u.isAdult === null) return { ok: false, reason: 'age_unknown' };
  if (!u.isAdult) return { ok: false, reason: 'minor' };
  if (!u.handle) return { ok: false, reason: 'no_handle' };
  const [r] = await db
    .select({ id: chatRestrictions.id })
    .from(chatRestrictions)
    .where(
      and(eq(chatRestrictions.userId, userId), isNull(chatRestrictions.liftedAt), or(isNull(chatRestrictions.until), gt(chatRestrictions.until, now)))
    )
    .limit(1);
  if (r) return { ok: false, reason: 'restricted' };
  return { ok: true };
}

export async function chatEligibility(db: Db, userId: string, now: Date = new Date()): Promise<ChatEligibility> {
  const hit = cache.get(userId);
  if (hit && hit.until > now.getTime()) return hit.value;
  const value = await compute(db, userId, now);
  if (cache.size >= CACHE_MAX) {
    for (const [k, v] of cache) if (v.until <= now.getTime()) cache.delete(k);
    if (cache.size >= CACHE_MAX) cache.clear();
  }
  cache.set(userId, { until: now.getTime() + ELIGIBILITY_TTL_MS, value });
  return value;
}

/** Lý do => mã lỗi HTTP máy đọc được (người gọi tự biết mình thuộc nhóm nào, không lộ gì về người khác) */
const REASON_HTTP: Record<ChatIneligibleReason, { status: number; code: string }> = {
  guest: { status: 403, code: ChatErrorCode.forbidden },
  pending_deletion: { status: 403, code: 'account_pending_deletion' },
  minor: { status: 403, code: ChatErrorCode.adultRequired },
  age_unknown: { status: 403, code: ChatErrorCode.ageRequired },
  no_handle: { status: 409, code: ChatErrorCode.handleRequired },
  restricted: { status: 403, code: ChatErrorCode.chatRestricted }
};

/** Ném GatewayError tương ứng nếu chưa đủ điều kiện; dùng ở đầu mọi route chat/bạn bè bằng handle */
export async function requireChatEligible(db: Db, userId: string, now: Date = new Date(), allow: ChatIneligibleReason[] = []): Promise<void> {
  const e = await chatEligibility(db, userId, now);
  if (!e.ok && !allow.includes(e.reason)) {
    const { status, code } = REASON_HTTP[e.reason];
    throw new GatewayError(status, code, undefined, { reason: e.reason });
  }
}
