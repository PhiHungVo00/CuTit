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
  bigint,
  bigserial,
  customType,
  type AnyPgColumn
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Schema PostgreSQL (Drizzle) — một nguồn duy nhất cho Gateway.
 * Migration SQL đánh số sinh bằng drizzle-kit vào apps/gateway/drizzle/ (không sửa tay bảng đã phát hành).
 *
 * Quy ước:
 * - Mọi bảng dữ liệu người học trỏ tới users.id với ON DELETE CASCADE => `DELETE /v1/me` xóa cứng sạch
 *   (kể cả xp_events). `users.deleted_at` dành cho xóa mềm có thời gian ân hạn sau này.
 * - Ngày học (`day`) là ngày ĐỊA PHƯƠNG 'YYYY-MM-DD' do client gửi — không tự tính theo UTC ở server.
 * - Khớp dữ liệu client trong packages/state (nguồn chuẩn hiện tại của hình dạng dữ liệu).
 */

/** bytea <-> Uint8Array (Buffer của Node cũng là Uint8Array; bí mật TOTP đã mã hóa AES-256-GCM) */
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({ dataType: () => 'bytea' });

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
    deleteAt: ts('delete_at'),
    /**
     * Dự án 4 — cổng tuổi: NULL = chưa khai; true = đủ 18 (không đổi ngược); false = chưa đủ (khóa khai lại 12 tháng
     * tính từ `age_declared_at`). KHÔNG có cột năm/ngày sinh: server tính cờ rồi bỏ giá trị.
     */
    isAdult: boolean('is_adult'),
    ageDeclaredAt: ts('age_declared_at')
  },
  (t) => [
    index('users_delete_at_idx')
      .on(t.deleteAt)
      .where(sql`${t.deleteAt} is not null`),
    // cờ và mốc luôn đi cùng nhau
    check('users_age_flag_ck', sql`(${t.isAdult} is null) = (${t.ageDeclaredAt} is null)`)
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
export const socialProfiles = pgTable(
  'social_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    /** Dự án 4 — tên bạn bè: 3–24 ký tự a-z0-9._, duy nhất KHÔNG phân biệt hoa thường; NULL = chưa đặt */
    handle: text('handle'),
    /** lần đổi handle gần nhất (giới hạn 1 lần/30 ngày) */
    handleChangedAt: ts('handle_changed_at'),
    discoverable: boolean('discoverable').notNull().default(true),
    showOnline: boolean('show_online').notNull().default(true),
    showReadReceipts: boolean('show_read_receipts').notNull().default(true),
    showPushPreview: boolean('show_push_preview').notNull().default(false)
  },
  (t) => [
    uniqueIndex('social_profiles_handle_lower_uq')
      .on(sql`lower(${t.handle})`)
      .where(sql`${t.handle} is not null`),
    check(
      'social_profiles_handle_fmt_ck',
      sql`${t.handle} is null or (${t.handle} ~* '^[a-z0-9._]{3,24}$' and ${t.handle} !~ '^[.]|[.]$' and position('..' in ${t.handle}) = 0)`
    )
  ]
);

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
    createdAt: ts('created_at').notNull().defaultNow(),
    /** Dự án 4: tối đa 5 cặp có nhiệm vụ tuần cùng lúc (MAX_FRIENDS); bạn thứ 6+ vẫn là bạn nhưng quest_active=false */
    questActive: boolean('quest_active').notNull().default(true)
  },
  (t) => [uniqueIndex('friendships_pair_uq').on(t.userA, t.userB), index('friendships_user_b_idx').on(t.userB)]
);

