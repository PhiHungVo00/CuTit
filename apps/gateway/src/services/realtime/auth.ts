import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { WsCloseCode, type AppChannel, type AppVersionsConfig } from '@vietlearning/contracts/api';
import { schema, type DbProvider } from '../../db/client.js';
import type { AppVersionStore } from '../appVersion/store.js';

export type WsVerifyResult = { ok: true; userId: string; expMs: number } | { ok: false; code: number; reason: string };

export interface WsVerifierDeps {
  /** kiểm chữ ký + hạn của JWT; ném nếu sai (thường là `app.jwt.verify`) */
  jwtVerify: (token: string) => unknown;
  db: DbProvider;
  now: () => number;
  log?: { warn: (o: object, msg: string) => void };
}

const fail = (code: number, reason: string): WsVerifyResult => ({ ok: false, code, reason });

/**
 * Xác thực một access token cho WebSocket — đủ như `RequestPipeline.authenticate` (typ:'access', người dùng còn, không chờ xóa)
 * CỘNG điều kiện chat (spec 5.1): không khách, đã khai và đủ 18, đã có handle, không bị khóa chat.
 * 4401 = token/tài khoản không còn dùng được (làm mới/đăng nhập lại); 4403 = có tài khoản nhưng không được chat.
 * (Task 3 sẽ có `chatEligibility` dùng chung cho REST; khi gộp, thay phần kiểm điều kiện ở đây bằng hàm đó.)
 */
export function createWsVerifier(deps: WsVerifierDeps) {
  return async function verify(token: string): Promise<WsVerifyResult> {
    let payload: { sub?: unknown; typ?: unknown; exp?: unknown };
    try {
      payload = deps.jwtVerify(token) as typeof payload;
    } catch {
      return fail(WsCloseCode.unauthorized, 'invalid_token');
    }
    if (typeof payload.sub !== 'string' || payload.typ !== 'access' || typeof payload.exp !== 'number') {
      return fail(WsCloseCode.unauthorized, 'invalid_token');
    }
    const userId = payload.sub;
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return fail(WsCloseCode.unauthorized, 'invalid_token');
    try {
      const d = await deps.db.get();
      const now = new Date(deps.now());
      const [row] = await d
        .select({
          isGuest: schema.users.isGuest,
          isAdult: schema.users.isAdult,
          deleteAt: schema.users.deleteAt,
          deletedAt: schema.users.deletedAt,
          handle: schema.socialProfiles.handle
        })
        .from(schema.users)
        .leftJoin(schema.socialProfiles, eq(schema.socialProfiles.userId, schema.users.id))
        .where(eq(schema.users.id, userId));
      if (!row || row.deletedAt) return fail(WsCloseCode.unauthorized, 'account_deleted');
      if (row.deleteAt) {
        return row.deleteAt.getTime() > now.getTime()
          ? fail(WsCloseCode.forbidden, 'account_pending_deletion')
          : fail(WsCloseCode.unauthorized, 'account_deleted');
      }
      if (row.isGuest) return fail(WsCloseCode.forbidden, 'adult_required');
      if (row.isAdult === null) return fail(WsCloseCode.forbidden, 'age_required');
      if (!row.isAdult) return fail(WsCloseCode.forbidden, 'adult_required');
      if (!row.handle) return fail(WsCloseCode.forbidden, 'handle_required');
      const [ban] = await d
        .select({ id: schema.chatRestrictions.id })
        .from(schema.chatRestrictions)
        .where(
          and(
            eq(schema.chatRestrictions.userId, userId),
            isNull(schema.chatRestrictions.liftedAt),
            or(isNull(schema.chatRestrictions.until), gt(schema.chatRestrictions.until, now))
          )
        )
        .limit(1);
      if (ban) return fail(WsCloseCode.forbidden, 'chat_restricted');
    } catch (err) {
      deps.log?.warn({ err }, 'ws verify: lỗi DB');
      return fail(1011, 'internal_error');
    }
    return { ok: true, userId, expMs: payload.exp * 1000 };
  };
}

type ChannelConfig = AppVersionsConfig[AppChannel];

/**
 * `hello` không có kênh (contract), nên: có `?channel=web|play|apk` thì theo kênh đó; không có thì CHỈ chặn khi build nhỏ hơn
 * `minBuild` của MỌI kênh (chắc chắn quá cũ). Giữ ân hạn `minBuildEnforceAt` như `updateGate`.
 */
export function buildAllowed(store: AppVersionStore, build: number, channel: AppChannel | undefined, nowMs: number): boolean {
  const cfg = store.get();
  const blocked = (ch: ChannelConfig): boolean => {
    if (build >= ch.minBuild) return false;
    return ch.minBuildEnforceAt === null || nowMs >= Date.parse(ch.minBuildEnforceAt);
  };
  if (channel) return !blocked(cfg[channel]);
  return !Object.values(cfg).every((ch) => blocked(ch));
}
