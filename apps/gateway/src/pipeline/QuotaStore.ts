/**
 * Kho đếm hạn mức AI theo NGÀY GIỜ VIỆT NAM (UTC+7; đổi ngày lúc 00:00 giờ Việt Nam = 17:00 UTC).
 * - DbQuotaStore (mặc định, GĐ3): lưu bảng `ai_usage` => không reset khi khởi động lại / nhiều instance dùng chung DB.
 * - InMemoryQuotaStore: test và principal ẩn danh `anon:<ip>` (không có dòng users để tham chiếu).
 * - GlobalQuotaStore: trần dùng chung CẢ APP (bảng `ai_global_usage`), chống đốt hết hạn mức miễn phí của nhà cung cấp.
 */
export type Capability = 'stt' | 'tts' | 'llm' | 'vision' | 'turn';

export const CAPABILITIES: readonly Capability[] = ['stt', 'tts', 'llm', 'vision', 'turn'];

export interface QuotaStore {
  /** Cộng `units` NẾU used + units ≤ limit (nguyên tử); trả kết quả và tổng sau thao tác. */
  tryConsume(principalId: string, capability: Capability, units: number, limit: number): Promise<{ ok: boolean; used: number }>;
  /** Cộng không điều kiện (bù chênh lệch token thật sau khi gọi AI). */
  add(principalId: string, capability: Capability, units: number): Promise<void>;
  /** Hoàn trả `units` (AI lỗi => không trừ lượt). Không xuống dưới 0 và chỉ hoàn trong NGÀY HIỆN TẠI. */
  refund(principalId: string, capability: Capability, units: number): Promise<void>;
  get(principalId: string, capability: Capability): Promise<number>;
  /** Đã dùng hôm nay theo mọi năng lực (một truy vấn) — để tính `remaining` */
  getAll(principalId: string): Promise<Record<Capability, number>>;
}

/** Trần dùng chung toàn app (không theo người dùng) */
export interface GlobalQuotaStore {
  tryConsume(capability: Capability, units: number, limit: number): Promise<{ ok: boolean; used: number }>;
  refund(capability: Capability, units: number): Promise<void>;
  get(capability: Capability): Promise<number>;
}

export type Clock = () => Date;

const VN_OFFSET_MS = 7 * 3600 * 1000;

/**
 * 'YYYY-MM-DD' theo giờ Việt Nam (UTC+7, không có giờ mùa hè). Đây là KHÓA NGÀY của mọi bộ đếm.
 * Chuyển đổi: trước đây khóa là ngày UTC. Khóa cũ và mới trùng nhau trong 00:00–17:00 UTC (đếm tiếp bình thường);
 * từ 17:00 UTC khóa mới nhảy sang ngày kế => người đã dùng trong khung 17:00–24:00 UTC của ngày triển khai được đếm lại
 * từ 0 MỘT lần (tối đa một ngày hạn mức; không mất lượt, không cộng nhầm).
 */
export const quotaDay = (now = new Date()): string => new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

/** 00:00 giờ Việt Nam kế tiếp (lúc hạn mức mới bắt đầu), dạng ISO UTC */
export function quotaResetAt(now = new Date()): string {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + 1) - VN_OFFSET_MS).toISOString();
}

export class InMemoryQuotaStore implements QuotaStore {
  private counters = new Map<string, number>();
  private day: string;

  constructor(private readonly clock: Clock = () => new Date()) {
    this.day = quotaDay(clock());
  }

  private key(id: string, cap: Capability): string {
    const now = quotaDay(this.clock());
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

  async refund(id: string, cap: Capability, units: number): Promise<void> {
    const k = this.key(id, cap);
    this.counters.set(k, Math.max(0, (this.counters.get(k) ?? 0) - units));
  }

  async get(id: string, cap: Capability): Promise<number> {
    return this.counters.get(this.key(id, cap)) ?? 0;
  }

  async getAll(id: string): Promise<Record<Capability, number>> {
    const out = {} as Record<Capability, number>;
    for (const c of CAPABILITIES) out[c] = await this.get(id, c);
    return out;
  }
}

export class InMemoryGlobalQuotaStore implements GlobalQuotaStore {
  private counters = new Map<Capability, number>();
  private day: string;

  constructor(private readonly clock: Clock = () => new Date()) {
    this.day = quotaDay(clock());
  }

  private roll(): void {
    const now = quotaDay(this.clock());
    if (now !== this.day) {
      this.day = now;
      this.counters.clear();
    }
  }

  async tryConsume(cap: Capability, units: number, limit: number): Promise<{ ok: boolean; used: number }> {
    this.roll();
    const used = this.counters.get(cap) ?? 0;
    if (used + units > limit) return { ok: false, used };
    this.counters.set(cap, used + units);
    return { ok: true, used: used + units };
  }

  async refund(cap: Capability, units: number): Promise<void> {
    this.roll();
    this.counters.set(cap, Math.max(0, (this.counters.get(cap) ?? 0) - units));
  }

  async get(cap: Capability): Promise<number> {
    this.roll();
    return this.counters.get(cap) ?? 0;
  }
}
