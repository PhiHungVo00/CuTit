import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDbProvider } from '../dist/db/client.js';
import { makeApp, guest } from './helpers.mjs';

const dbp = createDbProvider({ PGLITE_DIR: 'memory://' });
let a;
before(async () => {
  a = await makeApp({ AUTH_RATE_LIMIT_PER_MINUTE: '100' }, { db: dbp });
});
after(async () => {
  await a.close();
  await dbp.close();
});

const id = () => randomUUID();
const sync = (headers, events) => a.inject({ method: 'POST', url: '/v1/sync', headers, payload: { events } });
const card = (itemRef, extra = {}) => ({ itemRef, front: 'thìa', back: 'muỗng', source: 'dialect', ease: 250, intervalDays: 0, repetitions: 0, dueAt: '2026-11-17T00:00:00.000Z', ...extra });

test('Idempotent: gửi lại nguyên lô => toàn bộ là duplicates, XP và số lượt làm bài không đổi', async () => {
  const { headers } = await guest(a);
  const at = '2026-11-17T08:00:00.000Z';
  const batch = [
    { clientEventId: id(), at, type: 'xp.add', source: 'lesson', amount: 15, day: '2026-11-17', lessonId: 'u1-l1' },
    { clientEventId: id(), at, type: 'xp.add', source: 'review', amount: 5, day: '2026-11-17' },
    { clientEventId: id(), at, type: 'attempt.add', attempt: { skill: 'sentence', correct: true, score: 90, at } },
    { clientEventId: id(), at, type: 'lesson.progress', lessonId: 'u1-l1', status: 'completed', score: 80 },
    { clientEventId: id(), at, type: 'achievement.earn', key: 'first-lesson' }
  ];
  const r1 = await sync(headers, batch);
  assert.equal(r1.statusCode, 200);
  assert.equal(r1.json().accepted.length, 5);
  const r2 = await sync(headers, batch);
  assert.equal(r2.json().accepted.length, 0);
  assert.deepEqual(new Set(r2.json().duplicates), new Set(batch.map((e) => e.clientEventId)));
  const snap = r2.json().snapshot;
  assert.equal(snap.xp.total, 20);
  assert.deepEqual(snap.xp.byDay, { '2026-11-17': 20 });
  assert.equal(snap.attempts.length, 1);
  assert.equal(snap.attempts[0].score, 90);
  assert.deepEqual(snap.lessons, [{ lessonId: 'u1-l1', status: 'completed', bestScore: 80, completedAt: at }]);
  assert.deepEqual(snap.achievements.map((x) => x.key), ['first-lesson']);
});

test('LWW: bản thẻ/tùy chỉnh/hồ sơ cũ hơn (máy offline lâu) không ghi đè bản mới hơn', async () => {
  const { headers } = await guest(a);
  const newer = '2026-11-17T10:00:00.000Z';
  const older = '2026-11-17T09:00:00.000Z';
  const prefs = (speed) => ({ voiceId: 'v', speed, dialect: 'north', correctionLevel: 'gentle', persona: 'be_cu_tit', uiLanguage: 'en' });
  const profile = (level) => ({ onboarded: true, level, goal: null, nativeLang: 'en', dialect: 'north' });
  await sync(headers, [
    { clientEventId: id(), at: newer, type: 'srs.upsert', card: card('d:5', { repetitions: 2, intervalDays: 6 }) },
    { clientEventId: id(), at: newer, type: 'preferences.set', preferences: prefs(1.5) },
    { clientEventId: id(), at: newer, type: 'profile.set', profile: profile(3) }
  ]);
  const r = await sync(headers, [
    { clientEventId: id(), at: older, type: 'srs.upsert', card: card('d:5', { repetitions: 1, intervalDays: 1 }) },
    { clientEventId: id(), at: older, type: 'preferences.set', preferences: prefs(0.75) },
    { clientEventId: id(), at: older, type: 'profile.set', profile: profile(1) }
  ]);
  const snap = r.json().snapshot;
  assert.equal(snap.srs[0].repetitions, 2);
  assert.equal(snap.preferences.speed, 1.5);
  assert.equal(snap.profile.level, 3);
});

test('Giây học: mỗi ngày lấy giá trị lớn nhất (gửi tổng của máy, gửi lại không cộng dồn)', async () => {
  const { headers } = await guest(a);
  const at = new Date().toISOString();
  await sync(headers, [{ clientEventId: id(), at, type: 'activity.set', day: '2026-11-17', seconds: 300 }]);
  await sync(headers, [{ clientEventId: id(), at, type: 'activity.set', day: '2026-11-17', seconds: 200 }]);
  const r = await sync(headers, [{ clientEventId: id(), at, type: 'activity.set', day: '2026-11-17', seconds: 450 }]);
  assert.deepEqual(r.json().snapshot.activity, { '2026-11-17': 450 });
});

test('Snapshot của tài khoản mới: chưa có hồ sơ/tùy chỉnh (null) để client không ghi đè bằng mặc định', async () => {
  const { headers, body } = await guest(a);
  const snap = (await sync(headers, [])).json().snapshot;
  assert.equal(snap.userId, body.userId);
  assert.equal(snap.profile, null);
  assert.equal(snap.preferences, null);
  assert.deepEqual(snap.srs, []);
});

