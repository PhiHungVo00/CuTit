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
  type AnyPgColumn
} from 'drizzle-orm/pg-core';

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

const ts = (name: string) => timestamp(name, { withTimezone: true });
const userRef = (name = 'user_id') =>
  uuid(name)
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

/** 1. Người dùng + hồ sơ học (tài khoản khách: email null, is_guest = true) */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique(),
  isGuest: boolean('is_guest').notNull().default(true),
  /** D4: 'adult' | 'child' — hồ sơ trẻ do phụ huynh (parent_user_id) tạo, làm ở GĐ4 */
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
  deletedAt: ts('deleted_at')
});

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
    revokedAt: ts('revoked_at')
  },
  (t) => [index('refresh_tokens_user_idx').on(t.userId)]
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
 * 18. “Bia mộ” tài khoản đã xóa: CHỈ sha256 của refresh token / mã khôi phục lúc xóa (không userId, không dữ liệu học).
 * Để máy khác còn giữ credential cũ nhận `account_deleted` (xóa dữ liệu trên máy) thay vì `invalid_*` (lặng lẽ tạo khách mới).
 * Dọn sau 90 ngày (= hạn refresh token).
 */
export const deletedAccounts = pgTable('deleted_accounts', {
  credentialHash: text('credential_hash').primaryKey(),
  deletedAt: ts('deleted_at').notNull().defaultNow()
});
