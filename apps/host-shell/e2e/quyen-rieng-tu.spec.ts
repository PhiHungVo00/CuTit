import { expect, test } from '@playwright/test';

// Dự án 2 Task 8: chính sách quyền riêng tư theo nhà cung cấp AI + thanh chế độ Cu Tít đã gỡ
test.describe('Quyền riêng tư và khung Cu Tít', () => {
  test('vi: liệt kê Google (Gemini), Groq, OpenRouter, loại dữ liệu và việc có thể dùng cải thiện dịch vụ', async ({ page }) => {
    await page.goto('/quyen-rieng-tu');
    const main = page.locator('article');
    for (const s of ['Google (Gemini)', 'Groq', 'OpenRouter', 'khung hình', 'giọng nói', 'cải thiện dịch vụ']) await expect(main).toContainText(s);
    await expect(main).toContainText('[Cần điền');
  });

  test('en: lists the providers and data types', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'en-US' });
    const page = await ctx.newPage();
    await page.goto('/quyen-rieng-tu');
    const main = page.locator('article');
    for (const s of ['Google (Gemini)', 'Groq', 'OpenRouter', 'video-call frames', 'improve their services']) await expect(main).toContainText(s);
    await ctx.close();
  });

  test('màn chat không còn thanh chế độ Chat · Nhập vai · Gọi thoại · Camera', async ({ page }) => {
    await page.goto('/hoi-thoai');
    await expect(page.getByRole('navigation', { name: 'Chế độ với Cu Tít' })).toHaveCount(0);
    await expect(page.locator('.mode-bar, .mode-tabs')).toHaveCount(0);
  });

  test('link cũ /nhap-vai và /camera vẫn có nút quay lại', async ({ page }) => {
    for (const path of ['/nhap-vai', '/camera']) {
      await page.goto(path);
      await expect(page.getByRole('button', { name: 'Quay lại' }).first()).toBeVisible();
    }
  });
});
