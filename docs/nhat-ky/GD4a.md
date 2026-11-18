# GĐ4a — Huy hiệu theo thành thạo, tổng kết tuần, nút đọc chậm 🐢

> Nhánh `claude/gd4-huy-hieu-30d92f` (chưa merge vào main). Kế hoạch: `docs/KE_HOACH_PHAT_TRIEN_TOAN_DIEN.md` mục 5, GĐ4 việc 1 và 2, cộng D9 mục 6.
> Làm song song với hai phiên khác: chế độ trẻ em (migration 0003) và nhiệm vụ bạn bè (0004). Phiên này **không sửa schema DB, không thêm migration, không đổi contract**.

## 1. Quyết định

| # | Quyết định | Lý do |
|---|---|---|
| G1 | Điều kiện huy hiệu **suy ra** từ dữ liệu có sẵn. Lúc đạt thì **ghi thời điểm** vào store tiến độ (`badges`) | Nếu chỉ suy ra thì huy hiệu có thể mất: điểm trung bình thanh tụt xuống dưới 80, hoặc thẻ SM-2 bị đặt lại khoảng ôn khi ôn sai. Yêu cầu là “không có huy hiệu mất đi” |
| G2 | Đồng bộ huy hiệu qua sự kiện `achievement.earn` + bảng `achievements` **đã có từ GĐ0** (`0000_init`, `repo.ts`, `snapshot.achievements`) | Không cần bảng hay migration mới, không đổi contract (Nguyên tắc 5 vẫn giữ). Phía client trước đây chưa gửi và chưa áp phần này; nay bóng tiến độ có thêm `badges`, bản ghi cũ thiếu trường này thì coi như rỗng |
| G3 | Huy hiệu về từ server được đánh dấu `seen: true` | Khôi phục trên máy mới thì không thông báo lại những huy hiệu cũ |
| G4 | 8 huy hiệu theo thành thạo, không có huy hiệu nào theo số ngày: **Sáu thanh vững** (cả 6 thanh trung bình ≥ 80, mỗi thanh ít nhất 3 lượt), **Trí nhớ bền** (25 thẻ có khoảng ôn ≥ 21 ngày), **Kho từ vững chắc** (100 thẻ như vậy), **Xong unit 1/2/3** (xong mọi bài hoặc đã vượt unit), **Nói được tình huống** (bài nhập vai đạt ≥ 60%: màn nhập vai ghi `best` = số nhiệm vụ đã xong / tổng nhiệm vụ khi bấm kết thúc, và không có ngưỡng “đạt” riêng; 60% = làm được đa số nhiệm vụ), **Vượt rào** (đạt bài kiểm tra vượt unit) | Bám sát kế hoạch mục 3.2: thưởng cho thành thạo, không thưởng cho việc cày. Ngưỡng tối thiểu 3 lượt để một lần ăn may không đủ đạt |
| G5 | Luật nằm trong `packages/state/src/badges.ts` dưới dạng hàm thuần. Dữ liệu khóa học (unit, bài nhập vai, 6 thanh) do MFE truyền vào (`apps/mfe-path/src/motivation/facts.ts`) | Package `state` không phụ thuộc `content`. Đây là luật game, không phải thuật toán học, nên không tính vào danh mục A1–A8 (giống XP/streak, quyết định D5) |
| G6 | Không gắn lệnh trao huy hiệu rải rác ở từng chỗ gọi. Thay vào đó, component lười **đăng ký theo dõi** cả hai store và trao huy hiệu khi dữ liệu đổi | Ôn thẻ xảy ra ở 3 màn khác nhau, nhập vai nằm ở MFE khác. Trang chủ lộ trình bắt hết mọi trường hợp, cả khi đạt huy hiệu ở màn khác rồi quay về |
| G7 | Thông báo nhẹ: một dòng `role="status"` “🏅 Huy hiệu mới: …” và nút “Đã xem”. Không pháo hoa, không âm thanh. Hiện ở trang chủ lộ trình, màn tổng kết bài và màn kiểm tra vượt unit | Đúng yêu cầu “không ồn ào” |
| G8 | Tổng kết tuần đặt ở **trang chủ lộ trình** (`mfe-path`), không đặt ở M9 | `mfe-path` đã có dữ liệu khóa học; M9 (`mfe-learner`) không phụ thuộc `content`. Trang chủ là nơi người học mở mỗi ngày nên thông báo huy hiệu được thấy ngay |
| G9 | Lịch sử cho tổng kết tuần nằm **trên máy**, không đồng bộ: `lessonsByDay` (số bài xong theo ngày, giữ 70 ngày), `knownAt` (ngày một thẻ “đã thuộc”, tức khoảng ôn ≥ 6 ngày, tính bằng hạn ôn trừ khoảng ôn), `toneWeek` (điểm thanh tích lũy lúc bắt đầu tuần) | Trước đây không có dữ liệu theo thời gian cho điểm thanh, bài đã xong và từ đã thuộc (`toneStats` chỉ cộng dồn, `lessons[id].at` chỉ giữ lần gần nhất). Phút học (`activity`) và XP (`xpByDay`) vốn đã có theo ngày và đã đồng bộ. Khi đổi tài khoản thì ba trường mới bị xóa (cùng chỗ với `mistakes`/`toneStats`) |
| G10 | “Thanh tiến bộ nhất” = thanh có **điểm trung bình tuần này cao hơn điểm trung bình trước tuần này** nhiều nhất. Chỉ tính khi điểm tăng | Chỉ cần một mốc lưu đầu tuần. Không so với người khác (không có bảng xếp hạng, D7). Chưa có tuần trước thì ghi rõ “Chưa có số liệu tuần trước” |
| G11 | Nút 🐢 phát âm thanh dựng sẵn ở `playbackRate` **0,75** với `preservesPitch = true` đặt rõ ràng. Khi dùng TTS của máy thì `rate = speechRate(0,85 × 0,75)` | Nhiệm vụ yêu cầu 0,75 (ghi chú D9 mục 6 viết 0,8; theo nhiệm vụ). Giữ cao độ để thanh điệu không bị méo. Không phải tạo lại âm thanh |
| G12 | Nút 🐢 có trong 4 dạng bài có nút nghe của `packages/exercises`: chọn/nghe chọn, luyện thanh, nói lại câu, ghép câu (sau khi đúng) | Nút nghe riêng của các MFE cũ (M5, M9, M4, chat) nằm ngoài phạm vi nên để lại |

