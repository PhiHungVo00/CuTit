import { config as loadDotenv } from 'dotenv';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * Thứ tự nạp biến môi trường (biến đã có thì KHÔNG bị ghi đè):
 * 1. Biến môi trường của tiến trình (CI, server thật)
 * 2. apps/gateway/.env của checkout hiện tại (gitignored)
 * 3. Tệp dùng chung cho mọi checkout/worktree trên máy dev, NGOÀI repo:
 *    %USERPROFILE%\.becutit\gateway.env (Windows) hoặc ~/.becutit/gateway.env — đặt API key ở đây
 *    để không phải chép lại sau mỗi lần merge/tạo worktree. Đổi vị trí bằng BECUTIT_ENV_FILE.
 */
loadDotenv();
loadDotenv({ path: process.env.BECUTIT_ENV_FILE ?? join(homedir(), '.becutit', 'gateway.env') });

/**
 * Cấu hình Gateway đọc từ biến môi trường và được xác thực bằng Zod ngay khi khởi động.
 * Thiếu hoặc sai cấu hình => dừng tiến trình sớm thay vì chạy với giá trị nguy hiểm.
 */
const boolFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

/** Dòng `KEY=` để trống trong .env nghĩa là "chưa đặt", không phải chuỗi rỗng. */
const blankToUndefined = (source: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v.trim() !== ''));

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    HOST: z.string().default('0.0.0.0'),
    CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:5173'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET phải dài tối thiểu 32 ký tự').optional(),
    AUTH_REQUIRED: boolFromEnv.optional(),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
    MAX_TTS_CHARS_PER_DAY: z.coerce.number().int().positive().default(15000),
    MAX_STT_SECONDS_PER_DAY: z.coerce.number().int().positive().default(600),
    MAX_LLM_TOKENS_PER_DAY: z.coerce.number().int().positive().default(100000),
    AUDIO_BODY_LIMIT_MB: z.coerce.number().positive().default(8),
    // LLM + Vision (Nguyên tắc 1, 2, 4): khóa chỉ nằm ở server. Không đặt => Gateway dùng bộ giả lập (mock: true)
    // Giá trị giữ chỗ trong .env cũ (vd. "AIzaSy...") hoặc quá ngắn => coi như CHƯA cấu hình (chạy bộ giả lập),
    // không làm Gateway từ chối khởi động
    GEMINI_API_KEY: z
      .string()
      .optional()
      .transform((v) => (v && v.length >= 20 && !v.includes('...') ? v : undefined)),
    GEMINI_MODEL: z.string().regex(/^[a-z0-9.-]+$/).default('gemini-3.5-flash-lite'),
    LLM_TIMEOUT_MS: z.coerce.number().int().positive().max(9000, "LLM_TIMEOUT_MS phải nhỏ hơn timeout 10 giây của client (ảnh, giọng nói)").default(8000)
  })
  .transform((env) => ({
    ...env,
    // Mặc định: production bắt buộc xác thực, môi trường dev cho phép khách ẩn danh
    AUTH_REQUIRED: env.AUTH_REQUIRED ?? env.NODE_ENV === 'production',
    corsOrigins: env.CORS_ORIGIN.split(',')
      .map((o) => o.trim())
      .filter(Boolean)
  }))
  .superRefine((env, ctx) => {
    if (env.AUTH_REQUIRED && !env.JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'AUTH_REQUIRED=true nhưng chưa cấu hình JWT_SECRET'
      });
    }
    if (env.corsOrigins.includes('*')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGIN'],
        message: 'Không cho phép wildcard "*" trong CORS_ORIGIN'
      });
    }
  });

export type GatewayConfig = z.infer<typeof EnvSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const parsed = EnvSchema.safeParse(blankToUndefined(source));
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Cấu hình Gateway không hợp lệ:\n  ${detail}`);
  }
  return parsed.data;
}
