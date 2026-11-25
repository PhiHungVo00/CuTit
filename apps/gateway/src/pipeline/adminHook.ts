import type { FastifyReply, FastifyRequest } from 'fastify';
import type { StaffRole } from '@vietlearning/contracts/db';
import { AdminErrorCode } from '@vietlearning/contracts/api';
import type { DbProvider } from '../db/client.js';
import type { Clock } from './QuotaStore.js';
import { getRoles, hasRole } from '../services/admin/roles.js';
import { accountUsable, isSessionActive, verifyAccess, type AdminKey } from '../services/admin/sessions.js';

/**
 * Hook quản trị cho `/admin/v1` (spec §5.4) — TÁCH BIỆT với `RequestPipeline.authenticate` của `/v1`:
 * 1. Chỉ nhận access JWT `typ:'admin'` ký bằng ADMIN_JWT_SECRET (token app `typ:'access'` ký bằng JWT_SECRET => 401).
 * 2. Đọc `staff_roles` từ DB MỖI request, KHÔNG cache => thu quyền có hiệu lực ngay (không còn vai trò => 403).
 * 3. Phiên (`sid`) phải còn sống (chưa thu hồi, chưa quá 12 giờ, chưa rảnh quá 30 phút) => đăng xuất/thu hồi có hiệu lực ngay (401 session_expired).
 * `requireAdmin(role)` dùng làm preHandler/onRequest của từng route; bỏ `role` = chỉ cần có một vai trò nào đó.
 */
export interface AdminPrincipal {
  userId: string;
  roles: StaffRole[];
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    admin?: AdminPrincipal;
  }
  interface FastifyInstance {
    /** Chỉ có trong scope `/admin/v1` (khi bật). Dùng: `{ preHandler: server.requireAdmin('owner') }` */
    requireAdmin?: (role?: StaffRole) => (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | void>;
  }
}

export interface AdminGuardDeps {
  db: DbProvider;
  clock: Clock;
  key: AdminKey;
}

export function createAdminGuard({ db, clock, key }: AdminGuardDeps) {
  async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | void> {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return reply.status(401).send({ error: AdminErrorCode.invalidToken });
    const now = clock();
    const claims = await verifyAccess(key, header.slice(7).trim(), now);
    if (!claims) return reply.status(401).send({ error: AdminErrorCode.invalidToken });
    const d = await db.get();
    // Vai trò trước, KHÔNG cache: bị thu quyền => 403 ngay ở request kế tiếp, dù phiên còn hạn
    const roles = await getRoles(d, claims.userId);
    if (!hasRole(roles)) return reply.status(403).send({ error: AdminErrorCode.forbidden });
    if (!(await accountUsable(d, claims.userId)) || !(await isSessionActive(d, claims.sessionId, claims.userId, now))) {
      return reply.status(401).send({ error: AdminErrorCode.sessionExpired });
    }
    request.admin = { userId: claims.userId, roles, sessionId: claims.sessionId };
  }

  const requireAdmin = (role?: StaffRole) => async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | void> => {
    await authenticate(request, reply);
    if (!request.admin) return reply; // authenticate đã trả lỗi
    if (role && !hasRole(request.admin!.roles, role)) return reply.status(403).send({ error: AdminErrorCode.forbidden });
  };

  return { authenticate, requireAdmin };
}
