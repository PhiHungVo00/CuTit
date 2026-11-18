import test from 'node:test';
import assert from 'node:assert/strict';
import { learnerStore, dayKey } from '../dist/index.js';
import { progressStore, initialProgress } from '../dist/progress.js';
import { startSync, getSyncEngine, SYNC_STORAGE_KEY } from '../dist/sync.js';

/** Nối GĐ0 ↔ GĐ1: store `becutit.progress` đi qua cùng hàng đợi đồng bộ */

const USER = '00000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-11-18T10:00:00');
const TODAY = dayKey(NOW);
const ago = (n) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return dayKey(d);
};
const p = () => progressStore.getState();

const memStorage = () => {
  const m = new Map();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};
const emptySnap = (extra = {}) => ({
  userId: USER,
  profile: null,
  preferences: null,
  srs: [],
  attempts: [],
  activity: {},
  consents: [],
  xp: { total: 0, byDay: {} },
  lessons: [],
  achievements: [],
  dayFlags: { goalMet: [], frozen: [] },
  progressState: null,
  ...extra
});

/** Server giả có nhớ: cộng XP theo xp.add, giữ bài/cờ/progress.set — đủ để kiểm tra không cộng hai lần */
function fakeServer() {
  const st = { byDay: {}, lessons: {}, goalMet: new Set(), frozen: new Set(), progressState: null, seen: new Set() };
  const t = {
    batches: [],
    fail: false,
    st,
    snap: () =>
      emptySnap({
        xp: { total: Object.values(st.byDay).reduce((a, b) => a + b, 0), byDay: { ...st.byDay } },
        lessons: Object.entries(st.lessons).map(([lessonId, l]) => ({ lessonId, status: 'completed', bestScore: l.score, completedAt: l.at })),
        dayFlags: { goalMet: [...st.goalMet].sort(), frozen: [...st.frozen].sort() },
        progressState: st.progressState
      }),
    async push(events) {
      if (t.fail) throw Object.assign(new Error('offline'), { kind: 'offline' });
      t.batches.push(events);
      for (const e of events) {
        if (st.seen.has(e.clientEventId)) continue;
        st.seen.add(e.clientEventId);
        if (e.type === 'xp.add') st.byDay[e.day] = (st.byDay[e.day] ?? 0) + e.amount;
        if (e.type === 'lesson.progress') st.lessons[e.lessonId] = { score: Math.max(st.lessons[e.lessonId]?.score ?? 0, e.score ?? 0), at: e.at };
        if (e.type === 'day.mark') {
          if (e.goalMet) st.goalMet.add(e.day);
          if (e.freezeUsed) st.frozen.add(e.day);
        }
        if (e.type === 'progress.set') st.progressState = { lessonsDone: e.lessonsDone, freezes: e.freezes, dailyGoal: e.dailyGoal };
      }
      return { accepted: events.map((e) => e.clientEventId), duplicates: [], snapshot: t.snap() };
    }
  };
  return t;
}

const start = (transport, storage = memStorage(), extra = {}) => ({
  storage,
  engine: startSync({ transport, storage, hasAccount: async () => false, debounceMs: 60_000, now: () => NOW, ...extra })
});
const events = (tr) => tr.batches.flat();
const ofType = (tr, type) => events(tr).filter((e) => e.type === type);

test.beforeEach(() => {
  getSyncEngine()?.stop();
  learnerStore.getState().reset();
  p().resetProgress();
});
test.after(() => getSyncEngine()?.stop());

