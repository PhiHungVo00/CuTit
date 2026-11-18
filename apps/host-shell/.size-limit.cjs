/**
 * Ngân sách kích thước bundle (gzip) cho app mobile. Chạy: pnpm --filter @vietlearning/host-shell size
 * Mức đặt = kích thước đo ngày 2026-11-15 + ~10-15% dư. Vượt ngân sách => kiểm tra thất bại (chặn hồi quy).
 * Muốn nâng ngân sách: ghi lý do trong commit và nhật ký docs/NHAT_KY_CHUYEN_DOI_MOBILE.md.
 */
module.exports = [
  {
    name: 'Tải ban đầu: JS khung app + React (mọi người dùng đều tải)',
    path: ['dist/assets/app-*.js', 'dist/assets/react-*.js'],
    // 68 → 68.5 kB (GĐ0, 2026-11-18): getToken/onUnauthorized + gửi lại khi 401 + map chunk tài khoản lười
    // (~0.1–0.3 kB). Phiên khách, Zod, hàng đợi đồng bộ đều nằm ở chunk lười `bootstrap`/`sync`.
    limit: '68.5 kB', gzip: true
  },
  { name: 'CSS toàn app (Tailwind + tokens)', path: 'dist/assets/*.css', limit: '7.5 kB', gzip: true },
  { name: 'M3 Ma trận xưng hô (lazy)', path: 'dist/assets/HonorificScreen-*.js', limit: '15 kB', gzip: true },
  { name: 'M3 Bảng 20 cặp + Radix Dialog (lazy khi mở)', path: 'dist/assets/HonorificExplorerDrawer-*.js', limit: '18 kB', gzip: true },
  { name: 'M2 Luyện thanh điệu (lazy)', path: 'dist/assets/ToneLabRoute-*.js', limit: '9 kB', gzip: true },
  { name: 'M10 Cẩm nang văn hóa (lazy)', path: 'dist/assets/CultureRoute-*.js', limit: '6.5 kB', gzip: true },
  { name: 'M6 Phương ngữ (lazy)', path: 'dist/assets/DialectRoute-*.js', limit: '5 kB', gzip: true },
  { name: 'M5 Luyện tập (lazy)', path: 'dist/assets/DrillRoute-*.js', limit: '8 kB', gzip: true },
  { name: 'M8 Ghép câu (lazy)', path: 'dist/assets/SentenceRoute-*.js', limit: '6 kB', gzip: true },
  { name: 'M11 Làm quen & xếp lớp (lazy)', path: 'dist/assets/OnboardingRoute-*.js', limit: '5 kB', gzip: true },
  { name: 'M9 Tiến độ + ôn thẻ (lazy)', path: 'dist/assets/ProgressRoute-*.js', limit: '5 kB', gzip: true },
  { name: 'M12 Tùy chỉnh (lazy)', path: 'dist/assets/PreferencesRoute-*.js', limit: '5 kB', gzip: true },
  { name: 'M1 Trò chuyện (lazy)', path: 'dist/assets/ChatRoute-*.js', limit: '6 kB', gzip: true },
  { name: 'M7 Nhập vai (lazy)', path: 'dist/assets/RoleplayRoute-*.js', limit: '6 kB', gzip: true },
  { name: 'M4 Camera từ vựng (lazy)', path: 'dist/assets/CameraRoute-*.js', limit: '5 kB', gzip: true },
  { name: 'Worker phân tích cao độ A1/A2', path: 'dist/assets/pitch.worker-*.js', limit: '5 kB', gzip: true }
];
