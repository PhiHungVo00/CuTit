import { createHmac, timingSafeEqual } from 'node:crypto';
import { SIGNED_URL_TTL_SECONDS } from '@vietlearning/contracts/api';
import type { Clock } from '../../pipeline/QuotaStore.js';

/**
 * URL ký cho tệp đính kèm góp ý (spec §5.6). Thẻ `<img>`/`<video>` của trang quản trị không gửi được header Bearer
 * => dùng URL tự chứa chữ ký, sống 5 phút, mở được KHÔNG cần đăng nhập:
 *   /admin/v1/blob?k=<khóa tệp>&exp=<giây epoch>&sig=<HMAC-SHA256 base64url>
 * Chữ ký buộc CẢ `k` và `exp` (đổi một trong hai là hỏng), có tiền tố tách miền ("blob-url-v1") nên không dùng lại
 * được ở nơi khác dù cùng khóa. Khóa HMAC là ADMIN_BLOB_URL_SECRET (riêng với mọi khóa khác). Thao tác cấp URL được ghi
 * nhật ký ở route (feedback.view_file) — chữ ký KHÔNG đi vào nhật ký.
 */
export const BLOB_URL_PATH = '/admin/v1/blob';
const DOMAIN = 'blob-url-v1';
const MIN_SECRET = 32;

export interface BlobUrlSigner {
  /** `url` là đường dẫn tương đối (nơi gọi ghép gốc); `expiresAt` dạng ISO */
  signBlobUrl(key: string, ttlSec?: number): { url: string; expiresAt: string };
  verifyBlobUrl(k: unknown, exp: unknown, sig: unknown): boolean;
}

export function createBlobUrlSigner(secret: string, clock: Clock): BlobUrlSigner {
  if (secret.length < MIN_SECRET) throw new Error(`ADMIN_BLOB_URL_SECRET phải dài tối thiểu ${MIN_SECRET} ký tự`);
  const mac = (k: string, exp: string): Buffer =>
    // `\n` không thể xuất hiện trong exp (chỉ chữ số) nên không có hai cặp (k, exp) khác nhau cùng chuỗi đầu vào
    createHmac('sha256', secret).update(`${DOMAIN}\n${exp}\n${k}`).digest();

  return {
    signBlobUrl(key, ttlSec = SIGNED_URL_TTL_SECONDS) {
      const expMs = clock().getTime() + ttlSec * 1000;
      const exp = String(Math.floor(expMs / 1000));
      const sig = mac(key, exp).toString('base64url');
      return {
        url: `${BLOB_URL_PATH}?k=${encodeURIComponent(key)}&exp=${exp}&sig=${sig}`,
        expiresAt: new Date(Number(exp) * 1000).toISOString()
      };
    },
    verifyBlobUrl(k, exp, sig) {
      if (typeof k !== 'string' || typeof exp !== 'string' || typeof sig !== 'string') return false;
      if (!/^\d{1,12}$/.test(exp) || k.length === 0 || k.length > 300) return false;
      // Chữ ký phải đúng TRƯỚC khi xét hạn: không để kẻ lạ dò mốc hết hạn bằng thời gian/mã lỗi khác nhau
      const given = Buffer.from(sig, 'base64url');
      const expected = mac(k, exp);
      const sigOk = given.length === expected.length && timingSafeEqual(given, expected);
      return sigOk && Number(exp) * 1000 > clock().getTime();
    }
  };
}
