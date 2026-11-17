# Kế hoạch phát triển toàn diện — Bé Cu Tít

> Ngày lập: 2026-11-17 · Nhánh: `claude/vibes-code-dev-plan-bab6ca` (dựng trên `claude/mobile-optimization-review-6ef57e` @ `fae069d`)
> Đầu vào: (1) bộ slide *“Công nghệ cơ bản cho vibe coder”* (vibecoder.fyi, 30 slide, 9 chủ đề); (2) nghiên cứu Duolingo và các app học ngôn ngữ dạng game (nguồn ở mục 9); (3) kiểm tra lại toàn bộ repo.
> Đây là **lộ trình tổng** (roadmap). Mỗi giai đoạn khi bắt đầu sẽ có plan chi tiết riêng dạng task + test trong `docs/superpowers/plans/`, và mọi bước xong đều ghi vào `docs/NHAT_KY_CHUYEN_DOI_MOBILE.md`.
> Mức bằng chứng: 🟢 đã chạy · 🔵 đọc code · ⚪ nguồn ngoài (blog/review, chưa kiểm chứng độc lập).

---

## 0. Tóm tắt (đọc phần này là đủ)

1. **App đã có “đồ nghề” rất tốt nhưng chưa có “lộ trình học”.** 12 màn hình M1–M12 đều chạy, có AI thật (Gemini), Android APK, offline, song ngữ. Nhưng trang chủ là **lưới 12 thẻ công cụ** 🔵 `apps/host-shell/src/screens/Home.tsx` — người học tự đoán nên làm gì hôm nay. Duolingo giữ chân người dùng bằng **một việc rõ ràng mỗi ngày**; đó là khoảng trống lớn nhất, lớn hơn cả XP hay huy hiệu.
2. **Theo checklist của slide, thiếu nhất là mục 03 (database) và 06 (tài khoản/quyền).** Gateway **không có database** 🔵 (không có drizzle/pg trong `apps/gateway/package.json`, không có migration); `packages/contracts/src/db/schema.ts` chưa được dùng; `/srs/due`, `/analytics/summary`, `GET/PUT /preferences` trả **dữ liệu giả** (`streakDays: 5`). Mọi tiến độ chỉ nằm trong `localStorage` của một máy ⇒ đổi máy/xóa app là mất; không làm được bạn bè, bảng xếp hạng, đồng bộ.
3. **Có một lỗi chặn phát hành:** ở `NODE_ENV=production`, `AUTH_REQUIRED` mặc định bật 🔵 `apps/gateway/src/config.ts:55` nhưng **không có endpoint nào cấp JWT** và Host không bao giờ cấu hình `getToken` cho api-client 🔵 (`apps/host-shell/src/main.tsx:18`, `packages/api-client/src/index.ts:96`) ⇒ bản release sẽ nhận 401 cho mọi tính năng AI. Ở dev thì ngược lại: ai trong mạng LAN cũng dùng được khóa Gemini (principal `anon:<ip>`).
4. **A3 (chấm phát âm) vẫn là mock** 🔵 `apps/gateway/src/routes/speech.ts:67` trả cố định `score: 92` — nhật ký chưa ghi điều này.
5. **Không copy nguyên Duolingo.** Lấy: lộ trình + bài 3–5 phút, mục tiêu ngày, streak có “đóng băng”, ôn tập SRS, nhân vật, nhắc nhở. **Không lấy:** tim/năng lượng (giới hạn số lần sai/số câu), bảng xếp hạng có xuống hạng, thông báo gây tội lỗi, lộ trình khóa cứng. Điểm khác biệt phải là thứ Duolingo/Ling làm kém với tiếng Việt: **thanh điệu, phương ngữ 3 miền, xưng hô** — ta đã có thuật toán A1/A2/A6/A7 cho đúng những thứ đó.

**Thứ tự đề xuất:** GĐ0 Nền móng (DB + tài khoản khách + đồng bộ + dọn nhánh) → GĐ1 Vòng lặp học cốt lõi (lộ trình, bài học, XP, mục tiêu ngày, streak, nhắc) → GĐ2 Kỹ năng đặc thù tiếng Việt → GĐ3 Hội thoại AI → GĐ4 Động lực xã hội (tùy chọn) → GĐ5 Phát hành có trách nhiệm.
GĐ1 có thể làm **song song** GĐ0 vì chạy được hoàn toàn trên dữ liệu local hiện có (`activity`, `attempts`, `srs`).

---

