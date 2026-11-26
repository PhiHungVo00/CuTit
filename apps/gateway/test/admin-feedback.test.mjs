import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { schema } from '../dist/db/client.js';
import { loadConfig } from '../dist/config.js';
import { createBlobStore } from '../dist/services/blob/index.js';
import { createBlobUrlSigner } from '../dist/services/admin/signedUrl.js';
import { ADMIN_ENV, bearer, enrollFully, makeAdminApp, makeStaff, registerUser } from './admin-helpers.mjs';

/**
 * Dự án 5a Task 5: API hàng chờ góp ý cho quản trị (/admin/v1/queue, /feedback/:id, /status, /files/:fileId/url, /blob, /audit).
 * Mặc định PGlite (mỗi test một DB trong bộ nhớ).
 */
const BLOB_SECRET = 'test-blob-url-secret-0123456789-abcdefghij';
const CTX = { appVersion: '1.0.0', build: 'abc', platform: 'web', osVersion: 'Chrome 130', locale: 'vi', route: '/hoc', recentRoutes: ['/', '/hoc'] };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(Array.from({ length: 392 }, (_, i) => i % 251))]);
const UUID = '00000000-0000-4000-8000-000000000000';

async function setup(env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'afb-'));
  const ctx = await makeAdminApp({ BLOB_DIR: dir, ADMIN_BLOB_URL_SECRET: BLOB_SECRET, ...env });
  const staff = await makeStaff(ctx);
  const session = await enrollFully(ctx, staff.username);
  const h = bearer(session.accessToken);
  const db = await ctx.db();
  const blob = createBlobStore(loadConfig({ NODE_ENV: 'test', BLOB_DIR: dir }));
  const owner = await registerUser(ctx, 'nguoi.gop.y');
  let n = 0;
  const api = {
    ctx,
    db,
    h,
    staff,
    owner,
    blob,
    get: (url, headers = h) => ctx.app.inject({ method: 'GET', url, headers }),
    post: (url, payload, headers = h) => ctx.app.inject({ method: 'POST', url, payload, headers }),
    /** Chèn góp ý trực tiếp (createdAt do test chọn) */
    async seed(o = {}) {
      const createdAt = o.createdAt ?? new Date(ctx.state.now - 1000 * (1000 - n++));
      const status = o.status ?? 'received';
      const [row] = await db
        .insert(schema.feedbackReports)
        .values({
          id: o.id,
          userId: o.userId ?? owner.userId,
          kind: o.kind ?? 'bug',
          body: o.body ?? 'Nút gửi bị đơ khi bấm hai lần liên tiếp',
          context: CTX,
          status,
          doneAt: status === 'done' ? createdAt : null,
          createdAt,
          updatedAt: createdAt
        })
        .returning();
      return row;
    },
    /** Ghi tệp thật vào kho + dòng feedback_files */
    async seedFile(feedbackId, o = {}) {
      const key = `feedback/${feedbackId}/${crypto.randomUUID()}.png`;
      await blob.put(key, Readable.from([o.data ?? PNG]), { contentType: 'image/png', maxBytes: 5 * 2 ** 20 });
      const [f] = await db
        .insert(schema.feedbackFiles)
        .values({ feedbackId, blobKey: key, media: 'image', contentType: 'image/png', bytes: (o.data ?? PNG).length, purgedAt: o.purged ? new Date(ctx.state.now) : null })
        .returning();
      return f;
    },
    audits: () => db.select().from(schema.adminAuditLog),
    async close() {
      await ctx.close();
      rmSync(dir, { recursive: true, force: true });
    }
  };
  return api;
}

const pathOf = (url) => {
  const u = new URL(url, 'http://x');
  return u.pathname + u.search;
};

