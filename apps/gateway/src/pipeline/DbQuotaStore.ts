import { and, eq, sql } from 'drizzle-orm';
import { schema, type DbProvider } from '../db/client.js';
import {
  CAPABILITIES,
  InMemoryQuotaStore,
  quotaDay,
  type Capability,
  type Clock,
  type GlobalQuotaStore,
  type QuotaStore
} from './QuotaStore.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Hạn mức AI lưu DB (bảng ai_usage). Kiểm tra + cộng trong MỘT câu lệnh
 * (INSERT … ON CONFLICT DO UPDATE … WHERE units + n ≤ limit) => không vượt hạn mức khi nhiều request song song.
 * Principal ẩn danh `anon:<ip>` (chỉ khi AUTH_REQUIRED=false) không có dòng users => đếm trong RAM.
 * Khóa ngày = ngày giờ Việt Nam (cột vẫn tên `usage_day_utc`, xem schema.ts).
 */
export class DbQuotaStore implements QuotaStore {
  private anon: InMemoryQuotaStore;

  constructor(private db: DbProvider, private clock: Clock = () => new Date()) {
    this.anon = new InMemoryQuotaStore(clock);
  }

  private day(): string {
    return quotaDay(this.clock());
  }

  async tryConsume(id: string, cap: Capability, units: number, limit: number): Promise<{ ok: boolean; used: number }> {
    if (!UUID.test(id)) return this.anon.tryConsume(id, cap, units, limit);
    if (units > limit) return { ok: false, used: await this.get(id, cap) };
    const t = schema.aiUsage;
    const db = await this.db.get();
    const rows = await db
      .insert(t)
      .values({ userId: id, usageDayUtc: this.day(), capability: cap, units })
      .onConflictDoUpdate({
        target: [t.userId, t.usageDayUtc, t.capability],
        set: { units: sql`${t.units} + ${units}`, updatedAt: sql`now()` },
        setWhere: sql`${t.units} + ${units} <= ${limit}`
      })
      .returning({ units: t.units });
    if (rows.length) return { ok: true, used: rows[0].units };
    return { ok: false, used: await this.get(id, cap) };
  }

  async add(id: string, cap: Capability, units: number): Promise<void> {
    if (!UUID.test(id)) return this.anon.add(id, cap, units);
    const t = schema.aiUsage;
    await (await this.db.get())
      .insert(t)
      .values({ userId: id, usageDayUtc: this.day(), capability: cap, units })
      .onConflictDoUpdate({ target: [t.userId, t.usageDayUtc, t.capability], set: { units: sql`${t.units} + ${units}`, updatedAt: sql`now()` } });
  }

  async refund(id: string, cap: Capability, units: number): Promise<void> {
    if (!UUID.test(id)) return this.anon.refund(id, cap, units);
    if (units <= 0) return;
    const t = schema.aiUsage;
    // Chỉ hoàn vào dòng NGÀY HIỆN TẠI (qua nửa đêm giữa lúc gọi AI thì lượt cũ đã reset, không hoàn nhầm sang ngày mới)
    await (await this.db.get())
      .update(t)
      .set({ units: sql`greatest(${t.units} - ${units}, 0)`, updatedAt: sql`now()` })
      .where(and(eq(t.userId, id), eq(t.usageDayUtc, this.day()), eq(t.capability, cap)));
  }

  async get(id: string, cap: Capability): Promise<number> {
    if (!UUID.test(id)) return this.anon.get(id, cap);
    const t = schema.aiUsage;
    const [row] = await (await this.db.get())
      .select({ units: t.units })
      .from(t)
      .where(and(eq(t.userId, id), eq(t.usageDayUtc, this.day()), eq(t.capability, cap)));
    return row?.units ?? 0;
  }

  async getAll(id: string): Promise<Record<Capability, number>> {
    if (!UUID.test(id)) return this.anon.getAll(id);
    const t = schema.aiUsage;
    const rows = await (await this.db.get())
      .select({ capability: t.capability, units: t.units })
      .from(t)
      .where(and(eq(t.userId, id), eq(t.usageDayUtc, this.day())));
    const out = Object.fromEntries(CAPABILITIES.map((c) => [c, 0])) as Record<Capability, number>;
    for (const r of rows) if ((CAPABILITIES as readonly string[]).includes(r.capability)) out[r.capability as Capability] = r.units;
    return out;
  }
}

/** Trần dùng chung toàn app lưu DB (bảng ai_global_usage), cùng kiểu đếm nguyên tử với DbQuotaStore */
export class DbGlobalQuotaStore implements GlobalQuotaStore {
  constructor(private db: DbProvider, private clock: Clock = () => new Date()) {}

  private day(): string {
    return quotaDay(this.clock());
  }

  async tryConsume(cap: Capability, units: number, limit: number): Promise<{ ok: boolean; used: number }> {
    if (units > limit) return { ok: false, used: await this.get(cap) };
    const t = schema.aiGlobalUsage;
    const rows = await (await this.db.get())
      .insert(t)
      .values({ usageDay: this.day(), capability: cap, units })
      .onConflictDoUpdate({
        target: [t.usageDay, t.capability],
        set: { units: sql`${t.units} + ${units}`, updatedAt: sql`now()` },
        setWhere: sql`${t.units} + ${units} <= ${limit}`
      })
      .returning({ units: t.units });
    if (rows.length) return { ok: true, used: rows[0].units };
    return { ok: false, used: await this.get(cap) };
  }

  async refund(cap: Capability, units: number): Promise<void> {
    if (units <= 0) return;
    const t = schema.aiGlobalUsage;
    await (await this.db.get())
      .update(t)
      .set({ units: sql`greatest(${t.units} - ${units}, 0)`, updatedAt: sql`now()` })
      .where(and(eq(t.usageDay, this.day()), eq(t.capability, cap)));
  }

  async get(cap: Capability): Promise<number> {
    const t = schema.aiGlobalUsage;
    const [row] = await (await this.db.get()).select({ units: t.units }).from(t).where(and(eq(t.usageDay, this.day()), eq(t.capability, cap)));
    return row?.units ?? 0;
  }
}
