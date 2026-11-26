import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Clock } from '../../pipeline/QuotaStore.js';

/**
 * URL ký cho tệp đính kèm CHAT (spec 5.5). Thẻ `<img>`/`<audio>` không gửi được header Bearer nên URL tự chứa chữ ký, sống 5 phút:
 *   /v1/chat/blob?k=<khóa tệp>&exp=<giây epoch>&sig=<HMAC-SHA256 base64url>
 * Chữ ký buộc CẢ `k` và `exp` (đổi một trong hai là hỏng), có tiền tố tách miền riêng của chat ("chat-blob-url-v1") nên URL của
 * khối quản trị không dùng lại được ở đây (và ngược lại) dù lỡ trùng khóa. So sánh hằng thời gian; chữ ký đúng RỒI mới xét hạn.
 * Mô hình tương tự `services/admin/signedUrl.ts` (5a), viết lại cho miền chat.
 */
export const CHAT_BLOB_URL_PATH = '/v1/chat/blob';
export const CHAT_BLOB_URL_TTL_SEC = 300;
const DOMAIN = 'chat-blob-url-v1';
const MIN_SECRET = 32;

export interface ChatBlobUrlSigner {
  /** `url` là đường dẫn tương đối (nơi gọi ghép gốc); `expiresAt` dạng ISO */
  sign(key: string, ttlSec?: number): { url: string; expiresAt: string };
  verify(k: unknown, exp: unknown, sig: unknown): boolean;
}

export function createChatBlobUrlSigner(secret: string, clock: Clock): ChatBlobUrlSigner {
  if (secret.length < MIN_SECRET) throw new Error(`CHAT_BLOB_URL_SECRET phải dài tối thiểu ${MIN_SECRET} ký tự`);
  // `\n` không thể xuất hiện trong exp (chỉ chữ số) nên không có hai cặp (k, exp) khác nhau cùng chuỗi đầu vào
  const mac = (k: string, exp: string): Buffer => createHmac('sha256', secret).update(`${DOMAIN}\n${exp}\n${k}`).digest();
  return {
    sign(key, ttlSec = CHAT_BLOB_URL_TTL_SEC) {
      const exp = String(Math.floor((clock().getTime() + ttlSec * 1000) / 1000));
      return {
        url: `${CHAT_BLOB_URL_PATH}?k=${encodeURIComponent(key)}&exp=${exp}&sig=${mac(key, exp).toString('base64url')}`,
        expiresAt: new Date(Number(exp) * 1000).toISOString()
      };
    },
    verify(k, exp, sig) {
      if (typeof k !== 'string' || typeof exp !== 'string' || typeof sig !== 'string') return false;
      if (!/^\d{1,12}$/.test(exp) || k.length === 0 || k.length > 300) return false;
      if (!/^[A-Za-z0-9_-]{43}$/.test(sig)) return false;
      const given = Buffer.from(sig, 'base64url');
      const expected = mac(k, exp);
      const sigOk = given.length === expected.length && timingSafeEqual(given, expected);
      return sigOk && Number(exp) * 1000 > clock().getTime();
    }
  };
}
