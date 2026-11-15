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
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'pixel-7', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    {
      name: 'android-nho-320',
      use: {
        ...devices['Pixel 7'],
        channel: 'chrome',
        viewport: { width: 320, height: 640 },
        deviceScaleFactor: 2
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
