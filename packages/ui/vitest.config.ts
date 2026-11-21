import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Test chạy trên mã nguồn của @vietlearning/state (không cần build trước)
export default defineConfig({
  resolve: {
    alias: { '@vietlearning/state': fileURLToPath(new URL('../state/src/index.ts', import.meta.url)) }
  },
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] }
});
