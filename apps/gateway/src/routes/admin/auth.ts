import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  AdminEnrollRequestSchema,
  AdminEnrollResponseSchema,
  AdminErrorCode,
  AdminLoginRequestSchema,
  AdminLoginResponseSchema,
  AdminSessionSchema,
  AdminTotpConfirmResponseSchema,
  AdminTotpConfirmSchema,
  AdminTotpRequestSchema
} from '@vietlearning/contracts/api';
import type { RouteDeps } from '../../app.js';
import { schema, type Db } from '../../db/client.js';
import { parseOr400, respond } from '../../lib/validate.js';
import { AuditLog } from '../../services/audit/audit.js';
import { passwordAccountOf, findPasswordAccount } from '../../services/auth/accounts.js';
import { burnPasswordCheck, verifyPassword } from '../../services/auth/password.js';
import { RateCounters } from '../../services/auth/rateCounter.js';
import type { AdminAlerts } from '../../services/admin/alerts.js';
import { insertAdminAudit, withAdminAudit } from '../../services/admin/audit.js';
import type { AdminCrypto } from '../../services/admin/crypto.js';
import { getRoles } from '../../services/admin/roles.js';
import { adminRateKeys } from '../../services/admin/rateKeys.js';
import { consumeInvite, hasLiveInvite, inviteMatches } from '../../services/admin/invite.js';
import {
  ADMIN_ACCESS_TTL_S,
  accountUsable,
  createSession,
  readRefreshCookie,
  refreshCookie,
  revokeAllSessions,
  revokeSessionByRefresh,
  rotateSession,
  signAccess,
  signTicket,
  verifyTicket,
  type AdminKey,
  type TicketNext
} from '../../services/admin/sessions.js';
import { confirmTotp, consumeBackupCode, enrollTotp, getTotpRow, verifyTotpCode, type TotpRow } from '../../services/admin/totp.js';

/**
 * Dự án 5a Task 4 — `POST /admin/v1/auth/{login, totp/enroll, totp/confirm, totp, refresh, logout}` (spec §5.4).
 * Luồng: login (mật khẩu) → vé 5 phút → (next=enroll: totp/enroll → totp/confirm) | (next=totp: totp) → phiên.
 *
 * Quyết định an ninh (đọc kèm PR):
 * - Sai mật khẩu, tên không tồn tại và "đúng mật khẩu nhưng không có vai trò" trả MỘT thân lỗi duy nhất, cùng bộ đếm giới hạn,
 *   cùng việc băm argon2 (tên không có thì băm giả), không đặt cookie; nhật ký sai chạy nền và chỉ ghi khi là nhân sự (người ngoài không thấy chênh lệch).
 * - Giới hạn: 5 lần sai / 15 phút, theo IP và theo tên (bước mật khẩu) hoặc theo IP và theo tài khoản (bước mã 6 số). ĐẾM TRƯỚC, nguyên tử
 *   (RateCounters.hit rồi mới kiểm ngưỡng), thành công thì trả lại lượt. Hệ quả có chủ đích theo spec: ai cũng có thể làm tên chủ app bị khóa
 *   15 phút bằng cách gõ sai; cách gỡ là chờ hết cửa sổ hoặc dùng IP khác (trần IP chỉ tính lần sai).
 * - Vé chỉ là gợi ý bước: mỗi bước LUÔN đối chiếu lại DB (còn vai trò, trạng thái staff_totp) — đã xác nhận mã 6 số thì không bao giờ vào đường enroll.
 * - Đăng nhập thành công + nhật ký `auth.login` + phiên được tạo trong MỘT transaction.
 * - Đường dùng cookie (refresh/logout) từ chối Origin lạ (bổ sung cho SameSite=Strict + CORS chỉ ADMIN_ORIGIN).
 * Log/nhật ký: KHÔNG có mật khẩu, mã, tên đăng nhập, token.
 */
