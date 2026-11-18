# Nhật ký GĐ1 — Vòng lặp học cốt lõi (Lộ trình)

> Nhánh `claude/gd1-lo-trinh-7a52e9` (dựng trên `9300083`). Plan chi tiết: `docs/superpowers/plans/2026-11-17-gd1-lo-trinh.md`.
> Kế hoạch tổng: `docs/KE_HOACH_PHAT_TRIEN_TOAN_DIEN.md` mục 5 (GĐ1). Nhật ký riêng để không xung đột với phiên GĐ0.
> Mức bằng chứng: 🟢 đã chạy · 🔵 đọc code.

## 0. Baseline trước khi sửa (2026-11-17) 🟢
`pnpm build` 17/17 · `pnpm test` 31/31 task · `pnpm lint:boundaries` 0 vi phạm (213 module) · e2e 47/47 ·
**tải ban đầu 67.88 / 68 kB** (nhật ký cũ ghi 66.3 kB — đã tăng từ trước GĐ1; chỉ còn 0.12 kB dư).

## 1. Đã làm (theo 6 điểm của brief)

| # | Việc | Commit | Ghi chú |
|---|---|---|---|
| 1 | Mô hình khóa học `Course → Unit → Lesson → ExerciseRef` + 3 unit A1 | `7193a6c` | `packages/content/src/course/course.ts`, `data/course/{unit-1,2,3,words,sentences}.json`. 12 bài (8–11 câu/bài), 3 bộ kiểm tra vượt (10 câu). **49 từ mới (`w*`) + 11 câu mới (`cs*`), tất cả `reviewed:false`** (D8). Câu mới để riêng vì test A8 ghim đúng 60 câu cũ. Có dứa/thơm/khóm (d3 + ghi chú từ `w32`). Test toàn vẹn tham chiếu: `packages/content/test/course.test.mjs`. |
| 5 | Luật nghiệp vụ `packages/state/src/gamification.ts` + store `progress.ts` | `0f78a85` | Xem mục 2. |
| 2 | `packages/exercises` (R6) | `641fa58` | `buildItem(ref, seed)` + `ChoiceExercise` (nghĩa, nghe chọn, điền từ, đại từ A6, từ theo miền A7), `SentenceExercise` (A8), `ToneExercise` (A1/A2, lazy). Chuyển bằng `git mv` từ M2/M8: `useToneRecorder`, `ContourChart`, `toneAnalyzer`, `pitch.worker`, `verdict`, `useSentenceBuilder`, Memento — kèm test. M2/M8 nay import từ package. Package dùng dạng mã nguồn (như MFE) để Vite đóng gói Worker. Dạng “nói lại câu” (A3) để GĐ2. |
| 3, 4 | `apps/mfe-path` + trang chủ mới + Khám phá | `10edceb` | Xem mục 3. |
| 6 | Nhắc học cục bộ | `ae7c38c` | Xem mục 4. |

## 2. Luật nghiệp vụ (D5 — không phải thuật toán mới, không thuộc A1–A8)
- **XP/bài** = 10 + round(10 × tỉ lệ đúng ngay lần đầu) + 5 nếu đúng hết (10–25). Kiểm tra vượt đạt = 30. Ôn thẻ = 1 XP/thẻ nhớ được. ⇒ thưởng theo độ chính xác, không chỉ số bài.
- **Mục tiêu ngày** 5/10/15/20 phút (mặc định 10), đo bằng giây học thực (`useStudyTimer` sẵn có).
- **Streak** = `computeStreak` sẵn có trên tập “ngày đã học” = có giờ học ∪ có XP ∪ ngày được đóng băng.
- **Đóng băng**: mỗi 5 bài xong +1, tối đa 2, không bán. Khi mở lộ trình, nếu lỡ ≤ số đóng băng đang có thì tự dùng; gọi nhiều lần trong ngày không trừ lại (lưu `frozenDays`); lỡ nhiều hơn số đóng băng thì không tiêu.
- **Lịch tuần** Thứ Hai → CN: đã học / đóng băng / chưa học / hôm nay.
- **Persist**: store RIÊNG khóa `becutit.progress`, `version: 1`, `migrate` = `migrateProgress` (chuẩn hóa bản lưu cũ/hỏng: mục tiêu lạ → 10, đóng băng kẹp [0,2], giờ nhắc ra ngoài 22h–7h). Xuất qua subpath `@vietlearning/state/progress` nên không vào bundle đầu. `index.ts` chỉ đổi 1 dòng (`export` cho `safeStorage`) để không xung đột với `sync.ts` của GĐ0. Lý do không nâng version của `becutit.learner`: tránh đụng bản lưu và phần đồng bộ GĐ0 đang làm. Nút “xóa dữ liệu” (M12) xóa cả store này và hủy lịch nhắc.

