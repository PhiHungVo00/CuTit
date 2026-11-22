import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { GATEWAY_PORT } from '../playwright.config';
import { VI, solveLesson } from './lesson-helpers';

/**
 * Nối GĐ0 ↔ GĐ1: tiến độ lộ trình (XP, bài đã xong) đồng bộ qua Gateway THẬT; xóa tài khoản ở máy A
 * => máy B về trạng thái người mới. “Máy khác” = hồ sơ trình duyệt mới (browser.newContext).
 */
const GW = `http://localhost:${GATEWAY_PORT}`;

async function serverProgress(api: APIRequestContext, recoveryCode: string) {
  const rec = await api.post(`${GW}/v1/auth/recover`, { data: { recoveryCode } });
  expect(rec.status()).toBe(200);
  const { accessToken } = await rec.json();
  const sync = await api.post(`${GW}/v1/sync`, { data: { events: [] }, headers: { authorization: `Bearer ${accessToken}` } });
  const snap = (await sync.json()).snapshot as { xp: { total: number }; lessons: { lessonId: string; status: string }[] };
  return { xp: snap.xp.total, lessons: snap.lessons.filter((l) => l.status === 'completed').map((l) => l.lessonId).sort() };
}

async function recoveryCode(page: Page): Promise<string> {
  await page.goto('/cai-dat/tai-khoan');
  const create = page.getByRole('button', { name: 'Tạo tài khoản và mã khôi phục ngay' });
  const code = page.getByTestId('recovery-code');
  await expect(create.or(code)).toBeVisible();
  if (await create.isVisible()) await create.click();
  await expect(code).toHaveText(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/, { timeout: 15_000 });
  return (await code.textContent())!;
}

async function restore(page: Page, code: string) {
  await page.goto('/cai-dat/tai-khoan');
  await page.getByLabel('Mã khôi phục từ máy khác').fill(code);
  await page.getByRole('button', { name: 'Khôi phục trên máy này' }).click();
  await expect(page.getByText(/✓ Đã khôi phục/)).toBeVisible({ timeout: 15_000 });
}

const readXp = async (page: Page) => Number(((await page.getByTestId('xp').textContent()) ?? '').replace(/\D/g, ''));

