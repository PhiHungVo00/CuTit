import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { schema } from '../dist/db/client.js';
import { chatApp, person, befriend, openDm, sendHttp, call } from './chat-helpers.mjs';
import { createPushProvider } from '../dist/services/push/PushProvider.js';
import { FcmProvider } from '../dist/services/push/fcmProvider.js';
import { buildPayload, buildCallPayload } from '../dist/services/push/payload.js';
import { purgeStalePushTokens, PUSH_TOKENS_PER_USER } from '../dist/services/push/tokens.js';
import { startPushNotifier } from '../dist/services/push/notify.js';

/** Nhà cung cấp giả: ghi lại mọi lần gửi; `behavior` tùy chỉnh kết quả */
function fakeProvider(behavior) {
  const sent = [];
  return {
    name: 'fake',
    sent,
    send: async (tokens, msg) => {
      sent.push({ tokens: [...tokens], msg });
      return behavior ? behavior(tokens, msg, sent.length) : { invalid: [] };
    }
  };
}

const tok = () => `tok-${randomUUID()}-${randomUUID()}`.slice(0, 80);
const reg = (t, u, token = tok(), extra = {}) => call(t, u, 'POST', '/v1/chat/push-tokens', { token, platform: 'android', appBuild: 1, locale: 'vi', ...extra });

async function setup(provider = fakeProvider(), pushOpts = {}) {
  const t = await chatApp({}, { push: { provider, delayMs: 600_000, retryDelaysMs: [0, 0], ...pushOpts } });
  const a = await person(t, 'An');
  const b = await person(t, 'Bình');
  const cid = await openDm(t, a, b);
  return { t, a, b, cid, provider };
}
const tokensOf = async (t, userId) => (await (await t.dbp.get()).select().from(schema.pushTokens).where(eq(schema.pushTokens.userId, userId)));

// ---------- đăng ký / hủy token ----------
test('token: đăng ký, đăng ký lặp không nhân đôi, hủy; token người khác chuyển sang người mới', async () => {
  const { t, a, b } = await setup();
  try {
    const token = tok();
    assert.equal((await reg(t, a, token)).statusCode, 204);
    assert.equal((await reg(t, a, token, { appBuild: 7 })).statusCode, 204);
    let rows = await tokensOf(t, a.userId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].appBuild, 7);
    // cùng máy đăng nhập người khác ⇒ token chuyển sang b (một thiết bị một người)
    assert.equal((await reg(t, b, token)).statusCode, 204);
    assert.equal((await tokensOf(t, a.userId)).length, 0);
    assert.equal((await tokensOf(t, b.userId)).length, 1);
    // a xóa token của b ⇒ vẫn 204 nhưng KHÔNG xóa được
    assert.equal((await call(t, a, 'DELETE', `/v1/chat/push-tokens/${token}`)).statusCode, 204);
    assert.equal((await tokensOf(t, b.userId)).length, 1);
    assert.equal((await call(t, b, 'DELETE', `/v1/chat/push-tokens/${token}`)).statusCode, 204);
    assert.equal((await tokensOf(t, b.userId)).length, 0);
    // token lạ: vẫn 204 (không lộ)
    assert.equal((await call(t, b, 'DELETE', `/v1/chat/push-tokens/${tok()}`)).statusCode, 204);
  } finally {
    await t.close();
  }
});

test('token: vượt trần thì bỏ token cũ nhất của chính người đó; không đụng token người khác', async () => {
  const { t, a, b } = await setup();
  try {
    const bTok = tok();
    await reg(t, b, bTok);
    const first = tok();
    await reg(t, a, first);
    for (let i = 0; i < PUSH_TOKENS_PER_USER + 3; i++) assert.equal((await reg(t, a)).statusCode, 204);
    const rows = await tokensOf(t, a.userId);
    assert.equal(rows.length, PUSH_TOKENS_PER_USER);
    assert.ok(!rows.some((r) => r.token === first), 'token cũ nhất bị bỏ');
    assert.equal((await tokensOf(t, b.userId)).length, 1);
  } finally {
    await t.close();
  }
});

