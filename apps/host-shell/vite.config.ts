import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';

/**
 * Host Shell ghép các remote MFE lúc build (không dùng Module Federation runtime).
 * - Mỗi màn hình là một chunk lazy riêng (xem src/routes.tsx).
 * - React chỉ có một bản (dedupe) và nằm trong chunk vendor cache lâu dài.
 * - PWA: precache toàn bộ shell + chunk màn hình để chạy offline và cài lên màn hình chính.
 */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // tự đăng ký trong main.tsx sau khi trang đã hiển thị
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Học Tiếng Việt Cùng Bé Cu Tít',
        short_name: 'Bé Cu Tít',
        description: 'Học tiếng Việt: xưng hô, phát âm 6 thanh, hội thoại cùng Bé Cu Tít',
        lang: 'vi',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#16100B',
        theme_color: '#16100B',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        // Bản mới kích hoạt ngay và nhận quyền điều khiển tab đang mở; xóa precache cũ
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        // Không bao giờ cache API của Gateway (dữ liệu cá nhân, có xác thực)
        navigateFallbackDenylist: [/^\/v1\//, /^\/healthz/]
      }
    })
  ],
  // Worker phân tích thanh điệu (mfe-speech-lab) dùng ES module import
  worker: { format: 'es' },
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom']
        }
      }
    }
  },
  server: {
    port: 3000,
    host: true
  },
  preview: {
    port: 3000
  }
});
