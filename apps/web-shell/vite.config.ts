import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Bản Web desktop — port 3010 cố định, proxy thống nhất về Gateway :4000
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3010,
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
    port: 3010
  }
});
