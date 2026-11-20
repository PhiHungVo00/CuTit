import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { GATEWAY_PORT } from '../playwright.config';

/**
 * GĐ0: tài khoản khách + đồng bộ local-first với Gateway THẬT (PGlite trong RAM, xem playwright.config.ts).
 * Kiểm tra trên server bằng chính mã khôi phục (không đọc DB trực tiếp).
 */
const GW = `http://localhost:${GATEWAY_PORT}`;

async function serverCards(api: APIRequestContext, recoveryCode: string): Promise<string[]> {
  const rec = await api.post(`${GW}/v1/auth/recover`, { data: { recoveryCode } });
  expect(rec.status()).toBe(200);
  const { accessToken } = await rec.json();
  const sync = await api.post(`${GW}/v1/sync`, { data: { events: [] }, headers: { authorization: `Bearer ${accessToken}` } });
  expect(sync.status()).toBe(200);
  return ((await sync.json()).snapshot.srs as { itemRef: string }[]).map((c) => c.itemRef).sort();
}

async function saveDialectCard(page: Page, search: string, meaning: string) {
  await page.goto('/phuong-ngu');
  await page.getByRole('searchbox').fill(search);
  const card = page.getByRole('listitem').filter({ hasText: meaning });
  await card.getByRole('button', { name: /Lưu để ôn tập/ }).click();
  await expect(card.getByRole('button', { name: /Đã lưu để ôn/ })).toBeDisabled();
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

test.describe('GĐ0 Tài khoản khách & đồng bộ', () => {
  test.describe.configure({ mode: 'serial' });
  // Chỉ chạy một cấu hình màn hình: đây là kiểm tra dữ liệu, không phải bố cục
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'pixel-7', 'chỉ chạy ở pixel-7'));

  test('mất mạng → thêm thẻ → có mạng: server có đủ thẻ, không trùng; tải lại vẫn còn; máy khác khôi phục thấy đủ', async ({ page, browser, request }) => {
    await saveDialectCard(page, 'heo', 'Con lợn');
    const code = await recoveryCode(page);
    await expect.poll(() => serverCards(request, code), { timeout: 15_000 }).toHaveLength(1);

    // Mất mạng (Gateway không tới được): thẻ mới vẫn lưu trên máy, nằm trong hàng đợi
    await page.route('**/v1/**', (route) => route.abort('internetdisconnected'));
    await saveDialectCard(page, 'bắp', 'Bắp ngô');
    await page.goto('/cai-dat/tai-khoan');
    await page.getByRole('button', { name: 'Đồng bộ ngay' }).click();
    await expect(page.getByText(/Chưa đồng bộ được/).first()).toBeVisible();

    // Có mạng lại: gửi hàng đợi, kể cả bấm đồng bộ nhiều lần cũng không nhân đôi
    await page.unroute('**/v1/**');
    // Bộ đồng bộ vừa lỗi mạng nên có thể còn chờ thử lại: bấm lại tới khi báo đã sao lưu (cùng khẳng định, chỉ bớt phụ thuộc thời điểm)
    await expect(async () => {
      await page.getByRole('button', { name: 'Đồng bộ ngay' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Đã sao lưu' })).toBeVisible({ timeout: 4_000 });
    }).toPass({ timeout: 25_000 });
    await page.getByRole('button', { name: 'Đồng bộ ngay' }).click();
    const cards = await serverCards(request, code);
    expect(cards).toHaveLength(2);
    expect(new Set(cards).size).toBe(2);

    // Tắt/mở lại app (tải lại): dữ liệu trên máy còn
    await page.reload();
    await page.goto('/phuong-ngu');
    await page.getByRole('searchbox').fill('bắp');
    await expect(page.getByRole('listitem').filter({ hasText: 'Bắp ngô' }).getByRole('button', { name: /Đã lưu để ôn/ })).toBeVisible();

    // “Máy khác” = hồ sơ trình duyệt mới: nhập mã khôi phục => thấy đủ thẻ SRS
    const other = await browser.newContext({ locale: 'vi-VN' });
    const p2 = await other.newPage();
    await p2.goto('/cai-dat/tai-khoan');
    await p2.getByLabel('Mã khôi phục từ máy khác').fill(code.toLowerCase());
    await p2.getByRole('button', { name: 'Khôi phục trên máy này' }).click();
    await expect(p2.getByText('✓ Đã khôi phục: 2 thẻ ôn.')).toBeVisible({ timeout: 15_000 });
    await expect(p2.getByTestId('recovery-code')).toHaveText(code);
    await p2.goto('/phuong-ngu');
    await p2.getByRole('searchbox').fill('heo');
    await expect(p2.getByRole('button', { name: /Đã lưu để ôn/ })).toBeVisible();
    await other.close();
  });

  test('xóa tài khoản: server không còn dữ liệu, mã khôi phục hết hiệu lực, máy sạch', async ({ page, request }) => {
    await saveDialectCard(page, 'heo', 'Con lợn');
    const code = await recoveryCode(page);
    await expect.poll(() => serverCards(request, code), { timeout: 15_000 }).toHaveLength(1);
    await page.getByRole('button', { name: 'Xóa tài khoản và dữ liệu…' }).click();
    await page.getByRole('button', { name: 'Xóa vĩnh viễn' }).click();
    await expect(page.getByText('✓ Đã xóa tài khoản và dữ liệu.')).toBeVisible({ timeout: 15_000 });
    expect((await request.post(`${GW}/v1/auth/recover`, { data: { recoveryCode: code } })).status()).toBe(401);
    await page.goto('/phuong-ngu');
    await page.getByRole('searchbox').fill('heo');
    await expect(page.getByRole('listitem').filter({ hasText: 'Con lợn' }).getByRole('button', { name: /Lưu để ôn tập/ })).toBeVisible();
  });

  test('người dùng cũ (dữ liệu có từ trước GĐ0, chưa từng đồng bộ): thẻ trên máy được tải lên server', async ({ page, request }) => {
    await page.addInitScript(() => {
      if (localStorage.getItem('becutit.learner')) return;
      const card = { itemRef: 'dialect:d2', front: 'lạc', back: 'đậu phộng', source: 'dialect', ease: 250, intervalDays: 6, repetitions: 2, dueAt: '2026-12-01T00:00:00.000Z' };
      localStorage.setItem('becutit.learner', JSON.stringify({ version: 1, state: { srs: { 'dialect:d2': card }, activity: { '2026-11-10': 600 } } }));
    });
    await page.goto('/');
    const code = await recoveryCode(page);
    await expect.poll(() => serverCards(request, code), { timeout: 15_000 }).toEqual(['dialect:d2']);
  });
});