## 1. Hiện trạng đã kiểm chứng

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Nhánh | `main` (`f821334`) **chậm 43 commit** so với `claude/mobile-optimization-review-6ef57e`; mọi việc mobile/AI/i18n chưa merge. Repo **không có remote** ⇒ không có bản sao lưu ngoài máy, CI chưa từng chạy | 🟢 `git log main..`, `git remote -v` rỗng |
| Build / test | Xem mục 1b (chạy lại trong phiên này) | 🟢 |
| Màn hình | M1 chat SSE, M2 thanh điệu (A1/A2 thật), M3 xưng hô (A6), M4 camera (Gemini vision), M5 luyện tập (sinh theo mẫu), M6 phương ngữ (A7), M7 nhập vai, M8 ghép câu (A8), M9 tiến độ + ôn SM-2 (A4), M10 văn hóa (RAG), M11 làm quen + xếp lớp (A5), M12 tùy chỉnh | 🔵 `apps/host-shell/src/routes.tsx` |
| Dữ liệu người học | Zustand + `localStorage` key `becutit.learner` (hồ sơ, tùy chỉnh, thẻ SRS, 1000 lượt làm bài gần nhất, giây học theo ngày, đồng ý quyền riêng tư). Streak đã có hàm `computeStreak` | 🔵 `packages/state/src/index.ts` |
| Nội dung | 60 câu ghép, 30 từ phương ngữ, 20 thẻ văn hóa, 20 cặp xưng hô, 24 câu xếp lớp, 6 thanh mẫu, **4** kịch bản nhập vai. Không có khái niệm “khóa học / unit / bài” | 🔵 `packages/content/src/data/*.json` |
| Ngân sách bundle | Tải ban đầu 66.3 / 68 kB (theo nhật ký) — gần chạm trần | 🔵 `apps/host-shell/.size-limit.cjs` |

### 1b. Kết quả chạy lại trong phiên này
🟢 `pnpm install --frozen-lockfile` OK · `pnpm build` **17/17** · `pnpm test` **31/31 task** (gateway 31 test, knowledge 18, practice 11, conversation 9, speech-lab 7, learner 4, host 3, vision 2, …) · `pnpm lint:boundaries` **0 vi phạm** (213 module). Nền hiện tại sạch — các mục refactor dưới đây là thiếu hụt kiến trúc, không phải lỗi build. (e2e/Lighthouse không chạy lại trong phiên này.)

---

## 2. Đối chiếu 9 chủ đề của slide với dự án

| # | Slide nói | Dự án hiện tại | Việc cần làm | Ưu tiên |
|---|---|---|---|---|
| 01 | FE – API – BE – DB – dịch vụ ngoài | Có FE (host + 6 MFE), API (Gateway Fastify), dịch vụ ngoài (Gemini). **Thiếu DB và file storage** | Thêm PostgreSQL; ảnh/âm thanh người học hiện không lưu (tốt) — giữ nguyên, chỉ lưu khi có lý do | Phải |
| 02 | Web trước, app khi cần thông báo/camera/mic | Đúng hướng: cần mic, camera, nhắc học hằng ngày ⇒ Capacitor app + PWA | Nhắc học bằng **thông báo cục bộ** (`@capacitor/local-notifications`) — không cần server/FCM, không cần tài khoản Apple ở GĐ đầu | Nên |
| 03 | “Có người dùng thật = có database”; SQL/Postgres; quan hệ bảng; ảnh vào object storage | **Chưa có DB.** Schema Drizzle có nhưng không dùng; `users.email NOT NULL` không cho tài khoản khách; thiếu bảng XP/streak/bài học | GĐ0: Postgres (Neon/Supabase) + drizzle-kit migration đánh số; sửa schema | **Phải** |
| 04 | Git, chia file, backup, migration, soft delete, lịch sử | Git tốt, chia file tốt. **Không remote ⇒ không backup.** Chưa có migration. Chưa có `deleted_at`/lịch sử | Tạo remote private; migration trong git; `deleted_at` cho dữ liệu học; bảng `xp_events` dạng chỉ-thêm (append-only) làm lịch sử luôn | **Phải** |
| 05 | Nghĩ theo luồng, cho thấy giá trị trước, 1 nút chính/màn, loading | Chưa có đăng ký nên người học dùng được ngay (tốt). Không thấy skeleton nào (grep `skeleton`/`aria-busy` = 0). **Thiếu nút chính “Học tiếp”** trên trang chủ | GĐ1: trang chủ = lộ trình + 1 nút “Học tiếp”; skeleton cho lộ trình/ôn tập; khóa nút khi gửi để không gửi 2 lần | **Phải** |
| 06 | Key ở server, kiểm quyền ở backend, RLS | Key ở server ✅ (`~/.becutit/gateway.env`). **Không có tài khoản, không ai cấp JWT**; production sẽ 401 hết | GĐ0: tài khoản khách (`POST /v1/auth/guest`) → JWT; mọi truy vấn lọc theo `userId` ở Gateway (không dùng anon key Supabase từ client nên không cần RLS, nhưng vẫn bật RLS nếu chọn Supabase) | **Phải** |
| 07 | Deploy tự động, tách dev/prod | Có CI yaml nhưng chưa chạy; chưa có host cho Gateway; `.env.production.local` có | GĐ5 (đã hoãn theo yêu cầu): GitHub Actions + Render/Fly cho Gateway, DB dev/prod tách biệt | Để sau |
| 08 | Xin đồng ý rõ ràng, cho xóa dữ liệu, báo sự cố 72h, AI nước ngoài = chuyển dữ liệu xuyên biên giới | Có hộp đồng ý cho micro (lưu local). Nút “xóa dữ liệu” **chỉ xóa local**. Giọng nói/ảnh/chat gửi Gemini (nước ngoài) | GĐ0: lưu bản ghi đồng ý trên server, xóa tài khoản thật (server), chính sách quyền riêng tư; GĐ5: khai báo Data safety. *(Tóm tắt theo slide, không phải tư vấn pháp lý)* | Phải |
| 09 | Commit trước mỗi prompt, mỗi lần một việc, file mô tả dự án | Đang làm tốt (nhật ký, commit nhỏ). **`AGENTS.md` lỗi thời** (vẫn ghi Module Federation, `DrillFactory`; thiếu `api-client`, `native`, `state`) | GĐ0: cập nhật `AGENTS.md` theo kiến trúc thật | Nên |

