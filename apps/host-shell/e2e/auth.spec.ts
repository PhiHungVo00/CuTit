import { expect, test, type Page } from '@playwright/test';
import { VI, solveLesson } from './lesson-helpers';

/**
 * Dự án 3 Task 7: đăng ký/đăng nhập tên đăng nhập + mật khẩu với Gateway THẬT (PGlite trong RAM).
 * Khách học 1 bài → tạo tài khoản (giữ tiến độ, nhận mã dự phòng) → "máy khác" (hồ sơ trình duyệt mới) đăng nhập thấy XP/bài
 * → quên mật khẩu bằng mã dự phòng → xóa tài khoản (30 ngày) → đăng nhập lại → khôi phục.
 * Google không thử ở e2e (cần OAuth client thật; xem Task 8) — nút Google phải ẩn khi chưa cấu hình.
 */
const suffix = String(Date.now() % 1_000_000);
const USER = `e2e.mai${suffix}`;
const PASS = 'mat-khau-e2e-9x';
const PASS2 = 'mat-khau-moi-77z';

const readXp = async (page: Page) => Number(((await page.getByTestId('xp').textContent()) ?? '').replace(/\D/g, ''));

async function fillAuth(page: Page, user: string, pass: string) {
  await page.getByLabel('Tên đăng nhập').fill(user);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(pass);
}

test.describe('Dự án 3 — đăng nhập tài khoản', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'pixel-7', 'chỉ chạy ở pixel-7'));

  let backupCode = '';
  let xp = 0;

  test('khách học 1 bài → tạo tài khoản (mã dự phòng) → hồ sơ trình duyệt mới đăng nhập thấy XP/bài', async ({ page, browser }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await page.getByRole('link', { name: /Bắt đầu bài đầu tiên/ }).click();
    await solveLesson(page, VI);
    await page.getByRole('link', { name: 'Về lộ trình' }).click();
    xp = await readXp(page);
    expect(xp).toBeGreaterThanOrEqual(10);

    // Thẻ mời hiện ở Hồ sơ; chưa cấu hình Google => không có nút Google
    await page.goto('/ho-so');
    await page.getByRole('button', { name: 'Đăng nhập / Tạo tài khoản' }).click();
    await expect(page).toHaveURL(/\/dang-nhap$/);
    await expect(page.getByRole('button', { name: /Google/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    await fillAuth(page, USER, PASS);
    await page.getByLabel(/Tôi xác nhận mình đủ/).check();
    await page.locator('form').getByRole('button', { name: 'Tạo tài khoản' }).click();

    const code = page.getByTestId('backup-code');
    await expect(code).toHaveText(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/, { timeout: 15_000 });
    backupCode = (await code.textContent())!;
    const go = page.getByRole('button', { name: 'Tiếp tục', exact: true });
    await expect(go).toBeDisabled();
    await page.getByLabel('Tôi đã lưu mã').check();
    await go.click();
    await expect(page).toHaveURL(/\/ho-so$/);

    // Cài đặt › Tài khoản: có tên đăng nhập (tài khoản thật), mã khôi phục của khách đã biến mất khỏi máy
    await page.goto('/cai-dat/tai-khoan');
    await expect(page.getByText(USER, { exact: true })).toBeVisible();
    await expect(page.getByTestId('recovery-code')).toHaveCount(0);

    // "Máy khác"
    const other = await browser.newContext({ locale: 'vi-VN' });
    const p2 = await other.newPage();
    await p2.goto('/dang-nhap');
    await fillAuth(p2, USER, PASS);
    await p2.locator('form').getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(p2).toHaveURL(/\/ho-so$/, { timeout: 15_000 });
    await p2.goto('/');
    await expect(p2.getByTestId('xp')).toHaveText(`⭐ ${xp}`, { timeout: 15_000 });
    await expect(p2.getByRole('region', { name: /Chào hỏi & xưng hô/ }).getByText('1/4 bài')).toBeVisible();
    await other.close();
  });

  test('đăng nhập sai: một câu chung', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'vi-VN' });
    const p = await ctx.newPage();
    await p.goto('/dang-nhap');
    await fillAuth(p, USER, 'sai-mat-khau-1');
    await p.locator('form').getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(p.getByRole('alert').filter({ hasText: 'Tên đăng nhập hoặc mật khẩu không đúng.' })).toBeVisible();
    await ctx.close();
  });

  test('quên mật khẩu bằng mã dự phòng → mã mới → đăng nhập bằng mật khẩu mới', async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx = await browser.newContext({ locale: 'vi-VN' });
    const p = await ctx.newPage();
    await p.goto('/dang-nhap');
    // MAIL_PROVIDER=none (mặc định): chỉ có đường mã dự phòng
    await p.getByRole('button', { name: 'Quên mật khẩu?' }).click();
    await expect(p.getByRole('button', { name: 'Mã gửi qua email' })).toHaveCount(0);
    await p.getByLabel('Tên đăng nhập').fill(USER);
    await p.getByLabel('Mã dự phòng').fill(backupCode.toLowerCase());
    await p.getByLabel('Mật khẩu mới', { exact: true }).fill(PASS2);
    await p.getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
    const fresh = p.getByTestId('backup-code');
    await expect(fresh).toHaveText(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/, { timeout: 15_000 });
    const newCode = (await fresh.textContent())!;
    expect(newCode).not.toBe(backupCode);
    backupCode = newCode;
    await p.getByLabel('Tôi đã lưu mã').check();
    await p.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
    // đã về màn đăng nhập
    await fillAuth(p, USER, PASS2);
    await p.locator('form').getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(p).toHaveURL(/\/ho-so$/, { timeout: 15_000 });
    await ctx.close();
  });

  test('xóa tài khoản (30 ngày) → đăng nhập lại → hộp "Khôi phục tài khoản?" → khôi phục', async ({ browser }) => {
    test.setTimeout(90_000);
    const ctx = await browser.newContext({ locale: 'vi-VN' });
    const p = await ctx.newPage();
    await p.goto('/dang-nhap');
    await fillAuth(p, USER, PASS2);
    await p.locator('form').getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(p).toHaveURL(/\/ho-so$/, { timeout: 15_000 });

    await p.goto('/cai-dat/tai-khoan');
    await p.getByRole('button', { name: 'Xóa tài khoản (30 ngày)' }).click();
    await p.getByRole('alert').getByRole('button', { name: 'Xóa tài khoản (30 ngày)' }).click();
    await expect(p).toHaveURL(/\/$/, { timeout: 15_000 });

    // Đăng nhập lại trong 30 ngày: hỏi khôi phục
    await p.goto('/dang-nhap');
    await fillAuth(p, USER, PASS2);
    await p.locator('form').getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(p.getByRole('heading', { name: 'Khôi phục tài khoản?' })).toBeVisible({ timeout: 15_000 });
    await p.getByRole('button', { name: 'Khôi phục tài khoản' }).click();
    await expect(p).toHaveURL(/\/ho-so$/, { timeout: 15_000 });
    await p.goto('/');
    await expect(p.getByTestId('xp')).toHaveText(`⭐ ${xp}`, { timeout: 15_000 });
    await ctx.close();
  });
});
