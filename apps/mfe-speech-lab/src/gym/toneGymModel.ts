/**
 * Luật của phòng tập thanh điệu (GĐ2) — hàm thuần, xác định theo seed. Không phải thuật toán học mới:
 * chọn câu ngẫu nhiên có seed, đổi thời gian theo đúng/sai (luật trò chơi), tổng hợp số liệu để vẽ biểu đồ.
 */
import { TONE_SETS, type ToneId, type ToneSet } from '@vietlearning/content';
import { rng } from '@vietlearning/exercises';

export const TONES: readonly ToneId[] = ['ngang', 'huyen', 'sac', 'hoi', 'nga', 'nang'];
export const START_MS = 5000;
const MIN_MS = 1500;
const MAX_MS = 6000;
const KEEP_DAYS = 30;

export interface ToneOption {
  tone: ToneId;
  vi: string;
}

export interface MinimalPairQuestion {
  setId: string;
  /** từ được đọc lên (đáp án) */
  word: string;
  answer: ToneId;
  options: ToneOption[];
}

const formsOf = (s: ToneSet): ToneOption[] => TONES.filter((t) => s.forms[t]).map((t) => ({ tone: t, vi: s.forms[t]!.vi }));
const pick = <T,>(arr: readonly T[], r: () => number): T => arr[Math.floor(r() * arr.length)];

function shuffle<T>(arr: readonly T[], r: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Nghe phân biệt: một bộ, 2–3 dạng khác thanh; đọc một dạng, người học chọn dạng đã nghe */
export function minimalPairQuestion(seed: number): MinimalPairQuestion {
  const r = rng(seed);
  const set = pick(TONE_SETS, r);
  const n = r() < 0.5 ? 2 : 3;
  const options = shuffle(formsOf(set), r).slice(0, n);
  const answer = pick(options, r);
  return { setId: set.id, word: answer.vi, answer: answer.tone, options };
}

/** Bắt thanh: n âm tiết ngẫu nhiên, người học chọn thanh trong 6 thanh trước khi hết giờ */
export function catchToneRound(seed: number, n = 10): { word: string; tone: ToneId }[] {
  const r = rng(seed);
  const all = TONE_SETS.flatMap((s) => formsOf(s).map((f) => ({ word: f.vi, tone: f.tone })));
  return Array.from({ length: n }, () => pick(all, r));
}

/** Đúng => nhanh hơn 15%, sai => chậm lại 15%, trong khoảng 1.5–6 giây */
export function nextTimeLimit(ms: number, correct: boolean): number {
  return Math.round(Math.min(MAX_MS, Math.max(MIN_MS, ms * (correct ? 0.85 : 1.15))));
}

/** Kết quả nghe theo ngày: byDay[YYYY-MM-DD][tone] = { n: số câu, c: số đúng } */
export type ListenByDay = Record<string, Partial<Record<ToneId, { n: number; c: number }>>>;

export const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function recordListen(byDay: ListenByDay, tone: ToneId, correct: boolean, now = new Date()): ListenByDay {
  const day = localDay(now);
  const cur = byDay[day]?.[tone] ?? { n: 0, c: 0 };
  const next: ListenByDay = { ...byDay, [day]: { ...byDay[day], [tone]: { n: cur.n + 1, c: cur.c + (correct ? 1 : 0) } } };
  const keep = Object.keys(next).sort().slice(-KEEP_DAYS);
  return Object.fromEntries(keep.map((k) => [k, next[k]]));
}

export interface ToneProgressRow {
  tone: ToneId;
  /** điểm phát âm trung bình 0–100 (luyện thanh A1/A2 trong lộ trình), null nếu chưa luyện */
  speakAvg: number | null;
  /** tỉ lệ nghe đúng trong phòng tập (mọi ngày đã lưu), null nếu chưa nghe */
  listenRate: number | null;
  /** tỉ lệ nghe đúng 7 ngày gần nhất (cũ → hôm nay), null = ngày không luyện */
  trend: (number | null)[];
}

export function toneProgress(toneStats: Record<string, { n: number; sum: number }>, byDay: ListenByDay, now = new Date()): ToneProgressRow[] {
  const days = Array.from({ length: 7 }, (_, i) => localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i)));
  return TONES.map((tone) => {
    const s = toneStats[tone];
    let n = 0;
    let c = 0;
    for (const d of Object.values(byDay)) {
      n += d[tone]?.n ?? 0;
      c += d[tone]?.c ?? 0;
    }
    const trend = days.map((d) => {
      const x = byDay[d]?.[tone];
      return x && x.n ? x.c / x.n : null;
    });
    return { tone, speakAvg: s && s.n ? Math.round(s.sum / s.n) : null, listenRate: n ? c / n : null, trend };
  });
}
