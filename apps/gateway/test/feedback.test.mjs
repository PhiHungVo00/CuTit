import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../dist/config.js';
import { buildApp } from '../dist/app.js';
import { createDbProvider, schema } from '../dist/db/client.js';
import { createBlobStore } from '../dist/services/blob/index.js';
import { sniffMedia } from '../dist/services/feedback/fileSniff.js';
import { guest, ORIGIN } from './helpers.mjs';

/**
 * Góp ý/báo lỗi (dự án 5a Task 2): gửi kèm ảnh/video, kiểm loại theo magic bytes, giới hạn, quyền theo người dùng,
 * dọn tệp khi xóa tài khoản. Mặc định PGlite; đặt TEST_DATABASE_URL để chạy trên Postgres thật
 * (mỗi tệp test một DB mới, --test-concurrency=1).
 */
const PG = process.env.TEST_DATABASE_URL;
const MB = 1024 * 1024;
const META = {
  kind: 'bug',
  body: 'Nút gửi bị đơ khi bấm hai lần liên tiếp',
  context: { appVersion: '1.0.0', build: 'abc123', platform: 'web', osVersion: 'Chrome 130', locale: 'vi', route: '/hoc', recentRoutes: ['/', '/hoc'] }
};

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.from([0, 0, 2, 0]), Buffer.from('isomiso2'), Buffer.alloc(256, 1)]);
const MZ = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 9)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

function form(parts) {
  const boundary = '----fb' + Math.random().toString(16).slice(2);
  const chunks = [];
  for (const p of parts) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"`;
    if (p.filename) head += `; filename="${p.filename}"\r\nContent-Type: ${p.type}`;
    chunks.push(Buffer.from(head + '\r\n\r\n'), Buffer.isBuffer(p.data) ? p.data : Buffer.from(String(p.data)), Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
const metaPart = (m = META) => ({ name: 'meta', data: JSON.stringify(m) });
const filePart = (data, filename = 'a.png', type = 'image/png') => ({ name: 'files', filename, type, data });

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

async function setup(env = {}, opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'fb-'));
  const dbp = createDbProvider(PG ? { DATABASE_URL: PG, PGLITE_DIR: 'memory://' } : { PGLITE_DIR: 'memory://' });
  const config = loadConfig({ NODE_ENV: 'test', CORS_ORIGIN: ORIGIN, GUEST_QUOTA_FACTOR: '1', BLOB_DIR: dir, FEEDBACK_IP_PER_HOUR: '1000', ...env });
  const app = await buildApp(config, { logger: false, db: dbp, ...opts });
  const db = await dbp.get();
  const post = (g, parts) => {
    const f = form(parts);
    return app.inject({ method: 'POST', url: '/v1/feedback', headers: { ...g.headers, ...f.headers }, payload: f.payload });
  };
  return {
    app,
    db,
    dir,
    post,
    config,
    async done() {
      await app.close();
      await dbp.close();
      rmSync(dir, { recursive: true, force: true });
    }
  };
}
const countRows = async (db, table, userId) => {
  const rows = await db.select().from(table);
  if (!userId) return rows.length;
  const reps = (await db.select().from(schema.feedbackReports)).filter((r) => r.userId === userId).map((r) => r.id);
  return rows.filter((r) => (r.feedbackId ? reps.includes(r.feedbackId) : r.userId === userId)).length;
};

test('sniffMedia: nhận đúng theo nội dung, từ chối SVG/PE/HEIC/MKV', () => {
  assert.equal(sniffMedia(PNG)?.contentType, 'image/png');
  assert.equal(sniffMedia(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))?.contentType, 'image/jpeg');
  assert.equal(sniffMedia(Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')]))?.contentType, 'image/webp');
  assert.equal(sniffMedia(MP4)?.contentType, 'video/mp4');
  assert.equal(sniffMedia(Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from('ftypqt  '), Buffer.alloc(16)]))?.contentType, 'video/quicktime');
  assert.equal(sniffMedia(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84]), Buffer.from('webm'), Buffer.alloc(20)]))?.contentType, 'video/webm');
  assert.equal(sniffMedia(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x88]), Buffer.from('matroska'), Buffer.alloc(20)])), null);
  assert.equal(sniffMedia(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(20)])), null);
  assert.equal(sniffMedia(SVG), null);
  assert.equal(sniffMedia(MZ), null);
  assert.equal(sniffMedia(Buffer.alloc(0)), null);
});

