import { expect, test, type Page } from '@playwright/test';
import { installFakeMicStartHook } from './fake-mic';

/**
 * GĐ3 — Hội thoại AI, chạy với Gateway THẬT (PGlite RAM, không khóa AI => gia sư + STT giả lập, xem playwright.config.ts).
 */

async function assertMobileLayout(page: Page) {
  const info = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    small: [...document.querySelectorAll('main button, main a, main input')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 44;
      })
      .map((el) => (el.textContent || el.tagName).trim().slice(0, 30))
  }));
  expect(info.scrollW, 'không được tràn ngang').toBeLessThanOrEqual(info.clientW);
  expect(info.small, 'vùng chạm < 44px').toEqual([]);
}

const srsOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('becutit.learner') ?? '{"state":{"srs":{}}}').state.srs as Record<string, { front: string }>);

/** Micro giả: mỗi lần mở micro phát 0.4 s im lặng → 1 s "giọng" (âm 220 Hz) → im lặng (để bộ phát hiện ngừng nói tự dừng) */
async function fakeMicSpeechThenSilence(page: Page) {
  await installFakeMicStartHook(page);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      osc.frequency.value = 220;
      const gain = ctx.createGain();
      const dest = ctx.createMediaStreamDestination();
      osc.connect(gain).connect(dest);
      (dest.stream as MediaStream & { __start?: () => void }).__start = () => {
        const t = ctx.currentTime;
        gain.gain.setValueAtTime(0, t);
        gain.gain.setValueAtTime(0.8, t + 0.4);
        gain.gain.setValueAtTime(0, t + 1.4);
        osc.start();
      };
      return dest.stream;
    };
  });
}

