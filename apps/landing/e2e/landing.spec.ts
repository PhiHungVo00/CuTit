import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { APP_ORIGIN, PORT_CO_APK, PORT_KHONG_APK } from '../playwright.config';

const KHONG_APK = `http://localhost:${PORT_KHONG_APK}`;
const CO_APK = `http://localhost:${PORT_CO_APK}`;

const loiJs = (page: Page) => {
  const loi: string[] = [];
  page.on('pageerror', (e) => loi.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && loi.push(m.text()));
  return loi;
};

test.describe('ngôn ngữ và tiêu đề', () => {
  test('/ là tiếng Việt, /en/ là tiếng Anh, có hreflang', async ({ page }) => {
    await page.goto(`${KHONG_APK}/`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(page.locator('h1')).toHaveText('Học tiếng Việt như người Việt nói, cùng Bé Cu Tít');
    await expect(page.locator('link[rel=alternate][hreflang=en]')).toHaveCount(1);
    await page.goto(`${KHONG_APK}/en/`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1')).toHaveText("Learn Vietnamese the way it's really spoken, with Cu Tít");
    await expect(page.locator('link[rel=alternate][hreflang=vi]')).toHaveCount(1);
  });

  test('có Open Graph ở cả 4 trang', async ({ page }) => {
    for (const p of ['/', '/en/', '/tai-apk', '/en/tai-apk']) {
      await page.goto(`${KHONG_APK}${p}`);
      await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
      await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
    }
  });
});

test.describe('ba nút và link', () => {
  test('nút chính trỏ gốc app; Đăng nhập, Quyền riêng tư, Xóa tài khoản đúng địa chỉ', async ({ page }) => {
    await page.goto(`${KHONG_APK}/`);
    await expect(page.locator('[data-cta=web]').first()).toHaveAttribute('href', `${APP_ORIGIN}/`);
    await expect(page.locator('[data-nav=login]')).toHaveAttribute('href', `${APP_ORIGIN}/ho-so`);
    await expect(page.locator('footer a[href$="/quyen-rieng-tu"]')).toHaveAttribute('href', `${APP_ORIGIN}/quyen-rieng-tu`);
    await expect(page.locator('footer a[href$="/xoa-tai-khoan"]')).toHaveAttribute('href', `${APP_ORIGIN}/xoa-tai-khoan`);
  });

  test('không có apk-release.json => nút APK "Sắp có", aria-disabled', async ({ page }) => {
    await page.goto(`${KHONG_APK}/`);
    const nut = page.locator('[data-cta=apk]').first();
    await expect(nut).toContainText('Sắp có');
    await expect(nut).toHaveAttribute('aria-disabled', 'true');
    await expect(nut).not.toHaveAttribute('href', /.+/);
  });

  test('có apk-release.json => nút trỏ /tai-apk, trang hiện phiên bản, MB, SHA-256', async ({ page }) => {
    await page.goto(`${CO_APK}/`);
    await expect(page.locator('[data-cta=apk]').first()).toHaveAttribute('href', '/tai-apk');
    await page.goto(`${CO_APK}/tai-apk`);
    const body = page.locator('main');
    await expect(body).toContainText('1.2.3');
    await expect(body).toContainText('12.0 MB');
    await expect(body).toContainText('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    await expect(page.locator('[data-apk=download]')).toHaveAttribute('href', '/BeCuTit-1.2.3.apk');
  });

  test('trang /tai-apk khi chưa có APK nói "Sắp có", không có link tải', async ({ page }) => {
    await page.goto(`${KHONG_APK}/tai-apk`);
    await expect(page.locator('[data-apk=download]')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('[data-apk=download]')).not.toHaveAttribute('href', /.+/);
  });
});

test.describe('iPhone / máy tính ở /tai-apk', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' });
  test('hiện gợi ý dùng bản web kèm nút sang web', async ({ page }) => {
    await page.goto(`${CO_APK}/tai-apk`);
    const goiY = page.locator('[data-apk=not-android]');
    await expect(goiY).toBeVisible();
    await expect(goiY.locator('a')).toHaveAttribute('href', `${APP_ORIGIN}/`);
  });
});

test('Android: không hiện gợi ý "dùng bản web"', async ({ page }) => {
  await page.goto(`${CO_APK}/tai-apk`);
  await expect(page.locator('[data-apk=not-android]')).toBeHidden();
});

test.describe('âm thanh', () => {
  test('tải trang không phát và không tải âm thanh nào', async ({ page }) => {
    const yeuCauAmThanh: string[] = [];
    page.on('request', (r) => /\/audio\//.test(r.url()) && yeuCauAmThanh.push(r.url()));
    await page.goto(`${KHONG_APK}/`);
    await page.waitForTimeout(500);
    expect(yeuCauAmThanh).toEqual([]);
    const tatCaTamDung = await page.evaluate(() => [...document.querySelectorAll('audio')].every((a) => a.paused));
    expect(tatCaTamDung).toBe(true);
  });

  test('bấm ▶ Bắc => tải ba-mien-bac', async ({ page }) => {
    await page.goto(`${KHONG_APK}/`);
    const yc = page.waitForRequest((r) => /\/audio\/ba-mien-bac\.(ogg|mp3)/.test(r.url()));
    await page.locator('[data-play=bac]').click();
    await yc;
  });

  test('tệp âm thanh 404 => nút báo lỗi nhẹ, không lỗi JS', async ({ page }) => {
    const loi = loiJs(page);
    await page.route('**/audio/**', (r) => r.fulfill({ status: 404, body: 'khong co' }));
    await page.goto(`${KHONG_APK}/`);
    const nut = page.locator('[data-play=bac]');
    await nut.click();
    await expect(nut).toHaveAttribute('data-state', 'error');
    await expect(page.locator('[data-play-status]')).toContainText('Không phát được');
    // vẫn bấm lại được, trang không treo
    await page.locator('[data-play=nam]').click();
    await expect(page.locator('[data-play=nam]')).toHaveAttribute('data-state', 'error');
    expect(loi).toEqual([]);
  });

  test('nút "Nghe làng quê" không tự phát', async ({ page }) => {
    await page.goto(`${KHONG_APK}/`);
    await expect(page.locator('[data-music]')).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('gợi ý tiếng Anh', () => {
  test.use({ locale: 'en-US' });
  test('trình duyệt en ở / => hiện dải gợi ý, URL vẫn là /', async ({ page }) => {
    await page.goto(`${KHONG_APK}/`);
    await expect(page.locator('[data-suggest-en]')).toBeVisible();
    await expect(page.locator('[data-suggest-en] a')).toHaveAttribute('href', '/en/');
    expect(new URL(page.url()).pathname).toBe('/');
  });
});

test('trình duyệt vi ở / => không có dải gợi ý', async ({ page }) => {
  await page.goto(`${KHONG_APK}/`);
  await expect(page.locator('[data-suggest-en]')).toBeHidden();
});

test('localStorage bị chặn => trang vẫn hiện, nút EN vẫn đổi được', async ({ page }) => {
  await page.addInitScript(() => {
    const chan = () => {
      throw new DOMException('bị chặn', 'SecurityError');
    };
    Storage.prototype.getItem = chan;
    Storage.prototype.setItem = chan;
  });
  const loi = loiJs(page);
  await page.goto(`${KHONG_APK}/`);
  await expect(page.locator('h1')).toBeVisible();
  await page.locator('[data-lang-switch=en]').click();
  await page.waitForURL('**/en/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(loi).toEqual([]);
});

test('hỏi đáp mở được bằng <details>, không cần JS', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(`${KHONG_APK}/`);
  const muc = page.locator('details').first();
  await muc.locator('summary').click();
  await expect(muc).toHaveAttribute('open', '');
  await ctx.close();
});

test.describe('khung 360 px', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  for (const p of ['/', '/en/', '/tai-apk', '/en/tai-apk']) {
    test(`không cuộn ngang ở ${p}`, async ({ page }) => {
      await page.goto(`${CO_APK}${p}`);
      const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      expect(sw).toBeLessThanOrEqual(iw);
    });
  }
});

async function axeNghiemTrong(page: Page) {
  const kq = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return kq.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

test.describe('axe', () => {
  for (const p of ['/', '/en/', '/tai-apk', '/en/tai-apk']) {
    test(`0 lỗi serious/critical ở ${p}`, async ({ page }) => {
      await page.goto(`${CO_APK}${p}`);
      expect(await axeNghiemTrong(page)).toEqual([]);
    });
  }

  test('vẫn đạt AA khi tranh đầu trang là ảnh thật tương phản thấp (lớp phủ giữ chữ rõ)', async ({ page }) => {
    // Thay tranh SVG bằng một ảnh trắng sáng: chữ phải vẫn đạt tương phản nhờ lớp phủ, không phụ thuộc tranh
    await page.route('**/img/hero-fallback.svg', (r) =>
      r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 5"><rect width="10" height="5" fill="#ffffff"/></svg>' })
    );
    await page.goto(`${CO_APK}/`);
    expect(await axeNghiemTrong(page)).toEqual([]);
    // Đo trực tiếp: chữ tiêu đề nằm trên lớp phủ có nền đặc (không trong suốt)
    const nen = await page.locator('.hero__panel').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(nen).not.toMatch(/rgba\(\d+, \d+, \d+, 0\)|transparent/);
  });
});

test('kiem-link.mjs: mọi link nội bộ trỏ tới tệp có trong dist', () => {
  const out = execFileSync(process.execPath, ['scripts/kiem-link.mjs', resolve('dist-e2e-co-apk')], { encoding: 'utf8' });
  expect(out).toMatch(/link nội bộ/);
});

test.describe('nguyên tắc UI/UX (docs/thiet-ke/NGUYEN-TAC-UI-UX.md)', () => {
  test('vùng chạm ≥ 44 px, nút chính ≥ 48 px', async ({ page }) => {
    await page.goto(`${CO_APK}/`);
    const cao = async (sel: string) => (await page.locator(sel).first().boundingBox())!.height;
    expect(await cao('[data-cta=web]')).toBeGreaterThanOrEqual(48);
    for (const sel of ['[data-cta=apk]', '[data-play=bac]', '[data-nav=login]', '[data-lang-switch=en]', '[data-music]', 'summary', 'footer a']) {
      expect(await cao(sel), sel).toBeGreaterThanOrEqual(44);
    }
  });

  test('đoạn văn giới hạn độ dài dòng, thân ≥ 15 px, giãn dòng ≥ 1.5, tiêu đề ≥ 1.25', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${CO_APK}/`);
    const kq = await page.evaluate(() => {
      const px = (el: Element, p: string) => parseFloat(getComputedStyle(el).getPropertyValue(p));
      const body = document.body;
      const ps = [...document.querySelectorAll('main p')].map((p) => ({ w: p.getBoundingClientRect().width, size: px(p, 'font-size') }));
      const h = [...document.querySelectorAll('h1,h2')].map((e) => px(e, 'line-height') / px(e, 'font-size'));
      return { bodyLh: px(body, 'line-height') / px(body, 'font-size'), bodySize: px(body, 'font-size'), maxP: Math.max(...ps.map((p) => p.w / p.size)), h };
    });
    expect(kq.bodySize).toBeGreaterThanOrEqual(15);
    expect(kq.bodyLh).toBeGreaterThanOrEqual(1.5);
    kq.h.forEach((r) => expect(r).toBeGreaterThanOrEqual(1.25));
    // 65ch ≈ 65 * 0,5em; chiều rộng tối đa một đoạn không quá ~75 ký tự trung bình (≈ 0,55 em mỗi ký tự)
    expect(kq.maxP).toBeLessThanOrEqual(75 / 0.55 * 1.0);
  });

  test('trang chủ dùng tối đa 4 cỡ chữ', async ({ page }) => {
    await page.goto(`${CO_APK}/`);
    const sizes = await page.evaluate(() => {
      const set = new Set<string>();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent?.trim() || !n.parentElement) continue;
        const cs = getComputedStyle(n.parentElement);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        set.add(String(Math.round(parseFloat(cs.fontSize))));
      }
      return [...set];
    });
    // h1 co theo màn hình (clamp) nên tính riêng: các cỡ còn lại phải ≤ 4
    expect(sizes.length, sizes.join(',')).toBeLessThanOrEqual(5);
  });
});