test('token: dữ liệu sai ⇒ 400; chưa đăng nhập ⇒ 401; khách/không đủ điều kiện không đăng ký được', async () => {
  const { t, a } = await setup();
  try {
    assert.equal((await call(t, a, 'POST', '/v1/chat/push-tokens', { token: 'ngan', platform: 'android', appBuild: 1, locale: 'vi' })).statusCode, 400);
    assert.equal((await call(t, a, 'POST', '/v1/chat/push-tokens', { token: tok(), platform: 'ios', appBuild: 1, locale: 'vi' })).statusCode, 400);
    assert.equal((await t.app.inject({ method: 'POST', url: '/v1/chat/push-tokens', payload: { token: tok(), platform: 'android', appBuild: 1, locale: 'vi' } })).statusCode, 401);
    t.gate.set(a.userId, 'minor');
    const r = await reg(t, a);
    assert.equal(r.statusCode, 403);
    assert.equal((await tokensOf(t, a.userId)).length, 0);
    // mất tư cách vẫn HỦY được token (đăng xuất)
    t.gate.set(a.userId, null);
    const token = tok();
    await reg(t, a, token);
    t.gate.set(a.userId, 'minor');
    assert.equal((await call(t, a, 'DELETE', `/v1/chat/push-tokens/${token}`)).statusCode, 204);
    assert.equal((await tokensOf(t, a.userId)).length, 0);
  } finally {
    await t.close();
  }
});

// ---------- quy tắc gửi ----------
test('gửi: người nhận offline ⇒ đẩy ĐÚNG MỘT lần, gộp nhiều tin cùng cuộc, nội dung mặc định ẩn', async () => {
  const { t, a, b, cid, provider } = await setup();
  try {
    const bTok = tok();
    await reg(t, b, bTok);
    assert.equal((await sendHttp(t, a, cid, 'bí mật số một')).statusCode, 200);
    assert.equal((await sendHttp(t, a, cid, 'bí mật số hai')).statusCode, 200);
    assert.equal(provider.sent.length, 0, 'chưa gửi trong lúc chờ 3 giây');
    await t.app.push.flush();
    assert.equal(provider.sent.length, 1);
    const { tokens, msg } = provider.sent[0];
    assert.deepEqual(tokens, [bTok]);
    assert.equal(msg.body, 'Tin nhắn mới từ An');
    assert.ok(!JSON.stringify(msg).includes('bí mật'), 'nội dung không lộ trong payload mặc định');
    assert.equal(msg.collapseKey, `cid:${cid}`);
    assert.equal(msg.data.type, 'msg');
    assert.equal(msg.data.cid, cid);
    // người GỬI không nhận push về tin của chính mình
    await reg(t, a);
    await sendHttp(t, a, cid, 'ba');
    await t.app.push.flush();
    assert.equal(provider.sent.length, 2);
    assert.ok(provider.sent[1].tokens.every((x) => x === bTok));
  } finally {
    await t.close();
  }
});

test('gửi: bật show_push_preview ⇒ có chữ; ảnh/giọng nói luôn chỉ "đã gửi ảnh"', async () => {
  const { t, a, b, cid, provider } = await setup();
  try {
    await reg(t, b);
    const db = await t.dbp.get();
    await db.update(schema.socialProfiles).set({ showPushPreview: true }).where(eq(schema.socialProfiles.userId, b.userId));
    await sendHttp(t, a, cid, 'xin chào bạn');
    await t.app.push.flush();
    assert.equal(provider.sent[0].msg.body, 'An: xin chào bạn');
  } finally {
    await t.close();
  }
  // đơn vị: ảnh/giọng nói, en, ký tự điều khiển, cắt độ dài, cuộc gọi
  const base = { cid: randomUUID(), fromName: 'An' };
  assert.equal(buildPayload({ ...base, kind: 'image', body: 'lộ' }, { showPreview: true, locale: 'vi' }).body, 'An đã gửi ảnh');
  assert.equal(buildPayload({ ...base, kind: 'voice' }, { showPreview: true, locale: 'vi' }).body, 'An đã gửi tin nhắn thoại');
  assert.equal(buildPayload({ ...base, kind: 'image' }, { showPreview: true, locale: 'en' }).body, 'An sent a photo');
  assert.equal(buildPayload({ ...base, kind: 'text', body: 'hi' }, { showPreview: false, locale: 'en' }).body, 'New message from An');
  const long = buildPayload({ ...base, kind: 'text', body: `x\u0000‮${'y'.repeat(500)}` }, { showPreview: true, locale: 'vi' });
  assert.ok(long.body.length < 130 && !/[\u0000‮]/.test(long.body));
  const c = buildCallPayload({ callId: randomUUID(), fromName: 'An' }, { locale: 'vi' });
  assert.equal(c.priority, 'high');
  assert.equal(c.ttlSec, 30);
  assert.equal(c.channel, 'calls');
});

