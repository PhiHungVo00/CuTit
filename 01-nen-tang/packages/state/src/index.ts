/**
 * Kho trạng thái người học dùng chung (Zustand + lưu bền), đặt ở package để mọi MFE dùng
 * mà không import chéo nhau (Nguyên tắc 7). Ghép lúc build => một bản duy nhất (singleton).
 *
 * TDD: SM-2 (A4) chạy cả client lẫn server, server là nguồn chuẩn. Bản này lưu offline trên máy;
 * đồng bộ /v1/srs/reviews sẽ thêm khi Gateway có DB thật (xem nhật ký).
 */
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { calculateSM2 } from '@vietlearning/shared';

export type Dialect = 'north' | 'central' | 'south';
export type Skill = 'pronunciation' | 'honorific' | 'drill' | 'sentence' | 'dialect' | 'vision' | 'conversation';
export type CorrectionLevel = 'gentle' | 'strict' | 'off';
export type UiLanguage = 'vi' | 'en';

/** Ngôn ngữ giao diện mặc định theo máy: máy tiếng Việt => vi, còn lại (người nước ngoài) => en */
export function deviceLanguage(): UiLanguage {
  try {
    return /^vi(-|$)/i.test(navigator.language) ? 'vi' : 'en';
  } catch {
    return 'en';
  }
}

export interface Profile {
  onboarded: boolean;
  /** CEFR 1–6 (A1..C2) */
  level: number;
  goal: string | null;
  nativeLang: string;
  dialect: Dialect;
}

export interface Preferences {
  voiceId: string;
  speed: number;
  dialect: Dialect;
  correctionLevel: CorrectionLevel;
  persona: string;
  uiLanguage: UiLanguage;
}

export interface SrsCard {
  itemRef: string;
  front: string;
  back: string;
  ease: number;
  intervalDays: number;
  repetitions: number;
  /** ISO string */
  dueAt: string;
  source: Skill;
}

export interface Attempt {
  skill: Skill;
  correct: boolean;
  score?: number;
  at: string;
}

export interface LearnerState {
  profile: Profile;
  preferences: Preferences;
  srs: Record<string, SrsCard>;
  attempts: Attempt[];
  /** giây học theo ngày 'YYYY-MM-DD' (giờ địa phương) */
  activity: Record<string, number>;
  /** Người học đã đọc thông báo quyền riêng tư của tính năng nào (vd. 'voice') */
  consents: Record<string, boolean>;

  completeOnboarding(p: Omit<Profile, 'onboarded'>): void;
  setPreferences(p: Partial<Preferences>): void;
  /** Thêm thẻ (bỏ qua nếu đã có) — vd. lưu từ M4, từ sai ở M5 */
  addCard(card: Pick<SrsCard, 'itemRef' | 'front' | 'back' | 'source'>, now?: Date): void;
  /** A4: chấm chất lượng 0–5 => lịch ôn mới */
  reviewCard(itemRef: string, quality: number, now?: Date): void;
  recordAttempt(skill: Skill, correct: boolean, score?: number, now?: Date): void;
  addStudyTime(seconds: number, now?: Date): void;
  giveConsent(key: string): void;
  /** Rút lại đồng ý (đồng bộ thành `consent.revoke`) */
  revokeConsent(key: string): void;
  reset(): void;
}

const MAX_ATTEMPTS = 1000;

export const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const initialData = () => ({
  profile: { onboarded: false, level: 1, goal: null, nativeLang: 'en', dialect: 'north' as Dialect },
  preferences: { voiceId: 'vi-VN-Standard-A', speed: 1, dialect: 'north' as Dialect, correctionLevel: 'gentle' as CorrectionLevel, persona: 'be_cu_tit', uiLanguage: deviceLanguage() },
  srs: {} as Record<string, SrsCard>,
  attempts: [] as Attempt[],
  activity: {} as Record<string, number>,
  consents: {} as Record<string, boolean>
});

/** localStorage có thể bị chặn (chế độ riêng tư): khi đó lưu trong RAM, app vẫn chạy */
export function safeStorage(): StateStorage {
  const mem = new Map<string, string>();
  const ls = (() => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null;
    }
  })();
  return {
    getItem: (k) => {
      try {
        return ls ? ls.getItem(k) : (mem.get(k) ?? null);
      } catch {
        return mem.get(k) ?? null;
      }
    },
    setItem: (k, v) => {
      try {
        if (ls) ls.setItem(k, v);
        else mem.set(k, v);
      } catch {
        mem.set(k, v);
      }
    },
    removeItem: (k) => {
      try {
        ls?.removeItem(k);
      } catch {
        /* bỏ qua */
      }
      mem.delete(k);
    }
  };
}

