import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port cố định (300x band) — tránh xung đột 5173 giữa các MFE khi turbo chạy song song
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3005,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true
      },
      '/v1': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 3005
  }
});
