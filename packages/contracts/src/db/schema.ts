import { pgTable, uuid, text, timestamp, integer, jsonb, boolean } from 'drizzle-orm/pg-core';

/**
 * 1. Bảng Người Dùng & Hồ Sơ (users, profiles)
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  locale: text('locale').default('en'),
  nativeLang: text('native_lang').default('en'),
  level: integer('level').default(1),
  goal: text('goal'),
  targetDialect: text('target_dialect').default('north'), // north | central | south
  onboardingDone: boolean('onboarding_done').default(false),
  createdAt: timestamp('created_at').defaultNow()
});

/**
 * 2. Cấu Hình Cá Nhân Hóa (preferences)
 */
export const preferences = pgTable('preferences', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  voiceId: text('voice_id').default('vi-VN-Standard-A'),
  speed: integer('speed').default(100), // 100 = 1.0x
  dialect: text('dialect').default('north'),
  correctionLevel: text('correction_level').default('gentle'), // gentle | strict | off
  persona: text('persona').default('be_cu_tit'),
  explainLang: text('explain_lang').default('en'),
  updatedAt: timestamp('updated_at').defaultNow()
});

/**
 * 3. Phiên & Tin Nhắn Hội Thoại (sessions, messages)
 */
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  mode: text('mode').default('free'), // free | roleplay
  scenarioId: text('scenario_id'),
  startedAt: timestamp('started_at').defaultNow(),
  endedAt: timestamp('ended_at')
});

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => sessions.id),
  role: text('role').notNull(), // 'user' | 'agent'
  text: text('text').notNull(),
  blocksJson: jsonb('blocks_json'), // Lưu mảng Block theo Agent UI Protocol
  audioId: text('audio_id'),
  createdAt: timestamp('created_at').defaultNow()
});

/**
 * 4. Lịch Sử Luyện Tập & Phát Âm (attempts)
 */
export const attempts = pgTable('attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  itemType: text('item_type').notNull(), // 'pitch' | 'drill' | 'sentence' | 'vision'
  itemId: text('item_id').notNull(),
  inputRef: text('input_ref'),
  score: integer('score'), // 0 - 100
  detailJson: jsonb('detail_json'),
  createdAt: timestamp('created_at').defaultNow()
});

/**
 * 5. Lặp Lại Ngắt Quãng SM-2 (srs_cards, srs_reviews)
 */
export const srsCards = pgTable('srs_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  itemRef: text('item_ref').notNull(),
  ease: integer('ease').default(250), // 250 nghĩa là 2.50
  intervalDays: integer('interval_days').default(1),
  repetitions: integer('repetitions').default(0),
  dueAt: timestamp('due_at').notNull()
});

export const srsReviews = pgTable('srs_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  cardId: uuid('card_id').references(() => srsCards.id),
  quality: integer('quality').notNull(), // 0 - 5
  reviewedAt: timestamp('reviewed_at').defaultNow()
});

/**
 * 6. Phiên Kiểm Tra Xếp Lớp (placement_sessions)
 */
export const placementSessions = pgTable('placement_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  answersJson: jsonb('answers_json'),
  estimateLevel: integer('estimate_level'), // 1 - 6
  finishedAt: timestamp('finished_at')
});

/**
 * 7. Kho Nội Dung Đã Duyệt (content_items)
 */
export const contentItems = pgTable('content_items', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // 'honorific' | 'dialect' | 'culture' | 'scenario'
  dialect: text('dialect').default('all'),
  payloadJson: jsonb('payload_json').notNull(),
  version: integer('version').default(1),
  reviewedBy: text('reviewed_by'), // Người bản ngữ ký duyệt
  createdAt: timestamp('created_at').defaultNow()
});

/**
 * 8. Quản Lý Tài Sản Âm Thanh & TTL (audio_assets)
 */
export const audioAssets = pgTable('audio_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  hash: text('hash').notNull().unique(),
  kind: text('kind').notNull(), // 'tts_cache' | 'learner_audio'
  storageKey: text('storage_key').notNull(),
  expiresAt: timestamp('expires_at'), // TTL 30 ngày cho file người học
  createdAt: timestamp('created_at').defaultNow()
});

/**
 * 9. Nhật Ký Sử Dụng & Chi Phí API (usage_logs)
 */
export const usageLogs = pgTable('usage_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  capability: text('capability').notNull(), // 'stt' | 'tts' | 'llm' | 'vision'
  provider: text('provider').notNull(),
  units: integer('units').notNull(), // giây stt, ký tự tts, token llm
  costEstimate: integer('cost_estimate'), // đơn vị VND hoặc micro-USD
  latencyMs: integer('latency_ms'),
  createdAt: timestamp('created_at').defaultNow()
});
