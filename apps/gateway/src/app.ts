import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import type { GatewayConfig } from './config.js';
import { RequestPipeline } from './pipeline/RequestPipeline.js';
import type { Clock, GlobalQuotaStore, QuotaStore } from './pipeline/QuotaStore.js';
import { DbGlobalQuotaStore, DbQuotaStore } from './pipeline/DbQuotaStore.js';
import { TTSCacheProxy, fileSynthesizer } from './cache/TTSCacheProxy.js';
import { createTtsProvider, type TtsProvider } from './providers/tts.js';
import { FileAudioStore } from './services/tts/audioStore.js';
import { audioRoutes } from './routes/audio.js';
import type { LlmProvider } from './providers/llm.js';
import { createAiProviders } from './providers/registry.js';
import { createSttProvider, type SttProvider } from './providers/stt.js';
import { createTutor, type Tutor } from './services/chat/tutor.js';
import { chatRoutes } from './routes/chat.js';
import { speechRoutes } from './routes/speech.js';
import { practiceRoutes } from './routes/practice.js';
import { contentRoutes } from './routes/content.js';
import { authRoutes } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { quotaRoutes } from './routes/quota.js';
import { friendsRoutes } from './routes/friends.js';
import { createDbProvider, type DbProvider } from './db/client.js';
import { AuditLog, purgeAuditEvents } from './services/audit/audit.js';

/** Dọn audit_events quá hạn: mỗi ngày một lần, lần đầu sau 1 phút (không mở DB lúc khởi động/test) */
const AUDIT_PURGE_FIRST_MS = 60_000;
const AUDIT_PURGE_EVERY_MS = 24 * 3600 * 1000;

declare module 'fastify' {
  interface FastifyInstance {
    /** Nhật ký sự kiện bảo mật (test dùng `app.audit.flush()`) */
    audit: AuditLog;
  }
}

export interface RouteDeps {
  pipeline: RequestPipeline;
  ttsCache: TTSCacheProxy;
  config: GatewayConfig;
  /** null = chưa cấu hình nhà cung cấp AI => các route dùng bộ giả lập, gắn mock: true */
  llm: LlmProvider | null;
  /** Chuỗi dự phòng cho ảnh (VISION_CHAIN). null = chưa cấu hình => nhãn mẫu, mock: true */
  vision: LlmProvider | null;
  /** null = chưa có nhà cung cấp STT => route giọng nói trả mock: true (GĐ2) */
  stt: SttProvider | null;
  /** null = TTS tắt (mặc định; bật bằng TTS_PROVIDER=gemini) — tệp dựng sẵn vẫn phục vụ được */
  tts: TtsProvider | null;
  tutor: Tutor;
  /** DB mở lười: chỉ route cần dữ liệu người học mới mở */
  db: DbProvider;
  /** Nhật ký sự kiện bảo mật (ghi bất đồng bộ, lỗi ghi không làm hỏng request) */
  audit: AuditLog;
}

export interface BuildOptions {
  logger?: boolean;
  quotaStore?: QuotaStore;
  /** Test tiêm kho trần toàn cục; bỏ trống = DB */
  globalQuotaStore?: GlobalQuotaStore;
  /** Test tiêm đồng hồ cho khóa ngày hạn mức / resetAt; bỏ trống = giờ thật */
  clock?: Clock;
  ttsCache?: TTSCacheProxy;
  /** Test tiêm nhà cung cấp giả; bỏ trống = theo cấu hình (GEMINI_API_KEY) */
  llm?: LlmProvider | null;
  /** Test tiêm vision giả; bỏ trống = theo `llm` nếu có tiêm, ngược lại theo VISION_CHAIN */
  vision?: LlmProvider | null;
  /** Test tiêm STT giả; bỏ trống = STT qua LLM (nếu có) */
  stt?: SttProvider | null;
  /** Test tiêm TTS giả; bỏ trống = theo cấu hình TTS_PROVIDER */
  tts?: TtsProvider | null;
  /** Test tiêm DB dùng chung; bỏ trống = theo cấu hình (DATABASE_URL hoặc PGlite) và tự đóng khi app đóng */
  db?: DbProvider;
}

