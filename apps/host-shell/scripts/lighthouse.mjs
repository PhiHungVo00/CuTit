/**
 * Đo Lighthouse (mobile: 4G chậm giả lập + CPU chậm 4×) cho các màn hình chính, so với ngân sách TDD.
 * Chạy sau khi build: pnpm --filter @vietlearning/host-shell perf
 * Cần Chrome đã cài (đặt CHROME_PATH nếu không ở vị trí mặc định).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4175;
const ROUTES = ['/', '/xung-ho', '/phat-am'];
/** Lighthouse dao động giữa các lần đo: chạy nhiều lần, lấy TRUNG VỊ (cách Lighthouse CI làm) */
const RUNS = Number(process.env.LH_RUNS ?? 3);
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
/** Ngân sách: LCP ≤ 2.5 s trên 4G (TDD mục chất lượng), cộng các mức tối thiểu cho điểm số */
const BUDGET = { lcpMs: 2500, cls: 0.1, tbtMs: 200, performance: 90, accessibility: 95 };

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);
process.env.CHROME_PATH = chromeCandidates.find((p) => existsSync(p));
if (!process.env.CHROME_PATH) throw new Error('Không tìm thấy Chrome/Edge; đặt biến CHROME_PATH');

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore'
});
await new Promise((r) => setTimeout(r, 2500));

const outDir = mkdtempSync(join(tmpdir(), 'lh-'));
const rows = [];
let failed = false;
try {
  for (const route of ROUTES) {
    const runs = [];
    let lh;
    for (let i = 0; i < RUNS; i++) {
    const out = join(outDir, `${route.replace(/\W/g, '') || 'home'}-${i}.json`);
    const res = spawnSync(
      process.execPath,
      [
        'node_modules/lighthouse/cli/index.js',
        `http://localhost:${PORT}${route}`,
        '--quiet',
        '--chrome-flags=--headless=new',
        '--only-categories=performance,accessibility,best-practices',
        '--output=json',
        `--output-path=${out}`
      ],
      { stdio: 'inherit' }
    );
    if (res.status !== 0 || !existsSync(out)) throw new Error(`Lighthouse lỗi ở ${route}`);
    lh = JSON.parse(readFileSync(out, 'utf8'));
    const a = lh.audits;
    runs.push({
      performance: Math.round(lh.categories.performance.score * 100),
      accessibility: Math.round(lh.categories.accessibility.score * 100),
      bestPractices: Math.round(lh.categories['best-practices'].score * 100),
      fcpMs: Math.round(a['first-contentful-paint'].numericValue),
      lcpMs: Math.round(a['largest-contentful-paint'].numericValue),
      tbtMs: Math.round(a['total-blocking-time'].numericValue),
      cls: Math.round(a['cumulative-layout-shift'].numericValue * 1000) / 1000
    });
    }
    const a = lh.audits;
    const row = { route, runs: RUNS };
    for (const k of Object.keys(runs[0])) row[k] = median(runs.map((r) => r[k]));
    const problems = [
      row.lcpMs > BUDGET.lcpMs && `LCP ${row.lcpMs}ms > ${BUDGET.lcpMs}`,
      row.cls > BUDGET.cls && `CLS ${row.cls} > ${BUDGET.cls}`,
      row.tbtMs > BUDGET.tbtMs && `TBT ${row.tbtMs}ms > ${BUDGET.tbtMs}`,
      row.performance < BUDGET.performance && `Performance ${row.performance} < ${BUDGET.performance}`,
      row.accessibility < BUDGET.accessibility && `Accessibility ${row.accessibility} < ${BUDGET.accessibility}`
    ].filter(Boolean);
    if (problems.length) failed = true;
    rows.push({ ...row, 'vượt ngân sách': problems.join('; ') || '—' });
    // In các lỗi a11y cụ thể để sửa
    for (const [id, audit] of Object.entries(a)) {
      if (lh.categories.accessibility.auditRefs.some((r) => r.id === id) && audit.score === 0) {
        console.log(`  [a11y ${route}] ${id}: ${audit.title}`);
      }
    }
  }
} finally {
  server.kill();
}
console.table(rows);
if (failed) {
  console.error('Có màn hình vượt ngân sách hiệu năng/a11y.');
  process.exit(1);
}
