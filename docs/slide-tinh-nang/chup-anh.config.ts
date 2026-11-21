import { defineConfig, devices } from '../../apps/host-shell/node_modules/@playwright/test';

/** Cấu hình chụp ảnh: khung Pixel 7 (412×915), Chrome của máy, không tự khởi động server (xem README.md). */
export default defineConfig({
  testDir: '.',
  testMatch: /chup-.*\.spec\.ts/,
  timeout: 900_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4195',
    channel: 'chrome',
    locale: 'vi-VN',
    ...devices['Pixel 7'],
    viewport: { width: 412, height: 915 },
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
    deviceScaleFactor: 1
  },
  projects: [{ name: 'pixel-7-chup' }]
});