test('mọi route quản trị cần Bearer quản trị: không token / token app => 401', async () => {
  const t = await setup();
  const r = await t.seed();
  const urls = [
    ['GET', '/admin/v1/queue'],
    ['GET', `/admin/v1/feedback/${r.id}`],
    ['POST', `/admin/v1/feedback/${r.id}/status`],
    ['GET', `/admin/v1/feedback/${r.id}/files/${UUID}/url`],
    ['GET', '/admin/v1/audit']
  ];
  for (const [method, url] of urls) {
    const none = await t.ctx.app.inject({ method, url, payload: method === 'POST' ? { status: 'done' } : undefined });
    assert.equal(none.statusCode, 401, `${method} ${url} không token`);
    const app = await t.ctx.app.inject({ method, url, headers: bearer(t.owner.appAccessToken), payload: method === 'POST' ? { status: 'done' } : undefined });
    assert.equal(app.statusCode, 401, `${method} ${url} token app`);
  }
  await t.close();
});

test('người có tài khoản nhưng KHÔNG có vai trò quản trị => không vào được hàng chờ', async () => {
  const t = await setup();
  // token quản trị của người đã bị thu quyền: 403 ngay (đọc DB mỗi lần)
  await t.db.delete(schema.staffRoles);
  const res = await t.get('/admin/v1/queue');
  assert.equal(res.statusCode, 403);
  await t.close();
});

test('hàng chờ: mới nhất lên đầu, đúng hình dạng contract, đếm số chưa xong', async () => {
  const t = await setup();
  const a = await t.seed({ body: 'Góp ý cũ nhất của tôi nè' });
  const b = await t.seed({ status: 'done', kind: 'idea', body: 'Ý tưởng đã xong rồi nhé' });
  const c = await t.seed({ body: 'x'.repeat(300) });
  await t.seedFile(c.id);
  await t.seedFile(c.id);
  const res = await t.get('/admin/v1/queue');
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json();
  assert.deepEqual(body.items.map((i) => i.id), [c.id, b.id, a.id]);
  assert.equal(body.nextCursor, null);
  assert.equal(body.pendingCount, 2);
  assert.equal(body.items[0].type, 'feedback');
  assert.equal(body.items[0].excerpt.length, 120);
  assert.equal(body.items[0].fileCount, 2);
  assert.equal(body.items[0].appVersion, '1.0.0');
  assert.equal(body.items[0].route, '/hoc');
  assert.equal(body.items[0].accountPendingDeletion, false);
  assert.ok(!('userId' in body.items[0]) && !('body' in body.items[0]), 'hàng chờ không lộ userId/toàn văn');
  assert.equal(res.headers['cache-control'], 'no-store');
  await t.close();
});

test('hàng chờ: lọc theo status và kind; tham số lạ => 400', async () => {
  const t = await setup();
  const r1 = await t.seed({ kind: 'bug', status: 'received' });
  const r2 = await t.seed({ kind: 'idea', status: 'in_progress' });
  const r3 = await t.seed({ kind: 'bug', status: 'done' });
  const ids = async (qs) => (await t.get(`/admin/v1/queue?${qs}`)).json().items.map((i) => i.id);
  assert.deepEqual(await ids('status=received'), [r1.id]);
  assert.deepEqual(await ids('status=done'), [r3.id]);
  assert.deepEqual(await ids('kind=idea'), [r2.id]);
  assert.deepEqual(await ids('kind=bug'), [r3.id, r1.id]);
  assert.deepEqual(await ids('kind=bug&status=received'), [r1.id]);
  assert.equal((await t.get('/admin/v1/queue?status=bogus')).statusCode, 400);
  assert.equal((await t.get('/admin/v1/queue?type=chat_report')).statusCode, 400);
  assert.equal((await t.get('/admin/v1/queue?limit=0')).statusCode, 400);
  assert.equal((await t.get('/admin/v1/queue?cursor=khong-phai-con-tro')).statusCode, 400);
  await t.close();
});

