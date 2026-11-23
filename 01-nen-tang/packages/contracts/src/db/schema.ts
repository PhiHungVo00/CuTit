import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  real,
  primaryKey,
  uniqueIndex,
  index,
  check,
  type AnyPgColumn
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Schema PostgreSQL (Drizzle) — một nguồn duy nhất cho Gateway.
 * Migration SQL đánh số sinh bằng drizzle-kit vào 01-nen-tang/apps/gateway/drizzle/ (không sửa tay bảng đã phát hành).
 *
 * Quy ước:
 * - Mọi bảng dữ liệu người học trỏ tới users.id với ON DELETE CASCADE => `DELETE /v1/me` xóa cứng sạch
 *   (kể cả xp_events). `users.deleted_at` dành cho xóa mềm có thời gian ân hạn sau này.
 * - Ngày học (`day`) là ngày ĐỊA PHƯƠNG 'YYYY-MM-DD' do client gửi — không tự tính theo UTC ở server.
 * - Khớp dữ liệu client trong 01-nen-tang/packages/state (nguồn chuẩn hiện tại của hình dạng dữ liệu).
 */

const ts = (name: string) => timestamp(name, { withTimezone: true });
const userRef = (name = 'user_id') =>
  uuid(name)
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

/** 1. Người dùng + hồ sơ học (tài khoản khách: email null, is_guest = true) */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').unique(),
    isGuest: boolean('is_guest').notNull().default(true),
    /**
     * Có từ GĐ0 (schema nền). Chế độ trẻ em (D4/GĐ4b) đã gỡ 19/11: trẻ dùng app như mọi người, không còn tài khoản
     * 'child'. Giữ hai cột này (vô hại, luôn 'adult' / null) để không phải đổi bảng users; không code nào đọc nữa.
     */
    accountType: text('account_type').notNull().default('adult'),
    parentUserId: uuid('parent_user_id').references((): AnyPgColumn => users.id, { onDelete: 'cascade' }),
    /** sha256 của mã khôi phục (mã gốc chỉ hiện cho người học, server không giữ) */
    recoveryCodeHash: text('recovery_code_hash').unique(),
    locale: text('locale').default('en'),
    nativeLang: text('native_lang').notNull().default('en'),
    level: integer('level').notNull().default(1),
    goal: text('goal'),
    targetDialect: text('target_dialect').notNull().default('north'), // north | central | south
    onboardingDone: boolean('onboarding_done').notNull().default(false),
    profileUpdatedAt: ts('profile_updated_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
    /**
     * Dự án 3 — xóa mềm 30 ngày: khác NULL = đã bấm xóa, tài khoản bị khóa (API thường trả `account_pending_deletion`),
     * job dọn xóa cứng khi `delete_at <= now()`. Đăng nhập lại trước hạn => hỏi khôi phục (đặt lại NULL).
     * (`deleted_at` cũ vẫn không dùng.)
     */
    deleteAt: ts('delete_at')
  },
  (t) => [
    index('users_delete_at_idx')
      .on(t.deleteAt)
      .where(sql`${t.deleteAt} is not null`)
  ]
);

/** 2. Tùy chỉnh (M12) — khớp Preferences của client */
export const preferences = pgTable('preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  voiceId: text('voice_id').notNull().default('vi-VN-Standard-A'),
  speed: real('speed').notNull().default(1),
  dialect: text('dialect').notNull().default('north'),
  correctionLevel: text('correction_level').notNull().default('gentle'), // gentle | strict | off
  persona: text('persona').notNull().default('be_cu_tit'),
  uiLanguage: text('ui_language').notNull().default('en'), // vi | en
  updatedAt: ts('updated_at').notNull().defaultNow()
});

/** 3. Phiên & tin nhắn hội thoại (chưa dùng ở GĐ0) */
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef(),
  mode: text('mode').default('free'), // free | roleplay
  scenarioId: text('scenario_id'),
  startedAt: ts('started_at').defaultNow(),
  endedAt: ts('ended_at')
});

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'agent'
  text: text('text').notNull(),
  blocksJson: jsonb('blocks_json'),
  audioId: text('audio_id'),
  createdAt: ts('created_at').defaultNow()
});

