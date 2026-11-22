/**
 * Ngân sách trang giới thiệu (spec dự án 7 mục 5.4). Chạy sau build: pnpm --filter @vietlearning/landing size
 * Vượt ngân sách => kiểm tra thất bại. Muốn nâng: ghi lý do trong commit và nhật ký.
 */
module.exports = [
  { name: 'Trang đầu vi: HTML + CSS + JS (gzip, không tính ảnh/font)', path: ['dist/index.html', 'dist/assets/*.css', 'dist/assets/*.js'], limit: '30 kB', gzip: true },
  { name: 'Trang đầu en: HTML + CSS + JS (gzip)', path: ['dist/en/index.html', 'dist/assets/*.css', 'dist/assets/*.js'], limit: '30 kB', gzip: true },
  { name: 'Font Be Vietnam Pro 400 + 800, latin + vietnamese (woff2)', path: 'dist/assets/*.woff2', limit: '80 kB', gzip: false },
  { name: 'Tranh đầu trang (SVG tạm; tranh thật ≤ 150 kB)', path: 'dist/img/hero-fallback.svg', limit: '150 kB', gzip: false }
];
