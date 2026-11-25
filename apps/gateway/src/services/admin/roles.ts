import { and, eq } from 'drizzle-orm';
import type { StaffRole } from '@vietlearning/contracts/db';
import { schema, type Db } from '../../db/client.js';
import type { Tx } from './audit.js';

/**
 * Vai trò nhân sự (`staff_roles`). KHÔNG cache: mỗi request `/admin/v1` đọc lại DB => thu quyền có hiệu lực ngay (spec §5.4).
 * `owner` là tập cha: thỏa mọi yêu cầu vai trò khác (5a chỉ dùng owner).
 */
export const STAFF_ROLE_LIST: readonly StaffRole[] = ['owner', 'editor', 'reviewer', 'support'];

export async function getRoles(db: Db | Tx, userId: string): Promise<StaffRole[]> {
  const rows = await db.select({ role: schema.staffRoles.role }).from(schema.staffRoles).where(eq(schema.staffRoles.userId, userId));
  return rows.map((r) => r.role);
}

/** `required` bỏ trống = chỉ cần có ít nhất một vai trò */
export function hasRole(roles: readonly StaffRole[], required?: StaffRole): boolean {
  if (roles.length === 0) return false;
  return !required || roles.includes(required) || roles.includes('owner');
}

/** Cấp vai trò; false = đã có sẵn (không ghi gì) */
export async function grantRole(tx: Tx, userId: string, role: StaffRole, grantedBy: string | null): Promise<boolean> {
  const rows = await tx
    .insert(schema.staffRoles)
    .values({ userId, role, grantedBy })
    .onConflictDoNothing()
    .returning({ userId: schema.staffRoles.userId });
  return rows.length > 0;
}

/** Thu vai trò; false = không có để thu */
export async function revokeRole(tx: Tx, userId: string, role: StaffRole): Promise<boolean> {
  const rows = await tx
    .delete(schema.staffRoles)
    .where(and(eq(schema.staffRoles.userId, userId), eq(schema.staffRoles.role, role)))
    .returning({ userId: schema.staffRoles.userId });
  return rows.length > 0;
}