test('con trỏ: không lặp, không mất dòng khi có góp ý MỚI chen vào giữa các trang (cả khi trùng createdAt)', async () => {
  const t = await setup();
  const base = Date.now();
  const seeded = [];
  // 7 dòng; 3 dòng cuối trùng đúng một mốc thời gian (hoà bằng id)
  for (let i = 0; i < 4; i++) seeded.push((await t.seed({ createdAt: new Date(base - i * 60_000) })).id);
  for (let i = 0; i < 3; i++) seeded.push((await t.seed({ createdAt: new Date(base - 10 * 60_000) })).id);
  const page1 = (await t.get('/admin/v1/queue?limit=3')).json();
  assert.equal(page1.items.length, 3);
  assert.ok(page1.nextCursor);
  // góp ý mới (mới hơn mọi dòng) chen vào TRƯỚC khi lấy trang 2
  const fresh = await t.seed({ createdAt: new Date(base + 60_000) });
  const seen = page1.items.map((i) => i.id);
  let cursor = page1.nextCursor;
  let guard = 0;
  while (cursor && guard++ < 10) {
    const p = (await t.get(`/admin/v1/queue?limit=3&cursor=${encodeURIComponent(cursor)}`)).json();
    seen.push(...p.items.map((i) => i.id));
    cursor = p.nextCursor;
  }
  assert.equal(new Set(seen).size, seen.length, 'không lặp dòng');
  assert.deepEqual([...seen].sort(), [...seeded].sort(), 'không mất dòng, và dòng chen vào không nhảy vào các trang sau');
  assert.ok(!seen.includes(fresh.id));
  // lấy lại từ đầu thì thấy dòng mới ở đầu
  assert.equal((await t.get('/admin/v1/queue')).json().items[0].id, fresh.id);
  await t.close();
});

test('accountPendingDeletion: true khi chủ góp ý đã bấm xóa tài khoản (delete_at)', async () => {
  const t = await setup();
  const other = await registerUser(t.ctx, 'nguoi.xoa');
  const keep = await t.seed();
  const gone = await t.seed({ userId: other.userId });
  await t.db.update(schema.users).set({ deleteAt: new Date(t.ctx.state.now + 30 * 86_400_000) }).where(eq(schema.users.id, other.userId));
  const items = (await t.get('/admin/v1/queue')).json().items;
  assert.equal(items.find((i) => i.id === gone.id).accountPendingDeletion, true);
  assert.equal(items.find((i) => i.id === keep.id).accountPendingDeletion, false);
  const detail = (await t.get(`/admin/v1/feedback/${gone.id}`)).json();
  assert.equal(detail.accountPendingDeletion, true);
  await t.close();
});

test('chi tiết: ngữ cảnh, userIdShort (không userId đầy đủ/email), tệp có id, sự kiện; id lạ => 404, id sai dạng => 400', async () => {
  const t = await setup();
  const r = await t.seed({ body: 'Màn hình luyện nói bị treo khi mở micro' });
  const f = await t.seedFile(r.id);
  await t.db.insert(schema.feedbackEvents).values({ feedbackId: r.id, status: 'in_progress', message: 'Đang xem nhé' });
  const res = await t.get(`/admin/v1/feedback/${r.id}`);
  assert.equal(res.statusCode, 200, res.body);
  const d = res.json();
  assert.equal(d.id, r.id);
  assert.equal(d.body, 'Màn hình luyện nói bị treo khi mở micro');
  assert.deepEqual(d.context, CTX);
  assert.equal(d.userIdShort, t.owner.userId.slice(0, 8));
  assert.equal(d.files.length, 1);
  assert.deepEqual(d.files[0], { id: f.id, media: 'image', contentType: 'image/png', bytes: PNG.length, durationMs: null, purged: false });
  assert.equal(d.events.length, 1);
  assert.equal(d.doneAt, null);
  assert.ok(!res.body.includes(t.owner.userId), 'không lộ userId đầy đủ');
  assert.ok(!res.body.includes(f.blobKey), 'không lộ khóa tệp');
  assert.equal((await t.get(`/admin/v1/feedback/${UUID}`)).statusCode, 404);
  assert.equal((await t.get('/admin/v1/feedback/khong-phai-uuid')).statusCode, 400);
  await t.close();
});

