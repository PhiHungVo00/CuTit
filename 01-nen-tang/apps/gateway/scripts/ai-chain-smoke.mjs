/**
 * Chạy thử THẬT một lượt qua chuỗi dự phòng đã cấu hình (đọc khóa từ ~/.becutit/gateway.env). Không in khóa.
 * Dùng:  pnpm --filter @vietlearning/gateway build && node 01-nen-tang/apps/gateway/scripts/ai-chain-smoke.mjs
 * Thử dự phòng thật: đặt LLM_CHAIN=gemini:ten-model-khong-ton-tai,openrouter:<model>  (nguồn đầu 404 => nguồn sau trả lời).
 */
import { loadConfig } from '../dist/config.js';
import { createAiProviders } from '../dist/providers/registry.js';

const config = loadConfig({ ...process.env, NODE_ENV: 'development' });
const log = { info: (o, m) => console.log('[info]', m, JSON.stringify(o)), warn: (o, m) => console.log('[warn]', m, JSON.stringify(o)) };
const ai = createAiProviders(config, { log });
console.log('llm   :', ai.llm?.name ?? 'mock');
console.log('vision:', ai.vision?.name ?? 'mock');
console.log('stt   :', ai.stt?.name ?? 'mock');
if (ai.skipped.length) console.log('bỏ qua:', ai.skipped.join(' | '));
if (!ai.llm) process.exit(1);

const schema = { type: 'OBJECT', properties: { reply: { type: 'STRING' } }, required: ['reply'] };
const req = { system: 'Bạn là Bé Cu Tít, trả lời ngắn bằng tiếng Việt.', turns: [{ role: 'user', parts: [{ text: 'Xin chào Cu Tít!' }] }], schema, maxOutputTokens: 200, accept: (j) => typeof j?.reply === 'string' };
const t0 = Date.now();
const r = await ai.llm.generateJson(req);
console.log('trả lời bởi:', r.provider, `(${Date.now() - t0} ms, ${r.tokens} token)`);
console.log('nội dung   :', JSON.stringify(r.json));
