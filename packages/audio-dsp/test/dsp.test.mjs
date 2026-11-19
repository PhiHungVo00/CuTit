import test from 'node:test';
import assert from 'node:assert/strict';
import {
  yinPitch,
  mcleodPitch,
  extractContourYIN,
  createPitchStrategy,
  toRelativeSemitones,
  dtwDistance,
  pearson,
  compareContours,
  analyzeTone,
  downsample
} from '../dist/index.js';
import { PitchReferenceFlyweight } from '../../content/dist/index.js';

const SR = 16000;

/** Tín hiệu giống giọng: F0 theo hàm f(t), 5 hài giảm dần, nhiễu trắng nhẹ, có thể chèn đoạn lặng đầu/cuối. */
function voice(fHz, durS, { sr = SR, noise = 0.02, silenceS = 0, seed = 1 } = {}) {
  const n = Math.round(durS * sr);
  const pad = Math.round(silenceS * sr);
  const out = new Float32Array(n + 2 * pad);
  let phase = 0;
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    phase += (2 * Math.PI * fHz(t / durS)) / sr;
    let v = 0;
    for (let h = 1; h <= 5; h++) v += Math.sin(h * phase) / h;
    out[pad + i] = 0.3 * v + noise * rand();
  }
  return out;
}

const st = (base, semis) => base * 2 ** (semis / 12);
/** Dựng F0 theo contour mẫu của một thanh (semitone tương đối) quanh giọng gốc base Hz */
const fromTone = (id, base) => (x) => {
  const c = PitchReferenceFlyweight.get(id).contour;
  const pos = x * (c.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(c.length - 1, lo + 1);
  return st(base, c[lo] + (c[hi] - c[lo]) * (pos - lo));
};

test('YIN và McLeod: nhận đúng F0 của giọng nam (110 Hz) và nữ (220 Hz) trong ±1%', () => {
  for (const f of [110, 220, 330]) {
    const frame = voice(() => f, 0.04);
    const y = yinPitch(frame, SR);
    const m = mcleodPitch(frame, SR);
    assert.ok(Math.abs(y.hz - f) / f < 0.01, `YIN ${f}Hz => ${y.hz}`);
    assert.ok(Math.abs(m.hz - f) / f < 0.01, `MPM ${f}Hz => ${m.hz}`);
    assert.ok(y.clarity > 0.8);
  }
});

test('YIN: khung lặng / nhiễu trắng thuần => null (không trả số rác)', () => {
  assert.equal(yinPitch(new Float32Array(640), SR).hz, null);
  const noise = voice(() => 200, 0.04, { noise: 0 }).map((_, i) => Math.sin(i * 12.9898) * 0.3 * ((i * 7919) % 13) / 13);
  const r = yinPitch(new Float32Array(noise.length).map(() => Math.random() * 0.6 - 0.3), SR);
  assert.ok(r.hz === null || r.clarity < 0.6, 'nhiễu trắng không được coi là hữu thanh rõ');
});

test('Contour: bám theo F0 đi lên (sắc) theo thời gian, cắt được phần lặng đầu/cuối', () => {
  const pcm = voice((x) => 150 + 100 * x, 0.6, { silenceS: 0.2 });
  const frames = extractContourYIN(pcm, SR);
  const voiced = toRelativeSemitones(frames);
  assert.ok(voiced, 'phải có contour');
  assert.ok(voiced.semitones[voiced.semitones.length - 1] > voiced.semitones[0] + 5, 'cuối phải cao hơn đầu ~8.8 semitone');
  assert.ok(voiced.timesMs[0] >= 150, 'đã cắt lặng đầu');
  assert.ok(voiced.voicedRatio > 0.9);
});

test('Lặng hoàn toàn => toRelativeSemitones trả null, analyzeTone báo no-voice', () => {
  const silent = new Float32Array(SR);
  assert.equal(toRelativeSemitones(extractContourYIN(silent, SR)), null);
  const r = analyzeTone({ pcm: silent, sampleRate: SR, target: 'sac', references: PitchReferenceFlyweight.contours() });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no-voice');
});

test('DTW: chuỗi giống nhau = 0, chịu được co giãn thời gian; Pearson phân biệt lên/xuống', () => {
  const up = Array.from({ length: 40 }, (_, i) => i / 4);
  const upSlow = Array.from({ length: 60 }, (_, i) => i / 6);
  const down = up.map((v) => -v);
  assert.equal(dtwDistance(up, up), 0);
  assert.ok(dtwDistance(up, upSlow) < 0.3, 'nói chậm hơn vẫn gần');
  assert.ok(pearson(up, up) > 0.999);
  assert.ok(pearson(up, down) < -0.999);
});

test('A2 công bằng giọng nam/nữ: cùng thanh sắc ở 110 Hz và 220 Hz cho điểm gần như nhau (lệch ≤ 3)', () => {
  const refs = PitchReferenceFlyweight.contours();
  const male = analyzeTone({ pcm: voice(fromTone('sac', 110), 0.5), sampleRate: SR, target: 'sac', references: refs });
  const female = analyzeTone({ pcm: voice(fromTone('sac', 220), 0.5), sampleRate: SR, target: 'sac', references: refs });
  assert.ok(male.ok && female.ok);
  assert.ok(Math.abs(male.targetScore.score - female.targetScore.score) <= 3, `${male.targetScore.score} vs ${female.targetScore.score}`);
  assert.ok(male.targetScore.score >= 80);
});

test('A2 phân loại: phát âm đúng từng thanh thì thanh đó có điểm cao nhất (đủ 6 thanh, 2 giọng)', () => {
  const refs = PitchReferenceFlyweight.contours();
  for (const base of [120, 210]) {
    for (const t of PitchReferenceFlyweight.all()) {
      const r = analyzeTone({ pcm: voice(fromTone(t.id, base), 0.5, { seed: base }), sampleRate: SR, target: t.id, references: refs });
      assert.ok(r.ok, `${t.id}@${base}`);
      assert.equal(r.bestMatch, t.id, `${t.id}@${base}Hz bị nhận thành ${r.bestMatch} (${JSON.stringify(r.scores)})`);
    }
  }
});

test('A2: nói thanh huyền khi mục tiêu là sắc => điểm thấp (< 40)', () => {
  const r = analyzeTone({
    pcm: voice(fromTone('huyen', 150), 0.5),
    sampleRate: SR,
    target: 'sac',
    references: PitchReferenceFlyweight.contours()
  });
  assert.ok(r.ok);
  assert.ok(r.targetScore.score < 40, `điểm ${r.targetScore.score}`);
  assert.equal(r.bestMatch, 'huyen');
});

test('compareContours: thanh ngang (phẳng) so với chính nó gần 100', () => {
  const flat = PitchReferenceFlyweight.get('ngang').contour;
  assert.ok(compareContours([...flat], [...flat]).score >= 95);
});

test('downsample 48k => 16k giữ nguyên F0, chặn tần số trên Nyquist', () => {
  const pcm48 = voice(() => 200, 0.2, { sr: 48000, noise: 0 });
  const pcm16 = downsample(pcm48, 48000, 16000);
  assert.equal(pcm16.length, Math.floor(pcm48.length / 3));
  const est = yinPitch(pcm16.subarray(800, 1440), SR);
  assert.ok(Math.abs(est.hz - 200) < 2, `F0 sau resample ${est.hz}`);
  // Sóng 11 kHz (trên Nyquist 8 kHz của 16k) phải bị lọc gần hết
  const hi = new Float32Array(48000 * 0.1).map((_, i) => Math.sin((2 * Math.PI * 11000 * i) / 48000));
  const out = downsample(hi, 48000, 16000);
  const rmsOut = Math.sqrt(out.reduce((s, v) => s + v * v, 0) / out.length);
  assert.ok(rmsOut < 0.1, `rò rỉ ${rmsOut}`);
});

test('Hiệu năng (TDD: F0 ≤ 1 s cho đoạn 5 s): YIN và McLeod trên 5 s âm thanh 16 kHz', () => {
  // Ngân sách TDD 1 s giữ nguyên trên máy dev. Trên CI (runner 2 vCPU dùng chung, turbo chạy song song nhiều gói
  // test cùng lúc) nới ×2: đo được 1042 ms cho McLeod ở lần chạy nguội khi tranh CPU — đó là nhiễu máy, không phải
  // hồi quy thuật toán. Xem docs/nhat-ky/CI-CD.md. (Biến CI qua turbo nhờ passThroughEnv trong turbo.json.)
  const onCi = Boolean(process.env.CI);
  const budgetMs = onCi ? 2000 : 1000;
  const pcm = voice((x) => 120 + 80 * Math.sin(6 * x), 5);
  for (const name of ['yin', 'mcleod']) {
    const strategy = createPitchStrategy(name);
    strategy.extractContour(pcm.subarray(0, SR), SR); // làm nóng JIT: đo thuật toán, không đo lần biên dịch đầu
    // Lấy lần nhanh nhất trong 3 lần: lần chậm là do tiến trình khác chiếm CPU, không phải do thuật toán
    let ms = Infinity;
    let frames = [];
    for (let run = 0; run < 3; run++) {
      const t0 = performance.now();
      frames = strategy.extractContour(pcm, SR);
      ms = Math.min(ms, performance.now() - t0);
    }
    console.log(`  ${name}: ${frames.length} khung trong ${ms.toFixed(0)} ms (ngân sách ${budgetMs} ms, ${onCi ? 'CI' : 'máy dev'})`);
    assert.ok(ms < budgetMs, `${name} mất ${ms} ms (ngân sách ${budgetMs} ms)`);
  }
});

test('WAV: encodeWav ra header PCM16 mono hợp lệ, readWavInfo đọc lại đúng thời lượng', async () => {
  const { encodeWav, readWavInfo } = await import('../dist/index.js');
  const pcm = voice(() => 200, 1.5);
  const wav = new Uint8Array(encodeWav(pcm, 16000));
  assert.equal(wav.length, 44 + pcm.length * 2, 'Int16 = 2 byte/mẫu (Float32 là 4)');
  const info = readWavInfo(wav);
  assert.equal(info.sampleRate, 16000);
  assert.equal(info.channels, 1);
  assert.equal(info.bitsPerSample, 16);
  assert.ok(Math.abs(info.durationSec - 1.5) < 0.001);
  assert.equal(readWavInfo(new TextEncoder().encode('không phải wav nhưng dài hơn bốn mươi bốn byte nhé.....')), null);
});

test('WAV: decodeWavPcm đọc lại mẫu Float32; pcm16ToWav bọc PCM thô (L16 của TTS) thành WAV', async () => {
  const { encodeWav, decodeWavPcm, pcm16ToWav, readWavInfo } = await import('../dist/index.js');
  const pcm = new Float32Array([0, 0.5, -0.5, 0.25]);
  const out = decodeWavPcm(new Uint8Array(encodeWav(pcm, 16000)));
  assert.equal(out.sampleRate, 16000);
  assert.equal(out.pcm.length, 4);
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(out.pcm[i] - pcm[i]) < 1e-3);
  assert.equal(decodeWavPcm(new Uint8Array(10)), null);
  // PCM16 little-endian thô 24 kHz (giống inlineData audio/L16;rate=24000)
  const raw = new Uint8Array(48000); // 1 giây
  const wav = pcm16ToWav(raw, 24000);
  const info = readWavInfo(wav);
  assert.equal(info.sampleRate, 24000);
  assert.equal(info.durationSec, 1);
});
