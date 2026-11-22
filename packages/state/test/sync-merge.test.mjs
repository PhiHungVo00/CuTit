import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { learnerStore, dayKey } from '../dist/index.js';
import { progressStore } from '../dist/progress.js';
import { startSync, getSyncEngine, SYNC_STORAGE_KEY } from '../dist/sync.js';

/**
 * Dự án 3 Task 5 — engine đồng bộ: gộp khách vào tài khoản (mergeInto), kéo định kỳ (startPeriodicPull),
 * đăng xuất chờ mạng (signOut / cancelSignOut). Server giả nhớ XP + sổ chống trùng THEO NGƯỜI DÙNG và biết gộp
 * như POST /v1/me/merge (cộng XP, chép sổ chống trùng) => kiểm được "không cộng XP hai lần".
 */
const GUEST = '00000000-0000-4000-8000-0000000000b0';
const ACC = '00000000-0000-4000-8000-0000000000a0';
const NOW = new Date('2026-11-20T10:00:00');
const TODAY = dayKey(NOW);
const s = () => learnerStore.getState();
const p = () => progressStore.getState();

const memStorage = () => {
  const m = new Map();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};
const userState = () => ({ byDay: {}, seen: new Set(), cards: {} });

function fakeServer() {
  const t = {
    users: { [GUEST]: userState() },
    current: GUEST,
    /** 'offline' | 'merged' (khách đã bị gộp: 401 account_merged) | null */
    fail: null,
    batches: [],
    snap(uid = t.current) {
      const u = t.users[uid];
      return {
        userId: uid,
        profile: null,
        preferences: null,
        srs: Object.values(u.cards),
        attempts: [],
        activity: {},
        consents: [],
        xp: { total: Object.values(u.byDay).reduce((a, b) => a + b, 0), byDay: { ...u.byDay } },
        lessons: [],
        achievements: [],
        dayFlags: { goalMet: [], frozen: [] },
        progressState: null
      };
    },
    async push(events) {
      if (t.fail === 'offline') throw Object.assign(new Error('offline'), { kind: 'offline' });
      if (t.fail === 'merged' && t.current === GUEST) throw Object.assign(new Error('merged'), { kind: 'unauthorized', code: 'account_merged' });
      t.batches.push({ uid: t.current, events });
      const u = t.users[t.current];
      const accepted = [];
      const duplicates = [];
      for (const e of events) {
        if (u.seen.has(e.clientEventId)) {
          duplicates.push(e.clientEventId);
          continue;
        }
        u.seen.add(e.clientEventId);
        accepted.push(e.clientEventId);
        if (e.type === 'xp.add') u.byDay[e.day] = (u.byDay[e.day] ?? 0) + e.amount;
        if (e.type === 'srs.upsert') u.cards[e.card.itemRef] = { ...e.card };
      }
      return { accepted, duplicates, snapshot: t.snap() };
    },
    /** như merge.ts: cộng XP, chép sổ chống trùng, thẻ; xóa khách */
    mergeOnServer() {
      const b = t.users[GUEST];
      const a = (t.users[ACC] ??= userState());
      for (const [d, x] of Object.entries(b.byDay)) a.byDay[d] = (a.byDay[d] ?? 0) + x;
      for (const id of b.seen) a.seen.add(id);
      for (const [k, c] of Object.entries(b.cards)) a.cards[k] ??= c;
      delete t.users[GUEST];
      t.current = ACC;
    },
    /** XP.add được gửi lên tài khoản đích (sau khi gộp) */
    xpSentTo(uid) {
      return t.batches.filter((x) => x.uid === uid).flatMap((x) => x.events.filter((e) => e.type === 'xp.add'));
    }
  };
  t.users[ACC] = userState();
  t.users[ACC].byDay = { '2026-11-01': 50 }; // tài khoản đích đã có tiến độ ở máy khác
  return t;
}

const start = (server, storage = memStorage(), extra = {}) =>
  startSync({ transport: server, storage, hasAccount: async () => true, debounceMs: 60_000, now: () => NOW, ...extra });

test.beforeEach(() => {
  getSyncEngine()?.stop();
  s().reset();
  p().resetProgress();
});
test.after(() => getSyncEngine()?.stop());

// ---------- mergeInto ----------