/**
 * 23. Nhật ký sự kiện bảo mật/quản trị (audit log) — CHỈ THÊM, không sửa/ghi đè dòng cũ.
 * Mục đích: phát hiện và điều tra sự cố lộ dữ liệu (báo cơ quan chuyên trách trong 72 giờ — docs/van-hanh/SU-CO-LO-DU-LIEU.md).
 * - Không lưu IP thô: `ip_hash` = HMAC-SHA256(AUDIT_IP_SALT, ip) rút gọn; user-agent rút gọn.
 * - `metadata`: chỉ các trường trong danh sách trắng theo loại sự kiện (apps/gateway/src/services/audit/) — không dữ liệu học,
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

/**
 * 28–35. Dự án 5a — Góp ý/Báo lỗi + nền quản trị (spec docs/superpowers/specs/2026-11-21-gop-y-bao-loi-design.md §5.7).
 * Mẫu "hộp thư + dòng thời gian sự kiện + hàng dọn tệp" tự thiết kế theo spec (không chép mã ngoài).
 * Nhật ký chỉ-thêm ép bằng trigger BEFORE UPDATE OR DELETE + RAISE EXCEPTION theo tài liệu PostgreSQL về trigger
 * (https://www.postgresql.org/docs/current/plpgsql-trigger.html) — chỉ lấy ý tưởng; trigger nằm ở migration tùy chỉnh.
 *
 * Xử lý khi xóa/gộp tài khoản (đã chốt trong spec §5.2):
 * - Xóa mềm (users.delete_at): góp ý GIỮ NGUYÊN 30 ngày (hàng chờ gắn nhãn "đang chờ xóa").
 * - Xóa cứng (DELETE FROM users): feedback_reports/files/events xóa theo CASCADE. Khóa tệp (blob_key) cũng mất theo
 *   => `purgeUserFeedbackBlobs(userId)` PHẢI đọc khóa tệp TRƯỚC khi xóa user, xóa tệp SAU commit; lỗi thì ghi blob_deletions.
 * - Gộp tài khoản (merge.ts): feedback_reports.user_id chuyển sang tài khoản đích ở CẢ hai chiến lược.
 * - Nhân viên (staff_roles/staff_totp/admin_sessions): cascade theo tài khoản. staff_roles.granted_by và
 *   feedback_events.actor_user_id: SET NULL (giữ dòng, bỏ liên kết tới tài khoản đã xóa).
 * - admin_audit_log KHÔNG có khóa ngoại tới users: giữ nguyên khi xóa tài khoản (đúng mục đích điều tra), giữ 2 năm.
 * Dữ liệu cá nhân tối thiểu: không email, không ảnh/video ở DB (chỉ khóa tệp), IP chỉ ở dạng băm (`ip_hash`).
 */

export const FEEDBACK_KINDS = ['bug', 'idea', 'other'] as const;
export const FEEDBACK_STATUSES = ['received', 'in_progress', 'done'] as const;
export const STAFF_ROLES = ['owner', 'editor', 'reviewer', 'support'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Ngữ cảnh chẩn đoán lưu ở feedback_reports.context (khớp FeedbackContextSchema ở api/feedback.ts) */
export type FeedbackContextJson = {
  appVersion: string;
  build: string;
  platform: 'android' | 'web';
  osVersion: string;
  locale: 'vi' | 'en';
  route: string;
  recentRoutes: string[];
  error?: { name: string; firstFrame: string };
};

/**
 * 28. Góp ý. `done_at` đặt khi chuyển 'done' và về NULL khi mở lại (CHECK ép hai cột luôn khớp) — mốc dọn tệp theo done_at.
 * `user_unread` = người dùng có lời nhắn/đổi trạng thái chưa đọc (chấm đỏ).
 */
export const feedbackReports = pgTable(
  'feedback_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    kind: text('kind').$type<(typeof FEEDBACK_KINDS)[number]>().notNull(),
    body: text('body').notNull(),
    context: jsonb('context').$type<FeedbackContextJson>().notNull(),
    status: text('status').$type<(typeof FEEDBACK_STATUSES)[number]>().notNull().default('received'),
    userUnread: boolean('user_unread').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    doneAt: ts('done_at')
  },
  (t) => [
    check('feedback_reports_kind_ck', sql`${t.kind} in ('bug', 'idea', 'other')`),
    check('feedback_reports_status_ck', sql`${t.status} in ('received', 'in_progress', 'done')`),
    check('feedback_reports_body_len_ck', sql`char_length(${t.body}) between 10 and 2000`),
    check('feedback_reports_done_at_ck', sql`(${t.status} = 'done') = (${t.doneAt} is not null)`),
    index('feedback_reports_status_created_idx').on(t.status, sql`${t.createdAt} desc`),
    index('feedback_reports_user_created_idx').on(t.userId, sql`${t.createdAt} desc`),
    /** đếm chấm đỏ nhanh (chỉ các dòng chưa đọc) */
    index('feedback_reports_user_unread_idx')
      .on(t.userId)
      .where(sql`${t.userUnread}`),
    /** job dọn tệp theo done_at */
    index('feedback_reports_done_at_idx')
      .on(t.doneAt)
      .where(sql`${t.doneAt} is not null`)
  ]
);

