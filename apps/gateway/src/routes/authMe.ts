import type { FastifyPluginAsync } from 'fastify';
import { and, eq } from 'drizzle-orm';
import {
  AuthTokensSchema,
  BackupCodeResponseSchema,
  EmailStartRequestSchema,
  EmailVerifyRequestSchema,
  IdentityListResponseSchema,
  PasswordChangeRequestSchema
} from '@vietlearning/contracts/api';
import type { RouteDeps } from '../app.js';
import { schema, type Db } from '../db/client.js';
import { parseOr400, respond } from '../lib/validate.js';
import { requireUserId } from '../pipeline/RequestPipeline.js';
import { AuditLog } from '../services/audit/audit.js';
import { maskEmail, passwordAccountOf, revokeAllRefreshTokens, uniqueViolation } from '../services/auth/accounts.js';
import { OtpService } from '../services/auth/otp.js';
import { hashPassword, isWeakPassword, verifyPassword } from '../services/auth/password.js';
import { RateCounters } from '../services/auth/rateCounter.js';
import { formatRecoveryCode, issueTokens, newRecoveryCode, sha256 } from '../services/auth/tokens.js';
import { refundMailQuota, tryConsumeMailQuota } from '../services/mail/dailyCap.js';
import { otpEmail } from '../services/mail/templates.js';
import { OTP_FAIL_EMAIL_MAX, OTP_SEND_EMAIL_MAX, OTP_SEND_IP_MAX } from './authPassword.js';

/**
 * Dự án 3 Task 2 — luồng CÓ Bearer (scope /v1: hook xác thực + giới hạn theo người dùng):
 *   POST /v1/me/password (đổi) · /v1/me/email/start · /v1/me/email/verify · /v1/me/backup-code (tạo mới)
 * Tách khỏi routes/me.ts (Task 4) và routes/identities.ts (Task 3) để ba phiên song song không sửa chung một tệp.
 * Email gắn vào CHỈ để lấy lại mật khẩu (spec 6) => cần tài khoản có mật khẩu (`password_required`).
 */
const MIN = 60_000;
const PASSWORD_REQUIRED = { error: 'password_required' } as const;

