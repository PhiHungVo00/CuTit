import { and, asc, desc, eq, lt, lte, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { PreferencesSchema, ProgressSnapshot, SyncEvent } from '@vietlearning/contracts/api';
import { schema, type Db } from '../../db/client.js';

/**
 * Truy cập dữ liệu người học. MỌI hàm nhận userId của principal đã xác thực và lọc theo nó —
 * không có hàm nào nhận id do client gửi để đọc dữ liệu người khác.
 *
 * Luật gộp khi đồng bộ (local-first, nhiều máy):
 * - hồ sơ / tùy chỉnh / thẻ SRS: bản có `at` mới hơn (hoặc bằng) thắng (LWW)
 * - giây học theo ngày: lấy giá trị lớn nhất (mỗi máy gửi tổng của chính nó)
 * - XP: chỉ thêm (append-only), chống trùng bằng clientEventId
 * - bài học: đã 'completed' thì giữ, điểm cao nhất
 */
type Preferences = z.infer<typeof PreferencesSchema>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const {
  users,
  preferences,
  srsCards,
  attempts,
  dailyActivity,
  consents,
  xpEvents,
  lessonProgress,
  achievements,
  syncEvents,
  learnerProgress,
  deletedAccounts,
  refreshTokens
} = schema;

export async function getPreferences(db: Db, userId: string): Promise<Preferences | null> {
  const [p] = await db.select().from(preferences).where(eq(preferences.userId, userId));
  if (!p) return null;
  return {
    voiceId: p.voiceId,
    speed: p.speed,
    dialect: p.dialect as Preferences['dialect'],
    correctionLevel: p.correctionLevel as Preferences['correctionLevel'],
    persona: p.persona,
    uiLanguage: p.uiLanguage as Preferences['uiLanguage']
  };
}

export async function putPreferences(db: Db | Tx, userId: string, p: Preferences, at: Date): Promise<void> {
  const values = { ...p, userId, updatedAt: at };
  await db
    .insert(preferences)
    .values(values)
    .onConflictDoUpdate({
      target: preferences.userId,
      set: { voiceId: p.voiceId, speed: p.speed, dialect: p.dialect, correctionLevel: p.correctionLevel, persona: p.persona, uiLanguage: p.uiLanguage, updatedAt: at },
      setWhere: lte(preferences.updatedAt, at)
    });
}

export async function dueCards(db: Db, userId: string, now: Date) {
  return db
    .select()
    .from(srsCards)
    .where(and(eq(srsCards.userId, userId), lte(srsCards.dueAt, now)))
    .orderBy(asc(srsCards.dueAt));
}

// ---------- Ngày địa phương 'YYYY-MM-DD' (không đổi múi giờ: chỉ cộng trừ lịch) ----------

const prevDay = (day: string): string => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** Chuỗi ngày học liên tiếp tới `today` (hôm nay chưa học thì tính tới hôm qua) — luật nghiệp vụ, không phải thuật toán A* */
export function streakFrom(activeDays: Set<string>, today: string): number {
  let d = activeDays.has(today) ? today : prevDay(today);
  let n = 0;
  while (activeDays.has(d)) {
    n++;
    d = prevDay(d);
  }
  return n;
}

export async function summary(db: Db, userId: string, today: string, now: Date) {
  const days = await db
    .select({ day: dailyActivity.day, seconds: dailyActivity.seconds, xp: dailyActivity.xp, freezeUsed: dailyActivity.freezeUsed })
    .from(dailyActivity)
    .where(eq(dailyActivity.userId, userId));
  // Ngày “đã học” = có giây học HOẶC có XP HOẶC đã dùng đóng băng (khớp learnedDays của client)
  const active = new Set(days.filter((d) => d.seconds > 0 || d.xp > 0 || d.freezeUsed).map((d) => d.day));
  let weekStart = today;
  for (let i = 0; i < 6; i++) weekStart = prevDay(weekStart);
  const weekSeconds = days.filter((d) => d.day >= weekStart && d.day <= today).reduce((s, d) => s + d.seconds, 0);

  const recent = await db
    .select({ correct: attempts.correct })
    .from(attempts)
    .where(eq(attempts.userId, userId))
    .orderBy(desc(attempts.createdAt))
    .limit(1000);
  const [{ due }] = await db
    .select({ due: sql<number>`count(*)::int` })
    .from(srsCards)
    .where(and(eq(srsCards.userId, userId), lte(srsCards.dueAt, now)));
  const [user] = await db.select({ level: users.level }).from(users).where(eq(users.id, userId));

  return {
    streakDays: streakFrom(active, today),
    studyMinutes: Math.round(weekSeconds / 60),
    accuracyRate: recent.length ? Math.round((recent.filter((a) => a.correct).length / recent.length) * 100) : 0,
    dueCardsCount: due,
    cefrEstimate: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'][Math.max(1, Math.min(6, user?.level ?? 1)) - 1]
  };
}

export async function snapshot(db: Db, userId: string): Promise<ProgressSnapshot> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  const [prefs, cards, att, days, cons, xpTotal, lessons, ach, prog] = await Promise.all([
    getPreferences(db, userId),
    db.select().from(srsCards).where(eq(srsCards.userId, userId)).orderBy(asc(srsCards.itemRef)),
    db.select().from(attempts).where(eq(attempts.userId, userId)).orderBy(desc(attempts.createdAt)).limit(1000),
    db.select().from(dailyActivity).where(eq(dailyActivity.userId, userId)),
    db.select().from(consents).where(eq(consents.userId, userId)),
    db.select({ total: sql<number>`coalesce(sum(${xpEvents.amount}), 0)::int` }).from(xpEvents).where(eq(xpEvents.userId, userId)),
    db.select().from(lessonProgress).where(eq(lessonProgress.userId, userId)),
    db.select().from(achievements).where(eq(achievements.userId, userId)),
    db.select().from(learnerProgress).where(eq(learnerProgress.userId, userId))
  ]);
  const sortedDays = [...days].sort((x, y) => x.day.localeCompare(y.day));
  return {
    userId,
    profile: u?.profileUpdatedAt
      ? { onboarded: u.onboardingDone, level: u.level, goal: u.goal, nativeLang: u.nativeLang, dialect: u.targetDialect as 'north' | 'central' | 'south' }
      : null,
    preferences: prefs,
    srs: cards.map((c) => ({
      itemRef: c.itemRef,
      front: c.front,
      back: c.back,
      source: c.source as ProgressSnapshot['srs'][number]['source'],
      ease: c.ease,
      intervalDays: c.intervalDays,
      repetitions: c.repetitions,
      dueAt: c.dueAt.toISOString()
    })),
    attempts: att.reverse().map((a) => ({
      skill: a.skill as ProgressSnapshot['attempts'][number]['skill'],
      correct: a.correct,
      ...(a.score == null ? {} : { score: a.score }),
      at: a.createdAt.toISOString()
    })),
    activity: Object.fromEntries(days.filter((d) => d.seconds > 0).map((d) => [d.day, d.seconds])),
    consents: cons.map((c) => ({ key: c.key, version: c.version, grantedAt: c.grantedAt.toISOString() })),
    xp: { total: xpTotal[0]?.total ?? 0, byDay: Object.fromEntries(days.filter((d) => d.xp > 0).map((d) => [d.day, d.xp])) },
    lessons: lessons.map((l) => ({
      lessonId: l.lessonId,
      status: l.status as 'started' | 'completed',
      bestScore: l.bestScore,
      completedAt: l.completedAt?.toISOString() ?? null
    })),
    achievements: ach.map((a) => ({ key: a.key, earnedAt: a.earnedAt.toISOString() })),
    dayFlags: {
      goalMet: sortedDays.filter((d) => d.goalMet).map((d) => d.day),
      frozen: sortedDays.filter((d) => d.freezeUsed).map((d) => d.day)
    },
    progressState: prog[0]
      ? { lessonsDone: prog[0].lessonsDone, freezes: prog[0].freezes, dailyGoal: prog[0].dailyGoal as 5 | 10 | 15 | 20 }
      : null
  };
}