---

## 3. Học gì từ Duolingo và các app khác

### 3.1 Điều người dùng khen (nên lấy)
- **Một việc rõ ràng mỗi ngày + bài ngắn**: lộ trình, bài vài phút, nhân vật dễ thương. ⚪
- **Streak** là cơ chế giữ thói quen mạnh nhất; **Streak Freeze** giảm bỏ cuộc khi lỡ một ngày. ⚪ (con số % từ blog không có nguồn gốc — không trích làm căn cứ)
- **Nhiệm vụ ngày / tháng**, phần thưởng nhỏ sau bài. ⚪
- **Phản hồi phát âm tức thì có màu/điểm** (ELSA): lý do số 1 người dùng trả tiền. ⚪
- **Hội thoại theo tình huống** (Babbel Speak, Duolingo Roleplay/Video Call). ⚪

### 3.1b Bảng tính năng: lấy / điều chỉnh / bỏ
Cột “Nguồn”: ⚪ = có trong kết quả tìm kiếm ở mục 9 · 📘 = theo hiểu biết chung của tôi về sản phẩm, chưa kiểm chứng trong phiên này.

| Tính năng | App | Quyết định | Giai đoạn |
|---|---|---|---|
| Lộ trình unit/bài, bài 3–5 phút | Duolingo ⚪ | **Lấy, điều chỉnh**: cho test-out, không khóa cứng | GĐ1 |
| XP + mục tiêu ngày | Duolingo ⚪ | Lấy (mục tiêu theo phút do người học chọn) | GĐ1 |
| Streak + Streak Freeze | Duolingo ⚪ | Lấy, freeze kiếm bằng học, không bán | GĐ1 |
| Nhiệm vụ ngày/tháng | Duolingo ⚪ | Điều chỉnh: 1–2 nhiệm vụ gắn kỹ năng (vd. “luyện thanh hỏi 5 lần”) | GĐ1 |
| Practice Hub / ôn lỗi sai | Duolingo ⚪ | Lấy, miễn phí, dựa trên SM-2 sẵn có | GĐ1 |
| Hearts / Energy | Duolingo ⚪ | **Bỏ** | — |
| League + xuống hạng | Duolingo ⚪ | Bỏ ở bản đầu (D7) | GĐ4? |
| Thông báo nhân vật “buồn” | Duolingo ⚪ | Bỏ kiểu gây tội lỗi; giữ nhắc trung tính | GĐ1 |
| Nhân vật linh vật | Duolingo 📘 | Lấy: Bé Cu Tít đã có persona | GĐ1 |
| Phản hồi phát âm màu theo từng âm | ELSA ⚪ | Lấy, mở rộng cho **thanh điệu** (A1/A2/A3) | GĐ2 |
| Hội thoại tình huống | Babbel Speak ⚪, Duolingo Roleplay 📘 | Lấy: M7 gắn vào mỗi unit | GĐ3 |
| Gọi video/thoại với AI | Duolingo Max Video Call 📘, Praktika 📘 | Điều chỉnh: gọi thoại (không video) qua Gateway | GĐ3 |
| “Giải thích câu trả lời” bằng AI | Duolingo Max 📘 | Lấy, JSON + Zod | GĐ2 |
| Truyện ngắn có câu hỏi hiểu (Stories) | Duolingo 📘 | Lấy, cần soạn nội dung | GĐ2 |
| Nhiệm vụ bạn bè / streak chung | Duolingo 📘 | Lấy (hợp tác, không cạnh tranh) | GĐ4 |
| Học từ ảnh chụp | (đã có M4) | Giữ; thêm từ chụp vào ôn tập (đã có) | — |
| Chọn giọng miền Nam/Bắc | Preply/podcast ⚪ (Duolingo/Ling không có) | **Điểm khác biệt** — cần giọng TTS theo miền (D9) | GĐ2 |
| Quảng cáo xen bài | Duolingo free ⚪ | Bỏ | — |