## 2. Tệp chính

- `packages/state/src/badges.ts` (mới): `badgeStatuses`, `newlyEarned`, `weeklySummary`, `weekStart`, `knownDay`
- `packages/state/src/gamification.ts`: `ProgressData` thêm `badges`, `lessonsByDay`, `knownAt`, `toneWeek`. `migrateProgress` chuẩn hóa các trường này; bản lưu cũ vẫn hợp lệ, không cần tăng version
- `packages/state/src/progress.ts`: `awardBadges`, `markBadgesSeen`, `noteKnownWords`. `recordTone(tone, score, now)` chốt mốc đầu tuần; `completeLesson` đếm bài theo ngày. `partialize` lưu đủ các trường mới
- `packages/state/src/sync.ts`: gửi `achievement.earn` theo chênh lệch so với bóng; áp `snapshot.achievements` (lấy hợp, giữ huy hiệu của máy này)
- `packages/exercises/src/audio/coursePlayer.ts` (`playText(text, dialect, { slow })`, `SLOW_RATE`), `audio/SlowButton.tsx`
- `apps/mfe-path/src/motivation/` (chunk lười `Motivation`): `BadgeNotice`, `MotivationPanel`, `facts.ts`, `i18n.ts` (vi + en; tách khỏi `src/i18n.ts` để nằm trong chunk lười)
- `apps/host-shell/e2e/gd4.spec.ts` (mới)

## 3. Ngân sách bundle

- Tải ban đầu **không đổi**: 68,42/68,5 kB. Không có gì thêm vào `packages/state/src/index.ts`
- `PathHomeRoute` 3,3 → **3,4 kB**: lúc đo vượt 33 B, là phần điểm nạp lười (`lazy(() => import('./motivation/Motivation'))` + 2 `Suspense`). Trước khi nâng đã gộp hai lệnh lazy thành một export mặc định (từ +67 B xuống +41 B) và bỏ khung chờ (xuống +33 B)
- Mục mới `GĐ4 Huy hiệu + tổng kết tuần (lazy)`: `Motivation-*.js` đo được 3,23 kB, đặt ngưỡng 3,5 kB
- CSS 7,62/7,8 kB

## 4. Kiểm chứng

- TDD: viết test trước rồi mới viết mã. Đã thấy đỏ trước khi viết mã ở test state (3 test đồng bộ), test coursePlayer (2 test) và test nút 🐢
- `packages/state`: 50/50 (thêm 11 test huy hiệu/tuần và 4 test đồng bộ huy hiệu, trong đó có test cho lỗi do advisor phát hiện: huy hiệu được trao ngay trong lúc áp ảnh chụp từng bị bóng coi như đã gửi, nên không bao giờ lên server)
- Bố cục 320 px của bài nói có 🐢: `gd2.spec` `assertMobileLayout` (đã pass ở project `android-nho-320`)
- `packages/exercises`: 39/39
- `apps/mfe-path`: 29/29 (thêm 7 test giao diện)
- `pnpm build` 19/19 · `pnpm test` 35/35 task · `pnpm lint:boundaries` 0 vi phạm (366 module) · `size` không mục nào vượt
- e2e `gd4.spec.ts` (Gateway thật PGlite, cổng 4011/4184):
  - vượt unit 1 → thông báo → bấm “Đã xem” → tải lại thì không báo nữa; danh sách ghi “Đã có / 0/5 · còn 5”
  - tổng kết tuần, có so với tuần trước
  - giao diện tiếng Anh
  - nút 🐢 có vùng chạm ≥ 44 px
  - huy hiệu lên server, khôi phục ở hồ sơ trình duyệt mới vẫn còn và không báo lại
- Toàn bộ e2e (`E2E_PORT=4184 E2E_GATEWAY_PORT=4011`, host build với `VITE_GATEWAY_URL=http://localhost:4011`): **86 passed, 7 skipped, 0 failed** (2,3 phút). Các test bị skip đều là test chỉ chạy ở pixel-7 hoặc perf, giống như trước

## 5. Còn mở

- Lịch sử tổng kết tuần chỉ có trên máy (G9). Trên máy mới, “tuần trước” của bài/từ/điểm thanh bắt đầu lại từ 0; phút học và XP thì vẫn đúng vì đã đồng bộ
- Phòng tập thanh (`becutit.toneGym`, GĐ2) chưa cộng vào `toneStats`, nên chưa góp vào huy hiệu “Sáu thanh vững” hay “thanh tiến bộ nhất”
- Nút nghe riêng của M5/M9/M4/chat chưa có 🐢
- Khi merge cùng hai phiên GĐ4 khác: dễ xung đột ở `progress.ts`, `gamification.ts` (danh sách trường của `ProgressData`), `sync.ts` (`applyProgress`) và `.size-limit.cjs`. Xử lý bằng cách giữ cả hai bên, vì mọi thay đổi ở đây chỉ là thêm vào
