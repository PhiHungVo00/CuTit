import { readFileSync } from 'node:fs';
import type { GatewayConfig } from '../../config.js';
import { FcmProvider, parseServiceAccount } from './fcmProvider.js';
import { LogPushProvider } from './logProvider.js';
import type { PushMessage } from './payload.js';

/**
 * Nhà cung cấp thông báo đẩy trừu tượng (nguyên tắc 4: code chỉ biết interface này, không biết tên hãng).
 * - `invalid`: token nhà cung cấp báo chết/không hợp lệ ⇒ người gọi đặt `disabled_at`.
 * - `config`: số token bị từ chối vì lỗi cấu hình/nội dung (KHÔNG vô hiệu token; chỉ cảnh báo).
 * - `retry`: token gặp lỗi TẠM (mạng, 5xx, 429) ⇒ người gọi thử lại có giới hạn.
 * Ném lỗi chỉ khi cả mẻ hỏng (cấu hình/xác thực); thông điệp lỗi KHÔNG BAO GIỜ chứa khóa.
 */
export interface PushProvider {
  readonly name: string;
  send(tokens: string[], msg: PushMessage): Promise<{ invalid: string[]; retry?: string[]; config?: number }>;
}

export type PushLog = { warn: (obj: object, msg?: string) => void; info: (obj: object, msg?: string) => void };

/**
 * `none` ⇒ null (không đẩy). `log` ⇒ ghi gọn ra log. `fcm` ⇒ FCM thật nếu đọc được khóa ở `FCM_SERVICE_ACCOUNT_FILE`;
 * chưa cấu hình/đọc lỗi ⇒ rơi về `log` (không sập, không in nội dung khóa).
 */
export function createPushProvider(
  config: Pick<GatewayConfig, 'PUSH_PROVIDER' | 'FCM_SERVICE_ACCOUNT_FILE'>,
  log: PushLog,
  fetchImpl?: typeof fetch
): PushProvider | null {
  if (config.PUSH_PROVIDER === 'none') return null;
  if (config.PUSH_PROVIDER === 'fcm') {
    const file = config.FCM_SERVICE_ACCOUNT_FILE;
    if (!file) {
      log.warn({}, 'PUSH_PROVIDER=fcm nhưng FCM_SERVICE_ACCOUNT_FILE chưa đặt: dùng bản log (không đẩy thật)');
    } else {
      try {
        const sa = parseServiceAccount(readFileSync(file, 'utf8'));
        if (sa) return new FcmProvider(sa, { fetch: fetchImpl });
        log.warn({}, 'FCM_SERVICE_ACCOUNT_FILE không phải khóa tài khoản dịch vụ hợp lệ: dùng bản log');
      } catch {
        log.warn({}, 'Không đọc được FCM_SERVICE_ACCOUNT_FILE: dùng bản log');
      }
    }
  }
  return new LogPushProvider(log);
}
