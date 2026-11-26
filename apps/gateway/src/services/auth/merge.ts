import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { schema, type Db } from '../../db/client.js';
import { REFRESH_TTL_MS, sha256 } from './tokens.js';

/**
 * Dự án 3 Task 5 — gộp khách U_B vào tài khoản thật U_A (POST /v1/me/merge, phương án M2 của đề xuất A6.2(3)).
 *
 * Một transaction duy nhất:
 *  1. đọc vé gộp (auth_challenges kind 'merge_ticket', user_id = khách, subject = đích);
 *  2. khóa HAI dòng users theo thứ tự id (FOR UPDATE) — tránh deadlock khi hai khách cùng gộp vào một tài khoản;
 *  3. kiểm lại dưới khóa: người gọi còn là khách, đích là tài khoản thật và KHÔNG chờ xóa (Task 4);
 *  4. tiêu vé (UPDATE … WHERE consumed_at IS NULL RETURNING — chỉ một request thắng);
 *  5. strategy 'merge' => chuyển/gộp từng bảng theo luật bên dưới; 'discard_device' => không chuyển gì;
 *  6. chép băm refresh token + mã khôi phục của khách vào bia mộ lý do 'merged' (máy khác của khách nhận
 *     `account_merged` = mời đăng nhập, KHÔNG xóa dữ liệu máy), rồi xóa khách (các bảng con cascade).
 * Lỗi ở bất kỳ bước nào => rollback toàn bộ, vé chưa bị tiêu.
 *
 * Luật gộp (chép lại luật của `applyOne`, services/learner/repo.ts):
 *  - users (hồ sơ), preferences: LWW theo profile_updated_at / updated_at
 *  - srs_cards: trùng item_ref giữ thẻ updated_at mới hơn (giữ id thẻ của đích, chép nội dung); srs_reviews chuyển sang thẻ được giữ
 *  - attempts, placement_sessions, sessions (+messages), usage_logs: đổi user_id
 *  - xp_events: chép sang, trùng client_event_id thì bỏ; daily_activity.xp CỘNG đúng tổng các sự kiện thực sự chuyển sang
 *  - daily_activity: seconds = greatest, goal_met/freeze_used = OR
 *  - lesson_progress: completed thắng, best_score max, completed_at sớm nhất · achievements: hợp, earned_at sớm nhất
 *  - learner_progress: LWW, riêng lessons_done = max
 *  - consents: KHÔNG gộp (giữ đồng ý của đích — Luật 91/2025 Điều 9: im lặng không phải đồng ý)
 *  - ai_usage: cộng units theo (ngày, năng lực) — gộp không làm mới hạn mức AI
 *  - sync_events: chép sổ chống trùng (bỏ trùng) => sự kiện còn trong hàng đợi máy khác của khách gửi lại vào đích không cộng hai lần
 *  - social_profiles: đích có thì giữ, chưa có thì lấy của khách · friend_invites: bỏ (cascade)
 *  - friendships: đổi khách thành đích, sắp lại user_a < user_b, bỏ cặp tự kết bạn, trùng cặp giữ dòng cũ hơn
 *  - feedback_reports (dự án 5a): đổi user_id sang đích ở CẢ HAI chiến lược (góp ý không phải tiến độ học; người dùng vẫn muốn theo dõi) —
 *    tệp/lời nhắn đi theo qua feedback_id, không cần chép
 *  - staff_roles/staff_totp/staff_invites/admin_sessions: cascade (khách không có vai trò) · feedback_events.actor_user_id: set_null
 *  - audit_events: không sửa (FK SET NULL khi xóa khách) · refresh_tokens/auth_challenges/identities/password_credentials: cascade
 *
 * Tham khảo ý (không chép mã): Better Auth (MIT) plugin anonymous — móc `onLinkAccount({anonymousUser, newUser})` để ứng dụng tự
 * chuyển dữ liệu trong transaction trước khi đổi phiên, https://better-auth.com/docs/plugins/anonymous ; bài
 * https://dev.to/pawsinside/anonymous-first-auth-with-better-auth-postgres-56ck (chuyển dữ liệu khách trong một transaction
 * Postgres; nhắc rằng gộp vào tài khoản ĐÃ CÓ dữ liệu cần luật xung đột riêng — ở đây là bảng luật A6.2(3)).
 */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type MergeStrategy = 'merge' | 'discard_device';
