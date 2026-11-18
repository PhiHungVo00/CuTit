/**
 * GĐ4 — Huy hiệu theo THÀNH THẠO và tổng kết tuần. Đây là LUẬT NGHIỆP VỤ game hóa (đếm, so ngưỡng),
 * không phải thuật toán học mới — không nằm trong danh mục đóng A1–A8 (giống XP/streak, quyết định D5).
 *
 * - Huy hiệu được SUY RA từ dữ liệu đã có (điểm thanh, thẻ SM-2, bài đã xong, vượt unit). Lúc đạt thì ghi lại
 *   thời điểm (store tiến độ) để KHÔNG BAO GIỜ mất đi khi điểm trung bình tụt hay thẻ bị ôn sai; đồng bộ bằng
 *   sự kiện `achievement.earn` + bảng `achievements` có sẵn từ GĐ0 (không thêm bảng, không đổi contract).
 * - Không có huy hiệu theo số ngày cày (bài học từ phàn nàn về Duolingo, kế hoạch mục 3.2).
 * - Dữ liệu khóa học (unit, bài nhập vai, 6 thanh) do MFE truyền vào: package state không phụ thuộc content.
 */
import { dayKey } from './index.js';

export const TONE_MASTERY = 80;
export const TONE_MIN_TRIES = 3;
/** Thẻ “nhớ dài hạn”: khoảng ôn SM-2 ≥ 21 ngày */
export const LONG_TERM_DAYS = 21;
/** Từ “đã thuộc” (tổng kết tuần): đã nhớ qua 2 lần ôn giãn cách (khoảng ôn ≥ 6 ngày) */
export const KNOWN_DAYS = 6;
export const ROLEPLAY_PASS = 0.6;

export interface BadgeUnit {
  id: string;
  lessonIds: readonly string[];
  roleplayIds: readonly string[];
}
export interface BadgeFacts {
  units: readonly BadgeUnit[];
  tones: readonly string[];
}
export interface BadgeInput {
  toneStats: Record<string, { n: number; sum: number }>;
  srs: Record<string, { intervalDays: number }>;
  lessons: Record<string, { best: number }>;
  testedOut: Record<string, string>;
}
export type BadgeKind = 'tones' | 'cards' | 'unit' | 'roleplay' | 'testout';
export interface BadgeStatus {
  key: string;
  kind: BadgeKind;
  unitId?: string;
  current: number;
  target: number;
  met: boolean;
}
export interface EarnedBadge {
  /** ISO lúc đạt */
  at: string;
  /** đã hiện thông báo cho người học chưa (chỉ trên máy) */
  seen: boolean;
}

const status = (key: string, kind: BadgeKind, current: number, target: number, unitId?: string): BadgeStatus => ({
  key,
  kind,
  ...(unitId ? { unitId } : {}),
  current: Math.min(target, current),
  target,
  met: current >= target
});

/** Trạng thái mọi huy hiệu: đã đạt điều kiện chưa và còn thiếu bao nhiêu */
export function badgeStatuses(input: BadgeInput, facts: BadgeFacts): BadgeStatus[] {
  const tonesOk = facts.tones.filter((t) => {
    const s = input.toneStats[t];
    return s && s.n >= TONE_MIN_TRIES && s.sum / s.n >= TONE_MASTERY;
  }).length;
  const longTerm = Object.values(input.srs).filter((c) => c.intervalDays >= LONG_TERM_DAYS).length;
  const roleplayOk = facts.units.some((u) => u.roleplayIds.some((id) => (input.lessons[id]?.best ?? 0) >= ROLEPLAY_PASS));
  const testedOut = Object.keys(input.testedOut).length;
  return [
    status('tones80', 'tones', tonesOk, facts.tones.length),
    status('cards25', 'cards', longTerm, 25),
    status('cards100', 'cards', longTerm, 100),
    ...facts.units.map((u) => {
      const done = input.testedOut[u.id] ? u.lessonIds.length : u.lessonIds.filter((id) => input.lessons[id]).length;
      return status(`unit:${u.id}`, 'unit', done, u.lessonIds.length, u.id);
    }),
    status('roleplay', 'roleplay', roleplayOk ? 1 : 0, 1),
    status('testout', 'testout', testedOut > 0 ? 1 : 0, 1)
  ];
}

