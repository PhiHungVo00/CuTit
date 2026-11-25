import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Cấu hình test riêng: không nạp plugin PWA/Tailwind của bản build
export default defineConfig({
  resolve: {
    alias: {
      // Module ảo do vite-plugin-pwa sinh lúc build; test thay bằng stub rồi vi.mock
      'virtual:pwa-register': fileURLToPath(new URL('./src/update/testStubs/pwa-register.ts', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}']
  }
});