/** Bia mộ giữ 90 ngày (= hạn refresh token): sau đó credential cũ đằng nào cũng hết hạn */
const TOMBSTONE_TTL_MS = 90 * 24 * 3600 * 1000;

/**
 * Xóa cứng: mọi bảng con (kể cả xp_events, refresh_tokens, hồ sơ trẻ) bị xóa theo nhờ ON DELETE CASCADE.
 * Trước khi xóa, chép sha256 của refresh token + mã khôi phục vào bia mộ (cùng transaction) để máy khác
 * nhận `account_deleted`. Bia mộ không chứa userId hay dữ liệu học.
 */
export async function deleteUser(db: Db, userId: string, now = new Date()): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [u] = await tx.select({ code: users.recoveryCodeHash }).from(users).where(eq(users.id, userId));
    if (!u) return false;
    const tokens = await tx.select({ hash: refreshTokens.tokenHash }).from(refreshTokens).where(eq(refreshTokens.userId, userId));
    const hashes = [...tokens.map((t) => t.hash), ...(u.code ? [u.code] : [])];
    if (hashes.length) await tx.insert(deletedAccounts).values(hashes.map((credentialHash) => ({ credentialHash, deletedAt: now }))).onConflictDoNothing();
    await tx.delete(deletedAccounts).where(lt(deletedAccounts.deletedAt, new Date(now.getTime() - TOMBSTONE_TTL_MS)));
    await tx.delete(users).where(eq(users.id, userId));
    return true;
  });
}

