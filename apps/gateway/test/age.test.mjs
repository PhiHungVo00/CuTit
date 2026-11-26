import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { eq, sql } from 'drizzle-orm';
import { schema } from '../dist/db/client.js';
import { declareAge } from '../dist/services/social/age.js';
import { boot, member } from './social-helpers.mjs';

/** Dự án 4 Task 3 — khai tuổi: luật 18 năm, khóa 12 tháng, KHÔNG lưu/ghi năm sinh ở bất kỳ đâu */
const logs = [];
const sink = new Writable({
  write(chunk, _enc, cb) {
    logs.push(chunk.toString());
    cb();
  }
});
let ctx;
let Y; // năm của đồng hồ giả
before(async () => {
  ctx = await boot({}, { logger: { level: 'trace', stream: sink } });
  Y = ctx.clock.now.getUTCFullYear();
});
after(() => ctx.close());

const declare = (u, birthYear) => ctx.call(u, 'PUT', '/v1/me/age', { birthYear });
const flag = async (u) => {
  const [r] = await (await ctx.db()).select({ a: schema.users.isAdult, at: schema.users.ageDeclaredAt }).from(schema.users).where(eq(schema.users.id, u.userId));
  return r;
};
const fresh = (name) => member(ctx, name, { age: false, handle: null });

test('Luật đủ 18: năm−26 → true; năm−17 → false và khóa 12 tháng; năm−18 → true (đúng 18 năm trước)', async () => {
  const a = await fresh('Lan');
  const r1 = await declare(a, Y - 26);
  assert.equal(r1.statusCode, 200, r1.body);
  assert.deepEqual(r1.json(), { isAdult: true, lockedUntil: null });
  assert.equal((await flag(a)).a, true);

  const b = await fresh('Tom');
  const r2 = await declare(b, Y - 17);
  assert.equal(r2.statusCode, 200);
  assert.equal(r2.json().isAdult, false);
  assert.equal(r2.json().lockedUntil, '2027-11-26T08:00:00.000Z');
  assert.equal((await flag(b)).a, false);

  const c = await fresh('Mai');
  assert.equal((await declare(c, Y - 18)).json().isAdult, true);
  const d = await fresh('Hoa');
  assert.equal((await declare(d, 1900)).json().isAdult, true);
});

test('Đã khai chưa đủ: khai lại ngay → age_locked; sau 12 tháng + 1 ngày khai lại được; đã đủ 18 thì không đổi ngược', async () => {
  const u = await fresh('Nam');
  assert.equal((await declare(u, Y - 17)).json().isAdult, false);
  const locked = await declare(u, Y - 30);
  assert.equal(locked.statusCode, 403);
  assert.equal(locked.json().error, 'age_locked');
  assert.equal((await flag(u)).a, false, 'khai trong thời gian khóa không đổi gì');

  ctx.clock.now = new Date('2027-11-26T07:59:00Z'); // chưa đủ 12 tháng
  assert.equal((await declare(u, Y - 30)).json().error, 'age_locked');
  ctx.clock.now = new Date('2027-11-27T08:00:00Z'); // 12 tháng + 1 ngày
  const again = await declare(u, 1990);
  assert.equal(again.statusCode, 200);
  assert.equal(again.json().isAdult, true);

  // đã true: khai kiểu "chưa đủ" cũng không đổi ngược
  const back = await declare(u, new Date().getUTCFullYear());
  assert.equal(back.statusCode, 200);
  assert.deepEqual(back.json(), { isAdult: true, lockedUntil: null });
  assert.equal((await flag(u)).a, true);
  ctx.clock.now = new Date('2026-11-26T08:00:00Z');
});

test('Khai chưa đủ lần hai (sau hạn) khóa lại 12 tháng từ lần mới', async () => {
  const u = await fresh('Kiên');
  await declare(u, Y - 10);
  ctx.clock.now = new Date('2027-12-01T00:00:00Z');
  const r = await declare(u, 2020);
  assert.equal(r.json().isAdult, false);
  assert.equal(r.json().lockedUntil, '2028-12-01T00:00:00.000Z');
  ctx.clock.now = new Date('2026-11-26T08:00:00Z');
});

test('Đầu vào xấu: 1899, năm tương lai, chuỗi, thiếu, trường lạ → 400 và thân lỗi KHÔNG phản chiếu giá trị', async () => {
  const u = await fresh('Vân');
  for (const body of [{ birthYear: 1899 }, { birthYear: Y + 1 }, { birthYear: '1985' }, { birthYear: 1985.5 }, {}, { birthYear: 1985, extra: 1 }, { birthYear: null }]) {
    const r = await ctx.call(u, 'PUT', '/v1/me/age', body);
    assert.equal(r.statusCode, 400, JSON.stringify(body));
    assert.doesNotMatch(r.body, /1899|1985|2027/);
  }
  assert.equal((await flag(u)).a, null, 'không đổi cờ');
  assert.equal((await ctx.app.inject({ method: 'PUT', url: '/v1/me/age', payload: { birthYear: 1990 } })).statusCode, 401);
});

test('Quét DB, audit_events và log: năm sinh đã khai không xuất hiện ở bất kỳ đâu', async () => {
  const u = await fresh('Quang');
  logs.length = 0;
  const r = await declare(u, 1963);
  assert.equal(r.statusCode, 200);
  // lỗi 400 cũng không được log giá trị
  await declare(u, 1899);
  await ctx.app.audit.flush();

  const d = await ctx.db();
  const re = '(^|[^0-9a-f-])1963([^0-9a-f-]|$)'; // không khớp nhầm vào đoạn uuid/băm hex (kể cả '-1963-' giữa uuid)
  const rowsOf = (r) => (Array.isArray(r) ? r : r.rows); // postgres-js trả mảng, PGlite trả { rows }
  const tables = rowsOf(await d.execute(sql`select table_name from information_schema.tables where table_schema = 'public'`)).map((x) => x.table_name);
  assert.ok(tables.includes('audit_events') && tables.includes('users'));
  for (const t of tables) {
    const hit = await d.execute(sql.raw(`select count(*)::int as n from "${t}" x where x::text ~ '${re}'`));
    assert.equal(rowsOf(hit)[0].n, 0, `bảng ${t} chứa năm sinh`);
  }
  const events = await d.select().from(schema.auditEvents).where(eq(schema.auditEvents.userId, u.userId));
  const ages = events.filter((e) => e.type === 'age.declared');
  assert.equal(ages.length, 1);
  assert.deepEqual(ages[0].metadata, {});
  assert.equal(ages[0].outcome, 'success');
});

test('declareAge trực tiếp: người dùng không tồn tại → 404', async () => {
  await assert.rejects(declareAge(await ctx.db(), '00000000-0000-4000-8000-000000000000', 1990), (e) => e.statusCode === 404);
});

test('Log Fastify không chứa năm sinh (logger bật mức trace)', async () => {
  assert.ok(logs.length > 0, 'logger có ghi (kiểm chứng test không rỗng)');
  const joined = logs.join('\n');
  assert.doesNotMatch(joined, /(^|[^0-9a-f-])1963([^0-9a-f-]|$)/);
  assert.doesNotMatch(joined, /birthYear/);
});
