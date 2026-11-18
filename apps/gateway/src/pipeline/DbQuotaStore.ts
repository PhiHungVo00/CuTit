import { and, eq, sql } from 'drizzle-orm';
import { schema, type DbProvider } from '../db/client.js';
import { InMemoryQuotaStore, utcDay, type Capability, type QuotaStore } from './QuotaStore.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Hạn mức AI lưu DB (bảng ai_usage). Kiểm tra + cộng trong MỘT câu lệnh
 * (INSERT … ON CONFLICT DO UPDATE … WHERE units + n ≤ limit) => không vượt hạn mức khi nhiều request song song.
 * Principal ẩn danh `anon:<ip>` (chỉ khi AUTH_REQUIRED=false) không có dòng users => đếm trong RAM.
 */
export class DbQuotaStore implements QuotaStore {
  private anon = new InMemoryQuotaStore();

  constructor(private db: DbProvider) {}

  async tryConsume(id: string, cap: Capability, units: number, limit: number): Promise<{ ok: boolean; used: number }> {
    if (!UUID.test(id)) return this.anon.tryConsume(id, cap, units, limit);
    if (units > limit) return { ok: false, used: await this.get(id, cap) };
    const t = schema.aiUsage;
    const db = await this.db.get();
    const rows = await db
      .insert(t)
      .values({ userId: id, usageDayUtc: utcDay(), capability: cap, units })
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
      .values({ userId: id, usageDayUtc: utcDay(), capability: cap, units })
      .onConflictDoUpdate({ target: [t.userId, t.usageDayUtc, t.capability], set: { units: sql`${t.units} + ${units}`, updatedAt: sql`now()` } });
  }

  async get(id: string, cap: Capability): Promise<number> {
    if (!UUID.test(id)) return this.anon.get(id, cap);
    const t = schema.aiUsage;
    const [row] = await (await this.db.get())
      .select({ units: t.units })
      .from(t)
      .where(and(eq(t.userId, id), eq(t.usageDayUtc, utcDay()), eq(t.capability, cap)));
    return row?.units ?? 0;
  }
}
