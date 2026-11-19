import test from 'node:test';
import assert from 'node:assert/strict';
import { learnerStore } from '../dist/index.js';
import { startSync, getSyncEngine, enqueueSyncEvent, SYNC_STORAGE_KEY } from '../dist/sync.js';

const USER = '00000000-0000-4000-8000-000000000001';
const s = () => learnerStore.getState();

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
  ...extra
});

/** Transport giả: ghi lại các lô; `fail` = ném lỗi mạng; trả accepted = mọi id */
function fakeTransport(snap = () => emptySnap()) {
  const t = {
    batches: [],
    fail: false,
    async push(events) {
      if (t.fail) throw Object.assign(new Error('offline'), { kind: 'offline' });
      t.batches.push(events);
      return { accepted: events.map((e) => e.clientEventId), duplicates: [], snapshot: snap() };
    }
  };
  return t;
}

const start = (transport, storage = memStorage(), hasAccount = false) => ({
  storage,
  engine: startSync({ transport, storage, hasAccount: async () => hasAccount, debounceMs: 60_000 })
});

test.beforeEach(() => {
  getSyncEngine()?.stop();
  s().reset();
});
test.after(() => getSyncEngine()?.stop());

test('Thay đổi trên máy => sự kiện trong hàng đợi; một lần gửi có srs.upsert + preferences.set (đã gộp)', async () => {
  const tr = fakeTransport();
  const { engine } = start(tr);
  s().addCard({ itemRef: 'dialect:d1', front: 'ngô', back: 'bắp', source: 'dialect' });
  s().setPreferences({ speed: 1.25 });
  s().setPreferences({ speed: 1.5 }); // gộp: chỉ giữ bản mới nhất
  assert.equal(engine.status().pending, 2);
  assert.equal(await engine.flush(), true);
  assert.equal(tr.batches.length, 1);
  const types = tr.batches[0].map((e) => e.type).sort();
  assert.deepEqual(types, ['preferences.set', 'srs.upsert']);
  assert.equal(tr.batches[0].find((e) => e.type === 'preferences.set').preferences.speed, 1.5);
  assert.equal(engine.status().pending, 0);
  assert.ok(engine.status().lastSyncAt);
});

test('Mất mạng: hàng đợi còn nguyên, tắt app mở lại (engine mới, cùng storage) vẫn còn rồi gửi đúng một lần', async () => {
  const tr = fakeTransport();
  const { engine, storage } = start(tr);
  s().addCard({ itemRef: 'x:1', front: 'a', back: 'b', source: 'drill' });
  s().addStudyTime(90, new Date('2026-11-17T09:00:00'));
  tr.fail = true;
  assert.equal(await engine.flush(), false);
  assert.equal(engine.status().error, 'offline');
  assert.equal(engine.status().pending, 2);
  engine.stop();

  tr.fail = false;
  const again = start(tr, storage).engine;
  assert.equal(again.status().pending, 2, 'hàng đợi lưu bền qua lần khởi động lại');
  await again.flush();
  const sent = tr.batches.flat();
  assert.deepEqual(sent.map((e) => e.type).sort(), ['activity.set', 'srs.upsert']);
  assert.equal(sent.find((e) => e.type === 'activity.set').day, '2026-11-17');
  assert.equal(again.status().pending, 0);
});

test('Máy mới khôi phục: mặc định trên máy KHÔNG thành sự kiện; dữ liệu server thay dữ liệu máy', async () => {
  const card = (k) => ({ itemRef: `dialect:${k}`, front: k, back: k, source: 'dialect', ease: 250, intervalDays: 6, repetitions: 2, dueAt: '2026-12-01T00:00:00.000Z' });
  const tr = fakeTransport(() =>
    emptySnap({
      profile: { onboarded: true, level: 3, goal: 'travel', nativeLang: 'ko', dialect: 'south' },
      srs: ['a', 'b', 'c'].map(card),
      activity: { '2026-11-16': 600 }
    })
  );
  const { engine } = start(tr, memStorage(), true);
  let switched = false;
  await engine.pullAndReplace(async () => {
    switched = true;
  });
  assert.equal(switched, true);
  assert.deepEqual(Object.keys(s().srs).sort(), ['dialect:a', 'dialect:b', 'dialect:c']);
  assert.equal(s().profile.level, 3);
  assert.equal(s().preferences.dialect, 'north', 'server chưa có tùy chỉnh => giữ của máy');
  assert.equal(s().activity['2026-11-16'], 600);
  const sentTypes = tr.batches.flat().map((e) => e.type);
  assert.ok(!sentTypes.includes('profile.set') && !sentTypes.includes('preferences.set'), `không đẩy mặc định: ${sentTypes}`);
  assert.equal(engine.status().pending, 0, 'áp ảnh chụp không sinh sự kiện vọng lại');
});

test('Khôi phục thất bại (mã sai): dữ liệu và hàng đợi của tài khoản hiện tại giữ nguyên', async () => {
  const tr = fakeTransport();
  const { engine } = start(tr);
  s().addCard({ itemRef: 'keep:1', front: 'a', back: 'b', source: 'drill' });
  await assert.rejects(
    engine.pullAndReplace(async () => {
      throw new Error('invalid_recovery_code');
    })
  );
  assert.equal(engine.status().pending, 1);
  assert.ok(s().srs['keep:1']);
  assert.equal(tr.batches.length, 0);
});

