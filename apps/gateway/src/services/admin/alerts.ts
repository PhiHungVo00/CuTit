import { and, eq } from 'drizzle-orm';
import type { GatewayConfig } from '../../config.js';
import { schema, type Db, type DbProvider } from '../../db/client.js';
import type { Clock } from '../../pipeline/QuotaStore.js';
import { refundMailQuota, tryConsumeMailQuota } from '../mail/dailyCap.js';
import type { MailProvider } from '../mail/MailProvider.js';

/**
 * Cảnh báo email cho chủ app (spec §5.4): đăng nhập quản trị thành công, sai mã 6 số quá 5 lần, cấp vai trò mới.
 * - Gửi về email ĐÃ XÁC MINH gắn với tài khoản quản trị (identities.provider='email'); không có email hoặc `MAIL_PROVIDER=none` => bỏ qua.
 * - Chạy NỀN, không bao giờ làm hỏng hay làm chậm đăng nhập; lỗi gửi chỉ thành cảnh báo trong log (không có địa chỉ/nội dung).
 * - Tính vào trần thư/ngày chung (MAIL_DAILY_CAP) như mọi thư khác của app.
 * - Nội dung KHÔNG chứa IP, tên đăng nhập, mã hay token: chỉ nói chuyện gì xảy ra và lúc nào (giờ UTC).
 */
export type AdminAlertKind = 'login' | 'totp_failures' | 'role_granted';

interface Warn {
  warn: (obj: unknown, msg?: string) => void;
}

function message(kind: AdminAlertKind, at: Date): { subjectVi: string; subjectEn: string; body: string } {
  const when = at.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const text = {
    login: {
      vi: 'Có đăng nhập vào trang quản trị Bé Cu Tít',
      en: 'Sign-in to the Bé Cu Tít admin site',
      detailVi: 'Vừa có một lần đăng nhập thành công vào trang quản trị bằng tài khoản của bạn.',
      detailEn: 'There was a successful sign-in to the admin site with your account.'
    },
    totp_failures: {
      vi: 'Cảnh báo: nhập sai mã 6 số trang quản trị nhiều lần',
      en: 'Alert: repeated wrong 6-digit codes on the admin site',
      detailVi: 'Có người nhập sai mã 6 số (hoặc mã dự phòng) của tài khoản quản trị nhiều lần liên tiếp; hệ thống đã tạm khóa thử tiếp.',
      detailEn: 'Someone entered a wrong 6-digit (or backup) code for the admin account several times; further attempts are temporarily blocked.'
    },
    role_granted: {
      vi: 'Tài khoản của bạn vừa được cấp quyền quản trị',
      en: 'Your account was just granted admin access',
      detailVi: 'Tài khoản của bạn vừa được cấp một vai trò quản trị bằng lệnh trên máy chủ.',
      detailEn: 'Your account was just granted an admin role from the server command line.'
    }
  }[kind];
  return {
    subjectVi: text.vi,
    subjectEn: text.en,
    body: `${text.detailVi}\n${text.detailEn}\n\nThời điểm / Time: ${when}\n\nNếu không phải bạn / If this was not you: đổi mật khẩu ngay và chạy admin:reset-totp trên máy chủ.`
  };
}

/** Gửi một cảnh báo (chờ xong). Dùng trực tiếp ở CLI; trong Gateway dùng AdminAlerts.notify (nền). */
export async function sendAdminAlert(
  d: Db,
  mail: MailProvider,
  config: Pick<GatewayConfig, 'MAIL_DAILY_CAP'>,
  kind: AdminAlertKind,
  userId: string,
  now: Date,
  log?: Warn
): Promise<boolean> {
  if (!mail.available()) return false;
  const i = schema.identities;
  const [row] = await d
    .select({ email: i.subject })
    .from(i)
    .where(and(eq(i.userId, userId), eq(i.provider, 'email'), eq(i.emailVerified, true)));
  if (!row) return false;
  if (!(await tryConsumeMailQuota(d, config.MAIL_DAILY_CAP, now))) return false;
  const m = message(kind, now);
  try {
    await mail.send(row.email, m.subjectVi, m.subjectEn, m.body);
    return true;
  } catch {
    await refundMailQuota(d, now).catch(() => undefined);
    log?.warn({ mail: mail.name, kind }, 'gửi cảnh báo quản trị thất bại');
    return false;
  }
}

export class AdminAlerts {
  private readonly pending = new Set<Promise<unknown>>();

  constructor(
    private readonly db: DbProvider,
    private readonly mail: MailProvider,
    private readonly config: Pick<GatewayConfig, 'MAIL_DAILY_CAP'>,
    private readonly clock: Clock,
    private readonly log?: Warn
  ) {}

  /** Theo dõi một việc nền (gửi thư, ghi nhật ký đăng nhập sai) để `flush()` chờ được; lỗi chỉ thành cảnh báo */
  track(work: () => Promise<unknown>, what: string): void {
    const p: Promise<unknown> = work()
      .catch((err: unknown) => this.log?.warn({ err: (err as Error)?.message, what }, 'admin background task failed'))
      .finally(() => this.pending.delete(p));
    this.pending.add(p);
  }

  notify(kind: AdminAlertKind, userId: string): void {
    if (!this.mail.available()) return;
    this.track(async () => sendAdminAlert(await this.db.get(), this.mail, this.config, kind, userId, this.clock(), this.log), `alert:${kind}`);
  }

  async flush(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }
}
