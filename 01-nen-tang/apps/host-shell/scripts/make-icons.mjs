/**
 * Sinh icon PWA + icon Android (legacy, round, adaptive foreground) + splash từ MỘT ảnh gốc.
 * Chạy lại khi có ảnh nét hơn:  pnpm --filter @vietlearning/host-shell make-icons [-- đường/dẫn/ảnh.webp]
 *
 * - Ảnh gốc mặc định: docs/thiet-ke/tam/cutit-icon-app.webp (bản nháp ~230px, đầu Cu Tít hình tròn).
 * - Kích thước mipmap/splash lấy theo CHÍNH tệp đang có trong res/ (không cứng số) nên chạy lại vẫn khớp.
 * - Nền kem #FBF3E4. Adaptive: foreground trong suốt, đầu nằm trong vùng an toàn 66dp/108dp.
 * Dùng sharp (devDependency của host-shell; không có cách đọc/ghi WebP/PNG khác trong repo).
 */
import sharp from 'sharp';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const CREAM = '#FBF3E4';
const here = dirname(fileURLToPath(import.meta.url));
const hostShell = resolve(here, '..');
const repoRoot = resolve(hostShell, '../..');
const src = resolve(process.argv[2] ?? join(repoRoot, 'docs/thiet-ke/tam/cutit-icon-app.webp'));
const icons = join(hostShell, 'public/icons');
const res = join(hostShell, 'android/app/src/main/res');

if (!existsSync(src)) throw new Error(`Không thấy ảnh gốc: ${src}`);

/** Ảnh gốc đã cắt tròn (viền trong suốt) và vuông. lanczos3 để phóng lên đỡ vỡ. */
const head = (px) => sharp(src).resize(px, px, { fit: 'cover', kernel: 'lanczos3' }).png().toBuffer();

/** Canvas size×size: nền (hoặc trong suốt) + đầu Cu Tít chiếm `ratio` cạnh, ở giữa */
async function compose(size, ratio, { background = CREAM, round = false } = {}) {
  const d = Math.round(size * ratio);
  const offset = Math.round((size - d) / 2);
  let img = sharp({ create: { width: size, height: size, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await head(d), left: offset, top: offset }]);
  if (round) {
    const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);
    img = sharp(await img.png().toBuffer()).composite([{ input: mask, blend: 'dest-in' }]);
  }
  return img.png({ compressionLevel: 9 }).toBuffer();
}

const written = [];
async function out(file, buf) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, buf);
  written.push(relative(hostShell, file).split(sep).join('/'));
}
async function sizeOf(file) {
  const m = await sharp(file).metadata();
  return { w: m.width, h: m.height };
}

// ---- PWA ----
await out(join(icons, 'icon-192.png'), await compose(192, 0.9));
await out(join(icons, 'icon-512.png'), await compose(512, 0.9)); // cũng là bản 512 cho Google Play
await out(join(icons, 'apple-touch-icon.png'), await compose(180, 0.9));
// maskable: mọi launcher có thể cắt tới 80% đường kính => nội dung gói trong vòng tròn 62% cạnh
await out(join(icons, 'maskable-512.png'), await compose(512, 0.62));

// ---- Android mipmap (kích thước theo tệp hiện có) ----
const dirs = await readdir(res);
for (const d of dirs.filter((n) => /^mipmap-(m|h|xh|xxh|xxxh)dpi$/.test(n))) {
  const dir = join(res, d);
  const { w } = await sizeOf(join(dir, 'ic_launcher.png'));
  await out(join(dir, 'ic_launcher.png'), await compose(w, 0.9));
  await out(join(dir, 'ic_launcher_round.png'), await compose(w, 0.9, { round: true }));
  // foreground adaptive: ô 108dp = w*108/48; đầu vừa vùng an toàn 66dp (≈61%); để dư chút nên lấy 58%
  const fg = Math.round((w * 108) / 48);
  await out(join(dir, 'ic_launcher_foreground.png'), await compose(fg, 0.58, { background: null }));
}

// ---- Splash: nền kem, đầu Cu Tít giữa màn hình (kích thước theo tệp hiện có) ----
for (const d of dirs.filter((n) => /^drawable(-(land|port)-[a-z]+dpi)?$/.test(n))) {
  const file = join(res, d, 'splash.png');
  if (!existsSync(file)) continue;
  const { w, h } = await sizeOf(file);
  const d2 = Math.round(Math.min(w, h) * 0.34);
  const buf = await sharp({ create: { width: w, height: h, channels: 4, background: CREAM } })
    .composite([{ input: await head(d2), left: Math.round((w - d2) / 2), top: Math.round((h - d2) / 2) }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  await out(file, buf);
}

console.log(`Nguồn: ${src}\nĐã ghi ${written.length} tệp:\n${written.map((f) => `  ${f}`).join('\n')}`);
