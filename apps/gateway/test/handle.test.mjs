import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { schema } from '../dist/db/client.js';
import { boot, member, RUN } from './social-helpers.mjs';

/** Dự án 4 Task 3 — handle: duy nhất không phân biệt hoa thường, không trùng tên đăng nhập, đổi tối đa 1 lần/30 ngày */
let ctx;
before(async () => {
  ctx = await boot();
});
after(() => ctx.close());

const H = (s) => s + RUN; // hậu tố ngẫu nhiên khi chạy trên Postgres dùng chung
const setHandle = (u, handle) => ctx.call(u, 'PUT', '/v1/chat/handle', { handle });

test('Handle hợp lệ được chuẩn hóa về chữ thường; sai định dạng → 400', async () => {
  const u = await member(ctx, 'Lan', { handle: null });
  for (const bad of ['ab', 'a..b', '.ab', 'ab.', 'x'.repeat(25), 'có dấu', 'a b c', '']) {
    assert.equal((await setHandle(u, bad)).statusCode, 400, bad);
  }
  assert.equal((await ctx.call(u, 'PUT', '/v1/chat/handle', { handle: H('abc'), extra: 1 })).statusCode, 400);
  const ok = await setHandle(u, H('Lan.Anh_9'));
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(ok.json().handle, H('lan.anh_9'));
  assert.equal((await ctx.call(u, 'GET', '/v1/chat/settings')).json().handle, H('lan.anh_9'));
});

test('Trùng handle khác hoa thường → handle_taken (409); người đang giữ đặt lại chính nó → không sao', async () => {
  const a = await member(ctx, 'Anh', { handle: H('tuan.anh') });
  const b = await member(ctx, 'Bao', { handle: null });
  const r = await setHandle(b, H('Tuan.ANH'));
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().error, 'handle_taken');
  assert.equal((await setHandle(a, H('TUAN.anh'))).statusCode, 200, 'cùng handle của chính mình');
});

test('Trùng TÊN ĐĂNG NHẬP của người khác (và tên đang giữ chỗ) → handle_taken; tên đăng nhập của chính mình dùng được', async () => {
  const d = await ctx.db();
  const owner = await member(ctx, 'Chu', { handle: null });
  await d.insert(schema.identities).values({ userId: owner.userId, provider: 'password', subject: H('hoa.mai'), display: H('hoa.mai') });
  const other = await member(ctx, 'Khac', { handle: null });
  const r = await setHandle(other, H('Hoa.Mai'));
  assert.equal(r.json().error, 'handle_taken');

  assert.equal((await setHandle(owner, H('hoa.mai'))).statusCode, 200, 'chính chủ tên đăng nhập');

  await d.insert(schema.reservedUsernames).values({ username: H('da.xoa'), until: new Date(Date.now() + 86_400_000) });
  assert.equal((await setHandle(other, H('da.xoa'))).json().error, 'handle_taken');
});

test('Gợi ý handle = tên đăng nhập; trùng handle người khác thì không gợi ý', async () => {
  const d = await ctx.db();
  const u = await member(ctx, 'Goi', { handle: null });
  assert.equal((await ctx.call(u, 'GET', '/v1/chat/settings')).json().suggestedHandle, null, 'chưa có tên đăng nhập');
  await d.insert(schema.identities).values({ userId: u.userId, provider: 'password', subject: H('goi.y'), display: H('goi.y') });
  assert.equal((await ctx.call(u, 'GET', '/v1/chat/settings')).json().suggestedHandle, H('goi.y'));
  const thief = await member(ctx, 'Cuop', { handle: null });
  await d.update(schema.socialProfiles).set({ handle: H('goi.y') }).where(eq(schema.socialProfiles.userId, thief.userId)); // đã có handle này trước khi chủ tên đăng nhập bật chat
  assert.equal((await ctx.call(u, 'GET', '/v1/chat/settings')).json().suggestedHandle, null);
});

