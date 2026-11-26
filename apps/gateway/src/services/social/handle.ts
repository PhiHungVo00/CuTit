import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import type { z } from 'zod';
import {
  ChatErrorCode,
  FriendErrorCode,
  HandleSchema,
  type SocialMeSchema,
  type SocialSettings,
  type SocialSettingsUpdateSchema
} from '@vietlearning/contracts/api';
import { schema, type Db } from '../../db/client.js';
import { GatewayError } from '../../pipeline/RequestPipeline.js';
import { uniqueViolation } from '../auth/accounts.js';
import { chatEligibility, invalidateChatEligibility } from './eligibility.js';

/**
 * Dự án 4 (spec 5.2) — handle (tên bạn bè) và cài đặt riêng tư. Handle sống ở `social_profiles` (cần có tên hiển thị trước).
 * Duy nhất không phân biệt hoa thường (chỉ mục `lower(handle)`), và không trùng TÊN ĐĂNG NHẬP của người khác.
 */
type SocialMe = z.infer<typeof SocialMeSchema>;
type SocialSettingsUpdate = z.infer<typeof SocialSettingsUpdateSchema>;
const { socialProfiles, identities, users, reservedUsernames } = schema;

export const HANDLE_COOLDOWN_DAYS = 30;
const DAY_MS = 86_400_000;

const nameRequired = () => new GatewayError(409, FriendErrorCode.nameRequired, 'Hãy đặt tên hiển thị trước');

/** Người khác (không phải `userId`) đang dùng handle này, làm tên đăng nhập, hoặc đang giữ chỗ? */
async function handleUnavailable(db: Db, userId: string, handle: string, now: Date): Promise<boolean> {
  const [byHandle] = await db
    .select({ u: socialProfiles.userId })
    .from(socialProfiles)
    .where(and(sql`lower(${socialProfiles.handle}) = ${handle}`, ne(socialProfiles.userId, userId)))
    .limit(1);
  if (byHandle) return true;
  const [byLogin] = await db
    .select({ u: identities.userId })
    .from(identities)
    .where(and(eq(identities.provider, 'password'), eq(identities.subject, handle), ne(identities.userId, userId)))
    .limit(1);
  if (byLogin) return true;
  const [reserved] = await db
    .select({ u: reservedUsernames.username })
    .from(reservedUsernames)
    .where(and(eq(reservedUsernames.username, handle), gt(reservedUsernames.until, now)))
    .limit(1);
  return Boolean(reserved);
}

/** Đặt/đổi handle. Cùng handle đang dùng => không làm gì (không tính vào hạn 30 ngày). */
export async function setHandle(db: Db, userId: string, handle: string, now: Date = new Date()): Promise<string> {
  const [row] = await db
    .select({ isGuest: users.isGuest, isAdult: users.isAdult, hasProfile: socialProfiles.userId, current: socialProfiles.handle, changedAt: socialProfiles.handleChangedAt })
    .from(users)
    .leftJoin(socialProfiles, eq(socialProfiles.userId, users.id))
    .where(eq(users.id, userId));
  if (!row) throw new GatewayError(404, 'not_found', 'Không tìm thấy tài khoản');
  if (row.isGuest) throw new GatewayError(403, ChatErrorCode.forbidden, 'Tài khoản khách không dùng được tên bạn bè');
  if (row.isAdult === false) throw new GatewayError(403, ChatErrorCode.adultRequired, 'Chưa dùng được tên bạn bè');
  if (!row.hasProfile) throw nameRequired();
  if (row.current === handle) return handle;
  if (row.current && row.changedAt && now.getTime() - row.changedAt.getTime() < HANDLE_COOLDOWN_DAYS * DAY_MS) {
    throw new GatewayError(429, FriendErrorCode.handleCooldown, 'Tên bạn bè chỉ đổi 1 lần mỗi 30 ngày');
  }
  if (await handleUnavailable(db, userId, handle, now)) throw new GatewayError(409, FriendErrorCode.handleTaken, 'Tên này đã có người dùng');
  try {
    // Có điều kiện theo giá trị đã đọc: hai lần đổi đồng thời không cùng vượt hạn 30 ngày (lần sau không khớp => 0 dòng)
    const changed = await db
      .update(socialProfiles)
      .set({ handle, handleChangedAt: now, updatedAt: now })
      .where(and(eq(socialProfiles.userId, userId), row.changedAt ? eq(socialProfiles.handleChangedAt, row.changedAt) : isNull(socialProfiles.handleChangedAt)))
      .returning({ u: socialProfiles.userId });
    if (!changed.length) throw new GatewayError(429, FriendErrorCode.handleCooldown, 'Tên bạn bè vừa được đổi, hãy thử lại sau');
  } catch (err) {
    // đua với người khác đặt cùng handle: chỉ mục duy nhất lower(handle) là người phân xử cuối
    if (uniqueViolation(err)) throw new GatewayError(409, FriendErrorCode.handleTaken, 'Tên này đã có người dùng');
    throw err;
  }
  invalidateChatEligibility(userId);
  return handle;
}

/** Gợi ý: tên đăng nhập (tài khoản mật khẩu) nếu hợp lệ và chưa ai khác dùng làm handle; ngược lại null */
export async function suggestHandle(db: Db, userId: string, now: Date = new Date()): Promise<string | null> {
  const [login] = await db
    .select({ subject: identities.subject })
    .from(identities)
    .where(and(eq(identities.userId, userId), eq(identities.provider, 'password')));
  if (!login) return null;
  const parsed = HandleSchema.safeParse(login.subject);
  if (!parsed.success) return null;
  return (await handleUnavailable(db, userId, parsed.data, now)) ? null : parsed.data;
}

const DEFAULT_SETTINGS: SocialSettings = { discoverable: true, showOnline: true, showReadReceipts: true, showPushPreview: false };

async function readSettings(db: Db, userId: string): Promise<{ handle: string | null; settings: SocialSettings } | null> {
  const [p] = await db.select().from(socialProfiles).where(eq(socialProfiles.userId, userId));
  if (!p) return null;
  return {
    handle: p.handle,
    settings: { discoverable: p.discoverable, showOnline: p.showOnline, showReadReceipts: p.showReadReceipts, showPushPreview: p.showPushPreview }
  };
}

/** GET /v1/chat/settings (mọi người dùng đăng nhập đọc được của CHÍNH mình; `ineligible` cho client biết cổng nào còn đóng) */
export async function getSocialMe(db: Db, userId: string, now: Date = new Date()): Promise<SocialMe> {
  const cur = await readSettings(db, userId);
  const e = await chatEligibility(db, userId, now);
  return {
    handle: cur?.handle ?? null,
    suggestedHandle: cur?.handle || (!e.ok && (e.reason === 'guest' || e.reason === 'minor')) ? null : await suggestHandle(db, userId, now),
    ineligible: e.ok ? null : e.reason,
    settings: cur?.settings ?? DEFAULT_SETTINGS
  };
}

export async function updateSocialSettings(db: Db, userId: string, patch: SocialSettingsUpdate, now: Date = new Date()): Promise<SocialSettings> {
  const cur = await readSettings(db, userId);
  if (!cur) throw nameRequired();
  if (Object.keys(patch).length) await db.update(socialProfiles).set({ ...patch, updatedAt: now }).where(eq(socialProfiles.userId, userId));
  return { ...cur.settings, ...patch };
}
