import { defineConfig, devices } from '@playwright/test';

/**
 * e2e cho trang giới thiệu: chạy bản build thật (vite preview), 2 bản build:
 *  - "khong-apk": không có apk-release.json  => nút APK hiện "Sắp có"
 *  - "co-apk"   : dùng test/apk-release.mau.json => nút trỏ /tai-apk
 * Đổi cổng khi nhiều worktree chạy song song: E2E_PORT (dùng E2E_PORT và E2E_PORT+1).
 * Không cần Gateway: trang không gọi Gateway.
 */
export const PORT_KHONG_APK = Number(process.env.E2E_PORT) || 4190;
export const PORT_CO_APK = PORT_KHONG_APK + 1;
export const APP_ORIGIN = 'http://app.landing-test.local';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { channel: 'chrome', locale: 'vi-VN', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Pixel 7'], channel: 'chrome', locale: 'vi-VN' } }],
  webServer: [
    {
      command: `node scripts/e2e-serve.mjs dist-e2e-khong-apk ${PORT_KHONG_APK}`,
      url: `http://localhost:${PORT_KHONG_APK}/`,
      reuseExistingServer: false,
      timeout: 90_000,
      env: { LANDING_APP_ORIGIN: APP_ORIGIN, LANDING_SITE_ORIGIN: 'http://landing-test.local' }
    },
    {
      command: `node scripts/e2e-serve.mjs dist-e2e-co-apk ${PORT_CO_APK} test/apk-release.mau.json`,
      url: `http://localhost:${PORT_CO_APK}/`,
      reuseExistingServer: false,
      timeout: 90_000,
      env: { LANDING_APP_ORIGIN: APP_ORIGIN, LANDING_SITE_ORIGIN: 'http://landing-test.local' }
    }
  ]
});
