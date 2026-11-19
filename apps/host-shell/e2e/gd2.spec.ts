import { expect, test, type Page } from '@playwright/test';

/** GĐ2 — nói lại câu (A3) và phòng tập thanh điệu. Chạy cả Pixel 7 và màn 320 px. */

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

/** Micro giả lập: hai âm tiết (sóng răng cưa đi lên rồi đi xuống) lặp lại, như e2e M2 */
async function fakeMic(page: Page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const g = ctx.createGain();
      const t = ctx.currentTime;
      for (let k = 0; k < 6; k++) {
        const s = t + k * 1.2;
        osc.frequency.setValueAtTime(160, s);
        osc.frequency.linearRampToValueAtTime(260, s + 0.4);
        osc.frequency.setValueAtTime(220, s + 0.6);
        osc.frequency.linearRampToValueAtTime(140, s + 1.0);
        g.gain.setValueAtTime(0.4, s);
        g.gain.setValueAtTime(0, s + 0.45);
        g.gain.setValueAtTime(0.4, s + 0.6);
        g.gain.setValueAtTime(0, s + 1.05);
      }
      const dest = ctx.createMediaStreamDestination();
      osc.connect(g).connect(dest);
      osc.start();
      return dest.stream;
    };
  });
}

/** Đi qua các câu trước bài “nói lại câu” (chọn đại / ghép đại / bỏ qua), dừng khi gặp nút đọc câu */
async function goToSpeakItem(page: Page) {
  const section = page.locator('section[aria-labelledby="ct-ex-q"]');
  for (let guard = 0; guard < 20; guard++) {
    await expect(section.locator('#ct-ex-q')).toBeVisible();
    // Bài nói/thanh/truyện tải lười (Suspense, khung chờ aria-busy): chờ hiện xong rồi mới xem có nút nào —
    // isVisible() không chờ, trên CI chunk tải chậm thì lỡ nút đọc câu hoặc bấm nhầm “Không nói được” (xem nhật ký CI-CD)
    await expect(section.locator('[aria-busy="true"]')).toHaveCount(0);
    if (await section.getByRole('button', { name: 'Bắt đầu đọc câu' }).isVisible()) return section;
    const skip = section.getByRole('button', { name: /Không (nghe|nói) được lúc này/ });
    const bank = section.getByRole('group', { name: 'Các từ để ghép' });
    if (await skip.isVisible()) {
      await skip.click();
      continue;
    }
    if (await bank.isVisible()) {
      const n = await bank.getByRole('button').count();
      for (let i = 0; i < n; i++) await bank.getByRole('button').nth(i).click();
      await section.getByRole('button', { name: 'Kiểm tra' }).click();
    } else {
      await section.getByRole('group', { name: 'Lựa chọn' }).getByRole('button').first().click();
    }
    await section.getByRole('button', { name: 'Tiếp →' }).click();
  }
  throw new Error('không gặp bài nói lại câu');
}

const crafted = {
  transcript: 'tôi la nam lắm',
  words: [
    { expected: 'tôi', heard: 'tôi', status: 'correct', expectedTone: 'ngang' },
    { expected: 'tên', heard: null, status: 'missing', expectedTone: 'ngang' },
    { expected: 'là', heard: 'la', status: 'tone', expectedTone: 'huyen', heardTone: 'ngang' },
    { expected: 'lan', heard: 'nam', status: 'wrong', expectedTone: 'ngang' },
    { expected: null, heard: 'lắm', status: 'extra' }
  ],
  score: 33,
  toneChecked: false,
  mock: false,
  hints: []
};