### 3.2 Điều người dùng chê (phải tránh)
| Phàn nàn | Nguồn | Quyết định cho Bé Cu Tít |
|---|---|---|
| **Energy/Hearts** giới hạn số câu được làm, bị xem là “phạt người học miễn phí”, “cash grab” | ⚪ Class Central, techissuestoday, fandom wiki | **Không làm.** Sai là một phần của học; không giới hạn số lần thử |
| **Lộ trình khóa cứng** (2022): mất quyền chọn bài, khó luyện lại phần yếu | ⚪ NBC News, piunikaweb | Lộ trình là **gợi ý**: cho “kiểm tra để vượt” (test-out) mỗi unit, mở tự do khu Ôn tập và 12 công cụ hiện có |
| **Lo âu streak**, thông báo kiểu “Duo buồn” lúc nửa đêm | ⚪ Trustpilot, unstar.app | Thông báo do người học chọn giờ, có giờ yên lặng, lời nhắc trung tính; streak freeze kiếm được bằng học, không mua |
| **Game hóa lấn át việc học** — streak 1.500 ngày vẫn không nói được; XP đo số bài chứ không đo chất lượng | ⚪ Trustpilot, The Decision Lab, dev.to | Thưởng theo **thành thạo** (thanh điệu đúng, thẻ nhớ được) chứ không chỉ theo số bài; màn hình tiến độ đo kỹ năng nói |
| **Bảng xếp hạng/xuống hạng** ít giá trị học | ⚪ Trustpilot | Không làm league cạnh tranh ở bản đầu; nếu làm thì **hợp tác** (nhiệm vụ bạn bè) và **tự nguyện bật** |
| Quảng cáo 30 giây phá mạch học | ⚪ unstar.app | Không quảng cáo trong phiên học |

### 3.3 Khoảng trống của thị trường tiếng Việt (cơ hội)
- Khóa tiếng Việt của Duolingo bị chê **chỉ dạy giọng Bắc**, **dạy thanh điệu kém**, **gần như không có bài nói**, dừng ở ~A1–A2. ⚪ (Clozemaster, Migaku — là đối thủ bán hàng, cần dè dặt)
- Ling cũng chỉ dạy giọng Bắc. ⚪
- ⇒ Bé Cu Tít đã có sẵn A1/A2 (đo cao độ, so contour), A7 (3 miền), A6 (xưng hô 20 cặp), M7 nhập vai — **đây là định vị**: *“học tiếng Việt nói được, đúng thanh, đúng miền, đúng vai vế”*.

---

## 4. Cần refactor / sửa — báo cáo

Ký hiệu: **Phải** (chặn tính năng mới hoặc chặn phát hành) · **Nên** · **Tùy chọn**.

| # | Mức | Vấn đề | Vị trí | Đề xuất |
|---|---|---|---|---|
| R1 | **Phải** | `main` chậm 43 commit, không có remote ⇒ một ổ cứng hỏng là mất hết | git | Merge nhánh mobile vào `main` (cần bạn đồng ý), tạo GitHub repo private, push |
| R2 | **Phải** | Không có DB; endpoint `/srs/due`, `/analytics/summary`, `GET/PUT /preferences` là mock. Ngoài ra `/practice/generate` và `/practice/grade` vẫn trả bài/đáp án cố định (client M5 đang tự sinh bài nên chưa lộ) | `apps/gateway/src/routes/content.ts:81-115`, `routes/practice.ts:23-49` | Thêm `drizzle-orm` + `postgres` + `drizzle-kit`; thư mục `apps/gateway/drizzle/` chứa migration đánh số; thay mock bằng truy vấn thật |
| R3 | **Phải** | Không ai cấp JWT; prod 401 toàn bộ; dev mở khóa Gemini cho cả LAN; quota theo IP | `apps/gateway/src/config.ts:55`, `pipeline/RequestPipeline.ts:42-64` | `POST /v1/auth/guest` (tạo user khách, trả access token ngắn + refresh token lưu Preferences/Keychain); sau này nối Google/email. Dev cũng bật `AUTH_REQUIRED` mặc định |
| R4 | **Phải** | Schema DB không khớp thực tế: `users.email NOT NULL` (không có khách); `srs_cards` thiếu `front/back/source`; thiếu `ui_language`, consent, `deleted_at`; `speed` integer vs client float | `packages/contracts/src/db/schema.ts` | Viết lại schema theo `packages/state` (nguồn chuẩn hiện tại), thêm bảng mới ở mục 5.1 |
| R5 | **Phải** | A3 chấm phát âm là mock cố định 92 điểm | `apps/gateway/src/routes/speech.ts:67-76` | Làm thật: STT (Gemini) → so khớp NFC từng từ + A2 cho thanh ⇒ cần cho GĐ2 |
| R6 | **Phải** | Bài học trộn nhiều dạng (thanh điệu + xưng hô + ghép câu) nhưng UI thanh điệu nằm trong `mfe-speech-lab`, ghép câu trong `mfe-practice` — Nguyên tắc 7 cấm import chéo | `apps/mfe-speech-lab/src/hooks/useToneRecorder.ts`, `components/ContourChart.tsx` | Tạo package `packages/exercises`: mỗi dạng bài là component thuần nhận `item` + trả `ExerciseResult`; MFE cũ và trình chạy bài học cùng dùng. Lộ trình + trình chạy bài nằm trong MFE mới `apps/mfe-path` (hoặc trong `mfe-practice` nếu muốn giữ đúng 6 MFE của TDD — xem quyết định D6) |
| R7 | Nên | Trạng thái học chỉ local, không có `updatedAt` để gộp; `attempts` cắt 1000; persist `version: 1` chưa có migrate | `packages/state/src/index.ts` | Mô hình **local-first + hàng đợi gửi (outbox)**: mọi thay đổi ghi local + đẩy sự kiện lên `/v1/sync`; server là nguồn chuẩn cho XP/streak; thêm `migrate` cho persist v2 |
| R8 | Nên | Phiên xếp lớp A5 và quota lưu RAM | `services/placement`, `pipeline/QuotaStore.ts` | Một instance thì giữ; khi có DB chuyển phiên A5 vào `placement_sessions` (bảng đã có) |
| R9 | Nên | `AGENTS.md` còn ghi host-shell “điều phối Module Federation” và thiếu `packages/api-client`, `native`, `state`; `docs/interactive_architecture.html`, script docx còn liệt kê 6 mẫu GoF trỏ tới file đã xóa | `AGENTS.md`, `docs/` | Cập nhật theo kiến trúc thật; thêm mục “Lệch TDD có chủ đích” |
| R10 | Nên | Ngân sách tải ban đầu 66.3/68 kB: trang chủ lộ trình mới phải lazy hoặc nâng ngân sách có ghi lý do | `.size-limit.cjs` | Trang chủ chỉ hiển thị khung + gọi chunk lộ trình lazy; dữ liệu khóa học tách JSON theo unit |
| R11 | Nên | Nội dung quá ít cho một lộ trình (ước lượng của tôi, chưa có nguồn: 1 unit A1 cần ~60–100 từ, ~40 câu) | `packages/content/src/data` | Định dạng khóa học `course/*.json` tham chiếu kho nội dung; quy trình soạn có cờ `reviewed` (đã có) |
| R12 | Tùy chọn | Bài đo hiệu năng `perf` chập chờn trên CI (nhật ký Q19) | `.github/workflows/ci.yml` | Tách job perf, không chặn merge |
| R13 | Nên | **Đã xác nhận:** chạy `pnpm build` là turbo tự sửa `AGENTS.md` (xóa mục “Quy lệnh chuẩn” khi chèn khối turbo) — xảy ra ở cả worktree này lẫn worktree `mobile-optimization-review` | `AGENTS.md`, `turbo.json` | Tắt `agentGuidance` của turbo hoặc commit một bản `AGENTS.md` đã chứa sẵn khối turbo + mục lệnh, để build không làm bẩn cây làm việc |

