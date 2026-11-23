import { defineConfig } from 'vitest/config';

// Cấu hình test riêng: không nạp plugin PWA/Tailwind của bản build
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}']
  }
});