export const authMeRoutes: FastifyPluginAsync<RouteDeps> = async (server, { db, audit, config, clock, mail }) => {
  const pepper = config.AUTH_OTP_PEPPER ?? '';
  const otp = new OtpService(pepper);
  const counters = new RateCounters(pepper);
  /** Đoán mật khẩu cũ / gửi thư / nhập mã: 10 lần mỗi phút mỗi người (ngoài giới hạn chung của /v1 và bộ đếm OTP riêng) */
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  // ---------- POST /v1/me/password: đổi mật khẩu => thu hồi mọi refresh token, trả token mới cho máy này ----------
  server.post('/me/password', strict, async (req, reply) => {
    const userId = requireUserId(req);
    const body = parseOr400(PasswordChangeRequestSchema, req.body, reply);
    if (!body) return reply;
    const d = await db.get();
    const now = clock();
    const ctx = AuditLog.context(req);
    const account = await passwordAccountOf(d, userId);
    if (!account || !(await verifyPassword(account.passwordHash, body.currentPassword))) {
      audit.record('auth.password_changed', { outcome: 'failure', userId, ctx });
      audit.noteAuthFailure(ctx, 'invalid_credentials');
      return reply.status(401).send({ error: 'invalid_credentials' });
    }
    if (isWeakPassword(body.newPassword, account.username)) return reply.status(400).send({ error: 'weak_password' });
    const passwordHash = await hashPassword(body.newPassword);
    await d.transaction(async (tx) => {
      await tx.update(schema.passwordCredentials).set({ passwordHash, updatedAt: now }).where(eq(schema.passwordCredentials.userId, userId));
      await revokeAllRefreshTokens(tx as unknown as Db, userId, now);
    });
    audit.record('auth.password_changed', { outcome: 'success', userId, ctx });
    return respond(AuthTokensSchema, await issueTokens(server, d, userId, now));
  });

  // ---------- POST /v1/me/email/start (202): gửi mã xác minh — KHÔNG báo email đã thuộc ai (chỉ báo sau khi đúng mã) ----------
  server.post('/me/email/start', strict, async (req, reply) => {
    const userId = requireUserId(req);
    const body = parseOr400(EmailStartRequestSchema, req.body, reply);
    if (!body) return reply;
    const d = await db.get();
    const now = clock();
    if (!(await passwordAccountOf(d, userId))) return reply.status(409).send(PASSWORD_REQUIRED);
    if (!mail.available()) return reply.status(503).send({ error: 'provider_unavailable' });
    if ((await counters.hit(d, `otp_send:email:${body.email}`, 15 * MIN, now)) > OTP_SEND_EMAIL_MAX) return reply.status(429).send({ error: 'rate_limited' });
    if ((await counters.hit(d, `otp_send:ip:${req.ip}`, 60 * MIN, now)) > OTP_SEND_IP_MAX) return reply.status(429).send({ error: 'rate_limited' });
    if (!(await tryConsumeMailQuota(d, config.MAIL_DAILY_CAP, now))) {
      audit.record('auth.email_code_failed', { outcome: 'blocked', userId, metadata: { purpose: 'link', reason: 'daily_cap' } });
      return reply.status(503).send({ error: 'provider_unavailable' });
    }
    const code = await otp.issue(d, 'link', body.email, userId, now);
    const msg = otpEmail(code, 'link');
    try {
      await mail.send(body.email, msg.subjectVi, msg.subjectEn, msg.body);
    } catch {
      await refundMailQuota(d, now).catch(() => undefined);
      req.log.warn({ mail: mail.name }, 'gửi mã xác minh email thất bại');
      audit.record('auth.email_code_failed', { outcome: 'failure', userId, metadata: { purpose: 'link', reason: 'send_failed' } });
      return reply.status(503).send({ error: 'provider_unavailable' });
    }
    audit.record('auth.email_code_sent', { outcome: 'success', userId, metadata: { purpose: 'link' } });
    return reply.status(202).send({});
  });

  // ---------- POST /v1/me/email/verify → danh sách phương thức (email đã che) ----------
  server.post('/me/email/verify', strict, async (req, reply) => {
    const userId = requireUserId(req);
    const body = parseOr400(EmailVerifyRequestSchema, req.body, reply);
    if (!body) return reply;
    const d = await db.get();
    const now = clock();
    const ctx = AuditLog.context(req);
    const failKey = `otp_fail:email:${body.email}`;
    if ((await counters.count(d, failKey, now)) >= OTP_FAIL_EMAIL_MAX) return reply.status(400).send({ error: 'otp_locked' });
    const result = await otp.verify(d, 'link', body.email, body.code, userId, now);
    if (result !== 'ok') {
      await counters.hit(d, failKey, 24 * 60 * MIN, now);
      audit.record('auth.email_code_failed', { outcome: 'failure', userId, ctx, metadata: { purpose: 'link', reason: `otp_${result}` } });
      return reply.status(400).send({ error: `otp_${result}` });
    }
    const i = schema.identities;
    try {
      const outcome = await d.transaction(async (tx) => {
        const [owner] = await tx
          .select({ userId: i.userId })
          .from(i)
          .where(and(eq(i.provider, 'email'), eq(i.subject, body.email)));
        if (owner && owner.userId !== userId) return 'in_use' as const;
        if (owner) return 'same' as const;
        const values = { subject: body.email, display: maskEmail(body.email), emailVerified: true, lastUsedAt: now };
        // Mỗi người một email (unique user_id, provider): đã có email cũ => thay
        const updated = await tx
          .update(i)
          .set(values)
          .where(and(eq(i.userId, userId), eq(i.provider, 'email')))
          .returning({ id: i.id });
        if (!updated.length) await tx.insert(i).values({ userId, provider: 'email', ...values });
        return 'linked' as const;
      });
      if (outcome === 'in_use') return reply.status(409).send({ error: 'identity_in_use' });
    } catch (err) {
      if (uniqueViolation(err)) return reply.status(409).send({ error: 'identity_in_use' });
      throw err;
    }
    await counters.clear(d, failKey);
    audit.record('auth.identity_linked', { outcome: 'success', userId, ctx, metadata: { provider: 'email' } });
    const rows = await d.select({ id: i.id, provider: i.provider, display: i.display, subject: i.subject }).from(i).where(eq(i.userId, userId));
    return respond(IdentityListResponseSchema, {
      identities: rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        // display NULL được phép ở DB (lưu ý 5 kien-truc) => che từ subject; Google không bao giờ lộ `sub`
        display: r.display ?? (r.provider === 'email' ? maskEmail(r.subject) : r.provider === 'password' ? r.subject : 'Google')
      }))
    });
  });

  // ---------- POST /v1/me/backup-code: tạo mã dự phòng mới (mã cũ hết hiệu lực) — chỉ tài khoản có mật khẩu ----------
  server.post('/me/backup-code', strict, async (req, reply) => {
    const userId = requireUserId(req);
    const d = await db.get();
    const now = clock();
    const fresh = newRecoveryCode();
    const rows = await d
      .update(schema.passwordCredentials)
      .set({ backupCodeHash: sha256(fresh), updatedAt: now })
      .where(eq(schema.passwordCredentials.userId, userId))
      .returning({ userId: schema.passwordCredentials.userId });
    if (!rows.length) return reply.status(409).send(PASSWORD_REQUIRED);
    audit.record('auth.backup_code_rotated', { outcome: 'success', userId, ctx: AuditLog.context(req) });
    return respond(BackupCodeResponseSchema, { backupCode: formatRecoveryCode(fresh) });
  });
};
