import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatEventSchema } from '@vietlearning/contracts';
import { ROLEPLAY_SCENARIOS } from '@vietlearning/content';
import { loadConfig } from '../dist/config.js';
import { buildApp } from '../dist/app.js';
import { TTSCacheProxy } from '../dist/cache/TTSCacheProxy.js';
import { MOCK_TASK_KEYWORDS, MOCK_NPC_NUDGE } from '../dist/services/chat/mockTutor.js';

const SID = '7d444840-9dc0-11d1-b245-5ffdce74fad2';
const app = (opts = {}) => buildApp(loadConfig({ NODE_ENV: 'test', AUTH_REQUIRED: 'false' }), { logger: false, ...opts });
const events = (body) => body.split('\n\n').filter(Boolean).map((c) => ChatEventSchema.parse(JSON.parse(c.replace(/^data: /, ''))));
const turn = (a, payload) => a.inject({ method: 'POST', url: '/v1/chat/turn', headers: { accept: 'text/event-stream' }, payload: { sessionId: SID, ...payload } });
const doneOf = (res) => events(res.body).find((e) => e.type === 'done');

function fakeLlm(json) {
  const calls = [];
  return { calls, provider: { name: 'fake', async generateJson(req) { calls.push(req); return { json, tokens: 40 }; } } };
}

test('gia sư giả lập phủ MỌI kịch bản (kể cả sc5–sc7): đủ từ khóa và lời nhắc cho từng nhiệm vụ', () => {
  for (const s of ROLEPLAY_SCENARIOS) {
    assert.equal(MOCK_TASK_KEYWORDS[s.id]?.length, s.tasks.length, `${s.id} thiếu từ khóa`);
    assert.equal(MOCK_NPC_NUDGE[s.id]?.length, s.tasks.length, `${s.id} thiếu lời nhắc`);
  }
});

test('nhập vai cuối unit 1 (sc5) với bộ giả lập: 2 lượt hoàn thành đủ 4 nhiệm vụ', async () => {
  const a = await app();
  const d1 = doneOf(await turn(a, { scenarioId: 'sc5', userText: 'Cháu chào cô ạ, cháu tên là Mai' }));
  assert.deepEqual(d1.completedTasks, [0, 1]);
  const d2 = doneOf(await turn(a, { scenarioId: 'sc5', userText: 'Cô có khỏe không ạ? Tạm biệt cô', history: [{ role: 'user', text: 'Cháu chào cô ạ, cháu tên là Mai' }, { role: 'tutor', text: d1.reply }] }));
  assert.deepEqual(d2.completedTasks, [0, 1, 2, 3]);
  await a.close();
});

test('newWords (giả lập): từ của khóa học có trong câu trả lời, kèm nghĩa, tối đa 3, bỏ đại từ', async () => {
  const a = await app();
  const d = doneOf(await turn(a, { scenarioId: 'sc6', userText: 'Chào chị, quả dứa bao nhiêu tiền?' }));
  assert.ok(d.newWords.length >= 1 && d.newWords.length <= 3, JSON.stringify(d.newWords));
  assert.ok(d.newWords.some((w) => w.vi === 'dứa' && w.en === 'pineapple'));
  for (const w of d.newWords) {
    assert.ok(d.reply.toLowerCase().includes(w.vi), `${w.vi} phải có trong câu trả lời`);
    assert.ok(w.en.length > 0);
    assert.ok(!['em', 'chị', 'anh', 'tôi', 'bạn'].includes(w.vi));
  }
  await a.close();
});

test('newWords (AI): từ không xuất hiện trong câu trả lời hoặc thiếu nghĩa bị lọc (Nguyên tắc 6)', async () => {
  const llm = fakeLlm({
    reply: 'Quả dứa này ngon lắm!',
    correction: null,
    blocks: [],
    completedTasks: [],
    newWords: [{ vi: 'Dứa', en: 'pineapple' }, { vi: 'máy bay', en: 'plane' }, { vi: 'ngon', en: '' }, { vi: 'dứa', en: 'pineapple' }]
  });
  const a = await app({ llm: llm.provider });
  const d = doneOf(await turn(a, { userText: 'Tôi thích trái cây' }));
  assert.deepEqual(d.newWords, [{ vi: 'dứa', en: 'pineapple' }]);
  await a.close();
});

test('mode=call: prompt văn nói ngắn, không sửa dấu/viết hoa của bản chép lời, giới hạn token đầu ra', async () => {
  const llm = fakeLlm({ reply: 'Chào bạn!', correction: null, blocks: [], completedTasks: [], newWords: [] });
  const a = await app({ llm: llm.provider });
  await turn(a, { userText: 'xin chào', mode: 'call' });
  await turn(a, { userText: 'xin chào' });
  assert.match(llm.calls[0].system, /VĂN NÓI/);
  assert.match(llm.calls[0].system, /chép lời/);
  assert.equal(llm.calls[0].maxOutputTokens, 300);
  assert.doesNotMatch(llm.calls[1].system, /VĂN NÓI/);
  await a.close();
});

test('mode=call: lời sửa chỉ khác dấu thanh/viết hoa/dấu câu bị bỏ (lỗi của bộ chép lời, không phải người học)', async () => {
  const only = fakeLlm({ reply: 'Thế à?', correction: { original: 'x', corrected: 'Hôm nay tôi đi chợ mua dứa.', explanation: 'Added tone marks.' }, blocks: [], completedTasks: [], newWords: [] });
  const a = await app({ llm: only.provider });
  const call = events((await turn(a, { userText: 'hom nay toi di cho mua dua', mode: 'call' })).body);
  assert.ok(!call.some((e) => e.type === 'correction'), 'chế độ gọi: không báo lỗi dấu');
  const chat = events((await turn(a, { userText: 'hom nay toi di cho mua dua' })).body);
  assert.ok(chat.some((e) => e.type === 'correction'), 'chat gõ chữ: vẫn sửa dấu như cũ');
  await a.close();

  const real = fakeLlm({ reply: 'Thế à?', correction: { original: 'x', corrected: 'Hôm nay tôi đi chợ để mua dứa', explanation: 'Add “để”.' }, blocks: [], completedTasks: [], newWords: [] });
  const b = await app({ llm: real.provider });
  const kept = events((await turn(b, { userText: 'Hôm nay tôi đi chợ mua dứa', mode: 'call' })).body);
  assert.ok(kept.some((e) => e.type === 'correction'), 'sửa từ thật sự vẫn giữ');
  await b.close();
});

test('lượt chat KHÔNG gọi TTS ở Gateway (client tự gọi /speech/synthesize khi cần)', async () => {
  let calls = 0;
  const tts = new TTSCacheProxy(async () => (calls++, 'https://cdn.example/a.mp3'));
  const a = await app({ ttsCache: tts });
  const d = doneOf(await turn(a, { userText: 'xin chào', mode: 'call' }));
  assert.equal(calls, 0);
  assert.equal(d.audioUrl, undefined);
  await a.close();
});
