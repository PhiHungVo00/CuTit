/**
 * Phân tích gói tải ban đầu (R10): `pnpm --filter @vietlearning/host-shell analyze`.
 * Build y hệt vite.config.ts, rồi in các module lớn nhất trong `app-*.js` / `react-*.js` và ghi đầy đủ
 * mọi chunk → module vào `dist/bundle-modules.json`. Không cần devDependency mới.
 * Lưu ý: số theo module là `renderedLength` (sau tree-shaking, TRƯỚC minify) — chỉ để quy trách nhiệm;
 * số chính thức vẫn lấy từ `pnpm size`.
 */
import { gzipSync } from 'node:zlib';
import type { Plugin, UserConfig } from 'vite';
import base from './vite.config';

const analyze: Plugin = {
  name: 'becutit-analyze-bundle',
  apply: 'build',
  generateBundle(_opts, bundle) {
    const chunks: Record<string, unknown> = {};
    for (const [file, c] of Object.entries(bundle)) {
      if (c.type !== 'chunk') continue;
      const modules = Object.entries(c.modules)
        .map(([id, m]) => [id.replace(/\\/g, '/').replace(/.*node_modules\//, 'nm/').replace(/.*?\/(apps|packages)\//, '$1/'), m.renderedLength] as const)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1]);
      const gzip = gzipSync(c.code).length;
      chunks[file] = { bytes: c.code.length, gzip, imports: c.imports, dynamicImports: c.dynamicImports, modules };
      if (/^assets\/(app|react)-/.test(file)) {
        console.log(`\n${file}: ${(gzip / 1000).toFixed(2)} kB gzip, import tĩnh: ${c.imports.join(', ') || '—'}`);
        for (const [id, n] of modules.slice(0, 15)) console.log(`  ${String(n).padStart(7)}  ${id}`);
      }
    }
    this.emitFile({ type: 'asset', fileName: 'bundle-modules.json', source: JSON.stringify(chunks, null, 1) });
  }
};

const config = base as UserConfig;
export default { ...config, plugins: [...(config.plugins ?? []), analyze] } satisfies UserConfig;
