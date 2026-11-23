/**
 * Đo Lighthouse di động (mặc định của Lighthouse: 4G chậm + CPU chậm 4×) cho trang giới thiệu, lấy TRUNG VỊ nhiều lần.
 * Ngân sách spec dự án 7: Performance ≥ 90, Accessibility ≥ 95.
 * Chạy sau build: pnpm --filter @vietlearning/landing perf   (cần Chrome; đặt CHROME_PATH nếu không ở chỗ mặc định)
 * Dựa theo 01-nen-tang/apps/host-shell/scripts/lighthouse.mjs của dự án.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.LH_PORT) || 4196;
const ROUTES = process.env.LH_ROUTES ? process.env.LH_ROUTES.split(',') : ['/', '/en/', '/tai-apk'];
const RUNS = Number(process.env.LH_RUNS ?? 3);
const BUDGET = { performance: 90, accessibility: 95 };
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const chrome = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find((p) => p && existsSync(p));
if (!chrome) throw new Error('Không tìm thấy Chrome/Edge; đặt biến CHROME_PATH');
process.env.CHROME_PATH = chrome;

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const outDir = mkdtempSync(join(tmpdir(), 'lh-landing-'));
const rows = [];
let failed = false;
try {
  for (const route of ROUTES) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const out = join(outDir, `${route.replace(/\W/g, '') || 'home'}-${i}.json`);
      const res = spawnSync(
        process.execPath,
        ['node_modules/lighthouse/cli/index.js', `http://localhost:${PORT}${route}`, '--quiet', '--chrome-flags=--headless=new', '--only-categories=performance,accessibility', '--output=json', `--output-path=${out}`],
        { stdio: 'inherit' }
      );
      if (res.status !== 0 || !existsSync(out)) throw new Error(`Lighthouse lỗi ở ${route}`);
      const lh = JSON.parse(readFileSync(out, 'utf8'));
      const a = lh.audits;
      runs.push({
        performance: Math.round(lh.categories.performance.score * 100),
        accessibility: Math.round(lh.categories.accessibility.score * 100),
        fcpMs: Math.round(a['first-contentful-paint'].numericValue),
        lcpMs: Math.round(a['largest-contentful-paint'].numericValue),
        tbtMs: Math.round(a['total-blocking-time'].numericValue),
        cls: Math.round(a['cumulative-layout-shift'].numericValue * 1000) / 1000
      });
    }
    const row = { route, runs: RUNS };
    for (const k of Object.keys(runs[0])) row[k] = median(runs.map((r) => r[k]));
    const problems = [row.performance < BUDGET.performance && `Performance ${row.performance} < ${BUDGET.performance}`, row.accessibility < BUDGET.accessibility && `Accessibility ${row.accessibility} < ${BUDGET.accessibility}`].filter(Boolean);
    if (problems.length) failed = true;
    rows.push({ ...row, 'vượt ngân sách': problems.join('; ') || '—' });
  }
} finally {
  server.kill();
}
console.table(rows);
if (failed) {
  console.error('Có trang vượt ngân sách Lighthouse.');
  process.exit(1);
}
