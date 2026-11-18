import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readWavInfo, encodeWav } from '@vietlearning/audio-dsp';
import { AudioPackSchema } from '@vietlearning/contracts';
import { GeminiTtsProvider, directorPrompt, ttsVoiceId } from '../dist/providers/tts.js';
import { FileAudioStore } from '../dist/services/tts/audioStore.js';
import { runPrebuild, matchesVerbatim } from '../dist/services/tts/prebuild.js';
import { GatewayError } from '../dist/pipeline/RequestPipeline.js';
import { ttsCacheKey } from '../dist/cache/TTSCacheProxy.js';
import { loadConfig } from '../dist/config.js';
import { createTtsProvider } from '../dist/providers/tts.js';
import { makeApp, guest } from './helpers.mjs';

const tmp = () => mkdtemp(join(tmpdir(), 'becutit-tts-'));
const fakeWav = () => new Uint8Array(encodeWav(new Float32Array(1600).fill(0.1), 16000));

test('directorPrompt: chỉ dẫn giọng theo miền tách khỏi TRANSCRIPT; lời đọc đứng riêng ở cuối', () => {
  const p = directorPrompt('Chào chị ạ', 'south');
  assert.match(p, /Southern Vietnamese \(Saigon\)/);
  assert.match(p, /Read ONLY the transcript, word for word/);
  assert.ok(p.endsWith('## TRANSCRIPT\nChào chị ạ'));
  assert.match(directorPrompt('a', 'north'), /Hanoi/);
  assert.match(directorPrompt('a', 'central'), /Hue/);
});

test('TTS chỉ bật khi TTS_PROVIDER=gemini (có khóa thôi chưa đủ)', () => {
  const key = 'k'.repeat(39);
  assert.equal(createTtsProvider(loadConfig({ NODE_ENV: 'test', GEMINI_API_KEY: key })), null);
  const p = createTtsProvider(loadConfig({ NODE_ENV: 'test', GEMINI_API_KEY: key, TTS_PROVIDER: 'gemini' }));
  assert.equal(p.model, 'gemini-3.8-flash-tts');
  assert.equal(p.voice, 'Kore');
  assert.equal(createTtsProvider(loadConfig({ NODE_ENV: 'test', TTS_PROVIDER: 'gemini' })), null, 'thiếu khóa');
});

test('GeminiTtsProvider: PCM L16 => WAV hợp lệ; 429 => tts_quota_exhausted; khóa đi qua header', async () => {
  const pcm = Buffer.alloc(48000); // 1 giây 24 kHz
  let seen;
  const fetchOk = async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm.toString('base64') } }] } }] }), { status: 200 });
  };
  const p = new GeminiTtsProvider('SECRET', 'gemini-3.8-flash-tts', 'Kore', 1000, fetchOk);
  const { wav } = await p.synthesize({ text: 'Xin chào', dialect: 'south' });
  const info = readWavInfo(wav);
  assert.equal(info.sampleRate, 24000);
  assert.equal(info.durationSec, 1);
  assert.equal(seen.init.headers['x-goog-api-key'], 'SECRET');
  assert.ok(!seen.url.includes('SECRET'));
  const body = JSON.parse(seen.init.body);
  assert.deepEqual(body.generationConfig.responseModalities, ['AUDIO']);
  assert.equal(body.systemInstruction, undefined, 'model TTS từ chối systemInstruction (400)');

  const p429 = new GeminiTtsProvider('SECRET', 'm', 'Kore', 1000, async () => new Response('{}', { status: 429 }));
  await assert.rejects(p429.synthesize({ text: 'a', dialect: 'north' }), (e) => e instanceof GatewayError && e.code === 'tts_quota_exhausted');
});

test('matchesVerbatim: bỏ qua dấu câu/hoa thường, KHÔNG bỏ qua từ thêm hoặc đổi', () => {
  assert.equal(matchesVerbatim('Chào chị ạ', 'chào chị ạ.'), true);
  assert.equal(matchesVerbatim('Chào chị ạ', 'Chào chị ạ hôn'), false);
  assert.equal(matchesVerbatim('Chị muốn uống gì', 'Chị mua uống gì'), false);
});

