import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../dist/config.js';
import { buildApp } from '../dist/app.js';
import { encodeWav } from '@vietlearning/audio-dsp';

const app = (env = {}) =>
  buildApp(loadConfig({ NODE_ENV: 'test', AUTH_REQUIRED: 'false', CORS_ORIGIN: 'http://localhost:3000', ...env }), { logger: false });

/** Dựng body multipart/form-data thủ công (không cần thư viện form-data). */
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

const wavOf = (seconds) => Buffer.from(encodeWav(new Float32Array(16000 * seconds).fill(0.1), 16000));

test('Upload WAV nhị phân: 200, nhỏ hơn base64 ~25%', async () => {
  const a = await app();
  const wav = wavOf(2);
  const res = await a.inject({
    method: 'POST',
    url: '/v1/speech/assess',
    ...multipart([
      { name: 'audio', filename: 'ma.wav', type: 'audio/wav', data: wav },
      { name: 'targetTone', data: 'sac' },
      { name: 'expectedText', data: 'má' }
    ])
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.ok(typeof res.json().score === 'number');
  const base64Len = wav.toString('base64').length;
  assert.ok(wav.length < base64Len * 0.76, `nhị phân ${wav.length} B vs base64 ${base64Len} B`);
  await a.close();
});

test('Quota STT trừ theo số giây thật của bản ghi (đọc từ header WAV)', async () => {
  const a = await app({ MAX_STT_SECONDS_PER_DAY: '5' });
  const send = (sec) =>
    a.inject({ method: 'POST', url: '/v1/speech/transcribe', ...multipart([{ name: 'audio', filename: 'a.wav', type: 'audio/wav', data: wavOf(sec) }]) });
  assert.equal((await send(3)).statusCode, 200); // còn 2 giây
  assert.equal((await send(2)).statusCode, 200); // còn 0
  const over = await send(1);
  assert.equal(over.statusCode, 429);
  assert.equal(over.json().error, 'quota_exceeded');
  await a.close();
});

test('Từ chối: không phải multipart (415), sai loại file (415), thiếu file (400), WAV hỏng (400), trường sai (400)', async () => {
  const a = await app();
  const post = (opts) => a.inject({ method: 'POST', url: '/v1/speech/assess', ...opts });

  const json = await post({ payload: { userAudioBase64: 'AAAA' } });
  assert.equal(json.statusCode, 415);
  assert.equal(json.json().error, 'expected_multipart');

  const img = await post(multipart([{ name: 'audio', filename: 'x.png', type: 'image/png', data: Buffer.from('png') }]));
  assert.equal(img.statusCode, 415);

  const none = await post(multipart([{ name: 'targetTone', data: 'sac' }]));
  assert.equal(none.statusCode, 400);
  assert.equal(none.json().error, 'missing_audio');

  const broken = await post(multipart([{ name: 'audio', filename: 'a.wav', type: 'audio/wav', data: Buffer.alloc(100, 7) }]));
  assert.equal(broken.statusCode, 400);
  assert.equal(broken.json().error, 'invalid_wav');

  const badTone = await post(
    multipart([
      { name: 'audio', filename: 'a.wav', type: 'audio/wav', data: wavOf(1) },
      { name: 'targetTone', data: 'khong-co' }
    ])
  );
  assert.equal(badTone.statusCode, 400);
  await a.close();
});

test('Bản ghi quá dài (> 60 s) => 413', async () => {
  const a = await app({ AUDIO_BODY_LIMIT_MB: '8' });
  const res = await a.inject({
    method: 'POST',
    url: '/v1/speech/transcribe',
    ...multipart([{ name: 'audio', filename: 'long.wav', type: 'audio/wav', data: wavOf(61) }])
  });
  assert.equal(res.statusCode, 413);
  await a.close();
});
