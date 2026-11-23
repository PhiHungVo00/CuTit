import type { GatewayConfig } from '../../config.js';
import { GatewayError } from '../../pipeline/RequestPipeline.js';
import { GmailSmtpMailProvider } from './gmailSmtp.js';
import { NoMailProvider } from './none.js';

/**
 * Năng lực gửi mail (Nguyên tắc 4: code gọi `mail.send`, không gọi tên hãng; đổi nhà cung cấp bằng MAIL_PROVIDER).
 * - 'none' (mặc định khi chưa có mật khẩu ứng dụng Gmail): available() = false, send ném provider_unavailable.
 * - 'gmail-smtp': smtp.gmail.com:465 TLS bằng mật khẩu ứng dụng của Gmail riêng của app.
 * Sau này có tên miền => thêm ruột 'resend'/'smtp' mà không đổi nơi gọi.
 */
export interface MailProvider {
  readonly name: string;
  /** false = chưa cấu hình => luồng cần mail trả provider_unavailable ngay, không thử gửi */
  available(): boolean;
  /** Thư văn bản thuần, song ngữ: tiêu đề "vi / en". Lỗi gửi => ném (nơi gọi không log địa chỉ nhận). */
  send(to: string, subjectVi: string, subjectEn: string, body: string): Promise<void>;
}

export const mailUnavailable = (): GatewayError => new GatewayError(503, 'provider_unavailable', 'Chưa gửi được thư lúc này');

export function createMailProvider(config: GatewayConfig): MailProvider {
  if (config.MAIL_PROVIDER === 'gmail-smtp' && config.MAIL_SMTP_USER && config.MAIL_SMTP_PASS) {
    return new GmailSmtpMailProvider({
      user: config.MAIL_SMTP_USER,
      pass: config.MAIL_SMTP_PASS,
      from: config.MAIL_FROM ?? `Bé Cu Tít <${config.MAIL_SMTP_USER}>`
    });
  }
  return new NoMailProvider();
}