/** credentialHash = sha256 của refresh token / mã khôi phục đã chuẩn hóa */
export async function isDeletedCredential(db: Db, credentialHash: string): Promise<boolean> {
  const [row] = await db.select({ h: deletedAccounts.credentialHash }).from(deletedAccounts).where(eq(deletedAccounts.credentialHash, credentialHash));
  return Boolean(row);
}

// ---------- Đồng bộ ----------

async function applyOne(tx: Tx, userId: string, e: SyncEvent): Promise<void> {
  // Đồng hồ máy chạy nhanh không được “thắng” mãi mọi lần ghi sau (LWW): chặn ở thời điểm hiện tại của server
  const at = new Date(Math.min(Date.parse(e.at), Date.now()));
  switch (e.type) {
    case 'profile.set': {
      const p = e.profile;
      await tx
        .update(users)
        .set({ onboardingDone: p.onboarded, level: p.level, goal: p.goal, nativeLang: p.nativeLang, targetDialect: p.dialect, profileUpdatedAt: at })
        .where(and(eq(users.id, userId), sql`(${users.profileUpdatedAt} is null or ${users.profileUpdatedAt} <= ${at.toISOString()})`));
      return;
    }
    case 'preferences.set':
      return putPreferences(tx, userId, e.preferences, at);
    case 'srs.upsert': {
      const c = e.card;
      const row = { front: c.front, back: c.back, source: c.source, ease: c.ease, intervalDays: c.intervalDays, repetitions: c.repetitions, dueAt: new Date(c.dueAt), updatedAt: at };
      await tx
        .insert(srsCards)
        .values({ userId, itemRef: c.itemRef, ...row })
        .onConflictDoUpdate({ target: [srsCards.userId, srsCards.itemRef], set: row, setWhere: lte(srsCards.updatedAt, at) });
      return;
    }
    case 'attempt.add': {
      const a = e.attempt;
      await tx.insert(attempts).values({ userId, skill: a.skill, correct: a.correct, score: a.score == null ? null : Math.round(a.score), createdAt: new Date(a.at) });
      return;
    }
    case 'activity.set':
      await tx
        .insert(dailyActivity)
        .values({ userId, day: e.day, seconds: e.seconds, updatedAt: at })
        .onConflictDoUpdate({
          target: [dailyActivity.userId, dailyActivity.day],
          set: { seconds: sql`greatest(${dailyActivity.seconds}, excluded.seconds)`, updatedAt: at }
        });
      return;
    case 'consent.grant':
      await tx.insert(consents).values({ userId, key: e.key, version: e.version, grantedAt: at }).onConflictDoNothing();
      return;
    case 'xp.add':
      await tx.insert(xpEvents).values({ userId, clientEventId: e.clientEventId, source: e.source, amount: e.amount, lessonId: e.lessonId ?? null, day: e.day, createdAt: at });
      await tx
        .insert(dailyActivity)
        .values({ userId, day: e.day, xp: e.amount, updatedAt: at })
        .onConflictDoUpdate({ target: [dailyActivity.userId, dailyActivity.day], set: { xp: sql`${dailyActivity.xp} + excluded.xp`, updatedAt: at } });
      return;
    case 'lesson.progress': {
      const completed = e.status === 'completed';
      await tx
        .insert(lessonProgress)
        .values({ userId, lessonId: e.lessonId, status: e.status, bestScore: e.score ?? null, completedAt: completed ? at : null, updatedAt: at })
        .onConflictDoUpdate({
          target: [lessonProgress.userId, lessonProgress.lessonId],
          set: {
            status: sql`case when ${lessonProgress.status} = 'completed' then 'completed' else excluded.status end`,
            bestScore: sql`greatest(${lessonProgress.bestScore}, excluded.best_score)`,
            completedAt: sql`coalesce(${lessonProgress.completedAt}, excluded.completed_at)`,
            updatedAt: at
          }
        });
      return;
    }
    case 'achievement.earn':
      await tx.insert(achievements).values({ userId, key: e.key, earnedAt: at }).onConflictDoNothing();
      return;
    case 'day.mark': {
      const goalMet = e.goalMet === true;
      const freezeUsed = e.freezeUsed === true;
      await tx
        .insert(dailyActivity)
        .values({ userId, day: e.day, goalMet, freezeUsed, updatedAt: at })
        .onConflictDoUpdate({
          target: [dailyActivity.userId, dailyActivity.day],
          // chỉ bật, không tắt: OR với giá trị đã có
          set: {
            goalMet: sql`${dailyActivity.goalMet} or excluded.goal_met`,
            freezeUsed: sql`${dailyActivity.freezeUsed} or excluded.freeze_used`,
            updatedAt: at
          }
        });
      return;
    }
    case 'progress.set': {
      const row = { lessonsDone: e.lessonsDone, freezes: e.freezes, dailyGoal: e.dailyGoal, updatedAt: at };
      await tx
        .insert(learnerProgress)
        .values({ userId, ...row })
        .onConflictDoUpdate({ target: learnerProgress.userId, set: row, setWhere: lte(learnerProgress.updatedAt, at) });
      return;
    }
  }
}

/**
 * Áp dụng lô sự kiện. Mỗi sự kiện: ghi sổ chống trùng (sync_events) + tác dụng của nó trong CÙNG một
 * transaction => gửi lại lô (mạng chập chờn) không cộng XP/attempt lần hai, và lỗi giữa chừng không để
 * lại sổ “đã nhận” mà không có dữ liệu.
 * Sắp theo `at` để các thay đổi offline được áp đúng thứ tự.
 */
export async function applyEvents(db: Db, userId: string, events: SyncEvent[]): Promise<{ accepted: string[]; duplicates: string[] }> {
  const accepted: string[] = [];
  const duplicates: string[] = [];
  const ordered = [...events].sort((a, b) => a.at.localeCompare(b.at));
  for (const e of ordered) {
    const applied = await db.transaction(async (tx) => {
      const ledger = await tx
        .insert(syncEvents)
        .values({ userId, clientEventId: e.clientEventId, type: e.type })
        .onConflictDoNothing()
        .returning({ id: syncEvents.clientEventId });
      if (!ledger.length) return false;
      await applyOne(tx, userId, e);
      return true;
    });
    (applied ? accepted : duplicates).push(e.clientEventId);
  }
  return { accepted, duplicates };
}
