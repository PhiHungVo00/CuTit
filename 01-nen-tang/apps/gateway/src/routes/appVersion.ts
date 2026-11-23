import type { FastifyPluginAsync } from 'fastify';
import { AppVersionQuerySchema, AppVersionResponseSchema } from '@vietlearning/contracts/api';
import { parseOr400, respond } from '../lib/validate.js';
import type { AppVersionStore } from '../services/appVersion/store.js';
import { computeStatus } from '../services/appVersion/updateGate.js';

/** Gợi ý client chờ 6 giờ mới hỏi lại */
const CHECK_AFTER_SEC = 21_600;

/** GET /v1/app/version?channel=&build= — công khai (scope riêng, rate limit theo IP ở app.ts), không cache */
export const appVersionRoutes: FastifyPluginAsync<{ store: AppVersionStore }> = async (server, { store }) => {
  server.get('/version', async (req, reply) => {
    const q = parseOr400(AppVersionQuerySchema, req.query, reply);
    if (!q) return reply;
    const { channel, build } = q;
    const ch = store.get()[channel];
    reply.header('cache-control', 'no-store');
    return respond(AppVersionResponseSchema, {
      channel,
      latestBuild: ch.latestBuild,
      latestVersion: ch.latestVersion,
      minBuild: ch.minBuild,
      status: computeStatus(build, ch),
      notes: ch.notes,
      // Kênh web/play không bao giờ nhận tệp APK, bất kể cấu hình
      apkFile: channel === 'apk' ? ch.apkFile : null,
      downloadUrl: channel === 'apk' ? ch.downloadUrl : null,
      checkAfterSec: CHECK_AFTER_SEC
    });
  });
};