test('gửi: có WS nền trước ⇒ KHÔNG đẩy; ra nền ⇒ đẩy', async () => {
  const { t, a, b, cid, provider } = await setup();
  try {
    await reg(t, b);
    t.bus.setOnline(b.userId, true, true);
    await sendHttp(t, a, cid, 'một');
    await t.app.push.flush();
    assert.equal(provider.sent.length, 0);
    // vào nền trong lúc chờ 3 giây ⇒ vẫn đẩy; ngược lại vào nền trước trong lúc chờ ⇒ không đẩy
    t.bus.setOnline(b.userId, true, false);
    await sendHttp(t, a, cid, 'hai');
    t.bus.setOnline(b.userId, true, true);
    await t.app.push.flush();
    assert.equal(provider.sent.length, 0, 'lên nền trước trong lúc chờ ⇒ bỏ');
    t.bus.setOnline(b.userId, false);
    await sendHttp(t, a, cid, 'ba');
    await t.app.push.flush();
    assert.equal(provider.sent.length, 1);
  } finally {
    await t.close();
  }
});

test('gửi: đã đọc trong lúc chờ ⇒ không đẩy', async () => {
  const { t, a, b, cid, provider } = await setup();
  try {
    await reg(t, b);
    const r = await sendHttp(t, a, cid, 'đọc đi');
    const seq = r.json().seq;
    assert.equal((await call(t, b, 'POST', `/v1/chat/conversations/${cid}/read`, { seq })).statusCode, 204);
    await t.app.push.flush();
    assert.equal(provider.sent.length, 0);
  } finally {
    await t.close();
  }
});

test('gửi: tắt tiếng, đã chặn người gửi, người nhận hết đủ điều kiện, chưa có token ⇒ không đẩy', async () => {
  const { t, a, b, cid, provider } = await setup();
  try {
    // chưa có token
    await sendHttp(t, a, cid, 'x1');
    await t.app.push.flush();
    assert.equal(provider.sent.length, 0);
    await reg(t, b);
    // tắt tiếng
    const future = new Date(Date.now() + 3600_000).toISOString();
    assert.equal((await call(t, b, 'PUT', `/v1/chat/conversations/${cid}/mute`, { mutedUntil: future })).statusCode, 204);
    await sendHttp(t, a, cid, 'x2');
    await t.app.push.flush();
    assert.equal(provider.sent.length, 0);
    await call(t, b, 'PUT', `/v1/chat/conversations/${cid}/mute`, { mutedUntil: null });
    // hết đủ điều kiện (vd. dưới 18 / đang chờ xóa)
    t.gate.set(b.userId, 'minor');
    await sendHttp(t, a, cid, 'x3');
    await t.app.push.flush();
    assert.equal(provider.sent.length, 0);
    t.gate.set(b.userId, null);
    // chặn xảy ra SAU khi tin đã vào hàng chờ
    await sendHttp(t, a, cid, 'x4');
    const db = await t.dbp.get();
    await db.insert(schema.userBlocks).values({ blockerId: b.userId, blockedId: a.userId });
    await t.app.push.flush();
    assert.equal(provider.sent.length, 0);
  } finally {
    await t.close();
  }
});

