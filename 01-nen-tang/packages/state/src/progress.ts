/**
 * Store tiến độ lộ trình (GĐ1): XP theo ngày, bài đã xong, vượt unit, đóng băng streak, mục tiêu ngày,
 * cài đặt nhắc học, lỗi gần đây, điểm thanh điệu.
 *
 * Tách khỏi learnerStore (index.ts) có chủ đích:
 * - khóa lưu riêng `becutit.progress` với `version` + `migrate` riêng => không đụng bản lưu cũ của người học
 *   và không xung đột với phiên GĐ0 đang làm đồng bộ trên learnerStore;
 * - xuất qua subpath `@vietlearning/state/progress` => chỉ nằm trong chunk lazy của lộ trình, không vào bundle đầu.
 */
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { createJSONStorage, persist } from 'zustand/middleware';
import { dayKey, learnerStore, safeStorage } from './index.js';
import { badgeStatuses, knownDay, newlyEarned, weekStart, KNOWN_DAYS, type BadgeFacts } from './badges.js';
import {
  applyStreakFreezes,
  freezesEarned,
  initialProgress,
  learnedDays,
  lessonXp,
  migrateProgress,
  testOutXp,
  MAX_MISTAKES,
  type GoalMinutes,
  type ProgressData,
  type ReminderSettings
} from './gamification.js';

export * from './gamification.js';
export * from './badges.js';

export const PROGRESS_VERSION = 1;

export interface ProgressState extends ProgressData {
  /** Ghi một bài đã xong; trả XP nhận được và có kiếm thêm đóng băng không */
  completeLesson(lessonId: string, r: { total: number; firstTryCorrect: number }, now?: Date): { xp: number; freezeEarned: boolean };
  passTestOut(unitId: string, now?: Date): number;
  addXp(amount: number, now?: Date): void;
  recordMistake(key: string, now?: Date): void;
  clearMistake(key: string): void;
  recordTone(tone: string, score: number, now?: Date): void;
  /** GĐ4: trao các huy hiệu vừa đạt điều kiện (đọc thẻ từ learnerStore); trả khóa huy hiệu mới */
  awardBadges(facts: BadgeFacts, now?: Date): string[];
  /** đánh dấu đã thông báo (không truyền = tất cả) */
  markBadgesSeen(keys?: readonly string[]): void;
  /** ghi ngày “đã thuộc” cho thẻ vừa đạt khoảng ôn ≥ 6 ngày (gọi khi mở lộ trình/tổng kết) */
  noteKnownWords(srs: Record<string, { itemRef: string; intervalDays: number; dueAt: string }>): void;
  /** Tiêu đóng băng cho ngày lỡ (gọi khi mở lộ trình); trả số đóng băng vừa dùng */
  settleFreezes(activity: Record<string, number>, now?: Date): number;
  setDailyGoal(goal: GoalMinutes): void;
  setReminder(p: Partial<ReminderSettings>): void;
  resetProgress(): void;
}

/** Giữ 70 ngày gần nhất của bộ đếm bài theo ngày (đủ cho tuần này + tuần trước) */
const LESSON_DAYS_KEPT = 70;
const addLessonDay = (byDay: Record<string, number>, now: Date) => {
  const k = dayKey(now);
  const out = { ...byDay, [k]: (byDay[k] ?? 0) + 1 };
  const keys = Object.keys(out).sort();
  for (const old of keys.slice(0, Math.max(0, keys.length - LESSON_DAYS_KEPT))) delete out[old];
  return out;
};

const addDayXp = (xpByDay: Record<string, number>, amount: number, now: Date) => {
  const k = dayKey(now);
  return { ...xpByDay, [k]: (xpByDay[k] ?? 0) + amount };
};