test('Xong một bài => xp.add (ngày địa phương) + lesson.progress (điểm 0–100) + progress.set', async () => {
  const tr = fakeServer();
  const { engine } = start(tr);
  const { xp } = p().completeLesson('u1l1', { total: 10, firstTryCorrect: 10 }, NOW);
  assert.equal(xp, 25);
  assert.equal(await engine.flush(), true);
  assert.deepEqual(
    ofType(tr, 'xp.add').map((e) => [e.amount, e.day, e.source]),
    [[25, TODAY, 'path']]
  );
  assert.deepEqual(ofType(tr, 'lesson.progress').map((e) => [e.lessonId, e.status, e.score]), [['u1l1', 'completed', 100]]);
  assert.deepEqual(ofType(tr, 'progress.set').map(({ lessonsDone, freezes, dailyGoal }) => ({ lessonsDone, freezes, dailyGoal })), [
    { lessonsDone: 1, freezes: 0, dailyGoal: 10 }
  ]);
  // lần flush sau không gửi lại gì, XP server = XP máy
  await engine.flush({ pull: true });
  assert.equal(events(tr).length, 3);
  assert.equal(tr.snap().xp.total, 25);
});

test('Làm lại bài với điểm thấp hơn không gửi lesson.progress mới; điểm cao hơn thì gửi', async () => {
  const tr = fakeServer();
  const { engine } = start(tr);
  p().completeLesson('u1l1', { total: 3, firstTryCorrect: 2 }, NOW);
  await engine.flush();
  p().completeLesson('u1l1', { total: 3, firstTryCorrect: 1 }, NOW);
  await engine.flush();
  assert.deepEqual(ofType(tr, 'lesson.progress').map((e) => e.score), [67]);
  p().completeLesson('u1l1', { total: 3, firstTryCorrect: 3 }, NOW);
  await engine.flush();
  assert.deepEqual(ofType(tr, 'lesson.progress').map((e) => e.score), [67, 100]);
});

test('Vượt unit => lesson.progress testout:<unit>; đóng băng => day.mark freezeUsed; đủ phút mục tiêu => day.mark goalMet (một lần)', async () => {
  const tr = fakeServer();
  const { engine } = start(tr);
  p().passTestOut('u1', NOW);
  // học hôm kia, lỡ hôm qua, có 1 đóng băng
  progressStore.setState({ freezes: 1, xpByDay: { ...p().xpByDay, [ago(2)]: 10 } });
  assert.equal(p().settleFreezes({}, NOW), 1);
  learnerStore.getState().addStudyTime(400, NOW);
  learnerStore.getState().addStudyTime(300, NOW); // 700 s ≥ 10 phút
  learnerStore.getState().addStudyTime(60, NOW);
  await engine.flush();
  assert.deepEqual(ofType(tr, 'lesson.progress').map((e) => [e.lessonId, e.score]), [['testout:u1', 100]]);
  assert.deepEqual(ofType(tr, 'day.mark').map(({ day, goalMet, freezeUsed }) => ({ day, goalMet, freezeUsed })), [
    { day: ago(1), goalMet: undefined, freezeUsed: true },
    { day: TODAY, goalMet: true, freezeUsed: undefined }
  ]);
});

test('Người dùng cũ (bản ghi becutit.sync chưa có bóng tiến độ): tiến độ cũ được tải lên đúng một lần; XP > 1000/ngày tách lô', async () => {
  const storage = memStorage();
  // bản ghi của GĐ0 trước khi có đồng bộ tiến độ (không có progressShadow)
  storage.setItem(SYNC_STORAGE_KEY, JSON.stringify({ owner: USER, outbox: [], shadow: { profile: learnerStore.getState().profile, preferences: learnerStore.getState().preferences, srs: {}, activity: {}, consents: [], attemptCursor: null }, lastSyncAt: null }));
  progressStore.setState({ xpByDay: { [ago(3)]: 2500, 'hỏng': 5 }, lessons: { u1l1: { best: 0.5, times: 2, at: NOW.toISOString() } }, lessonsDone: 2 });
  const tr = fakeServer();
  const { engine } = start(tr, storage);
  await engine.flush();
  assert.deepEqual(ofType(tr, 'xp.add').map((e) => e.amount).sort((a, b) => a - b), [500, 1000, 1000]);
  assert.ok(ofType(tr, 'xp.add').every((e) => e.day === ago(3)), 'khóa ngày hỏng bị bỏ qua, không làm kẹt lô');
  assert.equal(ofType(tr, 'lesson.progress').length, 1);
  engine.stop();
  const again = start(tr, storage).engine;
  await again.flush({ pull: true });
  assert.equal(ofType(tr, 'xp.add').length, 3);
});

