/**
 * Chạy thử THẬT một lượt /v1/chat/turn (prompt gia sư + xác thực Zod như app) qua chuỗi đã cấu hình, bằng app.inject,
 * DB PGlite trong RAM. Khóa đọc từ ~/.becutit/gateway.env, không in khóa.
 *   LLM_CHAIN='gemini:ten-sai,openrouter:google/gemma-4-31b-it:free' node 01-nen-tang/apps/gateway/scripts/ai-chat-smoke.mjs
 */
import { loadConfig } from '../dist/config.js';
import { buildApp } from '../dist/app.js';

const app = await buildApp(loadConfig({ ...process.env, NODE_ENV: 'test', CORS_ORIGIN: 'http://localhost:3000' }), { logger: { level: 'warn' } });
const g = (await app.inject({ method: 'POST', url: '/v1/auth/guest' })).json();
const headers = { authorization: `Bearer ${g.accessToken}` };
const payload = { sessionId: '7d444840-9dc0-11d1-b245-5ffdce74fad2', userText: 'xin chao co', explanationLanguage: 'vi', persona: 'tutor', history: [] };
for (let i = 1; i <= 2; i++) {
  const t0 = Date.now();
  const res = await app.inject({ method: 'POST', url: '/v1/chat/turn', headers, payload });
  const body = res.json();
  console.log(`#${i} HTTP ${res.statusCode} ${Date.now() - t0} ms | nguồn: ${res.headers['x-ai-provider'] ?? '-'} | error: ${body.error ?? '-'}`);
  if (res.statusCode === 200) console.log('   transcript:', body.transcript, '| blocks:', body.uiBlocks.length, '| remaining:', JSON.stringify(body.remaining));
}
const q = (await app.inject({ method: 'GET', url: '/v1/quota', headers })).json();
console.log('quota sau cùng: turns', JSON.stringify(q.turns), '| day', q.day, '| resetAt', q.resetAt);
await app.close();