/** 4. Lượt làm bài (client giữ 1000 lượt gần nhất; server giữ hết để thống kê) */
export const attempts = pgTable(
  'attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    skill: text('skill').notNull(), // pronunciation | honorific | drill | sentence | dialect | vision | conversation
    correct: boolean('correct').notNull(),
    score: integer('score'),
    itemId: text('item_id'),
    detailJson: jsonb('detail_json'),
    createdAt: ts('created_at').notNull().defaultNow()
  },
  (t) => [index('attempts_user_time_idx').on(t.userId, t.createdAt)]
);

/** 5. Thẻ ôn SM-2 (A4) — một thẻ mỗi (user, item_ref) */
export const srsCards = pgTable(
  'srs_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    itemRef: text('item_ref').notNull(),
    front: text('front').notNull(),
    back: text('back').notNull(),
    source: text('source').notNull(),
    ease: integer('ease').notNull().default(250), // 250 = 2.50
    intervalDays: integer('interval_days').notNull().default(0),
    repetitions: integer('repetitions').notNull().default(0),
    dueAt: ts('due_at').notNull(),
    updatedAt: ts('updated_at').notNull().defaultNow()
  },
  (t) => [uniqueIndex('srs_cards_user_item_uq').on(t.userId, t.itemRef), index('srs_cards_due_idx').on(t.userId, t.dueAt)]
);

export const srsReviews = pgTable('srs_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  cardId: uuid('card_id')
    .notNull()
    .references(() => srsCards.id, { onDelete: 'cascade' }),
  quality: integer('quality').notNull(), // 0 - 5
  reviewedAt: ts('reviewed_at').defaultNow()
});

/** 6. Phiên xếp lớp A5 (id = sessionId client tạo; luôn lọc theo user_id) */
export const placementSessions = pgTable('placement_sessions', {
  id: uuid('id').primaryKey(),
  userId: userRef(),
  stateJson: jsonb('state_json').notNull(),
  estimateLevel: integer('estimate_level'), // 1 - 6
  updatedAt: ts('updated_at').notNull().defaultNow(),
  finishedAt: ts('finished_at')
});

/** 7. Kho nội dung đã duyệt */
export const contentItems = pgTable('content_items', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // 'honorific' | 'dialect' | 'culture' | 'scenario'
  dialect: text('dialect').default('all'),
  payloadJson: jsonb('payload_json').notNull(),
  version: integer('version').default(1),
  reviewedBy: text('reviewed_by'),
  createdAt: ts('created_at').defaultNow()
});

/** 8. Tài sản âm thanh & TTL */
export const audioAssets = pgTable('audio_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  hash: text('hash').notNull().unique(),
  kind: text('kind').notNull(), // 'tts_cache' | 'learner_audio'
  storageKey: text('storage_key').notNull(),
  expiresAt: ts('expires_at'),
  createdAt: ts('created_at').defaultNow()
});

/** 9. Nhật ký sử dụng & chi phí API */
export const usageLogs = pgTable('usage_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  capability: text('capability').notNull(), // 'stt' | 'tts' | 'llm' | 'vision'
  provider: text('provider').notNull(),
  units: integer('units').notNull(),
  costEstimate: integer('cost_estimate'),
  latencyMs: integer('latency_ms'),
  createdAt: ts('created_at').defaultNow()
});

/** 10. Bản ghi đồng ý (vd. key 'voice' — thông báo ghi âm gửi AI) */
export const consents = pgTable(
  'consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    key: text('key').notNull(),
    version: text('version').notNull(),
    grantedAt: ts('granted_at').notNull().defaultNow()
  },
  (t) => [uniqueIndex('consents_user_key_version_uq').on(t.userId, t.key, t.version)]
);