export interface AdminRouteDeps extends RouteDeps {
  adminCrypto: AdminCrypto;
  adminKey: AdminKey;
  adminAlerts: AdminAlerts;
}

const MIN = 60_000;
export const ADMIN_FAIL_MAX = 5;
const FAIL_WINDOW_MS = 15 * MIN;
const INVALID_CREDENTIALS = { error: AdminErrorCode.invalidCredentials } as const;
const TOTP_INVALID = { error: AdminErrorCode.totpInvalid } as const;
const RATE_LIMITED = { error: AdminErrorCode.rateLimited } as const;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** Ném bên trong transaction để hoàn tác khi mã sai */
class Rejected extends Error {}
/** Ném khi mã mời không còn (hết hạn/đã dùng) giữa enroll và confirm */
class InviteGone extends Error {}

/**
 * Dấu vết trạng thái TOTP đưa vào vé: đổi khi một lần đăng nhập/xác nhận thành công (bước đã dùng, số mã dự phòng) => vé cũ không tạo thêm phiên
 * (vé dùng một lần, rà kien-truc PR #50 mục 5). Lần nhập SAI không đổi gì nên vẫn thử lại được trong 5 phút (có giới hạn).
 */
export const ticketVer = (row: Pick<TotpRow, 'confirmedAt' | 'lastUsedStep' | 'backupHashes'> | null): string =>
  row ? `${row.confirmedAt ? 1 : 0}:${row.lastUsedStep}:${row.backupHashes.length}` : '0:0:0';

