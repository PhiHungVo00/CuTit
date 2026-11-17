/**
 * Luật nghiệp vụ game hóa của lộ trình (GĐ1). Đây là LUẬT NGHIỆP VỤ (cộng điểm, đếm ngày, đặt lịch),
 * không phải thuật toán học mới — không nằm trong danh mục đóng A1–A8 (quyết định D5).
 * Toàn bộ là hàm thuần để test độc lập; store dùng chúng nằm ở progress.ts.
 *
 * Nguyên tắc từ kế hoạch tổng (mục 3): thưởng theo độ chính xác chứ không chỉ số bài; streak có
 * “đóng băng” kiếm bằng học (không bán); mục tiêu ngày do người học chọn; nhắc trung tính, có giờ yên lặng.
 */
import { computeStreak, dayKey } from './index.js';

export const GOAL_OPTIONS = [5, 10, 15, 20] as const;
export type GoalMinutes = (typeof GOAL_OPTIONS)[number];
export const DEFAULT_GOAL: GoalMinutes = 10;
export const MAX_FREEZES = 2;
/** Mỗi 5 bài học hoàn thành kiếm được 1 lần đóng băng */
export const LESSONS_PER_FREEZE = 5;
/** Giờ yên lặng 22:00–07:00: nhắc chỉ được đặt trong khung 07:00–21:59 */
export const QUIET_START = 22;
export const QUIET_END = 7;

const XP_BASE = 10;
const XP_ACCURACY = 10;
const XP_PERFECT = 5;

/** XP một bài: 10 cơ bản + tới 10 theo tỉ lệ đúng ngay lần đầu + 5 nếu đúng hết. Bài rỗng = 0. */
export function lessonXp(r: { total: number; firstTryCorrect: number }): number {
  if (!(r.total > 0)) return 0;
  const acc = Math.max(0, Math.min(1, r.firstTryCorrect / r.total));
  return XP_BASE + Math.round(XP_ACCURACY * acc) + (acc === 1 ? XP_PERFECT : 0);
}

/** Kiểm tra vượt unit: đạt thì 30 XP; chưa đạt không bị trừ gì */
export function testOutXp(passed: boolean): number {
  return passed ? 30 : 0;
}

/** Ôn thẻ: 1 XP cho mỗi thẻ nhớ được (thưởng thành thạo, không thưởng bấm cho xong) */
export function reviewXp(remembered: number): number {
  return Math.max(0, Math.floor(remembered));
}

export function goalProgress(secondsToday: number, goal: GoalMinutes): { minutes: number; ratio: number; met: boolean } {
  const s = Math.max(0, secondsToday || 0);
  const need = goal * 60;
  return { minutes: Math.floor(s / 60), ratio: Math.min(1, s / need), met: s >= need };
}

/** Ngày được tính là “đã học”: có giờ học (bộ đếm) HOẶC có XP (xong bài) HOẶC được đóng băng */
export function learnedDays(activity: Record<string, number>, xpByDay: Record<string, number>, frozenDays: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [d, s] of Object.entries(activity)) if (s > 0) out[d] = 1;
  for (const [d, x] of Object.entries(xpByDay)) if (x > 0) out[d] = 1;
  for (const d of frozenDays) out[d] = 1;
  return out;
}

export function streakWithFreezes(activity: Record<string, number>, xpByDay: Record<string, number>, frozenDays: readonly string[], today = new Date()): number {
  return computeStreak(learnedDays(activity, xpByDay, frozenDays), today);
}

const shift = (today: Date, days: number) => {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  d.setDate(d.getDate() + days);
  return d;
};

/**
 * Tiêu đóng băng cho những ngày vừa lỡ (tính tới hôm qua) nếu đủ để nối chuỗi.
 * - Hôm qua đã học/đã đóng băng => không làm gì (gọi nhiều lần trong ngày vẫn an toàn).
 * - Khoảng lỡ dài hơn số đóng băng đang có => không tiêu (chuỗi đã đứt, giữ đóng băng cho lần sau).
 * - Chưa từng học => không tiêu.
 */
export function applyStreakFreezes(
  input: { learned: Record<string, number>; frozenDays: readonly string[]; freezes: number },
  today = new Date()
): { frozenDays: string[]; freezes: number; used: number } {
  const frozen = new Set(input.frozenDays);
  const covered = (d: string) => input.learned[d] > 0 || frozen.has(d);
  const freezes = Math.max(0, Math.min(MAX_FREEZES, Math.floor(input.freezes || 0)));
  const keep = { frozenDays: [...input.frozenDays], freezes, used: 0 };
  const gap: string[] = [];
  for (let i = 1; i <= freezes + 1; i++) {
    const d = dayKey(shift(today, -i));
    if (covered(d)) {
      if (gap.length === 0) return keep;
      return { frozenDays: [...input.frozenDays, ...gap.reverse()], freezes: freezes - gap.length, used: gap.length };
    }
    gap.push(d);
  }
  return keep;
}

/** Số đóng băng sau khi số bài đã xong tăng từ prev lên next (mỗi mốc 5 bài +1, kẹp tối đa 2) */
export function freezesEarned(prevLessonsDone: number, nextLessonsDone: number, held: number): number {
  const milestones = Math.floor(nextLessonsDone / LESSONS_PER_FREEZE) - Math.floor(prevLessonsDone / LESSONS_PER_FREEZE);
  return Math.min(MAX_FREEZES, Math.max(0, held) + Math.max(0, milestones));
}

export type DayStatus = 'done' | 'frozen' | 'missed' | 'today' | 'future';

