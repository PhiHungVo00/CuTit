import type { FastifyPluginAsync } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { AdminErrorCode, AdminSessionInfoSchema } from '@vietlearning/contracts/api';
import type { RouteDeps } from '../../app.js';
import { createAdminGuard } from '../../pipeline/adminHook.js';
import { respond } from '../../lib/validate.js';
import { AuditLog } from '../../services/audit/audit.js';
import { burnPasswordCheck } from '../../services/auth/password.js';
import { AdminCrypto } from '../../services/admin/crypto.js';
import { adminKeyOf } from '../../services/admin/sessions.js';
import type { AdminAlerts } from '../../services/admin/alerts.js';
import { adminAuthRoutes } from './auth.js';
import { adminFeedbackRoutes } from './feedback.js';
import { adminAuditRoutes } from './audit.js';
import { adminBlobRoutes } from './blob.js';
import { createBlobUrlSigner } from '../../services/admin/signedUrl.js';

/**
 * Khối `/admin/v1` (chỉ đăng ký khi ADMIN_API_ENABLED). Gom ở đây để `app.ts` chỉ thêm một lời gọi register.
 * Thiếu ADMIN_MFA_KEY hoặc ADMIN_JWT_SECRET => MỌI đường dẫn dưới prefix trả 503 `admin_disabled` (không khởi động nửa vời,
 * không sinh khóa ngẫu nhiên: bí mật TOTP đã mã hóa sẽ không giải mã được sau khi khởi động lại).
 * Route hàng chờ/chi tiết/nhật ký (Task 5) gắn `preHandler: guard('owner')`; `/admin/v1/blob` (URL ký) đăng ký NGOÀI requireAdmin
 * (chữ ký HMAC là xác thực). Thiếu ADMIN_BLOB_URL_SECRET: chỉ cấp URL tệp và /blob trả 503 admin_disabled.
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

  // Làm nóng hash giả của đường "tên không tồn tại" ngay lúc khởi động: lần đầu băm chậm gấp đôi sẽ lộ tên không có (rà kien-truc PR #50, mục 6)
  void burnPasswordCheck('khoi-dong').catch(() => undefined);

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

  const signer = config.ADMIN_BLOB_URL_SECRET ? createBlobUrlSigner(config.ADMIN_BLOB_URL_SECRET, clock) : null;
  const feedbackDeps = { ...deps, guard: guard.requireAdmin, signer };
  // Mỗi cụm một bộ đếm riêng theo IP: /blob bị dò chữ ký không kéo theo các route đã đăng nhập
  const limited = (max: number) => async (scope: Parameters<FastifyPluginAsync>[0]) => {
    await scope.register(rateLimit, {
      max,
      timeWindow: '1 minute',
      keyGenerator: (req) => req.ip,
      onExceeded: (req) => audit.noteRateLimited(AuditLog.context(req), req.url.split('?')[0])
    });
  };
  await server.register(async (scope) => {
    await limited(config.ADMIN_API_RATE_LIMIT_PER_MINUTE)(scope);
    await scope.register(adminFeedbackRoutes, feedbackDeps);
    await scope.register(adminAuditRoutes, feedbackDeps);
  });
  await server.register(async (scope) => {
    await limited(config.ADMIN_BLOB_RATE_LIMIT_PER_MINUTE)(scope);
    await scope.register(adminBlobRoutes, feedbackDeps);
  });
};
