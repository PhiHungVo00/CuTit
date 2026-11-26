import * as OTPAuth from 'otpauth';
import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { ADMIN_BACKUP_CODE_COUNT } from '@vietlearning/contracts/api';
import { schema, type Db } from '../../db/client.js';
import { AdminCrypto, newBackupCode } from './crypto.js';

/**
 * TOTP (RFC 6238, 30 giây, 6 số, SHA-1 để hợp Google Authenticator) qua thư viện `otpauth` (MIT) — Nguyên tắc 3: không tự viết thuật toán.
 * Chấp nhận lệch ±1 bước. Chống dùng lại: mỗi mã chỉ nhận khi bước của nó > `last_used_step`, cập nhật NGUYÊN TỬ bằng một câu UPDATE có điều kiện
 * (hai request song song cùng một mã => đúng một cái thành công).
 */
export const TOTP_PERIOD_S = 30;
export const TOTP_WINDOW = 1;
const ISSUER = 'Bé Cu Tít Quản trị';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Exec = Db | Tx;

function totpOf(secretBase32: string, label: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: TOTP_PERIOD_S,
    secret: OTPAuth.Secret.fromBase32(secretBase32)
  });
}

/** Bí mật mới 160 bit (base32) + URL otpauth:// cho mã QR */
export function newTotpSecret(label: string): { secret: string; otpauthUrl: string } {
  const secret = new OTPAuth.Secret({ size: 20 });
  return { secret: secret.base32, otpauthUrl: totpOf(secret.base32, label).toString() };
}

/** Bước (counter) khớp với mã trong cửa sổ ±1; null = sai. Không đụng DB. */
export function matchTotpStep(secretBase32: string, code: string, now: Date): number | null {
  const totp = totpOf(secretBase32, 'x');
  const delta = totp.validate({ token: code, timestamp: now.getTime(), window: TOTP_WINDOW });
  if (delta === null) return null;
  return Math.floor(now.getTime() / 1000 / TOTP_PERIOD_S) + delta;
}

export interface TotpRow {
  userId: string;
  secretEnc: Buffer;
  confirmedAt: Date | null;
  lastUsedStep: number;
  backupHashes: string[];
}

export async function getTotpRow(db: Exec, userId: string): Promise<TotpRow | null> {
  const [row] = await db.select().from(schema.staffTotp).where(eq(schema.staffTotp.userId, userId));
  return row ? { ...row, secretEnc: Buffer.from(row.secretEnc) } : null;
}

/**
 * Đăng ký lần đầu: tạo/ghi đè bí mật CHƯA xác nhận. Upsert có điều kiện `confirmed_at IS NULL` => không bao giờ ghi đè bí mật đã xác nhận
 * (kể cả khi chạy đua với `confirm`). null = đã xác nhận rồi (nơi gọi trả 403).
 */
export async function enrollTotp(db: Exec, crypto: AdminCrypto, userId: string, label: string): Promise<{ secret: string; otpauthUrl: string } | null> {
  const fresh = newTotpSecret(label);
  const t = schema.staffTotp;
  const rows = await db
    .insert(t)
    .values({ userId, secretEnc: crypto.encryptSecret(fresh.secret, userId), confirmedAt: null, lastUsedStep: 0, backupHashes: [] })
    .onConflictDoUpdate({
      target: t.userId,
      set: { secretEnc: crypto.encryptSecret(fresh.secret, userId), lastUsedStep: 0, backupHashes: [] },
      setWhere: isNull(t.confirmedAt)
    })
    .returning({ userId: t.userId });
  return rows.length ? fresh : null;
}

/**
 * Xác nhận lần đầu bằng mã 6 số: thành công => đặt `confirmed_at`, ghi bước đã dùng, lưu BĂM 10 mã dự phòng và trả mã nguyên văn (hiện một lần).
 * UPDATE chỉ khớp khi `confirmed_at IS NULL`, bước chưa dùng và bí mật vẫn là bản vừa kiểm => hai confirm song song chỉ một cái nhận được mã dự phòng.
 * Trả null nếu sai mã / đã xác nhận.
 */
export async function confirmTotp(db: Exec, crypto: AdminCrypto, userId: string, code: string, now: Date): Promise<string[] | null> {
  const row = await getTotpRow(db, userId);
  if (!row || row.confirmedAt) return null;
  const secret = crypto.decryptSecret(row.secretEnc, userId);
  if (!secret) return null;
  const step = matchTotpStep(secret, code, now);
  if (step === null) return null;
  const codes = Array.from({ length: ADMIN_BACKUP_CODE_COUNT }, () => newBackupCode());
  const t = schema.staffTotp;
  const rows = await db
    .update(t)
    .set({ confirmedAt: now, lastUsedStep: step, backupHashes: codes.map((c) => crypto.hashBackupCode(c)) })
    .where(and(eq(t.userId, userId), isNull(t.confirmedAt), lt(t.lastUsedStep, step), eq(t.secretEnc, row.secretEnc)))
    .returning({ userId: t.userId });
  return rows.length ? codes : null;
}

/** Kiểm mã 6 số của người đã xác nhận; chặn dùng lại bằng `last_used_step` nguyên tử. true = nhận. */
export async function verifyTotpCode(db: Exec, crypto: AdminCrypto, userId: string, code: string, now: Date): Promise<boolean> {
  const row = await getTotpRow(db, userId);
  if (!row || !row.confirmedAt) return false;
  const secret = crypto.decryptSecret(row.secretEnc, userId);
  if (!secret) return false;
  const step = matchTotpStep(secret, code, now);
  if (step === null) return false;
  const t = schema.staffTotp;
  const rows = await db
    .update(t)
    .set({ lastUsedStep: step })
    .where(and(eq(t.userId, userId), lt(t.lastUsedStep, step)))
    .returning({ userId: t.userId });
  return rows.length > 0;
}

/** Dùng một mã dự phòng (một lần): gỡ băm khỏi mảng bằng một câu UPDATE nguyên tử. true = nhận. */
export async function consumeBackupCode(db: Exec, crypto: AdminCrypto, userId: string, backupCode: string): Promise<boolean> {
  const h = crypto.hashBackupCode(backupCode);
  const t = schema.staffTotp;
  const rows = await db
    .update(t)
    .set({ backupHashes: sql`array_remove(${t.backupHashes}, ${h})` })
    .where(and(eq(t.userId, userId), sql`${t.confirmedAt} is not null`, sql`${h} = any(${t.backupHashes})`))
    .returning({ userId: t.userId });
  return rows.length > 0;
}
