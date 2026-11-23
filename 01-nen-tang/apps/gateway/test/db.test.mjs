import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDbProvider, schema } from '../dist/db/client.js';

test('DB: PGlite memory chạy migration; xóa user thì mọi dữ liệu con bị xóa theo (cascade)', async () => {
  const provider = createDbProvider({ PGLITE_DIR: 'memory://' });
  try {
    const db = await provider.get();
    assert.equal(await provider.get(), db, 'mở một lần, dùng lại');
    const [u] = await db.insert(schema.users).values({}).returning();
    assert.equal(u.isGuest, true);
    assert.equal(u.email, null);
    assert.equal(u.accountType, 'adult');
    await db.insert(schema.srsCards).values({ userId: u.id, itemRef: 'dialect:d1', front: 'ngô', back: 'bắp', source: 'dialect', dueAt: new Date() });
    await db.insert(schema.xpEvents).values({ userId: u.id, clientEventId: randomUUID(), source: 'lesson', amount: 10, day: '2026-11-17' });
    await db.insert(schema.dailyActivity).values({ userId: u.id, day: '2026-11-17', seconds: 60 });
    await db.insert(schema.preferences).values({ userId: u.id, speed: 1.25 });
    const [p] = await db.select().from(schema.preferences).where(eq(schema.preferences.userId, u.id));
    assert.equal(p.speed, 1.25, 'speed là số thực');

    await db.delete(schema.users).where(eq(schema.users.id, u.id));
    for (const t of [schema.srsCards, schema.xpEvents, schema.dailyActivity, schema.preferences]) {
      assert.equal((await db.select().from(t)).length, 0);
    }
  } finally {
    await provider.close();
  }
});
