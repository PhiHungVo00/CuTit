import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { GATEWAY_PORT } from '../playwright.config';

/**
 * GĐ4b — Chế độ trẻ em (D4) với Gateway THẬT: phụ huynh tạo hồ sơ trẻ trên máy → trẻ không vào được chat tự do /
 * gọi thoại / camera (giao diện) VÀ Gateway trả 403 khi gọi thẳng API bằng token trẻ (không mock endpoint bị chặn).
 */
const GW = `http://localhost:${GATEWAY_PORT}`;
const SID = '7d444840-9dc0-11d1-b245-5ffdce74fad2';
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]).toString('base64');

async function recoveryCode(page: Page): Promise<string> {
  await page.goto('/tuy-chinh');
  const create = page.getByRole('button', { name: 'Tạo tài khoản và mã khôi phục ngay' });
  const code = page.getByTestId('recovery-code');
  await expect(create.or(code)).toBeVisible();
  if (await create.isVisible()) await create.click();
  await expect(code).toHaveText(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/, { timeout: 15_000 });
  return (await code.textContent())!;
}

/** Token của hồ sơ trẻ, xin bằng tài khoản phụ huynh (khôi phục bằng mã — không làm hỏng phiên trên máy) */
async function childToken(api: APIRequestContext, parentCode: string): Promise<string> {
  const rec = await api.post(`${GW}/v1/auth/recover`, { data: { recoveryCode: parentCode } });
  expect(rec.status()).toBe(200);
  const parent = { authorization: `Bearer ${(await rec.json()).accessToken}` };
  const list = await (await api.get(`${GW}/v1/family/children`, { headers: parent })).json();
  expect(list.children).toHaveLength(1);
  const s = await api.post(`${GW}/v1/family/children/${list.children[0].userId}/session`, { headers: parent });
  expect(s.status()).toBe(200);
  return (await s.json()).accessToken;
}

test.describe('GĐ4b Chế độ trẻ em', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'pixel-7', 'chỉ chạy ở pixel-7'));

  test('phụ huynh tạo hồ sơ trẻ → trẻ không vào được chat tự do / gọi thoại / camera; Gateway chặn 403; PIN đưa về phụ huynh', async ({ page, request }) => {
    const code = await recoveryCode(page);

    // Mục Gia đình (từ Tùy chỉnh) → đặt PIN → tạo hồ sơ “Bin”
    await page.getByTestId('family-link').click();
    await expect(page).toHaveURL(/\/tuy-chinh\?muc=gia-dinh$/);
    await page.getByLabel('Mã PIN mới').fill('2580');
    await page.getByLabel('Nhập lại mã PIN').fill('2580');
    await page.getByRole('button', { name: 'Lưu mã PIN' }).click();
    await page.getByLabel(/Tên gọi ở nhà/).fill('Bin');
    await page.getByRole('button', { name: 'Tạo hồ sơ' }).click();
    const kid = page.getByTestId('kid').filter({ hasText: 'Bin' });
    await expect(kid).toBeVisible({ timeout: 15_000 });

    // Chuyển sang hồ sơ trẻ
    await kid.getByRole('button', { name: 'Dùng hồ sơ này' }).click();
    await expect(page.getByTestId('child-now')).toContainText('Bin', { timeout: 15_000 });

    // Giao diện: chat tự do, gọi thoại, camera đều khóa với lời thân thiện
    await page.goto('/hoi-thoai');
    await expect(page.getByTestId('child-lock')).toContainText('nhập vai');
    await page.goto('/goi-thoai');
    await expect(page).toHaveURL(/\/hoi-thoai$/);
    await expect(page.getByTestId('child-lock')).toBeVisible();
    await page.goto('/camera');
    await expect(page.getByTestId('child-lock')).toContainText('bố mẹ');
    // Tùy chỉnh: không có mã khôi phục / xóa tài khoản trong hồ sơ trẻ
    await page.goto('/tuy-chinh');
    await expect(page.getByTestId('family-link')).toBeVisible();
    await expect(page.getByTestId('recovery-code')).toHaveCount(0);

    // Gateway (lớp thật): token trẻ bị chặn chat tự do, gọi thoại và ảnh — kể cả khi bỏ qua giao diện
    const kidAuth = { authorization: `Bearer ${await childToken(request, code)}` };
    const free = await request.post(`${GW}/v1/chat/turn`, { headers: kidAuth, data: { sessionId: SID, userText: 'xin chào' } });
    expect(free.status()).toBe(403);
    expect((await free.json()).error).toBe('child_free_chat_blocked');
    const call = await request.post(`${GW}/v1/chat/turn`, { headers: kidAuth, data: { sessionId: SID, userText: 'chào', scenarioId: 'sc1', mode: 'call' } });
    expect(call.status()).toBe(403);
    const cam = await request.post(`${GW}/v1/vision/label`, { headers: kidAuth, data: { imageBase64: jpeg } });
    expect(cam.status()).toBe(403);
    expect((await cam.json()).error).toBe('parent_consent_required');
    const roleplay = await request.post(`${GW}/v1/chat/turn`, { headers: kidAuth, data: { sessionId: SID, userText: 'xin chào', scenarioId: 'sc1' } });
    expect(roleplay.status()).toBe(200);

    // Cổng phụ huynh: PIN sai bị từ chối, PIN đúng đưa máy về hồ sơ phụ huynh
    await page.goto('/tuy-chinh?muc=gia-dinh');
    await page.getByLabel('Mã PIN').fill('1111');
    await page.getByRole('button', { name: 'Mở' }).click();
    await expect(page.getByRole('alert')).toContainText('chưa đúng');
    await page.getByLabel('Mã PIN').fill('2580');
    await page.getByRole('button', { name: 'Mở' }).click();
    await expect(page.getByTestId('kid').filter({ hasText: 'Bin' })).toBeVisible({ timeout: 15_000 });
    await page.goto('/tuy-chinh');
    await expect(page.getByTestId('recovery-code')).toHaveText(code);
  });
});
