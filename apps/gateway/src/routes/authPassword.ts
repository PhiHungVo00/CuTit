import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import {
  AuthPasswordLoginRequestSchema,
  AuthRegisterRequestSchema,
  AuthRegisterResponseSchema,
  AuthSignedInSchema,
  BackupCodeResponseSchema,
  PasswordForgotRequestSchema,
  PasswordResetWithBackupRequestSchema,
  PasswordResetWithEmailRequestSchema
} from '@vietlearning/contracts/api';
import type { RouteDeps } from '../app.js';
import { schema, type Db } from '../db/client.js';
import { parseOr400, respond } from '../lib/validate.js';
import { GatewayError } from '../pipeline/RequestPipeline.js';
import { AuditLog } from '../services/audit/audit.js';
import {
  findPasswordAccount,
  findRecoveryTarget,
  isUsernameReserved,
  revokeAllRefreshTokens,
  signedIn,
  uniqueViolation
} from '../services/auth/accounts.js';
import { OtpService } from '../services/auth/otp.js';
import { burnPasswordCheck, hashPassword, isWeakPassword, verifyPassword } from '../services/auth/password.js';
import { RateCounters } from '../services/auth/rateCounter.js';
import { formatRecoveryCode, newRecoveryCode, sha256 } from '../services/auth/tokens.js';
import { refundMailQuota, tryConsumeMailQuota } from '../services/mail/dailyCap.js';
import { otpEmail } from '../services/mail/templates.js';

/**
 * Dự án 3 Task 2 — luồng KHÔNG cần Bearer dưới /v1/auth (đăng ký nhận Bearer khách TÙY CHỌN):
 *   POST /register · /login · /password/forgot · /password/reset-email · /password/reset-backup
 * Spec docs/superpowers/specs/2026-11-21-dang-nhap-design.md mục 5.2–5.4 và 6.
 *
 * Giới hạn (spec 6 "Lộ tên và khóa tạm"; thêm vào giới hạn chung AUTH_RATE_LIMIT_PER_MINUTE theo IP của scope):
 * - sai đăng nhập / mã dự phòng: khóa cặp (IP, tên) sau 5 lần/15 phút; trần IP 30 lần/15 phút; một tên sai > 50 lần/giờ
 *   từ nhiều IP => làm chậm (không khóa, để kẻ xấu không khóa được tài khoản người khác).
 * - gửi mã: mỗi email 3 thư/15 phút, mỗi IP 10 thư/giờ, trần cả app MAIL_DAILY_CAP; sai mã: 5 lần mỗi mã, 10 lần mỗi
 *   tên/email đã gõ mỗi ngày => otp_locked. Khóa gắn email và đặt lại mật khẩu tách riêng (xem `keys`).
 * Log/audit: KHÔNG bao giờ có mật khẩu, mã, tên đăng nhập hay email (bộ đếm lưu HMAC).
 */
const MIN = 60_000;
export const LOGIN_PAIR_MAX = 5;
export const LOGIN_IP_MAX = 30;
export const LOGIN_USER_SLOW_AFTER = 50;
const LOGIN_WINDOW_MS = 15 * MIN;
const LOGIN_USER_WINDOW_MS = 60 * MIN;
export const OTP_SEND_EMAIL_MAX = 3;
const OTP_SEND_EMAIL_WINDOW_MS = 15 * MIN;
export const OTP_SEND_IP_MAX = 10;
const OTP_SEND_IP_WINDOW_MS = 60 * MIN;
export const OTP_FAIL_EMAIL_MAX = 10;
const OTP_FAIL_EMAIL_WINDOW_MS = 24 * 60 * MIN;