test('khách gửi 1 ảnh PNG + 1 MP4 nhỏ: 200, 2 dòng feedback_files, tệp có trên đĩa, khóa do server sinh', async () => {
  const t = await setup();
  const g = await guest(t.app);
  const res = await t.post(g, [metaPart(), filePart(PNG, '../../etc/passwd.png', 'text/plain'), filePart(MP4, 'x.exe', 'application/x-msdownload')]);
  assert.equal(res.statusCode, 200, res.body);
  const { id } = res.json();
  const files = await t.db.select().from(schema.feedbackFiles);
  assert.equal(files.length, 2);
  assert.deepEqual(files.map((f) => f.contentType).sort(), ['image/png', 'video/mp4']);
  const onDisk = walk(t.dir);
  assert.equal(onDisk.length, 2);
  for (const f of files) {
    assert.match(f.blobKey, new RegExp(`^feedback/${id}/[0-9a-f-]{36}\\.(png|mp4)$`)); // không chứa tên gốc/đường dẫn của client
    assert.ok(f.bytes > 0);
  }
  const [rep] = await t.db.select().from(schema.feedbackReports);
  assert.equal(rep.id, id);
  assert.equal(rep.userId, g.body.userId);
  assert.equal(rep.status, 'received');
  await t.done();
});

test('chỉ có chữ cũng gửi được; thiếu/hỏng meta => 400 và không để lại tệp', async () => {
  const t = await setup();
  const g = await guest(t.app);
  assert.equal((await t.post(g, [metaPart()])).statusCode, 200);
  for (const parts of [
    [filePart(PNG)], // thiếu meta
    [{ name: 'meta', data: '{khong phai json' }, filePart(PNG)],
    [metaPart({ ...META, body: 'ngắn' }), filePart(PNG)],
    [metaPart({ ...META, kind: 'spam' }), filePart(PNG)],
    [metaPart({ ...META, extra: 1 }), filePart(PNG)],
    [{ name: 'khac', data: 'x' }, filePart(PNG)]
  ]) {
    const r = await t.post(g, parts);
    assert.equal(r.statusCode, 400, r.body);
    assert.equal(r.json().error, 'invalid_request');
  }
  assert.deepEqual(walk(t.dir), []);
  assert.equal((await t.db.select().from(schema.feedbackReports)).length, 1);
  await t.done();
});

test('tệp đổi đuôi bị từ chối theo magic bytes: PE đặt tên .mp4, SVG khai image/png => 400 file_type', async () => {
  const t = await setup();
  const g = await guest(t.app);
  const exe = await t.post(g, [metaPart(), filePart(MZ, 'video.mp4', 'video/mp4')]);
  assert.equal(exe.statusCode, 400);
  assert.equal(exe.json().error, 'file_type');
  const svg = await t.post(g, [metaPart(), filePart(SVG, 'a.png', 'image/png')]);
  assert.equal(svg.statusCode, 400);
  assert.equal(svg.json().error, 'file_type');
  // một tệp hợp lệ + một tệp giả: cả yêu cầu bị từ chối, tệp hợp lệ đã ghi cũng bị xóa
  const mixed = await t.post(g, [metaPart(), filePart(PNG), filePart(MZ, 'b.png', 'image/png')]);
  assert.equal(mixed.statusCode, 400);
  assert.deepEqual(walk(t.dir), []);
  assert.equal((await t.db.select().from(schema.feedbackReports)).length, 0);
  assert.equal((await t.db.select().from(schema.feedbackFiles)).length, 0);
  await t.done();
});

