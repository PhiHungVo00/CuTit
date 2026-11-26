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
import { authLogoutRoutes, authRoutes } from './routes/auth.js';
import { purgeExpiredAccounts } from './services/auth/lifecycle.js';
import { meRoutes } from './routes/me.js';
import { quotaRoutes } from './routes/quota.js';
import { friendsRoutes } from './routes/friends.js';
import { identityAuthRoutes, identityRoutes } from './routes/identities.js';
import { createIdentityProviderFromEnv, type IdentityProvider } from './providers/identity.js';
import { authMeRoutes } from './routes/authMe.js';
import { appVersionRoutes } from './routes/appVersion.js';
import { createAppVersionStore } from './services/appVersion/store.js';
import { updateGate } from './services/appVersion/updateGate.js';
import { createMailProvider, type MailProvider } from './services/mail/MailProvider.js';
import { createDbProvider, type DbProvider } from './db/client.js';
import { AuditLog, purgeAuditEvents } from './services/audit/audit.js';
import { adminRoutes } from './routes/admin/index.js';
import { redactSignedUrl } from './lib/logRedact.js';
import { AdminAlerts } from './services/admin/alerts.js';
import { purgeAdminData } from './services/admin/purge.js';
import { feedbackRoutes } from './routes/feedback.js';
import { meAgeRoutes } from './routes/meAge.js';
import { createBlobStore } from './services/blob/index.js';
import type { BlobStore } from './services/blob/BlobStore.js';
import { startFeedbackPurgeJob } from './jobs/feedbackPurge.js';
import { chatSocialRoutes } from './routes/chatSocial.js';
import { pushTokenRoutes } from './routes/pushTokens.js';
import { createPushProvider, type PushProvider } from './services/push/PushProvider.js';
import { startPushNotifier, type PushNotifier } from './services/push/notify.js';
import { chatGroupRoutes } from './routes/chatGroups.js';
import type { ChatEligibilityFn } from './services/chat/eligibility.js';
import { chatEligibility } from './services/social/eligibility.js';
import { createChatLimiter, type ChatLimiter } from './services/chat/limits.js';
import websocket from '@fastify/websocket';
import type { RealtimeBus } from './services/realtime/RealtimeBus.js';
import { RealtimeHub, type RealtimeOptions } from './services/realtime/RealtimeHub.js';
import { buildAllowed, createWsVerifier } from './services/realtime/auth.js';
import { createDbDirectory } from './services/realtime/presence.js';
import { WS_SERVER_OPTIONS, wsRoutes } from './routes/ws.js';

/** Dọn audit_events quá hạn: mỗi ngày một lần, lần đầu sau 1 phút (không mở DB lúc khởi động/test) */
const AUDIT_PURGE_FIRST_MS = 60_000;
const AUDIT_PURGE_EVERY_MS = 24 * 3600 * 1000;
const ACCOUNT_PURGE_EVERY_MS = 3600 * 1000;

declare module 'fastify' {
  interface FastifyInstance {
    /** Nhật ký sự kiện bảo mật (test dùng `app.audit.flush()`) */
    audit: AuditLog;
    /** Dự án 5a: cảnh báo email quản trị (chỉ khi ADMIN_API_ENABLED); test dùng `app.adminAlerts?.flush()` */
    adminAlerts?: AdminAlerts;
    /** Dự án 4 (Task 10): bộ gửi thông báo đẩy (chỉ khi CHAT_ENABLED); test dùng `app.push?.flush()` */
    push?: PushNotifier;
    /** Dự án 4: bộ phát tin WebSocket (đóng kết nối khi thu hồi quyền: `app.realtime.closeUser`; test: `sweep()`) */
    realtime: RealtimeHub;
  }
}

/**
 * URL có thuộc khối /admin/v1 không? Phân loại theo đường dẫn ĐÃ chuẩn hóa (giải mã %xx, gộp `//`, chữ thường) vì router giải mã
 * trước khi khớp: `/%61dmin/v1/...` vẫn vào route admin nên phải nhận CORS kiểu admin (rà kien-truc PR #50, mục 7).
 * Không giải mã được => coi như admin (nhánh chặt hơn: chỉ ADMIN_ORIGIN).
 */