test('đổi sang done: đặt done_at, thêm feedback_events, user_unread=true, một dòng nhật ký feedback.status cùng transaction', async () => {
  const t = await setup();
  const r = await t.seed();
  const res = await t.post(`/admin/v1/feedback/${r.id}/status`, { status: 'done', message: 'Đã sửa ở bản 1.0.1, cảm ơn bạn!' });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().status, 'done');
  const [row] = await t.db.select().from(schema.feedbackReports).where(eq(schema.feedbackReports.id, r.id));
  assert.equal(row.status, 'done');
  assert.equal(row.userUnread, true);
  assert.ok(row.doneAt instanceof Date && row.doneAt.getTime() === t.ctx.state.now);
  const events = await t.db.select().from(schema.feedbackEvents).where(eq(schema.feedbackEvents.feedbackId, r.id));
  assert.equal(events.length, 1);
  assert.equal(events[0].status, 'done');
  assert.equal(events[0].message, 'Đã sửa ở bản 1.0.1, cảm ơn bạn!');
  assert.equal(events[0].actorUserId, t.staff.userId);
  const logs = (await t.audits()).filter((a) => a.action === 'feedback.status');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].actorUserId, t.staff.userId);
  assert.equal(logs[0].actorKind, 'user');
  assert.equal(logs[0].targetType, 'feedback');
  assert.equal(logs[0].targetId, r.id);
  assert.deepEqual({ from: logs[0].meta.from, to: logs[0].meta.to }, { from: 'received', to: 'done' });
  assert.ok(!JSON.stringify(logs[0].meta).includes('cảm ơn'), 'lời nhắn không đi vào nhật ký');
  // người dùng thấy chấm đỏ + lời nhắn qua API của app
  const unread = await t.get('/v1/feedback/mine/unread-count', bearer(t.owner.appAccessToken));
  assert.equal(unread.json().count, 1);
  const mine = (await t.get('/v1/feedback/mine', bearer(t.owner.appAccessToken))).json().items[0];
  assert.equal(mine.status, 'done');
  assert.equal(mine.events[0].message, 'Đã sửa ở bản 1.0.1, cảm ơn bạn!');
  await t.close();
});

test('mở lại (done → in_progress) xóa done_at; chỉ lời nhắn không đổi trạng thái; không gì đổi thì không ghi gì', async () => {
  const t = await setup();
  const r = await t.seed({ status: 'done' });
  const reopen = await t.post(`/admin/v1/feedback/${r.id}/status`, { status: 'in_progress' });
  assert.equal(reopen.statusCode, 200, reopen.body);
  let [row] = await t.db.select().from(schema.feedbackReports).where(eq(schema.feedbackReports.id, r.id));
  assert.equal(row.status, 'in_progress');
  assert.equal(row.doneAt, null);
  // lời nhắn thôi (cùng trạng thái): có sự kiện (status null), có chấm đỏ
  await t.db.update(schema.feedbackReports).set({ userUnread: false }).where(eq(schema.feedbackReports.id, r.id));
  const msg = await t.post(`/admin/v1/feedback/${r.id}/status`, { status: 'in_progress', message: 'Bạn thử lại giúp mình nhé' });
  assert.equal(msg.statusCode, 200);
  [row] = await t.db.select().from(schema.feedbackReports).where(eq(schema.feedbackReports.id, r.id));
  assert.equal(row.userUnread, true);
  const events = await t.db.select().from(schema.feedbackEvents).where(eq(schema.feedbackEvents.feedbackId, r.id));
  assert.equal(events.length, 2);
  assert.ok(events.some((e) => e.status === null && e.message === 'Bạn thử lại giúp mình nhé'));
  // không đổi gì: 200, không thêm sự kiện/nhật ký
  const auditBefore = (await t.audits()).length;
  const noop = await t.post(`/admin/v1/feedback/${r.id}/status`, { status: 'in_progress' });
  assert.equal(noop.statusCode, 200);
  assert.equal((await t.db.select().from(schema.feedbackEvents).where(eq(schema.feedbackEvents.feedbackId, r.id))).length, 2);
  assert.equal((await t.audits()).length, auditBefore);
  await t.close();
});