test('mergeInto: đẩy hàng đợi lên khách TRƯỚC, rồi gộp, rồi kéo dữ liệu đã gộp — XP cộng đúng một lần', async () => {
  const srv = fakeServer();
  const storage = memStorage();
  const engine = start(srv, storage);
  await engine.flush({ pull: true }); // owner = khách
  p().addXp(30, NOW);
  s().addCard({ itemRef: 'k:1', front: 'a', back: 'b', source: 'drill' });
  assert.ok(engine.status().pending > 0);
  let pendingWhenSwitch = -1;
  await engine.mergeInto(async () => {
    pendingWhenSwitch = engine.status().pending;
    srv.mergeOnServer();
    return { userId: ACC };
  });
  assert.equal(pendingWhenSwitch, 0, 'hàng đợi phải trống trước khi gọi merge');
  assert.equal(srv.users[ACC].byDay[TODAY], 30);
  assert.equal(srv.xpSentTo(ACC).length, 0, 'không tải lại dữ liệu máy lên tài khoản đích');
  assert.deepEqual(p().xpByDay, { '2026-11-01': 50, [TODAY]: 30 }, 'máy thấy tiến độ đã gộp');
  assert.equal(JSON.parse(storage.getItem(SYNC_STORAGE_KEY)).owner, ACC);
});

test('Mất mạng trước merge: mergeInto ném lỗi, KHÔNG gọi merge, hàng đợi còn nguyên; thử lại thành công không cộng hai lần', async () => {
  const srv = fakeServer();
  const engine = start(srv);
  await engine.flush({ pull: true });
  p().addXp(20, NOW);
  const pending = engine.status().pending;
  srv.fail = 'offline';
  let called = 0;
  const sw = async () => {
    called++;
    srv.mergeOnServer();
    return { userId: ACC };
  };
  await assert.rejects(engine.mergeInto(sw), (e) => e.kind === 'offline');
  assert.equal(called, 0);
  assert.equal(engine.status().pending, pending);
  srv.fail = null;
  await engine.mergeInto(sw);
  assert.equal(called, 1);
  assert.equal(srv.users[ACC].byDay[TODAY], 20);
  assert.equal(p().xpByDay[TODAY], 20);
});

test('Mất mạng GIỮA flush và merge (merge lỗi mạng, server chưa gộp): dữ liệu giữ nguyên, thử lại được, XP một lần', async () => {
  const srv = fakeServer();
  const engine = start(srv);
  await engine.flush({ pull: true });
  p().addXp(15, NOW);
  await assert.rejects(
    engine.mergeInto(async () => {
      throw Object.assign(new Error('offline'), { kind: 'offline' });
    }),
    (e) => e.kind === 'offline'
  );
  assert.equal(srv.users[GUEST].byDay[TODAY], 15, 'đã đẩy lên khách');
  assert.equal(p().xpByDay[TODAY], 15, 'máy giữ nguyên');
  await engine.mergeInto(async () => {
    srv.mergeOnServer();
    return { userId: ACC };
  });
  assert.equal(srv.users[ACC].byDay[TODAY], 15);
  assert.equal(srv.xpSentTo(ACC).length, 0);
});

test('Phản hồi gộp bị MẤT nhưng server đã gộp: khi phiên thành tài khoản đích, không tải lại dữ liệu máy (không cộng XP hai lần)', async () => {
  const srv = fakeServer();
  const engine = start(srv);
  await engine.flush({ pull: true });
  p().addXp(40, NOW);
  s().addCard({ itemRef: 'k:2', front: 'a', back: 'b', source: 'drill' });
  await assert.rejects(
    engine.mergeInto(async () => {
      srv.mergeOnServer(); // server gộp xong…
      throw Object.assign(new Error('timeout'), { kind: 'timeout' }); // …nhưng phản hồi không tới
    })
  );
  // Người dùng đăng nhập lại => phiên là tài khoản đích; lần gửi kế tiếp
  p().addXp(5, NOW);
  assert.equal(await engine.flush({ pull: true }), true);
  assert.equal(srv.users[ACC].byDay[TODAY], 45);
  const sent = srv.batches.filter((b) => b.uid === ACC).flatMap((b) => b.events);
  assert.equal(sent.filter((e) => e.type === 'srs.upsert').length, 0, 'thẻ đã có trên khách không bị gửi lại');
  assert.deepEqual(sent.filter((e) => e.type === 'xp.add').map((e) => e.amount), [5]);
  assert.equal(p().xpByDay[TODAY], 45);
});

test('Merge bị từ chối chắc chắn (vé hỏng 409): bỏ dấu gộp dở — phiên đổi sang khách MỚI vẫn tải lại dữ liệu máy như cũ', async () => {
  const srv = fakeServer();
  const engine = start(srv);
  await engine.flush({ pull: true });
  p().addXp(10, NOW);
  await assert.rejects(
    engine.mergeInto(async () => {
      throw Object.assign(new Error('bad ticket'), { kind: 'invalid-request', code: 'merge_ticket_invalid' });
    })
  );
  // khách cũ bị xóa ở máy khác => phiên tạo khách mới (luồng cũ): dữ liệu máy phải được tải lên khách mới
  const NEW = '00000000-0000-4000-8000-0000000000c0';
  srv.users[NEW] = userState();
  srv.current = NEW;
  assert.equal(await engine.flush({ pull: true }), true);
  assert.equal(srv.users[NEW].byDay[TODAY], 10);
});

