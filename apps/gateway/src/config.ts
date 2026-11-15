import 'dotenv/config';
import { z } from 'zod';

/**
 * Cấu hình Gateway đọc từ biến môi trường và được xác thực bằng Zod ngay khi khởi động.
 * Thiếu hoặc sai cấu hình => dừng tiến trình sớm thay vì chạy với giá trị nguy hiểm.
 */
const boolFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

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
    AUDIO_BODY_LIMIT_MB: z.coerce.number().positive().default(8)
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
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Cấu hình Gateway không hợp lệ:\n  ${detail}`);
  }
  return parsed.data;
}
