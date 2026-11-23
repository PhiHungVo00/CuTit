// Chụp ảnh app thật (Pixel 7, vi-VN) cho slide giới thiệu nhóm. Chạy từ gốc repo, sau khi Gateway (4124) và vite preview (5204) đã chạy.
// Không dùng dữ liệu thật: Gateway giả lập (không khóa), trình duyệt mới sạch. Dùng: node docs/nhom/chup-anh.mjs [sang|toi]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../../apps/host-shell/package.json', import.meta.url));
const { chromium, devices } = require('@playwright/test');
const PORT = process.env.E2E_PORT || 5204;
const theme = process.argv[2] === 'toi' ? 'dark' : 'light';
const suffix = theme === 'dark' ? '-toi' : '';
const out = fileURLToPath(new URL('./anh/', import.meta.url));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'vi-VN' });
await ctx.addInitScript((t) => { try { localStorage.setItem('becutit.theme', t); } catch {} }, theme);
const page = await ctx.newPage();
const base = `http://localhost:${PORT}`;
const shot = async (name) => { await page.waitForTimeout(900); await page.screenshot({ path: `${out}${name}${suffix}.png` }); console.log('ok', name); };
const go = async (path) => {
  await page.goto(base + path); await page.waitForLoadState('networkidle').catch(() => {});
  // tắt bong bóng gợi ý của Cu Tít để không che màn hình
  const ok = page.getByRole('button', { name: 'Đã hiểu' });
  if (await ok.waitFor({ timeout: 3000 }).then(() => true, () => false)) await ok.click();
};
const step = async (name, fn) => { try { await fn(); } catch (e) { console.log('FAIL', name, String(e).split('\n')[0]); } };

await step('onboarding', async () => { await go('/bat-dau'); await shot('01-chao'); });
// hồ sơ mẫu: đã làm onboarding, để vào thẳng lộ trình
await page.evaluate(() => localStorage.setItem('becutit.learner', JSON.stringify({ state: { profile: { onboarded: true, level: 2, goal: 'daily', nativeLang: 'en', dialect: 'north' } }, version: 0 })));
await step('hoc-vai-bai', async () => {
  const { solveLesson, VI } = await import('../../apps/host-shell/e2e/lesson-helpers.ts');
  await go('/bai-hoc/u1l1'); await solveLesson(page, VI);
  await go('/bai-hoc/u1l2'); await solveLesson(page, VI);
});
await step('lo-trinh', async () => { await go('/'); await shot('02-lo-trinh'); });
await step('bai-tap', async () => { await go('/bai-hoc/u1l1'); await shot('03-bai-tap'); });
await step('chat', async () => {
  await go('/hoi-thoai');
  const box = page.getByRole('textbox').first();
  await box.fill('Xin chào Cu Tít!'); await box.press('Enter');
  await page.waitForTimeout(4000); await shot('04-cu-tit-chat');
});
await step('goi-video', async () => { await go('/goi-thoai'); await shot('05-goi-video'); });
await step('xung-ho', async () => { await go('/xung-ho'); await shot('06-xung-ho'); });
await step('phat-am', async () => { await go('/phat-am'); await shot('07-phat-am'); });
await step('tien-do', async () => { await go('/tien-do'); await shot('08-tien-do'); });
await step('ho-so', async () => { await go('/ho-so'); await shot('09-ho-so'); });
await step('dang-nhap', async () => { await go('/dang-nhap'); await shot('10-dang-nhap'); });
await browser.close();