## 3. Lộ trình (`apps/mfe-path`, D6 — lệch có chủ đích so với 6 MFE của TDD)
- **Trang chủ** (`/`): Host giữ tiêu đề, nút đổi ngôn ngữ, dòng trình độ, banner làm quen (tùy chọn, đặt cuối); phần lộ trình là chunk lazy, bắt đầu tải ngay khi module Home được đánh giá, có **skeleton** `aria-busy`. Trong chunk: 🔥 chuỗi · ⭐ XP · ❄️ đóng băng + mục tiêu hôm nay, **một nút chính “Học tiếp”** (người mới: “Bắt đầu bài đầu tiên”), thẻ **“Ôn hôm nay (n)”**, lịch tuần, bản đồ 3 unit (mọi bài mở, bài tiếp theo được tô), “Kiểm tra để vượt unit”, bảng “Mục tiêu & nhắc học”.
- **Phiên bài học** `/bai-hoc/:lessonId`: thanh tiến độ, phản hồi đúng/sai + giải thích ngay, câu sai quay lại cuối phiên (tối đa 2 lần để phiên luôn kết thúc), **không tim/năng lượng**. Bài nghe/nói có “Không nghe/nói được lúc này” — bỏ qua, không tính sai. Bài đầu tiên không có nghe/nói. Mỗi câu ghi `recordAttempt` (M9), câu sai → thẻ SM-2 `path:<khóa>` + “lỗi gần đây”, điểm thanh → `toneStats`.
- **Tổng kết**: XP, % đúng lần đầu, từ trong bài, thanh cần luyện, đóng băng vừa kiếm, nút “Học tiếp: …”.
- **Ôn tập** `/on-tap` (tab): thẻ đến hạn (A4, lật thẻ, Quên/Khó/Nhớ), lỗi gần đây (làm lại; đúng ngay lần đầu mới xóa khỏi danh sách), thanh điệu yếu nhất (3 câu luyện thanh đó).
- **Kiểm tra vượt unit** `/kiem-tra/:unitId`: bộ 10 câu cố định, không làm lại câu sai, ≥ 80% ⇒ mọi bài của unit tính là xong. Chưa đạt: lời trung tính, bài vẫn mở, thử lại bất cứ lúc nào. *Không tái hiện A5 ở client* (A5 nằm ở Gateway, không được sửa) — chỉ là ngưỡng đạt trên bộ câu cố định.
- **Khám phá** `/kham-pha` (tab, lazy): đủ 12 thẻ công cụ M1–M12 như trang chủ cũ. Tên + mô tả dài của 12 công cụ chuyển sang `src/exploreI18n.ts` (chunk Khám phá).
- **Thanh tab**: Học · Ôn tập · Xưng hô · Phát âm · Khám phá (Hội thoại, Luyện tập vào Khám phá).

## 4. Nhắc học cục bộ
- `packages/native/src/reminders.ts`: `getLocalReminders()` bọc `@capacitor/local-notifications@7.0.7` (import động); web ⇒ `supported()=false` ⇒ ẩn tùy chọn.
- `apps/mfe-path/src/reminders.ts`: `planReminders` đặt 7 mốc một lần (id 7001–7007) tại giờ người học chọn, kẹp ngoài 22:00–07:00; **đã đạt mục tiêu hôm nay ⇒ bỏ mốc hôm nay**; đặt lại khi mở lộ trình, xong bài, đổi cài đặt. Quyền thông báo **chỉ xin khi bấm “Bật nhắc”** (test khẳng định không xin lúc mount). Lời nhắc trung tính, song ngữ, có test cấm từ gây tội lỗi.
- `cap sync android` 🟢 liệt kê `@capacitor/local-notifications@7.0.7`.

## 5. Kết quả kiểm tra cuối (2026-11-18) 🟢
- `pnpm build` 19/19 · `pnpm test` **35/35 task** · `pnpm lint:boundaries` **0 vi phạm (355 module)**.
- Test mới: content +6 (course), state +11 (gamification/store), exercises 23 (5 file, gồm 3 file chuyển từ M2/M8), mfe-path 19 (session, path model, review model, nhắc học), speech-lab 1 (M6, thay test đã chuyển đi).
- size-limit: **tải ban đầu 67.33 / 68 kB** (giảm từ 67.88 nhờ chuyển lưới 12 công cụ + nhãn dài sang chunk Khám phá) — **không nâng ngân sách**. CSS 7.22 / 7.5 kB. Thêm 8 mục ngân sách cho chunk GĐ1 (trang chủ lộ trình 2.3 kB, bài học 1.4, ôn tập 2.0, kiểm tra vượt 1.0, Khám phá 1.9, trình chạy bài 5.0, dữ liệu khóa A1 6.8, bài luyện thanh 1.7 kB gzip).
- e2e **57/57** (47 cũ + 10 mới ở `e2e/path.spec.ts`, mỗi kịch bản chạy trên Pixel 7 và màn 320 px): người mới xong bài đầu tiên **~4–6 giây** (yêu cầu < 60 s) không đăng ký; đi hết 4 bài unit 1 rồi “Học tiếp” trỏ sang unit 2; XP + chuỗi còn sau tải lại; hôm sau (đồng hồ giả) chuỗi vẫn 1 và thẻ ôn đến hạn, ôn được; kiểm tra vượt unit; giao diện tiếng Anh ở 320 px không tràn, vùng chạm ≥ 44 px.
- **Sửa e2e cũ (1 chỗ, do yêu cầu đổi trang chủ):** `app.spec.ts` “trang chủ: …” — kiểm 12 `.screen-card` nay ở tab Khám phá thay vì `/`; các khẳng định khác giữ nguyên.
- Hiệu năng M3 (CPU chậm 4×): 859 ms (baseline) → 1004–1186 ms qua các lần chạy sau GĐ1, vẫn < 1500 ms. Có thể do thêm tab/chunk hoặc do máy bận (chạy song song phiên khác) — cần theo dõi.
- `playwright.config.ts`: cổng lấy từ `E2E_PORT` (mặc định 4173) để không dùng nhầm server của worktree khác.
- Ảnh: `docs/nhat-ky/img/gd1-trang-chu-moi.png`, `gd1-trang-chu-en-320.png`, `gd1-bai-hoc.png`, `gd1-kham-pha.png`.

