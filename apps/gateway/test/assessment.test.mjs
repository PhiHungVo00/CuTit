import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav } from '@vietlearning/audio-dsp';
import { AssessResponseSchema } from '@vietlearning/contracts';
import { syllables, toneOf, baseOf } from '../dist/services/assessment/text.js';
import { alignSyllables } from '../dist/services/assessment/align.js';
import { syllableContours } from '../dist/services/assessment/segments.js';
import { assessPronunciation } from '../dist/services/assessment/assess.js';
import { makeApp, guest } from './helpers.mjs';

test('A3 chuẩn hóa: NFC, chữ thường, bỏ dấu câu; NFD từ STT cho cùng kết quả', () => {
  assert.deepEqual(syllables('Xin chào, bạn!'), ['xin', 'chào', 'bạn']);
  assert.deepEqual(syllables('Xin chào, bạn!'.normalize('NFD')), ['xin', 'chào', 'bạn']);
  assert.deepEqual(syllables('  Tôi   tên là Lan.  '), ['tôi', 'tên', 'là', 'lan']);
  assert.deepEqual(syllables('…'), []);
});

test('A3 thanh từ dấu: 6 thanh; baseOf chỉ bỏ dấu thanh, giữ â ă ơ ư ê ô đ', () => {
  assert.equal(toneOf('ma'), 'ngang');
  assert.equal(toneOf('mà'), 'huyen');
  assert.equal(toneOf('má'), 'sac');
  assert.equal(toneOf('mả'), 'hoi');
  assert.equal(toneOf('mã'), 'nga');
  assert.equal(toneOf('mạ'), 'nang');
  assert.equal(toneOf('người'), 'huyen');
  assert.equal(toneOf('Đường'.normalize('NFD')), 'huyen');
  assert.equal(baseOf('mả'), 'ma');
  assert.equal(baseOf('ướt'), 'ươt');
  assert.equal(baseOf('đẹp'), 'đep');
  assert.equal(baseOf('ăn'), 'ăn');
});

test('A3 căn chỉnh: đúng / sai thanh / sai / thiếu / thừa', () => {
  const pairs = alignSyllables(['tôi', 'tên', 'là', 'lan'], ['tôi', 'tên', 'la', 'lan', 'lắm']);
  assert.deepEqual(pairs, [
    { expected: 'tôi', heard: 'tôi' },
    { expected: 'tên', heard: 'tên' },
    { expected: 'là', heard: 'la' },
    { expected: 'lan', heard: 'lan' },
    { expected: null, heard: 'lắm' }
  ]);
  assert.deepEqual(alignSyllables(['chào', 'chị', 'ạ'], ['chào', 'chị']), [
    { expected: 'chào', heard: 'chào' },
    { expected: 'chị', heard: 'chị' },
    { expected: 'ạ', heard: null }
  ]);
  assert.deepEqual(alignSyllables([], []), []);
});

test('A3 chấm: trạng thái, tên thanh và điểm', () => {
  const r = assessPronunciation({ expectedText: 'Tôi tên là Lan.', transcript: 'tôi tên la lan lắm', pcm: null, sampleRate: 16000 });
  assert.deepEqual(r.words.map((w) => w.status), ['correct', 'correct', 'tone', 'correct', 'extra']);
  const tone = r.words[2];
  assert.equal(tone.expectedTone, 'huyen');
  assert.equal(tone.heardTone, 'ngang');
  // (3 + 0.5) / 4 = 87.5 → 88, trừ 5 vì một từ thừa
  assert.equal(r.score, 83);
  assert.equal(r.mock, false);
  assert.equal(r.toneChecked, false, 'không có PCM => không phán thanh bằng A2');
  assert.ok(AssessResponseSchema.safeParse(r).success);

  const wrong = assessPronunciation({ expectedText: 'Chào chị ạ', transcript: 'chào anh', pcm: null, sampleRate: 16000 });
  assert.deepEqual(wrong.words.map((w) => w.status), ['correct', 'wrong', 'missing']);
  assert.equal(wrong.score, 33);

  const silent = assessPronunciation({ expectedText: 'Chào chị ạ', transcript: '', pcm: null, sampleRate: 16000 });
  assert.equal(silent.score, 0);
  assert.ok(silent.words.every((w) => w.status === 'missing'));
});

