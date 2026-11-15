/**
 * Ngân sách kích thước bundle (gzip) cho app mobile. Chạy: pnpm --filter @vietlearning/host-shell size
 * Mức đặt = kích thước đo ngày 2026-11-15 + ~10-15% dư. Vượt ngân sách => kiểm tra thất bại (chặn hồi quy).
 * Muốn nâng ngân sách: ghi lý do trong commit và nhật ký docs/NHAT_KY_CHUYEN_DOI_MOBILE.md.
 */
module.exports = [
  {
    name: 'Tải ban đầu: JS khung app + React (mọi người dùng đều tải)',
    path: ['dist/assets/app-*.js', 'dist/assets/react-*.js'],
    limit: '68 kB', gzip: true
  },
  { name: 'CSS toàn app (Tailwind + tokens)', path: 'dist/assets/*.css', limit: '7.5 kB', gzip: true },
  { name: 'M3 Ma trận xưng hô (lazy)', path: 'dist/assets/HonorificScreen-*.js', limit: '15 kB', gzip: true },
  { name: 'M3 Bảng 20 cặp + Radix Dialog (lazy khi mở)', path: 'dist/assets/HonorificExplorerDrawer-*.js', limit: '18 kB', gzip: true },
  { name: 'M2 Luyện thanh điệu (lazy)', path: 'dist/assets/ToneLabRoute-*.js', limit: '9 kB', gzip: true },
  { name: 'Worker phân tích cao độ A1/A2', path: 'dist/assets/pitch.worker-*.js', limit: '5 kB', gzip: true }
];