test('lời nhắn: 1000 ký tự được, 1001 => 400 và KHÔNG đổi gì; thân sai => 400; id lạ => 404 không để lại nhật ký', async () => {
  const t = await setup();
  const r = await t.seed();
  const bad = await t.post(`/admin/v1/feedback/${r.id}/status`, { status: 'done', message: 'a'.repeat(1001) });
  assert.equal(bad.statusCode, 400);
  const [row] = await t.db.select().from(schema.feedbackReports).where(eq(schema.feedbackReports.id, r.id));
  assert.equal(row.status, 'received');
  assert.equal((await t.db.select().from(schema.feedbackEvents)).length, 0);
  assert.equal((await t.audits()).filter((a) => a.action === 'feedback.status').length, 0);
  const ok = await t.post(`/admin/v1/feedback/${r.id}/status`, { status: 'in_progress', message: 'a'.repeat(1000) });
  assert.equal(ok.statusCode, 200);
  assert.equal((await t.post(`/admin/v1/feedback/${r.id}/status`, { status: 'xong' })).statusCode, 400);
  assert.equal((await t.post(`/admin/v1/feedback/${r.id}/status`, { status: 'done', extra: 1 })).statusCode, 400);
  const before = (await t.audits()).length;
  assert.equal((await t.post(`/admin/v1/feedback/${UUID}/status`, { status: 'done' })).statusCode, 404);
  assert.equal((await t.audits()).length, before);
  await t.close();
});

test('lấy URL tệp: ghi nhật ký feedback.view_file; URL ký mở được KHÔNG cần Bearer, kèm header an toàn', async () => {
  const t = await setup();
  const r = await t.seed();
  const f = await t.seedFile(r.id);
  const res = await t.get(`/admin/v1/feedback/${r.id}/files/${f.id}/url`);
  assert.equal(res.statusCode, 200, res.body);
  const { url, expiresAt } = res.json();
  assert.equal(new Date(expiresAt).getTime(), Math.floor((t.ctx.state.now + 300_000) / 1000) * 1000, 'exp làm tròn xuống giây, không quá 300 giây');
  const logs = (await t.audits()).filter((a) => a.action === 'feedback.view_file');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].targetId, r.id);
  assert.equal(logs[0].meta.fileId, f.id);
  assert.ok(!JSON.stringify(logs[0].meta).includes('sig'), 'chữ ký không vào nhật ký');
  // mở KHÔNG có Bearer
  const blob = await t.ctx.app.inject({ method: 'GET', url: pathOf(url) });
  assert.equal(blob.statusCode, 200, blob.body);
  assert.equal(blob.headers['cross-origin-resource-policy'], 'cross-origin');
  assert.equal(blob.headers['content-type'], 'image/png');
  assert.equal(blob.headers['x-content-type-options'], 'nosniff');
  assert.match(String(blob.headers['content-disposition']), /^attachment/);
  assert.match(String(blob.headers['content-security-policy']), /sandbox/);
  assert.equal(blob.headers['accept-ranges'], 'bytes');
  assert.ok(Buffer.compare(blob.rawPayload, PNG) === 0, 'nội dung nguyên vẹn');
  assert.ok(!url.includes(tmpdir()) && !String(blob.headers['content-disposition']).includes('feedback/'), 'không lộ đường dẫn thật');
  await t.close();
});

test('URL ký: hết hạn (+301 giây) => 403; sai chữ ký => 403; đổi k hoặc exp => 403; thiếu tham số => 403', async () => {
  const t = await setup();
  const r1 = await t.seed();
  const r2 = await t.seed();
  const f1 = await t.seedFile(r1.id);
  const f2 = await t.seedFile(r2.id);
  const u1 = new URL((await t.get(`/admin/v1/feedback/${r1.id}/files/${f1.id}/url`)).json().url, 'http://x');
  const p = (k, exp, sig) => `/admin/v1/blob?k=${encodeURIComponent(k)}&exp=${exp}&sig=${encodeURIComponent(sig)}`;
  const k1 = u1.searchParams.get('k');
  const exp = u1.searchParams.get('exp');
  const sig = u1.searchParams.get('sig');
  const get = (url) => t.ctx.app.inject({ method: 'GET', url });
  assert.equal((await get(p(k1, exp, sig))).statusCode, 200);
  assert.equal((await get(p(k1, exp, sig.slice(0, -2) + (sig.endsWith('AA') ? 'BB' : 'AA')))).statusCode, 403, 'sai chữ ký');
  assert.equal((await get(p(f2.blobKey, exp, sig))).statusCode, 403, 'chữ ký của khóa này không dùng cho khóa khác');
  assert.equal((await get(p(k1, String(Number(exp) + 3600), sig))).statusCode, 403, 'kéo dài exp thì chữ ký không còn khớp');
  assert.equal((await get(`/admin/v1/blob?k=${encodeURIComponent(k1)}&exp=${exp}`)).statusCode, 403);
  assert.equal((await get('/admin/v1/blob')).statusCode, 403);
  assert.equal((await get(p(k1, exp, ''))).statusCode, 403);
  t.ctx.advance(301_000);
  assert.equal((await get(p(k1, exp, sig))).statusCode, 403, 'hết hạn');
  await t.close();
});