/** 11. Refresh token (lưu sha256, xoay vòng mỗi lần làm mới) */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: ts('created_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
    /**
     * Dự án 3 — họ token: token sinh ra khi xoay vòng mang family_id của token cũ; dùng lại token đã xoay => thu hồi
     * cả họ. Token có từ trước migration này: mỗi cái một họ riêng (gen_random_uuid() tính theo từng dòng).
     */
    familyId: uuid('family_id').notNull().defaultRandom(),
    lastUsedAt: ts('last_used_at')
  },
  (t) => [index('refresh_tokens_user_idx').on(t.userId), index('refresh_tokens_family_idx').on(t.familyId)]
);

/** 12. Sự kiện XP — CHỈ THÊM (append-only), đồng thời là lịch sử */
export const xpEvents = pgTable(
  'xp_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    clientEventId: uuid('client_event_id').notNull(),
    source: text('source').notNull(),
    amount: integer('amount').notNull(),
    lessonId: text('lesson_id'),
    day: text('day').notNull(),
    createdAt: ts('created_at').notNull().defaultNow()
  },
  (t) => [uniqueIndex('xp_events_user_event_uq').on(t.userId, t.clientEventId)]
);

/** 13. Hoạt động theo ngày địa phương (giây học, XP, mục tiêu, đóng băng streak) */
export const dailyActivity = pgTable(
  'daily_activity',
  {
    userId: userRef(),
    day: text('day').notNull(), // 'YYYY-MM-DD' giờ địa phương của người học
    seconds: integer('seconds').notNull().default(0),
    xp: integer('xp').notNull().default(0),
    goalMet: boolean('goal_met').notNull().default(false),
    freezeUsed: boolean('freeze_used').notNull().default(false),
    updatedAt: ts('updated_at').notNull().defaultNow()
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })]
);

/** 14. Tiến độ bài học (GĐ1) */
export const lessonProgress = pgTable(
  'lesson_progress',
  {
    userId: userRef(),
    lessonId: text('lesson_id').notNull(),
    status: text('status').notNull(), // started | completed
    bestScore: integer('best_score'),
    completedAt: ts('completed_at'),
    updatedAt: ts('updated_at').notNull().defaultNow()
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] })]
);

/** 15. Huy hiệu */
export const achievements = pgTable(
  'achievements',
  {
    userId: userRef(),
    key: text('key').notNull(),
    earnedAt: ts('earned_at').notNull().defaultNow()
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })]
);

/** 16. Sổ chống trùng của /v1/sync: mỗi clientEventId chỉ được áp dụng một lần cho mỗi người dùng */
export const syncEvents = pgTable(
  'sync_events',
  {
    userId: userRef(),
    clientEventId: uuid('client_event_id').notNull(),
    type: text('type').notNull(),
    receivedAt: ts('received_at').notNull().defaultNow()
  },
  (t) => [primaryKey({ columns: [t.userId, t.clientEventId] })]
);

/** 17. Trạng thái lộ trình không suy ra được từ sự kiện (số bài đã xong, đóng băng đang giữ, mục tiêu ngày) — LWW */
export const learnerProgress = pgTable('learner_progress', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  lessonsDone: integer('lessons_done').notNull().default(0),
  freezes: integer('freezes').notNull().default(0),
  dailyGoal: integer('daily_goal').notNull().default(10),
  updatedAt: ts('updated_at').notNull().defaultNow()
});

/**
 * 18. “Bia mộ” = credential đã nghỉ hưu: CHỈ sha256 của refresh token / mã khôi phục (không userId, không dữ liệu học).
 * Để máy khác còn giữ credential cũ nhận lỗi đúng thay vì `invalid_*` (lặng lẽ tạo khách mới):
 * - reason 'deleted'  => `account_deleted` (xóa dữ liệu trên máy)
 * - reason 'merged'   => `account_merged` (khách đã gộp vào tài khoản: mời đăng nhập, KHÔNG xóa dữ liệu máy)
 * - reason 'upgraded' => `account_upgraded` (mã khôi phục của khách đã nâng cấp: mời đăng nhập)
 * `expires_at` = hạn dọn: hash refresh token +90 ngày; hash mã khôi phục NULL (giữ mãi — mã không bao giờ hết hạn).
 * Dòng có từ trước dự án 3: expires_at NULL (không phân biệt được loại hash => giữ mãi cho an toàn).
 * LƯU Ý: tới khi Task 4 đổi job dọn (repo.ts) sang lọc theo expires_at, job cũ vẫn dọn theo deleted_at sau 90 ngày.
 */