/** 29. Tệp đính kèm — chỉ giữ khóa trong kho tệp (`feedback/<id>/<uuid>.<ext>`, không tên gốc). `purged_at` = tệp đã dọn, dòng giữ lại. */
export const feedbackFiles = pgTable(
  'feedback_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    feedbackId: uuid('feedback_id')
      .notNull()
      .references(() => feedbackReports.id, { onDelete: 'cascade' }),
    blobKey: text('blob_key').notNull(),
    media: text('media').$type<'image' | 'video'>().notNull(),
    contentType: text('content_type').notNull(),
    bytes: integer('bytes').notNull(),
    durationMs: integer('duration_ms'),
    createdAt: ts('created_at').notNull().defaultNow(),
    purgedAt: ts('purged_at')
  },
  (t) => [
    uniqueIndex('feedback_files_blob_key_uq').on(t.blobKey),
    index('feedback_files_feedback_idx').on(t.feedbackId),
    check('feedback_files_media_ck', sql`${t.media} in ('image', 'video')`),
    /** loại tệp và media phải khớp: ảnh ⇔ WebP/JPEG/PNG, video ⇔ MP4/WebM/MOV (SVG, PE… không lọt qua DB) */
    check(
      'feedback_files_type_ck',
      sql`(${t.media} = 'image' and ${t.contentType} in ('image/webp', 'image/jpeg', 'image/png')) or (${t.media} = 'video' and ${t.contentType} in ('video/mp4', 'video/webm', 'video/quicktime'))`
    ),
    /** ảnh ≤ 5 MiB, video ≤ 50 MiB (FEEDBACK_LIMITS) */
    check('feedback_files_bytes_ck', sql`${t.bytes} > 0 and ${t.bytes} <= case when ${t.media} = 'image' then 5242880 else 52428800 end`),
    check('feedback_files_duration_ck', sql`${t.durationMs} is null or (${t.durationMs} >= 0 and ${t.durationMs} <= 60000)`)
  ]
);

/** 30. Dòng thời gian của chủ app (đổi trạng thái / lời nhắn). `actor_user_id` SET NULL khi nhân viên bị xóa. */
export const feedbackEvents = pgTable(
  'feedback_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    feedbackId: uuid('feedback_id')
      .notNull()
      .references(() => feedbackReports.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    status: text('status').$type<(typeof FEEDBACK_STATUSES)[number]>(),
    message: text('message'),
    createdAt: ts('created_at').notNull().defaultNow()
  },
  (t) => [
    index('feedback_events_feedback_idx').on(t.feedbackId, t.createdAt),
    check('feedback_events_status_ck', sql`${t.status} is null or ${t.status} in ('received', 'in_progress', 'done')`),
    check('feedback_events_message_len_ck', sql`${t.message} is null or char_length(${t.message}) between 1 and 1000`),
    /** một sự kiện phải mang ít nhất đổi trạng thái hoặc lời nhắn */
    check('feedback_events_nonempty_ck', sql`${t.status} is not null or ${t.message} is not null`)
  ]
);

/** 31. Hàng dọn tệp khi xóa lỗi (thử lại hằng ngày). Chỉ khóa tệp + lý do — không dữ liệu người dùng. */
export const blobDeletions = pgTable(
  'blob_deletions',
  {
    blobKey: text('blob_key').primaryKey(),
    reason: text('reason').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    attempts: integer('attempts').notNull().default(0)
  },
  (t) => [check('blob_deletions_attempts_ck', sql`${t.attempts} >= 0`), index('blob_deletions_created_idx').on(t.createdAt)]
);

