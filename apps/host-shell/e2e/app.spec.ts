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
    await expect(page.locator('.screen-card')).toHaveCount(12);
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
    await expect(card.getByRole('button', { name: /“heo” \(miền Nam\)/ })).toBeVisible();
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

test.describe('M11 Làm quen & xếp lớp', () => {
  const pickIntro = async (page: Page) => {
    await page.getByText('Du lịch Việt Nam').click();
    await page.getByRole('button', { name: 'Tiếp →' }).click();
    await page.getByText('English').click();
    await page.getByRole('button', { name: 'Tiếp →' }).click();
    await page.getByText('Miền Nam', { exact: true }).click();
    await page.getByRole('button', { name: 'Tiếp →' }).click();
  };

  test('trang chủ mời làm quen; làm bài xếp lớp (Gateway giả lập) => lưu trình độ, hết lời mời', async ({ page }) => {
    let calls = 0;
    const bodies: unknown[] = [];
    await page.route('**/v1/placement/next', async (route) => {
      bodies.push(route.request().postDataJSON());
      calls++;
      const json =
        calls <= 8
          ? { finished: false, question: { id: `p${calls}`, prompt: `Câu hỏi số ${calls}`, options: ['A', 'B', 'C', 'D'], index: calls, maxQuestions: 12 }, ...(calls > 1 ? { lastCorrect: true } : {}) }
          : { finished: true, assignedLevel: 3, lastCorrect: true };
      await route.fulfill({ json });
    });
    await page.goto('/');
    await page.getByRole('link', { name: /Lần đầu học cùng Cu Tít/ }).click();
    await expect(page.getByRole('heading', { name: 'Bắt đầu' })).toBeVisible();
    await assertMobileLayout(page);
    await pickIntro(page);
    await page.getByRole('button', { name: /Làm bài xếp lớp/ }).click();
    for (let i = 1; i <= 8; i++) {
      await expect(page.getByRole('heading', { name: `Câu hỏi số ${i}` })).toBeVisible();
      await page.getByRole('group', { name: 'Lựa chọn' }).getByRole('button', { name: 'B' }).click();
    }
    await expect(page.getByRole('heading', { name: 'Trình độ của bạn: B1' })).toBeVisible();
    // lần đầu không kèm answer; các lần sau gửi đúng questionId + vị trí đã chọn
    expect(bodies[0]).not.toHaveProperty('answer');
    expect(bodies[1]).toMatchObject({ answer: { questionId: 'p1', choice: 1 } });
    await page.getByRole('button', { name: 'Bắt đầu học' }).click();
    await expect(page.getByText(/Trình độ B1 ·/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Lần đầu học cùng Cu Tít/ })).toHaveCount(0);
    const profile = await page.evaluate(() => JSON.parse(localStorage.getItem('becutit.learner') || '{}').state?.profile);
    expect(profile).toMatchObject({ onboarded: true, level: 3, goal: 'travel', nativeLang: 'en', dialect: 'south' });
  });

  test('mất mạng giữa chừng => Thử lại gửi lại câu đang chờ; hoặc tự chọn trình độ', async ({ page }) => {
    let fail = false;
    await page.route('**/v1/placement/next', async (route) => {
      if (fail) return route.abort('internetdisconnected');
      await route.fulfill({ json: { finished: false, question: { id: 'p1', prompt: 'Câu đầu tiên', options: ['A', 'B'], index: 1, maxQuestions: 12 } } });
    });
    await page.goto('/bat-dau');
    await pickIntro(page);
    await page.getByRole('button', { name: /Làm bài xếp lớp/ }).click();
    await expect(page.getByRole('heading', { name: 'Câu đầu tiên' })).toBeVisible();
    fail = true;
    await page.getByRole('button', { name: 'A', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Không có kết nối mạng');
    await assertMobileLayout(page);
    fail = false;
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.getByRole('heading', { name: 'Câu đầu tiên' })).toBeVisible();
    fail = true;
    await page.getByRole('button', { name: 'A', exact: true }).click();
    await page.getByRole('button', { name: 'Tự chọn trình độ' }).click();
    await page.getByText('Biết câu cơ bản').click();
    await page.getByRole('button', { name: 'Tiếp →' }).click();
    await expect(page.getByRole('heading', { name: 'Trình độ của bạn: A2' })).toBeVisible();
  });
});

