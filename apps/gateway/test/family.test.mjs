import test from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { encodeWav } from '@vietlearning/audio-dsp';
import {
  AccountInfoSchema,
  AnalyticsSummaryResponseSchema,
  AuthTokensSchema,
  ChildListResponseSchema,
  ChildProfileSchema,
  QuotaStatusSchema,
  FAMILY_ERROR,
  MAX_CHILDREN
} from '@vietlearning/contracts/api';
import { createDbProvider, schema } from '../dist/db/client.js';
import { makeApp, guest } from './helpers.mjs';

/**
 * GĐ4b — Chế độ trẻ em (D4): Gateway ép luật theo account_type, client chỉ là lớp ngoài.
 */
const SECRET = 'k'.repeat(40);
const SID = '7d444840-9dc0-11d1-b245-5ffdce74fad2';
const bearer = (t) => ({ authorization: `Bearer ${t}` });
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]).toString('base64');
const wav = Buffer.from(encodeWav(new Float32Array(16000).fill(0.1), 16000));

function multipart(parts) {
  const boundary = '----vl' + Math.random().toString(16).slice(2);
  const chunks = [];
  for (const p of parts) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"`;
    if (p.filename) head += `; filename="${p.filename}"\r\nContent-Type: ${p.type}`;
    chunks.push(Buffer.from(head + '\r\n\r\n'), Buffer.isBuffer(p.data) ? p.data : Buffer.from(String(p.data)), Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
const audioPart = [{ name: 'audio', filename: 'a.wav', type: 'audio/wav', data: wav }];

/** Phụ huynh + một hồ sơ trẻ (token trẻ do phụ huynh cấp) */
async function family(a) {
  const parent = await guest(a);
  const created = await a.inject({ method: 'POST', url: '/v1/family/children', headers: parent.headers });
  assert.equal(created.statusCode, 200, created.body);
  const child = ChildProfileSchema.parse(created.json());
  const s = await a.inject({ method: 'POST', url: `/v1/family/children/${child.userId}/session`, headers: parent.headers });
  assert.equal(s.statusCode, 200, s.body);
  const tokens = AuthTokensSchema.parse(s.json());
  assert.equal(tokens.userId, child.userId);
  return { parent, child, tokens, childHeaders: bearer(tokens.accessToken) };
}

const turn = (a, headers, extra = {}) =>
  a.inject({ method: 'POST', url: '/v1/chat/turn', headers, payload: { sessionId: SID, userText: 'xin chào', ...extra } });
const transcribe = (a, headers) => {
  const m = multipart(audioPart);
  return a.inject({ method: 'POST', url: '/v1/speech/transcribe', payload: m.payload, headers: { ...headers, ...m.headers } });
};
const assess = (a, headers) => {
  const m = multipart([...audioPart, { name: 'expectedText', data: 'xin chào' }]);
  return a.inject({ method: 'POST', url: '/v1/speech/assess', payload: m.payload, headers: { ...headers, ...m.headers } });
};
const vision = (a, headers) => a.inject({ method: 'POST', url: '/v1/vision/label', headers, payload: { imageBase64: jpeg } });
const setConsent = (a, f, media) =>
  a.inject({ method: 'PUT', url: `/v1/family/children/${f.child.userId}/consent`, headers: f.parent.headers, payload: { media } });

test('phụ huynh tạo hồ sơ trẻ, liệt kê, cấp phiên; /v1/me/account báo đúng loại tài khoản (server quyết định)', async () => {
  const a = await makeApp({ JWT_SECRET: SECRET });
  const f = await family(a);
  const list = ChildListResponseSchema.parse((await a.inject({ method: 'GET', url: '/v1/family/children', headers: f.parent.headers })).json());
  assert.deepEqual(list.children.map((c) => c.userId), [f.child.userId]);
  assert.equal(list.children[0].mediaConsent, false);

  const pa = AccountInfoSchema.parse((await a.inject({ method: 'GET', url: '/v1/me/account', headers: f.parent.headers })).json());
  assert.deepEqual({ t: pa.accountType, n: pa.childCount, c: pa.mediaConsent, p: pa.parentUserId }, { t: 'adult', n: 1, c: true, p: null });
  const ca = AccountInfoSchema.parse((await a.inject({ method: 'GET', url: '/v1/me/account', headers: f.childHeaders })).json());
  assert.deepEqual({ t: ca.accountType, c: ca.mediaConsent, p: ca.parentUserId }, { t: 'child', c: false, p: f.parent.body.userId });

  // refresh token của trẻ xoay vòng bình thường
  const r = await a.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: f.tokens.refreshToken } });
  assert.equal(r.statusCode, 200);
  await a.close();
});

