import test from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, guest } from './helpers.mjs';

/** Spec mục 6: khách có hạn mức AI = GUEST_QUOTA_FACTOR × hạn mức tài khoản thật (mặc định ½) */
const ENV = { GUEST_QUOTA_FACTOR: '0.5', AUTH_RATE_LIMIT_PER_MINUTE: '1000', MAX_CHAT_TURNS_PER_DAY: '60', MAX_LLM_TOKENS_PER_DAY: '1000', MAX_STT_SECONDS_PER_DAY: '600' };

test('Hạn mức khách = ½ tài khoản; nâng cấp (đăng ký) xong => hạn mức tài khoản ngay', async () => {
  const a = await makeApp(ENV);
  try {
    const g = await guest(a);
    const q1 = (await a.inject({ url: '/v1/quota', headers: g.headers })).json();
    assert.equal(q1.turns.limit, 30);
    assert.equal(q1.llmTokens.limit, 500);
    assert.equal(q1.sttSeconds.limit, 300);
    const r = await a.inject({ method: 'POST', url: '/v1/auth/register', payload: { username: 'han.muc', password: 'ca-phe-sua-da-42' }, headers: g.headers });
    assert.equal(r.statusCode, 200, r.body);
    const q2 = (await a.inject({ url: '/v1/quota', headers: g.headers })).json();
    assert.equal(q2.turns.limit, 60);
    assert.equal(q2.llmTokens.limit, 1000);
  } finally {
    await a.close();
  }
});

test('Khách chạm ½ hạn mức => 429 quota_exceeded; GUEST_QUOTA_FACTOR=1 => như tài khoản', async () => {
  const a = await makeApp({ ...ENV, MAX_CHAT_TURNS_PER_DAY: '2' });
  try {
    const g = await guest(a);
    const q = (await a.inject({ url: '/v1/quota', headers: g.headers })).json();
    assert.equal(q.turns.limit, 1);
    const turn = () =>
      a.inject({ method: 'POST', url: '/v1/chat/turn', headers: { ...g.headers, accept: 'text/event-stream' }, payload: { sessionId: '7d444840-9dc0-11d1-b245-5ffdce74fad2', userText: 'xin chào' } });
    assert.equal((await turn()).statusCode, 200);
    const r = await turn();
    assert.equal(r.statusCode, 429);
    assert.equal(r.json().error, 'quota_exceeded');
  } finally {
    await a.close();
  }
  const b = await makeApp({ ...ENV, GUEST_QUOTA_FACTOR: '1' });
  try {
    const g = await guest(b);
    assert.equal((await b.inject({ url: '/v1/quota', headers: g.headers })).json().turns.limit, 60);
  } finally {
    await b.close();
  }
});