test('Khôi phục trên máy mới: thấy đủ XP, bài đã xong, vượt unit, đóng băng, mục tiêu; flush tiếp không cộng XP lần hai', async () => {
  const tr = fakeServer();
  tr.st.byDay = { [ago(1)]: 25, [TODAY]: 15 };
  tr.st.lessons = { u1l1: { score: 80, at: '2026-11-17T08:00:00.000Z' }, 'testout:u2': { score: 100, at: '2026-11-17T09:00:00.000Z' } };
  tr.st.frozen.add(ago(2));
  tr.st.progressState = { lessonsDone: 7, freezes: 1, dailyGoal: 15 };
  // máy mới có ít lỗi/điểm thanh cũ của khách tạm => bị thay
  progressStore.setState({ mistakes: [{ key: 'x', at: NOW.toISOString() }], toneStats: { ngang: { n: 1, sum: 50 } } });
  const { engine } = start(tr);
  await engine.pullAndReplace(async () => undefined);
  const s = p();
  assert.deepEqual(s.xpByDay, { [ago(1)]: 25, [TODAY]: 15 });
  assert.deepEqual(Object.keys(s.lessons), ['u1l1']);
  assert.equal(s.lessons.u1l1.best, 0.8);
  assert.deepEqual(Object.keys(s.testedOut), ['u2']);
  assert.deepEqual(s.frozenDays, [ago(2)]);
  assert.equal(s.lessonsDone, 7);
  assert.equal(s.freezes, 1);
  assert.equal(s.dailyGoal, 15);
  assert.deepEqual(s.mistakes, []);
  assert.deepEqual(s.toneStats, {});
  await engine.flush({ pull: true });
  assert.equal(events(tr).length, 0, 'áp ảnh chụp không sinh sự kiện vọng lại');
  assert.equal(tr.snap().xp.total, 40);
});

test('Hai máy: XP của máy kia về máy này (server là nguồn chuẩn tổng XP khi hàng đợi rỗng)', async () => {
  const tr = fakeServer();
  const { engine } = start(tr);
  p().completeLesson('u1l1', { total: 2, firstTryCorrect: 1 }, NOW); // 15 XP
  await engine.flush();
  tr.st.byDay[TODAY] += 30; // máy kia vừa xong vượt unit
  tr.st.lessons['u1l2'] = { score: 50, at: NOW.toISOString() };
  await engine.flush({ pull: true });
  assert.equal(p().xpByDay[TODAY], 45);
  assert.ok(p().lessons.u1l2);
  assert.ok(p().lessons.u1l1, 'bài của máy này vẫn còn');
  const before = events(tr).length;
  await engine.flush({ pull: true });
  assert.equal(events(tr).length, before);
});

test('Khôi phục dở dang (replacePending): tiến độ máy cũ KHÔNG bị đưa vào hàng đợi', async () => {
  const tr = fakeServer();
  const { engine } = start(tr);
  tr.fail = true;
  await assert.rejects(engine.pullAndReplace(async () => undefined));
  p().completeLesson('u9l9', { total: 1, firstTryCorrect: 1 }, NOW);
  assert.equal(engine.status().pending, 0);
});

test('resetLocal: xóa cả tiến độ lộ trình, gọi onLocalReset, không sinh sự kiện', async () => {
  const tr = fakeServer();
  let resets = 0;
  const { engine } = start(tr, memStorage(), { onLocalReset: () => resets++ });
  p().completeLesson('u1l1', { total: 1, firstTryCorrect: 1 }, NOW);
  progressStore.setState({ reminder: { enabled: true, hour: 19, minute: 0 } });
  await engine.resetLocal(async () => undefined);
  assert.deepEqual(p().xpByDay, {});
  assert.deepEqual(p().lessons, {});
  assert.deepEqual(p().reminder, initialProgress().reminder);
  assert.equal(resets, 1);
  assert.equal(engine.status().pending, 0);
});