test('trẻ KHÔNG chat AI tự do / gọi thoại tự do / hỏi đáp tự do; nhập vai có kịch bản thì được', async () => {
  const a = await makeApp({ JWT_SECRET: SECRET });
  const f = await family(a);
  const free = await turn(a, f.childHeaders);
  assert.equal(free.statusCode, 403);
  assert.equal(free.json().error, FAMILY_ERROR.freeChat);
  const call = await turn(a, f.childHeaders, { scenarioId: 'sc1', mode: 'call' });
  assert.equal(call.statusCode, 403);
  assert.equal(call.json().error, FAMILY_ERROR.freeChat);
  const sse = await a.inject({ method: 'POST', url: '/v1/chat/turn', headers: { ...f.childHeaders, accept: 'text/event-stream' }, payload: { sessionId: SID, userText: 'chào' } });
  assert.equal(sse.statusCode, 403, 'chặn trước khi mở luồng SSE');
  const ask = await a.inject({ method: 'POST', url: '/v1/culture/ask', headers: f.childHeaders, payload: { question: 'Tết là gì?' } });
  assert.equal(ask.statusCode, 403);
  assert.equal(ask.json().error, FAMILY_ERROR.freeChat);

  const roleplay = await turn(a, f.childHeaders, { scenarioId: 'sc1' });
  assert.equal(roleplay.statusCode, 200, roleplay.body);
  // chặn không đốt hạn mức: chỉ lượt nhập vai được tính
  const q = QuotaStatusSchema.parse((await a.inject({ method: 'GET', url: '/v1/quota', headers: f.childHeaders })).json());
  assert.equal(q.turns.used, 1);

  // người lớn không bị ảnh hưởng
  assert.equal((await turn(a, f.parent.headers)).statusCode, 200);
  await a.close();
});

test('trẻ không gửi ảnh/ghi âm khi phụ huynh chưa cho phép; cho phép => được; thu hồi => chặn NGAY', async () => {
  const a = await makeApp({ JWT_SECRET: SECRET });
  const f = await family(a);
  for (const call of [transcribe, assess, vision]) {
    const r = await call(a, f.childHeaders);
    assert.equal(r.statusCode, 403, `${call.name}: ${r.body}`);
    assert.equal(r.json().error, FAMILY_ERROR.consent);
  }
  const legacyAudio = await turn(a, f.childHeaders, { scenarioId: 'sc1', userText: undefined, userAudioBase64: wav.toString('base64') });
  assert.equal(legacyAudio.statusCode, 403);
  assert.equal(legacyAudio.json().error, FAMILY_ERROR.consent);

  // trẻ tự “đồng ý” qua /v1/sync không có tác dụng
  const forged = await a.inject({
    method: 'POST',
    url: '/v1/sync',
    headers: f.childHeaders,
    payload: { events: [{ type: 'consent.grant', key: 'parent_media', version: '1', clientEventId: crypto.randomUUID(), at: new Date().toISOString() }] }
  });
  assert.equal(forged.statusCode, 200);
  assert.equal((await vision(a, f.childHeaders)).statusCode, 403);

  const granted = await setConsent(a, f, true);
  assert.equal(granted.statusCode, 200, granted.body);
  assert.equal(ChildProfileSchema.parse(granted.json()).mediaConsent, true);
  assert.equal((await vision(a, f.childHeaders)).statusCode, 200);
  assert.equal((await transcribe(a, f.childHeaders)).statusCode, 200);
  assert.equal((await assess(a, f.childHeaders)).statusCode, 200);
  assert.equal(AccountInfoSchema.parse((await a.inject({ method: 'GET', url: '/v1/me/account', headers: f.childHeaders })).json()).mediaConsent, true);

  assert.equal((await setConsent(a, f, false)).statusCode, 200);
  assert.equal((await vision(a, f.childHeaders)).statusCode, 403, 'thu hồi có hiệu lực ngay (không chờ cache)');
  await a.close();
});

test('trẻ không quản lý gia đình, không tự xóa tài khoản; phụ huynh không đụng được trẻ của người khác', async () => {
  const a = await makeApp({ JWT_SECRET: SECRET });
  const f = await family(a);
  for (const [method, url] of [
    ['POST', '/v1/family/children'],
    ['GET', '/v1/family/children'],
    ['DELETE', '/v1/me']
  ]) {
    const r = await a.inject({ method, url, headers: f.childHeaders });
    assert.equal(r.statusCode, 403, `${method} ${url}`);
    assert.equal(r.json().error, FAMILY_ERROR.adultOnly);
  }
  const stranger = await guest(a);
  for (const [method, url, payload] of [
    ['POST', `/v1/family/children/${f.child.userId}/session`],
    ['PUT', `/v1/family/children/${f.child.userId}/consent`, { media: true }],
    ['GET', `/v1/family/children/${f.child.userId}/summary`],
    ['DELETE', `/v1/family/children/${f.child.userId}`]
  ]) {
    const r = await a.inject({ method, url, headers: stranger.headers, payload });
    assert.equal(r.statusCode, 404, `${method} ${url}`);
  }
  // id của chính phụ huynh cũng không phải "trẻ"
  const self = await a.inject({ method: 'POST', url: `/v1/family/children/${f.parent.body.userId}/session`, headers: f.parent.headers });
  assert.equal(self.statusCode, 404);
  await a.close();
});

