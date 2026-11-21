/**
 * Chụp ảnh màn hình thật của app để làm bộ slide tính năng (docs/slide-tinh-nang/).
 * KHÔNG phải test: không khẳng định gì, chỉ chụp và ghi manifest.json (ảnh nào chụp được, ảnh nào lỗi).
 *
 * Chạy (sau khi Gateway chạy ở cổng 4024 và vite preview ở cổng 4195 — xem README.md trong thư mục này):
 *   pnpm --filter @vietlearning/host-shell exec playwright test --config=../../docs/slide-tinh-nang/chup-anh.config.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// Dùng đúng bản @playwright/test của apps/host-shell (thư mục docs/ không có node_modules riêng)
import { expect, test, type Page } from '../../apps/host-shell/node_modules/@playwright/test';
import { VI, solveLesson } from '../../apps/host-shell/e2e/lesson-helpers';

const HERE = __dirname;
const OUT = join(HERE, 'anh');
mkdirSync(OUT, { recursive: true });

const log: { ten: string; trang: string; ok: boolean; ghiChu?: string }[] = [];
const save = () => writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(log, null, 2));

/** Chụp một màn; lỗi không làm dừng cả phiên, chỉ ghi vào manifest */
async function snap(page: Page, ten: string, trang: string, ghiChu?: string) {
  try {
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT, `${ten}.png`) });
    log.push({ ten, trang, ok: true, ghiChu });
  } catch (e) {
    log.push({ ten, trang, ok: false, ghiChu: String(e).slice(0, 200) });
  }
  save();
}

/** Trang hiện tại của phiên (gán trong test). */
let page!: Page;

/** Renderer có thể crash (Chrome): nếu vậy mở tab mới trong CÙNG context để giữ XP/chuỗi ngày rồi chạy tiếp */
async function ensurePage() {
  if (page.isClosed()) {
    page = await page.context().newPage();
    return;
  }
  const alive = await page.evaluate(() => true).catch(() => false);
  if (!alive) {
    const ctx = page.context();
    await page.close().catch(() => {});
    page = await ctx.newPage();
  }
}

async function step(ten: string, trang: string, fn: () => Promise<void>, ghiChu?: string) {
  try {
    await ensurePage();
    await fn();
  } catch (e) {
    log.push({ ten, trang, ok: false, ghiChu: `Lỗi bước: ${String(e).split('\n')[0].slice(0, 200)}` });
    save();
    await ensurePage().catch(() => {});
  }
}

