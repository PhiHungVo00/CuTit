import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';
import { readAppVersion } from './scripts/version.mjs';

// Số phiên bản (nguồn duy nhất: package.json) đưa vào bundle; build = x·1 000 000 + y·1 000 + z.
const appVersion = readAppVersion();

/**
 * Preload 4 file font (latin/vietnamese × 400/800) ngay trong HTML. Font khai báo font-display: optional
 * (styles/fonts.css); không preload thì trình duyệt chỉ phát hiện font SAU khi React vẽ chữ => luôn lỡ
 * khung ~100 ms và web không bao giờ hiện Be Vietnam Pro (đo bằng CSS.getPlatformFontsForNode).
 */
function preloadFonts(): Plugin {
  return {
    name: 'becutit-preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const fonts = Object.keys(ctx.bundle ?? {}).filter((f) => /be-vietnam-pro-(latin|vietnamese)-(400|800)-normal-[\w-]+\.woff2$/.test(f));
        return fonts.map((f) => ({ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${f}`, crossorigin: '' }, injectTo: 'head' as const }));
      }
    }
  };
}

/**
 * Host Shell ghép các remote MFE lúc build (không dùng Module Federation runtime).
 * - Mỗi màn hình là một chunk lazy riêng (xem src/routes.tsx).
 * - React chỉ có một bản (dedupe) và nằm trong chunk vendor cache lâu dài.
 * - PWA: precache toàn bộ shell + chunk màn hình để chạy offline và cài lên màn hình chính.
 */
export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion.version),
    'import.meta.env.VITE_APP_BUILD': JSON.stringify(String(appVersion.build))
  },
  plugins: [
    react(),
    tailwindcss(),
    preloadFonts(),
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
        background_color: '#FBF3E4',
        theme_color: '#6FA544',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webp}'],
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
        // Tên file ổn định theo vai trò để đặt ngân sách kích thước (.size-limit.cjs)
        entryFileNames: 'assets/app-[hash].js',
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
