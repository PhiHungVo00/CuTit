import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { schema } from '../dist/db/client.js';
import { chatEligibility, clearChatEligibilityCache, invalidateChatEligibility } from '../dist/services/social/eligibility.js';
import { mergeGuestInto } from '../dist/services/auth/merge.js';
import { sha256 } from '../dist/services/auth/tokens.js';
import { boot, member } from './social-helpers.mjs';

/** Dự án 4 Task 3 — chatEligibility: CỬA DUY NHẤT cho chat/gọi/nhóm/lời mời bằng handle */
let ctx;
before(async () => {
  ctx = await boot();
});
after(() => ctx.close());

const elig = async (u) => chatEligibility(await ctx.db(), u.userId, new Date(ctx.clock.now));
const fresh = () => clearChatEligibilityCache();
const { users, chatRestrictions } = schema;

test('Mỗi lý do chưa đủ điều kiện, theo đúng thứ tự', async () => {
  const guest = await member(ctx, 'Khach', { guest: true, age: false });
  assert.deepEqual(await elig(guest), { ok: false, reason: 'guest' });

  const unknown = await member(ctx, 'Chua', { age: false, handle: null });
  assert.deepEqual(await elig(unknown), { ok: false, reason: 'age_unknown' });

  const minor = await member(ctx, 'Nho', { birthYear: ctx.clock.now.getUTCFullYear() - 10, handle: null });
  assert.deepEqual(await elig(minor), { ok: false, reason: 'minor' });

  const noHandle = await member(ctx, 'Khong', { handle: null });
  assert.deepEqual(await elig(noHandle), { ok: false, reason: 'no_handle' });

  const ok = await member(ctx, 'Lan');
  assert.deepEqual(await elig(ok), { ok: true });

  const gone = await member(ctx, 'Xoa');
  await (await ctx.db()).update(users).set({ deleteAt: new Date('2026-12-20T00:00:00Z') }).where(eq(users.id, gone.userId));
  fresh();
  assert.deepEqual(await elig(gone), { ok: false, reason: 'pending_deletion' });
  assert.deepEqual(await chatEligibility(await ctx.db(), '00000000-0000-4000-8000-000000000000'), { ok: false, reason: 'pending_deletion' });
});

test('Khóa chat: còn hiệu lực → restricted; hết hạn, đã gỡ → ok; vĩnh viễn (until NULL) → restricted', async () => {
  const d = await ctx.db();
  const u = await member(ctx, 'Bi');
  const lock = async (v) => {
    const [r] = await d.insert(chatRestrictions).values({ userId: u.userId, reason: 'test', ...v }).returning({ id: chatRestrictions.id });
    fresh();
    return r.id;
  };
  const id1 = await lock({ until: new Date('2026-11-30T00:00:00Z') });
  assert.deepEqual(await elig(u), { ok: false, reason: 'restricted' });
  ctx.clock.now = new Date('2026-12-01T00:00:00Z'); // qua hạn
  assert.deepEqual(await elig(u), { ok: true });
  ctx.clock.now = new Date('2026-11-26T08:00:00Z');

  fresh();
  const id2 = await lock({ until: null });
  assert.equal((await elig(u)).reason, 'restricted');
  await d.update(chatRestrictions).set({ liftedAt: new Date() }).where(eq(chatRestrictions.id, id2));
  await d.update(chatRestrictions).set({ liftedAt: new Date() }).where(eq(chatRestrictions.id, id1));
  fresh();
  assert.deepEqual(await elig(u), { ok: true });
});

test('Cache 60 giây: đổi DB không thấy ngay; invalidate hoặc hết 60 giây thì thấy', async () => {
  const d = await ctx.db();
  const u = await member(ctx, 'Cache');
  assert.equal((await elig(u)).ok, true);
  await d.insert(chatRestrictions).values({ userId: u.userId, reason: 'x' });
  assert.equal((await elig(u)).ok, true, 'còn trong cache');
  invalidateChatEligibility(u.userId);
  assert.equal((await elig(u)).reason, 'restricted');

  const v = await member(ctx, 'Cache2');
  assert.equal((await elig(v)).ok, true);
  await d.insert(chatRestrictions).values({ userId: v.userId, reason: 'x' });
  ctx.clock.now = new Date(ctx.clock.now.getTime() + 61_000);
  assert.equal((await elig(v)).reason, 'restricted', 'quá 60 giây thì đọc lại DB');
  ctx.clock.now = new Date('2026-11-26T08:00:00Z');
});

test('Khai tuổi / đặt handle có hiệu lực NGAY (tự invalidate), không chờ hết cache', async () => {
  const u = await member(ctx, 'Moi', { age: false, handle: null });
  assert.equal((await elig(u)).reason, 'age_unknown');
  await ctx.call(u, 'PUT', '/v1/me/age', { birthYear: 1990 });
  assert.equal((await elig(u)).reason, 'no_handle');
  await ctx.call(u, 'PUT', '/v1/chat/handle', { handle: 'moi.nguoi' });
  assert.equal((await elig(u)).ok, true);
});

test('GET /v1/chat/settings báo vì sao chưa chat được; chỉ thấy của chính mình', async () => {
  const u = await member(ctx, 'Gioi', { age: false, handle: null });
  const r = await ctx.call(u, 'GET', '/v1/chat/settings');
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().ineligible, 'age_unknown');
  assert.equal(r.json().handle, null);
  assert.equal(r.json().settings.showPushPreview, false);
  assert.equal((await ctx.app.inject({ method: 'GET', url: '/v1/chat/settings' })).statusCode, 401);
});

test('Gộp khách is_adult=false vào tài khoản đích true: đích GIỮ true', async () => {
  const d = await ctx.db();
  const target = await member(ctx, 'Dich');
  const g = await member(ctx, 'KhachNho', { guest: true, birthYear: ctx.clock.now.getUTCFullYear() - 10 });
  const [gu] = await d.select().from(users).where(eq(users.id, g.userId));
  assert.equal(gu.isAdult, false);
  const t = randomBytes(32).toString('base64url');
  await d.insert(schema.authChallenges).values({ kind: 'merge_ticket', keyHash: sha256(t), userId: g.userId, subject: target.userId, expiresAt: new Date(Date.now() + 600_000) });
  await mergeGuestInto(d, g.userId, t, 'merge', new Date());
  const [tu] = await d.select().from(users).where(eq(users.id, target.userId));
  assert.equal(tu.isAdult, true);
  fresh();
  assert.deepEqual(await elig(target), { ok: true });
});