export type MergeResult = { kind: 'ok'; targetId: string } | { kind: 'invalid_ticket' } | { kind: 'target_pending_deletion' };

/**
 * Mọi bảng có khóa ngoại tới users.id và cách merge.ts xử lý (test so với pg_constraint: thêm bảng mới mà quên => đỏ).
 * 'move' = chuyển/gộp theo luật; 'cascade' = cố ý bỏ theo khách; 'set_null' = FK tự ẩn danh.
 */
export const USER_TABLE_RULES = {
  preferences: 'move',
  sessions: 'move',
  attempts: 'move',
  srs_cards: 'move',
  placement_sessions: 'move',
  usage_logs: 'move',
  xp_events: 'move',
  daily_activity: 'move',
  lesson_progress: 'move',
  achievements: 'move',
  sync_events: 'move',
  learner_progress: 'move',
  ai_usage: 'move',
  social_profiles: 'move',
  friendships: 'move',
  consents: 'cascade',
  refresh_tokens: 'cascade',
  friend_invites: 'cascade',
  identities: 'cascade',
  password_credentials: 'cascade',
  auth_challenges: 'cascade',
  audit_events: 'set_null',
  feedback_reports: 'move',
  feedback_events: 'set_null',
  staff_roles: 'cascade',
  staff_totp: 'cascade',
  staff_invites: 'cascade',
  admin_sessions: 'cascade'
} as const;
export const HANDLED_USER_TABLES = Object.keys(USER_TABLE_RULES);

const { users, refreshTokens, deletedAccounts, authChallenges } = schema;

export async function mergeGuestInto(db: Db, guestId: string, mergeTicket: string, strategy: MergeStrategy, now: Date): Promise<MergeResult> {
  return db.transaction(async (tx) => {
    const [t] = await tx
      .select({ id: authChallenges.id, userId: authChallenges.userId, subject: authChallenges.subject })
      .from(authChallenges)
      .where(
        and(
          eq(authChallenges.kind, 'merge_ticket'),
          eq(authChallenges.keyHash, sha256(mergeTicket)),
          isNull(authChallenges.consumedAt),
          gt(authChallenges.expiresAt, now)
        )
      );
    if (!t || t.userId !== guestId || !t.subject) return { kind: 'invalid_ticket' } as const;
    const targetId = t.subject;
    if (targetId === guestId) return { kind: 'invalid_ticket' } as const;

    // Khóa theo thứ tự id: hai giao dịch gộp đụng cùng một dòng luôn khóa cùng thứ tự => không deadlock
    const locked = await tx
      .select({ id: users.id, isGuest: users.isGuest, deleteAt: users.deleteAt, code: users.recoveryCodeHash })
      .from(users)
      .where(inArray(users.id, [guestId, targetId]))
      .orderBy(users.id)
      .for('update');
    const guest = locked.find((u) => u.id === guestId);
    const target = locked.find((u) => u.id === targetId);
    // Khách đã bị gộp/xóa bởi request khác (vé mất theo cascade) hoặc đã nâng cấp => vé không còn hiệu lực
    if (!guest || !guest.isGuest || guest.deleteAt) return { kind: 'invalid_ticket' } as const;
    // Đích đã bị xóa cứng / không phải tài khoản thật => coi như vé hỏng
    if (!target || target.isGuest) return { kind: 'invalid_ticket' } as const;
    // Đích đang chờ xóa (kể cả quá hạn mà job chưa chạy): không đổ dữ liệu vào tài khoản sắp xóa. Vé CHƯA bị tiêu:
    // người dùng khôi phục tài khoản (đăng nhập lại => restorable) rồi thử lại trong 10 phút.
    if (target.deleteAt) return { kind: 'target_pending_deletion' } as const;

    const consumed = await tx
      .update(authChallenges)
      .set({ consumedAt: now })
      .where(and(eq(authChallenges.id, t.id), isNull(authChallenges.consumedAt)))
      .returning({ id: authChallenges.id });
    if (consumed.length !== 1) return { kind: 'invalid_ticket' } as const;

    if (strategy === 'merge') await moveLearnerData(tx, guestId, targetId, now);
    // Góp ý (dự án 5a) đi theo tài khoản ở cả hai chiến lược: 'discard_device' chỉ bỏ TIẾN ĐỘ học của máy này
    await tx.execute(sql`update feedback_reports set user_id = ${targetId}::uuid where user_id = ${guestId}::uuid`);

    const tokens = await tx.select({ hash: refreshTokens.tokenHash }).from(refreshTokens).where(eq(refreshTokens.userId, guestId));
    const tombs = [
      ...tokens.map((r) => ({ credentialHash: r.hash, reason: 'merged' as const, deletedAt: now, expiresAt: new Date(now.getTime() + REFRESH_TTL_MS) })),
      ...(guest.code ? [{ credentialHash: guest.code, reason: 'merged' as const, deletedAt: now, expiresAt: null }] : [])
    ];
    if (tombs.length) await tx.insert(deletedAccounts).values(tombs).onConflictDoNothing();
    await tx.delete(users).where(eq(users.id, guestId));
    return { kind: 'ok', targetId } as const;
  });
}

