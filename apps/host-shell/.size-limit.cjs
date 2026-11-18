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
    // 68.5 → 64.5 kB (R10, 2026-11-18): đo 68.49 → 64.12 kB. @capacitor/core ra khỏi gói đầu (nhận biết nền tảng
    // bằng native/platform.ts) và client api-client (request/SSE/lỗi) thành chunk lười; gói đầu chỉ giữ
    // `@vietlearning/api-client/config`. Dư ~0.4 kB. Đo lại theo module: pnpm --filter @vietlearning/host-shell analyze
    limit: '64.5 kB', gzip: true
  },
  // 7.5 → 7.8 kB (GĐ2, 2026-11-18): lớp Tailwind mới của nói lại câu / phòng tập thanh / thẻ miền (+13 B lúc đo)
  { name: 'CSS toàn app (Tailwind + tokens)', path: 'dist/assets/*.css', limit: '7.8 kB', gzip: true },
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
  // GĐ1 Lộ trình (mfe-path + packages/exercises), đo 2026-11-18, mọi chunk đều lazy
  // 3 → 3.3 kB (GĐ2): khung thẻ “miền khác nói thế nào” (nội dung thẻ là chunk DialectCard riêng)
  // 3.3 → 3.4 kB (GĐ4a, 2026-11-18): điểm nạp lười huy hiệu + tổng kết tuần (+33 B lúc đo); nội dung ở chunk Motivation
  // 3.3 → 3.4 kB (GĐ4b, 2026-11-18): giờ nhắc học chỉ xem ở hồ sơ trẻ (đo 3.31 kB)
  // 3.4 → 3.45 kB (R10, 2026-11-18): đo 3.40 kB (+12 B) vì client api-client giờ là chunk lười riêng => thêm một câu
  // `import … from './index-*.js'`; gói đầu đổi lại giảm 4.37 kB. Mã của PathHome không đổi
  { name: 'GĐ1 Phần lộ trình của trang chủ (lazy)', path: 'dist/assets/PathHomeRoute-*.js', limit: '3.45 kB', gzip: true },
  { name: 'GĐ1 Phiên bài học (lazy)', path: 'dist/assets/LessonRoute-*.js', limit: '2.5 kB', gzip: true },
  { name: 'GĐ1 Ôn tập (lazy)', path: 'dist/assets/ReviewRoute-*.js', limit: '3 kB', gzip: true },
  { name: 'GĐ1 Kiểm tra vượt unit (lazy)', path: 'dist/assets/TestOutRoute-*.js', limit: '2 kB', gzip: true },
  { name: 'GĐ1 Khám phá: 12 công cụ (lazy)', path: 'dist/assets/Explore-*.js', limit: '2.5 kB', gzip: true },
  { name: 'GĐ1 Trình chạy bài + dạng bài dùng chung (lazy)', path: 'dist/assets/SessionRunner-*.js', limit: '6.5 kB', gzip: true },
  { name: 'GĐ1 Dữ liệu khóa A1 (lazy)', path: 'dist/assets/course-*.js', limit: '8.5 kB', gzip: true },
  { name: 'GĐ1 Bài luyện thanh trong phiên học (lazy khi gặp)', path: 'dist/assets/ToneExercise-*.js', limit: '2.5 kB', gzip: true },
  // GĐ3 Hội thoại AI, đo 2026-11-18 (lazy). Phần chat dùng chung M1/M7/gọi thoại tách thành chunk riêng nên M1 còn ~0.7 kB
  { name: 'GĐ3 Gọi thoại với Cu Tít (lazy)', path: 'dist/assets/CallRoute-*.js', limit: '5 kB', gzip: true },
  { name: 'GĐ3 Hội thoại dùng chung: phiên chat + nhập giọng (lazy)', path: 'dist/assets/useChatSession-*.js', limit: '10 kB', gzip: true },
  { name: 'GĐ3 Tổng kết + thêm ôn tập (lazy)', path: 'dist/assets/SessionSummary-*.js', limit: '1.5 kB', gzip: true },
  { name: 'Worker phân tích cao độ A1/A2', path: 'dist/assets/pitch.worker-*.js', limit: '5 kB', gzip: true },
  // GĐ2 (đo 2026-11-18), mọi chunk đều lazy
  { name: 'GĐ2b Dựng bài (build.ts) + dữ liệu tình huống/truyện, chỉ lộ trình tải (lazy)', path: 'dist/assets/build-*.js', limit: '5.5 kB', gzip: true },
  { name: 'GĐ2b Truyện ngắn nghe + câu hỏi hiểu (lazy khi gặp)', path: 'dist/assets/StoryExercise-*.js', limit: '2 kB', gzip: true },
  { name: 'GĐ2 Nói lại câu A3 (lazy khi gặp)', path: 'dist/assets/SpeakExercise-*.js', limit: '3.9 kB', gzip: true },
  { name: 'GĐ2 Phòng tập thanh điệu (lazy)', path: 'dist/assets/ToneGymRoute-*.js', limit: '5.8 kB', gzip: true },
  { name: 'GĐ2 Thẻ miền (lazy khi mở)', path: 'dist/assets/DialectCard-*.js', limit: '1.5 kB', gzip: true },
  { name: 'GĐ2 Phát âm thanh dựng sẵn theo miền', path: 'dist/assets/coursePlayer-*.js', limit: '1.5 kB', gzip: true },
  // GĐ4a (đo 2026-11-18): huy hiệu theo thành thạo + tổng kết tuần + thông báo nhẹ, lazy
  { name: 'GĐ4 Huy hiệu + tổng kết tuần (lazy)', path: 'dist/assets/Motivation-*.js', limit: '3.5 kB', gzip: true },
  { name: 'GĐ2 A7 đổi từ theo miền', path: 'dist/assets/dialectMap-*.js', limit: '2 kB', gzip: true },
  // GĐ4c Bạn học hợp tác (đo 2026-11-18: 4.52 kB, gồm contract Zod /v1/friends + chuỗi vi/en), lazy khi bấm mở ở M9
  { name: 'GĐ4c Bạn học: mã mời + nhiệm vụ tuần chung (lazy)', path: 'dist/assets/FriendsPanel-*.js', limit: '5 kB', gzip: true }
];