**Lưu ý danh mục đóng A1–A8:** XP, streak, mục tiêu ngày là **luật nghiệp vụ** (cộng/trừ, đếm ngày), không phải thuật toán học mới; chọn bài tiếp theo dùng lại A4 (SM-2) và A5 (độ khó). Vẫn cần Lead Dev xác nhận (D5) để không vi phạm Nguyên tắc 3.

---

## 5. Lộ trình theo giai đoạn

### GĐ0 — Nền móng (phải xong trước tính năng xã hội/đồng bộ)
Mục tiêu: có người dùng thật, dữ liệu không mất, phát hành không bị 401.
1. Dọn nhánh: merge vào `main`, tạo remote private, push (R1). Cập nhật `AGENTS.md` (R9).
2. Contract trước (Nguyên tắc 5): `packages/contracts` thêm `AuthGuestResponse`, `SyncPushRequest/Response`, `ProgressSnapshot`, `XpEvent`.
3. DB: Postgres + Drizzle + migration `0001_init.sql`… (R2, R4). Bảng mới:
   - `users` (cho phép `email` null, `is_guest`, `deleted_at`), `devices`/`refresh_tokens`
   - `consents(user_id, key, version, granted_at)` — bản ghi đồng ý (slide 08)
   - `xp_events(id, user_id, source, amount, lesson_id, created_at)` — chỉ thêm, là lịch sử luôn (slide 18)
   - `daily_activity(user_id, day, seconds, xp, goal_met, freeze_used)`
   - `lesson_progress(user_id, lesson_id, status, best_score, completed_at)`
   - `achievements(user_id, key, earned_at)`
4. Tài khoản khách + JWT (R3); `AUTH_REQUIRED` bật cả ở dev; test 401/403 cho truy cập dữ liệu người khác.
5. Đồng bộ local-first (R7): `POST /v1/sync` nhận lô sự kiện có `clientEventId` (chống trùng khi gửi lại), trả snapshot; thay mock `/srs/due`, `/analytics/summary`, `/preferences`.
6. Xóa tài khoản thật (`DELETE /v1/me`: xóa cứng/ẩn danh cả `xp_events`), nút trong M12; trang chính sách quyền riêng tư song ngữ.
7. Backup: bật backup tự động của nhà cung cấp DB + thử khôi phục một lần (slide 16 “chưa thử khôi phục = chưa có backup”).
8. **Giữ tài khoản khi đổi máy/cài lại app:** gỡ app là mất refresh token, nên tài khoản khách *một mình* chưa giải quyết “xóa app là mất”. Cần nối tài khoản (Google hoặc email magic-link, D3) ngay trong GĐ0; mời nối sau khi người học đã có giá trị (vd. xong bài thứ 3 hoặc streak 3 ngày), không bắt lúc mở app.
**Xong khi:** tắt app/mất mạng rồi mở lại ⇒ dữ liệu còn và đồng bộ; tài khoản đã nối ⇒ đăng nhập trên máy khác thấy đủ thẻ SRS và streak; bản release gọi được AI; e2e có kịch bản mất mạng → có mạng → đồng bộ không trùng.