export function isAdminPath(url: string): boolean {
  let path = url.split(/[?#]/, 1)[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    return true;
  }
  path = path.replace(/\/{2,}/g, '/').toLowerCase();
  return path === '/admin/v1' || path.startsWith('/admin/v1/');
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
  /** Dự án 3: kiểm ID token Google. null = chưa cấu hình GOOGLE_WEB_CLIENT_ID => route Google trả 503 provider_unavailable */
  identity?: IdentityProvider | null;
  /** Dự án 3: gửi mã OTP (MAIL_PROVIDER, mặc định none) */
  mail: MailProvider;
  /** Đồng hồ cho hạn mã OTP / cửa sổ giới hạn đăng nhập (test tiêm) */
  clock: Clock;
  /** Dự án 5a: kho tệp đính kèm góp ý (BLOB_PROVIDER) */
  blob: BlobStore;
  /** Dự án 4: bộ phát tin trừu tượng (service chat/gọi/push chỉ biết interface này). Mặc định là `RealtimeHub` của /ws */
  bus: RealtimeBus;
}

export interface BuildOptions {
  /** Test tiêm luồng ghi log để quét nội dung log (dự án 4: năm sinh không được lọt vào log) */
  logger?: boolean | { level: string; stream: NodeJS.WritableStream };
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
  /** Test tiêm nhà cung cấp mail giả; bỏ trống = theo MAIL_PROVIDER */
  mail?: MailProvider;
  /** Test tiêm DB dùng chung; bỏ trống = theo cấu hình (DATABASE_URL hoặc PGlite) và tự đóng khi app đóng */
  db?: DbProvider;
  /** Test tiêm bộ kiểm token giả (khóa cục bộ); null = chưa cấu hình; bỏ trống = theo env GOOGLE_WEB_CLIENT_ID */
  identity?: IdentityProvider | null;
  /** Test tiêm kho tệp giả (vd. kho ném lỗi khi xóa); bỏ trống = theo BLOB_PROVIDER/BLOB_DIR */
  blob?: BlobStore;
  /** Dự án 4: cổng điều kiện chat. Bỏ trống = `chatEligibility` thật của Task 3; test tiêm cổng giả */
  chatEligibility?: ChatEligibilityFn;
  /** Dự án 4: bộ đếm giới hạn tốc độ chat; test tiêm để kiểm đồng hồ */
  chatLimiter?: ChatLimiter;
  /** Dự án 4: test tiêm bus (vd. InMemoryBus) cho service chat; /ws vẫn dùng hub thật */
  bus?: RealtimeBus;
  /** Dự án 4: test chỉnh hub (đồng hồ giả, giới hạn, tắt tự quét) */
  realtime?: Partial<Pick<RealtimeOptions, 'now' | 'limits' | 'sweepMs'>>;
  /** Dự án 4 (Task 10): test tiêm nhà cung cấp push giả (null = tắt) và chỉnh thời gian chờ/thử lại; bỏ trống = theo PUSH_PROVIDER */
  push?: { provider?: PushProvider | null; delayMs?: number; retryDelaysMs?: readonly number[]; largeGroupMembers?: number };
}

export async function buildApp(config: GatewayConfig, opts: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    // Mặc định của Fastify, chỉ che `sig=` của URL tệp quản trị trong log truy cập
    logger:
      opts.logger === false
        ? false
        : {
            // Test (dự án 4) tiêm luồng ghi log để quét nội dung log; mặc định ghi ra stdout như trước
            ...(typeof opts.logger === 'object' ? { level: opts.logger.level, stream: opts.logger.stream } : {}),
            serializers: {
              req: (req: { method?: string; url?: string; host?: string; ip?: string; socket?: { remotePort?: number } }) => ({
                method: req.method,
                url: redactSignedUrl(req.url ?? ''),
                host: req.host,
                remoteAddress: req.ip,
                remotePort: req.socket?.remotePort
              })
            }
          },
    maxParamLength: 4200, // token FCM dài ~160+ ký tự nằm trên đường dẫn DELETE /v1/chat/push-tokens/:token (mặc định Fastify 100 ⇒ 404)
    bodyLimit: 1024 * 1024, // 1MB cho JSON thường; route âm thanh nâng riêng
    trustProxy: config.NODE_ENV === 'production'
  });

  await app.register(helmet, { contentSecurityPolicy: false }); // API JSON thuần, không phục vụ HTML

  // Chỉ cho phép đúng các origin cấu hình; request không có Origin (app native, curl) vẫn đi qua
  // và sẽ bị chặn ở bước xác thực nếu cần.
  // Dự án 5a: CORS TÁCH THEO ĐƯỜNG DẪN trong MỘT chỗ đăng ký (delegator theo từng request, không có route nào thoát được):
  //  - /admin/v1: chỉ ADMIN_ORIGIN, có credentials (cookie refresh).
  //  - mọi đường dẫn khác: danh sách CORS_ORIGIN cũ, KHÔNG bao giờ gồm ADMIN_ORIGIN, không credentials.
  const allowed = new Set(config.corsOrigins.filter((o) => o !== config.ADMIN_ORIGIN));
  await app.register(cors, {
    delegator: (req, cb) => {
      const origin = req.headers.origin;
      if (isAdminPath(req.raw.url ?? '')) cb(null, { origin: origin === config.ADMIN_ORIGIN, credentials: true });
      else cb(null, { origin: !origin || allowed.has(origin), credentials: false });
    }
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

  const mail = opts.mail ?? createMailProvider(config);
  const clock: Clock = opts.clock ?? (() => new Date());
  // Dự án 5a: cảnh báo email + việc nền của khối quản trị (chỉ dựng khi bật)
  const adminAlerts = config.ADMIN_API_ENABLED ? new AdminAlerts(db, mail, config, clock, app.log) : undefined;
  if (adminAlerts) app.decorate('adminAlerts', adminAlerts);
  const blob = opts.blob ?? createBlobStore(config);
  const stopFeedbackPurge = startFeedbackPurgeJob({ db, blob, log: app.log, enabled: config.NODE_ENV !== 'test', now: opts.clock });

  const purge = () =>
    db
      .get()
      .then(async (d) => {
        const n = await purgeAuditEvents(d);
        // Dự án 5a: phiên quản trị hết hạn quá 30 ngày + nhật ký quản trị quá 2 năm (mốc theo đồng hồ tiêm)
        const a = await purgeAdminData(d, (opts.clock ?? (() => new Date()))());
        if (a.sessions || a.auditRows) app.log.info(a, 'admin data purged');
        return n;
      })
      .then((n) => n && app.log.info({ deleted: n }, 'audit_events purged'))
      .catch((err: unknown) => app.log.warn({ err }, 'audit purge failed'));
  let purgeTimer: NodeJS.Timeout | undefined = setTimeout(() => {
    void purge();
    purgeTimer = setInterval(() => void purge(), AUDIT_PURGE_EVERY_MS).unref();
  }, AUDIT_PURGE_FIRST_MS).unref();

  // Dự án 3: xóa cứng tài khoản quá hạn 30 ngày + dọn bia mộ/tên giữ chỗ hết hạn. Chạy mỗi giờ (idempotent, an toàn nhiều instance).
  const purgeAccounts = () =>
    db
      .get()
      .then((d) => purgeExpiredAccounts(d, (opts.clock ?? (() => new Date()))(), (err) => app.log.error({ err }, 'account purge failed for one user'), blob))
      .then((n) => n && app.log.info({ deleted: n }, 'expired accounts purged'))
      .catch((err: unknown) => app.log.warn({ err }, 'account purge failed'));
  let accountTimer: NodeJS.Timeout | undefined = setTimeout(() => {
    void purgeAccounts();
    accountTimer = setInterval(() => void purgeAccounts(), ACCOUNT_PURGE_EVERY_MS).unref();
  }, AUDIT_PURGE_FIRST_MS).unref();

  let pushNotifier: PushNotifier | undefined;
  // Ghi nốt nhật ký đang dở TRƯỚC khi đóng DB (DB tiêm từ test thì test tự đóng)
  app.addHook('onClose', async () => {
    clearTimeout(purgeTimer);
    clearInterval(purgeTimer);
    purgeTimer = undefined;
    clearTimeout(accountTimer);
    clearInterval(accountTimer);
    accountTimer = undefined;
    await adminAlerts?.flush();
    stopFeedbackPurge();
    await pushNotifier?.stop();
    hub.dispose(); // đóng mọi WebSocket (1001) trước khi đóng DB
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
  // Dự án 4: hub WebSocket (một instance Gateway). Dựng luôn (rẻ, chỉ Map + 1 bộ hẹn giờ unref) để `deps.bus` có sẵn cho mọi service.
  const hub = new RealtimeHub({
    verify: createWsVerifier({ jwtVerify: (token) => app.jwt.verify(token), db, now: opts.realtime?.now ?? Date.now, log: app.log }),
    directory: createDbDirectory(db),
    buildAllowed: (build, channel) => buildAllowed(appVersions, build, channel, (opts.realtime?.now ?? Date.now)()),
    log: app.log,
    ...opts.realtime
  });
  app.decorate('realtime', hub);
  const deps: RouteDeps = { pipeline, ttsCache, config, llm, vision, stt, tts, tutor: createTutor(llm, app.log, vision), db, audit, mail, clock, blob, bus: opts.bus ?? hub };
  // Dự án 4 (Task 10): thông báo đẩy nối qua bus (sau commit, không chặn gửi tin). Chỉ chạy khi chat bật.
  if (config.CHAT_ENABLED) {
    pushNotifier = startPushNotifier({
      db,
      bus: deps.bus,
      provider: opts.push?.provider !== undefined ? opts.push.provider : createPushProvider(config, app.log),
      eligibility: opts.chatEligibility ?? chatEligibility,
      log: app.log,
      now: clock,
      delayMs: opts.push?.delayMs,
      retryDelaysMs: opts.push?.retryDelaysMs,
      largeGroupMembers: opts.push?.largeGroupMembers
    });
    app.decorate('push', pushNotifier);
  }
  deps.identity = opts.identity !== undefined ? opts.identity : createIdentityProviderFromEnv();
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
      await auth.register(identityAuthRoutes, deps);
      await auth.register(authLogoutRoutes, deps);
    },
    { prefix: '/v1/auth' }
  );

  // Dự án 8: GET /v1/app/version công khai (scope riêng như /v1/auth, giới hạn theo IP). Đọc cấu hình lúc dựng app:
  // tệp sai => ném, Gateway không khởi động. Đăng ký TRƯỚC scope /v1 (không dính hook 426/xác thực của nó).
  const appVersions = createAppVersionStore({
    file: config.APP_VERSIONS_FILE,
    ttlMs: config.APP_VERSIONS_TTL_MS,
    apkHosts: config.apkDownloadHosts,
    log: app.log
  });
  await app.register(
    async (appScope) => {
      await appScope.register(rateLimit, {
        max: config.APP_VERSION_RATE_LIMIT_PER_MINUTE,
        timeWindow: '1 minute',
        keyGenerator: (req) => req.ip,
        onExceeded: (req) => audit.noteRateLimited(AuditLog.context(req), req.url.split('?')[0])
      });
      await appScope.register(appVersionRoutes, { store: appVersions });
    },
    { prefix: '/v1/app' }
  );

  // Mọi route nghiệp vụ khác nằm trong scope /v1 có hook xác thực + rate limit theo người dùng
  await app.register(
    async (v1) => {
      // Dự án 8: chặn bản app dưới minBuild bằng 426, TRƯỚC xác thực (không gắn ở /v1/auth — xem spec 5.3)
      v1.addHook('onRequest', updateGate(appVersions));
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
      await v1.register(identityRoutes, deps);
      await v1.register(authMeRoutes, deps);
      await v1.register(feedbackRoutes, deps);
      await v1.register(chatSocialRoutes, { ...deps, eligibility: opts.chatEligibility ?? chatEligibility, limiter: opts.chatLimiter ?? createChatLimiter() });
      await v1.register(chatGroupRoutes, { ...deps, eligibility: opts.chatEligibility ?? chatEligibility });
      await v1.register(meAgeRoutes, deps);
      await v1.register(pushTokenRoutes, { ...deps, eligibility: opts.chatEligibility ?? chatEligibility });
    },
    { prefix: '/v1' }
  );

  // Dự án 4 (Task 5): WebSocket /ws — scope riêng NGOÀI /v1 (trình duyệt không gửi được Authorization khi mở WS); xác thực bằng khung
  // `hello` (xem routes/ws.ts). Chỉ đăng ký khi CHAT_ENABLED (tắt => 404). Giới hạn bắt tay theo IP.
  if (config.CHAT_ENABLED) {
    await app.register(async (wsScope) => {
      await wsScope.register(rateLimit, {
        max: config.WS_RATE_LIMIT_PER_MINUTE,
        timeWindow: '1 minute',
        keyGenerator: (req) => req.ip,
        onExceeded: (req) => audit.noteRateLimited(AuditLog.context(req), '/ws')
      });
      // Tắt Gateway: đóng sạch bằng 1001 TRƯỚC bước đóng mặc định của @fastify/websocket (hook đăng ký trước chạy trước)
      wsScope.addHook('preClose', async () => hub.closeAll());
      await wsScope.register(websocket, { options: WS_SERVER_OPTIONS });
      await wsScope.register(wsRoutes, { hub });
    });
  }

  // Dự án 5a: khối quản trị /admin/v1 — CHỈ đăng ký khi ADMIN_API_ENABLED (tắt => 404, không có route nào)
  if (adminAlerts) await app.register(adminRoutes, { ...deps, adminAlerts, prefix: '/admin/v1' });

  return app;
}
