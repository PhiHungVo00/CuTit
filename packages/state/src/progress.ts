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
import { dayKey, safeStorage } from './index.js';
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

export const PROGRESS_VERSION = 1;

export interface ProgressState extends ProgressData {
  /** Ghi một bài đã xong; trả XP nhận được và có kiếm thêm đóng băng không */
  completeLesson(lessonId: string, r: { total: number; firstTryCorrect: number }, now?: Date): { xp: number; freezeEarned: boolean };
  passTestOut(unitId: string, now?: Date): number;
  addXp(amount: number, now?: Date): void;
  recordMistake(key: string, now?: Date): void;
  clearMistake(key: string): void;
  recordTone(tone: string, score: number): void;
  /** Tiêu đóng băng cho ngày lỡ (gọi khi mở lộ trình); trả số đóng băng vừa dùng */
  settleFreezes(activity: Record<string, number>, now?: Date): number;
  setDailyGoal(goal: GoalMinutes): void;
  setReminder(p: Partial<ReminderSettings>): void;
  resetProgress(): void;
}

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
          freezes
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

      recordTone: (tone, score) =>
        set((s) => {
          const cur = s.toneStats[tone] ?? { n: 0, sum: 0 };
          return { toneStats: { ...s.toneStats, [tone]: { n: cur.n + 1, sum: cur.sum + Math.round(score) } } };
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
        toneStats: s.toneStats
      })
    }
  )
);

export function useProgress<T>(selector: (s: ProgressState) => T): T {
  return useStore(progressStore, selector);
}

/** Tổng XP mọi ngày */
export const totalXp = (xpByDay: Record<string, number>): number => Object.values(xpByDay).reduce((a, b) => a + b, 0);