export const DELETED_REASONS = ['deleted', 'merged', 'upgraded'] as const;
export type DeletedReason = (typeof DELETED_REASONS)[number];
export const deletedAccounts = pgTable(
  'deleted_accounts',
  {
    credentialHash: text('credential_hash').primaryKey(),
    deletedAt: ts('deleted_at').notNull().defaultNow(),
    reason: text('reason').$type<DeletedReason>().notNull().default('deleted'),
    expiresAt: ts('expires_at')
  },
  (t) => [
    check('deleted_accounts_reason_ck', sql`${t.reason} in ('deleted', 'merged', 'upgraded')`),
    index('deleted_accounts_expires_idx').on(t.expiresAt)
  ]
);

/**
 * 19. Hạn mức AI theo ngày (GĐ3): bộ đếm theo người dùng × năng lực × ngày CỦA SERVER.
 * Từ migration 0007 "ngày" là ngày theo GIỜ VIỆT NAM (UTC+7, 'YYYY-MM-DD'); tên cột `usage_day_utc` giữ nguyên vì
 * đổi tên cột là migration phá vỡ không cần thiết (giá trị chuỗi vẫn cùng dạng, không cần chuyển dữ liệu cũ).
 * Khác quy ước `day` (ngày địa phương do client gửi) ở các bảng khác: hạn mức không được để client tự chọn ngày.
 * capability: 'turn' (lượt hội thoại) | 'llm' (token) | 'stt' (giây) | 'tts' (ký tự) | 'vision' (ảnh)
 */
export const aiUsage = pgTable(
  'ai_usage',
  {
    userId: userRef(),
    usageDayUtc: text('usage_day_utc').notNull(),
    capability: text('capability').notNull(),
    units: integer('units').notNull().default(0),
    updatedAt: ts('updated_at').notNull().defaultNow()
  },
  (t) => [primaryKey({ columns: [t.userId, t.usageDayUtc, t.capability] })]
);

/**
 * 19b. Trần dùng chung CẢ APP theo ngày giờ Việt Nam × năng lực (không theo người dùng): chặn việc cả app đốt hết
 * hạn mức miễn phí của nhà cung cấp AI. Cùng quy ước đếm nguyên tử với `ai_usage`.
 */
export const aiGlobalUsage = pgTable(
  'ai_global_usage',
  {
    usageDay: text('usage_day').notNull(),
    capability: text('capability').notNull(),
    units: integer('units').notNull().default(0),
    updatedAt: ts('updated_at').notNull().defaultNow()
  },
  (t) => [primaryKey({ columns: [t.usageDay, t.capability] })]
);

/**
 * 20–22. GĐ4c — Bạn học hợp tác (D7: không xếp hạng). Không lưu tiến độ/streak: tính lúc đọc từ
 * `daily_activity` => xóa tài khoản (cascade) là mất luôn đóng góp, không còn bản sao nào.
 */
/** Tên hiển thị tự chọn (tài khoản khách không có tên thật) — chỉ bạn bè thấy */
export const socialProfiles = pgTable('social_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow()
});

/**
 * Mã mời đang sống: mỗi người MỘT mã, dùng một lần, hạn 48 giờ. Giữ mã gốc (không băm) để chủ mã mở lại app vẫn
 * thấy mã của mình; mã ngắn hạn, chỉ tạo được quan hệ bạn học (không đăng nhập được) nên rủi ro rò rỉ thấp.
 */
export const friendInvites = pgTable('friend_invites', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(),
  expiresAt: ts('expires_at').notNull(),
  createdAt: ts('created_at').notNull().defaultNow()
});

