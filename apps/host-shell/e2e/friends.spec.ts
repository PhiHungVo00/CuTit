import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * GĐ4c: hai “máy” (hai hồ sơ trình duyệt riêng) kết bạn bằng mã mời, cùng học, và cùng thấy tiến độ nhiệm vụ
 * tuần chung dạng “chúng ta” — với Gateway THẬT (PGlite RAM, xem playwright.config.ts).
 * Thời gian học đi đúng đường của app: có sẵn trong kho người học trên máy (như người dùng cũ) => tự đồng bộ
 * lên server (activity.set) => server cộng dồn cho nhiệm vụ chung.
 */
async function learner(browser: Browser, minutesToday: number): Promise<Page> {
  const ctx = await browser.newContext({ locale: 'vi-VN' });
  const page = await ctx.newPage();
  await page.addInitScript((seconds) => {
    if (localStorage.getItem('becutit.learner')) return;
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('becutit.learner', JSON.stringify({ version: 1, state: { activity: { [today]: seconds } } }));
  }, minutesToday * 60);
  // Tạo tài khoản khách + đồng bộ lần đầu (đẩy thời gian học lên server)
  await page.goto('/cai-dat/tai-khoan');
  const create = page.getByRole('button', { name: 'Tạo tài khoản và mã khôi phục ngay' });
  const code = page.getByTestId('recovery-code');
  await expect(create.or(code)).toBeVisible();
  if (await create.isVisible()) await create.click();
  await expect(code).toHaveText(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/, { timeout: 15_000 });
  // Bộ đồng bộ khởi động lười sau khi có tài khoản: màn mở quá sớm có thể chưa gắn trạng thái => mở lại và thử lại
  await expect(async () => {
    await page.reload();
    await page.getByRole('button', { name: 'Đồng bộ ngay' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Đã sao lưu' })).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  return page;
}

async function openFriends(page: Page) {
  await page.goto('/ban-be');
}

async function setName(page: Page, name: string) {
  await openFriends(page);
  await page.getByLabel('Tên hiển thị cho bạn bè').fill(name);
  await page.getByRole('button', { name: 'Lưu tên' }).click();
  await expect(page.getByText(`Bạn bè thấy bạn là: ${name}`)).toBeVisible({ timeout: 15_000 });
}

test.describe('GĐ4c Bạn học hợp tác', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'pixel-7', 'chỉ chạy ở pixel-7'));

  test('hai hồ sơ kết bạn bằng mã, cùng học, cùng thấy tiến độ “chúng ta”; hủy kết bạn', async ({ browser }) => {
    test.setTimeout(90_000);
    const lan = await learner(browser, 20);
    const tom = await learner(browser, 45);
    await setName(lan, 'Lan');
    await setName(tom, 'Tom');

    // Lan tạo mã, Tom nhập (chữ thường, có khoảng trắng vẫn được)
    await lan.getByRole('button', { name: 'Tạo mã mời' }).click();
    const code = (await lan.getByTestId('friend-invite-code').textContent())!;
    expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    await tom.getByLabel('Mã mời của bạn bè').fill(` ${code.toLowerCase()} `);
    await tom.getByRole('button', { name: 'Kết bạn' }).click();
    await expect(tom.getByText('✓ Đã kết bạn với Lan!')).toBeVisible({ timeout: 15_000 });

    // Cả hai thấy cùng một tổng “chúng ta” 65/60 phút; mình luôn đứng trước, không có bảng xếp hạng
    const tomQuest = tom.getByRole('region', { name: 'Bạn và Lan' });
    await expect(tomQuest.getByText('Chúng ta: 65/60 phút tuần này')).toBeVisible();
    await expect(tomQuest.getByText('🎉 Chúng ta đã đạt mục tiêu tuần!')).toBeVisible();
    await expect(tomQuest.getByRole('listitem')).toHaveText(['Bạn: 45 phút', 'Lan: 20 phút']);
    await expect(tomQuest.getByText('🔥 1 tuần liên tiếp cùng đạt')).toBeVisible();

    await openFriends(lan);
    const lanQuest = lan.getByRole('region', { name: 'Bạn và Tom' });
    await expect(lanQuest.getByText('Chúng ta: 65/60 phút tuần này')).toBeVisible({ timeout: 15_000 });
    await expect(lanQuest.getByRole('listitem')).toHaveText(['Bạn: 20 phút', 'Tom: 45 phút']);
    await expect(lan.getByTestId('friend-invite-code')).toHaveCount(0); // mã đã dùng thì hết

    // Mục tiêu chung đổi ở một máy => máy kia thấy
    await lanQuest.getByLabel('Mục tiêu chung mỗi tuần').selectOption('90');
    await expect(lanQuest.getByText('Còn 25 phút nữa là cả hai cùng đạt.')).toBeVisible({ timeout: 15_000 });
    await openFriends(tom);
    await expect(tom.getByRole('region', { name: 'Bạn và Lan' }).getByText('Chúng ta: 65/90 phút tuần này')).toBeVisible({ timeout: 15_000 });

    // Đổi tên hiển thị sau khi đã đặt (việc sót GĐ4c) => bạn thấy tên mới
    await tom.getByRole('button', { name: 'Đổi tên' }).click();
    await expect(tom.getByLabel('Tên hiển thị cho bạn bè')).toHaveValue('Tom');
    await tom.getByLabel('Tên hiển thị cho bạn bè').fill('Tommy');
    await tom.getByRole('button', { name: 'Lưu tên' }).click();
    await expect(tom.getByText('Bạn bè thấy bạn là: Tommy')).toBeVisible({ timeout: 15_000 });
    await openFriends(lan);
    await expect(lan.getByRole('region', { name: 'Bạn và Tommy' })).toBeVisible({ timeout: 15_000 });

    // Hủy kết bạn (có xác nhận) => cả hai không còn thấy nhau
    await tom.getByRole('button', { name: 'Hủy kết bạn' }).click();
    await tom.getByRole('button', { name: 'Có, hủy kết bạn' }).click();
    await expect(tom.getByText(/Chưa có bạn học/)).toBeVisible({ timeout: 15_000 });
    await openFriends(lan);
    await expect(lan.getByText(/Chưa có bạn học/)).toBeVisible({ timeout: 15_000 });

    await lan.context().close();
    await tom.context().close();
  });
});