test('khóa lạ (kể cả được ký đúng) không bao giờ đọc ra tệp ngoài kho: ../ => không 200', async () => {
  const t = await setup();
  const signer = createBlobUrlSigner(BLOB_SECRET, t.ctx.clock);
  for (const k of ['../../etc/passwd', 'feedback/../../x.png', '/etc/passwd', `feedback/${UUID}/${UUID}.png`]) {
    const s = signer.signBlobUrl(k);
    const res = await t.ctx.app.inject({ method: 'GET', url: s.url });
    assert.ok([400, 404].includes(res.statusCode), `${k} => ${res.statusCode}`);
  }
  await t.close();
});

test('Range: bytes=0-99 => 206 đúng 100 byte + Content-Range; hậu tố; ngoài phạm vi => 416', async () => {
  const t = await setup();
  const r = await t.seed();
  const f = await t.seedFile(r.id);
  const url = pathOf((await t.get(`/admin/v1/feedback/${r.id}/files/${f.id}/url`)).json().url);
  const rng = (range) => t.ctx.app.inject({ method: 'GET', url, headers: { range } });
  const a = await rng('bytes=0-99');
  assert.equal(a.statusCode, 206);
  assert.equal(a.rawPayload.length, 100);
  assert.equal(a.headers['content-range'], `bytes 0-99/${PNG.length}`);
  assert.equal(a.headers['content-length'], '100');
  assert.ok(Buffer.compare(a.rawPayload, PNG.subarray(0, 100)) === 0);
  assert.equal(a.headers['cross-origin-resource-policy'], 'cross-origin');
  const open = await rng('bytes=300-');
  assert.equal(open.statusCode, 206);
  assert.ok(Buffer.compare(open.rawPayload, PNG.subarray(300)) === 0);
  const suffix = await rng('bytes=-10');
  assert.equal(suffix.statusCode, 206);
  assert.ok(Buffer.compare(suffix.rawPayload, PNG.subarray(PNG.length - 10)) === 0);
  assert.equal((await rng(`bytes=${PNG.length}-`)).statusCode, 416);
  assert.equal((await rng('bytes=5-2')).statusCode, 416);
  assert.equal((await rng('items=0-5')).statusCode, 200);
  await t.close();
});

test('tệp đã purged: lấy URL => 410 (không ghi view_file); URL ký từ trước cũng => 410', async () => {
  const t = await setup();
  const r = await t.seed();
  const f = await t.seedFile(r.id);
  const url = pathOf((await t.get(`/admin/v1/feedback/${r.id}/files/${f.id}/url`)).json().url);
  await t.db.update(schema.feedbackFiles).set({ purgedAt: new Date(t.ctx.state.now) }).where(eq(schema.feedbackFiles.id, f.id));
  const before = (await t.audits()).filter((a) => a.action === 'feedback.view_file').length;
  const res = await t.get(`/admin/v1/feedback/${r.id}/files/${f.id}/url`);
  assert.equal(res.statusCode, 410);
  assert.equal((await t.audits()).filter((a) => a.action === 'feedback.view_file').length, before);
  assert.equal((await t.ctx.app.inject({ method: 'GET', url })).statusCode, 410);
  const detail = (await t.get(`/admin/v1/feedback/${r.id}`)).json();
  assert.equal(detail.files[0].purged, true);
  await t.close();
});