/** Tuần hiện tại (Thứ Hai → Chủ Nhật) với trạng thái từng ngày; weekday theo Date.getDay() (0 = CN) */
export function weekCalendar(learned: Record<string, number>, frozenDays: readonly string[], today = new Date()): { day: string; weekday: number; status: DayStatus }[] {
  const frozen = new Set(frozenDays);
  const todayKey = dayKey(today);
  const mondayOffset = (today.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => {
    const d = shift(today, i - mondayOffset);
    const day = dayKey(d);
    let status: DayStatus;
    if (day > todayKey) status = 'future';
    else if (learned[day] > 0) status = 'done';
    else if (frozen.has(day)) status = 'frozen';
    else if (day === todayKey) status = 'today';
    else status = 'missed';
    return { day, weekday: d.getDay(), status };
  });
}

/** Kẹp giờ nhắc ra ngoài giờ yên lặng (22h–7h) */
export function clampReminderHour(hour: number): number {
  const h = Math.floor(Number.isFinite(hour) ? hour : 19);
  return Math.max(QUIET_END, Math.min(QUIET_START - 1, h));
}

export interface ReminderSettings {
  enabled: boolean;
  hour: number;
  minute: number;
}

/**
 * Các mốc nhắc trong `days` ngày tới (tính cả hôm nay). Không có cách chạy mã lúc thông báo bật,
 * nên app đặt trước từng mốc một lần và đặt lại mỗi khi mở app/xong bài:
 * hôm nay đã đạt mục tiêu (hoặc đã qua giờ nhắc) => bỏ mốc hôm nay.
 */
export function planReminders(s: ReminderSettings, goalMetToday: boolean, now = new Date(), days = 7): Date[] {
  if (!s.enabled) return [];
  const hour = clampReminderHour(s.hour);
  const minute = Math.max(0, Math.min(59, Math.floor(s.minute || 0)));
  const out: Date[] = [];
  for (let i = 0; i < days; i++) {
    const d = shift(now, i);
    d.setHours(hour, minute, 0, 0);
    if (i === 0 && (goalMetToday || d.getTime() <= now.getTime())) continue;
    out.push(d);
  }
  return out;
}

// ---------- Dữ liệu tiến độ lưu bền (store ở progress.ts) ----------

export interface LessonRecord {
  /** độ chính xác tốt nhất 0–1 */
  best: number;
  times: number;
  /** ISO lần xong gần nhất */
  at: string;
}

export interface ProgressData {
  xpByDay: Record<string, number>;
  lessons: Record<string, LessonRecord>;
  lessonsDone: number;
  /** unitId => ISO lúc vượt unit */
  testedOut: Record<string, string>;
  freezes: number;
  frozenDays: string[];
  dailyGoal: GoalMinutes;
  reminder: ReminderSettings;
  /** khóa bài làm sai gần đây (mới nhất cuối), tối đa 30 */
  mistakes: { key: string; at: string }[];
  /** điểm luyện thanh theo thanh: số lượt + tổng điểm */
  toneStats: Record<string, { n: number; sum: number }>;
}

export const MAX_MISTAKES = 30;

export const initialProgress = (): ProgressData => ({
  xpByDay: {},
  lessons: {},
  lessonsDone: 0,
  testedOut: {},
  freezes: 0,
  frozenDays: [],
  dailyGoal: DEFAULT_GOAL,
  reminder: { enabled: false, hour: 19, minute: 0 },
  mistakes: [],
  toneStats: {}
});

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const numRecord = (x: unknown): Record<string, number> =>
  isObj(x) ? Object.fromEntries(Object.entries(x).filter(([, v]) => typeof v === 'number' && Number.isFinite(v))) as Record<string, number> : {};

/**
 * Chuẩn hóa bản lưu (mọi phiên bản cũ hoặc bị hỏng) về ProgressData hợp lệ. Dùng làm `migrate` của persist
 * và để gộp: trường thiếu nhận mặc định, mục tiêu lạ về 10, đóng băng kẹp [0, 2], giờ nhắc ra ngoài giờ yên lặng.
 */
export function migrateProgress(persisted: unknown, _version: number): ProgressData {
  const base = initialProgress();
  if (!isObj(persisted)) return base;
  const p = persisted;
  const goal = GOAL_OPTIONS.includes(p.dailyGoal as GoalMinutes) ? (p.dailyGoal as GoalMinutes) : DEFAULT_GOAL;
  const r = isObj(p.reminder) ? p.reminder : {};
  const minute = typeof r.minute === 'number' && r.minute >= 0 && r.minute <= 59 ? Math.floor(r.minute) : 0;
  return {
    xpByDay: numRecord(p.xpByDay),
    lessons: isObj(p.lessons) ? (p.lessons as Record<string, LessonRecord>) : {},
    lessonsDone: typeof p.lessonsDone === 'number' && p.lessonsDone > 0 ? Math.floor(p.lessonsDone) : 0,
    testedOut: isObj(p.testedOut) ? (p.testedOut as Record<string, string>) : {},
    freezes: Math.max(0, Math.min(MAX_FREEZES, typeof p.freezes === 'number' ? Math.floor(p.freezes) : 0)),
    frozenDays: Array.isArray(p.frozenDays) ? p.frozenDays.filter((d): d is string => typeof d === 'string') : [],
    dailyGoal: goal,
    reminder: { enabled: r.enabled === true, hour: clampReminderHour(typeof r.hour === 'number' ? r.hour : 19), minute },
    mistakes: Array.isArray(p.mistakes) ? p.mistakes.filter((m) => isObj(m) && typeof m.key === 'string').slice(-MAX_MISTAKES) as ProgressData['mistakes'] : [],
    toneStats: isObj(p.toneStats) ? (p.toneStats as ProgressData['toneStats']) : {}
  };
}
