#!/usr/bin/env node
/**
 * Gộp 4 thư mục sở hữu (01-nen-tang … 04-am-thanh-tri-thuc) về bố cục phẳng cũ: apps/ + packages/ ở gốc.
 *
 * Dùng:
 *   node scripts/gop-lai-monorepo.mjs [--dir <thư mục repo>] [--dry-run] [--no-lockfile] [--force]
 *
 * Làm gì (mỗi việc một lệnh git, lịch sử được giữ vì chỉ dùng `git mv`):
 *   1. `git mv 0N-…/apps/<x> apps/<x>` và `git mv 0N-…/packages/<x> packages/<x>` cho mọi thư mục con.
 *   2. Xóa README.md của từng thư mục sở hữu, CODEOWNERS giữ lại nhưng bỏ các dòng thư mục 0N-.
 *   3. Sửa pnpm-workspace.yaml về `apps/*` + `packages/*`.
 *   4. Sửa các đường dẫn tương đối bị lệch vì chuyển cấp (bảng LEGACY_EDITS) và bỏ tiền tố `0N-…/` khỏi mọi
 *      đường dẫn trong tệp mã, cấu hình, CI, skill (KHÔNG đụng docs/ — tài liệu và nhật ký giữ nguyên lịch sử).
 *   5. `pnpm install --lockfile-only` để sinh lại pnpm-lock.yaml (bỏ bằng --no-lockfile).
 *
 * Không tự commit: xem `git status`, chạy build/test rồi commit tay.
 * Đã chạy thử trên bản sao tạm (xem mô tả PR); KHÔNG chạy trên nhánh đang làm việc nếu chưa muốn gộp.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const dirArg = args.indexOf('--dir') >= 0 ? args[args.indexOf('--dir') + 1] : process.cwd();
const ROOT = dirArg;
const DRY = flag('--dry-run');

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
const log = (m) => console.log(m);

const OWNER_RE = /^0[1-4]-[a-z0-9-]+$/;
const ownerDirs = readdirSync(ROOT).filter((n) => OWNER_RE.test(n) && statSync(join(ROOT, n)).isDirectory());
if (!ownerDirs.length) {
  log('Không có thư mục 0N-… nào: repo đã ở bố cục phẳng, không cần làm gì.');
  process.exit(0);
}
if (!flag('--force') && git('status', '--porcelain', '--untracked-files=no').trim()) {
  console.error('Có thay đổi chưa commit. Commit/hoàn tác trước, hoặc thêm --force.');
  process.exit(1);
}

/* ---- 1. git mv ---- */
for (const od of ownerDirs.sort()) {
  for (const kind of ['apps', 'packages']) {
    const base = join(ROOT, od, kind);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      if (!statSync(join(base, name)).isDirectory()) continue;
      const dest = join(ROOT, kind, name);
      if (existsSync(dest)) throw new Error(`Đích đã tồn tại: ${kind}/${name}`);
      log(`git mv ${od}/${kind}/${name} -> ${kind}/${name}`);
      if (!DRY) {
        mkdirSync(join(ROOT, kind), { recursive: true });
        git('mv', `${od}/${kind}/${name}`, `${kind}/${name}`);
      }
    }
  }
}
if (DRY) {
  log('(--dry-run: dừng ở đây, chưa sửa gì)');
  process.exit(0);
}

/* ---- 2. README thư mục sở hữu, thư mục rỗng ---- */
for (const od of ownerDirs) {
  const readme = `${od}/README.md`;
  if (existsSync(join(ROOT, readme))) git('rm', '-q', '-f', readme);
  // thư mục rỗng còn sót (apps/, packages/, hoặc tệp không theo dõi như node_modules cũ) → xóa nếu rỗng thật
  for (const kind of ['apps', 'packages']) {
    const p = join(ROOT, od, kind);
    if (existsSync(p) && !readdirSync(p).length) rmSync(p, { recursive: true });
  }
  const p = join(ROOT, od);
  if (existsSync(p) && !readdirSync(p).length) rmSync(p, { recursive: true });
  else if (existsSync(p)) log(`LƯU Ý: ${od}/ còn tệp không theo dõi (vd. node_modules/dist); xóa tay nếu không cần.`);
}

