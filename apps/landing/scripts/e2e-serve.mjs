/**
 * Dựng bản build riêng cho e2e rồi phục vụ bằng vite preview.
 * Dùng: node scripts/e2e-serve.mjs <thư-mục-ra> <cổng> [tệp-apk-release.json]
 * Không truyền tệp APK => dùng đường dẫn không tồn tại (trạng thái "Sắp có").
 */
import { resolve } from 'node:path';
import { build, preview } from 'vite';

const [outName, port, apk] = process.argv.slice(2);
process.env.LANDING_APK_FILE = apk ? resolve(apk) : resolve('khong-co-apk-release.json');
const outDir = resolve(outName);
await build({ logLevel: 'warn', build: { outDir, emptyOutDir: true } });
const server = await preview({ logLevel: 'warn', build: { outDir }, preview: { port: Number(port), strictPort: true, host: 'localhost' } });
server.printUrls();