export async function buildApp(config: GatewayConfig, opts: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? true,
    bodyLimit: 1024 * 1024, // 1MB cho JSON thường; route âm thanh nâng riêng
    trustProxy: config.NODE_ENV === 'production'
  });

  await app.register(helmet, { contentSecurityPolicy: false }); // API JSON thuần, không phục vụ HTML

  // Chỉ cho phép đúng các origin cấu hình; request không có Origin (app native, curl) vẫn đi qua
  // và sẽ bị chặn ở bước xác thực nếu cần.
  const allowed = new Set(config.corsOrigins);
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
    credentials: false
  });

  // Âm thanh tải lên dạng nhị phân (multipart), không base64: giới hạn chặt để chống lạm dụng
  await app.register(multipart, {
    limits: { fileSize: config.AUDIO_BODY_LIMIT_MB * 1024 * 1024, files: 1, fields: 10, fieldSize: 1024, parts: 12 }
  });

  if (config.JWT_SECRET) {
    await app.register(jwt, { secret: config.JWT_SECRET });
  }
  if (config.jwtSecretGenerated) app.log.warn('JWT_SECRET chưa đặt: dùng khóa ngẫu nhiên cho phiên chạy này (chỉ dev/test)');

  const db = opts.db ?? createDbProvider(config);
  const audit = new AuditLog(db, { salt: config.AUDIT_IP_SALT ?? '', log: app.log });
  app.decorate('audit', audit);

  const purge = () =>
    db
      .get()
      .then((d) => purgeAuditEvents(d))
      .then((n) => n && app.log.info({ deleted: n }, 'audit_events purged'))
      .catch((err: unknown) => app.log.warn({ err }, 'audit purge failed'));
  let purgeTimer: NodeJS.Timeout | undefined = setTimeout(() => {
    void purge();
    purgeTimer = setInterval(() => void purge(), AUDIT_PURGE_EVERY_MS).unref();
  }, AUDIT_PURGE_FIRST_MS).unref();

  // Ghi nốt nhật ký đang dở TRƯỚC khi đóng DB (DB tiêm từ test thì test tự đóng)
  app.addHook('onClose', async () => {
    clearTimeout(purgeTimer);
    clearInterval(purgeTimer);
    purgeTimer = undefined;
    await audit.flush();
    if (!opts.db) await db.close();
  });

  const pipeline = new RequestPipeline(config, opts.quotaStore ?? new DbQuotaStore(db, opts.clock), db, audit, opts.globalQuotaStore ?? new DbGlobalQuotaStore(db, opts.clock), opts.clock);
  // Chuỗi dự phòng dựng từ LLM_CHAIN / VISION_CHAIN / STT_CHAIN (providers/registry.ts); test tiêm bản giả thì dùng bản giả
  const needChains = opts.llm === undefined || opts.stt === undefined || opts.vision === undefined;
  const chains = needChains ? createAiProviders(config, { log: app.log }) : null;
  const llm = opts.llm !== undefined ? opts.llm : (chains?.llm ?? null);
  const vision = opts.vision !== undefined ? opts.vision : opts.llm !== undefined ? opts.llm : (chains?.vision ?? null);
  const stt = opts.stt !== undefined ? opts.stt : opts.llm !== undefined ? createSttProvider(opts.llm) : (chains?.stt ?? null);
  const tts = opts.tts !== undefined ? opts.tts : createTtsProvider(config);
  const audioStore = new FileAudioStore(config.TTS_AUDIO_DIR);
  const ttsCache = opts.ttsCache ?? new TTSCacheProxy(fileSynthesizer(audioStore, tts), Boolean(tts));
  const deps: RouteDeps = { pipeline, ttsCache, config, llm, vision, stt, tts, tutor: createTutor(llm, app.log), db, audit };
  app.log.info({ llm: llm?.name ?? 'mock', vision: vision?.name ?? 'mock', stt: stt?.name ?? 'mock' }, 'AI providers');

  // Phải đặt trước khi đăng ký các scope con để chúng thừa hưởng
  app.setErrorHandler((error, request, reply) => {
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    // AI bận (hết chuỗi dự phòng) là tình huống vận hành bình thường: cảnh báo gọn, không in stack như lỗi chương trình
    if ((error as { code?: string }).code === 'llm_busy') request.log.warn({ code: 'llm_busy', providerCalls: (error as { providerCalls?: number }).providerCalls }, 'AI busy');
    else if (status >= 500) request.log.error({ err: error }, 'gateway error');
    const code = (error as { code?: string }).code;
    reply.status(status).send({
      error: status >= 500 && !code ? 'internal_error' : code ?? 'error',
      // GatewayError.details: trường máy đọc được (vd. quota_exceeded => capability, resetAt)
      ...(error as { details?: Record<string, unknown> }).details,
      message: status >= 500 && config.NODE_ENV === 'production' ? undefined : error.message
    });
  });

  // Âm thanh dựng sẵn: công khai, ngoài /v1 (xem routes/audio.ts)
  await app.register(audioRoutes, { store: audioStore });

  app.get('/healthz', async () => ({ status: 'healthy', timestamp: new Date().toISOString() }));

  // /v1/auth/*: nơi lấy token => không xác thực, nhưng giới hạn chặt theo IP
  await app.register(
    async (auth) => {
      await auth.register(rateLimit, {
        max: config.AUTH_RATE_LIMIT_PER_MINUTE,
        timeWindow: '1 minute',
        keyGenerator: (req) => req.ip,
        // Gọi ở MỌI request vượt giới hạn => AuditLog gộp còn một dòng mỗi IP mỗi cửa sổ
        onExceeded: (req) => audit.noteRateLimited(AuditLog.context(req), req.url.split('?')[0])
      });
      await auth.register(authRoutes, deps);
    },
    { prefix: '/v1/auth' }
  );

  // Mọi route nghiệp vụ khác nằm trong scope /v1 có hook xác thực + rate limit theo người dùng
  await app.register(
    async (v1) => {
      v1.addHook('onRequest', pipeline.authenticate);
      await v1.register(rateLimit, {
        max: config.RATE_LIMIT_PER_MINUTE,
        timeWindow: '1 minute',
        // Khóa theo người dùng thay vì IP: người dùng mobile sau NAT nhà mạng dùng chung IP
        keyGenerator: (req) => req.principal?.id ?? req.ip
      });
      await v1.register(chatRoutes, deps);
      await v1.register(speechRoutes, deps);
      await v1.register(practiceRoutes, deps);
      await v1.register(contentRoutes, deps);
      await v1.register(meRoutes, deps);
      await v1.register(quotaRoutes, deps);
      await v1.register(friendsRoutes, deps);
    },
    { prefix: '/v1' }
  );

  return app;
}