test.describe('M9 Tiến độ & M12 Tùy chỉnh', () => {
  test('thống kê từ dữ liệu trên máy; ôn 2 thẻ đến hạn => SM-2 dời lịch', async ({ page }) => {
    await page.addInitScript(() => {
      if (localStorage.getItem('becutit.learner')) return;
      const d = (offsetDays: number) => {
        const x = new Date();
        x.setDate(x.getDate() + offsetDays);
        return x;
      };
      const key = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
      const card = (itemRef: string, front: string, back: string, due: number) => ({ itemRef, front, back, source: 'dialect', ease: 250, intervalDays: 0, repetitions: 0, dueAt: d(due).toISOString() });
      localStorage.setItem(
        'becutit.learner',
        JSON.stringify({
          version: 1,
          state: {
            profile: { onboarded: true, level: 2, goal: 'daily', nativeLang: 'en', dialect: 'north' },
            preferences: { voiceId: 'vi-VN-Standard-A', speed: 1, dialect: 'north', correctionLevel: 'gentle', persona: 'be_cu_tit' },
            srs: { a: card('a', 'ngô', 'bắp (miền Nam)', -1), b: card('b', 'dứa', 'thơm, khóm', 0), c: card('c', 'bát', 'chén', 3) },
            attempts: [
              { skill: 'drill', correct: true, at: d(0).toISOString() },
              { skill: 'drill', correct: false, at: d(0).toISOString() },
              { skill: 'sentence', correct: true, at: d(0).toISOString() }
            ],
            activity: { [key(d(0))]: 600, [key(d(-1))]: 300, [key(d(-2))]: 120 }
          }
        })
      );
    });
    await page.goto('/ho-so');
    await expect(page.getByRole('heading', { name: 'Tiến độ học' })).toBeVisible();
    await expect(page.getByText('3 ngày', { exact: true })).toBeVisible();
    await expect(page.getByText('17 phút', { exact: true })).toBeVisible();
    await expect(page.getByText('A2', { exact: true })).toBeVisible();
    await expect(page.getByText('50% · 1/2 bài')).toBeVisible();
    await assertMobileLayout(page);
    await page.getByRole('button', { name: 'Ôn 2 thẻ' }).click();
    await expect(page.getByRole('heading', { name: 'ngô' })).toBeVisible();
    await page.getByRole('button', { name: 'Lật thẻ' }).click();
    await expect(page.getByText('bắp (miền Nam)')).toBeVisible();
    await assertMobileLayout(page);
    await page.getByRole('button', { name: /^Nhớ/ }).click();
    await page.getByRole('button', { name: 'Lật thẻ' }).click();
    await page.getByRole('button', { name: /^Quên/ }).click();
    await expect(page.getByRole('heading', { name: 'Ôn xong! Nhớ 1/2 thẻ' })).toBeVisible();
    const srs = await page.evaluate(() => JSON.parse(localStorage.getItem('becutit.learner')!).state.srs);
    expect(srs.a.repetitions).toBe(1);
    expect(new Date(srs.a.dueAt).getTime()).toBeGreaterThan(Date.now() + 12 * 3600_000);
    expect(srs.b.repetitions).toBe(0);
    await page.getByRole('button', { name: 'Xong' }).click();
    // SM-2: thẻ "Quên" đặt lại khoảng 1 ngày => hôm nay không còn thẻ đến hạn
    await expect(page.getByText('Đã ôn hết 3 thẻ. Thẻ tiếp theo đến hạn ngày mai.')).toBeVisible();
  });

  test('đổi tùy chỉnh: lưu trên máy ngay, đồng bộ Gateway; mất mạng => báo chưa đồng bộ', async ({ page }) => {
    const puts: unknown[] = [];
    let offline = false;
    await page.route('**/v1/speech/voices', (route) =>
      route.fulfill({ json: [{ id: 'v-south', name: 'Giọng Nam Sài Gòn (máy chủ)', dialect: 'south' }, { id: 'v-north', name: 'Giọng Bắc (máy chủ)', dialect: 'north' }] })
    );
    await page.route('**/v1/preferences', async (route) => {
      if (offline) return route.abort('internetdisconnected');
      puts.push(route.request().postDataJSON());
      await route.fulfill({ json: route.request().postDataJSON() });
    });
    await page.goto('/tuy-chinh');
    await expect(page.getByText('Giọng Bắc (máy chủ)')).toBeVisible();
    await assertMobileLayout(page);
    await page.getByText('Miền Nam', { exact: true }).click();
    await expect(page.getByText('Giọng Nam Sài Gòn (máy chủ)')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Đã lưu và đồng bộ' })).toBeVisible();
    expect(puts[puts.length - 1]).toMatchObject({ dialect: 'south', voiceId: 'v-south' });
    offline = true;
    await page.getByText('Kỹ lưỡng').click();
    await expect(page.getByRole('status').filter({ hasText: 'chưa đồng bộ' })).toBeVisible();
    await page.reload();
    const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('becutit.learner')!).state.preferences);
    expect(prefs).toMatchObject({ dialect: 'south', voiceId: 'v-south', correctionLevel: 'strict' });
    await expect(page.getByRole('radio', { name: /Kỹ lưỡng/ })).toBeChecked();
  });
});

