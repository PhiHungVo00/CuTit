#!/usr/bin/env node
/**
 * Kiểm APK debug theo flavor (dự án 8, Task 3):
 *   node scripts/check-apk.mjs <đường-dẫn.apk> --flavor play|apk
 * - versionCode (đọc output-metadata.json cạnh APK) phải bằng versionToBuild(version) của package.json.
 * - flavor `play`: KHÔNG được có REQUEST_INSTALL_PACKAGES (chính sách Google Play); flavor `apk`: PHẢI có.
 * Quyền đọc bằng `aapt dump permissions` (hoặc aapt2) trong build-tools của Android SDK.
 * Công cụ tự viết, không chép mã bên ngoài.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { readAppVersion } from './version.mjs';

const PERMISSION = 'android.permission.REQUEST_INSTALL_PACKAGES';

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function findAapt() {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
  const bt = join(sdk, 'build-tools');
  if (!existsSync(bt)) fail(`Không thấy build-tools tại ${bt} (đặt ANDROID_HOME)`);
  const dirs = readdirSync(bt).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const exe = process.platform === 'win32' ? '.exe' : '';
  for (const d of dirs) {
    for (const tool of ['aapt', 'aapt2']) {
      const p = join(bt, d, tool + exe);
      if (existsSync(p)) return p;
    }
  }
  return fail(`Không thấy aapt/aapt2 trong ${bt}`);
}

const args = process.argv.slice(2);
const apk = args.find((a) => !a.startsWith('--') && a !== args[args.indexOf('--flavor') + 1]);
const flavor = args[args.indexOf('--flavor') + 1];
if (!apk || !['play', 'apk'].includes(flavor)) fail('Dùng: check-apk.mjs <apk> --flavor play|apk');
if (!existsSync(apk)) fail(`Không thấy ${apk}`);

// 1. versionCode
const metaPath = join(dirname(apk), 'output-metadata.json');
if (!existsSync(metaPath)) fail(`Không thấy ${metaPath}`);
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
const el = (meta.elements ?? []).find((e) => e.outputFile === basename(apk));
if (!el) fail(`output-metadata.json không có ${basename(apk)}`);
const { version, build } = readAppVersion();
if (el.versionCode !== build) fail(`versionCode ${el.versionCode} ≠ versionToBuild(${version}) = ${build}`);
if (el.versionName !== version) fail(`versionName ${el.versionName} ≠ ${version}`);
console.log(`✓ ${flavor}: versionName ${version}, versionCode ${build}`);

// 2. quyền
const aapt = findAapt();
const out = execFileSync(aapt, ['dump', 'permissions', apk], { encoding: 'utf8' });
const has = out.includes(PERMISSION);
if (flavor === 'play' && has) fail(`bản play KHÔNG được có ${PERMISSION}`);
if (flavor === 'apk' && !has) fail(`bản apk PHẢI có ${PERMISSION}`);
console.log(`✓ ${flavor}: ${has ? 'có' : 'không có'} ${PERMISSION}`);