### GĐ1 — Vòng lặp học cốt lõi (“Lộ trình”) — chạy được trên dữ liệu local, làm song song GĐ0
1. **Mô hình khóa học** `packages/content/src/data/course/`: `Course → Unit → Lesson → Exercise ref` (tham chiếu id có sẵn: câu ghép, từ phương ngữ, cặp xưng hô, thanh điệu, kịch bản). Unit 1–3 cho A1: Chào hỏi & xưng hô; Số đếm & mua bán (có “khóm/thơm/dứa”); Gọi món & hỏi đường.
2. **`packages/exercises`** (R6) gom các dạng bài: nghe chọn, trắc nghiệm, điền từ, ghép câu (A8), luyện thanh (A1/A2), chọn đại từ (A6), từ theo miền (A7), nói lại câu (A3, sau R5).
3. **Trang chủ mới**: bản đồ lộ trình theo unit + 1 nút chính “Học tiếp” + thẻ “Ôn hôm nay (n thẻ)”. 12 công cụ cũ chuyển vào tab “Khám phá” (không mất gì).
4. **Phiên bài học**: 8–12 câu, thanh tiến độ, phản hồi đúng/sai ngay có giải thích, câu sai quay lại cuối phiên, màn tổng kết (XP, độ chính xác, từ mới, thanh hay sai). Không có tim/năng lượng.
5. **XP + mục tiêu ngày** (người học chọn 5/10/15/20 phút; mặc định 10) + **streak** (có sẵn `computeStreak`) + **đóng băng streak** kiếm bằng học (tối đa 2), hiển thị lịch tuần.
6. **Kiểm tra để vượt unit** (dùng A5) — tránh lỗi “lộ trình khóa cứng” của Duolingo.
7. **Khu Ôn tập**: thẻ SRS đến hạn (A4), “lỗi gần đây”, “thanh điệu yếu nhất”.
8. **Nhắc học cục bộ** (`@capacitor/local-notifications`): giờ do người học chọn, không gửi nếu đã đạt mục tiêu hôm nay, giờ yên lặng 22h–7h, lời nhắc trung tính song ngữ; xin quyền thông báo **khi người học bấm “Bật nhắc”**, không xin lúc mở app.
**Xong khi:** người mới mở app ⇒ làm bài đầu tiên trong < 60 giây không cần đăng ký; e2e đi hết unit 1; tải ban đầu vẫn ≤ ngân sách.

### GĐ2 — Kỹ năng đặc thù tiếng Việt (điểm khác biệt)
1. A3 thật (R5): đọc câu ⇒ tô màu từng từ (đúng/sai/thiếu) + thanh nào lệch, kiểu ELSA.
2. **Phòng tập thanh điệu**: cặp tối thiểu nghe-phân biệt (ma/má/mà…), trò “bắt thanh” tốc độ tăng dần, biểu đồ tiến bộ từng thanh.
3. **Chế độ miền**: chọn Bắc/Trung/Nam một lần ⇒ bài học đổi từ vựng (A7) và giọng TTS; mỗi unit có thẻ “miền khác nói thế nào”.
4. **Xưng hô trong ngữ cảnh**: câu hỏi “bạn đang nói với ai?” (tuổi, quan hệ) trong bài học thay vì chỉ ở M3.
5. **“Giải thích câu trả lời”** bằng LLM (JSON + Zod, Nguyên tắc 6), có cache theo câu.
6. **Truyện ngắn/đoạn hội thoại nghe** (Stories) có câu hỏi hiểu — cần soạn nội dung.

### GĐ3 — Hội thoại AI
1. Mỗi unit kết thúc bằng **nhập vai** đúng chủ đề (M7 hiện có 4 kịch bản ⇒ cần ≥ 1/unit).
2. **Gọi thoại với Bé Cu Tít**: STT → LLM → TTS liên tục, có nút “nói chậm lại”, phụ đề, lưu lỗi thành thẻ SRS.
3. Bản ghi hội thoại sau buổi: lỗi hay gặp, từ mới ⇒ một chạm thêm vào ôn tập.
4. Giới hạn chi phí: quota AI theo ngày cho tài khoản khách (đã có cơ chế quota, cần lưu DB).

### GĐ4 — Động lực & xã hội (cần GĐ0; tùy chọn)
1. **Huy hiệu theo thành thạo** (vd. “6 thanh đều ≥ 80 điểm”, “100 thẻ nhớ dài hạn”) — không theo số ngày cày.
2. **Tổng kết tuần** (thời gian, thanh tiến bộ, từ đã thuộc).
3. **Nhiệm vụ bạn bè hợp tác** (cùng đạt X phút/tuần), streak chung. League cạnh tranh chỉ làm nếu D7 = có, và phải **tự nguyện bật**.
4. Nếu đối tượng có trẻ em (D4): chế độ phụ huynh, tắt mọi so sánh xã hội.