test.describe('GĐ3 Hội thoại AI', () => {
  test('nhập vai AI cuối unit 1 (đường dẫn cũ, Gateway thật) → xong bài, +XP, unit 5/5, một chạm thêm từ mới vào ôn tập', async ({ page }) => {
    test.setTimeout(60_000);
    // Ghi dữ liệu TRƯỚC khi app chạy (một lần): ghi lúc app đang chạy rồi reload thì có thể bị ghi đè
    // bởi lần lưu store đang dở (đồng bộ / kiểm tra huy hiệu lúc khởi động — GĐ4).
    await page.addInitScript(() => {
      if (sessionStorage.getItem('e2e.seeded')) return;
      sessionStorage.setItem('e2e.seeded', '1');
      const rec = { best: 1, times: 1, at: new Date().toISOString() };
      localStorage.setItem('becutit.progress', JSON.stringify({ state: { lessons: { u1l1: rec, u1l2: rec, u1l3: rec, u1l4: rec }, lessonsDone: 4 }, version: 1 }));
    });
    // Tình huống cuối unit giờ là kịch bản không AI (tinh-huong.spec.ts); màn nhập vai AI vẫn mở được bằng đường dẫn cũ
    await page.goto('/');
    const unit1 = page.getByRole('region', { name: /Chào hỏi & xưng hô/ });
    await expect(unit1.getByText('4/4 bài')).toBeVisible();
    const xpBefore = Number(((await page.getByTestId('xp').textContent()) ?? '').replace(/\D/g, ''));

    await page.goto('/nhap-vai?kb=sc5&bai=u1l5');
    await expect(page.getByRole('heading', { name: /Gặp hàng xóm mới/ })).toBeVisible();
    const tasks = page.getByRole('list', { name: 'Nhiệm vụ' });
    await expect(tasks.getByText('(chưa xong)')).toHaveCount(4);
    await assertMobileLayout(page);

    await page.getByLabel('Tin nhắn').fill('Cháu chào cô ạ, cháu tên là Mai');
    await page.getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect(tasks.getByText('(đã xong)')).toHaveCount(2, { timeout: 20_000 }); // lượt đầu: tạo tài khoản khách + mở DB Gateway
    await page.getByLabel('Tin nhắn').fill('Cô có khỏe không ạ? Tạm biệt cô');
    await page.getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect(tasks.getByText('(đã xong)')).toHaveCount(4, { timeout: 20_000 });

    await page.getByRole('button', { name: 'Hoàn thành! Xem tổng kết' }).click();
    await expect(page.getByRole('heading', { name: 'Tổng kết: 4/4 nhiệm vụ' })).toBeVisible();
    await expect(page.getByText(/^Đã xong bài “Nhập vai: Gặp hàng xóm mới” · \+\d+ XP$/)).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Từ mới \(\d+\)$/ })).toBeVisible();
    await page.getByRole('button', { name: '＋ Thêm vào ôn tập: tên' }).click();
    expect((await srsOf(page))['conv:word:tên']).toMatchObject({ front: 'tên' });
    await assertMobileLayout(page);

    await page.getByRole('link', { name: 'Về lộ trình' }).click();
    await expect(unit1.getByText('4/4 bài')).toBeVisible();
    expect(Number(((await page.getByTestId('xp').textContent()) ?? '').replace(/\D/g, ''))).toBeGreaterThan(xpBefore);
    await expect(page.getByRole('link', { name: /^Học tiếp/ }).first()).toContainText('Số từ 1 đến 5');
  });

  test('gọi thoại 2 lượt bằng giọng (micro giả, Gateway thật): tự nhận ngừng nói, phụ đề, gác máy → tổng kết → thêm vào ôn tập', async ({ page }) => {
    test.setTimeout(90_000);
    await fakeMicSpeechThenSilence(page);
    const turns: { mode?: string; userText?: string }[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/v1/chat/turn') && r.method() === 'POST') turns.push(r.postDataJSON());
    });
    await page.goto('/goi-thoai');
    await expect(page).toHaveURL(/\/goi-thoai$/);
    await expect(page.getByTestId('turns-left')).toHaveText('Còn 60 lượt nói chuyện với AI hôm nay');
    await assertMobileLayout(page);

    await page.getByRole('button', { name: 'Bắt đầu gọi' }).click();
    // lần đầu: thông báo quyền riêng tư riêng cho gọi thoại (gửi ngay khi ngừng nói)
    await expect(page.getByRole('dialog', { name: /Giọng nói của bạn đi đâu/ })).toContainText('gửi đi ngay khi bạn ngừng nói');
    await expect(page.getByRole('dialog').getByRole('link', { name: 'Đọc chính sách quyền riêng tư' })).toHaveAttribute('href', '/quyen-rieng-tu');
    await page.getByRole('button', { name: 'Đồng ý, ghi âm' }).click();

    const subs = page.getByRole('log', { name: 'Phụ đề' });
    await expect(subs.getByText('Xin chào bạn')).toHaveCount(1, { timeout: 20_000 });
    await expect(subs.getByText(/Bé Cu Tít đây/)).toHaveCount(1, { timeout: 20_000 });
    // lượt 2 tự bắt đầu sau khi đọc xong (không bấm gì)
    await expect(subs.getByText(/Bé Cu Tít đây/)).toHaveCount(2, { timeout: 30_000 });
    await expect(page.getByTestId('turns-left')).toHaveText('Còn 58 lượt nói chuyện với AI hôm nay');
    expect(turns.slice(0, 2).map((x) => [x.mode, x.userText])).toEqual([
      ['call', 'Xin chào bạn'],
      ['call', 'Xin chào bạn']
    ]);
    await assertMobileLayout(page);

    // phụ đề tắt được
    await page.getByRole('button', { name: 'Phụ đề: bật' }).click();
    await expect(page.getByText('Phụ đề đang tắt — thử nghe hiểu nhé!')).toBeVisible();

    await page.getByRole('button', { name: 'Gác máy' }).click();
    await expect(page.getByRole('heading', { name: /^Tổng kết cuộc gọi \(\d+ lượt\)$/ })).toBeVisible();
    await page.getByRole('button', { name: '＋ Thêm vào ôn tập: khỏe' }).click();
    expect((await srsOf(page))['conv:word:khỏe']).toMatchObject({ front: 'khỏe' });
    await assertMobileLayout(page);
  });

  test('gọi thoại mất mạng giữa lượt => “Thử lại” gửi lại đúng câu cũ, không lặp dòng của người học', async ({ page }) => {
    let n = 0;
    const histories: unknown[] = [];
    await page.route('**/v1/chat/turn', async (route) => {
      n++;
      histories.push(route.request().postDataJSON().history);
      if (n === 1) return route.abort('internetdisconnected');
      return route.continue();
    });
    await page.goto('/goi-thoai');
    await page.getByRole('button', { name: 'Gõ thay nói' }).click();
    await page.getByLabel('Tin nhắn').fill('Xin chào');
    await page.getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect(page.getByTestId('call-status')).toContainText('Không có kết nối mạng');
    await page.getByRole('button', { name: 'Thử lại' }).click();
    const subs = page.getByRole('log', { name: 'Phụ đề' });
    await expect(subs.getByText(/Bé Cu Tít đây/)).toBeVisible({ timeout: 20_000 });
    await expect(subs.getByText('Xin chào', { exact: true })).toHaveCount(1);
    expect(histories[1]).toEqual([]);
  });

  test('hết lượt AI hôm nay: cuộc gọi báo song ngữ dễ hiểu kèm giờ lượt mới; gửi quá nhanh không bị báo là hết lượt', async ({ page }) => {
    let mode: 'day' | 'minute' = 'day';
    await page.route('**/v1/chat/turn', (route) =>
      route.fulfill({
        status: 429,
        json: mode === 'day' ? { error: 'quota_exceeded', capability: 'turn', resetAt: '2030-01-02T00:00:00.000Z' } : { error: 'FST_ERR_RATE_LIMIT' }
      })
    );
    await page.goto('/goi-thoai');
    await page.getByRole('button', { name: 'Gõ thay nói' }).click();
    await page.getByLabel('Tin nhắn').fill('Xin chào');
    await page.getByRole('button', { name: 'Gửi', exact: true }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Hôm nay bạn đã dùng hết lượt nói chuyện với AI. Lượt mới bắt đầu lúc');
    await expect(alert).toContainText('Bài học, ôn tập và các công cụ khác vẫn dùng bình thường.');
    await expect(page.getByRole('button', { name: 'Gọi lại' })).toHaveCount(0);
    await assertMobileLayout(page);

    mode = 'minute';
    await page.goto('/hoi-thoai');
    await page.getByLabel('Tin nhắn').fill('Xin chào');
    await page.getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Bạn gửi hơi nhanh');
    await expect(page.getByRole('alert')).not.toContainText('hết lượt');
  });
});

test.describe('GĐ3 — giao diện tiếng Anh', () => {
  test.use({ locale: 'en-US' });

  test('call screen in English; tutor text stays Vietnamese', async ({ page }) => {
    await page.goto('/goi-thoai');
    await expect(page.getByRole('heading', { level: 1, name: 'Call Cu Tít' })).toBeVisible();
    await page.getByRole('button', { name: 'Type instead' }).click();
    await page.getByLabel('Message').fill('xin chào');
    await page.getByRole('button', { name: 'Send' }).click();
    const subs = page.getByRole('log', { name: 'Subtitles' });
    await expect(subs.getByText(/Bé Cu Tít đây/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Slow down' })).toBeVisible();
    await assertMobileLayout(page);
  });
});
