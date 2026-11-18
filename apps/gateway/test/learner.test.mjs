import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDbProvider, schema } from '../dist/db/client.js';
import { makeApp, guest } from './helpers.mjs';

// Một DB + một app cho cả tệp (PGlite mở ~1–3 s); test đọc thẳng DB để kiểm tra xóa sạch
const dbp = createDbProvider({ PGLITE_DIR: 'memory://' });
let a;
before(async () => {
  a = await makeApp({}, { db: dbp });
});
after(async () => {
  await a.close();
  await dbp.close();
});

const id = () => randomUUID();
const card = (itemRef, dueAt = '2026-01-01T00:00:00.000Z') => ({ itemRef, front: 'ngô', back: 'bắp', source: 'dialect', ease: 250, intervalDays: 0, repetitions: 0, dueAt });
const sync = (headers, events) => a.inject({ method: 'POST', url: '/v1/sync', headers, payload: { events } });

test('Tùy chỉnh: chưa lưu => mặc định; PUT rồi GET trả đúng (speed số thực, uiLanguage)', async () => {
  const { headers } = await guest(a);
  const first = await a.inject({ url: '/v1/preferences', headers });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().speed, 1);
  const prefs = { voiceId: 'vi-VN-Standard-C', speed: 1.25, dialect: 'south', correctionLevel: 'strict', persona: 'co_giao', uiLanguage: 'vi' };
  assert.equal((await a.inject({ method: 'PUT', url: '/v1/preferences', headers, payload: prefs })).statusCode, 200);
  assert.deepEqual((await a.inject({ url: '/v1/preferences', headers })).json(), prefs);
  assert.equal((await a.inject({ method: 'PUT', url: '/v1/preferences', headers, payload: { ...prefs, speed: 9 } })).statusCode, 400);
});

test('Cách ly: B không thấy thẻ / tùy chỉnh / thống kê của A', async () => {
  const A = await guest(a);
  const B = await guest(a);
  await sync(A.headers, [{ clientEventId: id(), at: new Date().toISOString(), type: 'srs.upsert', card: card('dialect:d1') }]);
  await a.inject({ method: 'PUT', url: '/v1/preferences', headers: A.headers, payload: { voiceId: 'x', speed: 2, dialect: 'central', correctionLevel: 'off', persona: 'p', uiLanguage: 'vi' } });
  assert.equal((await a.inject({ url: '/v1/srs/due', headers: A.headers })).json().length, 1);
  assert.equal((await a.inject({ url: '/v1/srs/due', headers: B.headers })).json().length, 0);
  assert.equal((await a.inject({ url: '/v1/preferences', headers: B.headers })).json().speed, 1);
  assert.equal((await a.inject({ url: '/v1/analytics/summary', headers: B.headers })).json().dueCardsCount, 0);
});

test('Thống kê: streak theo ngày địa phương client gửi, phút 7 ngày, độ chính xác, thẻ đến hạn', async () => {
  const { headers } = await guest(a);
  const at = '2026-11-17T01:00:00.000Z';
  await sync(headers, [
    { clientEventId: id(), at, type: 'activity.set', day: '2026-11-15', seconds: 300 },
    { clientEventId: id(), at, type: 'activity.set', day: '2026-11-16', seconds: 600 },
    { clientEventId: id(), at, type: 'activity.set', day: '2026-11-17', seconds: 120 },
    { clientEventId: id(), at, type: 'activity.set', day: '2026-11-10', seconds: 999 },
    { clientEventId: id(), at, type: 'attempt.add', attempt: { skill: 'drill', correct: true, at } },
    { clientEventId: id(), at, type: 'attempt.add', attempt: { skill: 'drill', correct: false, at } },
    { clientEventId: id(), at, type: 'srs.upsert', card: card('dialect:d2') },
    { clientEventId: id(), at, type: 'profile.set', profile: { onboarded: true, level: 2, goal: 'travel', nativeLang: 'en', dialect: 'south' } }
  ]);
  const s = (await a.inject({ url: '/v1/analytics/summary?today=2026-11-17', headers })).json();
  assert.deepEqual(s, { streakDays: 3, studyMinutes: 17, accuracyRate: 50, dueCardsCount: 1, cefrEstimate: 'A2' });
  // hôm nay chưa học => tính tới hôm qua
  assert.equal((await a.inject({ url: '/v1/analytics/summary?today=2026-11-18', headers })).json().streakDays, 3);
  assert.equal((await a.inject({ url: '/v1/analytics/summary?today=2026-11-20', headers })).json().streakDays, 0);
});

test('Xóa tài khoản: mọi dữ liệu (kể cả XP) biến mất; access token cũ và refresh token cũ => 401', async () => {
  const { body, headers } = await guest(a);
  const day = '2026-11-17';
  const at = new Date().toISOString();
  await sync(headers, [
    { clientEventId: id(), at, type: 'xp.add', source: 'lesson', amount: 20, day },
    { clientEventId: id(), at, type: 'srs.upsert', card: card('x:1') },
    { clientEventId: id(), at, type: 'consent.grant', key: 'voice', version: '1' }
  ]);
  const del = await a.inject({ method: 'DELETE', url: '/v1/me', headers });
  assert.equal(del.statusCode, 200);
  assert.deepEqual(del.json(), { deleted: true });

  const reuse = await sync(headers, [{ clientEventId: id(), at, type: 'xp.add', source: 'lesson', amount: 5, day }]);
  assert.equal(reuse.statusCode, 401);
  assert.equal((await a.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: body.refreshToken } })).statusCode, 401);
  assert.equal((await a.inject({ method: 'POST', url: '/v1/auth/recover', payload: { recoveryCode: body.recoveryCode } })).statusCode, 401);

  // kiểm tra trực tiếp trong DB: không còn hàng nào của user
  const db = await dbp.get();
  for (const t of [schema.xpEvents, schema.srsCards, schema.consents, schema.refreshTokens, schema.syncEvents, schema.dailyActivity]) {
    assert.equal((await db.select().from(t).where(eq(t.userId, body.userId))).length, 0);
  }
  assert.equal((await db.select().from(schema.users).where(eq(schema.users.id, body.userId))).length, 0);
});