/** TTS/STT giả: STT nghe đúng nguyên văn, trừ các câu trong `misread` */
function fakes({ misread = {}, quotaAfter = Infinity, sttFailAt = Infinity } = {}) {
  const calls = { tts: [], stt: 0 };
  const tts = {
    name: 'fake',
    model: 'fake-tts',
    voice: 'Kore',
    promptVersion: 'v1',
    async synthesize({ text }) {
      if (calls.tts.length >= quotaAfter) throw new GatewayError(429, 'tts_quota_exhausted', 'hết');
      calls.tts.push(text);
      const w = fakeWav();
      w.text = text;
      return { wav: Object.assign(w, {}) };
    }
  };
  let lastText = '';
  const origSynth = tts.synthesize;
  tts.synthesize = async (req) => {
    lastText = req.text;
    return origSynth(req);
  };
  const byKey = new Map();
  const stt = {
    name: 'fake-stt',
    async transcribe() {
      calls.stt++;
      if (calls.stt >= sttFailAt) throw new GatewayError(503, 'llm_busy', 'bận');
      return { text: misread[lastText] ?? lastText, confidence: 1, tokens: 1 };
    }
  };
  return { tts, stt, calls, byKey };
}

test('runPrebuild: tạo + kiểm lại; câu đọc thêm từ bị loại; manifest chỉ có câu đạt; chạy lại bỏ qua câu đạt', async () => {
  const dir = await tmp();
  const store = new FileAudioStore(dir);
  const texts = ['xin chào', 'cảm ơn', 'Chào chị ạ', 'tạm biệt'];
  const f = fakes({ misread: { 'Chào chị ạ': 'Chào chị ạ hôn' } });
  const r1 = await runPrebuild({ pack: 'u1', dialect: 'south', texts, tts: f.tts, stt: f.stt, store, maxTries: 2 });
  assert.equal(r1.ok, 3);
  assert.equal(r1.rejected, 1);
  assert.equal(r1.stoppedBy, null);
  assert.deepEqual(r1.rejectedList, [{ text: 'Chào chị ạ', heard: 'Chào chị ạ hôn' }]);
  const pack = AudioPackSchema.parse(await store.readJson('packs/u1-south.json'));
  assert.deepEqual(Object.keys(pack.items).sort(), ['cảm ơn', 'tạm biệt', 'xin chào']);
  const key = ttsCacheKey({ text: 'xin chào', voiceId: ttsVoiceId(f.tts), speed: 1, dialect: 'south' });
  assert.equal(pack.items['xin chào'], key);
  assert.ok(await store.has(key));

  // Lần 2: câu đạt bỏ qua; câu bị loại được tổng hợp lại một lần (tries 2), vẫn sai => thôi
  const f2 = fakes({ misread: { 'Chào chị ạ': 'chào chị à' } });
  const r2 = await runPrebuild({ pack: 'u1', dialect: 'south', texts, tts: f2.tts, stt: f2.stt, store, maxTries: 2 });
  assert.deepEqual(f2.calls.tts, ['Chào chị ạ']);
  assert.equal(r2.rejected, 1);
  const f3 = fakes();
  await runPrebuild({ pack: 'u1', dialect: 'south', texts, tts: f3.tts, stt: f3.stt, store, maxTries: 2 });
  assert.deepEqual(f3.calls.tts, [], 'đã hết số lần thử => không gọi TTS nữa');
  await rm(dir, { recursive: true, force: true });
});

