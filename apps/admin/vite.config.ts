import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Trang quản trị (dự án 5a, Task 6): chạy localhost, KHÔNG triển khai production, KHÔNG nằm trong app học.
 * - Gốc Gateway cấu hình LÚC BUILD qua VITE_GATEWAY_URL (không phải bí mật). Không nhúng khóa nào.
 * - CSP chặt: script chỉ từ chính nó; kết nối/ảnh/video chỉ tới Gateway. Bản dev (HMR cần script nội tuyến) không áp CSP;
 *   bản build thêm <meta> CSP, `vite preview` thêm cả header (kể cả frame-ancestors, meta không đặt được).
 */
export function cspFor(gateway: string): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    `connect-src ${gateway}`,
    `img-src ${gateway}`,
    `media-src ${gateway}`,
    "font-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'"
  ].join('; ');
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const gateway = new URL(env.VITE_GATEWAY_URL || 'http://localhost:4000').origin;
  const csp = cspFor(gateway);
  // Cổng đổi được khi nhiều bản chạy song song (nhớ đặt ADMIN_ORIGIN của Gateway trùng, vd. http://localhost:5183)
  const port = Number(process.env.ADMIN_PORT) || 5180;
  const headers = {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    'Cross-Origin-Opener-Policy': 'same-origin'
  };
  const cspMeta = (): Plugin => ({
    name: 'admin-csp-meta',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp.replace(/; frame-ancestors 'none'/, '') }, injectTo: 'head-prepend' }]
  });
  return {
    plugins: [react(), tailwindcss(), cspMeta()],
    resolve: { dedupe: ['react', 'react-dom'] },
    build: { target: 'es2020', sourcemap: false, rollupOptions: { output: { entryFileNames: 'assets/admin-[hash].js' } } },
    server: { port, strictPort: true, host: 'localhost', headers: { ...headers, 'Content-Security-Policy': "frame-ancestors 'none'" } },
    preview: { port, strictPort: true, host: 'localhost', headers }
  };
});
