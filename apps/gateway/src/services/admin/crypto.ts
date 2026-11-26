import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { decodeKey32 } from '../../config.js';

/**
 * Mã hóa bí mật TOTP + băm mã dự phòng của trang quản trị (dự án 5a, spec §5.4).
 *
 * - AES-256-GCM, IV ngẫu nhiên 12 byte; lưu `version(1) | iv(12) | tag(16) | ciphertext` vào cột bytea.
 * - `user_id` là AAD: tráo bí mật giữa hai dòng `staff_totp` => giải mã thất bại.
 * - Hai khóa con (mã hóa / băm mã dự phòng) suy ra từ ADMIN_MFA_KEY bằng HKDF-SHA256 với `info` khác nhau.
 * - Mã dự phòng băm bằng HMAC-SHA256 (khóa con) thay vì sha256 trần: mã chỉ ~52 bit, lộ DB mà không có khóa thì không dò ngược được.
 * - KHÔNG bao giờ log khóa, bí mật hay mã.
 */
const VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;

export class AdminCrypto {
  private readonly encKey: Buffer;
  private readonly hashKey: Buffer;

  constructor(masterKeyText: string) {
    const master = decodeKey32(masterKeyText);
    if (!master) throw new Error('ADMIN_MFA_KEY không hợp lệ');
    this.encKey = Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'becutit-admin-totp-v1', 32));
    this.hashKey = Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'becutit-admin-backup-v1', 32));
  }

  encryptSecret(plain: string, userId: string): Buffer {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv, { authTagLength: TAG_LEN });
    cipher.setAAD(Buffer.from(userId, 'utf8'));
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), ct]);
  }

  /** Giải mã; sai khóa / sai người / dữ liệu hỏng => null (không ném, nơi gọi coi như lỗi cấu hình) */
  decryptSecret(blob: Buffer | Uint8Array, userId: string): string | null {
    const b = Buffer.from(blob);
    if (b.length < 1 + IV_LEN + TAG_LEN + 1 || b[0] !== VERSION) return null;
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.encKey, b.subarray(1, 1 + IV_LEN), { authTagLength: TAG_LEN });
      decipher.setAAD(Buffer.from(userId, 'utf8'));
      decipher.setAuthTag(b.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN));
      return Buffer.concat([decipher.update(b.subarray(1 + IV_LEN + TAG_LEN)), decipher.final()]).toString('utf8');
    } catch {
      return null;
    }
  }

  /** Băm mã dự phòng đã chuẩn hóa (chữ thường, đúng dạng xxxxx-xxxxx) */
  hashBackupCode(code: string): string {
    return createHmac('sha256', this.hashKey).update(code.trim().toLowerCase()).digest('hex');
  }
}

const BACKUP_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Một mã dự phòng `xxxxx-xxxxx` (chữ thường + số), sinh bằng crypto.randomInt (không thiên lệch) */
export function newBackupCode(): string {
  const pick = () => BACKUP_ALPHABET[randomInt(BACKUP_ALPHABET.length)];
  return Array.from({ length: 5 }, pick).join('') + '-' + Array.from({ length: 5 }, pick).join('');
}

/** sha256 hex của token ngẫu nhiên 256 bit (refresh): đủ entropy nên không cần băm chậm */
export const sha256Hex = (s: string): string => createHash('sha256').update(s).digest('hex');

/** Token ngẫu nhiên 32 byte dạng base64url */
export const newOpaqueToken = (): string => randomBytes(32).toString('base64url');

/** So sánh hằng thời gian hai chuỗi hex cùng độ dài */
export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
