#!/usr/bin/env node
/**
 * Lấy âm thanh “Một câu, ba miền” cho trang giới thiệu (dự án 7, Task 2).
 *
 * Nguồn: kho âm thanh khóa học đã dựng sẵn (skill dung-am-thanh, D9): 01-nen-tang/apps/gateway/.data/tts (không commit).
 *   tra packs/*-{north,central,south}.json => khóa sha256 => <khóa>.wav
 * Đầu ra (commit vào repo): 01-nen-tang/apps/landing/public/audio/ba-mien-{bac,trung,nam}.{ogg,mp3}, mỗi tệp ≤ 40 kB.
 *
 * Chạy (chỉ khi cần đổi câu):
 *   node 01-nen-tang/apps/landing/scripts/lay-am-thanh.mjs --cau "Xin chào! Tôi tên là Lan."
 *   tùy chọn: --tts-dir <thư mục kho> --out <thư mục đích>; cần ffmpeg trên PATH (hoặc biến FFMPEG).
 * Mã thoát: 0 ok · 1 lỗi chuyển đổi/kích thước · 2 câu không có trong kho (kèm hướng dẫn).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_TTS_DIR = resolve(here, '..', '..', 'gateway', '.data', 'tts');
export const DEFAULT_OUT_DIR = resolve(here, '..', 'public', 'audio');
export const MAX_BYTES = 40_000;

/** Miền trong manifest (gateway) => tên tệp trên trang */
export const MIEN = { north: 'bac', central: 'trung', south: 'nam' };
const KEY_RE = /^[a-f0-9]{64}$/;

/**
 * Tìm câu trong mọi manifest của kho. Trả về [{ mien, wav }] theo thứ tự bac, trung, nam.
 * Ném lỗi code 'NOT_FOUND' nếu thiếu một miền, 'MISSING_WAV' nếu manifest trỏ tới tệp không có.
 */
export function timCau(ttsDir, cau) {
  const text = String(cau).normalize('NFC').trim();
  const packDir = join(ttsDir, 'packs');
  const files = existsSync(packDir) ? readdirSync(packDir).filter((f) => f.endsWith('.json')) : [];
  const ket = [];
  for (const [dialect, mien] of Object.entries(MIEN)) {
    let key = null;
    for (const f of files.filter((x) => x.endsWith(`-${dialect}.json`))) {
      const pack = JSON.parse(readFileSync(join(packDir, f), 'utf8'));
      const k = pack.items?.[text];
      if (typeof k === 'string' && KEY_RE.test(k)) {
        key = k;
        break;
      }
    }
    if (!key) {
      const err = new Error(
        `Không tìm thấy câu “${text}” ở miền ${mien} trong ${ttsDir}. ` +
          'Hãy dựng sẵn bằng skill dung-am-thanh (pnpm --filter @vietlearning/gateway tts:prebuild), ' +
          'hoặc chọn câu khác đã có trong kho; mẫu tham khảo ở docs/d9-tts-mau/.'
      );
      err.code = 'NOT_FOUND';
      throw err;
    }
    const wav = join(ttsDir, `${key}.wav`);
    if (!existsSync(wav)) {
      const err = new Error(`Manifest trỏ tới ${wav} nhưng tệp không có.`);
      err.code = 'MISSING_WAV';
      throw err;
    }
    ket.push({ mien, wav });
  }
  return ket;
}

/** Chuyển WAV sang ogg (Opus 48 kbps mono) và mp3 (64 kbps mono), kiểm kích thước ≤ 40 kB. */
export function chuyenDoi({ wav, mien, outDir, ffmpeg = process.env.FFMPEG || 'ffmpeg' }) {
  mkdirSync(outDir, { recursive: true });
  const dich = [
    { ext: 'ogg', args: ['-c:a', 'libopus', '-b:a', '48k', '-ar', '48000'] },
    { ext: 'mp3', args: ['-c:a', 'libmp3lame', '-b:a', '64k'] },
  ];
  const ketQua = [];
  for (const { ext, args } of dich) {
    const out = join(outDir, `ba-mien-${mien}.${ext}`);
    const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', wav, '-map_metadata', '-1', '-ac', '1', ...args, out], {
      encoding: 'utf8',
    });
    if (r.status !== 0) throw new Error(`ffmpeg lỗi (${ext}, ${mien}): ${r.stderr || r.error?.message}`);
    const bytes = statSync(out).size;
    if (bytes > MAX_BYTES) throw new Error(`${out} = ${bytes} byte, vượt 40 kB`);
    ketQua.push({ out, bytes });
  }
  return ketQua;
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function main() {
  const cau = arg('cau');
  if (!cau) {
    console.error('Dùng: node 01-nen-tang/apps/landing/scripts/lay-am-thanh.mjs --cau "<câu>" [--tts-dir <kho>] [--out <đích>]');
    return 2;
  }
  const ttsDir = resolve(arg('tts-dir', DEFAULT_TTS_DIR));
  const outDir = resolve(arg('out', DEFAULT_OUT_DIR));
  let tim;
  try {
    tim = timCau(ttsDir, cau);
  } catch (e) {
    console.error(e.message);
    return e.code === 'NOT_FOUND' ? 2 : 1;
  }
  for (const { mien, wav } of tim) {
    for (const { out, bytes } of chuyenDoi({ wav, mien: mien, outDir })) console.log(`${out}  ${bytes} byte`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main();
}