test.describe('GĐ2 Nói lại câu (A3)', () => {
  test('ghi âm câu → Gateway chấm (mock) → kết quả tô màu từng từ, thanh lệch, thử lại, tiếp', async ({ page }) => {
    test.setTimeout(60_000);
    await fakeMic(page);
    await page.goto('/bai-hoc/u1l3');
    const section = await goToSpeakItem(page);
    await expect(section.getByText('Tôi tên là Lan')).toBeVisible();
    await assertMobileLayout(page);

    // Lần đầu: hỏi đồng ý gửi giọng nói
    await section.getByRole('button', { name: 'Bắt đầu đọc câu' }).click();
    await section.getByRole('button', { name: 'Đồng ý và ghi âm' }).click();
    await page.waitForTimeout(1500);
    await section.getByRole('button', { name: 'Dừng ghi âm' }).click();
    // Gateway thật của e2e không có khóa AI => mock: không chấm chữ, câu không tính đúng/sai
    const result = section.getByRole('status');
    await expect(result).toContainText('chưa nối nhận dạng giọng nói', { timeout: 15_000 });

    // Lần 2: Gateway (giả lập qua route) trả kết quả có đủ trạng thái
    await page.route('**/v1/speech/assess', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(crafted) }));
    await section.getByRole('button', { name: 'Thử lại' }).click();
    await section.getByRole('button', { name: 'Bắt đầu đọc câu' }).click();
    await page.waitForTimeout(1200);
    await section.getByRole('button', { name: 'Dừng ghi âm' }).click();
    await expect(result).toContainText('33/100');
    const words = result.getByRole('list', { name: 'Kết quả từng từ' }).locator('li');
    await expect(words).toHaveCount(4);
    expect(await words.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.status))).toEqual(['correct', 'missing', 'tone', 'wrong']);
    await expect(result.getByLabel('là: sai thanh — cần thanh huyền, bạn nói thanh ngang')).toBeVisible();
    await expect(result.getByText('Bạn nói thêm: lắm')).toBeVisible();
    await expect(result.getByText('“là”: cần thanh huyền, nghe ra thanh ngang')).toBeVisible();
    await assertMobileLayout(page);
    await result.getByRole('button', { name: 'Tiếp →' }).click();
    await expect(section.getByRole('button', { name: 'Bắt đầu đọc câu' })).toHaveCount(0);
  });

  test('micro bị từ chối => báo lỗi, vẫn bỏ qua được (không kẹt bài)', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('becutit.learner', JSON.stringify({ state: { consents: { voice: true } }, version: 1 }));
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException('denied', 'NotAllowedError');
      };
    });
    await page.goto('/bai-hoc/u1l3');
    const section = await goToSpeakItem(page);
    await section.getByRole('button', { name: 'Bắt đầu đọc câu' }).click();
    const consent = section.getByRole('button', { name: 'Đồng ý và ghi âm' });
    if (await consent.isVisible({ timeout: 500 }).catch(() => false)) await consent.click();
    await expect(section.getByRole('alert')).toContainText('micro');
    await section.getByRole('button', { name: /Không nói được lúc này/ }).click();
    await expect(section.getByRole('button', { name: 'Bắt đầu đọc câu' })).toHaveCount(0);
  });
});

test.describe('GĐ2 Phòng tập thanh điệu', () => {
  test('nghe phân biệt → bắt thanh 10 câu → biểu đồ tiến bộ 6 thanh; mở được từ Khám phá', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/kham-pha');
    await page.getByRole('link', { name: /Phòng tập thanh điệu/ }).click();
    await expect(page).toHaveURL(/\/phong-thanh$/);
    await page.goto('/phong-thanh?seed=5');
    await expect(page.getByRole('heading', { level: 1, name: 'Phòng tập thanh điệu' })).toBeVisible();
    await assertMobileLayout(page);

    // Nghe phân biệt (không cần âm thanh để làm được)
    const panel = page.getByRole('tabpanel');
    await panel.getByRole('group', { name: 'Lựa chọn' }).getByRole('button').first().click();
    await expect(panel.getByRole('status')).toContainText(/Đúng rồi!|Chưa đúng/);
    await panel.getByRole('button', { name: 'Câu tiếp →' }).click();
    await expect(panel.getByRole('status')).toHaveCount(0);

    // Bắt thanh
    await page.getByRole('tab', { name: 'Bắt thanh' }).click();
    await panel.getByRole('button', { name: 'Bắt đầu (10 câu)' }).click();
    for (let i = 1; i <= 10; i++) {
      await expect(panel.getByText(`Câu ${i}/10 — thanh gì?`)).toBeVisible();
      await panel.getByRole('group', { name: 'Sáu thanh' }).getByRole('button').nth(i % 6).click();
      await panel.getByRole('button', { name: 'Câu tiếp →' }).click();
    }
    await expect(panel.getByRole('status')).toContainText(/Xong lượt: đúng \d+\/10/);
    await assertMobileLayout(page);

    // Tiến bộ: 6 thanh, có dữ liệu nghe vừa làm
    await page.getByRole('tab', { name: 'Tiến bộ' }).click();
    const rows = panel.getByRole('list', { name: 'Tiến bộ từng thanh' }).locator('li');
    await expect(rows).toHaveCount(6);
    await expect(panel.getByText(/\d+%/).first()).toBeVisible();
    await page.reload();
    await page.getByRole('tab', { name: 'Tiến bộ' }).click();
    await expect(page.getByRole('tabpanel').getByText(/\d+%/).first()).toBeVisible();
  });
});
