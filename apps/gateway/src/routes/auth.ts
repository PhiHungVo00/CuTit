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
import { formatRecoveryCode, issueTokens, newRecoveryCode, rotateRefreshToken, sha256 } from '../services/auth/tokens.js';
import { isDeletedCredential } from '../services/learner/repo.js';

/**
 * /v1/auth/* — KHÔNG đi qua hook xác thực (đây là nơi lấy token), nhưng bị giới hạn theo IP
 * (đăng ký ở app.ts) vì mỗi tài khoản khách mới là một hạn mức AI mới.
 */
export const authRoutes: FastifyPluginAsync<RouteDeps> = async (server, { db }) => {
  // POST /v1/auth/guest: tạo tài khoản khách, trả token + mã khôi phục (một lần duy nhất)
  server.post('/guest', async () => {
    const d = await db.get();
    const code = newRecoveryCode();
    const [user] = await d.insert(schema.users).values({ isGuest: true, recoveryCodeHash: sha256(code) }).returning({ id: schema.users.id });
    const tokens = await issueTokens(server, d, user.id);
    return respond(AuthGuestResponseSchema, { ...tokens, recoveryCode: formatRecoveryCode(code) });
  });

  // POST /v1/auth/refresh: xoay vòng refresh token
  server.post('/refresh', async (req, reply) => {
    const body = parseOr400(AuthRefreshRequestSchema, req.body, reply);
    if (!body) return reply;
    const d = await db.get();
    const tokens = await rotateRefreshToken(server, d, body.refreshToken);
    if (!tokens) {
      // Tài khoản đã bị xóa (ở máy khác): báo riêng để client xóa dữ liệu trên máy thay vì tạo khách mới
      const deleted = await isDeletedCredential(d, sha256(body.refreshToken));
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
    if (!user) {
      const deleted = await isDeletedCredential(d, sha256(body.recoveryCode));
      return reply.status(401).send({ error: deleted ? 'account_deleted' : 'invalid_recovery_code' });
    }
    return respond(AuthTokensSchema, await issueTokens(server, d, user.id));
  });
};
