import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, statSync, existsSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { schema } from '../dist/db/client.js';
import { createBlobStore } from '../dist/services/blob/index.js';
import { createChatBlobUrlSigner } from '../dist/services/chat/blobUrl.js';
import { ChatBlobMeter, chatBlobUsage, purgeUnattachedAttachments, purgeUserChatAttachments, runChatBlobMaintenance, saveAttachment, sniffAttachment } from '../dist/services/chat/attachments.js';
import { chatApp, person, openDm, call } from './chat-helpers.mjs';

/**
 * Dự án 4 Task 8: ảnh + giọng nói trong chat (tải lên, URL ký, trần dung lượng, dọn dẹp). Mặc định PGlite;
 * TEST_DATABASE_URL => Postgres thật (--test-concurrency=1).
 */
const MB = 1024 * 1024;
const SECRET = 'k'.repeat(40);
const pad = (head, n) => Buffer.concat([Buffer.from(head), Buffer.alloc(Math.max(0, n - head.length), 5)]);
const PNG = (n = 200) => pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], n);
const JPG = (n = 200) => pad([0xff, 0xd8, 0xff, 0xe0], n);
const WEBP = (n = 200) => pad(Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]), n);
const WEBM = (n = 300) => pad(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84]), Buffer.from('webm')]), n);
const OGG = (n = 300) => pad(Buffer.from('OggS\0\x02'), n);
const M4A = (n = 300) => pad(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypM4A '), Buffer.from([0, 0, 0, 0])]), n);
const MP4 = (n = 300) => pad(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.from([0, 0, 2, 0])]), n);
const MOV = (n = 300) => pad(Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from('ftypqt  ')]), n);
const MZ = (n = 300) => pad('MZ', n);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

