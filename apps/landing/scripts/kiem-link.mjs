/**
 * Kiểm mọi link nội bộ trong dist/ trỏ tới tệp có thật (href, src, srcset, preload; bỏ qua link ra ngoài, mailto, #neo).
 * Chạy sau build: node scripts/kiem-link.mjs [thư-mục-dist]. Thoát mã 1 nếu có link chết.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** /duong-dan => tệp tương ứng trong dist (thư mục => index.html) */
function exists(urlPath) {
  const clean = decodeURIComponent(urlPath.split('#')[0].split('?')[0]);
  const target = join(dist, clean);
  if (existsSync(target) && statSync(target).isFile()) return true;
  return existsSync(join(target, 'index.html'));
}

const dead = [];
let checked = 0;
for (const file of walk(dist).filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(file, 'utf8');
  for (const m of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const url = m[1];
    if (/^(https?:|mailto:|tel:|data:|#|\/\/)/.test(url) || url === '' || /\.apk$/i.test(url)) continue; // .apk do bước phát hành đặt (Pages hoặc R2), không nằm trong dist
    // link ra app (LANDING_APP_ORIGIN) là tuyệt đối nên đã bị bỏ qua ở trên
    const path = url.startsWith('/') ? url : join('/', dirname(file.slice(dist.length).replace(/\\/g, '/')), url).replace(/\\/g, '/');
    checked++;
    if (!exists(path)) dead.push(`${file.slice(dist.length)}: ${url}`);
  }
}
if (dead.length) {
  console.error(`Link nội bộ chết (${dead.length}):\n${dead.join('\n')}`);
  process.exit(1);
}
console.log(`OK: ${checked} link nội bộ đều trỏ tới tệp có trong ${dist}`);