export const adminAuthRoutes: FastifyPluginAsync<AdminRouteDeps> = async (server, deps) => {
  const { db, config, clock, audit, adminCrypto: crypto, adminKey: key, adminAlerts: alerts } = deps;
  const counters = new RateCounters(config.AUTH_OTP_PEPPER ?? '');
  const ck = adminRateKeys;

  /** Đếm trước, nguyên tử. `blocked` = vượt ngưỡng (không kiểm bí mật); `justBlocked` = vừa vượt ở lần này (cảnh báo đúng một lần) */
  async function attempt(d: Db, keys: string[], now: Date): Promise<{ blocked: boolean; justBlocked: boolean }> {
    let blocked = false;
    let justBlocked = false;
    for (const k of keys) {
      const n = await counters.hit(d, k, FAIL_WINDOW_MS, now);
      if (n > ADMIN_FAIL_MAX) blocked = true;
      if (n === ADMIN_FAIL_MAX + 1) justBlocked = true;
    }
    return { blocked, justBlocked };
  }
  const refund = (d: Db, keys: string[]) => Promise.all(keys.map((k) => counters.unhit(d, k)));

  const meta = (req: FastifyRequest) => {
    const ctx = AuditLog.context(req);
    return { ipHash: ctx.ip ? audit.hashIp(ctx.ip) : null, userAgent: ctx.userAgent ?? null };
  };

  /** Kiểm vé ĐÚNG bước + đối chiếu lại DB. Gửi lỗi và trả null nếu không hợp lệ. */
  async function checkTicket(d: Db, ticket: string, expected: TicketNext, now: Date, reply: FastifyReply): Promise<{ userId: string } | null> {
    const v = await verifyTicket(key, ticket, now);
    if (!v) {
      void reply.status(401).send({ error: AdminErrorCode.ticketInvalid });
      return null;
    }
    if (v.next !== expected) {
      void reply.status(403).send({ error: AdminErrorCode.forbidden });
      return null;
    }
    if ((await getRoles(d, v.userId)).length === 0 || !(await accountUsable(d, v.userId))) {
      void reply.status(401).send({ error: AdminErrorCode.ticketInvalid });
      return null;
    }
    const row = await getTotpRow(d, v.userId);
    const state: TicketNext = row?.confirmedAt ? 'totp' : 'enroll';
    if (state !== expected) {
      void reply.status(403).send({ error: AdminErrorCode.forbidden });
      return null;
    }
    if (v.ver !== ticketVer(row)) {
      void reply.status(401).send({ error: AdminErrorCode.ticketInvalid });
      return null;
    }
    return { userId: v.userId };
  }

  const sessionBody = async (userId: string, sessionId: string, now: Date) => ({
    accessToken: await signAccess(key, userId, sessionId, now),
    expiresIn: ADMIN_ACCESS_TTL_S
  });

  const originAllowed = (req: FastifyRequest): boolean => {
    const o = req.headers.origin;
    return !o || o === config.ADMIN_ORIGIN;
  };

  // ---------- POST /admin/v1/auth/login ----------
  server.post('/login', async (req, reply) => {
    const body = parseOr400(AdminLoginRequestSchema, req.body, reply);
    if (!body) return reply;
    const d = await db.get();
    const now = clock();
    const username = body.username.toLowerCase();
    const keys = [ck.nameIp(req.ip), ck.name(username)];
    const gate = await attempt(d, keys, now);
    if (gate.blocked) {
      audit.noteRateLimited(AuditLog.context(req), '/admin/v1/auth/login');
      return reply.status(429).send(RATE_LIMITED);
    }
    const account = await findPasswordAccount(d, username);
    const ok = account ? await verifyPassword(account.passwordHash, body.password) : (await burnPasswordCheck(body.password), false);
    // Luôn đọc vai trò (tên không có => id rỗng) để mọi nhánh làm cùng số truy vấn
    const roles = await getRoles(d, account?.userId ?? NIL_UUID);
    const usable = account && ok && roles.length > 0 ? await accountUsable(d, account.userId) : false;
    if (!account || !ok || roles.length === 0 || !usable) {
      // Chỉ ghi nhật ký khi là nhân sự sai mật khẩu; chạy nền để thời gian phản hồi không lộ ai là nhân sự
      if (account && roles.length > 0 && !ok) {
        const m = meta(req);
        alerts.track(
          () => withAdminAudit(d, { actorUserId: account.userId, actorKind: 'user', action: 'auth.failed', targetType: 'user', targetId: account.userId, meta: { stage: 'password' }, ...m }, async () => undefined),
          'audit:auth.failed'
        );
      }
      audit.noteAuthFailure(AuditLog.context(req), 'invalid_credentials');
      return reply.status(401).send(INVALID_CREDENTIALS);
    }
    await refund(d, keys);
    const row = await getTotpRow(d, account.userId);
    const next: TicketNext = row?.confirmedAt ? 'totp' : 'enroll';
    return respond(AdminLoginResponseSchema, { ticket: await signTicket(key, account.userId, next, ticketVer(row), now), next });
  });

  // ---------- POST /admin/v1/auth/totp/enroll ----------
  // Cần MÃ MỜI do `admin:grant`/`admin:reset-totp` in ra (rà kien-truc PR #50, TB3): biết mật khẩu mà không có mã mời thì không đăng ký được.
  server.post('/totp/enroll', async (req, reply) => {
    const body = parseOr400(AdminEnrollRequestSchema, req.body, reply);
    if (!body) return reply;
    const d = await db.get();
    const now = clock();
    const t = await checkTicket(d, body.ticket, 'enroll', now, reply);
    if (!t) return reply;
    const gate = await totpGate(d, req, t.userId, now);
    if (gate.blocked) return reply.status(429).send(RATE_LIMITED);
    if (!(await inviteMatches(d, crypto, t.userId, body.inviteCode, now))) {
      failedTotp(d, req, t.userId);
      return reply.status(403).send({ error: AdminErrorCode.forbidden });
    }
    await refund(d, gate.keys);
    const account = await passwordAccountOf(d, t.userId);
    const fresh = await enrollTotp(d, crypto, t.userId, account?.username ?? 'admin');
    if (!fresh) return reply.status(403).send({ error: AdminErrorCode.forbidden });
    return respond(AdminEnrollResponseSchema, fresh);
  });

  /** Bước mã 6 số dùng chung bộ đếm cho confirm và totp */
  async function totpGate(d: Db, req: FastifyRequest, userId: string, now: Date): Promise<{ keys: string[]; blocked: boolean }> {
    const keys = [ck.totpIp(req.ip), ck.totpUser(userId)];
    const g = await attempt(d, keys, now);
    if (g.justBlocked) {
      const m = meta(req);
      alerts.track(
        () => withAdminAudit(d, { actorUserId: userId, actorKind: 'user', action: 'auth.failed', targetType: 'user', targetId: userId, meta: { stage: 'totp', reason: 'rate_limited' }, ...m }, async () => undefined),
        'audit:auth.failed'
      );
      alerts.notify('totp_failures', userId);
    }
    if (g.blocked) audit.noteRateLimited(AuditLog.context(req), '/admin/v1/auth/totp');
    return { keys, blocked: g.blocked };
  }

  function failedTotp(d: Db, req: FastifyRequest, userId: string): void {
    const m = meta(req);
    alerts.track(
      () => withAdminAudit(d, { actorUserId: userId, actorKind: 'user', action: 'auth.failed', targetType: 'user', targetId: userId, meta: { stage: 'totp' }, ...m }, async () => undefined),
      'audit:auth.failed'
    );
    audit.noteAuthFailure(AuditLog.context(req), 'invalid_credentials');
  }

  // ---------- POST /admin/v1/auth/totp/confirm ----------
  server.post('/totp/confirm', async (req, reply) => {
    const body = parseOr400(AdminTotpConfirmSchema, req.body, reply);
    if (!body) return reply;
    const d = await db.get();
    const now = clock();
    const t = await checkTicket(d, body.ticket, 'enroll', now, reply);
    if (!t) return reply;
    // Mã mời phải còn (chưa hết hạn/chưa dùng): hết hạn giữa enroll và confirm => từ chối
    if (!(await hasLiveInvite(d, t.userId, now))) return reply.status(403).send({ error: AdminErrorCode.forbidden });
    const gate = await totpGate(d, req, t.userId, now);
    if (gate.blocked) return reply.status(429).send(RATE_LIMITED);
    const m = meta(req);
    let done: { codes: string[]; sessionId: string; refreshToken: string; expiresAt: Date };
    try {
      done = await withAdminAudit(
        d,
        { actorUserId: t.userId, actorKind: 'user', action: 'auth.totp_enrolled', targetType: 'user', targetId: t.userId, meta: {}, ...m },
        async (tx) => {
          const codes = await confirmTotp(tx, crypto, t.userId, body.code, now);
          if (!codes) throw new Rejected();
          if (!(await consumeInvite(tx, t.userId, now))) throw new InviteGone();
          const s = await createSession(tx, t.userId, now, m);
          await insertAdminAudit(tx, { actorUserId: t.userId, actorKind: 'user', action: 'auth.login', targetType: 'user', targetId: t.userId, meta: { method: 'enroll' }, ...m });
          return { codes, ...s };
        }
      );
    } catch (err) {
      if (err instanceof InviteGone) return reply.status(403).send({ error: AdminErrorCode.forbidden });
      if (!(err instanceof Rejected)) throw err;
      failedTotp(d, req, t.userId);
      return reply.status(401).send(TOTP_INVALID);
    }
    await refund(d, gate.keys);
    alerts.notify('login', t.userId);
    reply.header('set-cookie', refreshCookie(done.refreshToken, Math.floor((done.expiresAt.getTime() - now.getTime()) / 1000)));
    return respond(AdminTotpConfirmResponseSchema, { ...(await sessionBody(t.userId, done.sessionId, now)), backupCodes: done.codes });
  });

  // ---------- POST /admin/v1/auth/totp ----------
  server.post('/totp', async (req, reply) => {
    const body = parseOr400(AdminTotpRequestSchema, req.body, reply);
    if (!body) return reply;
    const d = await db.get();
    const now = clock();
    const t = await checkTicket(d, body.ticket, 'totp', now, reply);
    if (!t) return reply;
    const gate = await totpGate(d, req, t.userId, now);
    if (gate.blocked) return reply.status(429).send(RATE_LIMITED);
    const m = meta(req);
    let done: { sessionId: string; refreshToken: string; expiresAt: Date };
    try {
      done = await withAdminAudit(
        d,
        { actorUserId: t.userId, actorKind: 'user', action: 'auth.login', targetType: 'user', targetId: t.userId, meta: { method: body.backupCode ? 'backup_code' : 'totp' }, ...m },
        async (tx) => {
          const accepted = body.backupCode
            ? await consumeBackupCode(tx, crypto, t.userId, body.backupCode)
            : await verifyTotpCode(tx, crypto, t.userId, body.code as string, now);
          if (!accepted) throw new Rejected();
          return createSession(tx, t.userId, now, m);
        }
      );
    } catch (err) {
      if (!(err instanceof Rejected)) throw err;
      failedTotp(d, req, t.userId);
      return reply.status(401).send(TOTP_INVALID);
    }
    await refund(d, gate.keys);
    alerts.notify('login', t.userId);
    reply.header('set-cookie', refreshCookie(done.refreshToken, Math.floor((done.expiresAt.getTime() - now.getTime()) / 1000)));
    return respond(AdminSessionSchema, await sessionBody(t.userId, done.sessionId, now));
  });

  // ---------- POST /admin/v1/auth/refresh (cookie) ----------
  server.post('/refresh', async (req, reply) => {
    if (!originAllowed(req)) return reply.status(403).send({ error: AdminErrorCode.forbidden });
    const token = readRefreshCookie(req.headers.cookie);
    const expired = () => {
      reply.header('set-cookie', refreshCookie('', 0));
      return reply.status(401).send({ error: AdminErrorCode.sessionExpired });
    };
    if (!token) return expired();
    const d = await db.get();
    const now = clock();
    const s = await rotateSession(d, token, now);
    if (!s) return expired();
    if (s.kind === 'reuse') {
      // Token đã xoay bị dùng lại quá ân hạn: phiên đã bị thu hồi trong rotateSession; ghi nhật ký (nền)
      const m = meta(req);
      alerts.track(
        () => withAdminAudit(d, { actorUserId: s.userId, actorKind: 'user', action: 'auth.failed', targetType: 'user', targetId: s.userId, meta: { stage: 'refresh', reason: 'refresh_reuse' }, ...m }, async () => undefined),
        'audit:auth.failed'
      );
      return expired();
    }
    // Không còn vai trò (bị thu quyền) / tài khoản chờ xóa => đóng phiên luôn
    if ((await getRoles(d, s.userId)).length === 0 || !(await accountUsable(d, s.userId))) {
      await revokeAllSessions(d, s.userId, now);
      return expired();
    }
    // `rotated`: phát cookie mới. `grace`: request song song/tab thứ hai còn cookie cũ — cookie mới đã nằm ở trình duyệt, không phát thêm
    if (s.kind === 'rotated') reply.header('set-cookie', refreshCookie(s.refreshToken, Math.floor((s.expiresAt.getTime() - now.getTime()) / 1000)));
    return respond(AdminSessionSchema, await sessionBody(s.userId, s.sessionId, now));
  });

  // ---------- POST /admin/v1/auth/logout (cookie) ----------
  server.post('/logout', async (req, reply) => {
    if (!originAllowed(req)) return reply.status(403).send({ error: AdminErrorCode.forbidden });
    const token = readRefreshCookie(req.headers.cookie);
    if (token) await revokeSessionByRefresh(await db.get(), token, clock());
    reply.header('set-cookie', refreshCookie('', 0));
    return reply.status(204).send();
  });
};
