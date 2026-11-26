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
/** ~/.becutit/blobs: tệp đính kèm góp ý (dự án 5a), NGOÀI repo */
const DEFAULT_BLOB_DIR = join(homedir(), '.becutit', 'blobs');
/** apps/gateway/config/app-versions.json: phiên bản app mới nhất/tối thiểu theo kênh (dự án 8) */
const DEFAULT_APP_VERSIONS_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'config', 'app-versions.json');

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

/** Khóa 32 byte từ hex (64 ký tự) hoặc base64 (44 ký tự); không hợp lệ => null */
export function decodeKey32(v: string): Buffer | null {
  const s = v.trim();
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, 'hex');
  if (/^[A-Za-z0-9+/]{43}=$/.test(s)) {
    const b = Buffer.from(s, 'base64');
    return b.length === 32 ? b : null;
  }
  return null;
}

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
    /** Thời gian chừa cho MỖI nguồn dự phòng phía sau khi gọi một nguồn (nguồn đầu chậm không ăn hết LLM_CHAIN_BUDGET_MS) */
    AI_CHAIN_RESERVE_MS: z.coerce.number().int().min(0).max(5000).default(3000),
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
    PUBLIC_BASE_URL: z.string().url().optional(),
    // ---- Dự án 3: mật khẩu, OTP email, gửi mail (spec docs/superpowers/specs/2026-11-21-dang-nhap-design.md) ----
    /**
     * Muối HMAC cho mã OTP email + khóa bộ đếm giới hạn (IP, tên đăng nhập, email). Production bắt buộc (≥ 32 ký tự).
     * Đổi pepper => mọi mã OTP đang chờ và bộ đếm hết hiệu lực (không mất dữ liệu người dùng).
     */
    AUTH_OTP_PEPPER: z.string().min(32, 'AUTH_OTP_PEPPER phải dài tối thiểu 32 ký tự').optional(),
    /** Làm chậm (không khóa) khi một tên đăng nhập bị sai > 50 lần/giờ từ nhiều IP (ms) */
    AUTH_LOGIN_SLOWDOWN_MS: z.coerce.number().int().min(0).max(10_000).default(2000),
    /**
     * Gửi mail (Nguyên tắc 4: đổi nhà cung cấp qua env). 'none' (mặc định, chưa có mật khẩu ứng dụng Gmail) => mọi luồng
     * cần mail trả provider_unavailable, quên mật khẩu vẫn 202 và giao diện chỉ đường mã dự phòng.
     */
    MAIL_PROVIDER: z.enum(['none', 'gmail-smtp']).default('none'),
    /** Địa chỉ người gửi; vắng => MAIL_SMTP_USER */
    MAIL_FROM: z.string().min(3).max(200).optional(),
    MAIL_SMTP_USER: z.string().email().optional(),
    /** Mật khẩu ứng dụng Gmail (16 ký tự) — chỉ ở server */
    MAIL_SMTP_PASS: z.string().min(8).optional(),
    /** Trần thư/ngày (giờ VN) cả app — chừa dư dưới mức ~500/ngày của Gmail. Hết trần => provider_unavailable */
    MAIL_DAILY_CAP: z.coerce.number().int().min(0).default(450),
    /** Trần thư/ngày MỖI NGƯỜI DÙNG ở luồng gắn email (/v1/me/email/start) — một tài khoản không đốt được trần chung (rà PR #18 mục 2) */
    MAIL_USER_DAILY_CAP: z.coerce.number().int().min(1).default(5),
    /** Phần trần chung dành riêng cho quên/đặt lại mật khẩu: luồng gắn email chỉ dùng tới cap × (1 − tỉ lệ) */
    MAIL_RESET_RESERVE_RATIO: z.coerce.number().min(0).max(0.9).default(0.2),
    /** Hạn mức AI của khách = hệ số × hạn mức tài khoản thật (khuyến khích đăng nhập; spec mục 6) */
    GUEST_QUOTA_FACTOR: z.coerce.number().min(0).max(1).default(0.5),
    // ---- Dự án 8: cập nhật ứng dụng (spec docs/superpowers/specs/2026-11-21-cap-nhat-ung-dung-design.md mục 5.3) ----
    /** Tệp phiên bản app theo kênh; mặc định config/app-versions.json cạnh gói */
    APP_VERSIONS_FILE: z.string().optional(),
    /** Đọc lại tệp phiên bản sau chừng này ms (e2e đặt 0) */
    APP_VERSIONS_TTL_MS: z.coerce.number().int().min(0).default(60_000),
    /** Giới hạn theo IP cho GET /v1/app/version */
    APP_VERSION_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(30),
    /** Host (cách nhau bằng dấu phẩy) được phép trong apkFile.url của kênh apk; rỗng = không cho phép apkFile */
    APK_DOWNLOAD_HOSTS: z.string().default(''),
    // ---- Dự án 4 (Task 5): WebSocket /ws ----
    /** Cờ chat/gọi. Mặc định: TẮT ở production, BẬT ở dev/test. Tắt => /ws không đăng ký (404). (Task 4 dùng chung cờ này.) */
    CHAT_ENABLED: boolFromEnv.optional(),
    /** Giới hạn bắt tay GET /ws theo IP (số lần nối/phút); sau khi nối còn giới hạn khung/giây theo kết nối */
    WS_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(30),
    // ---- Dự án 5a: trang quản trị /admin/v1 (spec docs/superpowers/specs/2026-11-21-gop-y-bao-loi-design.md mục 5.4) ----
    /** Bật khối /admin/v1. Mặc định: TẮT ở production, BẬT ở dev/test. Tắt => các đường dẫn /admin/v1 trả 404 (không đăng ký) */
    ADMIN_API_ENABLED: boolFromEnv.optional(),
    /** Nguồn CORS DUY NHẤT của /admin/v1 (có credentials); /v1 không bao giờ nhận nguồn này. Chỉ gồm giao thức + máy chủ + cổng */
    ADMIN_ORIGIN: z
      .string()
      .url()
      .refine((v) => /^https?:$/.test(new URL(v).protocol), 'ADMIN_ORIGIN phải là http(s)')
      .refine((v) => new URL(v).pathname === '/' && !new URL(v).search && !new URL(v).hash, 'ADMIN_ORIGIN chỉ gồm giao thức + máy chủ + cổng')
      .transform((v) => new URL(v).origin)
      .default('http://localhost:5180'),
    /**
     * Khóa AES-256-GCM mã hóa bí mật TOTP: ĐÚNG 32 byte, viết dạng hex (64 ký tự) hoặc base64 (44 ký tự).
     * KHÔNG sinh ngẫu nhiên khi thiếu (bí mật đã mã hóa sẽ không giải mã được sau khi khởi động lại). Thiếu => /admin/v1 trả 503 admin_disabled.
     * Đổi khóa => mọi người phải đăng ký lại mã 6 số (chạy admin:reset-totp). Không bao giờ ghi vào log.
     */
    ADMIN_MFA_KEY: z
      .string()
      .refine((v) => decodeKey32(v) !== null, 'ADMIN_MFA_KEY phải là đúng 32 byte, dạng hex (64 ký tự) hoặc base64 (44 ký tự)')
      .optional(),
    /** Khóa ký access JWT quản trị (typ:'admin'), RIÊNG với JWT_SECRET. Thiếu => /admin/v1 trả 503 admin_disabled */
    ADMIN_JWT_SECRET: z.string().min(32, 'ADMIN_JWT_SECRET phải dài tối thiểu 32 ký tự').optional(),
    /** Khóa HMAC ký URL tệp đính kèm cho quản trị (sống 5 phút), RIÊNG với mọi khóa khác. Thiếu => chỉ cấp URL tệp và /admin/v1/blob trả 503 admin_disabled */
    ADMIN_BLOB_URL_SECRET: z.string().min(32, 'ADMIN_BLOB_URL_SECRET phải dài tối thiểu 32 ký tự').optional(),
    /** Giới hạn theo IP mỗi phút cho các route quản trị cần đăng nhập (hàng chờ, chi tiết, nhật ký) */
    ADMIN_API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
    /** Giới hạn theo IP mỗi phút cho /admin/v1/blob (không cần đăng nhập, chữ ký là xác thực) */
    ADMIN_BLOB_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
    // ---- Dự án 5a: góp ý/báo lỗi + kho tệp (spec docs/superpowers/specs/2026-11-21-gop-y-bao-loi-design.md §5.3) ----
    /** Kho tệp đính kèm. `fs` (mặc định, dev/test) hoặc `r2` (làm ở dự án triển khai) */
    BLOB_PROVIDER: z.enum(['fs', 'r2']).default('fs'),
    /** Thư mục kho tệp `fs`; mặc định ~/.becutit/blobs (ngoài repo) */
    BLOB_DIR: z.string().min(1).optional(),
    /** Trần dung lượng kho tệp (MB). Vượt => 507 storage_full cho yêu cầu CÓ tệp; bản chỉ có chữ vẫn nhận */
    BLOB_TOTAL_CAP_MB: z.coerce.number().positive().default(8000),
    /** Giới hạn số lần gửi góp ý theo IP mỗi giờ (cộng 5 góp ý/người/ngày) */
    FEEDBACK_IP_PER_HOUR: z.coerce.number().int().positive().default(20),
    // ---- Dự án 4: bạn bè (chat, gọi, nhóm) ----
    /** Trần số yêu cầu/phút/người cho các route chat (cao hơn RATE_LIMIT_PER_MINUTE chung vì tải chat > 60/phút; chống spam thật nằm ở ChatLimiter) */
    CHAT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(600)
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
    AUTH_OTP_PEPPER: env.AUTH_OTP_PEPPER ?? (env.NODE_ENV === 'production' ? undefined : randomBytes(32).toString('hex')),
    PGLITE_DIR: env.PGLITE_DIR ?? (env.NODE_ENV === 'test' ? 'memory://' : DEFAULT_PGLITE_DIR),
    TTS_AUDIO_DIR: env.TTS_AUDIO_DIR ?? DEFAULT_TTS_AUDIO_DIR,
    BLOB_DIR: env.BLOB_DIR ?? DEFAULT_BLOB_DIR,
    APP_VERSIONS_FILE: env.APP_VERSIONS_FILE ?? DEFAULT_APP_VERSIONS_FILE,
    ADMIN_API_ENABLED: env.ADMIN_API_ENABLED ?? env.NODE_ENV !== 'production',
    CHAT_ENABLED: env.CHAT_ENABLED ?? env.NODE_ENV !== 'production',
    apkDownloadHosts: env.APK_DOWNLOAD_HOSTS.split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
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
    if (!env.AUTH_OTP_PEPPER) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_OTP_PEPPER'],
        message: 'Production bắt buộc cấu hình AUTH_OTP_PEPPER (≥ 32 ký tự, khác JWT_SECRET)'
      });
    }
    if (env.MAIL_PROVIDER === 'gmail-smtp' && (!env.MAIL_SMTP_USER || !env.MAIL_SMTP_PASS)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MAIL_SMTP_USER'],
        message: 'MAIL_PROVIDER=gmail-smtp cần MAIL_SMTP_USER và MAIL_SMTP_PASS (mật khẩu ứng dụng Gmail)'
      });
    }
    if (env.ADMIN_JWT_SECRET && (env.ADMIN_JWT_SECRET === env.JWT_SECRET || env.ADMIN_JWT_SECRET === env.AUDIT_IP_SALT || env.ADMIN_JWT_SECRET === env.AUTH_OTP_PEPPER)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ADMIN_JWT_SECRET'],
        message: 'ADMIN_JWT_SECRET phải khác JWT_SECRET, AUDIT_IP_SALT và AUTH_OTP_PEPPER (tách khóa quản trị khỏi khóa app)'
      });
    }
    if (env.ADMIN_BLOB_URL_SECRET && [env.JWT_SECRET, env.AUDIT_IP_SALT, env.AUTH_OTP_PEPPER, env.ADMIN_JWT_SECRET].includes(env.ADMIN_BLOB_URL_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ADMIN_BLOB_URL_SECRET'],
        message: 'ADMIN_BLOB_URL_SECRET phải khác JWT_SECRET, AUDIT_IP_SALT, AUTH_OTP_PEPPER và ADMIN_JWT_SECRET'
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
