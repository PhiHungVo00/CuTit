// Kiểm thử script lay-am-thanh.mjs (dùng manifest giả trong thư mục tạm, không cần ffmpeg).
// Chạy: node --test 01-nen-tang/apps/landing/scripts/lay-am-thanh.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { timCau } from './lay-am-thanh.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(here, 'lay-am-thanh.mjs');
const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);
const KEY_C = 'c'.repeat(64);

function taoKhoGia() {
  const dir = mkdtempSync(join(tmpdir(), 'tts-gia-'));
  mkdirSync(join(dir, 'packs'), { recursive: true });
  const cau = 'Xin chào! Tôi tên là Lan.';
  const goi = (key) => ({ version: 1, pack: 'u1', dialect: '', model: 'test', voice: 'test', items: { [cau]: key } });
  writeFileSync(join(dir, 'packs', 'u1-north.json'), JSON.stringify(goi(KEY_A)));
  writeFileSync(join(dir, 'packs', 'u1-central.json'), JSON.stringify(goi(KEY_B)));
  writeFileSync(join(dir, 'packs', 'u1-south.json'), JSON.stringify(goi(KEY_C)));
  for (const k of [KEY_A, KEY_B, KEY_C]) writeFileSync(join(dir, `${k}.wav`), Buffer.alloc(100, 1));
  return { dir, cau };
}

test('câu có trong manifest => trả đường dẫn WAV đúng cho 3 miền', () => {
  const { dir, cau } = taoKhoGia();
  try {
    const ket = timCau(dir, cau);
    assert.deepEqual(
      ket.map((r) => [r.mien, r.wav]),
      [
        ['bac', join(dir, `${KEY_A}.wav`)],
        ['trung', join(dir, `${KEY_B}.wav`)],
        ['nam', join(dir, `${KEY_C}.wav`)],
      ]
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('câu có khoảng trắng thừa vẫn khớp (chuẩn hóa NFC + trim)', () => {
  const { dir, cau } = taoKhoGia();
  try {
    assert.equal(timCau(dir, `  ${cau}  `).length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('câu không có trong manifest => báo lỗi NOT_FOUND', () => {
  const { dir } = taoKhoGia();
  try {
    assert.throws(() => timCau(dir, 'Câu không tồn tại'), (e) => e.code === 'NOT_FOUND');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('chạy CLI với câu không có => thoát mã 2 kèm hướng dẫn', () => {
  const { dir } = taoKhoGia();
  try {
    const r = spawnSync(process.execPath, [SCRIPT, '--cau', 'Câu không tồn tại', '--tts-dir', dir], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /dung-am-thanh/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
