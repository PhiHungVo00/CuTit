import { GatewayError } from '../../pipeline/RequestPipeline.js';
import type { MailProvider } from './MailProvider.js';

/** MAIL_PROVIDER=none: không gửi thư. Không in mã ra log (khác bộ 'console' của đề xuất A4 — tránh lọt mã/email vào log). */
export class NoMailProvider implements MailProvider {
  readonly name = 'none';

  available(): boolean {
    return false;
  }

  async send(): Promise<void> {
    throw new GatewayError(503, 'provider_unavailable', 'Chưa cấu hình gửi thư');
  }
}
