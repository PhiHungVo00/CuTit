import { expect, test, type Page } from '@playwright/test';

/**
 * Dự án 2 Task 3 — Tình huống kịch bản rẽ nhánh cuối unit (không AI, offline).
 * Bản phát hành ẩn kịch bản nháp (reviewed:false); khóa localStorage `becutit.draftDialogues=1` cho xem nháp (như bản dev).
 */
const rec = { best: 1, times: 1, at: new Date().toISOString() };

async function seedUnit1Done4(page: Page, drafts: boolean) {
  await page.addInitScript(
    ({ rec, drafts }) => {
      if (sessionStorage.getItem('e2e.seeded')) return;
      sessionStorage.setItem('e2e.seeded', '1');
      localStorage.setItem('becutit.progress', JSON.stringify({ state: { lessons: { u1l1: rec, u1l2: rec, u1l3: rec, u1l4: rec }, lessonsDone: 4 }, version: 1 }));
      if (drafts) localStorage.setItem('becutit.draftDialogues', '1');
    },
    { rec, drafts }
  );
}

test.describe('Tình huống cuối unit', () => {
  test('bản phát hành: kịch bản chưa duyệt bị ẩn, unit 1 xong 4/4, mở thẳng bài tình huống thì về lộ trình', async ({ page }) => {
    await seedUnit1Done4(page, false);
    await page.goto('/');
    await expect(page.getByRole('region', { name: /Chào hỏi & xưng hô/ }).getByText('4/4 bài')).toBeVisible();
    await expect(page.getByRole('link', { name: /Nhập vai: Gặp hàng xóm mới/ })).toHaveCount(0);
    await page.goto('/bai-hoc/u1l5');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('region', { name: /Chào hỏi & xưng hô/ })).toBeVisible();
  });

  test('có kịch bản: làm hết tình huống unit 1 (xưng hô sai được gợi ý) → xong bài, +XP, unit 5/5', async ({ page }) => {
    await seedUnit1Done4(page, true);
    await page.goto('/');
    const unit1 = page.getByRole('region', { name: /Chào hỏi & xưng hô/ });
    await expect(unit1.getByText('4/5 bài')).toBeVisible();
    await page.getByRole('link', { name: /^Học tiếp/ }).first().click();
    await expect(page).toHaveURL(/\/bai-hoc\/u1l5$/);

    // chọn xưng hô sai ở nút đầu: nhận gợi ý đúng, vẫn đi tiếp
    await page.getByRole('button', { name: 'Tôi chào bà.' }).click();
    await expect(page.getByRole('status')).toContainText('cháu – bác');
    await page.getByRole('button', { name: 'Tiếp →' }).click();
    await page.getByRole('button', { name: 'Cháu tên là Mai ạ.' }).click();
    await page.getByRole('button', { name: 'Bác có khỏe không ạ?' }).click();
    await expect(page.getByRole('status')).toContainText('Xưng hô đúng');
    await page.getByRole('button', { name: 'Tiếp →' }).click();
    await page.getByRole('button', { name: 'Cháu chào bác ạ, tạm biệt bác!' }).click();

    await expect(page.getByRole('heading', { name: 'Hoàn thành tình huống!' })).toBeVisible();
    await expect(page.getByText('Xưng hô đúng ngay lần đầu: 1/2')).toBeVisible();
    await page.getByRole('button', { name: 'Xem tổng kết' }).click();
    await expect(page.getByRole('heading', { name: /^Xong bài “Nhập vai: Gặp hàng xóm mới”/ })).toBeVisible();
    await expect(page.getByText(/^\+\d+ XP$/)).toBeVisible();
    await page.getByRole('link', { name: 'Về lộ trình' }).click();
    await expect(unit1.getByText('5/5 bài')).toBeVisible();
  });

  test('nút “Luyện với Cu Tít” dẫn tới chat theo tình huống (?tinh-huong=sc5)', async ({ page }) => {
    await seedUnit1Done4(page, true);
    await page.goto('/bai-hoc/u1l5');
    await page.getByRole('button', { name: 'Cháu chào bác ạ!' }).click();
    await page.getByRole('button', { name: 'Tiếp →' }).click();
    await page.getByRole('button', { name: 'Cháu tên là Mai ạ.' }).click();
    await page.getByRole('button', { name: 'Bác có khỏe không ạ?' }).click();
    await page.getByRole('button', { name: 'Tiếp →' }).click();
    await page.getByRole('button', { name: 'Cháu chào bác ạ, tạm biệt bác!' }).click();
    await page.getByRole('button', { name: 'Luyện với Cu Tít' }).click();
    await expect(page).toHaveURL(/\/hoi-thoai\?tinh-huong=sc5$/);
  });
});