### GĐ5 — Phát hành có trách nhiệm (đã hoãn theo yêu cầu, giữ trong kế hoạch)
CI chạy thật, staging/prod tách DB, host Gateway (Render/Fly), keystore ngoài repo, Google Play internal testing, Data safety, thử máy thật (TTS tiếng Việt, M2 giọng thật), iOS sau.

---

## 6. Ràng buộc mọi giai đoạn phải giữ
- 7 nguyên tắc trong `AGENTS.md`, đặc biệt: contract trước; LLM trả JSON có Zod; không import chéo MFE (`pnpm lint:boundaries`).
- Mọi chuỗi giao diện **vi + en** qua `i18n.ts` của từng MFE; nội dung học giữ tiếng Việt.
- Ghép MFE lúc build (không Module Federation runtime).
- Ngân sách bundle trong `.size-limit.cjs`; vượt thì ghi lý do vào nhật ký.
- Commit nhỏ, mỗi bước ghi nhật ký; không `DROP TABLE`/reset DB không có migration.

## 7. Đo thành công (đo học, không chỉ đo giữ chân)
| Chỉ số | Cách đo |
|---|---|
| Tỉ lệ làm xong bài đầu tiên | sự kiện `lesson_completed` của người mới |
| Quay lại ngày 1 / ngày 7 | `daily_activity` (sau GĐ0, có đồng ý thống kê) |
| Điểm thanh điệu trung bình theo tuần | `attempts` skill `pronunciation` |
| Tỉ lệ nhớ thẻ SRS (q ≥ 3) | `srs_reviews` |
| Tỉ lệ tắt thông báo | cài đặt nhắc học — nếu cao ⇒ nhắc đang gây phiền |

## 8. Rủi ro
| Rủi ro | Giảm thiểu |
|---|---|
| Nội dung không đủ ⇒ lộ trình rỗng | Bắt đầu 3 unit A1 thật tốt; soạn có AI hỗ trợ nhưng gắn `reviewed:false` tới khi duyệt |
| Game hóa làm lệch mục tiêu học | Thưởng theo thành thạo; theo dõi chỉ số mục 7 |
| Chi phí Gemini khi mở tài khoản khách | Quota/ngày, cache “giải thích”, giới hạn độ dài |
| Lệch TDD (MFE mới, màn hình ngoài M1–M12) | Ghi “lệch có chủ đích” trong báo cáo (D6) |
| Đồng bộ trùng/mất khi offline | `clientEventId` idempotent + test e2e mất mạng |

---

## 9. Quyết định cần bạn (gom một lần)

**Đã chốt (2026-11-17):**
- **D1 ✅** Merge vào `main`, tạo repo GitHub `CuTit` (private).
- **D4 ✅** Người học chính là **người trưởng thành**, nhưng **có chế độ trẻ em**: hồ sơ trẻ do phụ huynh tạo, không bảng xếp hạng/so sánh xã hội, không chat AI tự do (chỉ nhập vai có kịch bản), không camera/ghi âm gửi lên server khi chưa có đồng ý của phụ huynh, nhắc học do phụ huynh đặt. Làm ở GĐ4; GĐ0 chỉ cần trường `account_type` (`adult` | `child`) và `parent_user_id` trong schema để không phải migrate lớn sau này.
- **D9 — đã thử (2026-11-17), kết luận tạm:** Gemini TTS có làm được giọng theo miền, nhưng **không gọi trực tiếp lúc học**. Thay vào đó **dựng sẵn âm thanh cho nội dung khóa học** theo từng miền (script lúc build/soạn nội dung → cache bằng `TTSCacheProxy`/object storage → app tải theo unit và lưu offline). Câu động (chat AI) vẫn đọc bằng TTS của máy. Bằng chứng:
  - `gemini-3.8-flash-tts`, prompt dạng *director's notes* (chỉ dẫn giọng tách khỏi phần lời): đọc **đúng nguyên văn**. Một model nghe khác đoán mù ra **giọng Nam** (nhận ra “gi” đọc thành “d”).
  - Nếu ghép chỉ dẫn vào cùng câu thì model **đọc luôn cả lời chỉ dẫn** và **tự thêm hoặc đổi từ** (“muốn” → “mua”, thêm “à”, “hôn”). Không chấp nhận được cho nội dung học, nên bắt buộc dùng dạng director's notes và kiểm lại bản chép lời của mỗi tệp trước khi dùng.
  - `systemInstruction` không được model TTS hỗ trợ (lỗi 400).
  - `gemini-3.8-flash-lite-tts`: mẫu “giọng Bắc” bị đoán là giọng Nam ⇒ kiểm soát giọng yếu.
  - **Gói miễn phí chỉ cho 10 lần gọi/ngày mỗi model TTS** ⇒ dựng sẵn cần bật trả phí cho khóa Gemini, hoặc chạy rải nhiều ngày.
  - **Còn mở:** người bản ngữ (bạn) phải nghe các mẫu trong `docs/d9-tts-mau/` để xác nhận. Model đánh giá là AI, không đủ tin cậy. Mẫu Bắc/Trung sạch chưa tạo được vì đã hết lượt trong ngày. Nếu chất lượng không đạt thì phương án dự phòng là nhà cung cấp Việt có giọng 3 miền (FPT.AI, Zalo AI, Viettel AI); phương án này cần bạn tạo tài khoản.
