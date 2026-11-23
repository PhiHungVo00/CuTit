import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Giữ nguyên tắc: MỌI nguồn phát/thu âm báo vào điều phối (acquireAudio) để nhạc nền dừng.
 * Thêm nguồn mới ⇒ test này đỏ cho tới khi bọc nguồn và thêm vào danh sách trắng bên dưới.
 */
// Gốc monorepo = thư mục chứa pnpm-workspace.yaml (tìm ngược lên, không phụ thuộc bố cục 4 thư mục hay bố cục phẳng)
function findRoot(dir) {
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const up = join(dir, '..');
    if (up === dir) throw new Error('không tìm thấy pnpm-workspace.yaml');
    dir = up;
  }
  return dir;
}
const ROOT = findRoot(fileURLToPath(new URL('.', import.meta.url)));

const WRAPPED = [
  'packages/native/src/speech.ts', // Web Speech + TTS native
  'packages/audio-dsp/src/audio/AudioCaptureBridge.ts', // mọi thu âm
  'packages/exercises/src/audio/coursePlayer.ts', // âm bài học dựng sẵn
  'apps/mfe-conversation/src/call/useCall.ts', // cuộc gọi
  'apps/mfe-knowledge/src/services/speechSynthesis.ts' // giọng Gateway
];
/** Chính điều phối: nhạc nền/hiệu ứng tự phát, không phải nguồn cần báo. */
const COORDINATOR = ['packages/shared/src/audio/music.ts', 'packages/shared/src/audio/sfx.ts'];

/**
 * Trang giới thiệu (apps/landing) là trang tĩnh riêng, KHÔNG dùng @vietlearning/shared (kéo vào sẽ phá ngân sách 30 kB) và không có nhạc nền
 * của app để dừng. Âm thanh ở đó chỉ phát khi người dùng bấm, và nút tự dừng nguồn đang phát trước khi phát nguồn khác.
 */
const SKIP_PREFIX = ['apps/landing/'];

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

const OWNER_DIRS = readdirSync(ROOT).filter((n) => /^0\d-/.test(n));
// Đường dẫn tính theo apps/… hoặc packages/… (bỏ tiền tố thư mục sở hữu 0N-…) để danh sách trắng không đổi khi chuyển người sở hữu
const rel = (p) => relative(ROOT, p).split(sep).join('/').replace(/^0\d-[^/]+\//, '');
function isFile(p) { try { return statSync(p).isFile(); } catch { return false; } }
const abs = (r) => join(ROOT, OWNER_DIRS.find((d) => isFile(join(ROOT, d, r))) ?? '', r);

test('không có nguồn phát/thu âm nào ngoài danh sách đã bọc', () => {
  const offenders = [];
  for (const top of OWNER_DIRS.flatMap((d) => [join(d, 'apps'), join(d, 'packages')])) {
    for (const f of walk(join(ROOT, top))) {
      const r = rel(f);
      if (WRAPPED.includes(r) || COORDINATOR.includes(r) || SKIP_PREFIX.some((p) => r.startsWith(p))) continue;
      if (PATTERN.test(readFileSync(f, 'utf8'))) offenders.push(r);
    }
  }
  assert.deepEqual(offenders, [], `nguồn âm chưa báo điều phối: ${offenders.join(', ')}`);
});

test('mỗi nguồn trong danh sách đã gọi acquireAudio', () => {
  for (const r of WRAPPED) {
    assert.match(readFileSync(abs(r), 'utf8'), /acquireAudio\(/, `${r} chưa gọi acquireAudio`);
  }
});