test('Đổi handle: lần 2 trong 30 ngày → handle_cooldown; sau 30 ngày được; đặt lại cùng handle không tính', async () => {
  const u = await member(ctx, 'Doi', { handle: H('doi.mot') });
  const r = await setHandle(u, H('doi.hai'));
  assert.equal(r.statusCode, 429);
  assert.equal(r.json().error, 'handle_cooldown');
  assert.equal((await setHandle(u, H('doi.mot'))).statusCode, 200);
  ctx.clock.now = new Date(ctx.clock.now.getTime() + 29 * 86_400_000);
  assert.equal((await setHandle(u, H('doi.hai'))).json().error, 'handle_cooldown');
  ctx.clock.now = new Date(ctx.clock.now.getTime() + 2 * 86_400_000);
  assert.equal((await setHandle(u, H('doi.hai'))).statusCode, 200);
  // handle cũ được giải phóng cho người khác
  const v = await member(ctx, 'Nhan', { handle: null });
  assert.equal((await setHandle(v, H('doi.mot'))).statusCode, 200);
  ctx.clock.now = new Date('2026-11-26T08:00:00Z');
});

test('Điều kiện đặt handle: cần tên hiển thị, không phải khách, không phải người dưới 18', async () => {
  const noName = await member(ctx, 'Khongten', { display: false, handle: null });
  const r1 = await setHandle(noName, H('khong.ten'));
  assert.equal(r1.statusCode, 409);
  assert.equal(r1.json().error, 'display_name_required');

  const g = await member(ctx, 'Khach', { guest: true, age: false });
  assert.equal((await setHandle(g, H('khach.vang'))).statusCode, 403);

  const minor = await member(ctx, 'Nho', { birthYear: ctx.clock.now.getUTCFullYear() - 12, handle: null });
  const r2 = await setHandle(minor, H('be.nho'));
  assert.equal(r2.statusCode, 403);
  assert.equal(r2.json().error, 'adult_required');
  assert.equal((await ctx.app.inject({ method: 'PUT', url: '/v1/chat/handle', payload: { handle: 'abc' } })).statusCode, 401);
});

test('Hai người cùng đặt một handle đồng thời: đúng một người được', async () => {
  const a = await member(ctx, 'Dua1', { handle: null });
  const b = await member(ctx, 'Dua2', { handle: null });
  const rs = await Promise.all([setHandle(a, H('dua.nhau')), setHandle(b, H('dua.nhau'))]);
  assert.deepEqual(rs.map((r) => r.statusCode).sort(), [200, 409]);
});

test('Cài đặt riêng tư: đọc mặc định, đổi từng phần, trường lạ → 400, chưa có tên → 409', async () => {
  const u = await member(ctx, 'Rieng');
  const g = await ctx.call(u, 'GET', '/v1/chat/settings');
  assert.deepEqual(g.json().settings, { discoverable: true, showOnline: true, showReadReceipts: true, showPushPreview: false });
  const r = await ctx.call(u, 'PUT', '/v1/chat/settings', { discoverable: false, showPushPreview: true });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json(), { discoverable: false, showOnline: true, showReadReceipts: true, showPushPreview: true });
  assert.equal((await ctx.call(u, 'PUT', '/v1/chat/settings', { discoverable: 'x' })).statusCode, 400);
  assert.equal((await ctx.call(u, 'PUT', '/v1/chat/settings', { hack: true })).statusCode, 400);
  const [row] = await (await ctx.db()).select().from(schema.socialProfiles).where(eq(schema.socialProfiles.userId, u.userId));
  assert.equal(row.discoverable, false);

  const noName = await member(ctx, 'Khongten2', { display: false, handle: null });
  assert.equal((await ctx.call(noName, 'PUT', '/v1/chat/settings', { showOnline: false })).statusCode, 409);
  assert.equal((await ctx.call(noName, 'GET', '/v1/chat/settings')).statusCode, 200);
});
