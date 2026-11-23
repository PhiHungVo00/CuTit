import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppChannelSchema, type AppChannel, type AppVersionsConfig } from '@vietlearning/contracts/api';
import type { AppVersionStore } from './store.js';

type ChannelConfig = AppVersionsConfig[AppChannel];

/** `build < minBuild` ⇒ update_required (kể cả trong thời gian ân hạn); `build < latestBuild` ⇒ update_available */
export function computeStatus(build: number, ch: ChannelConfig): 'up_to_date' | 'update_available' | 'update_required' {
  if (build < ch.minBuild) return 'update_required';
  if (build < ch.latestBuild) return 'update_available';
  return 'up_to_date';
}

/**
 * Các đường miễn trừ trong scope /v1 (spec 5.3): quyền xóa tài khoản không bị chặn bởi bản app cũ.
 * (GET /v1/app/version nằm ở scope riêng; /v1/auth/* không gắn hook này; /healthz, /audio/* ngoài /v1.)
 */
function isExempt(method: string, url: string): boolean {
  const path = (url.split('?')[0] ?? '').replace(/\/+$/, '');
  if (method === 'DELETE' && path === '/v1/me') return true;
  if (method === 'GET' && path === '/v1/app/version') return true;
  return false;
}

const headerValue = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/**
 * Hook `onRequest` cho scope /v1, chạy TRƯỚC xác thực. Chỉ trả 426 khi header hợp lệ và
 * `build < minBuild` VÀ (`minBuildEnforceAt` là null hoặc đã qua) — ân hạn để không cắt ngang lượt đang dở.
 * Thiếu/sai header ⇒ cho qua (bản app cũ trước dự án 8, curl, công cụ).
 */
export function updateGate(store: AppVersionStore, opts: { now?: () => number } = {}) {
  const now = opts.now ?? Date.now;
  return async function updateGateHook(
    req: Pick<FastifyRequest, 'method' | 'url' | 'headers'>,
    reply: FastifyReply
  ): Promise<FastifyReply | undefined> {
    if (req.method === 'OPTIONS' || isExempt(req.method, req.url)) return undefined;
    const rawBuild = headerValue(req.headers['x-app-build']);
    const channel = AppChannelSchema.safeParse(headerValue(req.headers['x-app-channel']));
    if (rawBuild === undefined || !/^\d{1,10}$/.test(rawBuild) || !channel.success) return undefined;
    const build = Number(rawBuild);
    const ch = store.get()[channel.data];
    if (build >= ch.minBuild) return undefined;
    if (ch.minBuildEnforceAt !== null && now() < Date.parse(ch.minBuildEnforceAt)) return undefined; // còn ân hạn
    return reply.code(426).send({ error: 'app_update_required', minBuild: ch.minBuild, channel: channel.data });
  };
}
