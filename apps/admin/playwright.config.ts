import { defineConfig, devices } from '@playwright/test';

/**
 * e2e trang quản trị: bản build thật (vite preview) + Gateway thật (PGlite tạm, dựng trong e2e/admin.spec.ts).
 * Cổng riêng, đổi được khi nhiều bản chạy song song: E2E_ADMIN_PORT (trang) và E2E_GATEWAY_PORT (Gateway).
 * Cần Gateway đã build: pnpm --filter @vietlearning/gateway build
 */
export const ADMIN_PORT = Number(process.env.E2E_ADMIN_PORT) || 5183;
export const GATEWAY_PORT = Number(process.env.E2E_GATEWAY_PORT) || 4617;

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { channel: 'chrome', locale: 'vi-VN', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome', locale: 'vi-VN' } }],
  webServer: {
    command: `npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e`,
    url: `http://localhost:${ADMIN_PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { VITE_GATEWAY_URL: `http://localhost:${GATEWAY_PORT}`, ADMIN_PORT: String(ADMIN_PORT) }
  }
});
