import { and, desc, lt } from 'drizzle-orm';
import type { AuditAction } from '@vietlearning/contracts/api';
import { schema, type Db } from '../../db/client.js';
import { shortUserAgent } from '../audit/audit.js';

/**
 * Nhật ký quản trị `admin_audit_log` (spec §5.5): CHỈ THÊM (trigger ở DB chặn sửa/xóa), ghi trong CÙNG transaction với thao tác
 * => thao tác lỗi/hoàn tác thì không có dòng nhật ký, và không ghi được nhật ký thì thao tác cũng không xảy ra.
 * KHÔNG dùng `audit.record` (bắn-rồi-quên) cho việc này. KHÔNG đưa mật khẩu, mã, token, bí mật vào `meta`.
 */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface AdminAuditEntry {
  /** null khi `actorKind='cli'` (ràng buộc ở DB) hoặc lần đăng nhập sai không xác định được người */
  actorUserId: string | null;
  actorKind: 'user' | 'cli';
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  meta?: Record<string, unknown>;
  ipHash?: string | null;
  userAgent?: string | null;
}

/** Thêm một dòng nhật ký bằng kết nối/transaction đang có (nơi gọi tự bảo đảm cùng transaction với thao tác) */
export async function insertAdminAudit(tx: Tx | Db, entry: AdminAuditEntry): Promise<void> {
  await tx.insert(schema.adminAuditLog).values({
    actorUserId: entry.actorKind === 'cli' ? null : entry.actorUserId,
    actorKind: entry.actorKind,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    meta: entry.meta ?? {},
    ipHash: entry.ipHash ?? null,
    userAgent: shortUserAgent(entry.userAgent ?? undefined)
  });
}

/**
 * Chạy `fn` trong một transaction và ghi nhật ký ở CUỐI cùng transaction đó.
 * `fn` ném lỗi => rollback, 0 dòng nhật ký. Ghi nhật ký lỗi => rollback luôn cả `fn`.
 * Chỉ dùng `tx` bên trong `fn` (PGlite chỉ một kết nối: đụng `db` ngoài transaction sẽ treo).
 */
export async function withAdminAudit<T>(db: Db, entry: AdminAuditEntry, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const result = await fn(tx);
    await insertAdminAudit(tx, entry);
    return result;
  });
}

export const AUDIT_PAGE_DEFAULT = 50;

/** Đọc nhật ký mới nhất lên đầu (cho test và Task 5) */
export async function listAdminAudit(db: Db, limit = AUDIT_PAGE_DEFAULT, beforeId?: number) {
  const t = schema.adminAuditLog;
  return db
    .select()
    .from(t)
    .where(beforeId ? and(lt(t.id, beforeId)) : undefined)
    .orderBy(desc(t.id))
    .limit(limit);
}
