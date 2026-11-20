import { config as loadDotenv } from 'dotenv';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
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
/** apps/gateway/.data/pglite (tính từ dist/ hoặc src/, không phụ thuộc thư mục chạy lệnh) */
const DEFAULT_PGLITE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.data', 'pglite');
/** apps/gateway/.data/tts: âm thanh dựng sẵn (GĐ2), không commit */
const DEFAULT_TTS_AUDIO_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.data', 'tts');

const boolFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

/** Dòng `KEY=` để trống trong .env nghĩa là "chưa đặt", không phải chuỗi rỗng. */
const blankToUndefined = (source: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v.trim() !== ''));

/** `a,b:model,c:org/model:free` — ký tự cho tên + model (có `/`, `:`, `.`, `-`, `_`, `@`) */
const CHAIN_RE = /^[\w.@/-]+(:[\w.@/:+-]+)?(,[\w.@/-]+(:[\w.@/:+-]+)?)*$/;

/** Biến môi trường của các nhà cung cấp AI kiểu OpenAI-compatible (khóa, URL, chế độ JSON): đọc trực tiếp ở providers/registry.ts */
const AI_ENV_RE = /^[A-Z][A-Z0-9_]*_(API_KEY|API_TOKEN|BASE_URL|JSON_MODE|ACCOUNT_ID)$/;

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    HOST: z.string().default('0.0.0.0'),
    CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:5173'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET phải dài tối thiểu 32 ký tự').optional(),
    AUTH_REQUIRED: boolFromEnv.optional(),
    /**
     * Muối HMAC băm IP trong nhật ký bảo mật `audit_events` (không lưu IP thô). Production bắt buộc; KHÔNG đổi khi
     * xoay JWT_SECRET lúc xử lý sự cố (đổi muối => không đối chiếu được IP trước/sau). Dev/test thiếu => ngẫu nhiên mỗi lần chạy
     * (an toàn hơn muối cố định công khai nếu lỡ chạy server thật mà quên NODE_ENV=production).
     */
    AUDIT_IP_SALT: z.string().min(32, 'AUDIT_IP_SALT phải dài tối thiểu 32 ký tự').optional(),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
    /** Giới hạn theo IP cho /v1/auth/* (tạo khách = một hạn mức AI mới => phải chặt) */
    AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
    /** GĐ4c: tạo / nhập mã mời bạn học — mỗi route, mỗi người, mỗi phút (chống dò mã) */
    FRIEND_INVITE_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(5),
    /** Production: Postgres (Neon/Supabase). Không đặt => PGlite nhúng */
    DATABASE_URL: z.string().url().optional(),
    /** Thư mục dữ liệu PGlite, hoặc `memory://` (mặc định khi NODE_ENV=test) */
    PGLITE_DIR: z.string().optional(),
    MAX_TTS_CHARS_PER_DAY: z.coerce.number().int().positive().default(15000),
    MAX_STT_SECONDS_PER_DAY: z.coerce.number().int().positive().default(600),
    MAX_LLM_TOKENS_PER_DAY: z.coerce.number().int().positive().default(100000),
    /** GĐ3: số lượt hội thoại AI (chat, nhập vai, gọi thoại) mỗi tài khoản mỗi ngày UTC */
    MAX_CHAT_TURNS_PER_DAY: z.coerce.number().int().positive().default(60),
    /**
     * TRẦN DÙNG CHUNG CẢ APP mỗi ngày (giờ Việt Nam), tách khỏi hạn mức từng người: chặn cả app đốt hết hạn mức miễn phí
     * của nhà cung cấp AI. 0 = không giới hạn. Mặc định ≈ hạn mức hàng ngày của tầng miễn phí hay gặp (Groq: 1 000 yêu cầu,
     * 8 giờ âm thanh). Hết trần => 429 quota_exceeded kèm scope: "global" (không trừ gì của người dùng).
     */
    GLOBAL_MAX_TURNS_PER_DAY: z.coerce.number().int().min(0).default(2000),
    GLOBAL_MAX_LLM_TOKENS_PER_DAY: z.coerce.number().int().min(0).default(4_000_000),
    GLOBAL_MAX_STT_SECONDS_PER_DAY: z.coerce.number().int().min(0).default(28_800),
    GLOBAL_MAX_VISION_PER_DAY: z.coerce.number().int().min(0).default(500),
    AUDIO_BODY_LIMIT_MB: z.coerce.number().positive().default(8),
    // LLM + Vision (Nguyên tắc 1, 2, 4): khóa chỉ nằm ở server. Không đặt => Gateway dùng bộ giả lập (mock: true)
    // Giá trị giữ chỗ trong .env cũ (vd. "AIzaSy...") hoặc quá ngắn => coi như CHƯA cấu hình (chạy bộ giả lập),
    // không làm Gateway từ chối khởi động
    GEMINI_API_KEY: z
      .string()
      .optional()
      .transform((v) => (v && v.length >= 20 && !v.includes('...') ? v : undefined)),
    GEMINI_MODEL: z.string().regex(/^[a-z0-9.-]+$/).default('gemini-3.5-flash-lite'),
    LLM_TIMEOUT_MS: z.coerce.number().int().positive().max(9000, "LLM_TIMEOUT_MS phải nhỏ hơn timeout 10 giây của client (ảnh, giọng nói)").default(8000),
    // Chuỗi dự phòng theo năng lực: `nhà_cung_cấp[:model]` cách nhau bằng dấu phẩy, thử từ trái sang phải.
    // Vd. LLM_CHAIN=gemini,openrouter:google/gemma-3-27b-it:free,groq:openai/gpt-oss-120b (xem docs/van-hanh/AI-CHUOI-DU-PHONG.md)
    // Không đặt: LLM_CHAIN/STT_CHAIN/VISION_CHAIN = "gemini" nếu có GEMINI_API_KEY (hành vi cũ), không có => bộ giả lập.
    LLM_CHAIN: z.string().regex(CHAIN_RE, 'LLM_CHAIN: danh sách nhà_cung_cấp[:model] cách nhau bằng dấu phẩy').optional(),
    STT_CHAIN: z.string().regex(CHAIN_RE, 'STT_CHAIN: danh sách nhà_cung_cấp[:model] cách nhau bằng dấu phẩy').optional(),
    VISION_CHAIN: z.string().regex(CHAIN_RE, 'VISION_CHAIN: danh sách nhà_cung_cấp[:model] cách nhau bằng dấu phẩy').optional(),
    /** Tổng thời gian cho cả chuỗi (client chờ ~10 s): các nguồn chia nhau ngân sách này */
    LLM_CHAIN_BUDGET_MS: z.coerce.number().int().min(1000).max(9500).default(9000),
    /** Ngắt mạch: nghỉ bao lâu sau 429/lỗi cấu hình (ms), số lỗi tạm thời liên tiếp, thời gian nghỉ sau chuỗi lỗi đó */
    AI_BREAKER_MS: z.coerce.number().int().min(1000).default(180_000),
    AI_BREAKER_FAILURES: z.coerce.number().int().min(1).default(3),
    AI_BREAKER_TRANSIENT_MS: z.coerce.number().int().min(1000).default(60_000),
    /** Ngôn ngữ gợi ý cho STT kiểu Whisper */
    STT_LANGUAGE: z.string().regex(/^[a-z]{2,3}$/).default('vi'),
    // GĐ2 — TTS theo miền (D9). Mặc định TẮT kể cả khi có khóa: chỉ bật rõ ràng (vd. lúc chạy script dựng sẵn)
    // 'openai-compatible' = máy chủ kiểu OpenAI /v1/audio/speech (vd. tools/tts-local chạy VieNeu-TTS trên máy, miễn phí)
    TTS_PROVIDER: z.enum(['none', 'gemini', 'openai-compatible']).default('none'),
    GEMINI_TTS_MODEL: z.string().regex(/^[a-z0-9.-]+$/).default('gemini-3.8-flash-tts'),
    GEMINI_TTS_VOICE: z.string().regex(/^[A-Za-z]{2,30}$/).default('Kore'),
    /** Gốc API kiểu OpenAI (có /v1). Cùng máy chủ cung cấp /audio/transcriptions để script dựng sẵn kiểm lời đọc */
    TTS_BASE_URL: z.string().url().default('http://127.0.0.1:8765/v1'),
    TTS_MODEL: z.string().regex(/^[\w.-]{1,60}$/).default('vieneu-v3-turbo'),
    /** Giọng theo miền (tên giọng mẫu có dấu tiếng Việt, vd. “Thùy Dung”) */
    TTS_VOICE_NORTH: z.string().min(1).max(60).default('Trúc Ly'),
    TTS_VOICE_CENTRAL: z.string().min(1).max(60).default('Ngọc Trân'),
    TTS_VOICE_SOUTH: z.string().min(1).max(60).default('Thùy Dung'),
    /** Thư mục âm thanh dựng sẵn (<hash>.wav, packs/, state/) — gitignored */
    TTS_AUDIO_DIR: z.string().optional(),
    /** Gốc URL công khai của Gateway để trả audioUrl tuyệt đối (sau proxy). Không đặt => lấy từ Host của request */
    PUBLIC_BASE_URL: z.string().url().optional()
  })
  .transform((env) => ({
    ...env,
    // Mặc định BẬT ở mọi môi trường (người học nhận tài khoản khách qua POST /v1/auth/guest).
    // AUTH_REQUIRED=false chỉ dành cho test cô lập / thử nhanh: principal ẩn danh `anon:<ip>`.
    AUTH_REQUIRED: env.AUTH_REQUIRED ?? true,
    // Dev/test thiếu JWT_SECRET => sinh ngẫu nhiên mỗi lần chạy (access token cũ hết hiệu lực khi khởi động lại,
    // client tự làm mới bằng refresh token lưu trong DB). Production thiếu => lỗi ở superRefine.
    JWT_SECRET: env.JWT_SECRET ?? (env.NODE_ENV === 'production' ? undefined : randomBytes(32).toString('hex')),
    jwtSecretGenerated: !env.JWT_SECRET && env.NODE_ENV !== 'production',
    AUDIT_IP_SALT: env.AUDIT_IP_SALT ?? (env.NODE_ENV === 'production' ? undefined : randomBytes(32).toString('hex')),
    PGLITE_DIR: env.PGLITE_DIR ?? (env.NODE_ENV === 'test' ? 'memory://' : DEFAULT_PGLITE_DIR),
    TTS_AUDIO_DIR: env.TTS_AUDIO_DIR ?? DEFAULT_TTS_AUDIO_DIR,
    corsOrigins: env.CORS_ORIGIN.split(',')
      .map((o) => o.trim())
      .filter(Boolean)
  }))
  .superRefine((env, ctx) => {
    if (!env.JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'Production bắt buộc cấu hình JWT_SECRET (≥ 32 ký tự)'
      });
    }
    if (!env.AUDIT_IP_SALT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUDIT_IP_SALT'],
        message: 'Production bắt buộc cấu hình AUDIT_IP_SALT (≥ 32 ký tự, khác JWT_SECRET)'
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

export type GatewayConfig = z.infer<typeof EnvSchema> & {
  /** `<ID>_API_KEY` / `_BASE_URL` / `_JSON_MODE` / `CLOUDFLARE_ACCOUNT_ID`… (không dùng để log) */
  aiEnv: Record<string, string>;
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const parsed = EnvSchema.safeParse(blankToUndefined(source));
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Cấu hình Gateway không hợp lệ:\n  ${detail}`);
  }
  const aiEnv = Object.fromEntries(Object.entries(blankToUndefined(source)).filter(([k]) => AI_ENV_RE.test(k))) as Record<string, string>;
  return { ...parsed.data, aiEnv };
}