export const progressStore = createStore<ProgressState>()(
  persist(
    (set, get) => ({
      ...initialProgress(),

      completeLesson: (lessonId, r, now = new Date()) => {
        const s = get();
        const xp = lessonXp(r);
        const accuracy = r.total > 0 ? r.firstTryCorrect / r.total : 0;
        const prev = s.lessons[lessonId];
        const lessonsDone = s.lessonsDone + 1;
        const freezes = freezesEarned(s.lessonsDone, lessonsDone, s.freezes);
        set({
          xpByDay: addDayXp(s.xpByDay, xp, now),
          lessons: { ...s.lessons, [lessonId]: { best: Math.max(prev?.best ?? 0, accuracy), times: (prev?.times ?? 0) + 1, at: now.toISOString() } },
          lessonsDone,
          freezes,
          lessonsByDay: addLessonDay(s.lessonsByDay, now)
        });
        return { xp, freezeEarned: freezes > s.freezes };
      },

      passTestOut: (unitId, now = new Date()) => {
        const xp = testOutXp(true);
        set((s) => ({ testedOut: { ...s.testedOut, [unitId]: now.toISOString() }, xpByDay: addDayXp(s.xpByDay, xp, now) }));
        return xp;
      },

      addXp: (amount, now = new Date()) => {
        if (amount > 0) set((s) => ({ xpByDay: addDayXp(s.xpByDay, Math.round(amount), now) }));
      },

      recordMistake: (key, now = new Date()) =>
        set((s) => ({ mistakes: [...s.mistakes.filter((m) => m.key !== key), { key, at: now.toISOString() }].slice(-MAX_MISTAKES) })),

      clearMistake: (key) => set((s) => ({ mistakes: s.mistakes.filter((m) => m.key !== key) })),

      recordTone: (tone, score, now = new Date()) =>
        set((s) => {
          const cur = s.toneStats[tone] ?? { n: 0, sum: 0 };
          const week = weekStart(now);
          // lượt đầu tiên của tuần: chốt điểm tích lũy làm mốc so sánh (tổng kết tuần)
          const toneWeek = s.toneWeek?.week === week ? s.toneWeek : { week, base: { ...s.toneStats } };
          return { toneStats: { ...s.toneStats, [tone]: { n: cur.n + 1, sum: cur.sum + Math.round(score) } }, toneWeek };
        }),

      awardBadges: (facts, now = new Date()) => {
        const s = get();
        const fresh = newlyEarned(badgeStatuses({ toneStats: s.toneStats, srs: learnerStore.getState().srs, lessons: s.lessons, testedOut: s.testedOut }, facts), s.badges);
        if (fresh.length === 0) return fresh;
        const at = now.toISOString();
        set({ badges: { ...s.badges, ...Object.fromEntries(fresh.map((k) => [k, { at, seen: false }])) } });
        return fresh;
      },

      markBadgesSeen: (keys) =>
        set((s) => {
          const pick = keys ? new Set(keys) : null;
          let changed = false;
          const badges = { ...s.badges };
          for (const [k, b] of Object.entries(badges)) {
            if (b.seen || (pick && !pick.has(k))) continue;
            badges[k] = { ...b, seen: true };
            changed = true;
          }
          return changed ? { badges } : s;
        }),

      noteKnownWords: (srs) =>
        set((s) => {
          const add: Record<string, string> = {};
          for (const c of Object.values(srs)) if (c.intervalDays >= KNOWN_DAYS && !s.knownAt[c.itemRef]) add[c.itemRef] = knownDay(c);
          return Object.keys(add).length ? { knownAt: { ...s.knownAt, ...add } } : s;
        }),

      settleFreezes: (activity, now = new Date()) => {
        const s = get();
        const r = applyStreakFreezes({ learned: learnedDays(activity, s.xpByDay, []), frozenDays: s.frozenDays, freezes: s.freezes }, now);
        if (r.used > 0) set({ frozenDays: r.frozenDays, freezes: r.freezes });
        return r.used;
      },

      setDailyGoal: (dailyGoal) => set({ dailyGoal }),

      setReminder: (p) => set((s) => ({ reminder: { ...s.reminder, ...p } })),

      resetProgress: () => set(initialProgress())
    }),
    {
      name: 'becutit.progress',
      version: PROGRESS_VERSION,
      storage: createJSONStorage(safeStorage),
      migrate: (persisted, version) => migrateProgress(persisted, version) as unknown as ProgressState,
      // Gộp: bản lưu thiếu trường/bị sửa tay vẫn được chuẩn hóa
      merge: (persisted, current) => ({ ...current, ...migrateProgress(persisted, PROGRESS_VERSION) }),
      partialize: (s): ProgressData => ({
        xpByDay: s.xpByDay,
        lessons: s.lessons,
        lessonsDone: s.lessonsDone,
        testedOut: s.testedOut,
        freezes: s.freezes,
        frozenDays: s.frozenDays,
        dailyGoal: s.dailyGoal,
        reminder: s.reminder,
        mistakes: s.mistakes,
        toneStats: s.toneStats,
        badges: s.badges,
        lessonsByDay: s.lessonsByDay,
        knownAt: s.knownAt,
        toneWeek: s.toneWeek
      })
    }
  )
);

export function useProgress<T>(selector: (s: ProgressState) => T): T {
  return useStore(progressStore, selector);
}

/** Tổng XP mọi ngày */
export const totalXp = (xpByDay: Record<string, number>): number => Object.values(xpByDay).reduce((a, b) => a + b, 0);
