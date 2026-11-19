import { expect, test, type Page } from '@playwright/test';

/** GĐ2b — xưng hô theo tình huống (A6) và truyện ngắn nghe (A7). Chạy cả Pixel 7 và màn 320 px. */

async function assertMobileLayout(page: Page) {
  const info = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    small: [...document.querySelectorAll('main button, main a, main input, main summary')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 44;
      })
      .map((el) => (el.textContent || el.tagName).trim().slice(0, 30))
  }));
  expect(info.scrollW, 'không được tràn ngang').toBeLessThanOrEqual(info.clientW);
  expect(info.small, 'vùng chạm < 44px').toEqual([]);
}

/** Đi qua các câu (chọn đại / ghép đại / bỏ qua) tới khi nhãn dạng bài bắt đầu bằng `kind` */
async function goToKind(page: Page, kind: RegExp, s = { skip: /Không (nghe|nói) được lúc này/, bank: 'Các từ để ghép', check: 'Kiểm tra', choices: 'Lựa chọn', next: 'Tiếp →' }) {
  const section = page.locator('section[aria-labelledby="ct-ex-q"]');
  for (let guard = 0; guard < 20; guard++) {
    await expect(section.locator('#ct-ex-q')).toBeVisible();
    if (kind.test((await section.locator('p').first().textContent()) ?? '')) return section;
    const skip = section.getByRole('button', { name: s.skip });
    const bank = section.getByRole('group', { name: s.bank });
    if (await skip.isVisible()) {
      await skip.click();
      continue;
    }
    if (await bank.isVisible()) {
      const n = await bank.getByRole('button').count();
      for (let i = 0; i < n; i++) await bank.getByRole('button').nth(i).click();
      await section.getByRole('button', { name: s.check }).click();
    } else {
      await section.getByRole('group', { name: s.choices }).getByRole('button').first().click();
    }
    await section.getByRole('button', { name: s.next }).click();
  }
  throw new Error(`không gặp dạng bài ${kind}`);
}

test.describe('GĐ2b Xưng hô theo tình huống', () => {
  test('cảnh “ai nói với ai” → chọn cặp xưng – gọi; sai thì thấy đáp án A6 + lời giải; câu quay lại cuối bài', async ({ page }) => {
    await page.goto('/bai-hoc/u1l2');
    const section = await goToKind(page, /^Xưng hô theo tình huống/);
    await expect(section.getByRole('heading', { name: /xưng là gì và gọi người kia là gì/ })).toBeVisible();
    await expect(section.locator('p[lang="vi"]').first()).toContainText('Nam (nam, 26 tuổi)');
    await assertMobileLayout(page);

    const group = section.getByRole('group', { name: 'Lựa chọn' });
    await expect(group.getByRole('button')).toHaveCount(4);
    await expect(group.getByRole('button', { name: 'em – anh', exact: true })).toBeVisible();
    const wrong = (await group.getByRole('button').allTextContents()).find((x) => x !== 'em – anh')!;
    await group.getByRole('button', { name: wrong, exact: true }).click();
    const status = section.getByRole('status');
    await expect(status).toContainText('Đáp án: “em – anh”');
    await expect(status).toContainText("xưng 'em', gọi 'anh'");
    await expect(status.getByRole('button', { name: /Giải thích thêm/ })).toBeVisible();
    await assertMobileLayout(page);
    await section.getByRole('button', { name: 'Tiếp →' }).click();

    // câu sai quay lại cuối phiên: chọn đúng lần này
    const again = await goToKind(page, /^Xưng hô theo tình huống/);
    await expect(again.locator('p').first()).toContainText('Làm lại');
    await again.getByRole('group', { name: 'Lựa chọn' }).getByRole('button', { name: 'em – anh', exact: true }).click();
    await expect(again.getByRole('status')).toContainText('Đúng rồi!');
  });

  test.describe('giao diện tiếng Anh', () => {
    test.use({ locale: 'en-US' });
    test('đề và lời giải tiếng Anh, cảnh tiếng Việt kèm bản dịch', async ({ page }) => {
      await page.goto('/bai-hoc/u1l2');
      const section = await goToKind(page, /^Who are you talking to\?/, { skip: /Can’t (listen|speak) now/, bank: 'Words to use', check: 'Check', choices: 'Choices', next: 'Next →' });
      await expect(section.locator('p[lang="vi"]').first()).toContainText('26 tuổi');
      await expect(section.getByText('You (female, 20) meet Nam (a man, 26) at a club.')).toBeVisible();
      await section.getByRole('group', { name: 'Choices' }).getByRole('button', { name: 'em – anh', exact: true }).click();
      await expect(section.getByRole('status')).toContainText('call yourself');
      await assertMobileLayout(page);
    });
  });
});

