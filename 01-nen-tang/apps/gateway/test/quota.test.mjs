import test from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { ChatEventSchema, QuotaStatusSchema } from '@vietlearning/contracts';
import { createDbProvider, schema } from '../dist/db/client.js';
import { DbQuotaStore } from '../dist/pipeline/DbQuotaStore.js';
import { quotaDay, quotaResetAt } from '../dist/pipeline/QuotaStore.js';
import { makeApp, guest } from './helpers.mjs';

const SID = '7d444840-9dc0-11d1-b245-5ffdce74fad2';
const SECRET = 'q'.repeat(40);
const events = (body) => body.split('\n\n').filter(Boolean).map((c) => ChatEventSchema.parse(JSON.parse(c.replace(/^data: /, ''))));
const turn = (a, headers, text = 'xin chào') =>
  a.inject({ method: 'POST', url: '/v1/chat/turn', headers: { ...headers, accept: 'text/event-stream' }, payload: { sessionId: SID, userText: text } });
// Hạn mức đổi ngày lúc 00:00 giờ Việt Nam (UTC+7 = 17:00 UTC), không phải nửa đêm UTC
const nextVnMidnight = () => quotaResetAt(new Date());

test('lượt hội thoại AI theo ngày: đếm trong DB, còn sau khi khởi động lại, hết lượt => 429 quota_exceeded có resetAt', async () => {
  const db = createDbProvider({ PGLITE_DIR: 'memory://' });
  const env = { JWT_SECRET: SECRET, MAX_CHAT_TURNS_PER_DAY: '2' };
  const a = await makeApp(env, { db });
  const g = await guest(a);
  const d1 = events((await turn(a, g.headers)).body).at(-1);
  assert.equal(d1.turnsLeft, 1);
  const d2 = events((await turn(a, g.headers)).body).at(-1);
  assert.equal(d2.turnsLeft, 0);
  const r3 = await turn(a, g.headers);
  assert.equal(r3.statusCode, 429);
  assert.deepEqual(r3.json(), { error: 'quota_exceeded', capability: 'turn', resetAt: nextVnMidnight(), message: r3.json().message });

  const status = await a.inject({ method: 'GET', url: '/v1/quota', headers: g.headers });
  assert.equal(status.statusCode, 200);
  const q = QuotaStatusSchema.parse(status.json());
  assert.deepEqual(q.turns, { used: 2, limit: 2 });
  assert.equal(q.resetAt, nextVnMidnight());
  assert.equal(q.day, quotaDay(new Date()));
  await a.close();

  // Khởi động lại (cùng DB): vẫn hết lượt — không reset khi deploy/khởi động lại
  const b = await makeApp(env, { db });
  assert.equal((await turn(b, g.headers)).statusCode, 429);
  // người khác không bị ảnh hưởng
  const other = await guest(b);
  assert.equal((await turn(b, other.headers)).statusCode, 200);

  // Xóa tài khoản => bộ đếm của người đó cũng bị xóa (ON DELETE CASCADE)
  assert.equal((await b.inject({ method: 'DELETE', url: '/v1/me', headers: g.headers })).statusCode, 200);
  const rows = await (await db.get()).select().from(schema.aiUsage).where(eq(schema.aiUsage.userId, g.body.userId));
  assert.equal(rows.length, 0);
  await b.close();
  await db.close();
});

test('DbQuotaStore: trừ hạn mức nguyên tử — 20 yêu cầu song song, hạn mức 5 => đúng 5 được phép', async () => {
  const db = createDbProvider({ PGLITE_DIR: 'memory://' });
  const a = await makeApp({ JWT_SECRET: SECRET }, { db });
  const g = await guest(a);
  const store = new DbQuotaStore(db);
  const results = await Promise.all(Array.from({ length: 20 }, () => store.tryConsume(g.body.userId, 'llm', 1, 5)));
  assert.equal(results.filter((r) => r.ok).length, 5);
  assert.equal(await store.get(g.body.userId, 'llm'), 5);
  await store.add(g.body.userId, 'llm', 3); // bù chênh lệch token thật: không chặn
  assert.equal(await store.get(g.body.userId, 'llm'), 8);
  // principal ẩn danh (AUTH_REQUIRED=false) không ghi DB
  assert.equal((await store.tryConsume('anon:1.2.3.4', 'turn', 1, 1)).ok, true);
  assert.equal((await store.tryConsume('anon:1.2.3.4', 'turn', 1, 1)).ok, false);
  await a.close();
  await db.close();
});

test('429 do rate-limit theo phút KHÔNG mang mã quota_exceeded (client phân biệt được)', async () => {
  const a = await makeApp({ JWT_SECRET: SECRET, RATE_LIMIT_PER_MINUTE: '1' });
  const g = await guest(a);
  await a.inject({ method: 'GET', url: '/v1/quota', headers: g.headers });
  const r = await a.inject({ method: 'GET', url: '/v1/quota', headers: g.headers });
  assert.equal(r.statusCode, 429);
  assert.notEqual(r.json().error, 'quota_exceeded');
  await a.close();
});