test('Merge lỗi mạng nhưng server CHƯA gộp (lần gửi sau vẫn vào khách): bỏ dấu gộp dở — khách bị xóa ở máy khác thì vẫn tải lại dữ liệu máy', async () => {
  const srv = fakeServer();
  const engine = start(srv);
  await engine.flush({ pull: true });
  p().addXp(10, NOW);
  await assert.rejects(
    engine.mergeInto(async () => {
      throw Object.assign(new Error('offline'), { kind: 'offline' });
    })
  );
  // còn là khách và gửi thành công => chắc chắn server chưa gộp
  p().addXp(1, NOW);
  assert.equal(await engine.flush({ pull: true }), true);
  const NEW = '00000000-0000-4000-8000-0000000000c0';
  srv.users[NEW] = userState();
  srv.current = NEW;
  assert.equal(await engine.flush({ pull: true }), true);
  assert.equal(srv.users[NEW].byDay[TODAY], 11, 'dữ liệu máy phải được tải lên khách mới');
});

test('Tắt app ngay sau khi gộp (chưa kéo được): mở lại chỉ kéo, không tải lại dữ liệu máy', async () => {
  const srv = fakeServer();
  const storage = memStorage();
  const engine = start(srv, storage);
  await engine.flush({ pull: true });
  p().addXp(25, NOW);
  await engine.mergeInto(async () => {
    srv.mergeOnServer();
    srv.fail = 'offline'; // bước kéo sau gộp thất bại
    return { userId: ACC };
  });
  assert.equal(JSON.parse(storage.getItem(SYNC_STORAGE_KEY)).owner, ACC);
  engine.stop();
  srv.fail = null;
  const again = start(srv, storage);
  assert.equal(await again.flush({ pull: true }), true);
  assert.equal(srv.xpSentTo(ACC).length, 0);
  assert.equal(srv.users[ACC].byDay[TODAY], 25);
  assert.equal(p().xpByDay[TODAY], 25);
});

test('guestGone (máy thứ ba / merged-elsewhere): hàng đợi cũ gửi vào đích với NGUYÊN clientEventId — sự kiện đã có trên khách không cộng lại', async () => {
  const srv = fakeServer();
  const engine = start(srv);
  await engine.flush({ pull: true });
  p().addXp(12, NOW);
  await engine.flush(); // đã lên khách
  p().addXp(3, NOW); // còn trong hàng đợi máy này
  const queued = JSON.parse(JSON.stringify(engine.status()));
  assert.equal(queued.pending, 1);
  srv.mergeOnServer(); // máy KHÁC gộp khách vào tài khoản
  srv.current = GUEST; // máy này vẫn giữ token khách
  srv.fail = 'merged';
  assert.equal(await engine.flush(), false);
  srv.fail = null;
  await engine.mergeInto(
    async () => {
      srv.current = ACC; // người dùng đăng nhập tài khoản
      return { userId: ACC };
    },
    { guestGone: true }
  );
  assert.equal(srv.users[ACC].byDay[TODAY], 15);
  assert.equal(p().xpByDay[TODAY], 15);
});

// ---------- startPeriodicPull ----------

test('startPeriodicPull: kéo mỗi 300 000 ms và khi app trở lại màn hình; chưa có tài khoản thì không kéo; hàm dừng gỡ hết', async () => {
  const srv = fakeServer();
  let has = true;
  const doc = new EventTarget();
  doc.visibilityState = 'visible';
  globalThis.document = doc;
  mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  try {
    const engine = start(srv, memStorage(), { hasAccount: async () => has });
    await engine.flush({ pull: true });
    const n0 = srv.batches.length;
    const stop = engine.startPeriodicPull();
    mock.timers.tick(299_999);
    await new Promise((r) => setImmediate(r));
    assert.equal(srv.batches.length, n0);
    mock.timers.tick(1);
    await new Promise((r) => setImmediate(r));
    assert.equal(srv.batches.length, n0 + 1);
    doc.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setImmediate(r));
    assert.equal(srv.batches.length, n0 + 2);
    doc.visibilityState = 'hidden';
    mock.timers.tick(300_000);
    await new Promise((r) => setImmediate(r));
    assert.equal(srv.batches.length, n0 + 2, 'app ẩn: không kéo định kỳ');
    doc.visibilityState = 'visible';
    has = false;
    mock.timers.tick(300_000);
    await new Promise((r) => setImmediate(r));
    assert.equal(srv.batches.length, n0 + 2, 'chưa có tài khoản: không kéo');
    has = true;
    stop();
    mock.timers.tick(900_000);
    doc.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setImmediate(r));
    assert.equal(srv.batches.length, n0 + 2, 'đã dừng');
  } finally {
    mock.timers.reset();
    delete globalThis.document;
  }
});