test.describe('Nối tiến độ GĐ0 ↔ GĐ1', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'pixel-7', 'chỉ chạy ở pixel-7'));

  test('học 1 bài ⇒ khôi phục trên hồ sơ trình duyệt mới thấy đúng XP và bài đã xong', async ({ page, browser, request }) => {
    test.setTimeout(90_000);
    await page.goto('/');
    await page.getByRole('link', { name: /Bắt đầu bài đầu tiên/ }).click();
    await solveLesson(page, VI);
    await page.getByRole('link', { name: 'Về lộ trình' }).click();
    const xp = await readXp(page);
    expect(xp).toBeGreaterThanOrEqual(10);

    const code = await recoveryCode(page);
    await expect.poll(() => serverProgress(request, code), { timeout: 15_000 }).toEqual({ xp, lessons: ['u1l1'] });

    const other = await browser.newContext({ locale: 'vi-VN' });
    const p2 = await other.newPage();
    await restore(p2, code);
    await p2.goto('/');
    await expect(p2.getByTestId('xp')).toHaveText(`⭐ ${xp}`);
    await expect(p2.getByTestId('streak')).toHaveText(/🔥 1/);
    await expect(p2.getByRole('region', { name: /Chào hỏi & xưng hô/ }).getByText('1/4 bài')).toBeVisible();
    // tải lại + đồng bộ lần nữa không cộng XP lần hai
    await p2.reload();
    await expect(p2.getByTestId('xp')).toHaveText(`⭐ ${xp}`);
    expect((await serverProgress(request, code)).xp).toBe(xp);
    await other.close();
  });

  test('xóa tài khoản ở máy A ⇒ máy B về trạng thái người mới, có thông báo', async ({ page, browser }) => {
    test.setTimeout(90_000);
    await page.goto('/');
    await page.getByRole('link', { name: /Bắt đầu bài đầu tiên/ }).click();
    await solveLesson(page, VI);
    const code = await recoveryCode(page);

    // Máy B khôi phục cùng tài khoản, thấy tiến độ
    const other = await browser.newContext({ locale: 'vi-VN' });
    const b = await other.newPage();
    await restore(b, code);
    await b.goto('/');
    await expect(b.getByRole('region', { name: /Chào hỏi & xưng hô/ }).getByText('1/4 bài')).toBeVisible();
    expect(await readXp(b)).toBeGreaterThan(0);

    // Máy A xóa tài khoản
    await page.goto('/cai-dat/tai-khoan');
    await page.getByRole('button', { name: 'Xóa tài khoản và dữ liệu…' }).click();
    await page.getByRole('button', { name: 'Xóa vĩnh viễn' }).click();
    await expect(page.getByText('✓ Đã xóa tài khoản và dữ liệu.')).toBeVisible({ timeout: 15_000 });

    // Máy B mở lại app: Gateway báo account_deleted => xóa dữ liệu trên máy, bắt đầu như người mới
    await b.reload();
    await expect(b.getByRole('alert').filter({ hasText: 'Tài khoản đã bị xóa trên thiết bị khác' })).toBeVisible({ timeout: 15_000 });
    await expect(b.getByTestId('xp')).toHaveText(/⭐ 0/);
    await expect(b.getByRole('link', { name: /Bắt đầu bài đầu tiên/ })).toBeVisible();
    const stored = await b.evaluate(() => JSON.parse(localStorage.getItem('becutit.progress') ?? '{}').state?.lessons ?? {});
    expect(stored).toEqual({});
    // thông báo còn sau khi tải lại tới khi bấm “Đã hiểu”
    await b.reload();
    await b.getByRole('button', { name: 'Đã hiểu' }).click();
    await expect(b.getByRole('alert')).toHaveCount(0);
    await other.close();
  });

  test('trang chính sách quyền riêng tư: mở từ Tùy chỉnh, có nhãn bản nháp, song ngữ', async ({ page }) => {
    await page.goto('/cai-dat/quyen-rieng-tu');
    await page.getByRole('link', { name: 'Đọc chính sách quyền riêng tư' }).click();
    await expect(page).toHaveURL(/\/quyen-rieng-tu$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Chính sách quyền riêng tư' })).toBeVisible();
    await expect(page.getByRole('note')).toContainText('BẢN NHÁP');
    await expect(page.getByText(/Google \(Gemini\)/).first()).toBeVisible();
    // căn cứ pháp lý mới (không còn Nghị định 13/2023 làm căn cứ chính), quyền rút lại đồng ý, không mua bán dữ liệu
    await expect(page.getByRole('heading', { name: 'Căn cứ pháp lý' })).toBeVisible();
    await expect(page.getByText(/91\/2025\/QH15/)).toBeVisible();
    await expect(page.getByText(/Rút lại đồng ý bất cứ lúc nào/)).toBeVisible();
    await expect(page.getByText(/Không mua, bán dữ liệu cá nhân/)).toBeVisible();
    await page.goto('/cai-dat/ngon-ngu');
    await page.getByRole('radio', { name: /English/ }).check();
    await page.goto('/quyen-rieng-tu');
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();
    await expect(page.getByRole('note')).toContainText('DRAFT');
    await expect(page.getByRole('heading', { name: 'Your rights' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test('rút lại đồng ý ở Tùy chỉnh: có hiệu lực ngay, lần sau dùng micro app hỏi lại', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('becutit.learner', JSON.stringify({ state: { consents: { voice: true, camera: true } }, version: 1 }));
    });
    await page.goto('/cai-dat/quyen-rieng-tu');
    // Cài đặt mới: mỗi đồng ý là một công tắc (đang bật = "Đã đồng ý"); tắt = rút lại, chỉ rút, không cấp lại ở đây
    const voice = page.getByRole('switch', { name: /Giọng nói/ });
    const camera = page.getByRole('switch', { name: /Camera từ vựng/ });
    await expect(voice).toBeChecked();
    await expect(camera).toBeChecked();
    await expect(page.getByText('Đã đồng ý', { exact: true })).toHaveCount(2);
    await voice.click();
    await expect(voice).not.toBeChecked();
    await expect(voice).toBeDisabled();
    await expect(page.getByText(/Chưa đồng ý/)).toHaveCount(1);
    await expect(camera).toBeChecked();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('becutit.learner')!).state.consents);
    expect(stored).toEqual({ camera: true });
  });
});
