import type { FastifyPluginAsync } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import {
  AuthGuestResponseSchema,
  AuthRecoverRequestSchema,
  AuthRefreshRequestSchema,
  AuthTokensSchema
} from '@vietlearning/contracts/api';
import type { RouteDeps } from '../app.js';
import { schema } from '../db/client.js';
import { parseOr400, respond } from '../lib/validate.js';
import { formatRecoveryCode, issueTokens, newRecoveryCode, refreshTokenOwnerIfReused, rotateRefreshToken, sha256 } from '../services/auth/tokens.js';
import { AuditLog } from '../services/audit/audit.js';
import { isDeletedCredential } from '../services/learner/repo.js';
import { tombstoneReason } from '../services/auth/accounts.js';
import { passwordAuthRoutes } from './authPassword.js';

/**
 * /v1/auth/* — KHÔNG đi qua hook xác thực (đây là nơi lấy token), nhưng bị giới hạn theo IP
 * (đăng ký ở app.ts) vì mỗi tài khoản khách mới là một hạn mức AI mới.
 */
export const authRoutes: FastifyPluginAsync<RouteDeps> = async (server, deps) => {
  const { db, audit } = deps;
  // Dự án 3 Task 2: đăng ký/đăng nhập mật khẩu, quên/đặt lại mật khẩu (routes/authPassword.ts, cùng prefix + giới hạn IP)
  await server.register(passwordAuthRoutes, deps);

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
      // Token đã xoay vòng bị dùng lại: dấu hiệu token bị lộ/sao chép (hoặc client gửi trùng) => ghi audit
      const owner = await refreshTokenOwnerIfReused(d, body.refreshToken);
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
      .where(and(eq(schema.users.recoveryCodeHash, sha256(body.recoveryCode)), isNull(schema.users.deletedAt), eq(schema.users.isGuest, true)));
    const ctx = AuditLog.context(req);
    if (!user) {
      // Dự án 3: mã của khách ĐÃ NÂNG CẤP => account_upgraded (mời đăng nhập, KHÔNG xóa dữ liệu máy như account_deleted);
      // đã gộp vào tài khoản khác => account_merged (Task 5 ghi bia mộ này)
      const tomb = await tombstoneReason(d, sha256(body.recoveryCode));
      const reason = tomb === 'upgraded' ? 'account_upgraded' : tomb === 'merged' ? 'account_merged' : tomb ? 'account_deleted' : 'invalid_recovery_code';
      audit.record('auth.recover', { outcome: 'failure', ctx, metadata: { reason } });
      audit.noteAuthFailure(ctx, reason);
      return reply.status(401).send({ error: reason });
    }
    const tokens = await issueTokens(server, d, user.id);
    audit.record('auth.recover', { outcome: 'success', userId: user.id, ctx });
    return respond(AuthTokensSchema, tokens);
  });
};
