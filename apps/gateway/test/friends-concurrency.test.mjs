import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDbProvider } from '../dist/db/client.js';
import { makeApp, guest } from './helpers.mjs';

/**
 * Việc sót GĐ4c — giới hạn 5 bạn khi nhập mã ĐỒNG THỜI. Chạy trên PGlite (mặc định) và trên Postgres thật khi đặt
 * TEST_DATABASE_URL (Postgres có nhiều kết nối song song => không khóa hàng là vượt giới hạn).
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/postgres pnpm --filter @vietlearning/gateway test
 */
const PG = process.env.TEST_DATABASE_URL;
const dbp = createDbProvider(PG ? { DATABASE_URL: PG, PGLITE_DIR: 'memory://' } : { PGLITE_DIR: 'memory://' });
let a;
before(async () => {
  a = await makeApp(
    { AUTH_RATE_LIMIT_PER_MINUTE: '10000', RATE_LIMIT_PER_MINUTE: '10000', FRIEND_INVITE_RATE_LIMIT_PER_MINUTE: '10000' },
    { db: dbp }
  );
});
after(async () => {
  await a.close();
  await dbp.close();
});

const TODAY = '2026-11-18';
const call = (headers, method, url, payload) => a.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) });
const invite = (u) => call(u.headers, 'POST', '/v1/friends/invite');
const accept = (u, code) => call(u.headers, 'POST', '/v1/friends/accept', { code });
const list = async (u) => (await call(u.headers, 'GET', `/v1/friends?today=${TODAY}`)).json().friends;
const count = async (u) => (await list(u)).length;
/** Dự án 4: 5 là trần của NHIỆM VỤ TUẦN (quest_active), không còn chặn việc kết bạn */
const activeCount = async (u) => (await list(u)).filter((f) => f.questActive).length;

async function person(name) {
  const g = await guest(a);
  const u = { headers: g.headers };
  assert.equal((await call(u.headers, 'PUT', '/v1/friends/profile', { displayName: name })).statusCode, 200);
  return u;
}
async function befriend(x, y) {
  const r = await accept(y, (await invite(x)).json().code);
  assert.equal(r.statusCode, 200, r.body);
}

test(`[${PG ? 'Postgres' : 'PGlite'}] Người có 4 bạn nhập 6 mã cùng lúc: cả 6 thành bạn, nhưng chỉ đúng 1 cặp mới được nhiệm vụ tuần (trần 5)`, async () => {
  const lan = await person('Lan');
  for (let i = 0; i < 4; i++) await befriend(await person(`Cũ ${i}`), lan);
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await invite(await person(`Mới ${i}`))).json().code);
  const res = await Promise.all(codes.map((c) => accept(lan, c)));
  assert.ok(res.every((r) => r.statusCode === 200), res.map((r) => r.statusCode).join(','));
  assert.equal(await count(lan), 10);
  assert.equal(await activeCount(lan), 5, 'đúng 5 nhiệm vụ tuần dù đua nhau');
});

test(`[${PG ? 'Postgres' : 'PGlite'}] Phía người mời: người có 4 bạn vừa được nhập mã vừa tự nhập mã người khác cùng lúc => vẫn tối đa 5 nhiệm vụ`, async () => {
  const lan = await person('Lan');
  for (let i = 0; i < 4; i++) await befriend(await person(`Cũ ${i}`), lan);
  const others = await Promise.all([0, 1, 2, 3].map((i) => person(`Khác ${i}`)));
  const lanCode = (await invite(lan)).json().code;
  const theirCodes = await Promise.all(others.slice(1).map(async (o) => (await invite(o)).json().code));
  const res = await Promise.all([accept(others[0], lanCode), ...theirCodes.map((c) => accept(lan, c))]);
  assert.ok(res.every((r) => r.statusCode === 200), res.map((r) => r.statusCode).join(','));
  assert.equal(await count(lan), 8);
  assert.equal(await activeCount(lan), 5);
});

test(`[${PG ? 'Postgres' : 'PGlite'}] Khóa không gây deadlock: nhiều cặp kết bạn chéo nhau cùng lúc đều xong`, async () => {
  const ps = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => person(`P${i}`)));
  // mỗi người mời người kế tiếp và nhập mã của người trước => khóa hai hàng user theo vòng
  const codes = await Promise.all(ps.map(async (p) => (await invite(p)).json().code));
  const res = await Promise.all(ps.map((p, i) => accept(p, codes[(i + ps.length - 1) % ps.length])));
  assert.ok(res.every((r) => r.statusCode === 200), res.map((r) => `${r.statusCode}:${r.body}`).join(' | '));
});
