import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import type { GatewayConfig } from './config.js';
import { RequestPipeline } from './pipeline/RequestPipeline.js';
import { InMemoryQuotaStore, QuotaStore } from './pipeline/QuotaStore.js';
import { TTSCacheProxy } from './cache/TTSCacheProxy.js';
import { createLlmProvider, type LlmProvider } from './providers/llm.js';
import { createTutor, type Tutor } from './services/chat/tutor.js';
import { chatRoutes } from './routes/chat.js';
import { speechRoutes } from './routes/speech.js';
import { practiceRoutes } from './routes/practice.js';
import { contentRoutes } from './routes/content.js';
import { authRoutes } from './routes/auth.js';
import { createDbProvider, type DbProvider } from './db/client.js';

export interface RouteDeps {
  pipeline: RequestPipeline;
  ttsCache: TTSCacheProxy;
  config: GatewayConfig;
  /** null = chưa cấu hình nhà cung cấp AI => các route dùng bộ giả lập, gắn mock: true */
  llm: LlmProvider | null;
  tutor: Tutor;
  /** DB mở lười: chỉ route cần dữ liệu người học mới mở */
  db: DbProvider;
}

export interface BuildOptions {
  logger?: boolean;
  quotaStore?: QuotaStore;
  ttsCache?: TTSCacheProxy;
  /** Test tiêm nhà cung cấp giả; bỏ trống = theo cấu hình (GEMINI_API_KEY) */
  llm?: LlmProvider | null;
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
  if (!opts.db) app.addHook('onClose', () => db.close());

  const pipeline = new RequestPipeline(config, opts.quotaStore ?? new InMemoryQuotaStore(), db);
  const llm = opts.llm !== undefined ? opts.llm : createLlmProvider(config);
  const deps: RouteDeps = { pipeline, ttsCache: opts.ttsCache ?? new TTSCacheProxy(), config, llm, tutor: createTutor(llm, app.log), db };
  app.log.info({ ai: llm ? `${llm.name}:${config.GEMINI_MODEL}` : 'mock' }, 'AI provider');

  // Phải đặt trước khi đăng ký các scope con để chúng thừa hưởng
  app.setErrorHandler((error, request, reply) => {
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) request.log.error({ err: error }, 'gateway error');
    const code = (error as { code?: string }).code;
    reply.status(status).send({
      error: status >= 500 && !code ? 'internal_error' : code ?? 'error',
      message: status >= 500 && config.NODE_ENV === 'production' ? undefined : error.message
    });
  });

  app.get('/healthz', async () => ({ status: 'healthy', timestamp: new Date().toISOString() }));

  // /v1/auth/*: nơi lấy token => không xác thực, nhưng giới hạn chặt theo IP
  await app.register(
    async (auth) => {
      await auth.register(rateLimit, { max: config.AUTH_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute', keyGenerator: (req) => req.ip });
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
    },
    { prefix: '/v1' }
  );

  return app;
}
