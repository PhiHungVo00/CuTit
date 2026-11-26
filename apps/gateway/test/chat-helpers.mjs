import { randomUUID } from 'node:crypto';
import { createDbProvider, schema } from '../dist/db/client.js';
import { InMemoryBus } from '../dist/services/realtime/RealtimeBus.js';
import { createChatLimiter } from '../dist/services/chat/limits.js';
import { makeApp, guest } from './helpers.mjs';

/**
 * Ứng dụng thử chat: DB PGlite riêng, bus trong bộ nhớ, cổng điều kiện GIẢ (Task 3 làm cổng thật song song —
 * test chat chỉ kiểm cách chat DÙNG cổng, không kiểm luật tuổi). `gate.set(userId, 'minor')` để làm người đó không đủ điều kiện.
 */
export async function chatApp(env = {}, opts = {}) {
  // TEST_DATABASE_URL => chạy trên Postgres thật (nhiều kết nối song song: kiểm tranh chấp seq thật). Người dùng/cuộc trò chuyện đều mới
  // (uuid ngẫu nhiên) nên dùng chung một DB giữa các tệp test được; chạy với --test-concurrency=1.
  const PG = process.env.TEST_DATABASE_URL;
  const dbp = createDbProvider(PG ? { DATABASE_URL: PG, PGLITE_DIR: 'memory://' } : { PGLITE_DIR: 'memory://' });
  const bus = new InMemoryBus();
  const limiter = createChatLimiter();
  const reasons = new Map();
  const gate = {
    set: (userId, reason) => (reason ? reasons.set(userId, reason) : reasons.delete(userId)),
    fn: async (_db, userId) => (reasons.has(userId) ? { ok: false, reason: reasons.get(userId) } : { ok: true })
  };
  const app = await makeApp(
    { AUTH_RATE_LIMIT_PER_MINUTE: '1000', RATE_LIMIT_PER_MINUTE: '5000', ...env },
    { db: dbp, bus, chatEligibility: gate.fn, chatLimiter: limiter, ...opts }
  );
  const close = async () => {
    await app.close();
    await dbp.close();
  };
  return { app, dbp, bus, limiter, gate, close };
}

/** Tài khoản (khách trong DB, cổng giả cho qua) có tên hiển thị */
export async function person(t, name) {
  const g = await guest(t.app);
  const userId = g.body.userId;
  const db = await t.dbp.get();
  await db.insert(schema.socialProfiles).values({ userId, displayName: name });
  return { userId, name, headers: g.headers };
}

/** Hai người là bạn (một dòng friendships, user_a < user_b) → friendshipId */
export async function befriend(t, x, y) {
  const db = await t.dbp.get();
  const [a, b] = x.userId < y.userId ? [x.userId, y.userId] : [y.userId, x.userId];
  const [f] = await db.insert(schema.friendships).values({ userA: a, userB: b }).returning({ id: schema.friendships.id });
  return f.id;
}

export const call = (t, u, method, url, payload) => t.app.inject({ method, url, headers: u.headers, ...(payload === undefined ? {} : { payload }) });

/** Tạo/lấy cuộc 1-1 → conversationId */
export async function openDm(t, x, y, fid) {
  const r = await call(t, x, 'POST', '/v1/chat/conversations', { peerFriendshipId: fid ?? (await befriend(t, x, y)) });
  if (r.statusCode !== 200) throw new Error(`openDm ${r.statusCode}: ${r.body}`);
  return r.json().id;
}

export const sendHttp = (t, u, cid, body, clientMsgId = randomUUID()) =>
  call(t, u, 'POST', `/v1/chat/conversations/${cid}/messages`, { clientMsgId, kind: 'text', body });

export const dbCounts = async (t) => {
  const db = await t.dbp.get();
  const msgs = await db.select().from(schema.chatMessages);
  const convs = await db.select().from(schema.conversations);
  return { messages: msgs.length, lastSeqs: convs.map((c) => c.lastSeq), conversations: convs.length };
};