/** Quan hệ bạn bè (một dòng mỗi cặp, user_a < user_b) + mục tiêu nhiệm vụ tuần chung của cặp */
export const friendships = pgTable(
  'friendships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userA: userRef('user_a'),
    userB: userRef('user_b'),
    goalMinutes: integer('goal_minutes').notNull().default(60),
    createdAt: ts('created_at').notNull().defaultNow()
  },
  (t) => [uniqueIndex('friendships_pair_uq').on(t.userA, t.userB), index('friendships_user_b_idx').on(t.userB)]
);

/**
 * 23. Nhật ký sự kiện bảo mật/quản trị (audit log) — CHỈ THÊM, không sửa/ghi đè dòng cũ.
 * Mục đích: phát hiện và điều tra sự cố lộ dữ liệu (báo cơ quan chuyên trách trong 72 giờ — docs/van-hanh/SU-CO-LO-DU-LIEU.md).
 * - Không lưu IP thô: `ip_hash` = HMAC-SHA256(AUDIT_IP_SALT, ip) rút gọn; user-agent rút gọn.
 * - `metadata`: chỉ các trường trong danh sách trắng theo loại sự kiện (01-nen-tang/apps/gateway/src/services/audit/) — không dữ liệu học,
 *   không bí mật (token, mã khôi phục, mã mời), không id người dùng khác.
 * - Xóa tài khoản => `user_id` tự đặt NULL (ẩn danh hóa, FK ON DELETE SET NULL); dòng vẫn còn để điều tra.
 * - Lưu tối đa 180 ngày (job dọn trong Gateway).
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').notNull(),
    /** 'success' | 'failure' | 'blocked' */
    outcome: text('outcome').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').$type<Record<string, string | number | boolean>>().notNull().default({}),
    createdAt: ts('created_at').notNull().defaultNow()
  },
  (t) => [
    index('audit_events_created_idx').on(t.createdAt),
    index('audit_events_type_created_idx').on(t.type, t.createdAt),
    index('audit_events_user_idx').on(t.userId)
  ]
);

/**
 * 24–27. Dự án 3 — đăng nhập Google + tên đăng nhập/mật khẩu (spec docs/superpowers/specs/2026-11-21-dang-nhap-design.md).
 * Mẫu "danh tính tách khỏi người dùng, duy nhất theo (provider, subject)" tham khảo bảng `accounts` của Auth.js
 * Drizzle adapter (ISC, https://github.com/nextauthjs/next-auth) và hướng dẫn nhiều provider của Lucia
 * (MIT, https://github.com/lucia-auth/lucia) — chỉ lấy ý tưởng, không chép mã.
 */

/** 24. Danh tính đăng nhập: 'google' (subject = `sub`), 'password' (subject = tên đăng nhập chữ thường), 'email' (subject = email chữ thường, CHỈ để lấy lại mật khẩu) */
export const IDENTITY_PROVIDERS = ['google', 'password', 'email'] as const;
export type IdentityProvider = (typeof IDENTITY_PROVIDERS)[number];
export const identities = pgTable(
  'identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    provider: text('provider').$type<IdentityProvider>().notNull(),
    subject: text('subject').notNull(),
    /** bản che để hiển thị ('m***@gmail.com', tên đăng nhập) — KHÔNG lưu email đầy đủ của Google */
    display: text('display'),
    emailVerified: boolean('email_verified').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
    lastUsedAt: ts('last_used_at')
  },
  (t) => [
    uniqueIndex('identities_provider_subject_uq').on(t.provider, t.subject),
    /**
     * Mỗi người dùng tối đa một danh tính mỗi provider => hai máy cùng nâng cấp một khách chỉ gắn được một
     * (Review Focus 1). Cũng là index theo user_id (cột đầu).
     */
    uniqueIndex('identities_user_provider_uq').on(t.userId, t.provider),
    check('identities_provider_ck', sql`${t.provider} in ('google', 'password', 'email')`),
    /** tên đăng nhập/email phải lưu chữ thường => unique(provider, subject) không phân biệt hoa thường; Google `sub` giữ nguyên */
    check('identities_subject_lower_ck', sql`${t.provider} = 'google' or ${t.subject} = lower(${t.subject})`)
  ]
);