/** 32. Vai trò nhân viên — CHỈ cấp bằng CLI (không API/biến môi trường). 5a chỉ dùng 'owner'. */
export const staffRoles = pgTable(
  'staff_roles',
  {
    userId: userRef(),
    role: text('role').$type<StaffRole>().notNull(),
    grantedAt: ts('granted_at').notNull().defaultNow(),
    grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' })
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] }), check('staff_roles_role_ck', sql`${t.role} in ('owner', 'editor', 'reviewer', 'support')`)]
);

/** 33. TOTP của nhân viên: bí mật mã hóa AES-256-GCM (ADMIN_MFA_KEY); `last_used_step` chặn dùng lại mã; ≤ 10 mã dự phòng lưu BĂM. */
export const staffTotp = pgTable(
  'staff_totp',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    secretEnc: bytea('secret_enc').notNull(),
    confirmedAt: ts('confirmed_at'),
    lastUsedStep: bigint('last_used_step', { mode: 'number' }).notNull().default(0),
    backupHashes: text('backup_hashes')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`)
  },
  (t) => [check('staff_totp_backup_count_ck', sql`cardinality(${t.backupHashes}) <= 10`)]
);

/** 34. Phiên quản trị (refresh = băm, token gốc nằm trong cookie HttpOnly): rảnh 30 phút / tối đa 12 giờ / thu hồi được. */
export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    refreshHash: text('refresh_hash').notNull().unique(),
    mfaAt: ts('mfa_at').notNull(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    createdAt: ts('created_at').notNull().defaultNow()
  },
  (t) => [index('admin_sessions_user_idx').on(t.userId), index('admin_sessions_expires_idx').on(t.expiresAt)]
);

/**
 * 35. Nhật ký quản trị — CHỈ THÊM: trigger ở migration `admin_audit_append_only` chặn UPDATE/DELETE/TRUNCATE;
 * chỉ hàm `admin_audit_purge(before)` (SECURITY DEFINER) xóa được, để job dọn bản quá 2 năm.
 * KHÔNG khóa ngoại tới users (giữ khi xóa tài khoản). `actor_kind='cli'` thì `actor_user_id` NULL.
 * Ghi trong CÙNG transaction với thao tác (spec §5.5).
 */
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorUserId: uuid('actor_user_id'),
    actorKind: text('actor_kind').$type<'user' | 'cli'>().notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    createdAt: ts('created_at').notNull().defaultNow()
  },
  (t) => [
    check('admin_audit_log_actor_kind_ck', sql`${t.actorKind} in ('user', 'cli')`),
    check('admin_audit_log_cli_actor_ck', sql`${t.actorKind} <> 'cli' or ${t.actorUserId} is null`),
    index('admin_audit_log_created_idx').on(t.createdAt)
  ]
);

/* ======================================================================================================
 * Dự án 4 — Bạn bè: chat, nhóm, gọi, báo cáo, thông báo đẩy. Spec 2026-11-25-ban-be-design.md mục 5.3.
 * Tên bảng tránh trùng bảng chat AI `messages`/`sessions`. Mọi khóa ngoại tới users có ON DELETE rõ ràng
 * (cascade hoặc set null) để `DELETE /v1/me` không bao giờ bị chặn. Enum = CHECK (như 5a).
 * ====================================================================================================== */

/** 36. Lời mời kết bạn bằng handle. `pending` duy nhất theo (from, to). */
export const friendRequests = pgTable(
  'friend_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fromUserId: userRef('from_user_id'),
    toUserId: userRef('to_user_id'),
    status: text('status').$type<'pending' | 'accepted' | 'declined' | 'canceled'>().notNull().default('pending'),
    createdAt: ts('created_at').notNull().defaultNow(),
    resolvedAt: ts('resolved_at')
  },
  (t) => [
    check('friend_requests_status_ck', sql`${t.status} in ('pending', 'accepted', 'declined', 'canceled')`),
    check('friend_requests_not_self_ck', sql`${t.fromUserId} <> ${t.toUserId}`),
    check('friend_requests_resolved_ck', sql`(${t.status} = 'pending') = (${t.resolvedAt} is null)`),
    uniqueIndex('friend_requests_pending_uq')
      .on(t.fromUserId, t.toUserId)
      .where(sql`${t.status} = 'pending'`),
    index('friend_requests_to_idx').on(t.toUserId, t.status, t.createdAt.desc()),
    index('friend_requests_from_idx').on(t.fromUserId, t.createdAt.desc())
  ]
);

/** 37. Chặn người dùng */
export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerId: userRef('blocker_id'),
    blockedId: userRef('blocked_id'),
    createdAt: ts('created_at').notNull().defaultNow()
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    check('user_blocks_not_self_ck', sql`${t.blockerId} <> ${t.blockedId}`),
    index('user_blocks_blocked_idx').on(t.blockedId)
  ]
);

/** 38. Cuộc trò chuyện (1-1 hoặc nhóm). `last_seq` = số thứ tự tin cuối, cấp bằng UPDATE … RETURNING trong transaction. */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').$type<'dm' | 'group'>().notNull(),
    /** nhóm: 1–60 ký tự; 1-1: NULL */
    title: text('title'),
    /** 1-1: min(userId)||':'||max(userId) — mỗi cặp một cuộc trò chuyện */
    dmKey: text('dm_key').unique(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    lastSeq: bigint('last_seq', { mode: 'number' }).notNull().default(0),
    lastMessageAt: ts('last_message_at')
  },
  (t) => [
    check('conversations_kind_ck', sql`${t.kind} in ('dm', 'group')`),
    check('conversations_dm_key_ck', sql`(${t.kind} = 'dm') = (${t.dmKey} is not null)`),
    check(
      'conversations_title_ck',
      sql`(${t.kind} = 'dm' and ${t.title} is null) or (${t.kind} = 'group' and ${t.title} is not null and char_length(${t.title}) between 1 and 60)`
    ),
    check('conversations_last_seq_ck', sql`${t.lastSeq} >= 0`),
    index('conversations_last_message_idx').on(t.lastMessageAt.desc())
  ]
);

/** 39. Thành viên. Mỗi người giữ `last_read_seq` (D2: một dòng tin, không nhân bản hộp thư). */
export const conversationMembers = pgTable(
  'conversation_members',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: userRef('user_id'),
    role: text('role').$type<'owner' | 'admin' | 'member'>().notNull().default('member'),
    joinedAt: ts('joined_at').notNull().defaultNow(),
    /** last_seq của cuộc trò chuyện lúc vào: người mới không thấy tin cũ */
    joinedSeq: bigint('joined_seq', { mode: 'number' }).notNull().default(0),
    leftAt: ts('left_at'),
    lastReadSeq: bigint('last_read_seq', { mode: 'number' }).notNull().default(0),
    /** "xóa cuộc trò chuyện cho riêng mình" */
    hiddenBeforeSeq: bigint('hidden_before_seq', { mode: 'number' }).notNull().default(0),
    mutedUntil: ts('muted_until')
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    check('conversation_members_role_ck', sql`${t.role} in ('owner', 'admin', 'member')`),
    check(
      'conversation_members_seq_ck',
      sql`${t.joinedSeq} >= 0 and ${t.lastReadSeq} >= 0 and ${t.hiddenBeforeSeq} >= 0`
    ),
    index('conversation_members_user_idx').on(t.userId, t.leftAt)
  ]
);

/** 40. Tệp đính kèm (ảnh / giọng nói) trong BlobStore (5a). Tải lên trước, gắn vào tin sau (chat_messages.attachment_id). */
export const chatAttachments = pgTable(
  'chat_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    uploaderId: uuid('uploader_id').references(() => users.id, { onDelete: 'set null' }),
    /** chat/<conversationId>/<uuid>.<ext> — không chứa tên gốc */
    blobKey: text('blob_key').notNull(),
    media: text('media').$type<'image' | 'voice'>().notNull(),
    contentType: text('content_type').notNull(),
    bytes: integer('bytes').notNull(),
    durationMs: integer('duration_ms'),
    width: integer('width'),
    height: integer('height'),
    /** sóng âm đơn giản ≤ 64 số 0..255 (không phải thuật toán A1/A2) */
    waveform: jsonb('waveform').$type<number[]>(),
    createdAt: ts('created_at').notNull().defaultNow(),
    /** tệp thuộc snapshot của báo cáo còn mở: không bị dọn */
    pinnedByReport: boolean('pinned_by_report').notNull().default(false),
    purgedAt: ts('purged_at')
  },
  (t) => [
    uniqueIndex('chat_attachments_blob_key_uq').on(t.blobKey),
    check('chat_attachments_media_ck', sql`${t.media} in ('image', 'voice')`),
    check(
      'chat_attachments_type_ck',
      sql`(${t.media} = 'image' and ${t.contentType} in ('image/webp', 'image/jpeg', 'image/png') and ${t.bytes} <= 2097152)
        or (${t.media} = 'voice' and ${t.contentType} in ('audio/webm', 'audio/ogg', 'audio/mp4') and ${t.bytes} <= 3145728)`
    ),
    check('chat_attachments_bytes_ck', sql`${t.bytes} > 0`),
    check('chat_attachments_duration_ck', sql`${t.durationMs} is null or ${t.durationMs} between 0 and 120000`),
    check(
      'chat_attachments_dims_ck',
      sql`(${t.width} is null or ${t.width} between 1 and 1280) and (${t.height} is null or ${t.height} between 1 and 1280)`
    ),
    check(
      'chat_attachments_waveform_ck',
      sql`${t.waveform} is null or (jsonb_typeof(${t.waveform}) = 'array' and jsonb_array_length(${t.waveform}) <= 64)`
    ),
    index('chat_attachments_conv_idx').on(t.conversationId),
    index('chat_attachments_uploader_idx').on(t.uploaderId),
    // dọn tệp chưa gắn quá 1 giờ / đo tổng dung lượng
    index('chat_attachments_live_created_idx')
      .on(t.createdAt)
      .where(sql`${t.purgedAt} is null`)
  ]
);

/**
 * 41. Tin nhắn. `seq` liên tục trong từng cuộc trò chuyện (bù tin bằng afterSeq). Xóa mềm: `deleted_at` + `deleted_kind`.
 * Xóa tài khoản người gửi: sender_id → NULL (FK SET NULL), body/attachment_id → NULL, deleted_kind='account_deleted'
 * — GIỮ dòng để seq liên tục và cuộc trò chuyện không vỡ.
 */
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    seq: bigint('seq', { mode: 'number' }).notNull(),
    senderId: uuid('sender_id').references(() => users.id, { onDelete: 'set null' }),
    /** khóa chống trùng khi gửi lại; tin hệ thống tự sinh */
    clientMsgId: uuid('client_msg_id').notNull().defaultRandom(),
    kind: text('kind').$type<'text' | 'image' | 'voice' | 'system'>().notNull(),
    body: text('body'),
    /**
     * FK KHÔNG cascade/set null (NO ACTION): không xóa được dòng tệp còn gắn vào tin — muốn bỏ tệp thì đặt
     * `chat_attachments.purged_at` (hoặc xóa tài khoản: gỡ attachment_id + deleted_kind='account_deleted' TRƯỚC).
     * Xóa cả cuộc trò chuyện vẫn chạy (tin và tệp cùng bị cascade trong một câu lệnh).
     */
    attachmentId: uuid('attachment_id').references(() => chatAttachments.id),
    /** server KHÔNG lưu chữ tiếng nào: client dựng chữ từ `type` */
    systemEvent: jsonb('system_event').$type<Record<string, unknown>>(),
    createdAt: ts('created_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
    deletedKind: text('deleted_kind').$type<'recalled' | 'account_deleted'>()
  },
  (t) => [
    uniqueIndex('chat_messages_conv_seq_uq').on(t.conversationId, t.seq),
    uniqueIndex('chat_messages_dedupe_uq').on(t.conversationId, t.senderId, t.clientMsgId),
    index('chat_messages_conv_seq_desc_idx').on(t.conversationId, t.seq.desc()),
    // một tệp chỉ gắn vào một tin
    uniqueIndex('chat_messages_attachment_uq')
      .on(t.attachmentId)
      .where(sql`${t.attachmentId} is not null`),
    index('chat_messages_sender_idx').on(t.senderId),
    check('chat_messages_kind_ck', sql`${t.kind} in ('text', 'image', 'voice', 'system')`),
    check('chat_messages_seq_ck', sql`${t.seq} >= 1`),
    check('chat_messages_body_len_ck', sql`${t.body} is null or char_length(${t.body}) <= 4000`),
    check('chat_messages_deleted_kind_ck', sql`${t.deletedKind} is null or ${t.deletedKind} in ('recalled', 'account_deleted')`),
    check('chat_messages_deleted_pair_ck', sql`(${t.deletedAt} is null) = (${t.deletedKind} is null)`),
    // nội dung khớp loại tin (tin đã xóa tài khoản được phép rỗng)
    check(
      'chat_messages_content_ck',
      sql`(${t.kind} = 'text' and ${t.attachmentId} is null and ${t.systemEvent} is null)
        or (${t.kind} in ('image', 'voice') and ${t.body} is null and ${t.systemEvent} is null and (${t.attachmentId} is not null or coalesce(${t.deletedKind} = 'account_deleted', false)))
        or (${t.kind} = 'system' and ${t.systemEvent} is not null and ${t.body} is null and ${t.attachmentId} is null)`
    )
  ]
);

/** 42. Báo cáo tin/người. `snapshot` = ≤ 30 tin quanh tin bị báo, chụp lúc báo cáo (bằng chứng độc lập với thu hồi). */
export const chatReports = pgTable(
  'chat_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'set null' }),
    reportedUserId: uuid('reported_user_id').references(() => users.id, { onDelete: 'set null' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
    messageId: uuid('message_id').references(() => chatMessages.id, { onDelete: 'set null' }),
    reason: text('reason').$type<'spam' | 'harassment' | 'sexual' | 'minor_safety' | 'scam' | 'other'>().notNull(),
    note: text('note'),
    snapshot: jsonb('snapshot').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    status: text('status').$type<'open' | 'reviewing' | 'actioned' | 'dismissed'>().notNull().default('open'),
    createdAt: ts('created_at').notNull().defaultNow(),
    resolvedAt: ts('resolved_at'),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').$type<'dismiss' | 'warn' | 'restrict'>()
  },
  (t) => [
    check('chat_reports_reason_ck', sql`${t.reason} in ('spam', 'harassment', 'sexual', 'minor_safety', 'scam', 'other')`),
    check('chat_reports_status_ck', sql`${t.status} in ('open', 'reviewing', 'actioned', 'dismissed')`),
    check('chat_reports_action_ck', sql`${t.action} is null or ${t.action} in ('dismiss', 'warn', 'restrict')`),
    check('chat_reports_note_ck', sql`${t.note} is null or char_length(${t.note}) <= 500`),
    check('chat_reports_snapshot_ck', sql`jsonb_typeof(${t.snapshot}) = 'array' and jsonb_array_length(${t.snapshot}) <= 30`),
    // đã xử lý ⇔ có resolved_at
    check('chat_reports_resolved_ck', sql`(${t.status} in ('actioned', 'dismissed')) = (${t.resolvedAt} is not null)`),
    check(
      'chat_reports_not_self_ck',
      sql`${t.reporterId} is null or ${t.reportedUserId} is null or ${t.reporterId} <> ${t.reportedUserId}`
    ),
    index('chat_reports_status_idx').on(t.status, t.createdAt.desc()),
    index('chat_reports_reporter_idx').on(t.reporterId, t.createdAt.desc()),
    index('chat_reports_reported_idx').on(t.reportedUserId)
  ]
);

/** 43. Khóa chat (do chủ app đặt qua báo cáo hoặc CLI). `until` NULL = vĩnh viễn. */
export const chatRestrictions = pgTable(
  'chat_restrictions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef('user_id'),
    kind: text('kind').$type<'chat_ban'>().notNull().default('chat_ban'),
    until: ts('until'),
    reason: text('reason').notNull(),
    reportId: uuid('report_id').references(() => chatReports.id, { onDelete: 'set null' }),
    /** NULL = CLI */
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    liftedAt: ts('lifted_at')
  },
  (t) => [
    check('chat_restrictions_kind_ck', sql`${t.kind} = 'chat_ban'`),
    check('chat_restrictions_reason_ck', sql`char_length(${t.reason}) between 1 and 500`),
    index('chat_restrictions_active_idx')
      .on(t.userId)
      .where(sql`${t.liftedAt} is null`)
  ]
);

/** 44. Token thiết bị cho thông báo đẩy (FCM). */
export const pushTokens = pgTable(
  'push_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef('user_id'),
    token: text('token').notNull().unique(),
    platform: text('platform').$type<'android'>().notNull(),
    appBuild: integer('app_build').notNull().default(0),
    locale: text('locale').$type<'vi' | 'en'>().notNull().default('vi'),
    createdAt: ts('created_at').notNull().defaultNow(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    disabledAt: ts('disabled_at')
  },
  (t) => [
    check('push_tokens_platform_ck', sql`${t.platform} = 'android'`),
    check('push_tokens_locale_ck', sql`${t.locale} in ('vi', 'en')`),
    check('push_tokens_build_ck', sql`${t.appBuild} >= 0`),
    check('push_tokens_len_ck', sql`char_length(${t.token}) between 20 and 4096`),
    index('push_tokens_user_idx').on(t.userId),
    index('push_tokens_last_seen_idx').on(t.lastSeenAt)
  ]
);

/** 45. Cuộc gọi. Không lưu gì về nội dung cuộc gọi. */
export const calls = pgTable(
  'calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'voice' | 'video'>().notNull(),
    initiatorId: uuid('initiator_id').references(() => users.id, { onDelete: 'set null' }),
    mode: text('mode').$type<'mesh' | 'sfu'>().notNull().default('mesh'),
    startedAt: ts('started_at').notNull().defaultNow(),
    endedAt: ts('ended_at'),
    endReason: text('end_reason').$type<'hangup' | 'no_answer' | 'declined' | 'busy' | 'timeout' | 'error'>()
  },
  (t) => [
    check('calls_kind_ck', sql`${t.kind} in ('voice', 'video')`),
    check('calls_mode_ck', sql`${t.mode} in ('mesh', 'sfu')`),
    check(
      'calls_end_reason_ck',
      sql`${t.endReason} is null or ${t.endReason} in ('hangup', 'no_answer', 'declined', 'busy', 'timeout', 'error')`
    ),
    check('calls_end_pair_ck', sql`(${t.endedAt} is null) = (${t.endReason} is null)`),
    index('calls_conv_idx').on(t.conversationId, t.startedAt.desc()),
    index('calls_initiator_idx').on(t.initiatorId),
    // dọn cuộc gọi mở quá 6 giờ
    index('calls_open_idx')
      .on(t.startedAt)
      .where(sql`${t.endedAt} is null`)
  ]
);

/** 46. Người trong cuộc gọi. `relay_seconds` cộng vào ngân sách TURN (7.3). */
export const callParticipants = pgTable(
  'call_participants',
  {
    callId: uuid('call_id')
      .notNull()
      .references(() => calls.id, { onDelete: 'cascade' }),
    userId: userRef('user_id'),
    invitedAt: ts('invited_at').notNull().defaultNow(),
    joinedAt: ts('joined_at'),
    leftAt: ts('left_at'),
    relaySeconds: integer('relay_seconds').notNull().default(0)
  },
  (t) => [
    primaryKey({ columns: [t.callId, t.userId] }),
    check('call_participants_relay_ck', sql`${t.relaySeconds} >= 0`),
    // "một người một cuộc gọi": tìm cuộc gọi đang tham gia
    index('call_participants_active_idx')
      .on(t.userId)
      .where(sql`${t.joinedAt} is not null and ${t.leftAt} is null`),
    index('call_participants_user_idx').on(t.userId, t.invitedAt.desc())
  ]
);
