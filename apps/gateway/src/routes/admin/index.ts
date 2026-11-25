import type { FastifyPluginAsync } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { AdminErrorCode, AdminSessionInfoSchema } from '@vietlearning/contracts/api';
import type { RouteDeps } from '../../app.js';
import { createAdminGuard } from '../../pipeline/adminHook.js';
import { respond } from '../../lib/validate.js';
import { AuditLog } from '../../services/audit/audit.js';
import { AdminCrypto } from '../../services/admin/crypto.js';
import { adminKeyOf } from '../../services/admin/sessions.js';
import type { AdminAlerts } from '../../services/admin/alerts.js';
import { adminAuthRoutes } from './auth.js';

/**
 * Khối `/admin/v1` (chỉ đăng ký khi ADMIN_API_ENABLED). Gom ở đây để `app.ts` chỉ thêm một lời gọi register.
 * Thiếu ADMIN_MFA_KEY hoặc ADMIN_JWT_SECRET => MỌI đường dẫn dưới prefix trả 503 `admin_disabled` (không khởi động nửa vời,
 * không sinh khóa ngẫu nhiên: bí mật TOTP đã mã hóa sẽ không giải mã được sau khi khởi động lại).
 * Task 5 thêm route hàng chờ/chi tiết/nhật ký TẠI ĐÂY, mỗi route gắn `preHandler: server.requireAdmin('owner')`;
 * `/admin/v1/blob` (URL ký) đăng ký NGOÀI requireAdmin.
 */
export const adminRoutes: FastifyPluginAsync<RouteDeps & { adminAlerts: AdminAlerts }> = async (server, opts) => {
  // Bỏ `prefix` (Fastify nhét cả vào opts): chuyển tiếp xuống plugin con sẽ nhân đôi tiền tố đường dẫn
  const { prefix: _prefix, ...deps } = opts as typeof opts & { prefix?: string };
  void _prefix;
  const { config, audit, db, clock } = deps;

  // Mọi phản hồi quản trị (token, mã dự phòng) không được cache ở đâu cả
  server.addHook('onSend', async (_req, reply, payload) => {
    reply.header('cache-control', 'no-store');
    return payload;
  });

  if (!config.ADMIN_MFA_KEY || !config.ADMIN_JWT_SECRET) {
    server.route({
      method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      url: '/*',
      handler: async (_req, reply) => reply.status(503).send({ error: AdminErrorCode.adminDisabled })
    });
    return;
  }

  const adminKey = adminKeyOf(config.ADMIN_JWT_SECRET);
  const adminCrypto = new AdminCrypto(config.ADMIN_MFA_KEY);
  const guard = createAdminGuard({ db, clock, key: adminKey });
  server.decorate('requireAdmin', guard.requireAdmin);

  // Bước đăng nhập (không Bearer): giới hạn theo IP như /v1/auth, thêm bộ đếm sai riêng trong route
  await server.register(
    async (auth) => {
      await auth.register(rateLimit, {
        max: config.AUTH_RATE_LIMIT_PER_MINUTE,
        timeWindow: '1 minute',
        keyGenerator: (req) => req.ip,
        onExceeded: (req) => audit.noteRateLimited(AuditLog.context(req), req.url.split('?')[0])
      });
      await auth.register(adminAuthRoutes, { ...deps, adminCrypto, adminKey });
    },
    { prefix: '/auth' }
  );

  // Ai đang đăng nhập + vai trò hiện tại (đọc DB mỗi lần). Dùng làm route "đã xác thực" tối thiểu và cho trang quản trị sau khi refresh.
  server.get('/session', { preHandler: guard.requireAdmin() }, async (req) => {
    const a = req.admin!;
    return respond(AdminSessionInfoSchema, { userIdShort: a.userId.slice(0, 8), roles: a.roles });
  });
};