function form(parts) {
  const boundary = '----ca' + Math.random().toString(16).slice(2);
  const chunks = [];
  for (const p of parts) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"`;
    if (p.filename) head += `; filename="${p.filename}"\r\nContent-Type: ${p.type}`;
    chunks.push(Buffer.from(head + '\r\n\r\n'), Buffer.isBuffer(p.data) ? p.data : Buffer.from(String(p.data)), Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
const meta = (cid, extra = {}) => ({ name: 'meta', data: JSON.stringify({ cid, ...extra }) });
const file = (data, filename = 'a.bin', type = 'application/octet-stream') => ({ name: 'file', filename, type, data });

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
  const dir = mkdtempSync(join(tmpdir(), 'ca-'));
  const clock = { now: new Date() };
  const blob = opts.blob ?? createBlobStore({ BLOB_PROVIDER: 'fs', BLOB_DIR: dir });
  const t = await chatApp({ CHAT_BLOB_URL_SECRET: SECRET, ...env }, { blob, clock: () => clock.now, ...opts });
  t.dir = dir;
  t.blob = blob;
  t.clock = clock;
  t.db = await t.dbp.get();
  t.signer = createChatBlobUrlSigner(SECRET, () => clock.now);
  t.upload = (u, parts) => {
    const f = form(parts);
    return t.app.inject({ method: 'POST', url: '/v1/chat/attachments', headers: { ...u.headers, ...f.headers }, payload: f.payload });
  };
  t.done = async () => {
    await t.close();
    rmSync(dir, { recursive: true, force: true });
  };
  const a = await person(t, 'An');
  const b = await person(t, 'Bình');
  const cid = await openDm(t, a, b);
  return Object.assign(t, { a, b, cid });
}
const rows = (t) => t.db.select().from(schema.chatAttachments);
const send = (t, u, cid, kind, attachmentId, clientMsgId = randomUUID()) => call(t, u, 'POST', `/v1/chat/conversations/${cid}/messages`, { clientMsgId, kind, attachmentId });
const sendText = (t, u, cid, body) => call(t, u, 'POST', `/v1/chat/conversations/${cid}/messages`, { clientMsgId: randomUUID(), kind: 'text', body });
async function uploadOk(t, u, data, extra = {}, cid = t.cid) {
  const r = await t.upload(u, [meta(cid, extra), file(data)]);
  assert.equal(r.statusCode, 200, r.body);
  return r.json().attachmentId;
}

test('sniffAttachment: nhận theo magic bytes, loại SVG/PE/MOV/MKV', () => {
  assert.equal(sniffAttachment(PNG()).media, 'image');
  assert.equal(sniffAttachment(JPG()).contentType, 'image/jpeg');
  assert.equal(sniffAttachment(WEBP()).contentType, 'image/webp');
  assert.equal(sniffAttachment(WEBM()).contentType, 'audio/webm');
  assert.equal(sniffAttachment(OGG()).contentType, 'audio/ogg');
  assert.equal(sniffAttachment(M4A()).contentType, 'audio/mp4');
  assert.equal(sniffAttachment(MP4()).contentType, 'audio/mp4');
  for (const bad of [SVG, MZ(), MOV(), Buffer.from('<html>'), Buffer.alloc(0), Buffer.from('GIF89a....')]) assert.equal(sniffAttachment(bad), null);
});

test('ảnh PNG/JPEG/WebP hợp lệ → 200, khóa do server sinh, Content-Type của client bị bỏ qua', async () => {
  const t = await setup();
  const ids = [];
  for (const [data, ext, ct] of [[PNG(), 'png', 'image/png'], [JPG(), 'jpg', 'image/jpeg'], [WEBP(), 'webp', 'image/webp']]) {
    // client khai láo cả tên lẫn kiểu: server chỉ tin nội dung
    const r = await t.upload(t.a, [meta(t.cid, { width: 640, height: 480 }), file(data, '../../../evil.exe', 'application/x-msdownload')]);
    assert.equal(r.statusCode, 200, r.body);
    ids.push([r.json().attachmentId, ext, ct]);
  }
  const all = await rows(t);
  assert.equal(all.length, 3);
  for (const [id, ext, ct] of ids) {
    const row = all.find((x) => x.id === id);
    assert.match(row.blobKey, new RegExp(`^chat/${t.cid}/[0-9a-f-]{36}\\.${ext}$`));
    assert.equal(row.contentType, ct);
    assert.equal(row.media, 'image');
    assert.equal(row.uploaderId, t.a.userId);
    assert.equal(row.width, 640);
  }
  assert.equal(walk(t.dir).length, 3);
  await t.done();
});

test('SVG khai image/png, PE đổi đuôi .webp/.mp4, MOV, tệp rỗng → 400 attachment_invalid, kho rỗng, 0 dòng DB', async () => {
  const t = await setup();
  const cases = [
    [SVG, 'x.png', 'image/png'],
    [MZ(), 'x.webp', 'image/webp'],
    [MZ(), 'x.mp4', 'audio/mp4'],
    [MOV(), 'x.mp4', 'video/mp4'],
    [Buffer.alloc(0), 'x.png', 'image/png']
  ];
  for (const [data, name, type] of cases) {
    const r = await t.upload(t.a, [meta(t.cid), file(data, name, type)]);
    assert.equal(r.statusCode, 400, `${name}: ${r.body}`);
    assert.equal(r.json().error, 'attachment_invalid');
  }
  assert.deepEqual(walk(t.dir), []);
  assert.equal((await rows(t)).length, 0);
  await t.done();
});

test('ảnh đúng 2 MB nhận; 2 MB + 1 → 413, kho rỗng, 0 dòng DB', async () => {
  const t = await setup();
  await uploadOk(t, t.a, PNG(2 * MB));
  const before = walk(t.dir).length;
  const r = await t.upload(t.a, [meta(t.cid), file(PNG(2 * MB + 1))]);
  assert.equal(r.statusCode, 413, r.body);
  assert.equal(r.json().error, 'file_too_large');
  assert.equal(walk(t.dir).length, before, 'không để lại tệp dở (kể cả .tmp)');
  assert.equal((await rows(t)).length, 1);
  await t.done();
});

test('giọng nói WebM/Ogg/MP4 ≤ 3 MB nhận; 3 MB + 1 → 413; waveform > 64 số, > 120 s, số lạ → 400', async () => {
  const t = await setup();
  for (const [data, ct] of [[WEBM(3 * MB), 'audio/webm'], [OGG(1000), 'audio/ogg'], [M4A(1000), 'audio/mp4'], [MP4(1000), 'audio/mp4']]) {
    const id = await uploadOk(t, t.a, data, { durationMs: 120_000, waveform: Array.from({ length: 64 }, (_, i) => i) });
    const row = (await rows(t)).find((x) => x.id === id);
    assert.equal(row.media, 'voice');
    assert.equal(row.contentType, ct);
    assert.equal(row.durationMs, 120_000);
    assert.equal(row.waveform.length, 64);
  }
  const big = await t.upload(t.a, [meta(t.cid), file(WEBM(3 * MB + 1))]);
  assert.equal(big.statusCode, 413);
  const n = (await rows(t)).length;
  for (const extra of [{ waveform: Array.from({ length: 65 }, () => 1) }, { durationMs: 120_001 }, { waveform: [256] }, { waveform: [1.5] }, { durationMs: -1 }, { cid: 'x', extra: 1 }]) {
    const r = await t.upload(t.a, [meta(t.cid, extra), file(WEBM())]);
    assert.equal(r.statusCode, 400, JSON.stringify(extra));
  }
  assert.equal((await rows(t)).length, n);
  assert.equal(walk(t.dir).length, n, 'không tệp mồ côi');
  await t.done();
});

test('phần tệp trước meta, thiếu meta, thiếu tệp, hai tệp, tên phần lạ → 400', async () => {
  const t = await setup();
  const bad = [
    [file(PNG()), meta(t.cid)],
    [file(PNG())],
    [meta(t.cid)],
    [meta(t.cid), file(PNG()), file(PNG())],
    [meta(t.cid), { ...file(PNG()), name: 'files' }],
    [{ name: 'meta', data: '{khong-phai-json' }, file(PNG())]
  ];
  for (const parts of bad) assert.equal((await t.upload(t.a, parts)).statusCode, 400, JSON.stringify(parts.map((p) => p.name)));
  assert.equal((await t.app.inject({ method: 'POST', url: '/v1/chat/attachments', headers: { ...t.a.headers, 'content-type': 'application/json' }, payload: '{}' })).statusCode, 415);
  assert.deepEqual(walk(t.dir), []);
  assert.equal((await rows(t)).length, 0);
  await t.done();
});

test('client ngắt giữa lúc gửi: 0 dòng DB, 0 tệp (kể cả .tmp)', async () => {
  const t = await setup();
  await t.app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = t.app.server.address();
  const boundary = '----abort';
  const head =
    `--${boundary}\r\nContent-Disposition: form-data; name="meta"\r\n\r\n${JSON.stringify({ cid: t.cid })}\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.webm"\r\nContent-Type: audio/webm\r\n\r\n`;
  const sock = net.connect(port, '127.0.0.1');
  await new Promise((r) => sock.once('connect', r));
  sock.on('error', () => undefined);
  sock.write(
    `POST /v1/chat/attachments HTTP/1.1\r\nHost: localhost\r\nAuthorization: ${t.a.headers.authorization}\r\nContent-Type: multipart/form-data; boundary=${boundary}\r\nContent-Length: ${3 * MB}\r\n\r\n`
  );
  sock.write(head);
  sock.write(WEBM(1000));
  sock.write(Buffer.alloc(MB, 3));
  await new Promise((r) => setTimeout(r, 300));
  sock.destroy();
  for (let i = 0; i < 40 && walk(t.dir).length > 0; i++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(walk(t.dir), []);
  assert.equal((await rows(t)).length, 0);
  await t.done();
});

test('người ngoài cuộc trò chuyện tải lên → 403 not_a_member, kho rỗng; người không đủ điều kiện bị cổng chặn', async () => {
  const t = await setup();
  const c = await person(t, 'Chi');
  const r = await t.upload(c, [meta(t.cid), file(PNG())]);
  assert.equal(r.statusCode, 403);
  assert.equal(r.json().error, 'not_a_member');
  t.gate.set(t.a.userId, 'minor');
  const r2 = await t.upload(t.a, [meta(t.cid), file(PNG())]);
  assert.ok([403, 404].includes(r2.statusCode), r2.body);
  t.gate.set(t.a.userId, null);
  // người kia không còn đủ điều kiện (1-1): không tải lên được
  t.gate.set(t.b.userId, 'minor');
  assert.equal((await t.upload(t.a, [meta(t.cid), file(PNG())])).statusCode, 404);
  assert.deepEqual(walk(t.dir), []);
  assert.equal((await rows(t)).length, 0);
  await t.done();
});

test('gắn tệp vào tin: tin ảnh có attachment, phát qua bus; tin chữ vẫn gửi bình thường', async () => {
  const t = await setup();
  const id = await uploadOk(t, t.a, PNG(), { width: 10, height: 20 });
  const before = t.bus.published.length;
  const r = await send(t, t.a, t.cid, 'image', id);
  assert.equal(r.statusCode, 200, r.body);
  const page = (await call(t, t.b, 'GET', `/v1/chat/conversations/${t.cid}/messages`)).json();
  const m = page.messages.at(-1);
  assert.equal(m.kind, 'image');
  assert.equal(m.attachment.id, id);
  assert.equal(m.attachment.media, 'image');
  assert.equal(m.attachment.width, 10);
  assert.equal(m.body, undefined);
  const frames = t.bus.published.slice(before).filter((p) => p.frame.t === 'msg');
  assert.ok(frames.length >= 1);
  assert.equal(frames[0].frame.message.attachment.id, id);
  // gửi lại cùng clientMsgId không gắn thêm, không tăng seq
  const cm = randomUUID();
  const id2 = await uploadOk(t, t.a, OGG(), { durationMs: 5000 });
  const v1 = await send(t, t.a, t.cid, 'voice', id2, cm);
  const v2 = await send(t, t.a, t.cid, 'voice', id2, cm);
  assert.equal(v1.json().seq, v2.json().seq);
  assert.equal(v2.json().duplicate, true);
  assert.equal((await sendText(t, t.b, t.cid, 'xin chào')).statusCode, 200);
  await t.done();
});

test('gắn tệp của người khác / cuộc khác / đã gắn / sai loại / không tồn tại → 400 attachment_invalid, không gắn', async () => {
  const t = await setup();
  const c = await person(t, 'Chi');
  const cid2 = await openDm(t, t.a, c);
  const mine = await uploadOk(t, t.a, PNG());
  const bs = await uploadOk(t, t.b, PNG());
  const other = await uploadOk(t, t.a, PNG(), {}, cid2);
  const voice = await uploadOk(t, t.a, OGG());
  // của người khác (B tải, A gắn)
  for (const [u, kind, att] of [
    [t.a, 'image', bs],
    [t.a, 'image', other],
    [t.a, 'voice', mine],
    [t.a, 'image', voice],
    [t.a, 'image', randomUUID()]
  ]) {
    const r = await send(t, u, t.cid, kind, att);
    assert.equal(r.statusCode, 400, `${kind}: ${r.body}`);
    assert.equal(r.json().error, 'attachment_invalid');
  }
  // tin chữ kèm attachmentId / tin ảnh kèm chữ: không hợp lệ
  assert.equal((await call(t, t.a, 'POST', `/v1/chat/conversations/${t.cid}/messages`, { clientMsgId: randomUUID(), kind: 'image', attachmentId: mine, body: 'x' })).statusCode, 400);
  const msgs = await t.db.select().from(schema.chatMessages);
  assert.equal(msgs.filter((m) => m.attachmentId).length, 0);
  // gắn đúng một lần; lần hai (tin khác) bị từ chối, tệp vẫn thuộc tin đầu
  assert.equal((await send(t, t.a, t.cid, 'image', mine)).statusCode, 200);
  const again = await send(t, t.a, t.cid, 'image', mine);
  assert.equal(again.statusCode, 400);
  assert.equal((await t.db.select().from(schema.chatMessages)).filter((m) => m.attachmentId === mine).length, 1);
  await t.done();
});

test('hai tin cùng giành MỘT tệp song song: đúng một thắng', async () => {
  const t = await setup();
  const id = await uploadOk(t, t.a, PNG());
  const rs = await Promise.all(Array.from({ length: 4 }, () => send(t, t.a, t.cid, 'image', id)));
  assert.equal(rs.filter((r) => r.statusCode === 200).length, 1, rs.map((r) => r.statusCode).join());
  assert.equal((await t.db.select().from(schema.chatMessages)).filter((m) => m.attachmentId === id).length, 1);
  await t.done();
});

test('tệp chưa gắn quá 1 giờ không gắn được nữa', async () => {
  const t = await setup();
  const id = await uploadOk(t, t.a, PNG());
  t.clock.now = new Date(Date.now() + 61 * 60_000);
  assert.equal((await send(t, t.a, t.cid, 'image', id)).statusCode, 400);
  await t.done();
});

test('URL ký: thành viên xin được và tải được không cần đăng nhập; header an toàn; Content-Type từ DB', async () => {
  const t = await setup();
  const id = await uploadOk(t, t.a, JPG(1000));
  await send(t, t.a, t.cid, 'image', id);
  const r = await call(t, t.b, 'GET', `/v1/chat/attachments/${id}/url`);
  assert.equal(r.statusCode, 200, r.body);
  const { url, expiresAt } = r.json();
  assert.match(url, /^\/v1\/chat\/blob\?k=chat%2F/);
  assert.ok(new Date(expiresAt).getTime() - Date.now() <= 300_000 + 2000);
  const got = await t.app.inject({ method: 'GET', url });
  assert.equal(got.statusCode, 200);
  assert.equal(got.headers['content-type'], 'image/jpeg');
  assert.equal(got.headers['x-content-type-options'], 'nosniff');
  assert.equal(got.headers['cross-origin-resource-policy'], 'cross-origin');
  assert.match(got.headers['content-disposition'], /^attachment;/);
  assert.equal(got.rawPayload.length, 1000);
  assert.ok(!url.includes(t.dir), 'không lộ đường dẫn thật');
  await t.done();
});

test('người ngoài cuộc xin URL → not_a_member; tệp chưa gắn chỉ người tải xem trước; không tồn tại → 404', async () => {
  const t = await setup();
  const c = await person(t, 'Chi');
  const id = await uploadOk(t, t.a, PNG());
  const out = await call(t, c, 'GET', `/v1/chat/attachments/${id}/url`);
  assert.equal(out.statusCode, 403);
  assert.equal(out.json().error, 'not_a_member');
  // chưa gắn: A (người tải) xem được, B (cùng cuộc) chưa
  assert.equal((await call(t, t.a, 'GET', `/v1/chat/attachments/${id}/url`)).statusCode, 200);
  assert.equal((await call(t, t.b, 'GET', `/v1/chat/attachments/${id}/url`)).statusCode, 404);
  assert.equal((await call(t, t.a, 'GET', `/v1/chat/attachments/${randomUUID()}/url`)).statusCode, 404);
  assert.equal((await call(t, t.a, 'GET', `/v1/chat/attachments/khong-phai-uuid/url`)).statusCode, 400);
  await t.done();
});

test('URL ký: hết hạn sau 5 phút, sai chữ ký, đổi khóa/hạn, thiếu tham số → 403 cùng một mã', async () => {
  const t = await setup();
  const id = await uploadOk(t, t.a, PNG());
  await send(t, t.a, t.cid, 'image', id);
  const { url } = (await call(t, t.b, 'GET', `/v1/chat/attachments/${id}/url`)).json();
  assert.equal((await t.app.inject({ method: 'GET', url })).statusCode, 200);
  const u = new URL(url, 'http://x');
  const k = u.searchParams.get('k');
  const exp = u.searchParams.get('exp');
  const sig = u.searchParams.get('sig');
  const mk = (p) => `/v1/chat/blob?${new URLSearchParams(p).toString()}`;
  const id2 = await uploadOk(t, t.a, PNG());
  const k2 = (await rows(t)).find((x) => x.id === id2).blobKey;
  const tampered = [
    mk({ k, exp, sig: sig.slice(0, -2) + (sig.endsWith('AA') ? 'BB' : 'AA') }),
    mk({ k: k2, exp, sig }), // đổi khóa, giữ chữ ký
    mk({ k, exp: String(Number(exp) + 3600), sig }), // gia hạn lậu
    mk({ k, exp }),
    mk({ k, sig }),
    mk({ exp, sig }),
    mk({ k, exp: 'abc', sig })
  ];
  for (const x of tampered) assert.equal((await t.app.inject({ method: 'GET', url: x })).statusCode, 403, x);
  // chữ ký của miền khác (ký bằng khóa khác) không dùng được
  const other = createChatBlobUrlSigner('z'.repeat(40), () => t.clock.now).sign(k);
  assert.equal((await t.app.inject({ method: 'GET', url: other.url })).statusCode, 403);
  t.clock.now = new Date(Date.now() + 301_000);
  assert.equal((await t.app.inject({ method: 'GET', url })).statusCode, 403, 'hết hạn');
  await t.done();
});

test('khóa lạ (path traversal) dù chữ ký đúng → 404, không chạm kho', async () => {
  const t = await setup();
  for (const k of ['chat/../../etc/passwd', `chat/${t.cid}/../../x.png`, 'feedback/' + randomUUID() + '/' + randomUUID() + '.png', `chat/${t.cid}/${randomUUID()}.exe`, 'chat/%2e%2e/x.png']) {
    const { url } = t.signer.sign(k);
    assert.equal((await t.app.inject({ method: 'GET', url })).statusCode, 404, k);
  }
  // khóa đúng dạng nhưng không có dòng DB => 404
  assert.equal((await t.app.inject({ method: 'GET', url: t.signer.sign(`chat/${t.cid}/${randomUUID()}.png`).url })).statusCode, 404);
  await t.done();
});

test('Range cho giọng nói: đoạn đúng, hậu tố, quá biên 416, đơn vị lạ phục vụ cả tệp', async () => {
  const t = await setup();
  const data = WEBM(1000);
  const id = await uploadOk(t, t.a, data, { durationMs: 1000 });
  await send(t, t.a, t.cid, 'voice', id);
  const { url } = (await call(t, t.b, 'GET', `/v1/chat/attachments/${id}/url`)).json();
  const get = (range) => t.app.inject({ method: 'GET', url, headers: range ? { range } : {} });
  const full = await get();
  assert.equal(full.headers['accept-ranges'], 'bytes');
  assert.equal(full.headers['content-type'], 'audio/webm');
  const part = await get('bytes=10-19');
  assert.equal(part.statusCode, 206);
  assert.equal(part.headers['content-range'], 'bytes 10-19/1000');
  assert.deepEqual(part.rawPayload, data.subarray(10, 20));
  const tail = await get('bytes=-100');
  assert.equal(tail.statusCode, 206);
  assert.deepEqual(tail.rawPayload, data.subarray(900));
  const open = await get('bytes=990-');
  assert.equal(open.headers['content-range'], 'bytes 990-999/1000');
  const clamp = await get('bytes=900-5000');
  assert.equal(clamp.headers['content-range'], 'bytes 900-999/1000');
  for (const r of ['bytes=1000-', 'bytes=2000-3000', 'bytes=5-2', 'bytes=-0', 'bytes=abc']) {
    const x = await get(r);
    assert.equal(x.statusCode, 416, r);
    assert.equal(x.headers['content-range'], 'bytes */1000');
  }
  assert.equal((await get('items=1-2')).statusCode, 200);
  assert.equal((await get('bytes=0-1,5-6')).statusCode, 200);
  await t.done();
});

test('tin thu hồi: người nhận không còn xin được URL, người gửi vẫn xem; tệp được GIỮ để hoàn tác', async () => {
  const t = await setup();
  const id = await uploadOk(t, t.a, PNG());
  const sent = (await send(t, t.a, t.cid, 'image', id)).json();
  assert.equal((await call(t, t.b, 'GET', `/v1/chat/attachments/${id}/url`)).statusCode, 200);
  assert.equal((await call(t, t.a, 'POST', `/v1/chat/messages/${sent.id}/recall`)).statusCode, 204);
  assert.equal((await call(t, t.b, 'GET', `/v1/chat/attachments/${id}/url`)).statusCode, 404);
  assert.equal((await call(t, t.a, 'GET', `/v1/chat/attachments/${id}/url`)).statusCode, 200);
  assert.equal(walk(t.dir).length, 1, 'thu hồi không xóa tệp (hoàn tác được)');
  assert.equal((await call(t, t.a, 'POST', `/v1/chat/messages/${sent.id}/restore`)).statusCode, 204);
  assert.equal((await call(t, t.b, 'GET', `/v1/chat/attachments/${id}/url`)).statusCode, 200);
  await t.done();
});

test('người nhận đã chặn người gửi: không xin được URL của tệp người đó', async () => {
  const t = await setup();
  const id = await uploadOk(t, t.a, PNG());
  await send(t, t.a, t.cid, 'image', id);
  const db = t.db;
  await db.insert(schema.userBlocks).values({ blockerId: t.b.userId, blockedId: t.a.userId });
  assert.equal((await call(t, t.b, 'GET', `/v1/chat/attachments/${id}/url`)).statusCode, 404);
  await t.done();
});

test('trần dung lượng riêng của chat: gửi SONG SONG không vượt trần; 507 storage_full; tin chữ vẫn gửi được', async () => {
  const t = await setup({ CHAT_BLOB_TOTAL_CAP_MB: '3' });
  const rs = await Promise.all(Array.from({ length: 6 }, () => t.upload(t.a, [meta(t.cid), file(PNG(Math.floor(1.2 * MB)))])));
  const ok = rs.filter((r) => r.statusCode === 200).length;
  const full = rs.filter((r) => r.statusCode === 507);
  assert.equal(ok, 2, rs.map((r) => r.statusCode).join());
  assert.equal(ok + full.length, 6);
  assert.equal(full[0].json().error, 'storage_full');
  const all = await rows(t);
  assert.equal(all.length, ok);
  assert.ok(all.reduce((s, x) => s + x.bytes, 0) <= 3 * MB);
  assert.equal(walk(t.dir).length, ok, 'lần bị từ chối không để lại tệp');
  // đầy rồi: ảnh/giọng nói bị từ chối, chữ vẫn nhận
  assert.equal((await t.upload(t.a, [meta(t.cid), file(PNG(Math.floor(1.2 * MB)))])).statusCode, 507);
  assert.equal((await t.upload(t.a, [meta(t.cid), file(OGG(1000))])).statusCode, 200, 'còn chỗ cho tệp nhỏ trong trần');
  assert.equal((await sendText(t, t.a, t.cid, 'vẫn nhắn chữ được')).statusCode, 200);
  assert.equal((await sendText(t, t.b, t.cid, 'chữ của B')).statusCode, 200);
  await t.done();
});

test('trần chat không tính tệp góp ý: dùng số đo riêng của chat', async () => {
  const t = await setup({ CHAT_BLOB_TOTAL_CAP_MB: '3', BLOB_TOTAL_CAP_MB: '1' });
  // BLOB_TOTAL_CAP_MB (góp ý) nhỏ hơn mà chat vẫn nhận: hai trần độc lập
  await uploadOk(t, t.a, PNG(2 * MB));
  await t.done();
});

test('chatBlobUsage và cảnh báo ≥ 80% (một lần mỗi giờ)', async () => {
  const t = await setup();
  const warns = [];
  const meter = new ChatBlobMeter();
  const deps = { db: t.db, blob: t.blob, meter, capBytes: 100_000, onWarning: (u) => warns.push(u) };
  const up = (n) => saveAttachment(deps, { userId: t.a.userId, conversationId: t.cid, meta: {}, first: PNG(n), rest: null, isAborted: () => false, now: t.clock.now });
  await up(50_000);
  assert.equal(warns.length, 0);
  assert.equal((await chatBlobUsage(t.db, 100_000)).warning, false);
  await up(35_000);
  assert.equal(warns.length, 1, 'qua 80%');
  const u = await chatBlobUsage(t.db, 100_000);
  assert.equal(u.usedBytes, 85_000);
  assert.equal(u.warning, true);
  await up(100); // vẫn > 80% nhưng chưa tới 1 giờ: không nhắc lại
  assert.equal(warns.length, 1);
  await assert.rejects(() => up(20_000), (e) => e.statusCode === 507 && e.code === 'storage_full');
  await t.done();
});

test('giới hạn 30 ảnh/ngày → chat_rate; giọng nói đếm riêng; gửi song song vẫn đúng 30', async () => {
  const t = await setup();
  const rs = await Promise.all(Array.from({ length: 34 }, () => t.upload(t.a, [meta(t.cid), file(PNG(100))])));
  assert.equal(rs.filter((r) => r.statusCode === 200).length, 30, rs.map((r) => r.statusCode).join());
  const limited = rs.find((r) => r.statusCode === 429);
  assert.equal(limited.json().error, 'chat_rate');
  assert.equal((await rows(t)).length, 30);
  assert.equal(walk(t.dir).length, 30);
  // giọng nói còn lượt; người khác không bị ảnh hưởng
  assert.equal((await t.upload(t.a, [meta(t.cid), file(OGG())])).statusCode, 200);
  assert.equal((await t.upload(t.b, [meta(t.cid), file(PNG(100))])).statusCode, 200);
  // sang ngày hôm sau (cửa sổ trượt 24 giờ) lại được
  t.clock.now = new Date(Date.now() + 25 * 3600_000);
  assert.equal((await t.upload(t.a, [meta(t.cid), file(PNG(100))])).statusCode, 200);
  await t.done();
});

test('dọn tệp chưa gắn quá 1 giờ: tệp đã gắn, tệp mới, tệp bị báo cáo ghim thì KHÔNG bị dọn', async () => {
  const t = await setup();
  const attached = await uploadOk(t, t.a, PNG());
  await send(t, t.a, t.cid, 'image', attached);
  const stale = await uploadOk(t, t.a, PNG());
  const pinned = await uploadOk(t, t.a, PNG());
  await t.db.update(schema.chatAttachments).set({ pinnedByReport: true }).where(eq(schema.chatAttachments.id, pinned));
  const fresh = await uploadOk(t, t.b, PNG());
  const old = new Date(Date.now() - 2 * 3600_000);
  for (const id of [attached, stale, pinned]) await t.db.update(schema.chatAttachments).set({ createdAt: old }).where(eq(schema.chatAttachments.id, id));
  const n = await purgeUnattachedAttachments(t.db, t.blob, new Date());
  assert.equal(n, 1);
  const byId = Object.fromEntries((await rows(t)).map((r) => [r.id, r]));
  assert.ok(byId[stale].purgedAt);
  assert.equal(byId[attached].purgedAt, null);
  assert.equal(byId[pinned].purgedAt, null);
  assert.equal(byId[fresh].purgedAt, null);
  assert.equal(walk(t.dir).length, 3);
  assert.equal((await t.db.select().from(schema.blobDeletions)).length, 0);
  // đã dọn: không gắn được, không xin URL được
  assert.equal((await send(t, t.a, t.cid, 'image', stale)).statusCode, 400);
  assert.equal((await call(t, t.a, 'GET', `/v1/chat/attachments/${stale}/url`)).statusCode, 404);
  // chạy lại: idempotent
  assert.equal(await purgeUnattachedAttachments(t.db, t.blob, new Date()), 0);
  await t.done();
});

test('xóa tệp lỗi → còn dòng blob_deletions, lần sau thử lại và xong (hàng đợi không tắc vì một khóa hỏng)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca-'));
  const real = createBlobStore({ BLOB_PROVIDER: 'fs', BLOB_DIR: dir });
  let failFor = null;
  const flaky = {
    put: (...a) => real.put(...a),
    get: (...a) => real.get(...a),
    totalBytes: () => real.totalBytes(),
    sweepTemp: (...a) => real.sweepTemp(...a),
    delete: async (k) => {
      if (k === failFor || k.endsWith('/poison.png')) throw new Error('kho lỗi');
      return real.delete(k);
    }
  };
  const t = await setup({}, { blob: flaky });
  const id = await uploadOk(t, t.a, PNG());
  const key = (await rows(t))[0].blobKey;
  // một khóa độc luôn lỗi nằm trong hàng đợi từ trước
  await t.db.insert(schema.blobDeletions).values({ blobKey: `chat/${t.cid}/poison.png`, reason: 'test' });
  failFor = key;
  await t.db.update(schema.chatAttachments).set({ createdAt: new Date(Date.now() - 2 * 3600_000) }).where(eq(schema.chatAttachments.id, id));
  await purgeUnattachedAttachments(t.db, flaky, new Date());
  const left = await t.db.select().from(schema.blobDeletions);
  assert.ok(left.some((r) => r.blobKey === key), 'khóa lỗi còn trong hàng đợi');
  assert.equal(walk(dir).length, 1, 'tệp chưa xóa được');
  failFor = null;
  const res = await runChatBlobMaintenance(t.db, flaky, new Date());
  assert.ok(res.retried >= 1);
  assert.equal(walk(dir).length, 0, 'thử lại xong');
  const after = await t.db.select().from(schema.blobDeletions);
  assert.deepEqual(after.map((r) => r.blobKey), [`chat/${t.cid}/poison.png`], 'chỉ còn khóa độc, khóa tốt đã đi');
  await t.done();
  rmSync(dir, { recursive: true, force: true });
});

