import { expect, test, type Page } from '@playwright/test';
import { GATEWAY_PORT } from '../playwright.config';
import { VI, solveLesson, type Strings } from './lesson-helpers';

/**
 * GĐ4a — Huy hiệu theo thành thạo + tổng kết tuần (so với chính mình). Chạy cả Pixel 7 và màn 320 px.
 * Huy hiệu đồng bộ qua Gateway THẬT (achievement.earn) => khôi phục ở hồ sơ trình duyệt mới vẫn còn, không báo lại.
 */

async function noOverflow(page: Page) {
  const { scrollW, clientW } = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }));
  expect(scrollW, 'không được tràn ngang').toBeLessThanOrEqual(clientW);
}

async function passTestOut(page: Page, unit: string) {
  await page.goto(`/kiem-tra/${unit}`);
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
}

test.describe('GĐ4a Huy hiệu + tổng kết tuần', () => {
  test('vượt unit 1 => thông báo nhẹ “Huy hiệu mới”; đã xem thì không báo lại; danh sách ghi đã có / còn thiếu', async ({ page }) => {
    test.setTimeout(120_000);
    await passTestOut(page, 'u1');
    const notice = page.getByRole('status').filter({ hasText: 'Huy hiệu mới' });
    await expect(notice).toContainText('Xong unit 1');
    await expect(notice).toContainText('Vượt rào');
    await page.getByRole('link', { name: 'Về lộ trình' }).click();
    // chưa bấm “Đã xem” => trang chủ vẫn nhắc một lần nữa
    await expect(notice).toBeVisible();
    await notice.getByRole('button', { name: 'Đã xem' }).click();
    await expect(notice).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('region', { name: 'Tổng kết tuần' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Huy hiệu mới' })).toHaveCount(0);
    await page.getByText(/Huy hiệu \(2\/\d+\)/).click();
    const list = page.getByRole('list', { name: 'Huy hiệu' });
    await expect(list.getByRole('listitem').filter({ hasText: 'Vượt rào' })).toContainText('Đã có');
    await expect(list.getByRole('listitem').filter({ hasText: 'Xong unit 2' })).toContainText(/0\/5 · còn 5/);
    await expect(list.getByRole('listitem').filter({ hasText: 'Sáu thanh vững' })).toContainText(/còn 6/);
    // không có huy hiệu theo số ngày, không so với người khác
    expect(await page.locator('text=/xếp hạng|leaderboard|ngày liên tục mở app/i').count()).toBe(0);
    await noOverflow(page);
  });

  test('tổng kết tuần: xong một bài => số bài + thời gian tuần này; so với tuần trước của chính mình', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/bai-hoc/u1l1');
    await solveLesson(page, VI);
    await page.getByRole('link', { name: 'Về lộ trình' }).click();
    const week = page.getByRole('region', { name: 'Tổng kết tuần' });
    await expect(week).toContainText('1 bài');
    await expect(week).toContainText('Chưa có số liệu tuần trước');

    // giả lập tuần trước (dữ liệu trên máy): 3 bài + 20 phút, 8 ngày trước
    // chèn TRƯỚC khi app chạy (app đang mở sẽ ghi đè localStorage bằng bộ đếm giờ học)
    await page.addInitScript(() => {
      if (sessionStorage.getItem('gd4-seeded')) return;
      sessionStorage.setItem('gd4-seeded', '1');
      const d = new Date();
      d.setDate(d.getDate() - 7 - ((d.getDay() + 6) % 7)); // Thứ Hai tuần trước
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const p = JSON.parse(localStorage.getItem('becutit.progress')!);
      p.state.lessonsByDay = { ...p.state.lessonsByDay, [key]: 3 };
      localStorage.setItem('becutit.progress', JSON.stringify(p));
      const l = JSON.parse(localStorage.getItem('becutit.learner')!);
      l.state.activity = { ...l.state.activity, [key]: 1200 };
      localStorage.setItem('becutit.learner', JSON.stringify(l));
    });
    await page.reload();
    await expect(week).toContainText('tuần trước 3 bài');
    await expect(week).toContainText('tuần trước 20 phút');
    await expect(week).not.toContainText('Chưa có số liệu tuần trước');
    await noOverflow(page);

    // song ngữ
    await page.goto('/tuy-chinh');
    await page.getByRole('radio', { name: /English/ }).check();
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Weekly summary' })).toContainText('last week 3 lessons');
    await expect(page.getByText(/Badges \(\d+\/\d+\)/)).toBeVisible();
    await noOverflow(page);
  });

  test('bài có nút nghe kèm nút 🐢 đọc chậm (vùng chạm ≥ 44 px)', async ({ page }) => {
    await page.goto('/bai-hoc/u1l1');
    const slow = page.getByRole('button', { name: 'Nghe chậm' });
    await expect(slow).toBeVisible();
    expect((await slow.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await slow.click(); // máy không có giọng/tệp => im lặng, không lỗi
    await expect(page.locator('#ct-ex-q')).toBeVisible();
  });

  test('huy hiệu đồng bộ: khôi phục ở hồ sơ trình duyệt mới vẫn còn, không thông báo lại', async ({ page, browser, request }, info) => {
    test.skip(info.project.name !== 'pixel-7', 'chỉ chạy ở pixel-7');
    test.setTimeout(120_000);
    await passTestOut(page, 'u2');
    await page.getByRole('status').filter({ hasText: 'Huy hiệu mới' }).getByRole('button', { name: 'Đã xem' }).click();
    // tạo tài khoản + mã khôi phục (đồng bộ chạy sau đó)
    await page.goto('/tuy-chinh');
    const create = page.getByRole('button', { name: 'Tạo tài khoản và mã khôi phục ngay' });
    const codeEl = page.getByTestId('recovery-code');
    await expect(create.or(codeEl)).toBeVisible();
    if (await create.isVisible()) await create.click();
    await expect(codeEl).toHaveText(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/, { timeout: 15_000 });
    const code = (await codeEl.textContent())!;
    // server đã nhận achievement.earn (bảng achievements có sẵn từ GĐ0)
    const GW = `http://localhost:${GATEWAY_PORT}`;
    const serverBadges = async () => {
      const { accessToken } = await (await request.post(`${GW}/v1/auth/recover`, { data: { recoveryCode: code } })).json();
      const sync = await request.post(`${GW}/v1/sync`, { data: { events: [] }, headers: { authorization: `Bearer ${accessToken}` } });
      return ((await sync.json()).snapshot.achievements as { key: string }[]).map((a) => a.key).sort();
    };
    await expect.poll(serverBadges, { timeout: 15_000 }).toEqual(['testout', 'unit:u2']);

    const ctx = await browser.newContext({ locale: 'vi-VN' });
    const b = await ctx.newPage();
    await b.goto('/tuy-chinh');
    await b.getByLabel('Mã khôi phục từ máy khác').fill(code);
    await b.getByRole('button', { name: 'Khôi phục trên máy này' }).click();
    await expect(b.getByText(/✓ Đã khôi phục/)).toBeVisible({ timeout: 15_000 });
    await b.goto('/');
    await expect(b.getByRole('region', { name: 'Tổng kết tuần' })).toBeVisible();
    await b.getByText(/Huy hiệu \(2\/\d+\)/).click();
    await expect(b.getByRole('list', { name: 'Huy hiệu' }).getByRole('listitem').filter({ hasText: 'Xong unit 2' })).toContainText('Đã có');
    await expect(b.getByRole('status').filter({ hasText: 'Huy hiệu mới' })).toHaveCount(0);
    await ctx.close();
  });
});