test('gửi: nhóm ≥ ngưỡng thành viên tắt mặc định; nhóm nhỏ vẫn đẩy', async () => {
  const provider = fakeProvider();
  const { t, a, b } = await setup(provider, { largeGroupMembers: 3 });
  try {
    const c = await person(t, 'Chi');
    await reg(t, b);
    const db = await t.dbp.get();
    const mk = async (members) => {
      const [g] = await db.insert(schema.conversations).values({ kind: 'group', title: 'Nhóm', createdBy: a.userId }).returning({ id: schema.conversations.id });
      await db.insert(schema.conversationMembers).values(members.map((u, i) => ({ conversationId: g.id, userId: u.userId, role: i === 0 ? 'owner' : 'member' })));
      return g.id;
    };
    const small = await mk([a, b]);
    const big = await mk([a, b, c]);
    await sendHttp(t, a, big, 'nhóm lớn');
    await t.app.push.flush();
    assert.equal(provider.sent.length, 0);
    await sendHttp(t, a, small, 'nhóm nhỏ');
    await t.app.push.flush();
    assert.equal(provider.sent.length, 1);
  } finally {
    await t.close();
  }
});

// ---------- lỗi nhà cung cấp ----------
test('nhà cung cấp trả token chết ⇒ token bị vô hiệu, lần sau không gửi lại', async () => {
  const dead = tok();
  const provider = fakeProvider((tokens) => ({ invalid: tokens.filter((x) => x === dead) }));
  const { t, a, b, cid } = await setup(provider);
  try {
    const live = tok();
    await reg(t, b, dead);
    await reg(t, b, live);
    await sendHttp(t, a, cid, 'một');
    await t.app.push.flush();
    assert.deepEqual([...provider.sent[0].tokens].sort(), [dead, live].sort());
    const rows = await tokensOf(t, b.userId);
    assert.ok(rows.find((r) => r.token === dead).disabledAt);
    assert.equal(rows.find((r) => r.token === live).disabledAt, null);
    await sendHttp(t, a, cid, 'hai');
    await t.app.push.flush();
    assert.deepEqual(provider.sent[1].tokens, [live]);
    // đăng ký lại token chết thì bật lại
    await reg(t, b, dead);
    assert.equal((await tokensOf(t, b.userId)).find((r) => r.token === dead).disabledAt, null);
  } finally {
    await t.close();
  }
});

test('nhà cung cấp ném lỗi ⇒ gửi tin vẫn 200, thử lại có giới hạn rồi bỏ', async () => {
  const provider = fakeProvider(() => {
    throw new Error('FCM sập');
  });
  const { t, a, b, cid } = await setup(provider);
  try {
    await reg(t, b);
    const r = await sendHttp(t, a, cid, 'vẫn gửi được');
    assert.equal(r.statusCode, 200);
    await t.app.push.flush();
    assert.equal(provider.sent.length, 3, '1 lần đầu + 2 lần thử lại (retryDelaysMs có 2 phần tử)');
    const again = await sendHttp(t, a, cid, 'và tiếp');
    assert.equal(again.statusCode, 200);
  } finally {
    await t.close();
  }
});

test('token gặp lỗi tạm được thử lại, chỉ gửi lại đúng token đó', async () => {
  const flaky = tok();
  const provider = fakeProvider((tokens, _m, n) => (n === 1 ? { invalid: [], retry: tokens.filter((x) => x === flaky) } : { invalid: [] }));
  const { t, a, b, cid } = await setup(provider);
  try {
    await reg(t, b, flaky);
    await reg(t, b);
    await sendHttp(t, a, cid, 'x');
    await t.app.push.flush();
    assert.equal(provider.sent.length, 2);
    assert.deepEqual(provider.sent[1].tokens, [flaky]);
  } finally {
    await t.close();
  }
});

