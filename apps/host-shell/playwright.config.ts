import { defineConfig, devices } from '@playwright/test';

/**
 * Test e2e trên cấu hình điện thoại, chạy bằng bản build thật (vite preview) => có cả Service Worker.
 * Dùng Chrome đã cài trên máy (channel 'chrome'), không cần tải trình duyệt của Playwright.
 * Chạy: pnpm --filter @vietlearning/host-shell build && pnpm --filter @vietlearning/host-shell e2e
 *
 * Chưa có WebKit (iPhone/Safari): cần `npx playwright install webkit` (tải ~70MB) hoặc máy Mac.
 */
const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome',
    trace: 'retain-on-failure',
    // Kiểm thử cũ khẳng định chữ tiếng Việt: ghim locale; test tiếng Anh tự đặt ngôn ngữ riêng
    locale: 'vi-VN'
  },
  projects: [
    { name: 'pixel-7', grepInvert: /@perf/, use: { ...devices['Pixel 7'], channel: 'chrome', locale: 'vi-VN' } },
    // Đo thời gian chỉ chạy SAU khi các project khác xong: chạy song song thì CPU bị tranh, số đo nhiễu
    { name: 'perf', grep: /@perf/, dependencies: ['pixel-7', 'android-nho-320'], use: { ...devices['Pixel 7'], channel: 'chrome', locale: 'vi-VN' } },
    {
      name: 'android-nho-320',
      grepInvert: /@perf/,
      use: {
        ...devices['Pixel 7'],
        channel: 'chrome',
        viewport: { width: 320, height: 640 },
        deviceScaleFactor: 2,
        locale: 'vi-VN'
      }
    }
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
