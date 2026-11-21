import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  AuthErrorCode,
  AuthGoogleRequestSchema,
  AuthNonceResponseSchema,
  AuthSignInResponseSchema,
  IdentityListResponseSchema
} from '@vietlearning/contracts/api';
import type { RouteDeps } from '../app.js';
import type { Db } from '../db/client.js';
import { parseOr400, respond } from '../lib/validate.js';
import { requireUserId } from '../pipeline/RequestPipeline.js';
import { IdentityTokenError, IdentityUnavailableError, type VerifiedIdentity } from '../providers/identity.js';
import { consumeNonce, deleteAtOf, issueNonce, linkGoogle, listIdentities, providersOf, signInWithGoogle, unlinkIdentity } from '../services/auth/link.js';
import { issueTokens } from '../services/auth/tokens.js';
import { AuditLog } from '../services/audit/audit.js';

/**
 * Dự án 3 Task 3 — đăng nhập Google + liên kết/gỡ danh tính.
 * - `identityAuthRoutes` (scope /v1/auth, KHÔNG Bearer, giới hạn theo IP): GET /nonce, POST /google.
 * - `identityRoutes` (scope /v1, có Bearer): POST /me/identities/google, GET /me/identities, DELETE /me/identities/:id.
 * Google chưa cấu hình (thiếu GOOGLE_WEB_CLIENT_ID) => 503 `provider_unavailable`, không sập.
 * Không ghi ID token / email vào log.
 */

/** Đề xuất A8: /v1/me/identities/* mỗi người dùng tối đa 5 lần/giờ mỗi route (ngoài giới hạn chung của /v1) */
const IDENTITY_RATE = { rateLimit: { max: 5, timeWindow: '1 hour' } };

type Verify = { ok: true; v: VerifiedIdentity } | { ok: false };

/** Kiểm token (chữ ký/aud/iss/exp/nonce/email_verified) rồi tiêu nonce một lần. Lỗi => đã gửi reply. */
async function verifyGoogle(deps: RouteDeps, db: Db, body: { idToken: string; nonce: string }, reply: FastifyReply, ctx: ReturnType<typeof AuditLog.context>): Promise<Verify> {
  const provider = deps.identity;
  if (!provider) {
    reply.status(503).send({ error: AuthErrorCode.providerUnavailable, message: 'Google sign-in is not configured' });
    return { ok: false };
  }
  let v: VerifiedIdentity;
  try {
    v = await provider.verify(body.idToken, body.nonce);
  } catch (err) {
    if (err instanceof IdentityUnavailableError) {
      reply.status(503).send({ error: AuthErrorCode.providerUnavailable });
      return { ok: false };
    }
    if (err instanceof IdentityTokenError) {
      deps.audit.noteAuthFailure(ctx, 'invalid_id_token');
      reply.status(401).send({ error: AuthErrorCode.invalidCredentials });
      return { ok: false };
    }
    throw err;
  }
  if (!(await consumeNonce(db, body.nonce))) {
    deps.audit.noteAuthFailure(ctx, 'invalid_nonce');
    reply.status(401).send({ error: AuthErrorCode.invalidCredentials });
    return { ok: false };
  }
  return { ok: true, v };
}

async function signedIn(server: Parameters<FastifyPluginAsync>[0], db: Db, userId: string) {
  const tokens = await issueTokens(server, db, userId);
  const deleteAt = await deleteAtOf(db, userId);
  return respond(AuthSignInResponseSchema, {
    status: 'signed_in',
    ...tokens,
    isGuest: false,
    providers: await providersOf(db, userId),
    ...(deleteAt ? { restorable: { deleteAt: deleteAt.toISOString() } } : {})
  });
}

export const identityAuthRoutes: FastifyPluginAsync<RouteDeps> = async (server, deps) => {
  // GET /v1/auth/nonce: nonce một lần (10 phút) cho Google — client đưa vào yêu cầu đăng nhập, Google ký vào ID token
  server.get('/nonce', async () => respond(AuthNonceResponseSchema, await issueNonce(await deps.db.get())));

  // POST /v1/auth/google: đăng nhập/đăng ký bằng Google (không Bearer). Máy đang có khách dùng /v1/me/identities/google.
  server.post('/google', async (req, reply) => {
    const body = parseOr400(AuthGoogleRequestSchema, req.body, reply);
    if (!body) return reply;
    const d = await deps.db.get();
    const r = await verifyGoogle(deps, d, body, reply, AuditLog.context(req));
    if (!r.ok) return reply;
    const { userId } = await signInWithGoogle(d, r.v);
    return signedIn(server, d, userId);
  });
};

const IdParamsSchema = z.object({ id: z.string().uuid() });

export const identityRoutes: FastifyPluginAsync<RouteDeps> = async (server, deps) => {
  const { db, pipeline } = deps;

  // POST /v1/me/identities/google: nâng cấp khách / liên kết thêm / đăng nhập tài khoản có sẵn (khách rỗng) / vé gộp
  server.post('/me/identities/google', { config: IDENTITY_RATE }, async (req, reply) => {
    const userId = requireUserId(req);
    const body = parseOr400(AuthGoogleRequestSchema, req.body, reply);
    if (!body) return reply;
    const d = await db.get();
    const r = await verifyGoogle(deps, d, body, reply, AuditLog.context(req));
    if (!r.ok) return reply;
    const res = await linkGoogle(d, userId, r.v);
    switch (res.kind) {
      case 'identity_in_use':
        return reply.status(409).send({ error: AuthErrorCode.identityInUse });
      case 'needs_merge':
        return respond(AuthSignInResponseSchema, {
          status: 'needs_merge',
          mergeTicket: res.mergeTicket,
          target: { createdAt: res.targetCreatedAt.toISOString(), hasProgress: true }
        });
      case 'switched':
        pipeline.forgetUser(res.removedGuestId); // access token của khách đã xóa bị từ chối ngay
        return signedIn(server, d, res.userId);
      case 'linked':
        return signedIn(server, d, res.userId);
    }
  });

  server.get('/me/identities', async (req) => {
    const userId = requireUserId(req);
    return respond(IdentityListResponseSchema, { identities: await listIdentities(await db.get(), userId) });
  });

  server.delete('/me/identities/:id', { config: IDENTITY_RATE }, async (req, reply) => {
    const userId = requireUserId(req);
    const params = parseOr400(IdParamsSchema, req.params, reply);
    if (!params) return reply;
    const d = await db.get();
    const res = await unlinkIdentity(d, userId, params.id);
    if (res.kind === 'not_found') return reply.status(404).send({ error: 'not_found' });
    if (res.kind === 'last_identity') return reply.status(409).send({ error: AuthErrorCode.lastIdentity });
    return respond(IdentityListResponseSchema, { identities: await listIdentities(d, userId) });
  });
};