test.describe('M1 Trò chuyện & M7 Nhập vai', () => {
  const sse = (events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  const TURN = '7d444840-9dc0-11d1-b245-5ffdce74fad2';

  test('gửi câu thiếu dấu => câu trả lời stream, lời sửa, khối gợi ý dẫn tới M10; mất mạng => Thử lại', async ({ page }) => {
    let offline = false;
    const bodies: Record<string, unknown>[] = [];
    await page.route('**/v1/chat/turn', async (route) => {
      if (offline) return route.abort('internetdisconnected');
      bodies.push(route.request().postDataJSON());
      await route.fulfill({
        headers: { 'content-type': 'text/event-stream' },
        body: sse([
          { type: 'transcript', text: 'xin chao' },
          { type: 'token', text: 'Chào ' },
          { type: 'token', text: 'bạn!' },
          { type: 'correction', correction: { original: 'xin chao', corrected: 'xin chào', explanation: 'Tiếng Việt cần đủ dấu thanh.' } },
          { type: 'blocks', blocks: [{ id: 'b1', type: 'culture_pill', title: 'Văn hóa chào hỏi', payload: { tip: 'Thêm "ạ" khi chào người lớn.', onClick: 'alert(1)' } }] },
          { type: 'done', turnId: TURN, reply: 'Chào bạn!', completedTasks: [], mock: true }
        ])
      });
    });
    await page.goto('/hoi-thoai');
    await expect(page.getByRole('heading', { name: 'Trò chuyện' })).toBeVisible();
    await assertMobileLayout(page);
    await page.getByLabel('Tin nhắn').fill('xin chao');
    await page.getByRole('button', { name: 'Gửi' }).click();
    const log = page.getByRole('log', { name: 'Hội thoại' });
    await expect(log.getByText('Chào bạn!')).toBeVisible();
    await expect(log.getByText('trả lời mẫu (chưa nối AI)')).toBeVisible();
    await expect(log.getByText('xin chào', { exact: true })).toBeVisible();
    expect(bodies[0]).toMatchObject({ userText: 'xin chao', correctionLevel: 'gentle', persona: 'be_cu_tit', history: [] });
    await assertMobileLayout(page);

    offline = true;
    await page.getByLabel('Tin nhắn').fill('Hôm nay tôi học bài');
    await page.getByRole('button', { name: 'Gửi' }).click();
    await expect(page.getByRole('alert')).toContainText('Không có kết nối mạng');
    offline = false;
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(log.getByText('Chào bạn!')).toHaveCount(2);
    // lượt thử lại: không lặp câu của người học trong lịch sử, gửi kèm 2 lượt trước
    expect(bodies[1]).toMatchObject({ userText: 'Hôm nay tôi học bài', history: [{ role: 'user', text: 'xin chao' }, { role: 'tutor', text: 'Chào bạn!' }] });

    await log.getByRole('link', { name: /Xem cẩm nang văn hóa/ }).first().click();
    await expect(page).toHaveURL(/\/van-hoa$/);
  });

  test('nhập vai quán phở: nhiệm vụ do Gateway chấm, tổng kết + lưu lỗi vào thẻ ôn', async ({ page }) => {
    let n = 0;
    await page.route('**/v1/chat/turn', async (route) => {
      n++;
      const body = route.request().postDataJSON();
      expect(body.scenarioId).toBe('sc3');
      const events: object[] = [{ type: 'transcript', text: body.userText }, { type: 'token', text: n === 1 ? 'Chào em, em ăn gì?' : 'Bát phở năm mươi nghìn em ạ.' }];
      if (n === 1) events.push({ type: 'correction', correction: { original: 'chao anh', corrected: 'chào anh', explanation: 'Thiếu dấu thanh.' } });
      events.push({ type: 'done', turnId: TURN, reply: n === 1 ? 'Chào em, em ăn gì?' : 'Bát phở năm mươi nghìn em ạ.', completedTasks: n === 1 ? [0] : [0, 1, 2, 3], mock: true });
      await route.fulfill({ headers: { 'content-type': 'text/event-stream' }, body: sse(events) });
    });
    await page.goto('/nhap-vai');
    await page.getByRole('button', { name: /Gọi món ở quán phở/ }).click();
    const tasks = page.getByRole('list', { name: 'Nhiệm vụ' });
    await expect(tasks.getByText('(chưa xong)')).toHaveCount(4);
    await page.getByLabel('Tin nhắn').fill('chao anh');
    await page.getByRole('button', { name: 'Gửi' }).click();
    await expect(tasks.getByText('(đã xong)')).toHaveCount(1);
    await assertMobileLayout(page);
    await page.getByLabel('Tin nhắn').fill('Cho em một bát phở bò tái chín, không hành, bao nhiêu tiền ạ?');
    await page.getByRole('button', { name: 'Gửi' }).click();
    await expect(tasks.getByText('(đã xong)')).toHaveCount(4);
    await page.getByRole('button', { name: 'Hoàn thành! Xem tổng kết' }).click();
    await expect(page.getByRole('heading', { name: 'Tổng kết: 4/4 nhiệm vụ' })).toBeVisible();
    await expect(page.getByText('Lỗi cần nhớ (1)')).toBeVisible();
    const srs = await page.evaluate(() => JSON.parse(localStorage.getItem('becutit.learner')!).state.srs);
    expect(srs['roleplay:chào anh']).toMatchObject({ front: 'chào anh', source: 'conversation' });
  });
});

test.describe('M4 Camera từ vựng', () => {
  test('camera giả lập => chụp, ảnh thu nhỏ gửi Gateway, nhãn mẫu được ghi rõ, lưu thẻ ôn, tắt camera', async ({ page }) => {
    await page.addInitScript(() => {
      // Camera giả: luồng video thật từ canvas 1280×720 (đi qua đúng đường chụp → canvas → JPEG)
      navigator.mediaDevices.getUserMedia = async () => {
        const c = document.createElement('canvas');
        c.width = 1280;
        c.height = 720;
        const ctx = c.getContext('2d')!;
        const draw = () => {
          ctx.fillStyle = '#c33';
          ctx.fillRect(0, 0, 1280, 720);
          ctx.fillStyle = '#fff';
          ctx.fillRect(400, 200, 300, 300);
          requestAnimationFrame(draw);
        };
        draw();
        const stream = c.captureStream(15);
        (window as unknown as { __camStream: MediaStream }).__camStream = stream;
        return stream;
      };
    });
    let sent: { imageBase64: string } | null = null;
    await page.route('**/v1/vision/label', async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ json: { items: [{ vi: 'cái cốc', en: 'cup' }, { vi: 'quyển sách', en: 'book' }], mock: true } });
    });
    await page.goto('/camera');
    await expect(page.getByRole('heading', { name: 'Camera từ vựng' })).toBeVisible();
    await assertMobileLayout(page);
    await page.getByRole('button', { name: /Mở camera/ }).click();
    await expect(page.getByLabel('Hình ảnh từ camera')).toBeVisible();
    await expect.poll(() => page.getByLabel('Hình ảnh từ camera').evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
    await page.getByRole('button', { name: /Chụp/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Đồ vật trong ảnh' })).toBeVisible();
    await expect(page.getByText('Nhãn mẫu: dịch vụ nhận diện ảnh chưa được nối')).toBeVisible();
    // ảnh đã thu nhỏ: JPEG, ≤ 640px nên nhỏ hơn nhiều so với khung 1280×720 gốc
    expect(sent!.imageBase64.startsWith('/9j/')).toBe(true);
    expect(sent!.imageBase64.length).toBeLessThan(200_000);
    const trackLive = await page.evaluate(() => (window as unknown as { __camStream: MediaStream }).__camStream.getVideoTracks()[0].readyState);
    expect(trackLive).toBe('ended');
    await page.getByRole('button', { name: '+ Lưu ôn' }).first().click();
    await expect(page.getByRole('button', { name: '✓ Đã lưu' })).toHaveCount(1);
    await assertMobileLayout(page);
    const srs = await page.evaluate(() => JSON.parse(localStorage.getItem('becutit.learner')!).state.srs);
    expect(srs['vision:cái cốc']).toMatchObject({ front: 'cái cốc', back: 'cup', source: 'vision' });
  });

  test('từ chối quyền camera => báo rõ, vẫn chọn được ảnh có sẵn', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException('denied', 'NotAllowedError');
      };
    });
    await page.goto('/camera');
    await page.getByRole('button', { name: /Mở camera/ }).click();
    await expect(page.getByRole('alert')).toContainText('chưa được cấp quyền camera');
    await expect(page.getByRole('button', { name: /Chọn ảnh có sẵn/ })).toBeEnabled();
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

test.describe('Hiệu năng trên máy yếu (CPU chậm 4×) @perf', () => {
  test('mở M3 từ trang chủ: màn hình sẵn sàng < 1.5 s', async ({ page, browserName }, info) => {
    test.skip(browserName !== 'chromium' || info.project.name !== 'perf', 'chỉ đo trên Chromium, một cấu hình');
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

test.describe('Giao diện tiếng Anh (người nước ngoài)', () => {
  // Máy tiếng Anh => app mặc định tiếng Anh; nội dung cần học vẫn là tiếng Việt
  test.use({ locale: 'en-US' });
  const sseEn = (events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');

  test('mặc định theo ngôn ngữ máy, đổi ngôn ngữ ở trang chủ và được lưu lại', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Learn Vietnamese with Cu Tít' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await assertMobileLayout(page);
    await page.getByRole('button', { name: 'Chuyển giao diện sang tiếng Việt' }).click();
    await expect(page.getByRole('heading', { name: 'Học Tiếng Việt Cùng Bé Cu Tít' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Học Tiếng Việt Cùng Bé Cu Tít' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  });

  test('các màn hình hiển thị tiếng Anh, bố cục mobile vẫn chuẩn', async ({ page }) => {
    const screens: [string, string][] = [
      ['/xung-ho', 'Pronoun matrix'],
      ['/van-hoa', 'Culture guide'],
      ['/phat-am', 'Practise the 6 tones'],
      ['/phuong-ngu', 'Regional dialects'],
      ['/luyen-tap', 'Practice'],
      ['/ghep-cau', 'Sentence builder'],
      ['/nhap-vai', 'Role-play'],
      ['/camera', 'Camera vocabulary'],
      ['/ho-so', 'My progress'],
      ['/tuy-chinh', 'Settings'],
      ['/bat-dau', 'Get started']
    ];
    for (const [path, title] of screens) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await assertMobileLayout(page);
    }
    await page.goto('/van-hoa');
    await expect(page.getByText('Never stand chopsticks in a bowl of rice')).toBeVisible();
    await page.goto('/nhap-vai');
    await expect(page.getByRole('button', { name: /Ordering at a phở shop/ })).toBeVisible();
  });

  test('trò chuyện: gửi explanationLanguage=en, lời gia sư vẫn tiếng Việt', async ({ page }) => {
    const bodies: Record<string, unknown>[] = [];
    await page.route('**/v1/chat/turn', async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({
        headers: { 'content-type': 'text/event-stream' },
        body: sseEn([
          { type: 'transcript', text: 'xin chao' },
          { type: 'token', text: 'Chào bạn!' },
          { type: 'correction', correction: { original: 'xin chao', corrected: 'Xin chào', explanation: 'Vietnamese needs its tone marks.' } },
          { type: 'done', turnId: '7d444840-9dc0-11d1-b245-5ffdce74fad2', reply: 'Chào bạn!', completedTasks: [], mock: false }
        ])
      });
    });
    await page.goto('/hoi-thoai');
    await page.getByLabel('Message').fill('xin chao');
    await page.getByRole('button', { name: 'Send' }).click();
    const log = page.getByRole('log', { name: 'Conversation' });
    await expect(log.getByText('Chào bạn!')).toBeVisible();
    await expect(log.getByText('Vietnamese needs its tone marks.')).toBeVisible();
    await expect(log.getByText('sample reply')).toHaveCount(0);
    expect(bodies[0]).toMatchObject({ userText: 'xin chao', explanationLanguage: 'en' });
  });

  test('nhập giọng nói: thu âm → gửi WAV → chữ vào ô nhập để sửa trước khi gửi', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const dest = ctx.createMediaStreamDestination();
        osc.connect(dest);
        osc.start();
        return dest.stream;
      };
    });
    let upload: { type: string | null; size: number } | null = null;
    await page.route('**/v1/speech/transcribe', async (route) => {
      const req = route.request();
      upload = { type: req.headers()['content-type'] ?? null, size: req.postDataBuffer()?.length ?? 0 };
      await route.fulfill({ json: { text: 'Cho tôi một bát phở', confidence: 0.9, words: [], mock: false } });
    });
    await page.goto('/hoi-thoai');
    await page.getByRole('button', { name: 'Speak' }).click();
    // Lần đầu: thông báo quyền riêng tư, chưa ghi âm cho tới khi đồng ý
    await expect(page.getByRole('dialog', { name: /Where does your voice go/ })).toBeVisible();
    expect(upload).toBeNull();
    await page.getByRole('button', { name: 'OK, record' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(page.getByLabel('Message')).toHaveValue('Cho tôi một bát phở');
    await expect(page.getByText('Check the recognised text, then tap Send.')).toBeVisible();
    expect(upload!.type).toMatch(/multipart\/form-data/);
    expect(upload!.size).toBeGreaterThan(10_000);
    await assertMobileLayout(page);
  });
});
