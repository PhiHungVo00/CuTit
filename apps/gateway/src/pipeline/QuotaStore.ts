/**
 * Kho đếm hạn mức AI theo NGÀY UTC của server.
 * - DbQuotaStore (mặc định, GĐ3): lưu bảng `ai_usage` => không reset khi khởi động lại / nhiều instance dùng chung DB.
 * - InMemoryQuotaStore: test và principal ẩn danh `anon:<ip>` (không có dòng users để tham chiếu).
 */
export type Capability = 'stt' | 'tts' | 'llm' | 'vision' | 'turn';

export interface QuotaStore {
  /** Cộng `units` NẾU used + units ≤ limit (nguyên tử); trả kết quả và tổng sau thao tác. */
  tryConsume(principalId: string, capability: Capability, units: number, limit: number): Promise<{ ok: boolean; used: number }>;
  /** Cộng không điều kiện (bù chênh lệch token thật sau khi gọi AI). */
  add(principalId: string, capability: Capability, units: number): Promise<void>;
  get(principalId: string, capability: Capability): Promise<number>;
}

/** 'YYYY-MM-DD' theo UTC */
export const utcDay = (now = new Date()): string => now.toISOString().slice(0, 10);

/** Nửa đêm UTC kế tiếp (lúc hạn mức mới bắt đầu) */
export function quotaResetAt(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

export class InMemoryQuotaStore implements QuotaStore {
  private counters = new Map<string, number>();
  private day = utcDay();

  private key(id: string, cap: Capability): string {
    const now = utcDay();
    if (now !== this.day) {
      this.day = now;
      this.counters.clear();
    }
    return `${id}:${cap}`;
  }

  async tryConsume(id: string, cap: Capability, units: number, limit: number): Promise<{ ok: boolean; used: number }> {
    const k = this.key(id, cap);
    const used = this.counters.get(k) ?? 0;
    if (used + units > limit) return { ok: false, used };
    this.counters.set(k, used + units);
    return { ok: true, used: used + units };
  }

  async add(id: string, cap: Capability, units: number): Promise<void> {
    const k = this.key(id, cap);
    this.counters.set(k, (this.counters.get(k) ?? 0) + units);
  }

  async get(id: string, cap: Capability): Promise<number> {
    return this.counters.get(this.key(id, cap)) ?? 0;
  }
}