test(`tối đa ${MAX_CHILDREN} hồ sơ trẻ mỗi phụ huynh`, async () => {
  const a = await makeApp({ JWT_SECRET: SECRET });
  const p = await guest(a);
  for (let i = 0; i < MAX_CHILDREN; i++) assert.equal((await a.inject({ method: 'POST', url: '/v1/family/children', headers: p.headers })).statusCode, 200);
  const over = await a.inject({ method: 'POST', url: '/v1/family/children', headers: p.headers });
  assert.equal(over.statusCode, 409);
  assert.equal(over.json().error, FAMILY_ERROR.childLimit);
  await a.close();
});

test('hạn mức AI của trẻ thấp hơn người lớn (và /v1/quota báo đúng hạn mức của trẻ)', async () => {
  const a = await makeApp({ JWT_SECRET: SECRET, MAX_CHAT_TURNS_PER_DAY: '5', CHILD_MAX_CHAT_TURNS_PER_DAY: '1' });
  const f = await family(a);
  assert.equal((await turn(a, f.childHeaders, { scenarioId: 'sc1' })).statusCode, 200);
  const second = await turn(a, f.childHeaders, { scenarioId: 'sc1' });
  assert.equal(second.statusCode, 429);
  assert.equal(second.json().error, 'quota_exceeded');
  const q = QuotaStatusSchema.parse((await a.inject({ method: 'GET', url: '/v1/quota', headers: f.childHeaders })).json());
  assert.equal(q.turns.limit, 1);
  assert.ok(q.llmTokens.limit < QuotaStatusSchema.parse((await a.inject({ method: 'GET', url: '/v1/quota', headers: f.parent.headers })).json()).llmTokens.limit);
  assert.equal((await turn(a, f.parent.headers)).statusCode, 200);
  await a.close();
});

test('phụ huynh xem tiến độ của trẻ (tóm tắt), xóa một hồ sơ trẻ', async () => {
  const a = await makeApp({ JWT_SECRET: SECRET });
  const f = await family(a);
  const day = '2026-11-18';
  await a.inject({
    method: 'POST',
    url: '/v1/sync',
    headers: f.childHeaders,
    payload: { events: [{ type: 'activity.set', day, seconds: 600, clientEventId: crypto.randomUUID(), at: new Date().toISOString() }] }
  });
  const sum = await a.inject({ method: 'GET', url: `/v1/family/children/${f.child.userId}/summary?today=${day}`, headers: f.parent.headers });
  assert.equal(sum.statusCode, 200, sum.body);
  assert.equal(AnalyticsSummaryResponseSchema.parse(sum.json()).studyMinutes, 10);

  const del = await a.inject({ method: 'DELETE', url: `/v1/family/children/${f.child.userId}`, headers: f.parent.headers });
  assert.equal(del.statusCode, 200);
  assert.equal((await a.inject({ method: 'GET', url: '/v1/me/account', headers: f.childHeaders })).json().error, 'account_deleted');
  const r = await a.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: f.tokens.refreshToken } });
  assert.equal(r.json().error, 'account_deleted');
  await a.close();
});

test('xóa tài khoản phụ huynh => xóa luôn hồ sơ trẻ (cascade) và máy của trẻ nhận account_deleted', async () => {
  const db = createDbProvider({ PGLITE_DIR: 'memory://' });
  const a = await makeApp({ JWT_SECRET: SECRET }, { db });
  const f = await family(a);
  assert.equal((await a.inject({ method: 'DELETE', url: '/v1/me', headers: f.parent.headers })).statusCode, 200);
  const rows = await (await db.get()).select().from(schema.users).where(eq(schema.users.id, f.child.userId));
  assert.equal(rows.length, 0);
  const me = await a.inject({ method: 'GET', url: '/v1/me/account', headers: f.childHeaders });
  assert.equal(me.statusCode, 401);
  assert.equal(me.json().error, 'account_deleted');
  const r = await a.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: f.tokens.refreshToken } });
  assert.equal(r.json().error, 'account_deleted');
  await a.close();
  await db.close();
});
