#!/usr/bin/env node
/**
 * Kiểm tra máy đã đủ phần mềm để chạy app Bé Cu Tít chưa (NHOM-2).
 * Chạy:  node scripts/nhom/kiem-tra-may.mjs
 *
 * - Chỉ ĐỌC (hỏi phiên bản, kiểm cổng), không cài gì, không sửa gì, không gọi mạng.
 * - Tự nhận biết bố cục repo: có thư mục `01-nen-tang` (sau PR #34) hay còn `apps/` ở gốc.
 * - Mục bắt buộc chưa đạt => thoát mã 1. Mục tùy chọn (Java, adb) chỉ nhắc, không làm hỏng kết quả.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const IS_WIN = process.platform === 'win32';
const NEW_LAYOUT = existsSync(join(ROOT, '01-nen-tang'));

const color = (code) => (s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = color(32);
const red = color(31);
const yellow = color(33);
const dim = color(2);

/** Chạy lệnh, trả { ok, out }. shell:true để Windows tìm được pnpm.cmd / corepack.cmd. */
function run(cmd, args, cwd = ROOT) {
  // Windows: cần shell để tìm pnpm.cmd/corepack.cmd; ghép thành một chuỗi (lệnh cố định, không có dữ liệu ngoài) để khỏi cảnh báo DEP0190
  const r = IS_WIN
    ? spawnSync([cmd, ...args].join(' '), { cwd, encoding: 'utf8', shell: true, timeout: 20_000, windowsHide: true })
    : spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 20_000 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  return { ok: r.status === 0 && !r.error, out };
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

const pkg = readJson(join(ROOT, 'package.json'));
const WANT_PNPM = (pkg?.packageManager ?? 'pnpm@12.9.1').split('@')[1];
let WANT_NODE = 24;
try {
  const m = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8').match(/NODE_VERSION:\s*(\d+)/);
  if (m) WANT_NODE = Number(m[1]);
} catch {
  /* không có CI => dùng 24 */
}

const results = [];
/** level: 'bat-buoc' | 'khuyen-nghi' | 'tuy-chon' */
function report(level, name, ok, detail, fix) {
  results.push({ level, ok });
  const tag = ok ? green('đạt     ') : level === 'bat-buoc' ? red('CHƯA ĐẠT') : level === 'khuyen-nghi' ? yellow('cảnh báo') : yellow('chưa có ');
  console.log(`${tag}  ${name}${detail ? dim(`  — ${detail}`) : ''}`);
  if (!ok && fix) for (const line of fix.split('\n')) console.log(`          ${line}`);
}

function portFree(port) {
  return new Promise((done) => {
    const srv = createServer();
    srv.once('error', () => done(false));
    srv.once('listening', () => srv.close(() => done(true)));
    srv.listen(port, '127.0.0.1');
  });
}

console.log(`\nKiểm tra máy cho dự án Bé Cu Tít (${process.platform})`);
console.log(dim(`Thư mục dự án: ${ROOT}`));
console.log(dim(`Bố cục repo: ${NEW_LAYOUT ? 'MỚI (4 thư mục 01-nen-tang … 04-am-thanh-tri-thuc)' : 'CŨ (apps/ và packages/ ở gốc)'}\n`));

console.log('— Bắt buộc —');

// Node
const nodeMajor = Number(process.versions.node.split('.')[0]);
report(
  'bat-buoc',
  `Node.js ≥ ${WANT_NODE}`,
  nodeMajor >= WANT_NODE,
  `đang dùng v${process.versions.node}`,
  `Cài Node.js ${WANT_NODE} LTS từ https://nodejs.org (chọn bản LTS), đóng và mở lại cửa sổ lệnh, chạy lại script này.`
);

// corepack
const cp = run('corepack', ['--version']);
report(
  'bat-buoc',
  'corepack (đi kèm Node, dùng để có đúng pnpm)',
  cp.ok,
  cp.ok ? `v${cp.out.split('\n')[0]}` : '',
  'Corepack có sẵn trong Node từ bản 16. Nếu thiếu: cài lại Node từ https://nodejs.org rồi thử lại.\n' +
    'Nếu lệnh tồn tại nhưng báo lỗi quyền: mở PowerShell bằng "Run as administrator" và chạy: corepack enable'
);

// pnpm trong repo
let pnpmOk = false;
let pnpmDetail = '';
if (cp.ok) {
  const p = run('corepack', ['pnpm', '--version']);
  pnpmDetail = p.ok ? `corepack pnpm → ${p.out.split('\n').pop()}` : p.out.split('\n').slice(-1)[0];
  pnpmOk = p.ok && p.out.trim().split('\n').pop() === WANT_PNPM;
}
report(
  'bat-buoc',
  `pnpm ${WANT_PNPM} (qua corepack)`,
  pnpmOk,
  pnpmDetail,
  `Chạy:  corepack enable   rồi   corepack prepare pnpm@${WANT_PNPM} --activate\n` +
    `Lần đầu cần mạng để tải pnpm. Từ đó dùng lệnh:  corepack pnpm <lệnh>  (hoặc  pnpm <lệnh>  sau khi corepack enable).`
);

// pnpm toàn cục (cảnh báo bản sai)
const g = run('pnpm', ['--version'], homedir());
if (g.ok) {
  const gv = g.out.split('\n').pop();
  const inRepo = run('pnpm', ['--version'], ROOT);
  const rv = inRepo.ok ? inRepo.out.split('\n').pop() : gv;
  const fine = rv === WANT_PNPM;
  report(
    'khuyen-nghi',
    'Lệnh `pnpm` trần trong thư mục dự án là bản đúng',
    fine,
    `ngoài dự án v${gv}, trong dự án v${rv}`,
    `Lệnh pnpm trần của bạn là bản ${rv}, KHÔNG phải ${WANT_PNPM} => "pnpm install" sẽ báo "lockfile hỏng/không tương thích".\n` +
    `Đừng gõ  pnpm ...  — hướng dẫn nhóm luôn dùng  corepack pnpm ...  nên máy vẫn chạy được.\n` +
      `Cách khắc phục: gõ  corepack enable  (có thể cần PowerShell quyền admin) rồi mở lại cửa sổ lệnh;\n` +
      `hoặc luôn gõ  corepack pnpm ...  thay cho  pnpm ...  (an toàn nhất, không đụng cài đặt toàn máy).`
  );
} else {
  console.log(dim('          (chưa có lệnh `pnpm` riêng — không sao, dùng `corepack pnpm ...`)'));
}

// git
const git = run('git', ['--version']);
report('bat-buoc', 'Git', git.ok, git.ok ? git.out : '', 'Cài Git từ https://git-scm.com/downloads rồi mở lại cửa sổ lệnh.');

// đường dẫn
const pathWarn = [];
if (ROOT.length > 70) pathWarn.push(`đường dẫn dài (${ROOT.length} ký tự)`);
// eslint-disable-next-line no-control-regex
if (/[^\x00-\x7F]/.test(ROOT)) pathWarn.push('đường dẫn có chữ có dấu / ký tự đặc biệt');
if (/\s/.test(ROOT)) pathWarn.push('đường dẫn có dấu cách');
report(
  'khuyen-nghi',
  'Đường dẫn thư mục dự án ngắn, không dấu (khuyến nghị)',
  pathWarn.length === 0,
  pathWarn.join('; '),
  'Windows giới hạn ~260 ký tự đường dẫn; pnpm/Android có thể lỗi "path too long" hoặc không tìm thấy tệp.\n' +
    'Hãy clone vào thư mục ngắn, không dấu, không dấu cách, ví dụ  C:\\code\\becutit  (git clone <url> C:\\code\\becutit).\n' +
    'Chưa muốn chuyển ngay: chạy  git config --global core.longpaths true  (giảm lỗi, chưa chắc hết).'
);

// cổng
const wantPorts = [
  [4000, 'Gateway (backend)'],
  [5173, 'Giao diện web (Vite dev)']
];
for (const [port, label] of wantPorts) {
  const free = await portFree(port);
  report(
    'bat-buoc',
    `Cổng ${port} đang rảnh — ${label}`,
    free,
    free ? '' : 'đang có chương trình khác dùng',
    IS_WIN
      ? `Tìm chương trình đang chiếm:  Get-NetTCPConnection -LocalPort ${port} | Select OwningProcess   rồi   Get-Process -Id <số>\n` +
          `Nếu đó là phiên chạy cũ của bạn: đóng cửa sổ lệnh đó. Hoặc đổi cổng (xem mục "Cổng bận" trong docs/nhom/CAI-DAT.md).`
      : `Tìm chương trình đang chiếm:  lsof -i :${port}   (đóng nó, hoặc đổi cổng — xem mục "Cổng bận" trong docs/nhom/CAI-DAT.md).`
  );
}

console.log('\n— Tùy chọn (chỉ cần nếu làm phần Android) —');

// Java
const java = run('java', ['-version']);
const jv = java.out.match(/version "(\d+)/)?.[1];
report(
  'tuy-chon',
  'JDK 21 (build APK Android)',
  java.ok && jv === '21',
  java.ok ? `java ${jv ?? '?'}` : '',
  'Cài Temurin JDK 21 từ https://adoptium.net (chọn 21 LTS), hoặc đi kèm Android Studio.\n' +
    'Sau khi cài, đặt biến JAVA_HOME trỏ tới thư mục JDK (xem mục Android trong docs/nhom/CAI-DAT.md).' +
    (java.ok && jv !== '21' ? `\nMáy đang có Java ${jv}; Capacitor 7 cần đúng 21.` : '')
);

// adb
const adb = run('adb', ['--version']);
report(
  'tuy-chon',
  'adb (nối điện thoại / máy ảo Android)',
  adb.ok,
  adb.ok ? adb.out.split('\n')[0] : '',
  'adb nằm trong Android Studio (SDK Platform-Tools). Thêm  %LOCALAPPDATA%\\Android\\Sdk\\platform-tools  vào biến PATH,\n' +
    'hoặc cài Android Studio từ https://developer.android.com/studio rồi mở lại cửa sổ lệnh.'
);

const ANDROID_HOME = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
const sdkGuess = join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Android', 'Sdk');
report(
  'tuy-chon',
  'Android SDK',
  Boolean(ANDROID_HOME && existsSync(ANDROID_HOME)) || existsSync(sdkGuess),
  ANDROID_HOME ?? (existsSync(sdkGuess) ? sdkGuess : ''),
  'Cài Android Studio, mở lần đầu để nó tải SDK. Sau đó đặt ANDROID_HOME (xem docs/nhom/CAI-DAT.md).'
);

// tệp bí mật
const envFile = process.env.BECUTIT_ENV_FILE ?? join(homedir(), '.becutit', 'gateway.env');
console.log(
  dim(
    `\nTệp khóa AI cá nhân: ${envFile} — ${existsSync(envFile) ? 'đã có' : 'chưa có (chạy được ở chế độ không khóa; muốn có AI thật: node scripts/nhom/tao-env.mjs)'}`
  )
);

const failedRequired = results.filter((r) => r.level === 'bat-buoc' && !r.ok).length;
const missingOptional = results.filter((r) => r.level === 'tuy-chon' && !r.ok).length;
console.log('');
const warnings = results.filter((r) => r.level === 'khuyen-nghi' && !r.ok).length;
if (failedRequired === 0) {
  if (warnings) console.log(yellow(`Có ${warnings} cảnh báo (không chặn, nhưng nên xử lý nếu sau này gặp lỗi đường dẫn).`));
  console.log(green('✔ Đủ điều kiện chạy app trên web.'), missingOptional ? yellow(`(Còn ${missingOptional} mục tùy chọn cho Android.)`) : green('Cả phần Android cũng đủ.'));
  console.log('Bước tiếp theo: xem docs/nhom/CAI-DAT.md, mục "Cài thư viện, build, chạy".\n');
  process.exit(0);
}
console.log(red(`✘ Còn ${failedRequired} mục bắt buộc chưa đạt.`), 'Làm theo dòng hướng dẫn dưới mỗi mục rồi chạy lại script này.\n');
process.exit(1);
