import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { VERSIONS_FILE } from './e2e/versions';

/**
 * Test e2e trên cấu hình điện thoại, chạy bằng bản build thật (vite preview) => có cả Service Worker.
 * Dùng Chrome đã cài trên máy (channel 'chrome'), không cần tải trình duyệt của Playwright.
 * Chạy: pnpm --filter @vietlearning/host-shell build && pnpm --filter @vietlearning/host-shell e2e
 *
 * Chưa có WebKit (iPhone/Safari): cần `npx playwright install webkit` (tải ~70MB) hoặc máy Mac.
 *
 * Gateway THẬT (PGlite trong RAM, không AI, không đọc khóa Gemini) chạy kèm để kiểm tra tài khoản khách
 * + đồng bộ. Bản build phải trỏ đúng cổng: VITE_GATEWAY_URL=http://localhost:<E2E_GATEWAY_PORT>.
 * Đổi cổng khi nhiều worktree chạy song song: E2E_PORT, E2E_GATEWAY_PORT (gateway không bao giờ dùng lại
 * server có sẵn để không vô tình kiểm tra bản của worktree khác).
 */
// Cổng đổi được qua E2E_PORT / E2E_GATEWAY_PORT để nhiều worktree chạy e2e song song không dùng nhầm server của nhau
const PORT = Number(process.env.E2E_PORT) || 4173;
export const GATEWAY_PORT = Number(process.env.E2E_GATEWAY_PORT) || 4000;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  // 1 worker: các ca micro giả (AudioWorklet, thời gian thực) và đồng bộ chập chờn khi 2 trình duyệt tranh CPU/thiết bị âm
  // thanh (đo: ~1/3 lượt chạy cả bộ đỏ một ca ngẫu nhiên ở 2 worker, 0/4 ở 1 worker). Đổi lại bộ e2e chạy ~4,3 phút thay vì ~2.
  workers: 1,
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
  webServer: [
    {
      command: `npx vite preview --port ${PORT} --strictPort`,
      port: PORT,
      reuseExistingServer: !process.env.CI && !process.env.E2E_PORT,
      timeout: 60_000
    },
    {
      command: 'node e2e/reset-versions.mjs && node ../gateway/dist/index.js',
      url: `http://localhost:${GATEWAY_PORT}/healthz`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'development',
        PORT: String(GATEWAY_PORT),
        HOST: 'localhost',
        PGLITE_DIR: 'memory://',
        CORS_ORIGIN: `http://localhost:${PORT}`,
        GEMINI_API_KEY: '',
        BECUTIT_ENV_FILE: 'e2e-khong-co-tep.env',
        // Thư mục âm thanh dựng sẵn RIÊNG, trống: không dùng apps/gateway/.data/tts của máy dev (có gói thì app phát
        // tệp dựng sẵn thay vì TTS của máy => test đếm lời đọc phụ thuộc máy)
        TTS_AUDIO_DIR: join(tmpdir(), `becutit-e2e-audio-${GATEWAY_PORT}`),
        // Dự án 8: tệp phiên bản riêng + TTL 0 để e2e/update.spec.ts ghi tệp là Gateway thấy ngay (đường 426 thật)
        APP_VERSIONS_FILE: VERSIONS_FILE,
        APP_VERSIONS_TTL_MS: '0',
        AUTH_RATE_LIMIT_PER_MINUTE: '1000',
        RATE_LIMIT_PER_MINUTE: '1000'
      }
    }
  ]
});
