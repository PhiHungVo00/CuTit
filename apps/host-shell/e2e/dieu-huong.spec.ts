import { expect, test } from '@playwright/test';

/** Dự án 1 đợt 2: 4 tab, bong bóng Cu Tít, chuyển hướng đường cũ, chuyển cảnh. */
const nav = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Điều hướng chính' });

test.describe('4 tab và điều hướng', () => {
  test('bấm đủ 4 tab, mỗi tab vẽ màn đúng và sáng đúng tab', async ({ page }) => {
    await page.goto('/');
    await expect(nav(page).getByRole('link')).toHaveCount(4);

    await nav(page).getByRole('link', { name: 'Luyện tập' }).click();
    await expect(page).toHaveURL(/\/luyen-tap-chung$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Luyện tập' })).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Luyện tập' })).toHaveAttribute('aria-current', 'page');

    await nav(page).getByRole('link', { name: 'Bạn bè' }).click();
    await expect(page).toHaveURL(/\/ban-be$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Bạn bè' })).toBeVisible();

    await nav(page).getByRole('link', { name: 'Hồ sơ' }).click();
    await expect(page).toHaveURL(/\/ho-so$/);
    await expect(nav(page).getByRole('link', { name: 'Hồ sơ' })).toHaveAttribute('aria-current', 'page');

    await nav(page).getByRole('link', { name: 'Học', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Học Tiếng Việt Cùng Bé Cu Tít' })).toBeVisible();
  });

  test('màn tra cứu giữ thanh tab và sáng tab Học; màn Cu Tít không có thanh tab', async ({ page }) => {
    await page.goto('/xung-ho');
    await expect(nav(page).getByRole('link', { name: 'Học', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.goto('/hoi-thoai');
    await expect(nav(page)).toHaveCount(0);
    // Dự án 2 Task 8: thanh chế độ Cu Tít đã gỡ (màn chat tự có đầu màn)
    await expect(page.getByRole('navigation', { name: 'Chế độ với Cu Tít' })).toHaveCount(0);
  });

  test('vào bài học thì không có thanh tab', async ({ page }) => {
    await page.goto('/bai-hoc/u1l1');
    await expect(nav(page)).toHaveCount(0);
  });

  test('đường cũ chuyển hướng: /tuy-chinh → /cai-dat, /kham-pha → /luyen-tap-chung, /ho-so vẫn là Hồ sơ', async ({ page }) => {
    await page.goto('/tuy-chinh');
    await expect(page).toHaveURL(/\/cai-dat$/);
    await expect(nav(page).getByRole('link', { name: 'Hồ sơ' })).toHaveAttribute('aria-current', 'page');
    await page.goto('/kham-pha');
    await expect(page).toHaveURL(/\/luyen-tap-chung$/);
    await page.goto('/ho-so');
    await expect(page).toHaveURL(/\/ho-so$/);
  });

  test('người dùng cũ: giao diện tối đang lưu (becutit.theme) được giữ', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('becutit.theme', 'dark'));
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('Bong bóng Cu Tít', () => {
  test('hiện sau lần vẽ đầu, giới thiệu một lần, chạm mở thẳng chat', async ({ page }) => {
    await page.goto('/');
    const bubble = page.getByRole('button', { name: 'Hỏi Bé Cu Tít' });
    await expect(bubble).toBeVisible({ timeout: 5000 });
    const intro = page.getByRole('dialog', { name: /Cu Tít ở đây/ });
    await expect(intro).toBeVisible();
    await intro.getByRole('button', { name: 'Đã hiểu' }).click();
    await expect(intro).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Hỏi Bé Cu Tít' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('dialog', { name: /Cu Tít ở đây/ })).toHaveCount(0); // không hiện lại
    await page.getByRole('button', { name: 'Hỏi Bé Cu Tít' }).click();
    await expect(page).toHaveURL(/\/hoi-thoai$/);
    await expect(page.getByRole('button', { name: 'Hỏi Bé Cu Tít' })).toHaveCount(0); // ẩn ở màn Cu Tít
  });

  test('ẩn khi bàn phím mở (visualViewport co > 150px)', async ({ page }) => {
    await page.goto('/');
    const bubble = page.getByRole('button', { name: 'Hỏi Bé Cu Tít' });
    await expect(bubble).toBeVisible({ timeout: 5000 });
    // Mô phỏng bàn phím: visualViewport.height giảm mạnh
    await page.evaluate(() => {
      const vv = window.visualViewport!;
      Object.defineProperty(vv, 'height', { configurable: true, get: () => window.innerHeight - 300 });
      vv.dispatchEvent(new Event('resize'));
    });
    await expect(bubble).toHaveCount(0);
  });

  test('320×568: bong bóng không đè nút "Học tiếp" của trang chủ', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    const cta = page.getByRole('link', { name: /Học tiếp|Bắt đầu bài đầu tiên/ }).first();
    await expect(cta).toBeVisible({ timeout: 10_000 });
    const bubble = page.getByRole('button', { name: 'Hỏi Bé Cu Tít' });
    await expect(bubble).toBeVisible({ timeout: 5000 });
    const a = (await cta.boundingBox())!;
    const b = (await bubble.boundingBox())!;
    const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    expect(overlap, `nút ${JSON.stringify(a)} vs bong bóng ${JSON.stringify(b)}`).toBe(false);
  });
});

test.describe('Chuyển cảnh và giảm chuyển động', () => {
  test('công tắc giảm chuyển động gắn data-reduced-motion lên <html>', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem('becutit.device', JSON.stringify({ state: { reducedMotion: true }, version: 1 }))
    );
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
  });
});

test.describe('Trang công khai Xóa tài khoản', () => {
  test('mở /xoa-tai-khoan ở phiên mới: không tạo tài khoản khách, có chữ vi và link Quyền riêng tư', async ({ page }) => {
    const guestCalls: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/v1/auth/')) guestCalls.push(r.url());
    });
    await page.goto('/xoa-tai-khoan');
    await expect(page.getByRole('heading', { level: 1, name: 'Xóa tài khoản và dữ liệu' })).toBeVisible();
    await expect(page.locator('article')).toContainText('30 ngày');
    await expect(page.locator('article').getByRole('link', { name: 'Chính sách quyền riêng tư' })).toHaveAttribute('href', '/quyen-rieng-tu');
    // hàng đợi đồng bộ khởi động sau sự kiện load (setTimeout 0): chờ đủ lâu để một lần tạo khách (nếu có) kịp xảy ra
    await page.waitForTimeout(2500);
    expect(guestCalls, 'không được gọi /v1/auth/* khi chỉ mở trang này').toEqual([]);
  });

  test('en: trang hiện tiếng Anh khi trình duyệt là en-US', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'en-US' });
    const page = await ctx.newPage();
    await page.goto('/xoa-tai-khoan');
    await expect(page.getByRole('heading', { level: 1, name: 'Delete your account and data' })).toBeVisible();
    await expect(page.locator('article')).toContainText('30 days');
    await ctx.close();
  });
});