test('runPrebuild: hết hạn mức TTS => dừng êm; STT lỗi => để unverified, lần sau chỉ kiểm lại', async () => {
  const dir = await tmp();
  const store = new FileAudioStore(dir);
  const texts = ['một', 'hai', 'ba'];
  const f = fakes({ quotaAfter: 1 });
  const r = await runPrebuild({ pack: 'u2', dialect: 'north', texts, tts: f.tts, stt: f.stt, store });
  assert.equal(r.stoppedBy, 'tts-quota');
  assert.equal(r.ok, 1);
  assert.equal(r.missing, 2);

  const g = fakes({ sttFailAt: 1 });
  const r2 = await runPrebuild({ pack: 'u2', dialect: 'north', texts, tts: g.tts, stt: g.stt, store });
  assert.equal(r2.stoppedBy, 'stt-error');
  assert.equal(r2.unverified, 1);
  assert.deepEqual(g.calls.tts, ['hai']);

  const h = fakes();
  // STT giả đọc lastText: lần kiểm lại "hai" không gọi TTS nên đặt lastText bằng cách tổng hợp trước? => dùng STT trả đúng chữ theo thứ tự
  const order = ['hai', 'ba'];
  h.stt.transcribe = async () => ({ text: order.shift(), confidence: 1, tokens: 1 });
  const r3 = await runPrebuild({ pack: 'u2', dialect: 'north', texts, tts: h.tts, stt: h.stt, store });
  assert.deepEqual(h.calls.tts, ['ba'], '"hai" chỉ kiểm lại, không tổng hợp lại');
  assert.equal(r3.ok, 3);
  assert.equal(r3.stoppedBy, null);
  await rm(dir, { recursive: true, force: true });
});

test('Route /audio: phục vụ wav + manifest công khai, chặn tên lạ; /v1/speech/synthesize dùng tệp có sẵn hoặc provider', async () => {
  const dir = await tmp();
  const store = new FileAudioStore(dir);
  const f = fakes();
  const voiceId = ttsVoiceId(f.tts);
  const key = ttsCacheKey({ text: 'Xin chào', voiceId, speed: 1, dialect: 'south' });
  await store.write(key, fakeWav());
  await store.writeJson('packs/u1-south.json', { version: 1, pack: 'u1', dialect: 'south', model: 'm', voice: 'v', items: { 'Xin chào': key } });

  const app = await makeApp({ TTS_AUDIO_DIR: dir }, { tts: null });
  const wav = await app.inject({ method: 'GET', url: `/audio/${key}.wav` });
  assert.equal(wav.statusCode, 200);
  assert.equal(wav.headers['content-type'], 'audio/wav');
  assert.equal(wav.headers['cross-origin-resource-policy'], 'cross-origin');
  assert.equal((await app.inject({ method: 'GET', url: '/audio/packs/u1-south.json' })).json().items['Xin chào'], key);
  assert.equal((await app.inject({ method: 'GET', url: '/audio/..%2Fsecret.wav' })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: '/audio/packs/..%2Fstate%2Fu1-south.json' })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: `/audio/${'0'.repeat(64)}.wav` })).statusCode, 404);
  const { headers } = await guest(app);
  const no = await app.inject({ method: 'POST', url: '/v1/speech/synthesize', headers, payload: { text: 'Câu chưa có', dialect: 'south' } });
  assert.equal(no.statusCode, 503);
  await app.close();

  // Có provider: tệp dựng sẵn được dùng lại (không gọi provider); câu mới thì gọi và trả URL tuyệt đối
  const app2 = await makeApp({ TTS_AUDIO_DIR: dir }, { tts: f.tts });
  const g = await guest(app2);
  const hit = await app2.inject({ method: 'POST', url: '/v1/speech/synthesize', headers: g.headers, payload: { text: 'Xin chào', dialect: 'south' } });
  assert.equal(hit.statusCode, 200, hit.body);
  assert.match(hit.json().audioUrl, new RegExp(`^http://[^/]+/audio/${key}\\.wav$`));
  assert.deepEqual(f.calls.tts, []);
  const miss = await app2.inject({ method: 'POST', url: '/v1/speech/synthesize', headers: g.headers, payload: { text: 'Câu mới', dialect: 'north' } });
  assert.equal(miss.statusCode, 200);
  assert.deepEqual(f.calls.tts, ['Câu mới']);
  await app2.close();
  await rm(dir, { recursive: true, force: true });
});
