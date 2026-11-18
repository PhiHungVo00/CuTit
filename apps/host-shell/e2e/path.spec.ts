import { expect, test, type Page } from '@playwright/test';
import { EN, VI, solveLesson, type Strings } from './lesson-helpers';

/** GĐ1 — Lộ trình học. Chạy cả trên Pixel 7 và màn 320 px (project android-nho-320). */

async function assertMobileLayout(page: Page) {
  const info = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    small: [...document.querySelectorAll('main button, main a, main input')]
      .filter((el) => {
        const target = el instanceof HTMLInputElement && /checkbox|radio/.test(el.type) ? (el.closest('label') ?? el) : el;
        const r = target.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 44;
      })
      .map((el) => (el.textContent || el.tagName).trim().slice(0, 30))
  }));
  expect(info.scrollW, 'không được tràn ngang').toBeLessThanOrEqual(info.clientW);
  expect(info.small, 'vùng chạm < 44px').toEqual([]);
}

const readStat = async (page: Page, id: string) => Number(((await page.getByTestId(id).textContent()) ?? '').replace(/\D/g, ''));

test.describe('GĐ1 Lộ trình', () => {
  test('người mới: mở app → “Học tiếp” → xong bài đầu tiên < 60 giây, không cần đăng ký', async ({ page }) => {
    const t0 = Date.now();
    await page.goto('/');
    await page.getByRole('link', { name: /Bắt đầu bài đầu tiên/ }).click();
    await expect(page).toHaveURL(/\/bai-hoc\/u1l1$/);
    await solveLesson(page, VI);
    const ms = Date.now() - t0;
    console.log(`  Bài đầu tiên xong sau ${ms} ms`);
    expect(ms).toBeLessThan(60_000);
    await expect(page.getByText(/^\+\d+ XP$/)).toBeVisible();
    await expect(page.getByText(/Đúng ngay lần đầu: \d+%/)).toBeVisible();
    await assertMobileLayout(page);
  });

  test('đi hết unit 1; XP và chuỗi ngày còn sau khi tải lại; câu sai vào khu Ôn tập', async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto('/');
    await expect(page.getByTestId('xp')).toHaveText(/⭐ 0/);
    await page.getByRole('link', { name: /Bắt đầu bài đầu tiên/ }).click();
    const memory = new Map<string, string>();
    for (const id of ['u1l1', 'u1l2', 'u1l3', 'u1l4']) {
      await expect(page).toHaveURL(new RegExp(`/bai-hoc/${id}$`));
      await solveLesson(page, VI, memory);
      if (id !== 'u1l4') await page.getByRole('link', { name: /^Học tiếp:/ }).click();
    }
    // sau bài cuối unit 1, “Học tiếp” trỏ sang bài nhập vai khép lại unit (GĐ3)
    await expect(page.getByRole('link', { name: /^Học tiếp: Nhập vai: Gặp hàng xóm mới/ })).toBeVisible();
    await page.getByRole('link', { name: 'Về lộ trình' }).click();

    const unit1 = page.getByRole('region', { name: /Chào hỏi & xưng hô/ });
    await expect(unit1.getByText('4/5 bài')).toBeVisible();
    await expect(page.getByRole('link', { name: /Học tiếp/ }).first()).toContainText('Nhập vai: Gặp hàng xóm mới');
    // nhập vai cần mạng + lượt AI: luôn có lối sang bài sau
    await expect(page.getByRole('link', { name: 'Chưa nói được lúc này? Sang bài sau: Số từ 1 đến 5' })).toBeVisible();
    const xp = await readStat(page, 'xp');
    expect(xp).toBeGreaterThanOrEqual(40); // 4 bài × tối thiểu 10 XP
    await expect(page.getByTestId('streak')).toHaveText(/🔥 1/);
    await expect(page.locator('li[aria-label$="đã học"]')).toHaveCount(1);

    await page.reload();
    await expect(page.getByTestId('xp')).toHaveText(`⭐ ${xp}`);
    await expect(page.getByTestId('streak')).toHaveText(/🔥 1/);
    await expect(unit1.getByText('4/5 bài')).toBeVisible();

    // Lần đầu chọn đại nên chắc chắn có câu sai => “Lỗi gần đây” có ngay; thẻ SM-2 (A4) đến hạn từ ngày mai
    await page.getByRole('navigation').getByRole('link', { name: /Ôn tập/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Ôn tập' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Lỗi gần đây \([1-9]\d*\)/ })).toBeVisible();
    await assertMobileLayout(page);

    // Hôm sau: chuỗi vẫn giữ (hôm nay chưa học vẫn tính tới hôm qua), thẻ ôn đến hạn
    // 23:59 ngày mai (giờ máy): vẫn là “hôm sau” và thẻ tạo hôm nay (hạn +1 ngày) đã đến hạn. Trước đây +26 giờ
    // => chạy sau 22:00 thì nhảy sang ngày kia, chuỗi về 0 (test trượt theo giờ chạy)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 0, 0);
    await page.clock.install({ time: tomorrow });
    await page.goto('/');
    await expect(page.getByTestId('streak')).toHaveText(/🔥 1/);
    const reviewLink = page.getByRole('link', { name: /Ôn hôm nay \((\d+)\)/ });
    const due = Number(((await reviewLink.textContent()) ?? '').match(/\((\d+)\)/)?.[1]);
    expect(due).toBeGreaterThan(0);
    await reviewLink.click();
    await page.getByRole('button', { name: /^Ôn \d+ thẻ$/ }).click();
    await page.getByRole('button', { name: 'Lật thẻ' }).click();
    await page.getByRole('button', { name: 'Nhớ' }).click();
    await expect(page.getByText(due > 1 ? /^Thẻ 2\// : /Xong! Nhớ được 1\//)).toBeVisible();
  });

  test('kiểm tra vượt unit: đạt ≥ 80% => mọi bài của unit tính là xong; không có tim/năng lượng', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/kiem-tra/u1');
    await expect(page.getByRole('heading', { level: 1, name: /Kiểm tra vượt/ })).toBeVisible();
    await assertMobileLayout(page);
    // Lần 1: chọn đại (học đáp án), chưa đạt => không bị phạt, được thử lại
    const memory = new Map<string, string>();
    const S: Strings = { ...VI, summary: /Kiểm tra vượt/ };
    await page.getByRole('button', { name: 'Bắt đầu kiểm tra' }).click();
    await solveLesson(page, S, memory);
    for (let attempt = 0; attempt < 3; attempt++) {
      const status = page.getByRole('status').filter({ hasText: /%/ });
      if (/Bạn đã vượt unit/.test((await status.textContent()) ?? '')) break;
      await page.getByRole('button', { name: 'Thử lại' }).click();
      await solveLesson(page, S, memory);
    }
    await expect(page.getByRole('status').filter({ hasText: 'Bạn đã vượt unit này' })).toBeVisible();
    await page.getByRole('link', { name: 'Về lộ trình' }).click();
    await expect(page.getByText('Đã vượt unit ✓')).toBeVisible();
    await expect(page.getByRole('region', { name: /Chào hỏi & xưng hô/ }).getByText('5/5 bài')).toBeVisible();
    expect(await page.locator('text=/tim|năng lượng|hearts|energy/i').count()).toBe(0);
  });

  test('tab Khám phá giữ đủ 12 công cụ; trang chủ có skeleton rồi lộ trình', async ({ page }) => {
    // Làm chậm chunk lộ trình để thấy khung xương (skeleton) trong lúc tải
    await page.route('**/assets/PathHomeRoute-*.js', async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    await page.goto('/');
    await expect(page.locator('[aria-busy="true"]')).toBeVisible();
    await expect(page.getByRole('link', { name: /Bắt đầu bài đầu tiên/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Ôn hôm nay \(0\)/ })).toBeVisible();
    await assertMobileLayout(page);
    await page.goto('/kham-pha');
    await expect(page.getByRole('heading', { level: 1, name: 'Khám phá' })).toBeVisible();
    await expect(page.locator('.screen-card')).toHaveCount(12);
  });
});

test.describe('GĐ1 Lộ trình — giao diện tiếng Anh', () => {
  test.use({ locale: 'en-US' });

  test('English UI: home, lesson, summary, review không tràn ở màn nhỏ', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Learn Vietnamese with Cu Tít' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Start your first lesson/ })).toBeVisible();
    await assertMobileLayout(page);
    await page.getByRole('link', { name: /Start your first lesson/ }).click();
    await solveLesson(page, EN, new Map(), () => assertMobileLayout(page));
    await expect(page.getByText(/Right first time: \d+%/)).toBeVisible();
    await assertMobileLayout(page);
    // Bài 2 có đủ dạng: đại từ, điền từ, nghe, luyện thanh, ghép câu — kiểm bố cục ở mọi câu
    await page.getByRole('link', { name: /^Continue: Older and younger/ }).click();
    await solveLesson(page, EN, new Map(), () => assertMobileLayout(page));
    await assertMobileLayout(page);
    await page.getByRole('link', { name: 'Back to path' }).click();
    await expect(page.getByTestId('xp')).not.toHaveText('⭐ 0');
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /Review/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Review' })).toBeVisible();
    await assertMobileLayout(page);
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /Explore/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Explore' })).toBeVisible();
    await assertMobileLayout(page);
  });
});
