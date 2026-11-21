import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Giữ nguyên tắc: MỌI nguồn phát/thu âm báo vào điều phối (acquireAudio) để nhạc nền dừng.
 * Thêm nguồn mới ⇒ test này đỏ cho tới khi bọc nguồn và thêm vào danh sách trắng bên dưới.
 */
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');

const WRAPPED = [
  'packages/native/src/speech.ts', // Web Speech + TTS native
  'packages/audio-dsp/src/audio/AudioCaptureBridge.ts', // mọi thu âm
  'packages/exercises/src/audio/coursePlayer.ts', // âm bài học dựng sẵn
  'apps/mfe-conversation/src/call/useCall.ts', // cuộc gọi
  'apps/mfe-knowledge/src/services/speechSynthesis.ts' // giọng Gateway
];
/** Chính điều phối: nhạc nền/hiệu ứng tự phát, không phải nguồn cần báo. */
const COORDINATOR = ['packages/shared/src/audio/music.ts', 'packages/shared/src/audio/sfx.ts'];

const PATTERN = /new Audio\(|speechSynthesis\.speak|\.speak\(u\)|getUserMedia\(\s*\{\s*audio|AudioWorkletNode\(/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.turbo', 'android', 'e2e', 'test', 'coverage', '.claude', 'docs']);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield p;
  }
}

const rel = (p) => relative(ROOT, p).split(sep).join('/');

test('không có nguồn phát/thu âm nào ngoài danh sách đã bọc', () => {
  const offenders = [];
  for (const top of ['apps', 'packages']) {
    for (const f of walk(join(ROOT, top))) {
      const r = rel(f);
      if (WRAPPED.includes(r) || COORDINATOR.includes(r)) continue;
      if (PATTERN.test(readFileSync(f, 'utf8'))) offenders.push(r);
    }
  }
  assert.deepEqual(offenders, [], `nguồn âm chưa báo điều phối: ${offenders.join(', ')}`);
});

test('mỗi nguồn trong danh sách đã gọi acquireAudio', () => {
  for (const r of WRAPPED) {
    assert.match(readFileSync(join(ROOT, r), 'utf8'), /acquireAudio\(/, `${r} chưa gọi acquireAudio`);
  }
});
