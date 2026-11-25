import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { loadConfig } from '../dist/config.js';
import { buildApp } from '../dist/app.js';
import { createDbProvider, schema } from '../dist/db/client.js';
import { createBlobStore } from '../dist/services/blob/index.js';
import { drainBlobDeletions, purgeUserFeedbackBlobs, runFeedbackPurge } from '../dist/services/feedback/purge.js';
import { purgeExpiredAccounts } from '../dist/services/auth/lifecycle.js';
import { guest, ORIGIN } from './helpers.mjs';

/**
 * Dọn tệp góp ý (dự án 5a Task 2): mốc theo done_at (ảnh 180 ngày, video 90 ngày), góp ý chưa xong 365 ngày từ created_at,
 * chữ giữ nguyên, thử lại hàng xóa lỗi, xóa tài khoản (cả đường job quá hạn 30 ngày).
 * TEST_DATABASE_URL => chạy trên Postgres thật (mỗi tệp một DB mới, --test-concurrency=1).
 */
const PG = process.env.TEST_DATABASE_URL;
const DAY = 24 * 3600 * 1000;
const NOW = new Date('2026-11-25T00:00:00.000Z');
const ago = (days) => new Date(NOW.getTime() - days * DAY);
const walk = (dir) => {
  const out = [];
  const go = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      statSync(p).isDirectory() ? go(p) : out.push(p);
    }
  };
  if (existsSync(dir)) go(dir);
  return out;
};

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'fbp-'));
  const dbp = createDbProvider(PG ? { DATABASE_URL: PG, PGLITE_DIR: 'memory://' } : { PGLITE_DIR: 'memory://' });
  const app = await buildApp(loadConfig({ NODE_ENV: 'test', CORS_ORIGIN: ORIGIN, GUEST_QUOTA_FACTOR: '1', BLOB_DIR: dir }), { logger: false, db: dbp });
  const db = await dbp.get();
  const blob = createBlobStore({ BLOB_PROVIDER: 'fs', BLOB_DIR: dir });
  let seq = 0;
  /** Tạo một góp ý + tệp thật trong kho. doneAt/createdAt giả để thử mốc. */
  async function seed(userId, { createdAt = NOW, doneAt = null, media = ['image'] } = {}) {
    const [rep] = await db
      .insert(schema.feedbackReports)
      .values({
        userId,
        kind: 'bug',
        body: 'Nội dung góp ý đủ dài để qua kiểm tra',
        context: { appVersion: '1', build: 'b', platform: 'web', osVersion: 'x', locale: 'vi', route: '/', recentRoutes: [] },
        status: doneAt ? 'done' : 'received',
        doneAt,
        createdAt
      })
      .returning();
    const keys = [];
    for (const m of media) {
      const key = `feedback/${rep.id}/${String(++seq).padStart(8, '0')}-0000-4000-8000-000000000000.${m === 'image' ? 'png' : 'mp4'}`;
      await blob.put(key, Readable.from([Buffer.alloc(10, 1)]), { contentType: m === 'image' ? 'image/png' : 'video/mp4', maxBytes: 100 });
      await db.insert(schema.feedbackFiles).values({ feedbackId: rep.id, blobKey: key, media: m, contentType: m === 'image' ? 'image/png' : 'video/mp4', bytes: 10 });
      keys.push(key);
    }
    return { id: rep.id, keys };
  }
  const purgedOf = async (key) => (await db.select().from(schema.feedbackFiles).where(eq(schema.feedbackFiles.blobKey, key)))[0].purgedAt;
  return {
    app,
    db,
    dir,
    blob,
    seed,
    purgedOf,
    async done() {
      await app.close();
      await dbp.close();
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

test('runFeedbackPurge: ảnh done 181 ngày xóa, 179 ngày giữ; video done 91 ngày xóa, 89 ngày giữ; chữ còn nguyên', async () => {
  const t = await setup();
  const g = await guest(t.app);
  const u = g.body.userId;
  const img181 = await t.seed(u, { doneAt: ago(181) });
  const img179 = await t.seed(u, { doneAt: ago(179) });
  const vid91 = await t.seed(u, { doneAt: ago(91), media: ['video'] });
  const vid89 = await t.seed(u, { doneAt: ago(89), media: ['video'] });
  // một góp ý done 100 ngày có cả ảnh (giữ, <180) lẫn video (xóa, >90)
  const mixed = await t.seed(u, { doneAt: ago(100), media: ['image', 'video'] });

  const r = await runFeedbackPurge(t.db, t.blob, NOW);
  assert.deepEqual(r, { images: 1, videos: 2, stale: 0, retried: 0 });
  assert.ok(await t.purgedOf(img181.keys[0]));
  assert.equal(await t.purgedOf(img179.keys[0]), null);
  assert.ok(await t.purgedOf(vid91.keys[0]));
  assert.equal(await t.purgedOf(vid89.keys[0]), null);
  assert.equal(await t.purgedOf(mixed.keys[0]), null);
  assert.ok(await t.purgedOf(mixed.keys[1]));
  assert.equal(walk(t.dir).length, 3, 'còn: ảnh 179, video 89, ảnh của góp ý mixed');
  assert.equal((await t.db.select().from(schema.feedbackReports)).length, 5, 'chữ giữ nguyên');
  assert.equal((await t.db.select().from(schema.blobDeletions)).length, 0);

  // chạy lại: idempotent
  assert.deepEqual(await runFeedbackPurge(t.db, t.blob, NOW), { images: 0, videos: 0, stale: 0, retried: 0 });
  await t.done();
});

test('runFeedbackPurge: chưa xong 366 ngày => xóa mọi tệp; 364 ngày giữ; đã xong thì tính theo done_at, không theo created_at', async () => {
  const t = await setup();
  const g = await guest(t.app);
  const u = g.body.userId;
  const stale = await t.seed(u, { createdAt: ago(366), media: ['image', 'video'] });
  const fresh = await t.seed(u, { createdAt: ago(364), media: ['image'] });
  // tạo cách đây 400 ngày nhưng vừa mới "Đã xong" 10 ngày trước: KHÔNG xóa (mốc là done_at)
  const doneRecently = await t.seed(u, { createdAt: ago(400), doneAt: ago(10), media: ['image', 'video'] });

  const r = await runFeedbackPurge(t.db, t.blob, NOW);
  assert.deepEqual(r, { images: 0, videos: 0, stale: 2, retried: 0 });
  for (const k of stale.keys) assert.ok(await t.purgedOf(k));
  assert.equal(await t.purgedOf(fresh.keys[0]), null);
  for (const k of doneRecently.keys) assert.equal(await t.purgedOf(k), null);
  assert.equal(walk(t.dir).length, 3);
  await t.done();
});

test('kho tệp lỗi khi dọn: tệp đã đánh dấu purged, khóa nằm trong blob_deletions; lần chạy sau thử lại thành công', async () => {
  const t = await setup();
  const g = await guest(t.app);
  const a = await t.seed(g.body.userId, { doneAt: ago(200) });
  let failing = true;
  const flaky = {
    put: (...x) => t.blob.put(...x),
    get: (...x) => t.blob.get(...x),
    totalBytes: () => t.blob.totalBytes(),
    delete: async (k) => {
      if (failing) throw new Error('kho tệp hỏng');
      return t.blob.delete(k);
    }
  };
  const r1 = await runFeedbackPurge(t.db, flaky, NOW);
  assert.deepEqual(r1, { images: 1, videos: 0, stale: 0, retried: 0 });
  const q = await t.db.select().from(schema.blobDeletions);
  assert.equal(q.length, 1);
  assert.equal(q[0].blobKey, a.keys[0]);
  assert.equal(q[0].attempts, 1);
  assert.equal(walk(t.dir).length, 1);

  const r2 = await runFeedbackPurge(t.db, flaky, NOW); // vẫn hỏng: attempts tăng, không mất dòng
  assert.equal(r2.retried, 0);
  assert.equal((await t.db.select().from(schema.blobDeletions))[0].attempts, 2);

  failing = false;
  const r3 = await runFeedbackPurge(t.db, flaky, NOW);
  assert.equal(r3.retried, 1);
  assert.deepEqual(walk(t.dir), []);
  assert.equal((await t.db.select().from(schema.blobDeletions)).length, 0);
  await t.done();
});

test('purgeUserFeedbackBlobs: lấy khóa trước khi xóa user, xóa tệp sau commit; user không tồn tại thì không đụng kho', async () => {
  const t = await setup();
  const g = await guest(t.app);
  const other = await guest(t.app);
  const mine = await t.seed(g.body.userId, { media: ['image', 'video'] });
  const theirs = await t.seed(other.body.userId, {});
  const ok = await purgeUserFeedbackBlobs(t.db, t.blob, g.body.userId, async (tx) => {
    await tx.delete(schema.users).where(eq(schema.users.id, g.body.userId));
    return true;
  });
  assert.equal(ok, true);
  assert.equal(walk(t.dir).length, 1, 'chỉ còn tệp của người khác');
  assert.ok(walk(t.dir)[0].includes(theirs.id));
  assert.equal((await t.db.select().from(schema.feedbackReports).where(eq(schema.feedbackReports.id, mine.id))).length, 0);

  // deleteUser thất bại (ném lỗi) => transaction hoàn tác: tệp và hàng xóa còn nguyên, không xóa tệp
  await assert.rejects(() =>
    purgeUserFeedbackBlobs(t.db, t.blob, other.body.userId, async () => {
      throw new Error('lỗi giữa chừng');
    })
  );
  assert.equal(walk(t.dir).length, 1);
  assert.equal((await t.db.select().from(schema.blobDeletions)).length, 0);
  assert.equal((await t.db.select().from(schema.feedbackReports)).length, 1);
  await t.done();
});

test('job xóa cứng tài khoản quá hạn 30 ngày (purgeExpiredAccounts) cũng xóa tệp góp ý', async () => {
  const t = await setup();
  const g = await guest(t.app);
  await t.seed(g.body.userId, { media: ['image', 'video'] });
  assert.equal(walk(t.dir).length, 2);
  // đặt hạn xóa đã qua
  await t.db.update(schema.users).set({ deleteAt: ago(1) }).where(eq(schema.users.id, g.body.userId));
  const n = await purgeExpiredAccounts(t.db, NOW, undefined, t.blob);
  assert.equal(n, 1);
  assert.deepEqual(walk(t.dir), []);
  assert.equal((await t.db.select().from(schema.feedbackReports)).length, 0);
  assert.equal((await t.db.select().from(schema.blobDeletions)).length, 0);
  await t.done();
});

test('drainBlobDeletions: khóa không còn tệp vẫn coi là xong (idempotent)', async () => {
  const t = await setup();
  await t.db.insert(schema.blobDeletions).values({ blobKey: 'feedback/abc/def.png', reason: 'test' });
  assert.equal(await drainBlobDeletions(t.db, t.blob), 1);
  assert.equal((await t.db.select().from(schema.blobDeletions)).length, 0);
  await t.done();
});

test('L1: tệp tạm .tmp cũ hơn 1 giờ bị dọn khi chạy job (đồng hồ giả), tệp mới giữ', async () => {
  const { mkdirSync, writeFileSync, utimesSync } = await import('node:fs');
  const t = await setup();
  const tmp = join(t.dir, '.tmp');
  mkdirSync(tmp, { recursive: true });
  const old = join(tmp, 'old');
  const fresh = join(tmp, 'fresh');
  writeFileSync(old, 'x');
  writeFileSync(fresh, 'y');
  utimesSync(old, new Date(NOW.getTime() - 2 * 3600_000), new Date(NOW.getTime() - 2 * 3600_000));
  utimesSync(fresh, new Date(NOW.getTime() - 10 * 60_000), new Date(NOW.getTime() - 10 * 60_000));
  await runFeedbackPurge(t.db, t.blob, NOW);
  assert.equal(existsSync(old), false);
  assert.equal(existsSync(fresh), true);
  await t.done();
});

test('L2: 501 khóa hỏng vĩnh viễn + 1 khóa tốt => khóa tốt vẫn được xử lý trong một lần chạy', async () => {
  const t = await setup();
  const goodKey = 'feedback/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png';
  await t.blob.put(goodKey, Readable.from([Buffer.alloc(5, 1)]), { contentType: 'image/png', maxBytes: 100 });
  const bad = Array.from({ length: 501 }, (_, i) => `feedback/bad/${String(i).padStart(5, '0')}.png`);
  await t.db.insert(schema.blobDeletions).values(bad.map((blobKey) => ({ blobKey, reason: 't', createdAt: ago(2) })));
  await t.db.insert(schema.blobDeletions).values({ blobKey: goodKey, reason: 't', createdAt: NOW });
  const flaky = { ...t.blob, put: t.blob.put, get: t.blob.get, totalBytes: () => t.blob.totalBytes(), delete: async (k) => { if (k.startsWith('feedback/bad/')) throw new Error('hỏng'); return t.blob.delete(k); } };
  const done = await drainBlobDeletions(t.db, flaky);
  assert.equal(done, 1);
  assert.deepEqual(walk(t.dir), []);
  const left = await t.db.select().from(schema.blobDeletions);
  assert.equal(left.length, 501);
  assert.ok(left.every((r) => r.attempts === 1));
  await t.done();
});
