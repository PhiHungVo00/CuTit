import nodemailer, { type Transporter } from 'nodemailer';
import type { MailProvider } from './MailProvider.js';

export interface GmailCredentials {
  user: string;
  /** mật khẩu ứng dụng Gmail — chỉ ở biến môi trường server */
  pass: string;
  from: string;
}

/** Chỉ test đổi được (máy chủ SMTP giả trên máy); production luôn smtp.gmail.com:465 TLS */
export interface SmtpTransportOverride {
  host: string;
  port: number;
  secure: boolean;
  ignoreTLS?: boolean;
}

/**
 * MAIL_PROVIDER=gmail-smtp — `nodemailer` (MIT-0). Đặt timeout để request không treo khi Gmail chậm/chặn.
 * Gmail giới hạn ~500 thư/ngày cho tài khoản thường => Gateway tự chặn ở MAIL_DAILY_CAP (services/mail/dailyCap.ts).
 */
export class GmailSmtpMailProvider implements MailProvider {
  readonly name = 'gmail-smtp';
  private readonly transport: Transporter;
  private readonly info: { host: string; port: number; secure: boolean };

  constructor(private readonly creds: GmailCredentials, override?: SmtpTransportOverride) {
    this.info = override ? { host: override.host, port: override.port, secure: override.secure } : { host: 'smtp.gmail.com', port: 465, secure: true };
    this.transport = nodemailer.createTransport({
      ...this.info,
      ignoreTLS: override?.ignoreTLS ?? false,
      auth: { user: creds.user, pass: creds.pass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10_000,
      // không ghi nội dung thư (có mã OTP) hay địa chỉ vào log
      logger: false,
      debug: false
    });
  }

  available(): boolean {
    return true;
  }

  /** Cho test: máy chủ đang dùng (không có mật khẩu) */
  transportInfo(): { host: string; port: number; secure: boolean } {
    return { ...this.info };
  }

  async send(to: string, subjectVi: string, subjectEn: string, body: string): Promise<void> {
    await this.transport.sendMail({ from: this.creds.from, to, subject: `${subjectVi} / ${subjectEn}`, text: body });
  }
}
