/** Chụp bổ sung: khu Huy hiệu nằm trong màn Hồ sơ (cuộn tới tiêu đề). Chạy: xem README.md */
import { join } from 'node:path';
import { expect, test } from '../../apps/host-shell/node_modules/@playwright/test';

test('huy hiệu', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const heading = page.getByText(/Huy hiệu \(/).first();
  await expect(heading).toBeAttached({ timeout: 15_000 });
  await heading.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(__dirname, 'anh', '10-huy-hieu.png') });
});