/* ---- 3. pnpm-workspace.yaml ---- */
const wsPath = join(ROOT, 'pnpm-workspace.yaml');
let ws = readFileSync(wsPath, 'utf8');
ws = ws
  .replace(/^#.*\n/gm, '') // bỏ ghi chú nói về 4 thư mục
  .replace(/^(\s*-\s*)['"]0\[1-4\]-\*\/apps\/\*['"]/m, "$1'apps/*'")
  .replace(/^(\s*-\s*)['"]0\[1-4\]-\*\/packages\/\*['"]/m, "$1'packages/*'");
writeFileSync(wsPath, ws);

/* ---- 4. Sửa đường dẫn ---- */
const trackedFiles = () => git('ls-files', '-z').split('\0').filter(Boolean);
const TEXT_EXT = /\.(ts|tsx|mjs|cjs|js|json|css|yml|yaml|md|ps1|gradle|properties|html|xml|txt|py|kt|java)$|(^|\/)(CODEOWNERS|\.gitignore|\.gitattributes|\.env\.example)$/;

/** Sửa tay: [tệp (sau khi chuyển), mẫu, thay thế]. Mẫu là chuỗi (replaceAll) hoặc RegExp. */
const LEGACY_EDITS = [
  // mọi tsconfig của app/gói: extends +1 cấp ở bố cục 4 thư mục
  [/^(apps|packages)\/[^/]+\/tsconfig[^/]*\.json$/, '"../../../tsconfig.base.json"', '"../../tsconfig.base.json"'],
  ['apps/gateway/scripts/ai-stt-smoke.mjs', "'../../../../docs/", "'../../../docs/"],
  ['apps/host-shell/scripts/make-icons.mjs', "resolve(hostShell, '../../..')", "resolve(hostShell, '../..')"],
  ['apps/host-shell/scripts/build-apk.ps1', "'..\\..\\..'", "'..\\..'"],
  ['apps/host-shell/scripts/build-apk.ps1', '../../../../node_modules', '../../../node_modules'],
  ['apps/host-shell/scripts/build-apk.ps1', "--filter='./0*/packages/*'", "--filter='./packages/*'"],
  ['apps/host-shell/android/capacitor.settings.gradle', "'../../../../node_modules/", "'../../../node_modules/"],
  // Tailwind @source: MFE nằm cạnh host-shell trở lại
  ['apps/host-shell/src/styles/app.css', /@source '\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/0[1-4]-[a-z0-9-]+\/apps\/(mfe-[a-z-]+)\/src';/g, "@source '../../../$1/src';"],
  ['apps/host-shell/src/styles/app.css', /@source '\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/0[1-4]-[a-z0-9-]+\/packages\/([a-z-]+)\/src';/g, "@source '../../../../packages/$1/src';"],
  ['apps/host-shell/src/styles/app.css', "@source '../../../packages/ui/src';", "@source '../../../../packages/ui/src';"],
  ['packages/contracts/test/a8.test.mjs', "'../../../../04-am-thanh-tri-thuc/packages/content/dist/index.js'", "'../../content/dist/index.js'"],
  // depcruise: bỏ tiền tố thư mục sở hữu khỏi luật
  ['.dependency-cruiser.cjs', "const OWNER = '^0\\\\d-[^/]+/';", "const OWNER = '^';"],
  ['package.json', /depcruise 01-nen-tang 02-hoi-thoai-ai 03-hoc-tap 04-am-thanh-tri-thuc --config/g, 'depcruise apps packages --config'],
  ['.gitignore', /^0\*\//gm, '']
];

const edit = (file, pattern, repl) => {
  const full = join(ROOT, file);
  if (!existsSync(full)) return false;
  const before = readFileSync(full, 'utf8');
  const after = typeof pattern === 'string' ? before.split(pattern).join(repl) : before.replace(pattern, repl);
  if (after === before) return false;
  writeFileSync(full, after);
  return true;
};

const files = trackedFiles().filter((f) => TEXT_EXT.test(f));
let changed = 0;
for (const [target, pattern, repl] of LEGACY_EDITS) {
  const targets = target instanceof RegExp ? files.filter((f) => target.test(f)) : [target];
  for (const f of targets) if (edit(f, pattern, repl)) changed++;
}

// bỏ tiền tố 0N-… khỏi mọi đường dẫn còn lại (xuôi `/` và ngược `\`), trừ docs/ và chính tập lệnh gộp/chia
const PREFIX_FWD = /\b0[1-4]-[a-z0-9-]+\/(apps|packages)\//g;
const PREFIX_BACK = /\b0[1-4]-[a-z0-9-]+\\(apps|packages)\\/g;
const SKIP = /^(docs\/|scripts\/(gop-lai-monorepo|chia-4-thu-muc)\.mjs$)/;
for (const f of trackedFiles()) {
  if (!existsSync(join(ROOT, f)) || SKIP.test(f) || !TEXT_EXT.test(f)) continue;
  const full = join(ROOT, f);
  const before = readFileSync(full, 'utf8');
  let after = before.replace(PREFIX_FWD, '$1/').replace(PREFIX_BACK, '$1\\');
  if (f === '.github/CODEOWNERS') after = after.split(/\r?\n/).filter((l) => !/^\/0[1-4]-[^/]+\/\s/.test(l)).join('\n');
  if (after !== before) {
    writeFileSync(full, after);
    changed++;
  }
}
log(`Đã sửa ${changed} tệp (đường dẫn).`);

/* ---- 5. lockfile ---- */
if (!flag('--no-lockfile')) {
  log('corepack pnpm install --lockfile-only …');
  execFileSync('corepack', ['pnpm', 'install', '--lockfile-only'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
}
log('\nXong. Kiểm: git status; corepack pnpm install --frozen-lockfile; corepack pnpm build; pnpm test; pnpm lint:boundaries.');
