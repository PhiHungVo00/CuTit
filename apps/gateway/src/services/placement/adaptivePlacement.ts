/**
 * Thuật toán A5: kiểm tra xếp lớp thích ứng (Elo/staircase), hội tụ sau 8–12 câu => level CEFR 1–6.
 *
 * - Mỗi câu có độ khó b = level câu. Xác suất đúng (mô hình Rasch/Elo): P = 1 / (1 + e^(−s·(θ − b))).
 * - Sau mỗi câu, θ = ước lượng hậu nghiệm cực đại (MAP) trên TOÀN BỘ câu đã trả lời, tiên nghiệm N(2, 1.5²)
 *   (tìm trên lưới 0.5..6.5). MAP dùng mọi câu đã trả lời nên một lần trượt tay không kéo lệch θ mãi.
 *   Test mô phỏng: trình độ 1–6, trượt tay 10%, ≥ 18/20 lần xếp lệch tối đa 1 cấp.
 * - Câu tiếp theo: câu chưa hỏi có b gần θ nhất.
 * - Dừng khi ≥ 8 câu và θ thay đổi < 0.5 trong 3 câu gần nhất, hoặc đủ 12 câu.
 *
 * Phiên lưu ở DB (bảng placement_sessions, lọc theo user) qua `advance()`; `next()` giữ bản RAM cho test thuật toán.
 */
import { PLACEMENT_QUESTIONS, type PlacementQuestion } from '@vietlearning/content';

export const MIN_QUESTIONS = 8;
export const MAX_QUESTIONS = 12;
const SLOPE = 1.4;
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 10_000;

interface Pending {
  question: PlacementQuestion;
  /** thứ tự lựa chọn đã gửi cho client: shown[i] = chỉ số trong dữ liệu */
  shown: number[];
}

export interface PlacementSession {
  theta: number;
  history: { questionId: string; level: number; correct: boolean; theta: number }[];
  pending: Pending | null;
  seed: number;
  updatedAt: number;
}

export type PlacementStep =
  | { finished: false; question: { id: string; prompt: string; promptEn?: string; options: string[]; index: number; maxQuestions: number }; lastCorrect?: boolean }
  | { finished: true; assignedLevel: number; lastCorrect?: boolean };

export class PlacementError extends Error {
  constructor(public readonly code: 'stale_answer' | 'session_finished') {
    super(code);
  }
}

const levelOf = (theta: number) => Math.max(1, Math.min(6, Math.round(theta)));

const PRIOR_MEAN = 2;
const PRIOR_SD = 1.5;

/** θ hậu nghiệm cực đại: log-likelihood Rasch của mọi câu + tiên nghiệm chuẩn, tìm trên lưới bước 0.02 */
export function mapEstimate(history: { level: number; correct: boolean }[]): number {
  let best = PRIOR_MEAN;
  let bestLog = -Infinity;
  for (let theta = 0.5; theta <= 6.5 + 1e-9; theta += 0.02) {
    let logp = -((theta - PRIOR_MEAN) ** 2) / (2 * PRIOR_SD ** 2);
    for (const h of history) {
      const p = 1 / (1 + Math.exp(-SLOPE * (theta - h.level)));
      logp += Math.log(h.correct ? p : 1 - p);
    }
    if (logp > bestLog) {
      bestLog = logp;
      best = theta;
    }
  }
  return Math.round(best * 100) / 100;
}