test('URL tệp: fileId của góp ý khác hoặc không có => 404', async () => {
  const t = await setup();
  const r1 = await t.seed();
  const r2 = await t.seed();
  const f2 = await t.seedFile(r2.id);
  assert.equal((await t.get(`/admin/v1/feedback/${r1.id}/files/${f2.id}/url`)).statusCode, 404);
  assert.equal((await t.get(`/admin/v1/feedback/${r1.id}/files/${UUID}/url`)).statusCode, 404);
  assert.equal((await t.get(`/admin/v1/feedback/${r1.id}/files/khong-uuid/url`)).statusCode, 400);
  await t.close();
});

test('thiếu ADMIN_BLOB_URL_SECRET: hàng chờ vẫn chạy, nhưng cấp URL tệp và /blob trả 503 admin_disabled', async () => {
  const t = await setup({ ADMIN_BLOB_URL_SECRET: '' });
  const r = await t.seed();
  const f = await t.seedFile(r.id);
  assert.equal((await t.get('/admin/v1/queue')).statusCode, 200);
  const res = await t.get(`/admin/v1/feedback/${r.id}/files/${f.id}/url`);
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, 'admin_disabled');
  assert.equal((await t.ctx.app.inject({ method: 'GET', url: '/admin/v1/blob?k=a&exp=1&sig=b' })).statusCode, 503);
  await t.close();
});