export const learnerStore = createStore<LearnerState>()(
  persist(
    (set) => ({
      ...initialData(),

      completeOnboarding: (p) =>
        set((s) => ({ profile: { ...p, onboarded: true }, preferences: { ...s.preferences, dialect: p.dialect } })),

      setPreferences: (p) => set((s) => ({ preferences: { ...s.preferences, ...p } })),

      addCard: (card, now = new Date()) =>
        set((s) =>
          s.srs[card.itemRef]
            ? s
            : { srs: { ...s.srs, [card.itemRef]: { ...card, ease: 250, intervalDays: 0, repetitions: 0, dueAt: now.toISOString() } } }
        ),

      reviewCard: (itemRef, quality, now = new Date()) =>
        set((s) => {
          const c = s.srs[itemRef];
          if (!c) return s;
          const r = calculateSM2(c.ease, c.intervalDays, c.repetitions, quality, now);
          return {
            srs: { ...s.srs, [itemRef]: { ...c, ease: r.ease, intervalDays: r.intervalDays, repetitions: r.repetitions, dueAt: r.dueAt.toISOString() } }
          };
        }),

      recordAttempt: (skill, correct, score, now = new Date()) =>
        set((s) => ({ attempts: [...s.attempts, { skill, correct, score, at: now.toISOString() }].slice(-MAX_ATTEMPTS) })),

      addStudyTime: (seconds, now = new Date()) =>
        set((s) => {
          if (!(seconds > 0)) return s;
          const k = dayKey(now);
          return { activity: { ...s.activity, [k]: (s.activity[k] ?? 0) + Math.round(seconds) } };
        }),

      giveConsent: (key) => set((s) => ({ consents: { ...s.consents, [key]: true } })),
      revokeConsent: (key) => set((s) => ({ consents: Object.fromEntries(Object.entries(s.consents).filter(([k]) => k !== key)) })),

      reset: () => set(initialData())
    }),
    {
      name: 'becutit.learner',
      version: 1,
      storage: createJSONStorage(safeStorage),
      // Gộp sâu với mặc định: bản lưu cũ thiếu trường mới (vd. uiLanguage) vẫn nhận giá trị mặc định
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<LearnerState>;
        return { ...current, ...p, profile: { ...current.profile, ...p.profile }, preferences: { ...current.preferences, ...p.preferences } };
      },
      partialize: (s) => ({ profile: s.profile, preferences: s.preferences, srs: s.srs, attempts: s.attempts, activity: s.activity, consents: s.consents })
    }
  )
);

/** Hook React: chọn đúng phần cần dùng để chỉ re-render khi phần đó đổi */
export function useLearner<T>(selector: (s: LearnerState) => T): T {
  return useStore(learnerStore, selector);
}

// ---------- Hàm thuần cho thống kê (M9), test được độc lập ----------

/** Chuỗi ngày học liên tiếp tính tới hôm nay (hôm nay chưa học thì tính tới hôm qua) */
export function computeStreak(activity: Record<string, number>, today = new Date()): number {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!activity[dayKey(d)]) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (activity[dayKey(d)] > 0) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function accuracyBySkill(attempts: Attempt[]): Partial<Record<Skill, { total: number; correct: number; rate: number }>> {
  const out: Partial<Record<Skill, { total: number; correct: number; rate: number }>> = {};
  for (const a of attempts) {
    const r = (out[a.skill] ??= { total: 0, correct: 0, rate: 0 });
    r.total++;
    if (a.correct) r.correct++;
  }
  for (const r of Object.values(out)) if (r) r.rate = Math.round((r.correct / r.total) * 100);
  return out;
}

export function dueCards(srs: Record<string, SrsCard>, now = new Date()): SrsCard[] {
  return Object.values(srs)
    .filter((c) => new Date(c.dueAt).getTime() <= now.getTime())
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const cefrLabel = (level: number): string => CEFR[Math.max(1, Math.min(6, Math.round(level))) - 1];

/** Tốc độ đọc theo tùy chỉnh M12, nhân với tốc độ gốc mỗi màn hình chọn (vd. 0.85 cho từ đơn) */
/** Nút 🐢 đọc chậm (D9 mục 6): hệ số nhân thêm vào tốc độ đọc — dùng chung cho tệp dựng sẵn (coursePlayer) và TTS của máy */
export const SLOW_FACTOR = 0.75;
export const speechRate = (base = 1): number => Math.max(0.3, Math.min(2.5, learnerStore.getState().preferences.speed * base));

export * from './i18n.js';
export * from './deviceSettings.js';