function rng(seed: number) {
  let s = seed % 2147483646 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export class AdaptivePlacement {
  private sessions = new Map<string, PlacementSession>();

  constructor(
    private readonly bank: readonly PlacementQuestion[] = PLACEMENT_QUESTIONS,
    private readonly now: () => number = Date.now
  ) {}

  private gc() {
    const t = this.now();
    for (const [id, s] of this.sessions) if (t - s.updatedAt > SESSION_TTL_MS) this.sessions.delete(id);
    // Chặn phình bộ nhớ: bỏ phiên cũ nhất
    while (this.sessions.size > MAX_SESSIONS) this.sessions.delete(this.sessions.keys().next().value!);
  }

  private pickQuestion(s: PlacementSession): Pending {
    const asked = new Set(s.history.map((h) => h.questionId));
    const r = rng(s.seed + s.history.length * 7919);
    const candidates = this.bank.filter((q) => !asked.has(q.id));
    const best = Math.min(...candidates.map((q) => Math.abs(q.level - s.theta)));
    const nearest = candidates.filter((q) => Math.abs(q.level - s.theta) - best < 1e-9);
    const question = nearest[Math.floor(r() * nearest.length)];
    const shown = [...question.options.keys()];
    for (let i = shown.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [shown[i], shown[j]] = [shown[j], shown[i]];
    }
    return { question, shown };
  }

  private toStep(s: PlacementSession, lastCorrect?: boolean): PlacementStep {
    const n = s.history.length;
    const recent = s.history.slice(-3).map((h) => h.theta);
    const stable = n >= MIN_QUESTIONS && recent.length === 3 && Math.max(...recent) - Math.min(...recent) < 0.5;
    if (stable || n >= MAX_QUESTIONS || n >= this.bank.length) {
      s.pending = null;
      return { finished: true, assignedLevel: levelOf(s.theta), lastCorrect };
    }
    s.pending = this.pickQuestion(s);
    const { question, shown } = s.pending;
    return {
      finished: false,
      lastCorrect,
      question: { id: question.id, prompt: question.prompt, promptEn: question.promptEn, options: shown.map((i) => question.options[i]), index: n + 1, maxQuestions: MAX_QUESTIONS }
    };
  }

  /**
   * Bước thuần trên một phiên (không đọc/ghi kho): nhận phiên hiện có (hoặc undefined = phiên mới),
   * trả phiên đã cập nhật + bước tiếp theo. Route HTTP lưu phiên vào DB (placement_sessions) theo user.
   */
  advance(existing: PlacementSession | undefined, sessionId: string, answer?: { questionId: string; choice: number }): { session: PlacementSession; step: PlacementStep } {
    if (!existing) {
      const s: PlacementSession = { theta: 2, history: [], pending: null, seed: [...sessionId].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2147483646, 7), updatedAt: this.now() };
      return { session: s, step: this.toStep(s) };
    }
    const s = existing;
    s.updatedAt = this.now();
    if (!answer) {
      if (!s.pending) return { session: s, step: { finished: true, assignedLevel: levelOf(s.theta) } };
      // Gọi lại không kèm trả lời (vd. mạng chập chờn): gửi lại đúng câu đang chờ
      const { question, shown } = s.pending;
      return {
        session: s,
        step: {
          finished: false,
          question: { id: question.id, prompt: question.prompt, promptEn: question.promptEn, options: shown.map((i) => question.options[i]), index: s.history.length + 1, maxQuestions: MAX_QUESTIONS }
        }
      };
    }
    if (!s.pending) throw new PlacementError('session_finished');
    if (s.pending.question.id !== answer.questionId) throw new PlacementError('stale_answer');

    const { question, shown } = s.pending;
    const correct = shown[answer.choice] === question.answer;
    s.history.push({ questionId: question.id, level: question.level, correct, theta: s.theta });
    s.theta = mapEstimate(s.history);
    s.history[s.history.length - 1].theta = s.theta;
    return { session: s, step: this.toStep(s, correct) };
  }

  /** Bản lưu RAM (test thuật toán, chạy không cần DB) */
  next(sessionId: string, answer?: { questionId: string; choice: number }): PlacementStep {
    this.gc();
    const { session, step } = this.advance(this.sessions.get(sessionId), sessionId, answer);
    this.sessions.set(sessionId, session);
    return step;
  }

  /** chỉ dùng cho test */
  peek(sessionId: string): PlacementSession | undefined {
    return this.sessions.get(sessionId);
  }
}
