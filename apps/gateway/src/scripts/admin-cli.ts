import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { StaffRoleSchema, UsernameSchema } from '@vietlearning/contracts/api';
import { loadConfig } from '../config.js';
import { createDbProvider, schema, type Db } from '../db/client.js';
import { createMailProvider, type MailProvider } from '../services/mail/MailProvider.js';
import { sendAdminAlert } from '../services/admin/alerts.js';
import { withAdminAudit } from '../services/admin/audit.js';
import { grantRole, getRoles, revokeRole } from '../services/admin/roles.js';
import { revokeAllSessions } from '../services/admin/sessions.js';
import { findPasswordAccount } from '../services/auth/accounts.js';
import { AdminCrypto } from '../services/admin/crypto.js';
import { issueInvite } from '../services/admin/invite.js';
import { adminRateKeys } from '../services/admin/rateKeys.js';
import { getTotpRow } from '../services/admin/totp.js';
import { RateCounters } from '../services/auth/rateCounter.js';

/**
 * CLI cấp quyền quản trị (spec §5.4) — KHÔNG có API hay biến môi trường nào cấp quyền; chỉ ai chạy được lệnh này (có quyền vào DB) mới cấp được.
 *   pnpm --filter @vietlearning/gateway admin:grant --username <x> --role owner
 *   pnpm --filter @vietlearning/gateway admin:revoke --username <x> --role <owner|editor|reviewer|support>
 *   pnpm --filter @vietlearning/gateway admin:reset-totp --username <x>
 *   pnpm --filter @vietlearning/gateway admin:unlock --username <x>   (gỡ khóa đăng nhập theo tên + theo tài khoản; chạy cùng AUTH_OTP_PEPPER với Gateway)
 * `grant` (khi chưa có mã 6 số xác nhận) và `reset-totp` IN RA MÃ MỜI dùng một lần (hết hạn 24 giờ): bắt buộc ở bước đăng ký mã 6 số đầu tiên
 * => biết mật khẩu mà không có mã mời thì không giành được đăng ký TOTP của chủ. Cần ADMIN_MFA_KEY để băm mã mời.
 * Mỗi lệnh ghi `admin_audit_log` với tác nhân `cli` TRONG CÙNG transaction với thay đổi. Có hiệu lực ngay (hook đọc DB mỗi request).
 * - Tài khoản phải là tài khoản mật khẩu có thật (đăng ký qua /v1/auth/register) và chưa bị xóa.
 * - revoke: thu hết vai trò thì đóng luôn mọi phiên quản trị; reset-totp: xóa mã 6 số + mã dự phòng và đóng mọi phiên (mất điện thoại).
 * - PGlite (dev): dừng Gateway trước khi chạy lệnh (một thư mục dữ liệu chỉ một tiến trình mở).
 * - Không in ra khóa/mật khẩu/mã; tên đăng nhập là thứ người vận hành tự gõ nên được phép hiện lại.
 */
const Args = z.object({ username: UsernameSchema, role: StaffRoleSchema.optional() });

export interface CliContext {
  db: Db;
  now?: () => Date;
  /** Có thì gửi cảnh báo "được cấp vai trò" (best effort); bỏ trống = không gửi */
  mail?: MailProvider;
  mailDailyCap?: number;
  /** ADMIN_MFA_KEY (băm mã mời). Thiếu => grant/reset-totp từ chối (không cấp quyền mà không có cách đăng ký an toàn) */
  mfaKey?: string;
  /** AUTH_OTP_PEPPER của Gateway (HMAC khóa bộ đếm) — cần cho `unlock` */
  pepper?: string;
  out?: (line: string) => void;
}

export interface CliResult {
  code: number;
  message: string;
  /** Mã mời in ra (chỉ grant/reset-totp khi cần đăng ký mã 6 số) */
  inviteCode?: string;
}

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) flags[a.slice(2)] = argv[++i];
  }
  return flags;
}

const USAGE = 'Cách dùng: admin-cli <grant|revoke|reset-totp|unlock> --username <tên> [--role <owner|editor|reviewer|support>]';

