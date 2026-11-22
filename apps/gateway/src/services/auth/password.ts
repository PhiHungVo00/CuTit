import { hash, verify } from '@node-rs/argon2';
import { COMMON_PASSWORDS } from './commonPasswords.js';

/** Algorithm.Argon2id = 2 (const enum của thư viện — không dùng trực tiếp được khi bật isolatedModules) */
const ARGON2ID = 2;

/**
 * Mật khẩu (dự án 3, spec 5.2): argon2id theo khuyến nghị OWASP Password Storage Cheat Sheet
 * (m = 19 MiB, t = 2, p = 1). Thư viện `@node-rs/argon2` (MIT, bản dựng sẵn — không cần build native trên Windows).
 * Chuỗi băm dạng PHC (`$argon2id$v=19$m=19456,t=2,p=1$…`) mang theo tham số => nâng tham số sau này vẫn kiểm được hash cũ.
 *
 * Quy tắc "mật khẩu yếu" theo NIST SP 800-63B (không bắt ký hiệu/chữ hoa, chỉ chặn mật khẩu hay gặp và theo ngữ cảnh).
 */
const OPTIONS = { algorithm: ARGON2ID, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/**
 * Chuẩn hóa Unicode NFC trước khi băm/kiểm (NIST SP 800-63B 5.1.1.2): mật khẩu có dấu tiếng Việt gõ bằng bộ gõ dựng
 * sẵn (NFC) hay tổ hợp (NFD, ví dụ một số bàn phím/Unikey) phải cho cùng một chuỗi băm.
 */
const normalize = (password: string): string => password.normalize('NFC');

export function hashPassword(password: string): Promise<string> {
  return hash(normalize(password), OPTIONS);
}

/** Sai mật khẩu hoặc hash hỏng => false (không ném) */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, normalize(password));
  } catch {
    return false;
  }
}

/**
 * Hash giả tính một lần: khi tên đăng nhập KHÔNG tồn tại vẫn chạy một lần argon2 verify cùng tham số, để thời gian trả
 * `invalid_credentials` gần giống hệt trường hợp sai mật khẩu (không dò được tên qua thời gian phản hồi).
 */
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('becutit-dummy-password-for-timing');
  await verifyPassword(await dummyHash, password);
}

/** Ngữ cảnh riêng của app (NIST: "context-specific words") */
const CONTEXT_WORDS = ['becutit', 'cutit', 'hoctiengviet', 'tiengviet', 'matkhau', 'password'];

/**
 * true = mật khẩu yếu (=> 400 weak_password). Mật khẩu đã qua PasswordSchema (8–128 ký tự).
 * - nằm trong ~10 000 mật khẩu phổ biến (không phân biệt hoa thường);
 * - bỏ số/ký hiệu ở đuôi mà phần còn lại (≥ 4 ký tự) nằm trong danh sách hoặc là từ ngữ cảnh: `password123`, `iloveyou2024!`;
 * - chỉ một ký tự lặp lại: `aaaaaaaa`;
 * - chứa tên đăng nhập (bỏ dấu chấm/gạch dưới cũng tính): `mai.le2024`, `maile123`.
 */
export function isWeakPassword(password: string, username: string): boolean {
  const p = password.normalize('NFC').toLowerCase();
  if (COMMON_PASSWORDS.has(p)) return true;
  const stem = p.replace(/[\p{N}\p{P}\p{S}\s]+$/u, '');
  if (stem.length >= 4 && (COMMON_PASSWORDS.has(stem) || CONTEXT_WORDS.includes(stem))) return true;
  if (/^(.)\1*$/u.test(p)) return true;
  const u = username.toLowerCase();
  const bare = (s: string) => s.replace(/[._]/g, '');
  if (u.length >= 3 && (p.includes(u) || bare(p).includes(bare(u)))) return true;
  return false;
}