// ---------- signOut ----------

test('signOut khi có mạng: đẩy hàng đợi, gọi logout, rồi xóa dữ liệu máy', async () => {
  const srv = fakeServer();
  let reset = 0;
  const engine = start(srv, memStorage(), { onLocalReset: () => reset++ });
  await engine.flush({ pull: true });
  p().addXp(7, NOW);
  const order = [];
  const r = await engine.signOut(async () => {
    order.push(['logout', srv.users[GUEST].byDay[TODAY]]);
  });
  assert.equal(r, 'done');
  assert.deepEqual(order, [['logout', 7]], 'logout chỉ sau khi XP đã lên server');
  assert.deepEqual(p().xpByDay, {});
  assert.equal(reset, 1);
  assert.equal(engine.status().signOutPending, false);
});

test('signOut khi offline: "waiting-network", giữ dữ liệu; có mạng lại thì tự đẩy rồi đăng xuất', async () => {
  const srv = fakeServer();
  let reset = 0;
  const engine = start(srv, memStorage(), { onLocalReset: () => reset++ });
  await engine.flush({ pull: true });
  p().addXp(9, NOW);
  srv.fail = 'offline';
  let logouts = 0;
  const r = await engine.signOut(async () => void logouts++);
  assert.equal(r, 'waiting-network');
  assert.equal(engine.status().signOutPending, true);
  assert.equal(logouts, 0);
  assert.equal(p().xpByDay[TODAY], 9, 'chưa xóa gì');
  srv.fail = null;
  await engine.flush(); // vd. sự kiện "online"
  await new Promise((r2) => setImmediate(r2));
  await new Promise((r2) => setImmediate(r2));
  assert.equal(srv.users[GUEST].byDay[TODAY], 9);
  assert.equal(logouts, 1);
  assert.equal(reset, 1);
  assert.deepEqual(p().xpByDay, {});
  assert.equal(engine.status().signOutPending, false);
});

test('cancelSignOut: hủy đăng xuất đang chờ => có mạng lại cũng KHÔNG đăng xuất', async () => {
  const srv = fakeServer();
  const engine = start(srv);
  await engine.flush({ pull: true });
  p().addXp(4, NOW);
  srv.fail = 'offline';
  let logouts = 0;
  assert.equal(await engine.signOut(async () => void logouts++), 'waiting-network');
  assert.equal(engine.cancelSignOut(), true);
  assert.equal(engine.status().signOutPending, false);
  srv.fail = null;
  await engine.flush();
  await new Promise((r) => setImmediate(r));
  assert.equal(logouts, 0);
  assert.equal(p().xpByDay[TODAY], 4);
  assert.equal(engine.cancelSignOut(), false);
});

test('signOut: logout lỗi mạng => chưa xóa dữ liệu, vẫn chờ', async () => {
  const srv = fakeServer();
  const engine = start(srv);
  await engine.flush({ pull: true });
  p().addXp(6, NOW);
  const r = await engine.signOut(async () => {
    throw Object.assign(new Error('offline'), { kind: 'offline' });
  });
  assert.equal(r, 'waiting-network');
  assert.equal(p().xpByDay[TODAY], 6);
  assert.equal(engine.status().signOutPending, true);
  engine.cancelSignOut();
});

test('Cờ đăng xuất chờ mạng sống qua lần mở lại app (status.signOutPending)', async () => {
  const srv = fakeServer();
  const storage = memStorage();
  const engine = start(srv, storage);
  await engine.flush({ pull: true });
  p().addXp(2, NOW);
  srv.fail = 'offline';
  await engine.signOut(async () => undefined);
  engine.stop();
  const again = start(srv, storage);
  assert.equal(again.status().signOutPending, true);
  again.cancelSignOut();
});

test('Mở lại app khi đang chờ đăng xuất: lần gửi thành công TRƯỚC khi Host gọi lại signOut(logout) không xóa dữ liệu máy mà bỏ qua logout', async () => {
  const srv = fakeServer();
  const storage = memStorage();
  const engine = start(srv, storage);
  await engine.flush({ pull: true });
  p().addXp(2, NOW);
  srv.fail = 'offline';
  await engine.signOut(async () => undefined);
  engine.stop();
  srv.fail = null;
  let resets = 0;
  const again = start(srv, storage, { onLocalReset: () => resets++ });
  await again.flush({ pull: true }); // vd. sự kiện online / lần thử lại theo backoff, trước khi Host kịp gọi signOut(logout)
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(resets, 0, 'không được xóa dữ liệu khi chưa có callback logout (token vẫn còn hiệu lực trên server)');
  assert.equal(again.status().signOutPending, true);
  let logouts = 0;
  assert.equal(await again.signOut(async () => void logouts++), 'done');
  assert.equal(logouts, 1);
  assert.equal(resets, 1);
});