test('mẻ gửi ≤ 500 token/lần', async () => {
  const provider = fakeProvider();
  const { t, a, b, cid } = await setup(provider);
  try {
    const db = await t.dbp.get();
    await db.insert(schema.pushTokens).values(Array.from({ length: 1100 }, () => ({ userId: b.userId, token: tok(), platform: 'android', locale: 'vi' })));
    await sendHttp(t, a, cid, 'đông');
    await t.app.push.flush();
    assert.deepEqual(provider.sent.map((s) => s.tokens.length), [500, 500, 100]);
  } finally {
    await t.close();
  }
});

test('tắt máy: stop() hủy việc đang chờ, không gửi sau đó', async () => {
  const { t, a, b, cid, provider } = await setup();
  await reg(t, b);
  await sendHttp(t, a, cid, 'x');
  await t.close();
  assert.equal(provider.sent.length, 0);
});

test('dọn token mồ côi: chết > 7 ngày hoặc không thấy > 60 ngày', async () => {
  const { t, b } = await setup();
  try {
    const db = await t.dbp.get();
    const now = new Date();
    const ago = (d) => new Date(now.getTime() - d * 86_400_000);
    const rows = [
      { token: tok(), disabledAt: ago(8), lastSeenAt: ago(8), keep: false },
      { token: tok(), disabledAt: ago(1), lastSeenAt: ago(1), keep: true },
      { token: tok(), disabledAt: null, lastSeenAt: ago(61), keep: false },
      { token: tok(), disabledAt: null, lastSeenAt: ago(5), keep: true }
    ];
    await db.insert(schema.pushTokens).values(rows.map((r) => ({ userId: b.userId, token: r.token, platform: 'android', locale: 'vi', disabledAt: r.disabledAt, lastSeenAt: r.lastSeenAt })));
    assert.equal(await purgeStalePushTokens(db, now), 2);
    const left = new Set((await tokensOf(t, b.userId)).map((r) => r.token));
    for (const r of rows) assert.equal(left.has(r.token), r.keep);
  } finally {
    await t.close();
  }
});

// ---------- FCM thật (fetch giả) + khóa không lộ ----------
function fakeServiceAccount() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  return { type: 'service_account', project_id: 'proj-test', client_email: 'sa@proj-test.iam.gserviceaccount.com', private_key: privateKey };
}
const msgOf = () => buildPayload({ cid: randomUUID(), kind: 'text', body: 'x', fromName: 'An' }, { showPreview: false, locale: 'vi' });

test('FCM: ký JWT, gọi HTTP v1, phân loại lỗi (UNREGISTERED/INVALID_ARGUMENT ⇒ invalid; 5xx ⇒ retry)', async () => {
  const sa = fakeServiceAccount();
  const calls = [];
  const fetchStub = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('oauth2')) return new Response(JSON.stringify({ access_token: 'AT-1', expires_in: 3600 }), { status: 200 });
    const body = JSON.parse(init.body);
    const tk = body.message.token;
    if (tk === 'dead') return new Response(JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }] } }), { status: 404 });
    if (tk === 'bad') return new Response(JSON.stringify({ error: { status: 'INVALID_ARGUMENT', details: [{ '@type': 'type.googleapis.com/google.rpc.BadRequest', fieldViolations: [{ field: 'message.token' }] }] } }), { status: 400 });
    if (tk === 'wrongproject') return new Response(JSON.stringify({ error: { status: 'NOT_FOUND' } }), { status: 404 });
    if (tk === 'badpayload') return new Response(JSON.stringify({ error: { status: 'INVALID_ARGUMENT', details: [{ fieldViolations: [{ field: 'message.android.ttl' }] }] } }), { status: 400 });
    if (tk === 'flaky') return new Response('{}', { status: 503 });
    return new Response('{}', { status: 200 });
  };
  const p = new FcmProvider(sa, { fetch: fetchStub });
  const r = await p.send(['ok', 'dead', 'bad', 'flaky', 'wrongproject', 'badpayload'], { ...msgOf(), priority: 'high', ttlSec: 30 });
  // 404 không UNREGISTERED (sai project_id) và 400 sai payload KHÔNG được coi là token chết, cũng không thử lại
  assert.deepEqual(r.invalid.sort(), ['bad', 'dead']);
  assert.deepEqual(r.retry, ['flaky']);
  assert.equal(r.config, 2, 'đếm lỗi cấu hình/nội dung để cảnh báo');
  const auth = calls.find((c) => c.url.includes('oauth2'));
  const jwt = new URLSearchParams(auth.init.body.toString()).get('assertion');
  assert.equal(jwt.split('.').length, 3);
  assert.equal(JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url')).iss, sa.client_email);
  const send = calls.find((c) => c.url.includes('fcm.googleapis.com/v1/projects/proj-test/messages:send'));
  assert.equal(send.init.headers.authorization, 'Bearer AT-1');
  const sent = JSON.parse(send.init.body).message;
  assert.equal(sent.android.priority, 'HIGH');
  assert.equal(sent.android.ttl, '30s');
  // token truy cập được dùng lại (một lần xin)
  await p.send(['ok'], msgOf());
  assert.equal(calls.filter((c) => c.url.includes('oauth2')).length, 1);
});

