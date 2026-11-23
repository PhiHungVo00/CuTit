/**
 * Chạy thử THẬT STT qua STT_CHAIN với một tệp WAV tiếng Việt có sẵn (mặc định docs/d9-tts-mau/cau-theo-mien/north.wav).
 *   STT_CHAIN='groq:whisper-large-v3-turbo,gemini' node 01-nen-tang/apps/gateway/scripts/ai-stt-smoke.mjs [tệp.wav]
 */
import { readFileSync } from 'node:fs';
import { loadConfig } from '../dist/config.js';
import { createAiProviders } from '../dist/providers/registry.js';

const file = process.argv[2] ?? new URL('../../../../docs/d9-tts-mau/cau-theo-mien/north.wav', import.meta.url);
const ai = createAiProviders(loadConfig({ ...process.env, NODE_ENV: 'development' }), { log: { info: (o, m) => console.log('[info]', m, JSON.stringify(o)), warn: (o, m) => console.log('[warn]', m, JSON.stringify(o)) } });
if (!ai.stt) { console.log('Chưa có STT_CHAIN dùng được:', ai.skipped.join(' | ')); process.exit(1); }
const t0 = Date.now();
const r = await ai.stt.transcribe({ bytes: readFileSync(file), mimetype: 'audio/wav' });
console.log(`nguồn: ${r.provider} | ${Date.now() - t0} ms | văn bản: ${r.text}`);