test.describe('GĐ2b Truyện ngắn', () => {
  test('nghe cả truyện (TTS máy), hiện bản dịch, 3 câu hỏi hiểu có phản hồi, điểm cuối truyện', async ({ page }) => {
    // đếm câu được đọc bằng TTS của máy (chưa có gói dựng sẵn trong e2e)
    await page.addInitScript(() => {
      const spoken: string[] = [];
      (window as unknown as { __spoken: string[] }).__spoken = spoken;
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.speak = (u: SpeechSynthesisUtterance) => {
        spoken.push(u.text);
        setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 10);
      };
    });
    await page.goto('/bai-hoc/u1l4');
    const section = await goToKind(page, /^Truyện ngắn/);
    await expect(section.getByRole('heading', { name: 'Gặp bạn mới' })).toBeVisible();
    await expect(section.getByText('Chào chị! Em tên là Nam.')).toBeVisible();
    await assertMobileLayout(page);

    await section.getByRole('button', { name: /Nghe cả truyện/ }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.length)).toBe(6);
    expect(await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken[0])).toBe('Xin chào! Tôi tên là Lan.');

    await expect(section.getByText('Hello! My name is Lan.')).toHaveCount(0);
    await section.getByRole('button', { name: 'Hiện bản dịch' }).click();
    await expect(section.getByText('Hello! My name is Lan.')).toBeVisible();

    await section.getByRole('button', { name: /Trả lời câu hỏi/ }).click();
    const answers = ['Lan', 'chị', 'Nam khỏe.'];
    for (let i = 0; i < 3; i++) {
      await expect(section.getByText(`Câu hỏi ${i + 1}/3`)).toBeVisible();
      await section.getByRole('group', { name: 'Lựa chọn' }).getByRole('button', { name: answers[i], exact: true }).click();
      await expect(section.getByRole('status')).toContainText('Đúng rồi!');
      if (i === 2) await expect(section.getByRole('status')).toContainText('Bạn trả lời đúng 3/3 câu.');
      await assertMobileLayout(page);
      await section.getByRole('button', { name: 'Tiếp →' }).click();
    }
    // đạt (3/3) => truyện không quay lại: sau đó là tổng kết hoặc các câu sai trước đó quay lại cuối phiên
    const summary = page.getByRole('heading', { level: 1, name: /^Xong bài/ });
    await expect(summary.or(page.locator('#ct-ex-q'))).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Gặp bạn mới' })).toHaveCount(0);
  });

  test('miền Nam: truyện đi chợ đọc “thơm … trái” (A7), đáp án đổi theo', async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('becutit.learner')) localStorage.setItem('becutit.learner', JSON.stringify({ state: { preferences: { dialect: 'south' } }, version: 1 }));
    });
    await page.goto('/bai-hoc/u2l4');
    const section = await goToKind(page, /^Truyện ngắn/);
    await expect(section.getByRole('heading', { name: 'Đi chợ mua thơm' })).toBeVisible();
    await expect(section.getByText('Chị ơi, thơm bao nhiêu tiền một trái?')).toBeVisible();
    await section.getByRole('button', { name: /Trả lời câu hỏi/ }).click();
    await expect(section.locator('p[lang="vi"]').first()).toHaveText('Mai mua gì?');
    await expect(section.getByRole('group', { name: 'Lựa chọn' }).getByRole('button', { name: 'thơm', exact: true })).toBeVisible();
  });
});
