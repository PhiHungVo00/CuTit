import type { FastifyPluginAsync } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import {
  AuthGuestResponseSchema,
  AuthLogoutRequestSchema,
  AuthRecoverRequestSchema,
  AuthRefreshRequestSchema,
  AuthTokensSchema
} from '@vietlearning/contracts/api';
import type { RouteDeps } from '../app.js';
import { schema } from '../db/client.js';
import { parseOr400, respond } from '../lib/validate.js';
import { classifyRefreshFailure, formatRecoveryCode, issueTokens, newRecoveryCode, rotateRefreshToken, sha256 } from '../services/auth/tokens.js';
import { AuditLog } from '../services/audit/audit.js';
import { isDeletedCredential } from '../services/learner/repo.js';
import { logoutByRefreshToken } from '../services/auth/lifecycle.js';

/**
 * /v1/auth/* — KHÔNG đi qua hook xác thực (đây là nơi lấy token), nhưng bị giới hạn theo IP
 * (đăng ký ở app.ts) vì mỗi tài khoản khách mới là một hạn mức AI mới.
 */
export const authRoutes: FastifyPluginAsync<RouteDeps> = async (server, { db, audit }) => {
  // POST /v1/auth/guest: tạo tài khoản khách, trả token + mã khôi phục (một lần duy nhất)
  server.post('/guest', async (req) => {
    const d = await db.get();
    const code = newRecoveryCode();
    const [user] = await d.insert(schema.users).values({ isGuest: true, recoveryCodeHash: sha256(code) }).returning({ id: schema.users.id });
    const tokens = await issueTokens(server, d, user.id);
    audit.record('auth.guest_created', { outcome: 'success', userId: user.id, ctx: AuditLog.context(req) });
    return respond(AuthGuestResponseSchema, { ...tokens, recoveryCode: formatRecoveryCode(code) });
  });

  // POST /v1/auth/refresh: xoay vòng refresh token
  server.post('/refresh', async (req, reply) => {
    const body = parseOr400(AuthRefreshRequestSchema, req.body, reply);
    if (!body) return reply;
    const d = await db.get();
    const tokens = await rotateRefreshToken(server, d, body.refreshToken);
    if (!tokens) {
      const ctx = AuditLog.context(req);
      // Chủ token đang chờ xóa: báo riêng (client giữ dữ liệu, hỏi người dùng đăng nhập để khôi phục)
      const failure = await classifyRefreshFailure(d, body.refreshToken, new Date());
      if (failure.kind === 'pending_deletion') return reply.status(401).send({ error: 'account_pending_deletion' });
      // Token đã xoay vòng bị dùng lại: dấu hiệu token bị lộ/sao chép (hoặc client gửi trùng) => đã thu hồi cả họ; ghi audit
      const owner = failure.kind === 'reused' ? failure.userId : null;
      if (owner) audit.record('auth.refresh_reuse', { outcome: 'failure', userId: owner, ctx });
      // Tài khoản đã bị xóa (ở máy khác): báo riêng để client xóa dữ liệu trên máy thay vì tạo khách mới
      const deleted = await isDeletedCredential(d, sha256(body.refreshToken));
      if (!deleted && !owner) audit.noteAuthFailure(ctx, 'invalid_refresh_token');
      return reply.status(401).send({ error: deleted ? 'account_deleted' : 'invalid_refresh_token' });
    }
    return respond(AuthTokensSchema, tokens);
  });

  // POST /v1/auth/recover: máy mới nhập mã khôi phục => token của tài khoản cũ
  server.post('/recover', async (req, reply) => {
    const body = parseOr400(AuthRecoverRequestSchema, req.body, reply);
    if (!body) return reply;
    const d = await db.get();
    const [user] = await d
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.recoveryCodeHash, sha256(body.recoveryCode)), isNull(schema.users.deletedAt)));
    const ctx = AuditLog.context(req);
    if (!user) {
      const deleted = await isDeletedCredential(d, sha256(body.recoveryCode));
      const reason = deleted ? 'account_deleted' : 'invalid_recovery_code';
      audit.record('auth.recover', { outcome: 'failure', ctx, metadata: { reason } });
      audit.noteAuthFailure(ctx, reason);
      return reply.status(401).send({ error: deleted ? 'account_deleted' : 'invalid_recovery_code' });
    }
    const tokens = await issueTokens(server, d, user.id);
    audit.record('auth.recover', { outcome: 'success', userId: user.id, ctx });
    return respond(AuthTokensSchema, tokens);
  });
};

// ===== Task 4 (dự án 3): đăng xuất — khối riêng, giữ ở CUỐI tệp để gộp với Task 2/3 không xung đột =====
export const authLogoutRoutes: FastifyPluginAsync<RouteDeps> = async (server, { db, audit }) => {
  // POST /v1/auth/logout: xác thực bằng chính refresh token (access token có thể đã hết hạn).
  // Thu hồi cả HỌ token của máy này; everywhere:true = mọi máy của tài khoản. Luôn 204 (token lạ/lặp lại cũng vậy: không lộ gì).
  server.post('/logout', async (req, reply) => {
    const body = parseOr400(AuthLogoutRequestSchema, req.body, reply);
    if (!body) return reply;
    const userId = await logoutByRefreshToken(await db.get(), sha256(body.refreshToken), body.everywhere === true, new Date());
    if (userId) audit.record('auth.logout', { outcome: 'success', userId, ctx: AuditLog.context(req), metadata: body.everywhere ? { reason: 'everywhere' } : undefined });
    return reply.status(204).send();
  });
};
