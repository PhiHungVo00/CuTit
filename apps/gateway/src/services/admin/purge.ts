import { sql } from 'drizzle-orm';
import { AUDIT_RETENTION_DAYS } from '@vietlearning/contracts/api';
import type { Db } from '../../db/client.js';
import { purgeExpiredSessions } from './sessions.js';

const DAY_MS = 24 * 3600_000;

/**
 * Dọn hằng ngày cho khối quản trị (spec §5.5/§5.7). Mốc tính từ ĐỒNG HỒ TIÊM `now` (không dùng `now()` của SQL) để test với đồng hồ giả.
 * - `admin_sessions` hết hạn quá 30 ngày: xóa.
 * - `admin_audit_log` quá 2 năm: gọi `admin_audit_purge(before)` (SECURITY DEFINER; trigger chặn xóa vẫn bật với mọi đường khác).
 */
export async function purgeAdminData(db: Db, now: Date): Promise<{ sessions: number; auditRows: number }> {
  const sessions = await purgeExpiredSessions(db, now);
  const before = new Date(now.getTime() - AUDIT_RETENTION_DAYS * DAY_MS);
  const res = (await db.execute(sql`select admin_audit_purge(${before.toISOString()}::timestamptz) as n`)) as unknown as
    | { n: unknown }[]
    | { rows: { n: unknown }[] };
  const rows = Array.isArray(res) ? res : res.rows;
  return { sessions, auditRows: Number(rows[0]?.n ?? 0) };
}
