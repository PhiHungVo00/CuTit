/**
 * Số build suy ra tất định từ `version` (x.y.z) của apps/host-shell/package.json — nguồn duy nhất.
 * build = x·1 000 000 + y·1 000 + z; y, z ≤ 999 (tối đa vẫn < 2 100 000 000 của Google Play).
 * Dùng chung cho Vite, Gradle (tính lại bằng Groovy) và test. Công thức tự viết; mẫu 3 chữ số
 * mỗi thành phần cũng là một tùy chọn trong tài liệu ReactiveCircus/app-versioning (Apache-2.0).
 */
import { readFileSync } from 'node:fs';

export function versionToBuild(version) {
  const m = typeof version === 'string' ? /^(\d+)\.(\d+)\.(\d+)$/.exec(version) : null;
  if (!m) throw new Error(`version không đúng dạng x.y.z: ${JSON.stringify(version)}`);
  const [x, y, z] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y > 999 || z > 999) throw new Error(`version ${version}: y và z phải ≤ 999`);
  const build = x * 1_000_000 + y * 1_000 + z;
  if (build > 2_100_000_000) throw new Error(`version ${version}: build ${build} vượt giới hạn Google Play`);
  return build;
}

export function readAppVersion() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return { version: pkg.version, build: versionToBuild(pkg.version) };
}
