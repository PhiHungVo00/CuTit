// Chụp màn Dự án 1 (4 tab, Hồ sơ, Cài đặt, chat, bong bóng) sáng/tối × vi/en × 412 và 320px; kiểm tràn ngang + chuỗi một ngôn ngữ.
// Chạy sau khi build + gateway/preview đang chạy: UI_URL=http://localhost:4231 node scripts/chup-du-an-1.mjs <thư mục ra>
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.UI_URL ?? 'http://localhost:4231';
const out = process.argv[2] ?? 'anh-chup';
mkdirSync(out, { recursive: true });
const SCREENS = [
  ['hoc', '/'], ['luyen-tap', '/luyen-tap-chung'], ['ban-be', '/ban-be'], ['ho-so', '/ho-so'],
  ['cai-dat', '/cai-dat'], ['cai-dat-giao-dien', '/cai-dat/giao-dien'], ['chat', '/hoi-thoai']
];
const VI_ONLY = /\b(Settings|Profile|Friends|Practice|Appearance|Language|Sound|Privacy|Account)\b/;
const browser = await chromium.launch({ channel: 'chrome' });
const problems = [];
for (const [w, h, size] of [[412, 915, 'pixel7'], [320, 640, '320']]) {
  for (const lang of ['vi', 'en']) for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: w, height: h }, locale: lang === 'vi' ? 'vi-VN' : 'en-US' });
    await ctx.addInitScript((t) => localStorage.setItem('becutit.device', JSON.stringify({ version: 1, state: { theme: t, seenBubbleIntro: true } })), theme);
    const page = await ctx.newPage();
    for (const [name, path] of SCREENS) {
      await page.goto(base + path); await page.waitForLoadState('networkidle'); await page.waitForTimeout(700);
      const tag = `${name}.${size}.${lang}.${theme}`;
      await page.screenshot({ path: join(out, tag + '.png') });
      const r = await page.evaluate(() => {
        const bad = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n; const texts = [];
        while ((n = walker.nextNode())) {
          const t = n.textContent.trim(); if (!t || n.parentElement.closest('script,style,[lang="vi"],[aria-hidden="true"]')) continue;
          if (n.parentElement.offsetParent === null && getComputedStyle(n.parentElement).position !== 'fixed') continue;
          texts.push(t);
        }
        return { over: document.documentElement.scrollWidth - document.documentElement.clientWidth, texts };
      });
      if (r.over > 0) problems.push(`${tag}: tràn ngang ${r.over}px`);
      const dia = /[ăâêôơưđàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
      if (lang === 'en') for (const t of r.texts) if (dia.test(t.replace(/B[ée] Cu Tít|Cu Tít|ma\/má\/mà/g, ''))) problems.push(`${tag}: chữ Việt trong bản en: "${t.slice(0, 60)}"`);
      if (lang === 'vi') for (const t of r.texts) if (VI_ONLY.test(t)) problems.push(`${tag}: chữ Anh trong bản vi: "${t.slice(0, 60)}"`);
    }
    // bong bóng: màn Học, bấm mở
    await page.goto(base + '/'); await page.waitForLoadState('networkidle');
    const b = page.getByRole('button', { name: lang === 'vi' ? 'Hỏi Bé Cu Tít' : 'Ask Bé Cu Tít' });
    if (await b.waitFor({ timeout: 8000 }).then(() => true, () => false)) { await page.waitForTimeout(600); await page.screenshot({ path: join(out, `bong-bong.${size}.${lang}.${theme}.png`) }); } else problems.push(`bong-bong.${size}.${lang}.${theme}: không thấy bong bóng`);
    await ctx.close();
  }
}
await browser.close();
console.log(problems.length ? problems.join('\n') : 'OK: không tràn ngang, không chuỗi sai ngôn ngữ');
