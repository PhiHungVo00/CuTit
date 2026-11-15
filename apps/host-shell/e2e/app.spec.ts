import { expect, test, type Page } from '@playwright/test';

/** Không có tràn ngang + mọi nút/link trong <main> chạm được (>= 44px chiều cao). */
async function assertMobileLayout(page: Page) {
  const info = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    small: [...document.querySelectorAll('main button, main a, main input')]
      .filter((el) => {
        // Checkbox/radio nằm trong <label>: vùng chạm là cả nhãn (chạm nhãn cũng bật/tắt)
        const target = el instanceof HTMLInputElement && /checkbox|radio/.test(el.type) ? (el.closest('label') ?? el) : el;
        const r = target.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 44;
      })
      .map((el) => (el.textContent || (el as HTMLInputElement).placeholder || el.tagName).trim().slice(0, 30))
  }));
  expect(info.scrollW, 'không được tràn ngang').toBeLessThanOrEqual(info.clientW);
  expect(info.small, 'vùng chạm < 44px').toEqual([]);
}

test.describe('Khung app', () => {
  test('trang chủ: liệt kê 6 màn hình, thanh tab, bố cục mobile chuẩn', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Học Tiếng Việt Cùng Bé Cu Tít' })).toBeVisible();
    await expect(page.locator('.screen-card')).toHaveCount(9);
    await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();
    await assertMobileLayout(page);
  });

  test('chuyển màn hình chỉ tải chunk của màn hình đó (lazy)', async ({ page }) => {
    const loaded: string[] = [];
    page.on('request', (r) => loaded.push(r.url()));
    await page.goto('/');
    expect(loaded.some((u) => /HonorificScreen|ToneLabRoute/.test(u))).toBe(false);
    await page.getByRole('navigation').getByRole('link', { name: /Xưng hô/ }).click();
    await expect(page.getByRole('heading', { name: 'Ma trận đại từ xưng hô' })).toBeVisible();
    expect(loaded.some((u) => /HonorificScreen/.test(u))).toBe(true);
    expect(loaded.some((u) => /ToneLabRoute/.test(u))).toBe(false);
  });
});

