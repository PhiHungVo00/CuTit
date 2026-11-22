import { sql } from 'drizzle-orm';
import { schema, type Db } from '../../db/client.js';
import { quotaDay } from '../../pipeline/QuotaStore.js';

/**
 * Trần thư/ngày cả app (MAIL_DAILY_CAP, ngày giờ Việt Nam) — đếm ở `ai_global_usage` capability 'mail' (không cần bảng
 * mới; ghi chú bàn giao Task 1). Cộng NẾU chưa chạm trần, nguyên tử. false = hết trần => provider_unavailable.
 */
export async function tryConsumeMailQuota(db: Db, cap: number, now: Date): Promise<boolean> {
  if (cap <= 0) return false;
  const t = schema.aiGlobalUsage;
  const rows = await db
    .insert(t)
    .values({ usageDay: quotaDay(now), capability: 'mail', units: 1 })
    .onConflictDoUpdate({
      target: [t.usageDay, t.capability],
      set: { units: sql`${t.units} + 1`, updatedAt: sql`now()` },
      setWhere: sql`${t.units} + 1 <= ${cap}`
    })
    .returning({ units: t.units });
  return rows.length > 0;
}

/** Gửi thất bại => trả lại một suất (không xuống dưới 0) */
export async function refundMailQuota(db: Db, now: Date): Promise<void> {
  const t = schema.aiGlobalUsage;
  await db
    .update(t)
    .set({ units: sql`greatest(${t.units} - 1, 0)` })
    .where(sql`${t.usageDay} = ${quotaDay(now)} and ${t.capability} = 'mail'`);
}
