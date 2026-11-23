/**
 * Ghi 01-nen-tang/apps/landing/apk-release.json (kiểu ApkRelease của trang giới thiệu) sau khi build APK **phát hành đã ký**.
 * Gọi từ build-apk.ps1 -ReleaseManifest <đường dẫn>. Bản debug và APK chưa ký KHÔNG ghi (tránh đưa APK dở lên trang tải).
 * Chạy tay: node scripts/apk-manifest.mjs --apk <apk> --url <https://…> --out <apk-release.json> [--min-android 6.0]
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAppVersion } from './version.mjs';

export function buildApkManifest({ apkPath, url, version, minAndroid }) {
  if (typeof url !== 'string' || !/^(https:\/\/|\/)/.test(url)) throw new Error(`url phải là https:// hoặc đường dẫn gốc "/…" (nhận: ${JSON.stringify(url)})`);
  const bytes = statSync(apkPath).size;
  const sha256 = createHash('sha256').update(readFileSync(apkPath)).digest('hex');
  return { version, url, bytes, sha256, minAndroid };
}

/** null nếu không phải bản phát hành (không ghi gì); ném lỗi nếu APK chưa ký. */
export function writeApkManifest({ apkPath, url, version, minAndroid, out, release }) {
  if (!release) return null;
  if (/unsigned/i.test(basename(apkPath))) throw new Error(`APK chưa ký (${basename(apkPath)}) — ký bằng keystore trước khi ghi apk-release.json`);
  const manifest = buildApkManifest({ apkPath, url, version, minAndroid });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const a = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[i + 1];
  if (!a.apk || !a.url || !a.out) {
    console.error('Cần --apk, --url, --out');
    process.exit(2);
  }
  const m = writeApkManifest({ apkPath: a.apk, url: a.url, version: readAppVersion().version, minAndroid: a['min-android'] ?? '6.0', out: a.out, release: true });
  console.log(`Đã ghi ${a.out}: ${JSON.stringify(m)}`);
}
