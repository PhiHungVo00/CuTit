import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDbProvider, schema } from '../dist/db/client.js';
import { clearChatEligibilityCache } from '../dist/services/social/eligibility.js';
import { makeApp, guest } from './helpers.mjs';

/**
 * Dự án 4 — helper cho test tuổi / handle / kết bạn / chặn. Gateway thật trên PGlite `memory://`
 * (Postgres thật nếu có TEST_DATABASE_URL: mỗi tệp test một DB mới, chạy `--test-concurrency=1`).
 * Đồng hồ giả: `ctx.clock.now` chỉnh tay (chỉ ảnh hưởng nghiệp vụ của Task 3, không ảnh hưởng JWT).
 */
const PG = process.env.TEST_DATABASE_URL;
export const RUN = PG ? Math.random().toString(36).slice(2, 6) : '';

export async function boot(env = {}, opts = {}) {
  const dbp = createDbProvider(PG ? { DATABASE_URL: PG, PGLITE_DIR: 'memory://' } : { PGLITE_DIR: 'memory://' });
  const clock = { now: new Date('2026-11-26T08:00:00Z') };
  clearChatEligibilityCache();
  const app = await makeApp(
    { AUTH_RATE_LIMIT_PER_MINUTE: '1000', RATE_LIMIT_PER_MINUTE: '100000', FRIEND_INVITE_RATE_LIMIT_PER_MINUTE: '1000', ...env },
    { db: dbp, clock: () => new Date(clock.now), ...opts }
  );
  const ctx = {
    app,
    dbp,
    clock,
    db: () => dbp.get(),
    call: (u, method, url, payload) => app.inject({ method, url, headers: u.headers, ...(payload === undefined ? {} : { payload }) }),
    async close() {
      await app.close();
      await dbp.close();
    }
  };
  return ctx;
}

/**
 * Tạo một người dùng:
 *  - mặc định: tài khoản THẬT (không khách), có tên hiển thị, đã khai đủ 18 (qua API thật), đã đặt handle;
 *  - `guest: true` giữ nguyên tài khoản khách; `birthYear` đổi năm khai; `age: false` bỏ qua khai tuổi; `handle: null` bỏ qua handle.
 */
export async function member(ctx, name, o = {}) {
  const g = await guest(ctx.app);
  const u = { headers: g.headers, userId: g.body.userId, name };
  const d = await ctx.db();
  if (!o.guest) await d.update(schema.users).set({ isGuest: false }).where(eq(schema.users.id, u.userId));
  if (o.display !== false) {
    const r = await ctx.call(u, 'PUT', '/v1/friends/profile', { displayName: name });
    if (r.statusCode !== 200) throw new Error(`profile ${r.statusCode}: ${r.body}`);
  }
  if (o.age !== false) {
    const year = o.birthYear ?? new Date(ctx.clock.now).getUTCFullYear() - 30;
    const r = await ctx.call(u, 'PUT', '/v1/me/age', { birthYear: year });
    if (r.statusCode !== 200) throw new Error(`age ${r.statusCode}: ${r.body}`);
  }
  if (o.handle !== null && !o.guest && o.display !== false) {
    u.handle = (o.handle ?? `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}${RUN}${randomUUID().slice(0, 4)}`).toLowerCase();
    const r = await ctx.call(u, 'PUT', '/v1/chat/handle', { handle: u.handle });
    if (r.statusCode !== 200) throw new Error(`handle ${r.statusCode}: ${r.body}`);
  }
  return u;
}

/** Hai người đã là bạn qua lời mời bằng handle (A mời, B chấp nhận). Trả id quan hệ bạn bè. */
export async function befriend(ctx, a, b) {
  const s = await ctx.call(a, 'POST', '/v1/friends/requests', { handle: b.handle });
  if (s.statusCode !== 200) throw new Error(`request ${s.statusCode}: ${s.body}`);
  const list = (await ctx.call(b, 'GET', '/v1/friends/requests')).json().requests;
  const r = await ctx.call(b, 'POST', `/v1/friends/requests/${list[0].id}/accept`);
  if (r.statusCode !== 200) throw new Error(`accept ${r.statusCode}: ${r.body}`);
  return r.json().id;
}