const keys = {
  pair: (ip: string, username: string) => `login:pair:${ip}|${username}`,
  ip: (ip: string) => `login:ip:${ip}`,
  user: (username: string) => `login:user:${username}`,
  /**
   * Khóa OTP tách theo MỤC ĐÍCH: lượt gửi/sai của luồng gắn email (/v1/me/email/*, ai đăng nhập cũng gọi được với email
   * bất kỳ) KHÔNG dùng chung với luồng đặt lại mật khẩu => không ai khóa/đốt lượt quên mật khẩu của người khác được.
   */
  sendReset: (email: string) => `otp_send:reset:${email}`,
  sendLink: (email: string) => `otp_send:link:${email}`,
  sendIp: (ip: string) => `otp_send:ip:${ip}`,
  /** theo đúng chuỗi người gọi gõ (chuẩn hóa) => tài khoản có thật hay không đều bị khóa như nhau */
  failReset: (typed: string) => `otp_fail:reset:${typed}`,
  failLink: (userId: string, email: string) => `otp_fail:link:${userId}:${email}`
};
export { keys as authKeys };

/** Thân lỗi cố định (không có `message`) => sai tên và sai mật khẩu trả về GIỐNG HỆT nhau */
const INVALID_CREDENTIALS = { error: 'invalid_credentials' } as const;
const RATE_LIMITED = { error: 'rate_limited' } as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Bearer khách tùy chọn ở /register (scope /v1/auth không có hook xác thực) */
async function bearerUserId(req: FastifyRequest): Promise<string | null | 'invalid'> {
  if (!req.headers.authorization) return null;
  if (!req.headers.authorization.startsWith('Bearer ')) return 'invalid';
  try {
    const payload = await req.jwtVerify<{ sub?: string; typ?: string }>();
    return payload.sub && payload.typ === 'access' ? payload.sub : 'invalid';
  } catch {
    return 'invalid';
  }
}

/** Thông tin gửi mã đặt lại mật khẩu (chạy NỀN sau khi đã trả 202 => thời gian phản hồi không lộ tài khoản có tồn tại) */
async function sendResetCode(server: FastifyInstance, deps: RouteDeps, otp: OtpService, counters: RateCounters, usernameOrEmail: string, ip: string): Promise<void> {
  const { db, mail, config, audit, clock } = deps;
  const d = await db.get();
  const now = clock();
  if ((await counters.hit(d, keys.sendIp(ip), OTP_SEND_IP_WINDOW_MS, now)) > OTP_SEND_IP_MAX) return;
  const target = await findRecoveryTarget(d, usernameOrEmail);
  if (!target || !mail.available()) return;
  if ((await counters.hit(d, keys.sendReset(target.email), OTP_SEND_EMAIL_WINDOW_MS, now)) > OTP_SEND_EMAIL_MAX) return;
  if (!(await tryConsumeMailQuota(d, config.MAIL_DAILY_CAP, now))) {
    audit.record('auth.email_code_failed', { outcome: 'blocked', userId: target.userId, metadata: { purpose: 'reset', reason: 'daily_cap' } });
    return;
  }
  const code = await otp.issue(d, 'reset', target.email, target.userId, now);
  const msg = otpEmail(code, 'reset');
  try {
    await mail.send(target.email, msg.subjectVi, msg.subjectEn, msg.body);
    audit.record('auth.email_code_sent', { outcome: 'success', userId: target.userId, metadata: { purpose: 'reset' } });
  } catch {
    await refundMailQuota(d, now).catch(() => undefined);
    server.log.warn({ mail: mail.name }, 'gửi mã đặt lại mật khẩu thất bại');
    audit.record('auth.email_code_failed', { outcome: 'failure', userId: target.userId, metadata: { purpose: 'reset', reason: 'send_failed' } });
  }
}

