import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { readApkRelease } from './src/apk';
import { PAGE_BY_FILE, renderBody, renderHead, type RenderContext } from './src/render';

const root = __dirname;

/**
 * Biến build:
 *  - LANDING_APP_ORIGIN : gốc của app (mặc định http://localhost:5173 khi dev), vd https://app.<tên>.id.vn
 *  - LANDING_SITE_ORIGIN: gốc của trang giới thiệu, dùng cho canonical/hreflang/Open Graph/sitemap (mặc định rỗng => đường dẫn tương đối, không sinh sitemap)
 *  - LANDING_APK_FILE   : đường dẫn apk-release.json (mặc định 01-nen-tang/apps/landing/apk-release.json)
 */
const appOrigin = (process.env.LANDING_APP_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
const siteOrigin = (process.env.LANDING_SITE_ORIGIN || '').replace(/\/$/, '');
const apkFile = process.env.LANDING_APK_FILE || resolve(root, 'apk-release.json');

// Lưu ý: ví dụ 1x1 WebP xám + WAV im lặng 0,5 giây chỉ để GIỮ CHỖ khi Task 2 chưa đưa tệp thật vào public/. Tệp thật (nếu có) luôn thắng.
const GRAY_WEBP = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64');
function silentWav(): Buffer {
  const rate = 8000;
  const n = rate / 2;
  const b = Buffer.alloc(44 + n, 0x80);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write('data', 36);
  b.writeUInt32LE(n, 40);
  return b;
}
const PLACEHOLDERS: Record<string, () => Buffer | Uint8Array> = {};
for (const n of ['ba-mien-bac', 'ba-mien-trung', 'ba-mien-nam', 'sang-lang']) for (const ext of ['ogg', 'mp3']) PLACEHOLDERS[`audio/${n}.${ext}`] = silentWav;
for (const l of ['vi', 'en']) for (const f of ['lo-trinh', 'tro-chuyen', 'xung-ho']) PLACEHOLDERS[`img/anh-chup/${l}/${f}.webp`] = () => GRAY_WEBP;

/** Dựng HTML 4 trang từ messages.ts + chèn preload font 800 + tệp giữ chỗ + sitemap */
function landingPages(): Plugin {
  const ctx = (): RenderContext => ({ appOrigin, siteOrigin, apk: readApkRelease(apkFile) });
  let cached: RenderContext | null = null;
  return {
    name: 'landing-pages',
    buildStart() {
      cached = ctx();
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, { path }) {
        const info = PAGE_BY_FILE[path.split('?')[0]];
        if (!info) return html;
        const c = cached ?? ctx();
        return html
          .replace('<!--@head-->', renderHead(info.page, info.lang, c))
          .replace('<!--@body-->', renderBody(info.page, info.lang, c));
      }
    }
  };
}

function fontPreload(): Plugin {
  return {
    name: 'landing-font-preload',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const names = Object.keys(ctx.bundle ?? {}).filter((k) => /be-vietnam-pro-(latin|vietnamese)-800-normal.*\.woff2$/.test(k));
        return names.map((n) => ({
          tag: 'link',
          attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: `/${n}` },
          injectTo: 'head' as const
        }));
      }
    }
  };
}

/** /tai-apk và /en/tai-apk (không có dấu / cuối) mở tai-apk/index.html, như Cloudflare Pages; mặc định Vite preview rơi về index.html trang chủ */
function dirUrls(): Plugin {
  type Mw = (req: { url?: string }, res: unknown, next: () => void) => void;
  const make = (dirOf: () => string): Mw => (req, _res, next) => {
    const path = (req.url ?? '').split('?')[0];
    if (path && !path.endsWith('/') && !/\.[a-z0-9]+$/i.test(path) && existsSync(resolve(dirOf(), '.' + path, 'index.html'))) req.url = path + '/';
    next();
  };
  let outDir = resolve(root, 'dist');
  return {
    name: 'landing-dir-urls',
    configResolved(c) {
      outDir = resolve(root, c.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use(make(() => root));
    },
    configurePreviewServer(server) {
      server.middlewares.use(make(() => outDir));
    }
  };
}

function placeholders(): Plugin {
  return {
    name: 'landing-placeholders',
    generateBundle() {
      for (const [file, make] of Object.entries(PLACEHOLDERS)) {
        if (existsSync(resolve(root, 'public', file))) continue;
        this.emitFile({ type: 'asset', fileName: file, source: make() });
      }
      if (siteOrigin) {
        const urls = ['/', '/en/', '/tai-apk', '/en/tai-apk'].map((p) => `  <url><loc>${siteOrigin}${p}</loc></url>`).join('\n');
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n` });
      }
    },
    // Dev server: phục vụ cùng tệp giữ chỗ để trang xem được khi chưa có tài nguyên thật
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const key = (req.url ?? '').split('?')[0].replace(/^\//, '');
        const make = PLACEHOLDERS[key];
        if (!make || existsSync(resolve(root, 'public', key))) return next();
        res.setHeader('Content-Type', key.endsWith('.webp') ? 'image/webp' : 'audio/wav');
        res.end(make());
      });
    }
  };
}

export default defineConfig({
  root,
  base: '/',
  plugins: [landingPages(), fontPreload(), placeholders(), dirUrls()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        home: resolve(root, 'index.html'),
        homeEn: resolve(root, 'en/index.html'),
        apk: resolve(root, 'tai-apk/index.html'),
        apkEn: resolve(root, 'en/tai-apk/index.html')
      }
    }
  },
  preview: { host: 'localhost' }
});
