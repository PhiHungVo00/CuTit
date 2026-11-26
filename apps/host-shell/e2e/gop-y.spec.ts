import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Dự án 5a Task 3: màn Góp ý / Báo lỗi. Gateway THẬT (PGlite) chỉ lo tài khoản khách; các đường `/v1/feedback*`
 * được GIẢ ở trình duyệt (page.route) vì phần Gateway nhận góp ý (Task 2, PR riêng) chưa nằm trên nhánh này.
 * ⇒ e2e với Gateway thật cho góp ý CHƯA chạy; việc đó thuộc Task 7 (phiên chính).
 * Điều kiểm bằng trình duyệt thật ở đây: ảnh gửi đi là WebP vẽ lại (không còn EXIF/GPS), rớt mạng rồi "Gửi lại", chấm đỏ.
 */
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });
const ID = '11111111-1111-4111-8111-111111111111';

async function mockFeedback(page: Page, opts: { unread: number; failFirstPost?: boolean }) {
  const posts: Buffer[] = [];
  let failed = false;
  await page.route(/\/v1\/feedback/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (url.pathname.endsWith('/unread-count')) return json(route, { count: opts.unread });
    if (url.pathname.endsWith('/mine')) return json(route, { items: [] });
    if (req.method() === 'POST' && url.pathname === '/v1/feedback') {
      if (opts.failFirstPost && !failed) {
        failed = true;
        return route.abort('failed');
      }
      posts.push(req.postDataBuffer() ?? Buffer.alloc(0));
      return json(route, { id: ID });
    }
    return route.fallback();
  });
  return posts;
}

/** JPEG thật (vẽ bằng canvas) + đoạn APP1 "Exif" giả có toạ độ GPS chèn sau SOI */
async function jpegWithGps(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 48;
    const x = c.getContext('2d')!;
    x.fillStyle = '#6FA544';
    x.fillRect(0, 0, 64, 48);
    return c.toDataURL('image/jpeg', 0.9).split(',')[1]!;
  });
  const jpg = Buffer.from(b64, 'base64');
  const payload = Buffer.from('Exif\0\0GPSLatitude=10.7769N GPSLongitude=106.7009E');
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload]);
  return Buffer.concat([jpg.subarray(0, 2), app1, jpg.subarray(2)]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('becutit.device', JSON.stringify({ version: 1, state: { theme: 'light', seenBubbleIntro: true } }));
  });
});

test('Hồ sơ → Góp ý → gửi kèm ảnh: ảnh là WebP đã vẽ lại, không còn EXIF/GPS; có chấm đỏ khi có tin mới', async ({ page }) => {
  const posts = await mockFeedback(page, { unread: 2 });
  await page.goto('/ho-so');
  const row = page.getByRole('link', { name: /Góp ý \/ Báo lỗi/ });
  await expect(row).toBeVisible();
  // Khách chưa có tài khoản thì app KHÔNG hỏi Gateway (không tự tạo khách chỉ để đếm tin) => giả sự kiện "có 2 tin chưa đọc"
  // (cùng sự kiện mà chunk chấm đỏ và Hồ sơ phát sau khi hỏi Gateway). Phát lặp tới khi chunk lười đã gắn bộ nghe.
  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('becutit:feedback-unread', { detail: 2 })));
    await expect(row.getByText('Có tin mới')).toBeAttached({ timeout: 300 });
    await expect(page.locator('.tabbar a[href="/ho-so"]').getByText('Có tin mới')).toBeAttached({ timeout: 300 });
  }).toPass({ timeout: 15_000 });

  await row.click();
  await expect(page).toHaveURL(/\/gop-y$/);
  await page.getByRole('textbox').fill('Bấm nút nghe giọng Nam ở bài 3 thì không có tiếng');
  await page.getByTestId('fb-image-input').setInputFiles({ name: 'anh.jpg', mimeType: 'image/jpeg', buffer: await jpegWithGps(page) });
  await expect(page.getByRole('button', { name: /Bỏ ảnh 1/ })).toBeVisible();
  await page.getByRole('button', { name: 'Gửi', exact: true }).click();
  await expect(page.getByText('Cảm ơn bạn! Mình sẽ xem sớm.')).toBeVisible();

  expect(posts).toHaveLength(1);
  const body = posts[0]!;
  const text = body.toString('latin1');
  expect(text).toContain('name="meta"');
  expect(text).toContain('"kind":"bug"');
  expect(text).toContain('RIFF');
  expect(text).toContain('WEBP');
  expect(text).not.toContain('Exif');
  expect(text).not.toContain('GPSLatitude');
});

test('rớt mạng lúc gửi: chữ và ảnh còn nguyên, bấm "Gửi lại" thì được', async ({ page }) => {
  const posts = await mockFeedback(page, { unread: 0, failFirstPost: true });
  await page.goto('/gop-y');
  await page.getByRole('textbox').fill('Màn Hồ sơ bị giật khi cuộn danh sách');
  await page.getByTestId('fb-image-input').setInputFiles({ name: 'anh.jpg', mimeType: 'image/jpeg', buffer: await jpegWithGps(page) });
  await page.getByRole('button', { name: 'Gửi', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('mất mạng');
  await expect(page.getByRole('textbox')).toHaveValue('Màn Hồ sơ bị giật khi cuộn danh sách');
  await expect(page.getByRole('button', { name: /Bỏ ảnh 1/ })).toBeVisible();
  await page.getByRole('button', { name: 'Gửi lại' }).click();
  await expect(page.getByText('Cảm ơn bạn! Mình sẽ xem sớm.')).toBeVisible();
  expect(posts).toHaveLength(1);
});

test('video dài hơn 60 giây bị chặn trước khi gửi', async ({ page }) => {
  await mockFeedback(page, { unread: 0 });
  await page.goto('/gop-y');
  // Ép thẻ <video> báo 61 giây (không cần tệp video thật)
  await page.evaluate(() => {
    Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get: () => 61 });
    HTMLMediaElement.prototype.load = function (this: HTMLMediaElement) {
      queueMicrotask(() => this.onloadedmetadata?.(new Event('loadedmetadata')));
    };
  });
  await page.getByTestId('fb-video-input').setInputFiles({ name: 'v.mp4', mimeType: 'video/mp4', buffer: Buffer.from('x') });
  await expect(page.getByRole('alert')).toContainText('60 giây');
  await expect(page.getByRole('button', { name: /Bỏ video/ })).toHaveCount(0);
});