test('Lượt làm bài: mảng đã đầy 1000 vẫn chỉ gửi lượt mới (con trỏ thời gian, không theo chỉ số)', async () => {
  const base = Date.parse('2026-11-01T00:00:00Z');
  for (let i = 0; i < 1000; i++) s().recordAttempt('drill', i % 2 === 0, undefined, new Date(base + i * 1000));
  const tr = fakeTransport();
  const { engine } = start(tr);
  await engine.flush();
  assert.equal(tr.batches.flat().filter((e) => e.type === 'attempt.add').length, 1000, 'dữ liệu cũ chưa đồng bộ được tải lên hết');
  tr.batches.length = 0;
  s().recordAttempt('sentence', true, 80, new Date(base + 2_000_000));
  assert.equal(s().attempts.length, 1000);
  await engine.flush();
  const sent = tr.batches.flat();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].attempt.skill, 'sentence');
});

test('Xóa tài khoản: chạy DELETE trước, rồi xóa dữ liệu máy + hàng đợi; không đẩy lại gì', async () => {
  const tr = fakeTransport();
  const { engine, storage } = start(tr);
  s().addCard({ itemRef: 'gone:1', front: 'a', back: 'b', source: 'drill' });
  s().giveConsent('voice');
  const order = [];
  await engine.resetLocal(async () => order.push('delete'));
  order.push('after');
  assert.deepEqual(order, ['delete', 'after']);
  assert.deepEqual(s().srs, {});
  assert.equal(engine.status().pending, 0);
  assert.equal(JSON.parse(storage.getItem(SYNC_STORAGE_KEY)).owner, null);
  await engine.flush();
  assert.equal(tr.batches.length, 0);
});

test('GĐ1: enqueueSyncEvent trước khi engine chạy vẫn được gửi khi engine khởi động', async () => {
  const storage = memStorage();
  enqueueSyncEvent({ type: 'xp.add', source: 'lesson', amount: 10, day: '2026-11-17', lessonId: 'u1-l1' }, storage);
  const tr = fakeTransport();
  const { engine } = start(tr, storage);
  await engine.flush();
  const xp = tr.batches.flat().filter((e) => e.type === 'xp.add');
  assert.equal(xp.length, 1);
  assert.match(xp[0].clientEventId, /^[0-9a-f-]{36}$/);
});

test('Khôi phục dở dang (đã đổi tài khoản nhưng kéo dữ liệu thất bại): KHÔNG tải dữ liệu máy cũ lên tài khoản mới', async () => {
  const OTHER = '00000000-0000-4000-8000-000000000009';
  const serverCard = { itemRef: 'server:1', front: 's', back: 's', source: 'dialect', ease: 250, intervalDays: 1, repetitions: 1, dueAt: '2026-12-01T00:00:00.000Z' };
  const tr = fakeTransport(() => emptySnap({ userId: OTHER, srs: [serverCard] }));
  const { engine, storage } = start(tr);
  s().addCard({ itemRef: 'old:1', front: 'cũ', back: 'cũ', source: 'drill' });
  await engine.flush(); // tài khoản cũ đã có thẻ old:1 (owner = USER... theo snapshot giả)
  tr.batches.length = 0;

  tr.fail = true;
  await assert.rejects(engine.pullAndReplace(async () => 'switched'));
  s().addCard({ itemRef: 'old:2', front: 'cũ', back: 'cũ', source: 'drill' }); // thay đổi trong lúc dở dang
  engine.stop();

  // mở lại app khi đã có mạng: chỉ kéo + thay, không gửi old:1/old:2
  tr.fail = false;
  const again = start(tr, storage, true).engine;
  await again.flush({ pull: true });
  const sent = tr.batches.flat();
  assert.deepEqual(sent, [], `không được gửi dữ liệu máy cũ: ${sent.map((e) => e.type)}`);
  assert.deepEqual(Object.keys(s().srs), ['server:1']);
});

test('Rút lại đồng ý => consent.revoke; đồng ý lại => consent.grant mới (có phiên bản nội dung)', async () => {
  let server = [];
  const tr = fakeTransport(() => emptySnap({ consents: server }));
  const { engine } = start(tr);
  s().giveConsent('voice');
  await engine.flush();
  const grant = tr.batches.flat().find((e) => e.type === 'consent.grant');
  assert.equal(grant.key, 'voice');
  assert.equal(grant.version, '2');
  server = [{ key: 'voice', version: '2', grantedAt: grant.at }];
  await engine.flush({ pull: true });
  assert.equal(s().consents.voice, true);

  s().revokeConsent('voice');
  assert.equal(s().consents.voice, undefined);
  const before = tr.batches.length;
  server = [];
  await engine.flush();
  assert.deepEqual(tr.batches.slice(before).flat().map((e) => [e.type, e.key]), [['consent.revoke', 'voice']]);
  assert.equal(s().consents.voice, undefined, 'ảnh chụp sau khi rút lại không bật lại đồng ý');

  s().giveConsent('voice');
  const mid = tr.batches.length;
  await engine.flush();
  assert.deepEqual(tr.batches.slice(mid).flat().map((e) => e.type), ['consent.grant']);
});

test('Đồng ý bị rút ở máy khác (ảnh chụp server không còn khóa) => máy này cũng thôi coi là đã đồng ý', async () => {
  let server = [{ key: 'camera', version: '1', grantedAt: new Date().toISOString() }];
  const tr = fakeTransport(() => emptySnap({ consents: server }));
  const { engine } = start(tr);
  await engine.flush({ pull: true });
  assert.equal(s().consents.camera, true);
  server = [];
  await engine.flush({ pull: true });
  assert.equal(s().consents.camera, undefined);
  assert.equal(engine.status().pending, 0, 'không sinh sự kiện vọng lại');
});