test('FCM: xin token truy cập hỏng ⇒ ném lỗi RÚT GỌN, không chứa khóa; app vẫn gửi tin được và log sạch khóa', async () => {
  const sa = fakeServiceAccount();
  const dir = mkdtempSync(join(tmpdir(), 'fcm-test-'));
  const file = join(dir, 'sa.json');
  writeFileSync(file, JSON.stringify(sa));
  const lines = [];
  const stream = new Writable({ write: (c, _e, cb) => (lines.push(c.toString()), cb()) });
  const secretBits = [sa.private_key, sa.private_key.split('\n')[1], sa.client_email];
  const fetchStub = async (url) => {
    if (String(url).includes('oauth2')) throw new Error(`boom ${sa.private_key}`); // lỗi mạng cố tình mang khóa
    return new Response('{}', { status: 200 });
  };
  const logCollector = { info: (o, m) => lines.push(JSON.stringify([o, m])), warn: (o, m) => lines.push(JSON.stringify([o, m])) };
  const provider = createPushProvider({ PUSH_PROVIDER: 'fcm', FCM_SERVICE_ACCOUNT_FILE: file }, logCollector, fetchStub);
  assert.equal(provider.name, 'fcm');
  const t = await chatApp({ PUSH_PROVIDER: 'fcm', FCM_SERVICE_ACCOUNT_FILE: file }, { logger: { level: 'trace', stream }, push: { provider, delayMs: 600_000, retryDelaysMs: [0] } });
  try {
    const a = await person(t, 'An');
    const b = await person(t, 'Bình');
    const cid = await openDm(t, a, b);
    await reg(t, b);
    const r = await sendHttp(t, a, cid, 'vẫn gửi');
    assert.equal(r.statusCode, 200);
    await t.app.push.flush();
    // chính provider ném lỗi gì?
    await assert.rejects(provider.send(['x'], msgOf()), (e) => {
      for (const s of secretBits) assert.ok(!String(e.message).includes(s) && !String(e.stack).includes(s));
      return e.name === 'PushError';
    });
    const all = lines.join('\n');
    for (const s of secretBits) assert.ok(!all.includes(s), 'khóa không xuất hiện trong log');
    assert.ok(!all.includes('BEGIN PRIVATE KEY'));
  } finally {
    await t.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createPushProvider: none ⇒ null; fcm thiếu/hỏng tệp khóa ⇒ rơi về log, không sập', async () => {
  const warns = [];
  const log = { info: () => {}, warn: (_o, m) => warns.push(m) };
  assert.equal(createPushProvider({ PUSH_PROVIDER: 'none' }, log), null);
  assert.equal(createPushProvider({ PUSH_PROVIDER: 'log' }, log).name, 'log');
  assert.equal(createPushProvider({ PUSH_PROVIDER: 'fcm' }, log).name, 'log');
  assert.equal(createPushProvider({ PUSH_PROVIDER: 'fcm', FCM_SERVICE_ACCOUNT_FILE: join(tmpdir(), 'khong-ton-tai.json') }, log).name, 'log');
  const dir = mkdtempSync(join(tmpdir(), 'fcm-test-'));
  try {
    const f = join(dir, 'bad.json');
    writeFileSync(f, '{"hello":"world"}');
    assert.equal(createPushProvider({ PUSH_PROVIDER: 'fcm', FCM_SERVICE_ACCOUNT_FILE: f }, log).name, 'log');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(warns.length, 3);
  assert.ok(!warns.join('').includes('world'));
});

test('nhật ký truy cập không chứa token thiết bị trong URL DELETE', async () => {
  const lines = [];
  const stream = new Writable({ write: (c, _e, cb) => (lines.push(c.toString()), cb()) });
  const t = await chatApp({}, { logger: { level: 'info', stream }, push: { provider: fakeProvider(), delayMs: 600_000 } });
  try {
    const a = await person(t, 'An');
    const token = tok();
    await call(t, a, 'DELETE', `/v1/chat/push-tokens/${token}`);
    assert.ok(!lines.join('').includes(token));
  } finally {
    await t.close();
  }
});

test('token FCM thật dài (~163 ký tự) đăng ký và hủy được qua đường dẫn DELETE', async () => {
  const { t, a } = await setup();
  try {
    const token = `${'a'.repeat(22)}:APA91b${'x'.repeat(134)}`;
    assert.equal(token.length, 163);
    assert.equal((await reg(t, a, token)).statusCode, 204);
    assert.equal((await tokensOf(t, a.userId)).length, 1);
    assert.equal((await call(t, a, 'DELETE', `/v1/chat/push-tokens/${token}`)).statusCode, 204);
    assert.equal((await tokensOf(t, a.userId)).length, 0);
  } finally {
    await t.close();
  }
});

test('thu hồi trong lúc chờ 3 giây ⇒ KHÔNG đẩy (kể cả khi bật xem trước)', async () => {
  const { t, a, b, cid, provider } = await setup();
  try {
    await reg(t, b);
    const db = await t.dbp.get();
    await db.update(schema.socialProfiles).set({ showPushPreview: true }).where(eq(schema.socialProfiles.userId, b.userId));
    const r = await sendHttp(t, a, cid, 'MAT KHAU LA 123456');
    const id = r.json().id;
    assert.equal((await call(t, a, 'POST', `/v1/chat/messages/${id}/recall`)).statusCode, 204);
    await t.app.push.flush();
    assert.equal(provider.sent.length, 0);
    assert.ok(!JSON.stringify(provider.sent).includes('MAT KHAU'));
  } finally {
    await t.close();
  }
});

test('gộp nhiều tin: tin mới nhất bị thu hồi thì không đẩy tin cũ kèm nội dung của tin mới', async () => {
  const { t, a, b, cid, provider } = await setup();
  try {
    await reg(t, b);
    const db = await t.dbp.get();
    await db.update(schema.socialProfiles).set({ showPushPreview: true }).where(eq(schema.socialProfiles.userId, b.userId));
    await sendHttp(t, a, cid, 'tin cu');
    const r = await sendHttp(t, a, cid, 'tin bi mat');
    await call(t, a, 'POST', `/v1/chat/messages/${r.json().id}/recall`);
    await t.app.push.flush();
    assert.ok(!JSON.stringify(provider.sent).includes('bi mat'));
  } finally {
    await t.close();
  }
});

test('FCM: làm mới token truy cập đồng thời chỉ gọi OAuth một lần', async () => {
  const sa = fakeServiceAccount();
  let oauth = 0;
  const fetchStub = async (url) => {
    if (String(url).includes('oauth2')) {
      oauth++;
      await new Promise((r) => setTimeout(r, 20));
      return new Response(JSON.stringify({ access_token: 'AT', expires_in: 3600 }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  };
  const p = new FcmProvider(sa, { fetch: fetchStub });
  await Promise.all([p.send(['a'], msgOf()), p.send(['b'], msgOf()), p.send(['c'], msgOf())]);
  assert.equal(oauth, 1);
});
