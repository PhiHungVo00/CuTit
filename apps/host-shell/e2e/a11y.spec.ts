import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readAppVersion } from '../scripts/version.mjs';
import { writeVersions } from './versions';

/**
 * Dự án 1 Task 13: quét trợ năng (axe-core, WCAG 2.0/2.1/2.2 A+AA) các màn mới, sáng + tối, ở pixel-7 và 320px.
 * Khẳng định 0 vi phạm mức serious/critical. Chạy: npx playwright test a11y (cần bản build + gateway như e2e thường).
 * Giao diện lưu ở localStorage 'becutit.device' (packages/state/src/deviceSettings.ts); mặc định là sáng.
 */
const SCREENS: [string, string][] = [
  ['hoc', '/'],
  ['luyen-tap-chung', '/luyen-tap-chung'],
  ['ban-be', '/ban-be'],
  ['ho-so', '/ho-so'],
  ['tien-do', '/tien-do'],
  ['cai-dat-muc-luc', '/cai-dat'],
  ['cai-dat-giao-dien', '/cai-dat/giao-dien'],
  ['chat', '/hoi-thoai'],
  // Dự án 3: đăng nhập/đăng ký + Cài đặt › Tài khoản của khách
  ['dang-nhap', '/dang-nhap'],
  ['cai-dat-tai-khoan', '/cai-dat/tai-khoan']
];

async function scan(page: Page) {
  await page.waitForTimeout(600);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const report = bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ') + ' :: ' + (n.any[0]?.message ?? n.failureSummary ?? '')).join(' | ')}`);
  expect(report, report.join('\n')).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`a11y ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => {
        localStorage.setItem('becutit.device', JSON.stringify({ version: 1, state: { theme: t, seenBubbleIntro: true } }));
      }, theme);
    });

    for (const [name, path] of SCREENS) {
      test(`${name} không có vi phạm serious/critical`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(600); // chuyển cảnh/animation vào màn xong mới đo tương phản
        // wcag22aa thêm luật target-size (vùng chạm ≥ 24px, WCAG 2.5.8) — xem docs/thiet-ke/NGUYEN-TAC-UI-UX.md nhóm 4
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
        const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        const report = bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ') + ' :: ' + (n.any[0]?.message ?? n.failureSummary ?? '')).join(' | ')}`);
        expect(report, report.join('\n')).toEqual([]);
      });
    }

    // Dự án 8: màn "Cần cập nhật" và thẻ nhắc mềm (Gateway e2e đọc tệp phiên bản riêng, xem e2e/versions.ts)
    test.describe('cập nhật app', () => {
      const { build } = readAppVersion();
      test.afterEach(() => writeVersions());

      test('màn bắt buộc (alertdialog) không có vi phạm serious/critical', async ({ page }) => {
        writeVersions({ minBuild: build + 1, latestBuild: build + 1, latestVersion: '99.0.0' });
        await page.goto('/');
        await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 15_000 });
        await scan(page);
      });

      test('thẻ nhắc mềm không có vi phạm serious/critical', async ({ page }) => {
        writeVersions({ latestBuild: build + 1000, latestVersion: '99.1.0', notes: { vi: 'Thêm bài nhập vai đi chợ.', en: 'A new market role-play.' } });
        await page.goto('/');
        await expect(page.getByRole('status').filter({ hasText: 'Có bản mới 99.1.0' })).toBeVisible({ timeout: 15_000 });
        await scan(page);
      });
    });
  });
}