export const passwordAuthRoutes: FastifyPluginAsync<RouteDeps> = async (server, deps) => {
  const { db, audit, config, clock, pipeline } = deps;
  const pepper = config.AUTH_OTP_PEPPER ?? '';
  const otp = new OtpService(pepper);
  const counters = new RateCounters(pepper);

  // ---------- POST /v1/auth/register ----------
  server.post('/register', async (req, reply) => {
    const bearer = await bearerUserId(req);
    if (bearer === 'invalid') return reply.status(401).send({ error: 'invalid_token' });
    const body = parseOr400(AuthRegisterRequestSchema, req.body, reply);
    if (!body) return reply;
    const { username, password } = body;
    if (isWeakPassword(password, username)) return reply.status(400).send({ error: 'weak_password' });
    const d = await db.get();
    const now = clock();
    const ctx = AuditLog.context(req);
    // Kiểm sớm (rẻ) trước khi băm; unique (provider, subject) vẫn là chốt chặn cuối khi hai request chạy đồng thời
    if ((await isUsernameReserved(d, username, now)) || (await findPasswordAccount(d, username))) {
      return reply.status(409).send({ error: 'username_taken' });
    }
    // Băm NGOÀI transaction (PGlite chỉ một kết nối; argon2 ~50 ms)
    const passwordHash = await hashPassword(password);
    const backupCode = newRecoveryCode();
    let userId: string;
    try {
      userId = await d.transaction(async (tx) => {
        let id: string;
        let oldRecoveryHash: string | null = null;
        if (bearer) {
          const [user] = await tx
            .select({ id: schema.users.id, isGuest: schema.users.isGuest, recoveryCodeHash: schema.users.recoveryCodeHash })
            .from(schema.users)
            .where(and(eq(schema.users.id, bearer), isNull(schema.users.deletedAt)))
            .for('update');
          if (!user) throw new GatewayError(401, 'account_deleted');
          if (!user.isGuest) throw new GatewayError(409, 'account_upgraded', 'Phiên này đã là tài khoản');
          id = user.id;
          oldRecoveryHash = user.recoveryCodeHash;
        } else {
          const [created] = await tx.insert(schema.users).values({ isGuest: false }).returning({ id: schema.users.id });
          id = created.id;
        }
        if (await isUsernameReserved(tx as unknown as Db, username, now)) throw new GatewayError(409, 'username_taken');
        await tx.insert(schema.identities).values({ userId: id, provider: 'password', subject: username, display: username, lastUsedAt: now });
        await tx.insert(schema.passwordCredentials).values({ userId: id, passwordHash, backupCodeHash: sha256(backupCode), updatedAt: now });
        if (bearer) {
          // Nâng cấp khách giữ nguyên users.id; mã khôi phục (nằm nguyên văn trên máy, tự dùng) bị tắt và vào bia mộ
          // 'upgraded' giữ mãi (expires_at NULL) => máy khác còn mã nhận account_upgraded thay vì tạo khách mới
          await tx.update(schema.users).set({ isGuest: false, recoveryCodeHash: null }).where(eq(schema.users.id, id));
          if (oldRecoveryHash) {
            await tx
              .insert(schema.deletedAccounts)
              .values({ credentialHash: oldRecoveryHash, deletedAt: now, reason: 'upgraded', expiresAt: null })
              .onConflictDoNothing();
          }
        }
        return id;
      });
    } catch (err) {
      const dup = uniqueViolation(err);
      if (dup) {
        const upgradedMeanwhile = dup.constraint === 'identities_user_provider_uq' || dup.constraint === 'password_credentials_pkey';
        return reply.status(409).send({ error: upgradedMeanwhile ? 'account_upgraded' : 'username_taken' });
      }
      throw err;
    }
    pipeline.forgetUser(userId);
    audit.record('auth.register', { outcome: 'success', userId, ctx, metadata: { upgraded: Boolean(bearer) } });
    const signed = await signedIn(server, d, userId, now);
    return respond(AuthRegisterResponseSchema, { ...signed, backupCode: formatRecoveryCode(backupCode) });
  });

  /** Khóa tạm theo (IP, tên) / trần IP: true = đang bị khóa (KHÔNG kiểm mật khẩu) */
  async function loginLocked(d: Db, ip: string, username: string, now: Date): Promise<boolean> {
    const [pair, byIp] = await Promise.all([counters.count(d, keys.pair(ip, username), now), counters.count(d, keys.ip(ip), now)]);
    return pair >= LOGIN_PAIR_MAX || byIp >= LOGIN_IP_MAX;
  }

  async function loginFailed(d: Db, ip: string, username: string, now: Date): Promise<void> {
    await counters.hit(d, keys.pair(ip, username), LOGIN_WINDOW_MS, now);
    await counters.hit(d, keys.ip(ip), LOGIN_WINDOW_MS, now);
    await counters.hit(d, keys.user(username), LOGIN_USER_WINDOW_MS, now);
  }

  // ---------- POST /v1/auth/login ----------
  server.post('/login', async (req, reply) => {
    const body = parseOr400(AuthPasswordLoginRequestSchema, req.body, reply);
    if (!body) return reply;
    const d = await db.get();
    const now = clock();
    const ctx = AuditLog.context(req);
    if (await loginLocked(d, req.ip, body.username, now)) {
      audit.noteRateLimited(ctx, '/v1/auth/login');
      return reply.status(429).send(RATE_LIMITED);
    }
    if ((await counters.count(d, keys.user(body.username), now)) > LOGIN_USER_SLOW_AFTER) await sleep(config.AUTH_LOGIN_SLOWDOWN_MS);
    const account = await findPasswordAccount(d, body.username);
    const ok = account ? await verifyPassword(account.passwordHash, body.password) : (await burnPasswordCheck(body.password), false);
    if (!account || !ok) {
      await loginFailed(d, req.ip, body.username, now);
      audit.record('auth.signin', { outcome: 'failure', ctx, metadata: { provider: 'password', reason: 'invalid_credentials' } });
      audit.noteAuthFailure(ctx, 'invalid_credentials');
      return reply.status(401).send(INVALID_CREDENTIALS);
    }
    await counters.clear(d, keys.pair(req.ip, body.username));
    await d
      .update(schema.identities)
      .set({ lastUsedAt: now })
      .where(and(eq(schema.identities.provider, 'password'), eq(schema.identities.subject, body.username)));
    audit.record('auth.signin', { outcome: 'success', userId: account.userId, ctx, metadata: { provider: 'password' } });
    return respond(AuthSignedInSchema, await signedIn(server, d, account.userId, now));
  });

  // ---------- POST /v1/auth/password/forgot — LUÔN 202, gửi nền ----------
  server.post('/password/forgot', async (req, reply) => {
    const body = parseOr400(PasswordForgotRequestSchema, req.body, reply);
    if (!body) return reply;
    void sendResetCode(server, deps, otp, counters, body.usernameOrEmail, req.ip).catch((err: unknown) =>
      server.log.warn({ err: (err as Error)?.message }, 'password/forgot background failed')
    );
    return reply.status(202).send({});
  });

  // ---------- POST /v1/auth/password/reset-email ----------
  server.post('/password/reset-email', async (req, reply) => {
    const body = parseOr400(PasswordResetWithEmailRequestSchema, req.body, reply);
    if (!body) return reply;
    const d = await db.get();
    const now = clock();
    const ctx = AuditLog.context(req);
    // Mọi kiểm tra TRƯỚC khi tra tài khoản chỉ dựa trên chuỗi người gọi gõ => phản hồi giống hệt nhau dù tài khoản có thật
    // hay không (không lộ qua weak_password / otp_locked)
    const typed = body.usernameOrEmail.normalize('NFC').toLowerCase();
    const failKey = keys.failReset(typed);
    if ((await counters.count(d, failKey, now)) >= OTP_FAIL_EMAIL_MAX) return reply.status(400).send({ error: 'otp_locked' });
    // Mật khẩu yếu kiểm TRƯỚC khi dùng mã (không đốt mã chỉ vì chọn mật khẩu yếu); "chứa tên" so với tên/phần trước @ đã gõ
    if (isWeakPassword(body.newPassword, typed.includes('@') ? typed.slice(0, typed.lastIndexOf('@')) : typed)) {
      return reply.status(400).send({ error: 'weak_password' });
    }
    const target = await findRecoveryTarget(d, body.usernameOrEmail);
    const result = target ? await otp.verify(d, 'reset', target.email, body.code, target.userId, now) : 'invalid';
    if (!target || result !== 'ok') {
      await counters.hit(d, failKey, OTP_FAIL_EMAIL_WINDOW_MS, now);
      audit.record('auth.password_reset', { outcome: 'failure', userId: target?.userId ?? null, ctx, metadata: { method: 'email', reason: `otp_${result}` } });
      // Luôn otp_invalid ra ngoài: chỉ tài khoản CÓ mã đang chờ mới ra được otp_locked/otp_expired => lộ tài khoản nào tồn
      // tại sau /forgot (rà kien-truc RA-DOT2). Khóa 10 lần/ngày theo chuỗi đã gõ (ở trên) vẫn trả otp_locked như nhau.
      return reply.status(400).send({ error: 'otp_invalid' });
    }
    // Đúng mã rồi mới so với tên đăng nhập thật (người gõ email): mã đã dùng, xin mã mới
    if (isWeakPassword(body.newPassword, target.username)) return reply.status(400).send({ error: 'weak_password' });
    const passwordHash = await hashPassword(body.newPassword);
    await d.transaction(async (tx) => {
      await tx.update(schema.passwordCredentials).set({ passwordHash, updatedAt: now }).where(eq(schema.passwordCredentials.userId, target.userId));
      await revokeAllRefreshTokens(tx as unknown as Db, target.userId, now);
    });
    await counters.clear(d, failKey);
    audit.record('auth.password_reset', { outcome: 'success', userId: target.userId, ctx, metadata: { method: 'email' } });
    return reply.status(204).send();
  });

  // ---------- POST /v1/auth/password/reset-backup → mã dự phòng MỚI ----------
  server.post('/password/reset-backup', async (req, reply) => {
    const body = parseOr400(PasswordResetWithBackupRequestSchema, req.body, reply);
    if (!body) return reply;
    const d = await db.get();
    const now = clock();
    const ctx = AuditLog.context(req);
    if (await loginLocked(d, req.ip, body.username, now)) {
      audit.noteRateLimited(ctx, '/v1/auth/password/reset-backup');
      return reply.status(429).send(RATE_LIMITED);
    }
    const account = await findPasswordAccount(d, body.username);
    const oldHash = sha256(body.backupCode);
    const fail = async () => {
      await loginFailed(d, req.ip, body.username, now);
      audit.record('auth.password_reset', { outcome: 'failure', ctx, metadata: { method: 'backup', reason: 'invalid_credentials' } });
      audit.noteAuthFailure(ctx, 'invalid_credentials');
      return reply.status(401).send(INVALID_CREDENTIALS);
    };
    if (!account || account.backupCodeHash !== oldHash) return fail();
    if (isWeakPassword(body.newPassword, account.username)) return reply.status(400).send({ error: 'weak_password' });
    const passwordHash = await hashPassword(body.newPassword);
    const fresh = newRecoveryCode();
    // Đổi mã CÓ ĐIỀU KIỆN (còn đúng mã cũ) => hai request đồng thời cùng một mã chỉ một cái thành công
    const swapped = await d.transaction(async (tx) => {
      const rows = await tx
        .update(schema.passwordCredentials)
        .set({ passwordHash, backupCodeHash: sha256(fresh), updatedAt: now })
        .where(and(eq(schema.passwordCredentials.userId, account.userId), eq(schema.passwordCredentials.backupCodeHash, oldHash)))
        .returning({ userId: schema.passwordCredentials.userId });
      if (!rows.length) return false;
      await revokeAllRefreshTokens(tx as unknown as Db, account.userId, now);
      return true;
    });
    if (!swapped) return fail();
    await counters.clear(d, keys.pair(req.ip, body.username));
    audit.record('auth.password_reset', { outcome: 'success', userId: account.userId, ctx, metadata: { method: 'backup' } });
    return respond(BackupCodeResponseSchema, { backupCode: formatRecoveryCode(fresh) });
  });
};
