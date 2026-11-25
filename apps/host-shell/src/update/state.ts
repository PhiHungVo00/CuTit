import { AppVersionResponseSchema, type AppVersionResponse } from '@vietlearning/contracts/api';

/** Trạng thái kiểm cập nhật lưu bền (localStorage `becutit.update`, bọc try/catch — chế độ riêng tư vẫn chạy) */
export interface UpdateState {
  /** Lần hỏi Gateway thành công gần nhất (ms) */
  lastCheckAt: number;
  lastResponse: AppVersionResponse | null;
  /** "Để sau": không nhắc lại đúng bản này tới `snoozedUntil` */
  snoozedBuild: number;
  snoozedUntil: number;
}

export const STATE_KEY = 'becutit.update';

const EMPTY: UpdateState = { lastCheckAt: 0, lastResponse: null, snoozedBuild: 0, snoozedUntil: 0 };

/** Dữ liệu từ localStorage có thể hỏng/bị sửa: kiểm lại bằng đúng schema của contract */
function parseResponse(v: unknown): AppVersionResponse | null {
  const p = AppVersionResponseSchema.safeParse(v);
  return p.success ? p.data : null;
}

export function readState(): UpdateState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return { ...EMPTY };
    const v = JSON.parse(raw) as Partial<UpdateState>;
    return {
      lastCheckAt: typeof v.lastCheckAt === 'number' ? v.lastCheckAt : 0,
      lastResponse: parseResponse(v.lastResponse),
      snoozedBuild: typeof v.snoozedBuild === 'number' ? v.snoozedBuild : 0,
      snoozedUntil: typeof v.snoozedUntil === 'number' ? v.snoozedUntil : 0
    };
  } catch {
    return { ...EMPTY };
  }
}

export function writeState(patch: Partial<UpdateState>): UpdateState {
  const next = { ...readState(), ...patch };
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
  } catch {
    /* không ghi được: vẫn chạy trong phiên này */
  }
  return next;
}