test('dọn .tmp/ cũ (tiến trình chết giữa lúc ghi), giữ tệp tạm mới', async () => {
  const t = await setup();
  const tmp = join(t.dir, '.tmp');
  mkdirSync(tmp, { recursive: true });
  writeFileSync(join(tmp, 'cu'), 'x');
  writeFileSync(join(tmp, 'moi'), 'y');
  const old = new Date(Date.now() - 3 * 3600_000);
  utimesSync(join(tmp, 'cu'), old, old);
  const res = await runChatBlobMaintenance(t.db, t.blob, new Date());
  assert.equal(res.temp, 1);
  assert.deepEqual(readdirSync(tmp), ['moi']);
  await t.done();
});

test('xóa tài khoản: tệp của người đó bị xóa thật, tin thành account_deleted, cuộc trò chuyện của người kia nguyên vẹn; tệp ghim được giữ', async () => {
  const t = await setup();
  const a1 = await uploadOk(t, t.a, PNG());
  const pinned = await uploadOk(t, t.a, PNG());
  const unattached = await uploadOk(t, t.a, OGG());
  const b1 = await uploadOk(t, t.b, PNG());
  const m1 = (await send(t, t.a, t.cid, 'image', a1)).json();
  const mp = (await send(t, t.a, t.cid, 'image', pinned)).json();
  await send(t, t.b, t.cid, 'image', b1);
  await t.db.update(schema.chatAttachments).set({ pinnedByReport: true }).where(eq(schema.chatAttachments.id, pinned));
  const ok = await purgeUserChatAttachments(t.db, t.blob, t.a.userId, new Date());
  assert.equal(ok, true);
  const byId = Object.fromEntries((await rows(t)).map((r) => [r.id, r]));
  assert.ok(byId[a1].purgedAt && byId[unattached].purgedAt);
  assert.equal(byId[pinned].purgedAt, null, 'bằng chứng báo cáo được giữ');
  assert.equal(byId[b1].purgedAt, null);
  assert.equal(walk(t.dir).length, 2);
  const msgs = Object.fromEntries((await t.db.select().from(schema.chatMessages)).map((m) => [m.id, m]));
  assert.equal(msgs[m1.id].attachmentId, null);
  assert.equal(msgs[m1.id].deletedKind, 'account_deleted');
  assert.equal(msgs[mp.id].attachmentId, pinned);
  // người kia vẫn đọc được cuộc trò chuyện (tin của A chỉ còn là "đã xóa")
  const page = (await call(t, t.b, 'GET', `/v1/chat/conversations/${t.cid}/messages`)).json();
  assert.equal(page.messages.length, 3);
  assert.equal(page.messages.find((m) => m.id === m1.id).attachment, undefined);
  assert.equal((await call(t, t.b, 'GET', `/v1/chat/attachments/${a1}/url`)).statusCode, 404);
  // và gói kèm xóa người dùng trong CÙNG transaction: lỗi ở deleteUser => không đổi gì
  const before = (await rows(t)).filter((r) => !r.purgedAt).length;
  await assert.rejects(() =>
    purgeUserChatAttachments(t.db, t.blob, t.b.userId, new Date(), async () => {
      throw new Error('xóa user lỗi');
    })
  );
  assert.equal((await rows(t)).filter((r) => !r.purgedAt).length, before, 'rollback: không mất tệp khi xóa user thất bại');
  assert.equal(walk(t.dir).length, 2);
  await t.done();
});