## 5b. Android emulator (AVD `BeCuTit_Pixel_API35`, API 35) 🟢
- APK debug build bằng `build-apk.ps1 -Drive Q:` (ổ ảo khác `B:` để không đụng phiên GĐ0), cài, xóa dữ liệu app, mở: trang chủ lộ trình hiện đúng (máy tiếng Anh ⇒ giao diện tiếng Anh), 5 tab vừa thanh dưới — `img/gd1-emulator-trang-chu.png`.
- Mở “Goal & reminders”: tùy chọn nhắc CÓ hiện trên app (web thì ẩn). Trước khi bấm, cửa sổ đang focus vẫn là MainActivity; bấm “Turn on reminders” ⇒ hộp xin quyền `GrantPermissionsActivity` (POST_NOTIFICATIONS) — `img/gd1-emulator-xin-quyen.png`. Cho phép ⇒ `dumpsys alarm` có **7 mốc** của `vn.edu.uit.becutit` (TimedNotificationPublisher), 19:00 từ 18/11 tới 24/11 — `img/gd1-emulator-da-bat-nhac.png`.
- **Lỗi chỉ thấy trên máy:** lần đầu bấm “Bật nhắc” không có hộp thoại, logcat: `"LocalNotifications.then()" is not implemented on android` — trả proxy plugin từ hàm async (cùng lỗi đã gặp ở `speech.ts`). Sửa: bọc plugin trong object thường trước khi trả.
- Chưa thử trên emulator: luồng một bài học đầy đủ bằng tay (đã có e2e trên Chrome mobile), thông báo hiện thật lúc 19:00.

## 6. Lỗi gặp và cách sửa
- Từ tổng kết bấm “Học tiếp” sang bài khác vẫn thấy tổng kết cũ (React giữ instance khi chỉ đổi tham số route) ⇒ `key={lessonId}` / `key={unitId}`. Bắt được nhờ e2e “đi hết unit 1”.
- “Lỗi gần đây” bị xóa ngay khi làm đúng lúc câu quay lại trong cùng phiên ⇒ chỉ xóa khi đúng ngay lần đầu ở phiên sau.
- Thẻ SM-2 từ câu sai đến hạn **ngày mai** (đúng hành vi A4: `reviewCard(q=1)` ⇒ 1 ngày), nên “Ôn hôm nay” ngay sau bài đầu là 0; câu sai xuất hiện ngay ở “Lỗi gần đây”.
- `mfe-speech-lab` không còn test sau khi chuyển ⇒ vitest báo lỗi “no test files” ⇒ thêm test M6 thật (tìm không dấu + lưu thẻ ôn).

## 6b. Sửa sau rà soát
- Nhắc học theo dõi bộ đếm giờ học: vừa đạt mục tiêu là bỏ mốc hôm nay (không cần mở lại lộ trình).
- Bài chọn đại từ không còn lấy “tôi”, cách xưng của cặp khác cùng người nghe, hay “con” (khi đáp án “cháu”) làm nhiễu — vì đó cũng là câu trả lời chấp nhận được.
- Ghi chú từ có bản tiếng Anh (`noteEn`). Chunk lộ trình chỉ tải trước khi mở app ở `/`.

## 7. Chưa làm / để sau
- Dạng “nói lại câu” (A3) — chờ R5 (A3 thật) ở GĐ2.
- Nhiệm vụ ngày/tháng (bảng 3.1b) chưa làm trong GĐ1.
- Đồng bộ `becutit.progress` lên server — việc của GĐ0 (`xp_events`, `daily_activity`, `lesson_progress`); ghi chú bàn giao ở thư mục ghi chú chung.
- Nội dung 3 unit cần người bản ngữ duyệt (`reviewed:false`).
- Thử thông báo thật trên máy thật (Android 13+ hỏi quyền POST_NOTIFICATIONS; báo thức chính xác chưa xin `SCHEDULE_EXACT_ALARM` ⇒ có thể trễ vài phút — chấp nhận được cho lời nhắc học).