test('nhật ký: mới nhất lên đầu, đúng hình dạng contract, phân trang không lặp; actorUserIdShort rút gọn', async () => {
  const t = await setup();
  const r = await t.seed();
  await t.post(`/admin/v1/feedback/${r.id}/status`, { status: 'in_progress' });
  await t.post(`/admin/v1/feedback/${r.id}/status`, { status: 'done' });
  const all = (await t.get('/admin/v1/audit?limit=100')).json();
  assert.ok(all.items.length >= 3); // auth.* + hai lần đổi trạng thái
  const ids = all.items.map((i) => i.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => b - a));
  assert.equal(all.items[0].action, 'feedback.status');
  assert.equal(all.items[0].targetId, r.id);
  assert.equal(all.items[0].actorUserIdShort, t.staff.userId.slice(0, 8));
  assert.ok(!JSON.stringify(all).includes(t.staff.userId), 'không lộ userId đầy đủ');
  assert.ok(!('ipHash' in all.items[0]) && !('userAgent' in all.items[0]));
  // phân trang
  const seen = [];
  let cursor = null;
  let guard = 0;
  do {
    const p = (await t.get(`/admin/v1/audit?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)).json();
    assert.ok(p.items.length <= 2);
    seen.push(...p.items.map((i) => i.id));
    cursor = p.nextCursor;
  } while (cursor && guard++ < 50);
  assert.deepEqual(seen, ids);
  assert.equal((await t.get('/admin/v1/audit?cursor=abc')).statusCode, 400);
  await t.close();
});

test('createBlobUrlSigner: chữ ký buộc cả k và exp, đổi bí mật thì vô hiệu, so sánh đúng độ dài', async () => {
  let now = 1_800_000_000_000;
  const s = createBlobUrlSigner(BLOB_SECRET, () => new Date(now));
  const a = s.signBlobUrl('feedback/a/b.png');
  const u = new URL(a.url, 'http://x');
  const [k, exp, sig] = ['k', 'exp', 'sig'].map((n) => u.searchParams.get(n));
  assert.equal(new Date(a.expiresAt).getTime(), Math.floor((now + 300_000) / 1000) * 1000);
  assert.equal(s.verifyBlobUrl(k, exp, sig), true);
  assert.equal(s.verifyBlobUrl(k + 'x', exp, sig), false);
  assert.equal(s.verifyBlobUrl(k, String(Number(exp) + 1), sig), false);
  assert.equal(s.verifyBlobUrl(k, exp, sig + 'A'), false);
  assert.equal(s.verifyBlobUrl(k, exp, ''), false);
  assert.equal(s.verifyBlobUrl(k, '1e12', sig), false);
  assert.equal(s.verifyBlobUrl(k, exp, undefined), false);
  assert.equal(createBlobUrlSigner('khac-' + BLOB_SECRET, () => new Date(now)).verifyBlobUrl(k, exp, sig), false);
  now += 301_000;
  assert.equal(s.verifyBlobUrl(k, exp, sig), false, 'hết hạn');
  assert.equal(s.signBlobUrl('feedback/a/b.png', 60).url.includes('exp='), true);
  assert.throws(() => createBlobUrlSigner('ngan', () => new Date()));
});

test('ADMIN_ENV dùng chung không bị đổi: khối /admin/v1 cũ vẫn chạy khi không đặt ADMIN_BLOB_URL_SECRET', () => {
  assert.equal(ADMIN_ENV.ADMIN_BLOB_URL_SECRET, undefined);
});

test('con trỏ sai lịch (tháng 13) => 400, không phải 500', async () => {
  const t = await setup();
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  for (const ts of ['2020-13-45 00:00:00+00', '2020-02-30 10:00:00+00', '2020-01-01 25:00:00+00']) {
    const res = await t.get(`/admin/v1/queue?cursor=${enc({ t: ts, i: UUID })}`);
    assert.equal(res.statusCode, 400, ts);
  }
  assert.equal((await t.get(`/admin/v1/queue?cursor=${enc({ t: '2020-01-01 00:00:00.123456+00', i: UUID })}`)).statusCode, 200);
  await t.close();
});

test('sig phải đúng 43 ký tự base64url: thêm đệm "=" hoặc ký tự lạ => 403', async () => {
  const t = await setup();
  const r = await t.seed();
  const f = await t.seedFile(r.id);
  const u = new URL((await t.get(`/admin/v1/feedback/${r.id}/files/${f.id}/url`)).json().url, 'http://x');
  const q = (sig) => `/admin/v1/blob?k=${encodeURIComponent(u.searchParams.get('k'))}&exp=${u.searchParams.get('exp')}&sig=${encodeURIComponent(sig)}`;
  const sig = u.searchParams.get('sig');
  assert.equal(sig.length, 43);
  assert.equal((await t.ctx.app.inject({ method: 'GET', url: q(sig) })).statusCode, 200);
  assert.equal((await t.ctx.app.inject({ method: 'GET', url: q(sig + '=') })).statusCode, 403);
  assert.equal((await t.ctx.app.inject({ method: 'GET', url: q(sig + '!!') })).statusCode, 403);
  await t.close();
});

test('giới hạn tốc độ theo IP: /blob chặt hơn các route cần đăng nhập; vượt => 429', async () => {
  const t = await setup({ ADMIN_BLOB_RATE_LIMIT_PER_MINUTE: '3', ADMIN_API_RATE_LIMIT_PER_MINUTE: '6' });
  const bad = () => t.ctx.app.inject({ method: 'GET', url: '/admin/v1/blob?k=a&exp=1&sig=b' });
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await bad()).statusCode);
  assert.deepEqual(codes, [403, 403, 403, 429, 429]);
  // /blob bị chặn không kéo theo các route quản trị (bộ đếm riêng)
  const q = [];
  for (let i = 0; i < 8; i++) q.push((await t.get('/admin/v1/queue')).statusCode);
  assert.deepEqual(q, [200, 200, 200, 200, 200, 200, 429, 429]);
  await t.close();
});

test('redactSignedUrl: che sig trong URL ghi log, giữ phần còn lại', async () => {
  const { redactSignedUrl } = await import('../dist/lib/logRedact.js');
  assert.equal(redactSignedUrl('/admin/v1/blob?k=a&exp=1&sig=abcDEF-_123'), '/admin/v1/blob?k=a&exp=1&sig=[redacted]');
  assert.equal(redactSignedUrl('/admin/v1/blob?sig=x&k=a'), '/admin/v1/blob?sig=[redacted]&k=a');
  assert.equal(redactSignedUrl('/v1/chat'), '/v1/chat');
});