/** 25. Mật khẩu (argon2id) + mã dự phòng (sha256, một lần, chỉ để đặt lại mật khẩu) — tách khỏi identities để bảng đó không chứa bí mật */
export const passwordCredentials = pgTable('password_credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  backupCodeHash: text('backup_code_hash'),
  updatedAt: ts('updated_at').notNull().defaultNow()
});

/**
 * 26. Thử thách ngắn hạn (job dọn theo `expires_at`, sau 1 ngày). Nghĩa các cột theo `kind`:
 * - 'oidc_nonce'   : key_hash = sha256(nonce); subject/user_id NULL. Dùng một lần (đặt consumed_at). Sống 10 phút.
 * - 'email_otp'    : subject = HMAC(AUTH_OTP_PEPPER, email chữ thường) — KHÔNG lưu email nguyên văn ở đây (email đầy đủ chỉ
 *                    nằm ở identities provider 'email'); key_hash = HMAC(AUTH_OTP_PEPPER, mã 6 số) — có thể TRÙNG giữa
 *                    các email nên KHÔNG unique; tra theo (kind, subject); user_id = người gắn email (NULL khi quên mật khẩu);
 *                    attempts = số lần sai (≥ 5 => otp_locked). Sống 10 phút.
 * - 'merge_ticket' : key_hash = sha256(ticket); user_id = KHÁCH U_B (nguồn); subject = id tài khoản đích U_A (chuỗi uuid).
 *                    Dùng một lần, sống 10 phút. Xóa U_B => vé mất theo (cascade).
 * - 'rate_counter' : bộ đếm CHUNG cho mọi giới hạn tần suất của đăng nhập/OTP (không cần migration khi thêm loại đếm mới).
 *                    key_hash = HMAC(pepper, khóa đếm), khóa đếm có tiền tố theo mục đích, vd:
 *                    'login:pair:'+ip_hash+'|'+tên · 'login:ip:'+ip_hash · 'login:user:'+tên · 'otp_send:email:'+email ·
 *                    'otp_send:ip:'+ip_hash · 'otp_fail:email:'+email. attempts = số lần trong cửa sổ, expires_at = hết cửa sổ.
 *                    Tăng nguyên tử: INSERT … ON CONFLICT (kind, key_hash) WHERE kind <> 'email_otp' DO UPDATE
 *                    (phải lặp lại vị từ WHERE của index một phần); cửa sổ đã hết thì đặt lại attempts.
 * oidc_nonce / merge_ticket / rate_counter: unique (kind, key_hash).
 */
export const AUTH_CHALLENGE_KINDS = ['oidc_nonce', 'email_otp', 'merge_ticket', 'rate_counter'] as const;
export type AuthChallengeKind = (typeof AUTH_CHALLENGE_KINDS)[number];
export const authChallenges = pgTable(
  'auth_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').$type<AuthChallengeKind>().notNull(),
    keyHash: text('key_hash').notNull(),
    subject: text('subject'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: ts('expires_at').notNull(),
    consumedAt: ts('consumed_at'),
    createdAt: ts('created_at').notNull().defaultNow()
  },
  (t) => [
    check('auth_challenges_kind_ck', sql`${t.kind} in ('oidc_nonce', 'email_otp', 'merge_ticket', 'rate_counter')`),
    uniqueIndex('auth_challenges_kind_key_uq')
      .on(t.kind, t.keyHash)
      .where(sql`${t.kind} <> 'email_otp'`),
    index('auth_challenges_kind_subject_idx').on(t.kind, t.subject),
    index('auth_challenges_expires_idx').on(t.expiresAt),
    index('auth_challenges_user_idx').on(t.userId)
  ]
);

/** 27. Tên đăng nhập đang giữ chỗ (giải phóng 30 ngày sau khi tài khoản bị xóa hẳn) — chữ thường như identities */
export const reservedUsernames = pgTable(
  'reserved_usernames',
  {
    username: text('username').primaryKey(),
    until: ts('until').notNull()
  },
  (t) => [check('reserved_usernames_lower_ck', sql`${t.username} = lower(${t.username})`), index('reserved_usernames_until_idx').on(t.until)]
);
