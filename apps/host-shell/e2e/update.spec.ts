import { expect, test } from '@playwright/test';
import { readAppVersion } from '../scripts/version.mjs';
import { writeVersions } from './versions';

/**
 * Dự án 8 (Task 5): kiểm và nhắc cập nhật app, với Gateway THẬT. Tệp phiên bản của Gateway e2e (TTL 0) do test ghi
 * với số tính từ `readAppVersion()` của bản build — không chặn mạng bằng page.route nên đi đúng đường 426/`/v1/app/version`.
 * Mỗi test trả cấu hình về "không yêu cầu gì" để không ảnh hưởng các spec khác.
 */
const { build } = readAppVersion();
const STATE_KEY = 'becutit.update';

test.afterEach(() => writeVersions());

const forced = (page: import('@playwright/test').Page) => page.getByRole('alertdialog', { name: 'Cần cập nhật để học tiếp' });

test.describe('Dự án 8 — cập nhật app (web)', () => {
  test('(a) minBuild > build: màn bắt buộc, một nút, không đóng được (đường kiểm phiên bản)', async ({ page }) => {
    writeVersions({ minBuild: build + 1, latestBuild: build + 1, latestVersion: '99.0.0' });
    await page.goto('/');
    const dialog = forced(page);
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByRole('button')).toHaveCount(1);
    await expect(dialog.getByRole('button', { name: 'Cập nhật ngay' })).toBeVisible();
    // không có cách đóng: Escape không làm mất màn; phần còn lại của trang bị khóa
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(page.locator('main')).toHaveAttribute('inert', '');
  });

  test('(a2) đường 426 thật: lần kiểm đã "an toàn" trong 30 phút, request /v1 của app bị Gateway chặn ⇒ màn bắt buộc', async ({ page }) => {
    // Lần kiểm lúc mở bị bỏ (đã kiểm <30 phút trước, bản đủ mới) nên chỉ còn 426 từ request thật của app mới làm hiện màn
    await page.addInitScript(
      ([key, b]) => {
        localStorage.setItem(
          key as string,
          JSON.stringify({
            lastCheckAt: Date.now(),
            lastResponse: { channel: 'web', latestBuild: b, latestVersion: '1.0.0', minBuild: 0, status: 'up_to_date', notes: null, apkFile: null, downloadUrl: null, checkAfterSec: 21600 },
            snoozedBuild: 0,
            snoozedUntil: 0
          })
        );
      },
      [STATE_KEY, build]
    );
    writeVersions({ minBuild: build + 1, latestBuild: build + 1, latestVersion: '99.0.0', minBuildEnforceAt: null });
    const blocked = page.waitForResponse((r) => r.status() === 426 && r.url().includes('/v1/'), { timeout: 30_000 });
    await page.goto('/phuong-ngu');
    await page.getByRole('searchbox').fill('heo');
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Con lợn' })
      .getByRole('button', { name: /Lưu để ôn tập/ })
      .click(); // sự kiện vào hàng đợi đồng bộ ⇒ đẩy lên /v1/sync ⇒ 426
    await blocked;
    await expect(forced(page)).toBeVisible({ timeout: 10_000 });
  });

  test('(b) offline + đã biết cần cập nhật: chỉ dải nhỏ, KHÔNG màn chặn; bài đã tải vẫn học được', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await page.evaluate(
      ([key, b]) => {
        localStorage.setItem(
          key as string,
          JSON.stringify({
            lastCheckAt: Date.now(),
            lastResponse: {
              channel: 'web',
              latestBuild: (b as number) + 1,
              latestVersion: '99.0.0',
              minBuild: (b as number) + 1,
              status: 'update_required',
              notes: null,
              apkFile: null,
              downloadUrl: null,
              checkAfterSec: 21600
            },
            snoozedBuild: 0,
            snoozedUntil: 0
          })
        );
      },
      [STATE_KEY, build]
    );
    await context.setOffline(true);
    await page.goto('/phat-am');
    await expect(page.getByRole('status').filter({ hasText: 'Cần cập nhật khi có mạng' })).toBeInViewport(); // dải ở đầu trang, không rơi xuống đáy
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Luyện 6 thanh điệu' })).toBeVisible();
    await context.setOffline(false);
  });

  test('(c) đang ở bài luyện tập: không có màn chặn; về trang chủ thì có', async ({ page }) => {
    writeVersions({ minBuild: build + 1, latestBuild: build + 1, latestVersion: '99.0.0' });
    const checked = page.waitForResponse((r) => r.url().includes('/v1/app/version'));
    await page.goto('/luyen-tap');
    await checked;
    await page.waitForTimeout(500);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await page.getByRole('link', { name: 'Học', exact: true }).click();
    await expect(forced(page)).toBeVisible({ timeout: 10_000 });
  });

  test('(d) có bản mới: thẻ nhắc mềm một nút chính; "Để sau" ẩn thẻ và không hiện lại khi tải lại trang', async ({ page }) => {
    writeVersions({ latestBuild: build + 1000, latestVersion: '99.1.0', notes: { vi: 'Thêm bài đi chợ <b>x</b>', en: 'New market lesson' } });
    await page.goto('/');
    const card = page.getByRole('status').filter({ hasText: 'Có bản mới 99.1.0' });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText('Thêm bài đi chợ <b>x</b>'); // chữ thuần
    const primary = card.getByRole('button', { name: 'Cập nhật' });
    const box = await primary.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await card.getByRole('button', { name: 'Để sau' }).click();
    await expect(card).toHaveCount(0);
    await page.reload();
    await page.waitForTimeout(1500);
    await expect(page.getByRole('status').filter({ hasText: 'Có bản mới 99.1.0' })).toHaveCount(0);
  });

  test('(e) đang ở bài học: thẻ nhắc mềm không hiện', async ({ page }) => {
    writeVersions({ latestBuild: build + 1000, latestVersion: '99.1.0' });
    const checked = page.waitForResponse((r) => r.url().includes('/v1/app/version'));
    await page.goto('/ghep-cau');
    await checked;
    await page.waitForTimeout(500);
    await expect(page.getByRole('status').filter({ hasText: 'Có bản mới' })).toHaveCount(0);
  });
});