/** Chuyển/gộp dữ liệu học của khách B sang đích A theo bảng luật (đầu tệp). Chạy trong transaction đã khóa hai dòng users. */
async function moveLearnerData(tx: Tx, b: string, a: string, now: Date): Promise<void> {
  const B = sql`${b}::uuid`;
  const A = sql`${a}::uuid`;
  const nowIso = now.toISOString();

  // Hồ sơ: LWW theo profile_updated_at
  await tx.execute(sql`
    update users ua set onboarding_done = ub.onboarding_done, level = ub.level, goal = ub.goal, native_lang = ub.native_lang,
      target_dialect = ub.target_dialect, profile_updated_at = ub.profile_updated_at
    from users ub
    where ua.id = ${A} and ub.id = ${B} and ub.profile_updated_at is not null
      and (ua.profile_updated_at is null or ua.profile_updated_at < ub.profile_updated_at)`);

  // Tùy chỉnh: LWW theo updated_at
  await tx.execute(sql`
    insert into preferences (user_id, voice_id, speed, dialect, correction_level, persona, ui_language, updated_at)
    select ${A}, voice_id, speed, dialect, correction_level, persona, ui_language, updated_at from preferences where user_id = ${B}
    on conflict (user_id) do update set voice_id = excluded.voice_id, speed = excluded.speed, dialect = excluded.dialect,
      correction_level = excluded.correction_level, persona = excluded.persona, ui_language = excluded.ui_language, updated_at = excluded.updated_at
    where preferences.updated_at < excluded.updated_at`);

  // Thẻ SRS: lịch sử ôn của thẻ trùng chuyển sang thẻ của đích (giữ id đó), chép nội dung nếu thẻ khách mới hơn, bỏ thẻ trùng, chuyển phần còn lại
  await tx.execute(sql`
    update srs_reviews r set card_id = t.id
    from srs_cards g join srs_cards t on t.user_id = ${A} and t.item_ref = g.item_ref
    where r.card_id = g.id and g.user_id = ${B}`);
  await tx.execute(sql`
    update srs_cards t set front = g.front, back = g.back, source = g.source, ease = g.ease, interval_days = g.interval_days,
      repetitions = g.repetitions, due_at = g.due_at, updated_at = g.updated_at
    from srs_cards g
    where g.user_id = ${B} and t.user_id = ${A} and t.item_ref = g.item_ref and g.updated_at > t.updated_at`);
  await tx.execute(sql`
    delete from srs_cards g where g.user_id = ${B}
      and exists (select 1 from srs_cards t where t.user_id = ${A} and t.item_ref = g.item_ref)`);
  await tx.execute(sql`update srs_cards set user_id = ${A} where user_id = ${B}`);

  // Chỉ thêm: đổi chủ
  for (const table of ['attempts', 'placement_sessions', 'sessions', 'usage_logs'] as const) {
    await tx.execute(sql`update ${sql.identifier(table)} set user_id = ${A} where user_id = ${B}`);
  }

  // XP + hoạt động ngày: chép sự kiện XP (bỏ trùng client_event_id), cộng vào ngày ĐÚNG tổng đã chép (không cộng phần trùng);
  // seconds lấy max, cờ ngày OR. Ngày có XP mà khách thiếu dòng daily_activity vẫn được cộng (full join).
  await tx.execute(sql`
    with moved as (
      insert into xp_events (user_id, client_event_id, source, amount, lesson_id, day, created_at)
      select ${A}, client_event_id, source, amount, lesson_id, day, created_at from xp_events where user_id = ${B}
      on conflict (user_id, client_event_id) do nothing
      returning day, amount
    ), s as (select day, sum(amount)::int as x from moved group by day),
    bd as (select * from daily_activity where user_id = ${B})
    insert into daily_activity (user_id, day, seconds, xp, goal_met, freeze_used, updated_at)
    select ${A}, coalesce(bd.day, s.day), coalesce(bd.seconds, 0), coalesce(s.x, 0), coalesce(bd.goal_met, false),
      coalesce(bd.freeze_used, false), coalesce(bd.updated_at, ${nowIso}::timestamptz)
    from bd full join s on s.day = bd.day
    on conflict (user_id, day) do update set
      seconds = greatest(daily_activity.seconds, excluded.seconds),
      xp = daily_activity.xp + excluded.xp,
      goal_met = daily_activity.goal_met or excluded.goal_met,
      freeze_used = daily_activity.freeze_used or excluded.freeze_used,
      updated_at = greatest(daily_activity.updated_at, excluded.updated_at)`);

  await tx.execute(sql`
    insert into lesson_progress (user_id, lesson_id, status, best_score, completed_at, updated_at)
    select ${A}, lesson_id, status, best_score, completed_at, updated_at from lesson_progress where user_id = ${B}
    on conflict (user_id, lesson_id) do update set
      status = case when lesson_progress.status = 'completed' or excluded.status = 'completed' then 'completed' else excluded.status end,
      best_score = greatest(lesson_progress.best_score, excluded.best_score),
      completed_at = least(lesson_progress.completed_at, excluded.completed_at),
      updated_at = greatest(lesson_progress.updated_at, excluded.updated_at)`);

  await tx.execute(sql`
    insert into achievements (user_id, key, earned_at)
    select ${A}, key, earned_at from achievements where user_id = ${B}
    on conflict (user_id, key) do update set earned_at = least(achievements.earned_at, excluded.earned_at)`);

  await tx.execute(sql`
    insert into learner_progress (user_id, lessons_done, freezes, daily_goal, updated_at)
    select ${A}, lessons_done, freezes, daily_goal, updated_at from learner_progress where user_id = ${B}
    on conflict (user_id) do update set
      lessons_done = greatest(learner_progress.lessons_done, excluded.lessons_done),
      freezes = case when excluded.updated_at > learner_progress.updated_at then excluded.freezes else learner_progress.freezes end,
      daily_goal = case when excluded.updated_at > learner_progress.updated_at then excluded.daily_goal else learner_progress.daily_goal end,
      updated_at = greatest(learner_progress.updated_at, excluded.updated_at)`);

  await tx.execute(sql`
    insert into ai_usage (user_id, usage_day_utc, capability, units, updated_at)
    select ${A}, usage_day_utc, capability, units, updated_at from ai_usage where user_id = ${B}
    on conflict (user_id, usage_day_utc, capability) do update set
      units = ai_usage.units + excluded.units, updated_at = greatest(ai_usage.updated_at, excluded.updated_at)`);

  await tx.execute(sql`
    insert into sync_events (user_id, client_event_id, type, received_at)
    select ${A}, client_event_id, type, received_at from sync_events where user_id = ${B}
    on conflict (user_id, client_event_id) do nothing`);

  await tx.execute(sql`
    insert into social_profiles (user_id, display_name, updated_at)
    select ${A}, display_name, updated_at from social_profiles where user_id = ${B}
    on conflict (user_id) do nothing`);

  // Bạn bè: không chặn theo MAX_FRIENDS (gộp không được làm mất quan hệ); vượt trần chỉ chặn kết bạn MỚI (friends.ts)
  await tx.execute(sql`
    insert into friendships (user_a, user_b, goal_minutes, created_at)
    select least(${A}, f.other), greatest(${A}, f.other), f.goal_minutes, f.created_at
    from (
      select case when user_a = ${B} then user_b else user_a end as other, goal_minutes, created_at
      from friendships where user_a = ${B} or user_b = ${B}
    ) f
    where f.other <> ${A}
    on conflict (user_a, user_b) do update set
      goal_minutes = case when excluded.created_at < friendships.created_at then excluded.goal_minutes else friendships.goal_minutes end,
      created_at = least(friendships.created_at, excluded.created_at)`);
}