test('quá số tệp: 4 ảnh, 2 video, 5 tệp => 400 too_many_files; không để lại gì', async () => {
  const t = await setup();
  const g = await guest(t.app);
  for (const parts of [
    [metaPart(), filePart(PNG), filePart(PNG), filePart(PNG), filePart(PNG)],
    [metaPart(), filePart(MP4, 'a.mp4', 'video/mp4'), filePart(MP4, 'b.mp4', 'video/mp4')],
    [metaPart(), filePart(PNG), filePart(PNG), filePart(PNG), filePart(MP4, 'a.mp4', 'video/mp4'), filePart(PNG)]
  ]) {
    const r = await t.post(g, parts);
    assert.equal(r.statusCode, 400, r.body);
    assert.equal(r.json().error, 'too_many_files');
  }
  assert.deepEqual(walk(t.dir), []);
  assert.equal((await t.db.select().from(schema.feedbackReports)).length, 0);
  // đúng giới hạn (3 ảnh + 1 video) vẫn nhận
  const ok = await t.post(g, [metaPart(), filePart(PNG), filePart(PNG), filePart(PNG), filePart(MP4, 'a.mp4', 'video/mp4')]);
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(walk(t.dir).length, 4);
  await t.done();
});

test('ảnh 5 MB + 1 byte => 413 file_too_large, thư mục tạm rỗng, 0 dòng DB; ảnh đúng 5 MB nhận', async () => {
  const t = await setup();
  const g = await guest(t.app);
  const big = Buffer.concat([PNG, Buffer.alloc(5 * MB + 1 - PNG.length, 1)]);
  assert.equal(big.length, 5 * MB + 1);
  const r = await t.post(g, [metaPart(), filePart(big)]);
  assert.equal(r.statusCode, 413, r.body.slice(0, 200));
  assert.equal(r.json().error, 'file_too_large');
  assert.deepEqual(walk(t.dir), []);
  assert.equal((await t.db.select().from(schema.feedbackReports)).length, 0);
  assert.equal((await t.db.select().from(schema.feedbackFiles)).length, 0);
  const exact = Buffer.concat([PNG, Buffer.alloc(5 * MB - PNG.length, 1)]);
  const ok = await t.post(g, [metaPart(), filePart(exact)]);
  assert.equal(ok.statusCode, 200, ok.body);
  await t.done();
});