test('CHAT_ENABLED=false → upload/url/blob đều 404', async () => {
  const t = await chatApp({ CHAT_ENABLED: 'false', CHAT_BLOB_URL_SECRET: SECRET });
  const a = await person(t, 'An');
  const f = form([meta(randomUUID()), file(PNG())]);
  assert.equal((await t.app.inject({ method: 'POST', url: '/v1/chat/attachments', headers: { ...a.headers, ...f.headers }, payload: f.payload })).statusCode, 404);
  assert.equal((await call(t, a, 'GET', `/v1/chat/attachments/${randomUUID()}/url`)).statusCode, 404);
  assert.equal((await t.app.inject({ method: 'GET', url: createChatBlobUrlSigner(SECRET, () => new Date()).sign(`chat/${randomUUID()}/${randomUUID()}.png`).url })).statusCode, 404);
  await t.close();
});

test('production tắt chat, không có CHAT_BLOB_URL_SECRET: Gateway vẫn khởi động', async () => {
  const { makeApp } = await import('./helpers.mjs');
  const long = (c) => c.repeat(40);
  const app = await makeApp({ NODE_ENV: 'production', CHAT_ENABLED: 'false', JWT_SECRET: long('a'), AUDIT_IP_SALT: long('b'), AUTH_OTP_PEPPER: long('c'), PGLITE_DIR: 'memory://' });
  await app.close();
});