export function newlyEarned(statuses: readonly BadgeStatus[], earned: Record<string, EarnedBadge>): string[] {
  return statuses.filter((s) => s.met && !earned[s.key]).map((s) => s.key);
}

// ---------- Tổng kết tuần ----------

const shiftDay = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

/** Thứ Hai của tuần chứa `d` (cùng quy ước với lịch tuần của lộ trình) */
export function weekStart(d = new Date()): string {
  return dayKey(shiftDay(d, -((d.getDay() + 6) % 7)));
}

/** Ngày ôn gần nhất của thẻ = hạn ôn − khoảng ôn (SM-2 đặt hạn = lúc ôn + khoảng) */
export function knownDay(c: { intervalDays: number; dueAt: string }): string {
  const due = new Date(c.dueAt);
  return dayKey(shiftDay(due, -Math.round(c.intervalDays)));
}

export interface ToneWeek {
  /** Thứ Hai của tuần mà mốc thuộc về */
  week: string;
  /** điểm thanh tích lũy lúc bắt đầu tuần */
  base: Record<string, { n: number; sum: number }>;
}

export interface WeekNumbers {
  minutes: number;
  lessons: number;
  words: number;
  xp: number;
}

export interface WeeklySummary {
  weekStart: string;
  thisWeek: WeekNumbers;
  lastWeek: WeekNumbers;
  /** tuần trước có học gì không (không có => giao diện nói “chưa có số liệu tuần trước”) */
  hasLastWeek: boolean;
  /** thanh tăng điểm trung bình nhiều nhất so với trước tuần này (chỉ tính khi tăng) */
  bestTone: { tone: string; avg: number; delta: number } | null;
}

export interface WeeklyInput {
  activity: Record<string, number>;
  lessonsByDay: Record<string, number>;
  knownAt: Record<string, string>;
  xpByDay: Record<string, number>;
  toneStats: Record<string, { n: number; sum: number }>;
  toneWeek: ToneWeek | null;
}

function sumDays(rec: Record<string, number>, from: string, to: string): number {
  let s = 0;
  for (const [d, v] of Object.entries(rec)) if (d >= from && d < to && v > 0) s += v;
  return s;
}

function countDays(rec: Record<string, string>, from: string, to: string): number {
  return Object.values(rec).filter((d) => d >= from && d < to).length;
}

/** So tuần này (từ Thứ Hai tới nay) với cả tuần trước của CHÍNH người học — không so với ai khác */
export function weeklySummary(input: WeeklyInput, now = new Date()): WeeklySummary {
  const start = weekStart(now);
  const [y, m, d] = start.split('-').map(Number);
  const startDate = new Date(y, m - 1, d);
  const next = dayKey(shiftDay(startDate, 7));
  const prev = dayKey(shiftDay(startDate, -7));
  const numbers = (from: string, to: string): WeekNumbers => ({
    minutes: Math.round(sumDays(input.activity, from, to) / 60),
    lessons: sumDays(input.lessonsByDay, from, to),
    words: countDays(input.knownAt, from, to),
    xp: sumDays(input.xpByDay, from, to)
  });
  const lastWeek = numbers(prev, start);

  let bestTone: WeeklySummary['bestTone'] = null;
  if (input.toneWeek?.week === start) {
    for (const [tone, cur] of Object.entries(input.toneStats)) {
      const base = input.toneWeek.base[tone] ?? { n: 0, sum: 0 };
      const n = cur.n - base.n;
      if (!(n > 0) || !(base.n > 0)) continue;
      const avg = Math.round((cur.sum - base.sum) / n);
      const delta = avg - Math.round(base.sum / base.n);
      if (delta > 0 && (!bestTone || delta > bestTone.delta)) bestTone = { tone, avg, delta };
    }
  }
  return {
    weekStart: start,
    thisWeek: numbers(start, next),
    lastWeek,
    hasLastWeek: lastWeek.minutes + lastWeek.lessons + lastWeek.words + lastWeek.xp > 0,
    bestTone
  };
}