test('client ngắt kết nối giữa lúc gửi video: 0 dòng DB, 0 tệp', async () => {
  const t = await setup();
  const g = await guest(t.app);
  await t.app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = t.app.server.address();
  const boundary = '----abort';
  const head =
    `--${boundary}\r\nContent-Disposition: form-data; name="meta"\r\n\r\n${JSON.stringify(META)}\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="v.mp4"\r\nContent-Type: video/mp4\r\n\r\n`;
  const sock = net.connect(port, '127.0.0.1');
  await new Promise((r) => sock.once('connect', r));
  sock.on('error', () => undefined);
  const declared = 20 * MB;
  sock.write(
    `POST /v1/feedback HTTP/1.1\r\nHost: localhost\r\nAuthorization: ${g.headers.authorization}\r\nContent-Type: multipart/form-data; boundary=${boundary}\r\nContent-Length: ${declared}\r\n\r\n`
  );
  sock.write(head);
  sock.write(MP4);
  sock.write(Buffer.alloc(2 * MB, 3)); // gửi dở rồi cắt
  await new Promise((r) => setTimeout(r, 300));
  sock.destroy();
  // chờ server nhận ra và dọn
  for (let i = 0; i < 40 && (walk(t.dir).length > 0 || false); i++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(walk(t.dir), [], 'không còn tệp (kể cả tệp tạm)');
  assert.equal((await t.db.select().from(schema.feedbackReports)).length, 0);
  assert.equal((await t.db.select().from(schema.feedbackFiles)).length, 0);
  await t.done();
});

test('lần gửi thứ 6 trong ngày => 429 feedback_limit; người khác không bị ảnh hưởng', async () => {
  const t = await setup();
  const g = await guest(t.app);
  for (let i = 0; i < 5; i++) assert.equal((await t.post(g, [metaPart()])).statusCode, 200);
  const r = await t.post(g, [metaPart(), filePart(PNG)]);
  assert.equal(r.statusCode, 429);
  assert.equal(r.json().error, 'feedback_limit');
  assert.deepEqual(walk(t.dir), []);
  const other = await guest(t.app);
  assert.equal((await t.post(other, [metaPart()])).statusCode, 200);
  await t.done();
});

test('5 yêu cầu song song của cùng một người: đúng 5 nhận, không vượt giới hạn ngày', async () => {
  const t = await setup();
  const g = await guest(t.app);
  const rs = await Promise.all(Array.from({ length: 8 }, () => t.post(g, [metaPart()])));
  assert.equal(rs.filter((r) => r.statusCode === 200).length, 5, rs.map((r) => r.statusCode).join());
  assert.equal(rs.filter((r) => r.statusCode === 429).length, 3);
  assert.equal((await t.db.select().from(schema.feedbackReports)).length, 5);
  await t.done();
});

test('giới hạn theo IP mỗi giờ => 429', async () => {
  const t = await setup({ FEEDBACK_IP_PER_HOUR: '2' });
  const gs = [await guest(t.app), await guest(t.app), await guest(t.app)];
  assert.equal((await t.post(gs[0], [metaPart()])).statusCode, 200);
  assert.equal((await t.post(gs[1], [metaPart()])).statusCode, 200);
  assert.equal((await t.post(gs[2], [metaPart()])).statusCode, 429);
  await t.done();
});

test('kho tệp vượt BLOB_TOTAL_CAP_MB => 507 storage_full cho bản có tệp, bản chỉ có chữ vẫn nhận', async () => {
  const t = await setup({ BLOB_TOTAL_CAP_MB: '1' });
  mkdirSync(join(t.dir, 'feedback', 'old'), { recursive: true });
  writeFileSync(join(t.dir, 'feedback', 'old', 'x.png'), Buffer.alloc(2 * MB));
  const before = walk(t.dir).length;
  const g = await guest(t.app);
  const r = await t.post(g, [metaPart(), filePart(PNG)]);
  assert.equal(r.statusCode, 507, r.body);
  assert.equal(r.json().error, 'storage_full');
  assert.equal(walk(t.dir).length, before);
  assert.equal((await t.db.select().from(schema.feedbackReports)).length, 0);
  assert.equal((await t.post(g, [metaPart()])).statusCode, 200);
  await t.done();
});

test('không đăng nhập => 401; không phải multipart => 415', async () => {
  const t = await setup();
  const g = await guest(t.app);
  const anon = await t.app.inject({ method: 'POST', url: '/v1/feedback', ...form([metaPart()]) });
  assert.equal(anon.statusCode, 401);
  const json = await t.app.inject({ method: 'POST', url: '/v1/feedback', headers: g.headers, payload: META });
  assert.equal(json.statusCode, 415);
  assert.equal((await t.app.inject({ method: 'GET', url: '/v1/feedback/mine' })).statusCode, 401);
  await t.done();
});

test('GET /mine chỉ thấy của mình, không lộ khóa/đường dẫn tệp; unread-count và đánh dấu đã đọc', async () => {
  const t = await setup();
  const a = await guest(t.app);
  const b = await guest(t.app);
  const ra = (await t.post(a, [metaPart(), filePart(PNG)])).json().id;
  const rb = (await t.post(b, [metaPart({ ...META, body: 'Góp ý của người thứ hai đây' })])).json().id;

  const mineA = (await t.app.inject({ method: 'GET', url: '/v1/feedback/mine', headers: a.headers })).json();
  assert.deepEqual(mineA.items.map((i) => i.id), [ra]);
  assert.deepEqual(mineA.items[0].files, [{ media: 'image', purged: false }]);
  assert.equal(mineA.items[0].unread, false);
  const raw = JSON.stringify(mineA);
  assert.ok(!raw.includes('feedback/') && !raw.includes(t.dir) && !raw.includes('.png'), 'không lộ khóa/đường dẫn');
  const mineB = (await t.app.inject({ method: 'GET', url: '/v1/feedback/mine', headers: b.headers })).json();
  assert.deepEqual(mineB.items.map((i) => i.id), [rb]);

  const count = async (g) => (await t.app.inject({ method: 'GET', url: '/v1/feedback/mine/unread-count', headers: g.headers })).json().count;
  assert.equal(await count(a), 0);

  // chủ app trả lời (mô phỏng Task 5): thêm lời nhắn + đặt unread
  const { eq } = await import('drizzle-orm');
  await t.db.insert(schema.feedbackEvents).values({ feedbackId: ra, status: 'in_progress', message: 'Mình đang xem nhé' });
  await t.db.update(schema.feedbackReports).set({ userUnread: true, status: 'in_progress' }).where(eq(schema.feedbackReports.id, ra));
  assert.equal(await count(a), 1);
  assert.equal(await count(b), 0);
  const detail = (await t.app.inject({ method: 'GET', url: '/v1/feedback/mine', headers: a.headers })).json().items[0];
  assert.equal(detail.unread, true);
  assert.equal(detail.status, 'in_progress');
  assert.equal(detail.events[0].message, 'Mình đang xem nhé');

  // người khác đánh dấu đã đọc góp ý của A => 404, không đổi gì
  assert.equal((await t.app.inject({ method: 'POST', url: `/v1/feedback/${ra}/read`, headers: b.headers })).statusCode, 404);
  assert.equal(await count(a), 1);
  assert.equal((await t.app.inject({ method: 'POST', url: `/v1/feedback/00000000-0000-4000-8000-000000000000/read`, headers: a.headers })).statusCode, 404);
  assert.equal((await t.app.inject({ method: 'POST', url: `/v1/feedback/khong-phai-uuid/read`, headers: a.headers })).statusCode, 400);
  assert.equal((await t.app.inject({ method: 'POST', url: `/v1/feedback/${ra}/read`, headers: a.headers })).statusCode, 204);
  assert.equal(await count(a), 0);
  await t.done();
});

test('DELETE /v1/me xóa cứng => tệp bị xóa khỏi kho, dòng DB mất theo cascade', async () => {
  const t = await setup();
  const g = await guest(t.app);
  assert.equal((await t.post(g, [metaPart(), filePart(PNG), filePart(MP4, 'a.mp4', 'video/mp4')])).statusCode, 200);
  assert.equal(walk(t.dir).length, 2);
  const res = await t.app.inject({ method: 'DELETE', url: '/v1/me', headers: g.headers, payload: { mode: 'now' } });
  assert.equal(res.statusCode, 200, res.body);
  assert.deepEqual(walk(t.dir), []);
  assert.equal((await t.db.select().from(schema.feedbackReports)).length, 0);
  assert.equal((await t.db.select().from(schema.blobDeletions)).length, 0);
  await t.done();
});

test('DELETE /v1/me khi kho tệp ném lỗi khi xóa => tài khoản vẫn xóa, khóa tệp nằm trong blob_deletions để thử lại', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fb-'));
  const real = createBlobStore({ BLOB_PROVIDER: 'fs', BLOB_DIR: dir });
  let failing = false;
  const flaky = {
    put: (...a) => real.put(...a),
    get: (...a) => real.get(...a),
    totalBytes: () => real.totalBytes(),
    delete: async (k) => {
      if (failing) throw new Error('kho tệp hỏng');
      return real.delete(k);
    }
  };
  const t = await setup({ BLOB_DIR: dir }, { blob: flaky });
  const g = await guest(t.app);
  assert.equal((await t.post(g, [metaPart(), filePart(PNG)])).statusCode, 200);
  const [file] = await t.db.select().from(schema.feedbackFiles);
  failing = true;
  const res = await t.app.inject({ method: 'DELETE', url: '/v1/me', headers: g.headers, payload: { mode: 'now' } });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal((await t.db.select().from(schema.feedbackReports)).length, 0);
  const q = await t.db.select().from(schema.blobDeletions);
  assert.deepEqual(q.map((r) => r.blobKey), [file.blobKey]);
  assert.equal(q[0].attempts, 1);
  assert.equal(walk(dir).length, 1, 'tệp còn đó, chờ job thử lại');
  failing = false;
  const { runFeedbackPurge } = await import('../dist/services/feedback/purge.js');
  const r = await runFeedbackPurge(t.db, flaky, new Date());
  assert.equal(r.retried, 1);
  assert.deepEqual(walk(dir), []);
  assert.equal((await t.db.select().from(schema.blobDeletions)).length, 0);
  await t.done();
});

void PG;
