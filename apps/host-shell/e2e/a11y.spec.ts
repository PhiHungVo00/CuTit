import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Dự án 1 Task 13: quét trợ năng (axe-core, WCAG 2.0/2.1 A+AA) các màn mới, sáng + tối, ở pixel-7 và 320px.
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
  ['chat', '/hoi-thoai']
];

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
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        const report = bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ') + ' :: ' + (n.any[0]?.message ?? n.failureSummary ?? '')).join(' | ')}`);
        expect(report, report.join('\n')).toEqual([]);
      });
    }
  });
}