test('Ranh giới: lô 201 => 400, sự kiện sai => 400, không token => 401', async () => {
  const { headers } = await guest(a);
  const ev = { clientEventId: id(), at: new Date().toISOString(), type: 'achievement.earn', key: 'k' };
  assert.equal((await sync(headers, Array(201).fill(ev))).statusCode, 400);
  assert.equal((await sync(headers, [{ ...ev, type: 'xp.add', amount: -1 }])).statusCode, 400);
  assert.equal((await a.inject({ method: 'POST', url: '/v1/sync', payload: { events: [] } })).statusCode, 401);
});

test('Khôi phục trên “máy khác” thấy đủ thẻ SRS đã đồng bộ', async () => {
  const { headers, body } = await guest(a);
  const at = new Date().toISOString();
  await sync(headers, ['a', 'b', 'c'].map((k) => ({ clientEventId: id(), at, type: 'srs.upsert', card: card(`dialect:${k}`) })));
  const rec = await a.inject({ method: 'POST', url: '/v1/auth/recover', payload: { recoveryCode: body.recoveryCode } });
  const h2 = { authorization: `Bearer ${rec.json().accessToken}` };
  const snap = (await sync(h2, [])).json().snapshot;
  assert.deepEqual(snap.srs.map((c) => c.itemRef), ['dialect:a', 'dialect:b', 'dialect:c']);
});

test('Đồng hồ máy chạy nhanh (at ở tương lai) không chặn được lần ghi sau', async () => {
  const { headers } = await guest(a);
  const prefs = (speed) => ({ voiceId: 'v', speed, dialect: 'north', correctionLevel: 'gentle', persona: 'be_cu_tit', uiLanguage: 'en' });
  await sync(headers, [{ clientEventId: id(), at: '2099-01-01T00:00:00.000Z', type: 'preferences.set', preferences: prefs(2) }]);
  await new Promise((r) => setTimeout(r, 5));
  const r = await sync(headers, [{ clientEventId: id(), at: new Date().toISOString(), type: 'preferences.set', preferences: prefs(0.75) }]);
  assert.equal(r.json().snapshot.preferences.speed, 0.75);
});

// ---------- Nối GĐ0 ↔ GĐ1: cờ ngày, trạng thái lộ trình, streak có đóng băng ----------

test('day.mark: cờ đạt mục tiêu / đã dùng đóng băng chỉ bật một chiều; gửi lại => duplicates', async () => {
  const { headers } = await guest(a);
  const at = '2026-11-17T08:00:00.000Z';
  const e1 = { clientEventId: id(), at, type: 'day.mark', day: '2026-11-16', goalMet: true };
  const e2 = { clientEventId: id(), at, type: 'day.mark', day: '2026-11-16', freezeUsed: true };
  const e3 = { clientEventId: id(), at, type: 'day.mark', day: '2026-11-15', freezeUsed: true };
  await sync(headers, [e1, e2, e3]);
  const r = await sync(headers, [e1]);
  assert.deepEqual(r.json().duplicates, [e1.clientEventId]);
  const snap = r.json().snapshot;
  assert.deepEqual(snap.dayFlags, { goalMet: ['2026-11-16'], frozen: ['2026-11-15', '2026-11-16'] });
  // ngày chỉ có cờ (chưa có giây học) không hiện thành giây học 0
  assert.deepEqual(snap.activity, {});
});

test('progress.set: bản cũ hơn không đè bản mới; tài khoản mới => null', async () => {
  const { headers } = await guest(a);
  const empty = await sync(headers, []);
  assert.equal(empty.json().snapshot.progressState, null);
  assert.deepEqual(empty.json().snapshot.dayFlags, { goalMet: [], frozen: [] });
  await sync(headers, [{ clientEventId: id(), at: '2026-11-17T10:00:00.000Z', type: 'progress.set', lessonsDone: 6, freezes: 1, dailyGoal: 15 }]);
  const r = await sync(headers, [{ clientEventId: id(), at: '2026-11-17T09:00:00.000Z', type: 'progress.set', lessonsDone: 2, freezes: 0, dailyGoal: 5 }]);
  assert.deepEqual(r.json().snapshot.progressState, { lessonsDone: 6, freezes: 1, dailyGoal: 15 });
  const bad = await sync(headers, [{ clientEventId: id(), at: '2026-11-17T09:00:00.000Z', type: 'progress.set', lessonsDone: 2, freezes: 3, dailyGoal: 7 }]);
  assert.equal(bad.statusCode, 400);
});

test('Vượt unit lưu ở lesson_progress với tiền tố testout:', async () => {
  const { headers } = await guest(a);
  const at = '2026-11-17T08:00:00.000Z';
  const r = await sync(headers, [{ clientEventId: id(), at, type: 'lesson.progress', lessonId: 'testout:u1', status: 'completed', score: 100 }]);
  assert.deepEqual(r.json().snapshot.lessons, [{ lessonId: 'testout:u1', status: 'completed', bestScore: 100, completedAt: at }]);
});

test('Streak server tính cả ngày đã dùng đóng băng (khớp streakWithFreezes của client)', async () => {
  const { headers } = await guest(a);
  const at = '2026-11-18T08:00:00.000Z';
  await sync(headers, [
    { clientEventId: id(), at, type: 'xp.add', source: 'lesson', amount: 10, day: '2026-11-16' },
    { clientEventId: id(), at, type: 'day.mark', day: '2026-11-17', freezeUsed: true },
    { clientEventId: id(), at, type: 'xp.add', source: 'lesson', amount: 10, day: '2026-11-18' }
  ]);
  const s = (await a.inject({ url: '/v1/analytics/summary?today=2026-11-18', headers })).json();
  assert.equal(s.streakDays, 3);
});