- **D2, D3 (tạm, để không chặn GĐ0):** dev/test dùng **PGlite** (Postgres nhúng, không cần cài) qua Drizzle; production đọc `DATABASE_URL` (Neon hoặc Supabase chọn lúc deploy ở GĐ5). Đăng nhập: tài khoản khách + **mã khôi phục** (không cần dịch vụ ngoài); Google/email nối sau khi có OAuth client.

| # | Câu hỏi | Đề xuất của tôi |
|---|---|---|
| D1 | Merge nhánh mobile vào `main` và tạo GitHub repo **private** để có backup + CI? | Có — đang có nguy cơ mất dữ liệu |
| D2 | DB: **Neon** (Postgres thuần, Gateway giữ toàn quyền) hay **Supabase** (có sẵn auth/storage)? | Neon + Drizzle: hợp kiến trúc “mọi thứ qua Gateway”, không lộ anon key ở client |
| D3 | Đăng nhập: khách trước, nối Google/email sau? | Có — đúng slide 19 “cho thấy giá trị trước, hỏi thông tin sau” |
| D4 | Người học chính: người nước ngoài trưởng thành, hay có cả trẻ em Việt kiều? | Ảnh hưởng thông báo, xã hội, pháp lý — cần bạn chốt |
| D5 | Lead Dev xác nhận XP/streak/mục tiêu ngày là luật nghiệp vụ, không tính vào A1–A8? | Có |
| D6 | Lộ trình đặt trong MFE mới `mfe-path` (lệch TDD 6 MFE) hay trong `mfe-practice`? | MFE mới — trách nhiệm rõ, sở hữu riêng |
| D7 | Có làm bảng xếp hạng cạnh tranh không? | Không ở bản đầu; làm nhiệm vụ bạn bè hợp tác |
| D8 | Ai soạn/duyệt nội dung 3 unit A1 (ước lượng ~200 từ, ~120 câu)? | Tôi soạn nháp, bạn/người bản ngữ duyệt (như bước 34) |
| D9 | Giọng đọc theo miền: hiện Gateway chưa có nhà cung cấp TTS (`/speech/synthesize` trả 503), máy chỉ có một giọng chung. Dùng nhà cung cấp TTS nào có giọng Bắc/Nam (vd. Google Cloud TTS, Azure, FPT.AI)? | Chọn một nhà cung cấp có ≥ 2 giọng miền trước GĐ2 — nếu không, “đúng miền” chỉ đúng ở chữ, không đúng ở âm |

---

## Nguồn tham khảo
- Bộ slide “Công nghệ cơ bản cho vibe coder” — vibecoder.fyi (tệp PDF người dùng cung cấp)
- [Trustpilot — Duolingo reviews](https://www.trustpilot.com/review/duolingo.com?page=7) · [unstar.app — language app reviews 2026](https://unstar.app/blog/language-learning-app-reviews-duolingo-babbel-rosetta-stone-2026)
- [Class Central — Duolingo Breaks Hearts for Energy](https://www.classcentral.com/report/duolingo-breaks-hearts-for-energy/) · [techissuestoday — Energy backlash](https://techissuestoday.com/duolingo-energy-system-user-backlash/) · [Duolingo blog — Energy](https://blog.duolingo.com/duolingo-energy/)
- [NBC News — Duolingo path redesign](https://www.nbcnews.com/tech/tech-news/duolingos-update-redesign-luis-von-ahn-interview-rcna44655) · [piunikaweb — path backlash](https://piunikaweb.com/2022/12/16/duolingo-app-update-with-path-ui-faces-backlash-from-users/) · [Duolingo blog — new home screen](https://blog.duolingo.com/new-duolingo-home-screen-design)
- [Deconstructor of Fun — Duolingo gaming principles](https://www.deconstructoroffun.com/blog/2025/4/14/duolingo-how-the-15b-app-uses-gaming-principles-to-supercharge-dau-growth) · [Lazyweb — Duolingo retention experiments](https://www.lazyweb.com/research/duolingo-retention-experiments.md)
- [The Decision Lab — Streak Creep](https://thedecisionlab.com/insights/consumer-insights/streak-creep-the-perils-of-too-much-gamification) · [dev.to — why Duolingo's gamification works and when it doesn't](https://dev.to/pocket_linguist/why-duolingos-gamification-works-and-when-it-doesnt-1d4)
- [G2 — Busuu/ELSA/Duolingo](https://www.g2.com/compare/busuu-vs-elsa-speak-vs-duolingo) · [Capterra — ELSA Speak reviews](https://www.capterra.com/p/240698/ELSA-Speak/reviews/)
- [Migaku — Duolingo Vietnamese review](https://migaku.com/blog/language-fun/duolingo-vietnamese-review) · [Clozemaster — Duolingo alternatives for Vietnamese](https://www.clozemaster.com/blog/?p=7799) · [Ling — best apps to learn Vietnamese](https://ling-app.com/blog/best-apps-to-learn-vietnamese/)
