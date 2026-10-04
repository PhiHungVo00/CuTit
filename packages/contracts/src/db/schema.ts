import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  targetDialect: text('target_dialect').default('north'),
  level: integer('level').default(1),
  createdAt: timestamp('created_at').defaultNow()
});

export const srsCards = pgTable('srs_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  itemRef: text('item_ref').notNull(),
  ease: integer('ease').default(250),
  intervalDays: integer('interval_days').default(1),
  repetitions: integer('repetitions').default(0),
  dueAt: timestamp('due_at').notNull()
});