test.describe('M3 Ma trận xưng hô', () => {
  test('chọn ngữ cảnh đổi câu mẫu; bố cục chuẩn', async ({ page }) => {
    await page.goto('/xung-ho');
    const sentence = page.locator('blockquote').first();
    const before = await sentence.textContent();
    await page.getByRole('radio', { name: 'Ngang hàng' }).click();
    await page.getByRole('radio', { name: 'Thân mật' }).click();
    await expect(sentence).not.toHaveText(before ?? '');
    await assertMobileLayout(page);
  });

  test('giao diện sáng: áp dụng cả thanh tab, giữ lựa chọn, còn sau khi tải lại', async ({ page }) => {
    await page.goto('/xung-ho');
    await page.getByRole('radio', { name: 'Nhỏ hơn' }).click();
    const sentence = await page.locator('blockquote').first().textContent();
    await page.getByRole('radio', { name: /Tre trúc/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('blockquote').first()).toHaveText(sentence ?? '');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const tabBg = await page.locator('.tabbar').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(tabBg).toBe('rgb(246, 243, 236)');
  });

  test('bảng 20 cặp: tìm không dấu, Esc đóng và trả focus, Áp dụng đưa cặp lên', async ({ page }) => {
    await page.goto('/xung-ho');
    const opener = page.getByRole('button', { name: /Bảng 20 cặp chuẩn/ });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: /Bảng 20 cặp/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('searchbox').fill('thay');
    await expect(dialog.getByRole('listitem').filter({ hasText: 'Thầy' }).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();

    await opener.click();
    await dialog.getByRole('listitem').filter({ hasText: 'Học trò kính Thầy' }).getByRole('button', { name: /Áp dụng/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('blockquote').first()).toContainText('Thầy');
    await expect(page.getByRole('radio', { name: /Thầy trò/ })).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('M10 Cẩm nang văn hóa', () => {
  test('tìm thẻ, hỏi Bé Cu Tít (mất mạng => trả lời offline từ thẻ), nhảy tới thẻ nguồn', async ({ page }) => {
    // Giả lập mất mạng tới Gateway một cách xác định (không phụ thuộc mạng của máy chạy test)
    await page.route('**/v1/**', (route) => route.abort('internetdisconnected'));
    await page.goto('/van-hoa');
    await expect(page.getByRole('heading', { name: 'Cẩm nang văn hóa' })).toBeVisible();
    await assertMobileLayout(page);
    await page.getByRole('searchbox').fill('cam dua'); // "dua" một mình khớp cả "đũa" lẫn "đưa" (đúng khi tìm không dấu)
    await expect(page.getByRole('listitem')).toHaveCount(1);
    await expect(page.getByRole('listitem').first()).toContainText('Kiêng cắm đũa');
    await page.getByRole('searchbox').fill('');

    await page.getByLabel('Câu hỏi về văn hóa').fill('Ngày Tết trẻ em được lì xì không?');
    await page.getByRole('button', { name: 'Hỏi', exact: true }).click();
    const answer = page.getByRole('status');
    await expect(answer).toContainText('ngoại tuyến');
    await expect(answer).toContainText('Lì xì đầu năm');
    await answer.getByRole('button', { name: 'Lì xì đầu năm' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Lì xì đầu năm' })).toHaveClass(/ring-accent/);
  });
});

test.describe('M6 Phương ngữ', () => {
  test('tìm từ, lọc từ khác cả 3 miền, lưu để ôn và còn sau khi tải lại', async ({ page }) => {
    await page.goto('/phuong-ngu');
    await expect(page.getByRole('heading', { name: 'Phương ngữ 3 miền' })).toBeVisible();
    await assertMobileLayout(page);
    await page.getByRole('searchbox').fill('heo');
    const card = page.getByRole('listitem').filter({ hasText: 'Con lợn' });
    await expect(card).toBeVisible();
    await expect(card.getByRole('button', { name: /"heo" \(miền Nam\)/ })).toBeVisible();
    await card.getByRole('button', { name: /Lưu để ôn tập/ }).click();
    await expect(card.getByRole('button', { name: /Đã lưu để ôn/ })).toBeDisabled();
    await page.reload();
    await page.getByRole('searchbox').fill('heo');
    await expect(page.getByRole('button', { name: /Đã lưu để ôn/ })).toBeVisible();

    await page.getByRole('searchbox').fill('');
    await page.getByLabel('Chỉ hiện từ khác nhau ở cả 3 miền').check();
    await expect(page.getByRole('listitem').filter({ hasText: 'Thế nào' })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Con lợn' })).toHaveCount(0);
  });
});

test.describe('M8 Ghép câu', () => {
  test('ghép đúng câu đầu (A8 chấm đúng), ghép sai câu sau => giải thích lỗi + lưu để ôn', async ({ page }) => {
    await page.goto('/ghep-cau');
    await expect(page.getByRole('heading', { name: 'Ghép câu' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'I eat phở.' })).toBeVisible();
    await assertMobileLayout(page);
    const pool = page.getByRole('group', { name: 'Các từ để ghép' });
    for (const w of ['Tôi', 'ăn', 'phở']) await pool.getByRole('button', { name: w, exact: true }).click();
    await page.getByRole('button', { name: 'Kiểm tra' }).click();
    await expect(page.getByRole('status')).toContainText('Chính xác');
    await page.getByRole('button', { name: 'Câu tiếp →' }).click();

    // Câu 2: "Chị ấy đang học tiếng Việt" — cố tình đặt "đang" sau động từ
    await expect(page.getByRole('heading', { name: 'She is studying Vietnamese.' })).toBeVisible();
    for (const w of ['Chị ấy', 'học', 'đang', 'tiếng Việt']) await pool.getByRole('button', { name: w, exact: true }).click();
    await page.getByRole('button', { name: 'Kiểm tra' }).click();
    await expect(page.getByRole('alert')).toContainText('TRƯỚC động từ');
    const saved = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('becutit.learner') || '{}').state?.srs ?? {}));
    expect(saved).toContain('sentence:s2');
  });
});

test.describe('M5 Luyện tập', () => {
  test('làm hết một phiên 8 bài (đủ dạng), có tổng kết, ghi lịch sử làm bài', async ({ page }) => {
    await page.goto('/luyen-tap');
    await expect(page.getByRole('heading', { name: 'Luyện tập' })).toBeVisible();
    await assertMobileLayout(page);
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const label = (await page.locator('section p').first().textContent()) ?? '';
      seen.add(label.split('·')[0].trim());
      if (label.startsWith('Ghép từ')) {
        const lefts = page.getByRole('group', { name: 'Miền Bắc' }).getByRole('button');
        const rights = page.getByRole('group', { name: 'Miền Nam' }).getByRole('button');
        for (let l = 0; l < 4; l++) {
          for (let r = 0; r < 4; r++) {
            if (await lefts.nth(l).isDisabled()) break;
            await lefts.nth(l).click();
            if (await rights.nth(r).isDisabled()) continue;
            await rights.nth(r).click();
          }
        }
        await page.getByRole('button', { name: 'Tiếp →' }).click();
      } else if (label.startsWith('Đọc lại')) {
        await page.getByRole('button', { name: 'Được' }).click();
      } else {
        await page.getByRole('group', { name: 'Lựa chọn' }).getByRole('button').first().click();
        await page.getByRole('button', { name: 'Tiếp →' }).click();
      }
    }
    await expect(page.getByRole('status')).toContainText('Xong phiên!');
    expect(seen.size).toBeGreaterThanOrEqual(4);
    const attempts = await page.evaluate(() => JSON.parse(localStorage.getItem('becutit.learner') || '{}').state?.attempts?.length ?? 0);
    expect(attempts).toBe(8);
  });
});

test.describe('M2 Luyện thanh điệu', () => {
  test('micro giả lập giọng đi lên => chấm đúng thanh sắc (AudioWorklet → resample → Worker)', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        const g = ctx.createGain();
        const t = ctx.currentTime;
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.setValueAtTime(150, t + 0.25);
        osc.frequency.linearRampToValueAtTime(280, t + 1.05);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.4, t + 0.25);
        g.gain.setValueAtTime(0.4, t + 1.05);
        g.gain.linearRampToValueAtTime(0, t + 1.1);
        const dest = ctx.createMediaStreamDestination();
        osc.connect(g).connect(dest);
        osc.start();
        return dest.stream;
      };
    });
    await page.goto('/phat-am');
    await expect(page.getByRole('heading', { name: 'Luyện 6 thanh điệu' })).toBeVisible();
    await assertMobileLayout(page);
    await page.getByRole('button', { name: 'Bắt đầu ghi âm' }).click();
    const result = page.getByRole('status').filter({ hasText: '/100' });
    await expect(result).toBeVisible({ timeout: 8000 });
    await expect(result).toContainText('khớp nhất với thanh sắc');
    const score = Number((await result.textContent())?.match(/(\d+)\/100/)?.[1]);
    expect(score).toBeGreaterThanOrEqual(75);
  });
});

test.describe('Offline (PWA)', () => {
  test('sau lần mở đầu, mất mạng vẫn mở được các màn hình', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload(); // để Service Worker điều khiển trang
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.goto('/phat-am');
    await expect(page.getByRole('heading', { name: 'Luyện 6 thanh điệu' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'ngoại tuyến' })).toBeVisible();
    await page.goto('/xung-ho');
    await expect(page.getByRole('heading', { name: 'Ma trận đại từ xưng hô' })).toBeVisible();
    await context.setOffline(false);
  });
});

test.describe('Hiệu năng trên máy yếu (CPU chậm 4×)', () => {
  test('mở M3 từ trang chủ: màn hình sẵn sàng < 1.5 s', async ({ page, browserName }, info) => {
    test.skip(browserName !== 'chromium' || info.project.name !== 'pixel-7', 'chỉ đo trên Chromium, một cấu hình');
    const cdp = await page.context().newCDPSession(page);
    await page.goto('/');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const t0 = Date.now();
    await page.getByRole('navigation').getByRole('link', { name: /Xưng hô/ }).click();
    await expect(page.getByRole('heading', { name: 'Ma trận đại từ xưng hô' })).toBeVisible();
    const ms = Date.now() - t0;
    console.log(`  Mở M3 với CPU chậm 4×: ${ms} ms`);
    expect(ms).toBeLessThan(1500);

    const t1 = Date.now();
    await page.getByRole('radio', { name: 'Lớn hơn' }).click();
    await expect(page.getByRole('radio', { name: 'Lớn hơn' })).toHaveAttribute('aria-checked', 'true');
    const tapMs = Date.now() - t1;
    console.log(`  Phản hồi một lần chạm với CPU chậm 4×: ${tapMs} ms`);
    expect(tapMs).toBeLessThan(300);
  });
});
