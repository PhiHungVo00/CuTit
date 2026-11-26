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
    // 64.5 → 67.5 kB (dự án 1 đợt 2, 2026-11-20; trần tối đa spec mục 8.1): thanh 4 tab + bản đồ route (navMap),
    // deviceSettings + ràng buộc giao diện/nhạc, bộ icon (paths), bong bóng Cu Tít (khung), chuyển cảnh. Đã giữ ngoài gói đầu:
    // điều phối âm thanh (nạp lười ở lần chạm đầu), CuTit/ListRow ở chunk riêng, "Tra cứu" của tab Học (lazy);
    // thêm "sideEffects": false cho @vietlearning/ui để Rollup bỏ phần không dùng.
    limit: '67.5 kB', gzip: true
  },
  // 7.5 → 7.8 kB (GĐ2, 2026-11-18): lớp Tailwind mới của nói lại câu / phòng tập thanh / thẻ miền (+13 B lúc đo)
  // 7.8 → 8.1 kB (dự án 1 đợt 1, 2026-11-20): token Cu Tít sáng/tối, bán kính/bóng/thời lượng chuyển động,
  // CSS của CuTit (chuyển động theo trạng thái). Đo sau gộp: 7.83 kB; chừa ~0.3 kB cho đợt 2 (thanh tab, bong bóng).
  // 8.1 → 8.4 kB (dự án 1 đợt 2, 2026-11-20): bong bóng Cu Tít + lời giới thiệu, thanh đổi chế độ màn Cu Tít, danh sách hàng,
  // chuyển cảnh/fade và luật giảm chuyển động (đo 8.35 kB)
  // 8.4 → 8.7 kB (P0-1 soi FE, 2026-11-21): cutit.css thực sự được nạp (trước đó bị bỏ sót nên đo thiếu ~0.25 kB). Nằm trong tệp CSS
  // lười đi cùng chunk CuTit, KHÔNG vào CSS tải đầu (index-*.css giữ nguyên); đo tổng 8.6 kB.
  { name: 'CSS toàn app (Tailwind + tokens)', path: 'dist/assets/*.css', limit: '9.2 kB', gzip: true }, // 8.9 → 9.2 kB (DA1b-P1, 2026-11-22): hoạt ảnh phản hồi + chuyển tư thế Cu Tít + EmptyState (đo 8.97 kB trên Windows, 9.11 kB trên CI Linux; phần lớn ở CSS lười). DA2-T5-6: màn chat Messenger thêm lớp tiện ích (đo 8.76 kB)
  { name: 'M3 Ma trận xưng hô (lazy)', path: 'dist/assets/HonorificScreen-*.js', limit: '15 kB', gzip: true },
  { name: 'M3 Bảng 20 cặp + Radix Dialog (lazy khi mở)', path: 'dist/assets/HonorificExplorerDrawer-*.js', limit: '18 kB', gzip: true },
  { name: 'M2 Luyện thanh điệu (lazy)', path: 'dist/assets/ToneLabRoute-*.js', limit: '9 kB', gzip: true },
  { name: 'M10 Cẩm nang văn hóa (lazy)', path: 'dist/assets/CultureRoute-*.js', limit: '6.5 kB', gzip: true },
  { name: 'M6 Phương ngữ (lazy)', path: 'dist/assets/DialectRoute-*.js', limit: '5 kB', gzip: true },
  { name: 'M5 Luyện tập (lazy)', path: 'dist/assets/DrillRoute-*.js', limit: '8 kB', gzip: true },
  { name: 'M8 Ghép câu (lazy)', path: 'dist/assets/SentenceRoute-*.js', limit: '6 kB', gzip: true },
  { name: 'M11 Làm quen & xếp lớp (lazy)', path: 'dist/assets/OnboardingRoute-*.js', limit: '5 kB', gzip: true },
  // Dự án 1 đợt 2 (2026-11-20): tab Hồ sơ (phương án B) thay màn Tiến độ; Cài đặt mục lục + 7 trang con thay M12;
  // Bạn bè là màn thật (FriendsPanel chuyển từ Tiến độ sang, nằm trong chunk FriendsRoute nên không còn mục riêng). Kế hoạch cho phép ≤ 6 kB mỗi màn. Đo: Cài đặt 5,3 kB, Bạn bè 4,97 kB.
  { name: 'M9 Tiến độ chi tiết: ôn SM-2, 7 ngày, độ chính xác (lazy; đo 2,8 kB)', path: 'dist/assets/ProgressRoute-*.js', limit: '3.5 kB', gzip: true },
  { name: 'M9 Hồ sơ (lazy)', path: 'dist/assets/ProfileRoute-*.js', limit: '5 kB', gzip: true },
  // Dự án 5a Task 3 (2026-11-25): màn Góp ý / Báo lỗi + Góp ý của tôi (mfe-learner + client XHR) và chấm đỏ tab Hồ sơ; cả hai lười, KHÔNG vào gói đầu (đo 4.65 kB và 0.65 kB)
  { name: 'Dự án 5a Góp ý / Báo lỗi + Góp ý của tôi (lazy)', path: 'dist/assets/FeedbackRoute-*.js', limit: '5.3 kB', gzip: true },
  { name: 'Dự án 5a Chấm đỏ góp ý chưa đọc trên tab Hồ sơ (lazy)', path: 'dist/assets/FeedbackDot-*.js', limit: '0.9 kB', gzip: true },
  { name: 'M12 Cài đặt mục lục + trang con (lazy)', path: 'dist/assets/SettingsRoute-*.js', limit: '6 kB', gzip: true },
  { name: 'M1 Trò chuyện (lazy)', path: 'dist/assets/ChatRoute-*.js', limit: '6 kB', gzip: true },
  { name: 'M7 Nhập vai (lazy)', path: 'dist/assets/RoleplayRoute-*.js', limit: '6 kB', gzip: true },
  { name: 'M4 Camera từ vựng (lazy)', path: 'dist/assets/CameraRoute-*.js', limit: '5 kB', gzip: true },
  // GĐ1 Lộ trình (mfe-path + packages/exercises), đo 2026-11-18, mọi chunk đều lazy
  // 3 → 3.3 kB (GĐ2): khung thẻ “miền khác nói thế nào” (nội dung thẻ là chunk DialectCard riêng)
  // 3.3 → 3.4 kB (GĐ4a, 2026-11-18): điểm nạp lười huy hiệu + tổng kết tuần (+33 B lúc đo); nội dung ở chunk Motivation
  // 3.4 → 3.45 kB (R10, 2026-11-18): đo 3.40 kB (+12 B) vì client api-client giờ là chunk lười riêng => thêm một câu
  // `import … from './index-*.js'`; gói đầu đổi lại giảm 4.37 kB. Mã của PathHome không đổi
    // 3.45 → 3.6 kB (Dự án 1 đợt 3, 2026-11-21): thẻ dùng Card/LinkButton chung (style nội tuyến thay lớp Tailwind), +34 B lúc đo
  { name: 'GĐ1 Phần lộ trình của trang chủ (lazy)', path: 'dist/assets/PathHomeRoute-*.js', limit: '3.6 kB', gzip: true },
    // 2.5 → 2.8 kB (DA1b-P1, 2026-11-22): thẻ tổng kết có XP đếm + lời mời ôn lại (đo 2.73 kB), chunk lười
  { name: 'GĐ1 Phiên bài học (lazy)', path: 'dist/assets/LessonRoute-*.js', limit: '2.8 kB', gzip: true },
  { name: 'GĐ1 Ôn tập (lazy)', path: 'dist/assets/ReviewRoute-*.js', limit: '3 kB', gzip: true },
  { name: 'GĐ1 Kiểm tra vượt unit (lazy)', path: 'dist/assets/TestOutRoute-*.js', limit: '2 kB', gzip: true },
  { name: 'Dự án 1 Tab Luyện tập: lối vào 5 cách luyện (lazy)', path: 'dist/assets/PracticeHub-*.js', limit: '2.5 kB', gzip: true },
  { name: 'Dự án 1 Tab Bạn bè (lazy)', path: 'dist/assets/FriendsRoute-*.js', limit: '5.5 kB', gzip: true },
    // Dự án 1 đợt 3: Rollup đặt tên chunk theo module đầu (celebration.ts) thay vì SessionRunner; nội dung không đổi
  { name: 'GĐ1 Trình chạy bài + dạng bài dùng chung (lazy)', path: 'dist/assets/celebration-*.js', limit: '6.5 kB', gzip: true },
  { name: 'GĐ1 Dữ liệu khóa A1 (lazy)', path: 'dist/assets/course-*.js', limit: '8.5 kB', gzip: true },
  { name: 'GĐ1 Bài luyện thanh trong phiên học (lazy khi gặp)', path: 'dist/assets/ToneExercise-*.js', limit: '2.5 kB', gzip: true },
  // GĐ3 Hội thoại AI, đo 2026-11-18 (lazy). Phần chat dùng chung M1/M7/gọi thoại tách thành chunk riêng nên M1 còn ~0.7 kB
  // Task 7 (2026-11-21): +video (khung camera, chụp theo lượt, 14 chuỗi vi+en) nên nâng 5 → 6,5 kB; đo 6,14 kB
  { name: 'GĐ3 Gọi thoại với Cu Tít (lazy)', path: 'dist/assets/CallRoute-*.js', limit: '6.5 kB', gzip: true },
  { name: 'GĐ3 Hội thoại dùng chung: phiên chat + nhập giọng (lazy)', path: 'dist/assets/useChatSession-*.js', limit: '12 kB', gzip: true }, // DA2-T5-6: gộp khung chat, ô soạn, lịch sử, hộp đồng ý AI (đo 11.17 kB; vẫn lazy)
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
  // Dự án 8 Task 5 (2026-11-25): mô-đun cập nhật app, lazy (nạp ở sự kiện load). Chunk `start` = engine + lịch kiểm + kênh;
  // `UpdateLayer` = thẻ nhắc + màn bắt buộc + chuỗi vi/en. Plugin Play (`@capawesome/capacitor-app-update`) và SW web là chunk
  // riêng, chỉ nạp ở kênh tương ứng. Đo: start 2.24 kB, UpdateLayer 2.91 kB (trần của spec cho phần cập nhật: 3.5 kB).
  { name: 'Dự án 8 Kiểm/nhắc cập nhật app: engine (lazy)', path: 'dist/assets/start-*.js', limit: '3.5 kB', gzip: true },
  { name: 'Dự án 8 Giao diện cập nhật app: thẻ nhắc + màn bắt buộc (lazy)', path: 'dist/assets/UpdateLayer-*.js', limit: '3.5 kB', gzip: true }, // Task 7: + thẻ APK/% tải ở màn bắt buộc (đo 3.33 kB)
  // Task 7 (2026-11-25): luồng tự tải/cài APK, chunk riêng chỉ nạp ở kênh `apk` (đo 1.85 kB); cầu nối native là chunk `apkUpdater-*` riêng
  { name: 'Dự án 8 Luồng tự tải và cài APK (lazy, chỉ kênh apk)', path: 'dist/assets/apk-*.js', limit: '2.5 kB', gzip: true },
  // Dự án 4 Task 7 (2026-11-26): mfe-social (chat chữ, tìm bạn, mã mời, cổng tuổi, chặn/báo cáo). Một chunk lười, KHÔNG vào gói đầu, không kéo zod. Đo 12.8 kB (plan: trần 40 kB, đã siết theo số đo).
  { name: 'Dự án 4 Bạn bè: chat chữ + tìm bạn + cổng tuổi (lazy)', path: 'dist/assets/SocialRoute-*.js', limit: '13.5 kB', gzip: true },
  { name: 'Dự án 4 Chỗ giữ Sắp có cho /goi/:callId (lazy, Task 15 thay)', path: 'dist/assets/SocialSoonRoute-*.js', limit: '0.9 kB', gzip: true }
];
