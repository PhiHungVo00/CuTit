import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatEventSchema } from '@vietlearning/contracts';
import { loadConfig } from '../dist/config.js';
import { buildApp } from '../dist/app.js';
import { mockTutorTurn } from '../dist/services/chat/mockTutor.js';

const ORIGIN = 'http://localhost:3000';
const app = () => buildApp(loadConfig({ NODE_ENV: 'test', CORS_ORIGIN: ORIGIN }), { logger: false });
const SID = '7d444840-9dc0-11d1-b245-5ffdce74fad2';

function parseSse(body) {
  assert.ok(body.endsWith('\n\n'), 'mọi sự kiện, kể cả sự kiện cuối, phải kết thúc bằng \n\n');
  return body
    .split('\n\n')
    .filter(Boolean)
    .map((chunk) => ChatEventSchema.parse(JSON.parse(chunk.replace(/^data: /, ''))));
}

test('/chat/turn SSE: giữ header CORS, mọi sự kiện đúng contract, ghép token = reply, kết thúc bằng done', async () => {
  const a = await app();
  const res = await a.inject({
    method: 'POST',
    url: '/v1/chat/turn',
    headers: { accept: 'text/event-stream', origin: ORIGIN },
    payload: { sessionId: SID, userText: 'xin chao Cu Tit' }
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/event-stream/);
  assert.equal(res.headers['access-control-allow-origin'], ORIGIN);
  const events = parseSse(res.body);
  assert.equal(events[0].type, 'transcript');
  const done = events.at(-1);
  assert.equal(done.type, 'done');
  assert.equal(done.mock, true);
  assert.equal(events.filter((e) => e.type === 'token').map((e) => e.text).join(''), done.reply);
  const corr = events.find((e) => e.type === 'correction');
  assert.equal(corr.correction.corrected, 'xin chào Cu Tit');
  assert.ok(events.some((e) => e.type === 'blocks'));
  await a.close();
});

test('/chat/turn: lỗi request vẫn là JSON 400 (trước khi mở luồng); kịch bản lạ => 404', async () => {
  const a = await app();
  const bad = await a.inject({ method: 'POST', url: '/v1/chat/turn', headers: { accept: 'text/event-stream' }, payload: { sessionId: SID } });
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.json().error, 'invalid_request');
  const tooLong = await a.inject({ method: 'POST', url: '/v1/chat/turn', payload: { sessionId: SID, userText: 'a'.repeat(501) } });
  assert.equal(tooLong.statusCode, 400);
  const unknown = await a.inject({ method: 'POST', url: '/v1/chat/turn', payload: { sessionId: SID, userText: 'chào', scenarioId: 'zz' } });
  assert.equal(unknown.statusCode, 404);
  await a.close();
});

test('Gia sư giả lập M7: chấm nhiệm vụ trên cả lịch sử lượt; mức sửa lỗi off => không sửa', async () => {
  const a = await app();
  const res = await a.inject({
    method: 'POST',
    url: '/v1/chat/turn',
    headers: { accept: 'text/event-stream' },
    payload: { sessionId: SID, scenarioId: 'sc3', userText: 'Cho tôi một bát phở bò, không hành nhé', history: [{ role: 'user', text: 'Chào anh' }, { role: 'tutor', text: 'Chào em, em ăn gì?' }] }
  });
  const done = parseSse(res.body).at(-1);
  assert.deepEqual(done.completedTasks, [0, 1, 2]);
  const off = mockTutorTurn({ userText: 'xin chao', history: [], correctionLevel: 'off', persona: 'be_cu_tit' });
  assert.equal(off.correction, undefined);
  const strict = mockTutorTurn({ userText: 'chào bạn', history: [], correctionLevel: 'strict', persona: 'be_cu_tit' });
  assert.equal(strict.correction?.corrected, 'Chào bạn');
  await a.close();
});