/** Chạy một lệnh; không gọi process.exit (test gọi trực tiếp). */
export async function runAdminCli(argv: string[], ctx: CliContext): Promise<CliResult> {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  const parsed = Args.safeParse({ username: flags.username, role: flags.role });
  if (!command || !['grant', 'revoke', 'reset-totp', 'unlock'].includes(command) || !parsed.success) {
    return { code: 2, message: USAGE };
  }
  const { username, role } = parsed.data;
  if ((command === 'grant' || command === 'revoke') && !role) return { code: 2, message: `Thiếu --role. ${USAGE}` };
  const now = (ctx.now ?? (() => new Date()))();
  const account = await findPasswordAccount(ctx.db, username);
  if (!account) {
    return { code: 1, message: 'Không tìm thấy tài khoản mật khẩu với tên đăng nhập này (cần đăng ký qua /v1/auth/register trước).' };
  }
  const userId = account.userId;
  const crypto = ctx.mfaKey ? new AdminCrypto(ctx.mfaKey) : null;
  if ((command === 'grant' || command === 'reset-totp') && !crypto) {
    return { code: 1, message: 'Thiếu ADMIN_MFA_KEY: cần khóa này để băm mã mời đăng ký mã 6 số. Đặt biến môi trường rồi chạy lại.' };
  }
  const [user] = await ctx.db.select({ deleteAt: schema.users.deleteAt }).from(schema.users).where(eq(schema.users.id, userId));
  if (user?.deleteAt) return { code: 1, message: 'Tài khoản đang chờ xóa; khôi phục trước khi cấp quyền.' };

  if (command === 'unlock') {
    if (!ctx.pepper) return { code: 1, message: 'Thiếu AUTH_OTP_PEPPER: cần đúng giá trị mà Gateway đang dùng để gỡ bộ đếm.' };
    const counters = new RateCounters(ctx.pepper);
    await counters.clear(ctx.db, adminRateKeys.name(username));
    await counters.clear(ctx.db, adminRateKeys.totpUser(userId));
    return { code: 0, message: 'Đã gỡ khóa đăng nhập theo tên và theo tài khoản. (Bộ đếm theo IP của kẻ gõ sai không ảnh hưởng chủ app và tự hết sau 15 phút.)' };
  }

  if (command === 'grant') {
    const granted = await withAdminAudit(
      ctx.db,
      { actorUserId: null, actorKind: 'cli', action: 'role.grant', targetType: 'user', targetId: userId, meta: { role } },
      async (tx) => {
        const added = await grantRole(tx, userId, role!, null);
        if (!added) throw new AlreadyDone();
        return true;
      }
    ).catch((err: unknown) => {
      if (err instanceof AlreadyDone) return false;
      throw err;
    });
    const confirmed = Boolean((await getTotpRow(ctx.db, userId))?.confirmedAt);
    const inviteCode = confirmed ? undefined : await issueInvite(ctx.db, crypto!, userId, now);
    if (!granted && !inviteCode) return { code: 0, message: `Tài khoản đã có vai trò ${role} (không đổi gì, không ghi nhật ký thêm).` };
    if (granted && ctx.mail) await sendAdminAlert(ctx.db, ctx.mail, { MAIL_DAILY_CAP: ctx.mailDailyCap ?? 450 }, 'role_granted', userId, now).catch(() => undefined);
    const lead = granted ? `Đã cấp vai trò ${role}.` : `Tài khoản đã có vai trò ${role}; cấp MÃ MỜI mới (mã cũ vô hiệu).`;
    return {
      code: 0,
      inviteCode,
      message: inviteCode
        ? `${lead} MÃ MỜI đăng ký mã 6 số (dùng một lần, hết hạn sau 24 giờ, chỉ hiện lần này): ${inviteCode}
Đăng nhập quản trị NGAY, nhập mã mời rồi đăng ký mã 6 số.`
        : `${lead} Tài khoản đã có mã 6 số nên không cần mã mời.`
    };
  }

  if (command === 'revoke') {
    const result = await withAdminAudit(
      ctx.db,
      { actorUserId: null, actorKind: 'cli', action: 'role.revoke', targetType: 'user', targetId: userId, meta: { role } },
      async (tx) => {
        const removed = await revokeRole(tx, userId, role!);
        if (!removed) throw new AlreadyDone();
        const left = await getRoles(tx, userId);
        if (left.length === 0) await revokeAllSessions(tx, userId, now);
        return left.length;
      }
    ).catch((err: unknown) => {
      if (err instanceof AlreadyDone) return null;
      throw err;
    });
    if (result === null) return { code: 0, message: `Tài khoản không có vai trò ${role} (không đổi gì).` };
    return { code: 0, message: `Đã thu vai trò ${role}${result === 0 ? ' (hết vai trò: đã đóng mọi phiên quản trị)' : ''}. Có hiệu lực ngay ở request kế tiếp.` };
  }

  // reset-totp
  const inviteCode = await withAdminAudit(
    ctx.db,
    { actorUserId: null, actorKind: 'cli', action: 'totp.reset', targetType: 'user', targetId: userId, meta: {} },
    async (tx) => {
      await tx.delete(schema.staffTotp).where(eq(schema.staffTotp.userId, userId));
      await revokeAllSessions(tx, userId, now);
      // Mã mời mới trong CÙNG transaction: không có khoảng hở nơi chỉ cần mật khẩu là đăng ký lại được
      return issueInvite(tx, crypto!, userId, now);
    }
  );
  return {
    code: 0,
    inviteCode,
    message: `Đã xóa mã 6 số + mã dự phòng và đóng mọi phiên quản trị. MÃ MỜI đăng ký lại (dùng một lần, hết hạn sau 24 giờ, chỉ hiện lần này): ${inviteCode}`
  };
}

class AlreadyDone extends Error {}

async function main(): Promise<void> {
  const config = loadConfig();
  const provider = createDbProvider(config);
  let code = 1;
  try {
    if (!config.DATABASE_URL && !config.PGLITE_DIR.startsWith('memory://')) {
      console.warn('Lưu ý: đang dùng PGlite cục bộ — hãy chắc Gateway dev đã dừng (một thư mục dữ liệu chỉ một tiến trình mở).');
    }
    const result = await runAdminCli(process.argv.slice(2), {
      db: await provider.get(),
      mail: createMailProvider(config),
      mailDailyCap: config.MAIL_DAILY_CAP,
      mfaKey: config.ADMIN_MFA_KEY,
      pepper: config.AUTH_OTP_PEPPER
    });
    console.log(result.message);
    code = result.code;
  } catch (err) {
    console.error('Lỗi:', (err as Error).message);
  } finally {
    await provider.close();
  }
  process.exit(code);
}

// Chạy như lệnh (không chạy khi test import)
const entry = process.argv[1];
if (entry) {
  try {
    if (realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))) void main();
  } catch {
    /* không xác định được tệp chạy: coi như được import */
  }
}