// Một phiên duy nhất (giữ XP/chuỗi ngày giữa các ảnh), tiếng Việt, khung Pixel 7
test('chụp toàn bộ tính năng', async ({ page: first }) => {
  page = first;
  test.setTimeout(3_000_000);

  // 1. Người mới: trang chủ và màn bắt đầu
  await step('trang-chu-nguoi-moi', '/', async () => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /Bắt đầu bài đầu tiên/ })).toBeVisible();
    await snap(page, '01-trang-chu-nguoi-moi', '/');
  });
  await step('bat-dau', '/bat-dau', async () => {
    await page.goto('/bat-dau');
    await snap(page, '02-bat-dau', '/bat-dau');
  });

  // 2. Bài học: ảnh câu đầu tiên, rồi làm hết unit 1 (nhớ đáp án để không mất thời gian)
  await step('bai-hoc', '/bai-hoc/u1l1', async () => {
    await page.goto('/');
    await page.getByRole('link', { name: /Bắt đầu bài đầu tiên/ }).click();
    await expect(page).toHaveURL(/\/bai-hoc\/u1l1$/);
    const memory = new Map<string, string>();
    let first = true;
    for (const id of ['u1l1', 'u1l2', 'u1l3', 'u1l4']) {
      await expect(page).toHaveURL(new RegExp(`/bai-hoc/${id}$`));
      await solveLesson(page, VI, memory, async () => {
        if (first) {
          await snap(page, '03-bai-hoc-cau-hoi', '/bai-hoc/u1l1', 'Câu hỏi đầu tiên của bài 1');
          first = false;
        }
      });
      if (id === 'u1l1') await snap(page, '04-bai-hoc-xong-bai', '/bai-hoc/u1l1', 'Màn tổng kết bài: XP, độ đúng ngay lần đầu');
      if (id !== 'u1l4') await page.getByRole('link', { name: /^Học tiếp:/ }).click();
    }
  });

  // 3. Trang chủ sau khi có tiến độ (XP, chuỗi ngày, unit)
  await step('trang-chu-tien-do', '/', async () => {
    await page.goto('/');
    await expect(page.getByTestId('xp')).toBeVisible();
    await snap(page, '05-trang-chu-tien-do', '/');
  });
  await step('lo-trinh-cuon', '/', async () => {
    await page.getByRole('region', { name: /Chào hỏi & xưng hô/ }).scrollIntoViewIfNeeded();
    await snap(page, '06-lo-trinh-unit', '/', 'Thẻ unit với số bài đã xong');
  });

  // 4. Ôn tập (SM-2) và lỗi gần đây
  await step('on-tap', '/on-tap', async () => {
    await page.goto('/on-tap');
    await snap(page, '07-on-tap', '/on-tap');
  });

  // 5. Kiểm tra vượt unit
  await step('kiem-tra', '/kiem-tra/u1', async () => {
    await page.goto('/kiem-tra/u1');
    await snap(page, '08-kiem-tra-vuot-unit', '/kiem-tra/u1');
  });

  // 6. Hồ sơ tiến bộ, huy hiệu, bạn học
  await step('ho-so', '/ho-so', async () => {
    await page.goto('/ho-so');
    await snap(page, '09-ho-so-tien-bo', '/ho-so');
  });
  await step('huy-hieu', '/ho-so', async () => {
    await page.getByRole('tab', { name: /Huy hiệu/ }).click({ timeout: 10_000 });
    await snap(page, '10-huy-hieu', '/ho-so', 'Tab Huy hiệu');
  });
  await step('ban-hoc', '/ho-so', async () => {
    await page.goto('/ho-so');
    await page.getByRole('button', { name: /Tạo mã mời|Mở bạn học/ }).first().scrollIntoViewIfNeeded();
    await snap(page, '11-ban-hoc', '/ho-so', 'Mã mời và danh sách bạn học');
  });

  // 7. Chat với Bé Cu Tít (AI thật qua Gateway, có thể chậm/hết lượt)
  await step('hoi-thoai', '/hoi-thoai', async () => {
    await page.goto('/hoi-thoai');
    await snap(page, '12-hoi-thoai', '/hoi-thoai');
    const box = page.getByRole('textbox').first();
    await box.fill('Xin chào, em muốn học tiếng Việt');
    await page.getByRole('button', { name: 'Gửi' }).click();
    await page.waitForTimeout(8_000);
    await snap(page, '12b-hoi-thoai-tra-loi', '/hoi-thoai', 'Phản hồi của Bé Cu Tít (Gemini thật, có thể trễ)');
  });
  await step('goi-thoai', '/goi-thoai', async () => {
    await page.goto('/goi-thoai');
    await snap(page, '13-goi-thoai', '/goi-thoai', 'Màn gọi thoại: cần cấp quyền micro khi bấm bắt đầu');
  });
  await step('nhap-vai', '/nhap-vai', async () => {
    await page.goto('/nhap-vai');
    await snap(page, '14-nhap-vai', '/nhap-vai');
  });

  // 8. Khám phá 12 công cụ và các màn công cụ
  await step('kham-pha', '/kham-pha', async () => {
    await page.goto('/kham-pha');
    await snap(page, '15-kham-pha', '/kham-pha');
  });
  await step('xung-ho', '/xung-ho', async () => {
    await page.goto('/xung-ho');
    await snap(page, '16-xung-ho', '/xung-ho');
  });
  await step('van-hoa', '/van-hoa', async () => {
    await page.goto('/van-hoa');
    await snap(page, '17-van-hoa', '/van-hoa');
  });
  await step('phat-am', '/phat-am', async () => {
    await page.goto('/phat-am');
    await snap(page, '18-phat-am', '/phat-am');
  });
  await step('phong-thanh', '/phong-thanh', async () => {
    await page.goto('/phong-thanh?seed=5');
    await snap(page, '19-phong-thanh', '/phong-thanh');
  });
  await step('phuong-ngu', '/phuong-ngu', async () => {
    await page.goto('/phuong-ngu');
    await snap(page, '20-phuong-ngu', '/phuong-ngu');
  });
  await step('luyen-tap', '/luyen-tap', async () => {
    await page.goto('/luyen-tap');
    await snap(page, '21-luyen-tap', '/luyen-tap');
  });
  await step('ghep-cau', '/ghep-cau', async () => {
    await page.goto('/ghep-cau');
    await snap(page, '22-ghep-cau', '/ghep-cau');
  });
  await step('camera', '/camera', async () => {
    await page.goto('/camera');
    await snap(page, '23-camera', '/camera', 'Trước khi cấp quyền camera (trang chưa bật máy ảnh)');
  });

  // 9. Tùy chỉnh, quyền riêng tư và tài khoản
  await step('tuy-chinh', '/tuy-chinh', async () => {
    await page.goto('/tuy-chinh');
    await snap(page, '24-tuy-chinh', '/tuy-chinh');
  });
  await step('quyen-rieng-tu', '/quyen-rieng-tu', async () => {
    await page.goto('/quyen-rieng-tu');
    await snap(page, '25-quyen-rieng-tu', '/quyen-rieng-tu', 'Bản nháp chính sách');
  });
});

test.describe('tiếng Anh và chế độ tối', () => {
  test.use({ locale: 'en-US' });
  test('màn chủ tiếng Anh', async ({ page: p }) => {
    page = p;
    test.setTimeout(120_000);
    await step('tieng-anh', '/', async () => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await snap(page, '26-tieng-anh', '/', 'Giao diện tiếng Anh (song ngữ)');
    });
  });
});

test.describe('chế độ tối', () => {
  test.use({ colorScheme: 'dark' });
  test('màn chủ chế độ tối', async ({ page: p }) => {
    page = p;
    test.setTimeout(120_000);
    await step('che-do-toi', '/', async () => {
      await page.goto('/');
      await snap(page, '27-che-do-toi', '/', 'Theo cài đặt hệ thống (tối)');
    });
  });
});

