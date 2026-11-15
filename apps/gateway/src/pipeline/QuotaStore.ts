/**
 * Kho đếm hạn mức theo ngày. Bản in-memory dùng cho dev / một instance.
 * Production nhiều instance cần bản Redis (INCRBY + EXPIRE) cài cùng interface này.
 */
export type Capability = 'stt' | 'tts' | 'llm' | 'vision';

export interface QuotaStore {
  /** Cộng `units` vào bộ đếm hôm nay; trả về tổng mới. */
  increment(key: string, units: number): Promise<number>;
  get(key: string): Promise<number>;
}

export class InMemoryQuotaStore implements QuotaStore {
  private counters = new Map<string, number>();
  private day = InMemoryQuotaStore.today();

  private static today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private rollover(): void {
    const now = InMemoryQuotaStore.today();
    if (now !== this.day) {
      this.day = now;
      this.counters.clear();
    }
  }

  async increment(key: string, units: number): Promise<number> {
    this.rollover();
    const next = (this.counters.get(key) ?? 0) + units;
    this.counters.set(key, next);
    return next;
  }

  async get(key: string): Promise<number> {
    this.rollover();
    return this.counters.get(key) ?? 0;
  }
}