test('A3 không có STT (mock): không chấm chữ, điểm 0, mock true', () => {
  const r = assessPronunciation({ expectedText: 'Xin chào', transcript: null, pcm: null, sampleRate: 16000 });
  assert.equal(r.mock, true);
  assert.equal(r.transcript, '');
  assert.equal(r.score, 0);
  assert.deepEqual(r.words.map((w) => w.expected), ['xin', 'chào']);
});

/** Hai âm tiết tổng hợp: sóng răng cưa đi lên (giống sắc) rồi đi xuống (giống huyền), cách nhau 200 ms lặng */
function twoSyllables(sr = 16000) {
  const seg = (f0, f1, sec) => {
    const n = Math.round(sr * sec);
    const out = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const f = f0 + ((f1 - f0) * i) / n;
      phase += f / sr;
      out[i] = 0.4 * (2 * (phase % 1) - 1);
    }
    return out;
  };
  const gap = new Float32Array(Math.round(sr * 0.2));
  const parts = [gap, seg(160, 260, 0.45), gap, seg(220, 140, 0.45), gap];
  const all = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  return all;
}

test('A2 từng âm tiết: tách 2 đoạn hữu thanh; khớp số âm tiết => có pitch', () => {
  const pcm = twoSyllables();
  const segs = syllableContours(pcm, 16000);
  assert.equal(segs.length, 2);
  const r = assessPronunciation({ expectedText: 'má mà', transcript: 'má mà', pcm, sampleRate: 16000 });
  assert.equal(r.toneChecked, true);
  assert.equal(r.words[0].pitch.bestMatch, 'sac');
  assert.ok(r.words[0].pitch.score >= 60);
  // Số âm tiết không khớp số đoạn => không phán thanh
  const r3 = assessPronunciation({ expectedText: 'má mà ma', transcript: 'má mà ma', pcm, sampleRate: 16000 });
  assert.equal(r3.toneChecked, false);
  assert.ok(r3.words.every((w) => !w.pitch));
});

// --- Route ---
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
const wav = Buffer.from(encodeWav(twoSyllables(), 16000));

test('POST /v1/speech/assess: STT giả => chấm thật; STT không nhận expectedText', async () => {
  const seen = [];
  const stt = {
    name: 'fake',
    async transcribe(audio) {
      seen.push(audio);
      return { text: 'Má ma.', confidence: 0.9, tokens: 3 };
    }
  };
  const app = await makeApp({}, { stt, llm: null });
  const { headers } = await guest(app);
  const mp = multipart([
    { name: 'audio', filename: 's.wav', type: 'audio/wav', data: wav },
    { name: 'expectedText', data: 'Má mà' }
  ]);
  const res = await app.inject({ method: 'POST', url: '/v1/speech/assess', payload: mp.payload, headers: { ...headers, ...mp.headers } });
  assert.equal(res.statusCode, 200, res.body);
  const body = AssessResponseSchema.parse(res.json());
  assert.equal(body.mock, false);
  assert.equal(body.transcript, 'Má ma.');
  assert.deepEqual(body.words.map((w) => w.status), ['correct', 'tone']);
  assert.equal(body.toneChecked, true);
  assert.equal(seen.length, 1);
  assert.equal(Object.keys(seen[0]).includes('expectedText'), false);
  await app.close();
});

test('POST /v1/speech/assess: không STT => mock; thiếu expectedText => 400', async () => {
  const app = await makeApp({}, { stt: null, llm: null });
  const { headers } = await guest(app);
  const ok = multipart([
    { name: 'audio', filename: 's.wav', type: 'audio/wav', data: wav },
    { name: 'expectedText', data: 'Xin chào' }
  ]);
  const res = await app.inject({ method: 'POST', url: '/v1/speech/assess', payload: ok.payload, headers: { ...headers, ...ok.headers } });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().mock, true);
  const missing = multipart([{ name: 'audio', filename: 's.wav', type: 'audio/wav', data: wav }]);
  const bad = await app.inject({ method: 'POST', url: '/v1/speech/assess', payload: missing.payload, headers: { ...headers, ...missing.headers } });
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.json().error, 'missing_expected_text');
  await app.close();
});
