# Thiết kế dự án 5a: Góp ý / Báo lỗi và trang quản trị nền

> Ngày: 2026-11-21 · Trạng thái: **ĐÃ DUYỆT 2026-11-21** (đã qua người đọc độc lập rà) · Góp ý gốc: đợt 2 số 1 và số 11 trong `docs/nhat-ky/GOP-Y-20-11.md`.
> Nền kỹ thuật: `docs/thiet-ke/DE-XUAT-DANG-NHAP-PHAN-QUYEN.md`, Phần B (vai trò, 2FA, nhật ký quản trị). Tài liệu này chỉ ghi phần **chốt cho 5a**.
> Ký hiệu: *(gọi của người thiết kế)* là chỗ người dùng chưa nói, người thiết kế tự quyết. Người dùng sửa được khi đọc.

## 1. Mục đích và lý do
App sẽ phát hành thật. Người dùng gặp lỗi hoặc có ý tưởng thì cần một chỗ **ngay trong app** để báo cho chủ app, không phải tìm email hay trang web. Chủ app (chỉ một người, tự duyệt) cần một nơi để xem góp ý, đổi trạng thái và nhắn lại.

5a cũng là **nền quản trị** cho các phần sau dùng chung:
- tài khoản quản trị;
- mã 6 số;
- nhật ký quản trị;
- hàng chờ (dự án 4 cắm báo cáo chat vào sau);
- 5b (quản lý bài học, quản lý người dùng).

**Thành công nghĩa là:**
- Người dùng gửi được góp ý trong vòng chưa tới 1 phút, kèm ảnh hoặc video. Họ thấy trạng thái và lời nhắn của chủ app ở "Góp ý của tôi".
- Chủ app mở trang quản trị trên máy, đăng nhập bằng mật khẩu và mã 6 số, thấy hàng chờ, xử lý xong một góp ý trong vài cú bấm.

## 2. Mục tiêu / không làm / phản mục tiêu
**Mục tiêu**
- Màn Góp ý / Báo lỗi trong app.
- "Góp ý của tôi", có trạng thái và lời nhắn, có chấm đỏ khi có trả lời.
- Trang quản trị web riêng `apps/admin`, chạy localhost.
- Đăng nhập quản trị có mã 6 số (TOTP) **ngay từ đầu**.
- Cấp quyền chủ app bằng lệnh CLI.
- Hàng chờ góp ý.
- Nhật ký quản trị.
- Kho tệp đổi được nhà cung cấp.
- Tự dọn tệp đính kèm cũ.

**Không làm**
- Khóa hoặc quản lý người dùng, quản lý bài học (để 5b).
- Báo cáo chat (dự án 4 cắm vào hàng chờ sau).
- Đưa trang quản trị lên mạng (dự án triển khai).
- Thông báo đẩy khi có trả lời (dự án 4 dựng Firebase Cloud Messaging xong thì nối vào).
- Trò chuyện qua lại như hộp thư hỗ trợ.
- Đăng nhập quản trị bằng Google *(gọi của người thiết kế: bản đầu chỉ dùng tên đăng nhập + mật khẩu + mã 6 số; Google cần khai thêm nguồn web trên Google Cloud, làm khi đưa trang quản trị lên mạng)*.
- Vai trò khác ngoài chủ app *(enum có sẵn chỗ, nhưng chưa có giao diện)*.

**Phản mục tiêu.** Có những thứ dù chạy được vẫn tính là thất bại:
- Mã quản trị nằm trong APK.
- Người ngoài tự cấp được quyền qua web hoặc API.
- Đăng nhập quản trị chỉ cần mật khẩu.
- Tệp đính kèm xem được qua URL công khai.
- Ảnh mang vị trí GPS của người dùng bị lưu lại.
- Góp ý và tệp của người đã xóa tài khoản vẫn còn.
- Gửi video lỗi mạng thì mất luôn phần chữ đã viết.

## 3. Ràng buộc
- Bảy nguyên tắc ở `AGENTS.md` mục 2. **Contract trước** (`packages/contracts`). Kho tệp đi qua một năng lực trừu tượng (nguyên tắc 4).
- Migration mới đánh số nối tiếp. Dự án 3 đã dùng `0008_auth_identities` (nhánh `claude/da3-t1-schema-cfea77`, PR #11). 5a lấy số kế tiếp **lúc gộp**, bằng `db:generate`, không đặt số tay. Không sửa migration đã phát hành.
- Phần này đụng DB và auth, nên **`kien-truc` xem lại** trước khi gộp. Chạy skill `kiem-truoc-khi-gop`.
- Mọi chuỗi trong app có cả vi và en (`i18n.ts` của MFE). Trang quản trị **chỉ tiếng Việt** *(gọi của người thiết kế: chỉ chủ app dùng)*.
- Ngân sách gói đầu: màn góp ý nạp lười, không thêm gì vào gói đầu.
- Người dùng mặc định là người đủ tuổi (quyết định 21/11).

## 4. Các phương án đã cân nhắc

| Quyết định | Phương án | Chọn | Lý do |
|---|---|---|---|
| Người dùng nhận lại gì | A. Một chiều ("cảm ơn") · **B. Trạng thái + lời nhắn** · C. Trò chuyện qua lại | **B** (người dùng chọn) | Người dùng thấy mình được lắng nghe. C tốn công và trùng phần chat của dự án 4. |
| Mã 6 số cho quản trị | **Ngay từ đầu** · Để tới khi lên mạng | **Ngay từ đầu** (người dùng chọn) | Thêm khoảng 1 ngày công, nhưng tránh việc quên làm khi đưa trang lên mạng. |
| Đính kèm | Chỉ ảnh · **Ảnh + video** | **Ảnh + video** (người dùng chọn) | Lỗi chuyển động và âm thanh khó tả bằng ảnh. |
| Trang quản trị ở đâu | **① App web riêng `apps/admin`** · ② Màn ẩn trong app học · ③ Gateway tự sinh HTML | **①** (người dùng đồng ý) | ② đưa mã quản trị vào APK. ③ khó mở rộng cho 5b. |
| Lưu tệp | **① Gateway nhận rồi cất vào kho tệp (thư mục trên máy → R2)** · ② Cất trong Postgres · ③ App tải thẳng lên R2 | **①** (người dùng đồng ý) | ② làm DB phình to. ③ chưa có R2 khi chạy localhost, để dành tới lúc triển khai. |
| Hàng chờ | Bảng chung mọi loại · **Bảng riêng theo loại + API hàng chờ có trường `type`** | **Bảng riêng** *(gọi của người thiết kế)* | Báo cáo chat có cột khác hẳn (tin nhắn, người bị báo cáo). Hàng chờ chỉ gom ở API và giao diện. |

## 5. Thiết kế đã chốt

### 5.1 Trong app: màn Góp ý / Báo lỗi
- **Lối vào:** Hồ sơ › dòng **"Góp ý / Báo lỗi"** (`mfe-learner`, màn Hồ sơ hiện có `apps/mfe-learner/src/profile/`). Route mới `/gop-y`, nạp lười, khai trong `apps/host-shell/src/routes.tsx` (`PATH_ROUTES`). Lối vào thứ hai: nút **"Báo lỗi"** trên màn lỗi `ScreenErrorBoundary` (`apps/host-shell/src/components/ScreenErrorBoundary.tsx`) mở `/gop-y?loai=loi`, kèm tên lỗi *(gọi của người thiết kế: lúc app vỡ là lúc người dùng muốn báo nhất)*.
- **Biểu mẫu:**
  - Chọn loại: **Báo lỗi** / **Góp ý** / **Khác**.
  - Nội dung: 10–2000 ký tự.
  - Đính kèm tùy chọn: **tối đa 3 ảnh và 1 video**.
  - Nút Gửi.
- **Ảnh:**
  - Chọn từ máy (`<input type="file" accept="image/*">`; Android mở thư viện ảnh). Người dùng có thể tự chụp màn hình bằng nút của máy rồi chọn.
  - Trước khi gửi, app **vẽ lại ảnh qua canvas thành WebP**, cạnh dài tối đa 1920 px. Việc này làm mất EXIF (vị trí GPS) và giảm dung lượng.
  - Xem trước ảnh, có nút ✕ để bỏ.
- **Video:**
  - Chọn từ máy (`accept="video/mp4,video/webm,video/quicktime"`).
  - Dài tối đa **60 giây** (đọc `duration` bằng thẻ `<video>` trước khi gửi), nặng tối đa **50 MB**. Quá giới hạn thì báo cần cắt ngắn.
  - Không nén lại trên máy.
  - Có ghi chú: "Video có thể chứa thông tin trên màn hình của bạn".
- **Tự gắn kèm**, hiện rõ dòng "Gửi kèm: …" để người dùng biết:
  - phiên bản app (`version` của host-shell + mã build);
  - nền tảng (android/web);
  - phiên bản Android hoặc trình duyệt;
  - ngôn ngữ giao diện;
  - **màn trước khi vào Góp ý** cùng tối đa 5 đường dẫn gần nhất (chỉ path, không tham số truy vấn);
  - nếu mở từ màn lỗi: tên lỗi và dòng đầu stack.

  Không gắn nội dung bài học hay tin nhắn.
- **Ảnh chụp màn hình tự động:** **không làm trong 5a**. Lối vào ở Hồ sơ nên "màn đang mở" lúc đó chính là Hồ sơ, chụp ra vô ích. Người dùng chọn **"Chọn ảnh có sẵn"** (21/11): tự chụp bằng nút của máy rồi chọn ảnh khi gửi góp ý. Không thêm nút nổi, không thêm thư viện chụp DOM.
- **Gửi:**
  - Một yêu cầu multipart `POST /v1/feedback` (Bearer, khách cũng được). Phiên bản app và mã build hiện **chưa có** trong host-shell ⇒ thêm define lúc build (`__APP_VERSION__` từ `package.json`, `__BUILD_ID__` từ biến CI hoặc mã commit ngắn).
  - Thanh tiến độ khi có tệp.
  - Lỗi mạng: **giữ nguyên chữ và tệp đã chọn trên màn**, có nút "Gửi lại". Bản nháp chữ lưu `localStorage` để thoát ra mở lại vẫn còn. Không có hàng đợi gửi ngầm khi offline *(gọi của người thiết kế: đơn giản)*.
  - Gửi xong: Cu Tít `khen` cùng câu "Cảm ơn bạn! Mình sẽ xem sớm."
- **Giới hạn:** 5 góp ý mỗi người mỗi ngày, cộng giới hạn theo IP. Vượt mức thì báo lỗi `feedback_limit` bằng câu dễ hiểu.
- **"Góp ý của tôi"** (cùng màn, dưới biểu mẫu, hoặc route `/gop-y/cua-toi`):
  - Danh sách: loại, 1 dòng đầu, ngày gửi, nhãn trạng thái **Đã nhận / Đang xử lý / Đã xong**.
  - Bấm vào thì xem dòng thời gian các lời nhắn của chủ app.
  - Chưa đọc thì có **chấm đỏ** ở tab Hồ sơ và ở dòng "Góp ý / Báo lỗi". App hỏi `GET /v1/feedback/mine/unread-count` khi mở app (sau lần vẽ đầu, lúc rảnh) và khi mở Hồ sơ. Mở chi tiết thì đánh dấu đã đọc.
- **Phác giao diện:** `docs/thiet-ke/ban-phac/5a-gop-y.html`.

### 5.2 Gateway: API người dùng (`/v1`, có Bearer)
- `POST /v1/feedback` (multipart):
  - phần `meta` là JSON theo `FeedbackCreateSchema` (`kind`, `body`, `context{appVersion, build, platform, osVersion, locale, route, recentRoutes[], error?}`);
  - phần `files[]`;
  - trả `{id}`.
- **Kiểm phía server:**
  - Zod cho `meta`.
  - Số tệp ≤ 3 ảnh + 1 video.
  - Ảnh ≤ 5 MB, video ≤ 50 MB, tổng ≤ 66 MB. Hiện `@fastify/multipart` đăng ký **toàn cục** với `files: 1` và giới hạn cỡ của âm thanh (`apps/gateway/src/app.ts:98–100`), body tối đa 1 MB ⇒ route góp ý phải đặt **giới hạn riêng theo request** (`request.parts({ limits })`) và `bodyLimit` riêng, không nới giới hạn chung.
  - **Loại tệp theo magic bytes**, không tin `Content-Type`: chỉ nhận WebP/JPEG/PNG cho ảnh, MP4/WebM/MOV cho video.
  - Ghi thẳng dòng chảy xuống kho tệp (không đọc hết vào RAM).
  - Lỗi giữa chừng: xóa các tệp đã ghi và không tạo dòng DB.
- `GET /v1/feedback/mine`: danh sách của chính người gọi, kèm các lời nhắn. **Không trả tệp** (người dùng đã có bản trên máy).
- `GET /v1/feedback/mine/unread-count` → `{count}`.
- `POST /v1/feedback/:id/read`.
- **Xóa tài khoản:** hiện `DELETE /v1/me` xóa cứng ngay (`apps/gateway/src/services/learner/repo.ts:184`). Dự án 3 (Task 4) đổi thành xóa mềm 30 ngày rồi mới xóa cứng. Luật cho 5a *(gọi của người thiết kế)*:
  - Trong 30 ngày chờ xóa: góp ý **giữ nguyên**. Trong hàng chờ quản trị, góp ý mang nhãn "tài khoản đang chờ xóa". Người dùng khôi phục tài khoản thì mọi thứ còn đủ.
  - Lúc **xóa cứng** (route hiện nay, hoặc job dọn của dự án 3): dòng DB bị xóa theo cascade. Tệp được xóa qua kho tệp **sau khi** transaction xong; lỗi thì ghi `blob_deletions` để thử lại.
  - Chỗ gắn việc xóa tệp: một hàm `purgeUserFeedbackBlobs(userId)`, gọi ở mọi đường xóa cứng.
- **Gộp tài khoản** (dự án 3, Task 5, `services/auth/merge.ts`): góp ý của khách **chuyển sang tài khoản đích** (`UPDATE feedback_reports SET user_id = đích`) ở **cả hai** cách gộp, `merge` và `discard_device`. Lý do: "bỏ tiến độ máy này" chỉ nói về tiến độ học, còn góp ý người dùng vẫn muốn theo dõi *(gọi của người thiết kế)*. Phải thêm một dòng vào bảng luật gộp và có test.

### 5.3 Kho tệp (năng lực trừu tượng mới)
- Interface `BlobStore { put(key, stream, {contentType, maxBytes}), get(key, range?), delete(key), totalBytes() }` trong `apps/gateway/src/services/blob/`.
- Hai ruột chọn bằng biến môi trường `BLOB_PROVIDER`:
  - **`fs`** (mặc định, dev/test): thư mục `BLOB_DIR` (mặc định `~/.becutit/blobs`, ngoài repo); test dùng thư mục tạm;
  - **`r2`**: làm ở dự án triển khai. Chỉ cần interface khớp.
- Khóa tệp: `feedback/<feedbackId>/<uuid>.<ext>`, không chứa tên gốc của người dùng.
- `BLOB_TOTAL_CAP_MB` (mặc định 8000): vượt mức thì **từ chối tệp đính kèm nhưng vẫn nhận chữ**, và báo cho người dùng.

### 5.4 Quản trị: tài khoản, mã 6 số, quyền
- **Ai là quản trị:** một `users` có danh tính **mật khẩu** (dự án 3) và có dòng trong `staff_roles(user_id, role, granted_at, granted_by)`, `role` ∈ `owner | editor | reviewer | support` (5a chỉ dùng `owner`). Nên dùng tài khoản riêng cho quản trị, tách khỏi tài khoản học.
- **Cấp quyền:** lệnh `pnpm --filter @vietlearning/gateway admin:grant --username <x> --role owner`. Lệnh chạy với quyền vào DB và ghi nhật ký quản trị với tác nhân `cli`. Có thêm `admin:revoke` và `admin:reset-totp --username <x>` (khi mất điện thoại). **Không có API hay biến môi trường nào cấp quyền.**
- **Mã 6 số (TOTP, RFC 6238, 30 giây, 6 số, SHA-1 để hợp Google Authenticator):**
  - Lần đầu đăng nhập sau khi được cấp quyền: trang quản trị hiện **mã QR** (`otpauth://`) và chuỗi bí mật để nhập tay. Người dùng nhập mã để xác nhận, rồi nhận **10 mã dự phòng dùng một lần** (hiện một lần, lưu băm).
  - Bí mật TOTP **mã hóa AES-256-GCM** bằng `ADMIN_MFA_KEY` (tên theo đề xuất Phần B §B7; biến môi trường, không có thì `/admin/v1` trả 503), lưu ở `staff_totp(user_id pk, secret_enc, confirmed_at, last_used_step)`.
  - Chặn dùng lại cùng một mã (`last_used_step`).
  - Thư viện: `otpauth` (MIT) hoặc tương đương MIT/ISC. Người làm kiểm số tải, lần cập nhật và lỗ hổng.
- **Đăng nhập quản trị** (`/admin/v1/auth/*`, không Bearer app):
  1. `POST /admin/v1/auth/login {username, password}`: dùng lại hàm kiểm mật khẩu của dự án 3. **Hàm này chưa có.** Nó thuộc Task 2 trong `docs/superpowers/plans/2026-11-21-dang-nhap.md` ⇒ phần đăng nhập quản trị **chờ Task 2 của dự án 3 gộp xong** (xem mục 9). Sai mật khẩu, hoặc không có vai trò, thì **cùng một lỗi** `invalid_credentials`. Trả `{ticket, next}` (ticket sống 5 phút), trong đó `next` là `totp` nếu đã đăng ký mã 6 số (`confirmed_at` có giá trị), còn chưa đăng ký thì là `enroll`.
  - Đăng ký lần đầu: `POST /admin/v1/auth/totp/enroll {ticket}` → `{otpauthUrl, secret}`, **chỉ khi `next=enroll`**. Đã xác nhận rồi thì không bao giờ cấp lại bằng mật khẩu, muốn làm lại phải dùng CLI `admin:reset-totp`. Tiếp theo, `POST /admin/v1/auth/totp/confirm {ticket, code}` → tạo phiên (như bước 2) và trả 10 mã dự phòng.
  2. `POST /admin/v1/auth/totp {ticket, code}` (hoặc `{ticket, backupCode}`, chỉ khi `next=totp`): tạo **phiên quản trị** theo đề xuất Phần B §B7:
     - bảng `admin_sessions` (băm refresh, `mfa_at`, rảnh **30 phút** thì hết, tối đa **12 giờ**, thu hồi được);
     - refresh nằm trong cookie `HttpOnly; Secure; SameSite=Strict`, `Path=/admin/v1/auth`. Ở localhost, cổng 5180 và 4000 vẫn cùng site; ở production, `admin.<tên>.id.vn` và `api.<tên>.id.vn` cũng cùng site;
     - access là JWT `typ:'admin'`, ký bằng khóa riêng `ADMIN_JWT_SECRET`, sống **10 phút**, chỉ giữ trong bộ nhớ của trang quản trị.
  - `POST /admin/v1/auth/refresh` (cookie) và `POST /admin/v1/auth/logout` (thu hồi phiên).
  - Giới hạn: 5 lần sai mỗi 15 phút, theo IP và theo tên đăng nhập.
  - **Cảnh báo email** (dùng adapter mail của dự án 3; `MAIL_PROVIDER=none` thì bỏ qua) gửi về email đã gắn của chủ app khi: đăng nhập quản trị thành công, sai mã 6 số quá 5 lần, cấp vai trò mới.
  - **Xác thực lại (step-up)**: 5a không có thao tác nào cần, vì cấp quyền chỉ làm qua CLI. 5b áp dụng cho các thao tác nguy hiểm theo §B7.
- **Kiểm quyền ở mỗi request `/admin/v1`:** hook kiểm `typ:'admin'`, rồi **đọc `staff_roles` từ DB mỗi lần** (không cache, lưu lượng nhỏ). Thu quyền thì có hiệu lực ngay. Token app thường (`typ:'access'`) không dùng được ở đây, và ngược lại.
- **Bật/tắt:** `ADMIN_API_ENABLED` (mặc định `false` ở production, `true` ở dev). `ADMIN_ORIGIN` là nguồn CORS duy nhất của `/admin/v1` (mặc định `http://localhost:5180`), có `credentials: true`. Hiện CORS là **một danh sách chung cho mọi route** (`apps/gateway/src/app.ts:91–95`) ⇒ phải tách CORS theo scope: `/admin/v1` chỉ nhận `ADMIN_ORIGIN`, còn `/v1` **không** nhận `ADMIN_ORIGIN`.

### 5.5 Quản trị: hàng chờ góp ý (API)
- `GET /admin/v1/queue?type=feedback&status=&kind=&cursor=`: mới nhất lên đầu, phân trang theo con trỏ. Trường `type` để dự án 4 thêm `chat_report`.
- `GET /admin/v1/feedback/:id`: nội dung, ngữ cảnh, danh sách tệp, các lời nhắn, mã người dùng rút gọn (không email).
- `POST /admin/v1/feedback/:id/status {status, message?}`: `status` ∈ `received | in_progress | done`, `message` ≤ 1000 ký tự. Mỗi lần gọi thêm một dòng `feedback_events` và đặt `unread=true` cho người dùng nếu có lời nhắn hoặc đổi trạng thái.
- `GET /admin/v1/feedback/:id/files/:fileId/url`: trả URL **ký HMAC sống 5 phút** (`/admin/v1/blob?k=…&exp=…&sig=…`) để thẻ `<img>`/`<video>` mở được (hỗ trợ `Range` cho video). Không có URL công khai. Route `/admin/v1/blob` **không qua hook quản trị** (chữ ký là phần xác thực, thẻ `<img>`/`<video>` không gửi được Bearer) và đặt `cross-origin-resource-policy: cross-origin` (helmet mặc định chặn media khác nguồn, xem `apps/gateway/src/routes/audio.ts`).
- **Nhật ký quản trị** `admin_audit_log(id, actor_user_id | 'cli', action, target_type, target_id, meta jsonb, created_at)`:
  - **ghi trong cùng transaction** với thao tác (không dùng `audit.record` bắn-rồi-quên);
  - chỉ thêm, **ép ở DB** bằng trigger `BEFORE UPDATE OR DELETE` → `RAISE` (migration tùy chỉnh, theo §B7). Giữ **2 năm** *(gọi của người thiết kế, §B7 đề xuất 2 năm)*;
  - cột thêm theo §B7: `ip_hash`, `user_agent`;
  - ghi các hành động: `auth.login`, `auth.totp_enrolled`, `auth.failed`, `feedback.status`, `feedback.view_file`, `role.grant`, `role.revoke`, `totp.reset`.
- `GET /admin/v1/audit?cursor=`: xem nhật ký.

### 5.6 Trang quản trị `apps/admin`
- Vite + React 18 + `packages/ui` (token màu, nút). Cổng dev **5180**. Không nằm trong APK, không là MFE, không bị host-shell import. Thêm luật vào `pnpm lint:boundaries`: không app nào import `apps/admin`.
- Client gọi Gateway qua `packages/api-client` (thêm một client nhỏ cho `/admin/v1`, cùng cách chuẩn hóa lỗi, `credentials: 'include'` cho đường refresh). Access token **chỉ giữ trong bộ nhớ**. Tải lại trang thì gọi refresh bằng cookie, không phải nhập lại mã. CSP chặt, không nhúng script ngoài.
- Các màn:
  1. Đăng nhập (tên + mật khẩu).
  2. Mã 6 số (hoặc "Dùng mã dự phòng").
  3. Lần đầu: quét QR → xác nhận → mã dự phòng.
  4. **Hàng chờ**: bộ lọc loại và trạng thái, số chưa xử lý, mỗi dòng gồm loại, đoạn đầu, phiên bản app, màn, thời gian, số tệp.
  5. **Chi tiết**: nội dung, ngữ cảnh, ảnh (bấm phóng to), video (trình phát), dòng thời gian, ô đổi trạng thái kèm lời nhắn, nút "Lưu".
  6. **Nhật ký quản trị**.
- Phác giao diện: `docs/thiet-ke/ban-phac/5a-gop-y.html`.

### 5.7 Dữ liệu (migration mới, sau `0008`)
```
feedback_reports(id uuid pk, user_id → users ON DELETE CASCADE, kind 'bug'|'idea'|'other',
                 body text, context jsonb, status 'received'|'in_progress'|'done' default 'received',
                 user_unread bool default false, created_at, updated_at, done_at null)
                 index (status, created_at desc), index (user_id, created_at desc)
feedback_files(id uuid pk, feedback_id → feedback_reports ON DELETE CASCADE, blob_key text,
               media 'image'|'video', content_type, bytes int, duration_ms int null,
               created_at, purged_at null)
feedback_events(id uuid pk, feedback_id → feedback_reports ON DELETE CASCADE, actor_user_id null,
                status null, message text null, created_at)
blob_deletions(blob_key pk, reason, created_at, attempts int)   -- hàng dọn tệp khi xóa lỗi
staff_roles(user_id → users ON DELETE CASCADE, role, granted_at, granted_by null, pk(user_id, role))
staff_totp(user_id pk → users ON DELETE CASCADE, secret_enc bytea, confirmed_at null,
           last_used_step bigint, backup_hashes text[])
admin_sessions(id uuid pk, user_id → users ON DELETE CASCADE, refresh_hash text unique, mfa_at,
               last_seen_at, expires_at, revoked_at null, ip_hash, user_agent, created_at)
admin_audit_log(id bigserial pk, actor_user_id uuid null, actor_kind 'user'|'cli', action, target_type,
                target_id text null, meta jsonb, ip_hash null, user_agent null, created_at)
                -- không FK tới users để giữ khi xóa tài khoản; trigger chặn UPDATE/DELETE
```
- **Dọn định kỳ** (job trong Gateway, mỗi ngày). Mốc tính là **`done_at`**, tức lúc chủ app đặt "Đã xong":
  - ảnh: `done_at` quá **180 ngày** → xóa tệp, đặt `purged_at`;
  - video: `done_at` quá **90 ngày** → xóa tệp, đặt `purged_at`;
  - góp ý **không bao giờ được đặt "Đã xong"**: mọi tệp xóa sau **365 ngày** kể từ `created_at` *(gọi của người thiết kế, để không giữ mãi)*;
  - chữ giữ lại *(gọi của người thiết kế)*;
  - nhật ký quản trị quá 2 năm: xóa bằng job chạy với quyền vượt trigger (vai trò DB riêng, hoặc tắt trigger trong transaction của job);
  - phiên quản trị hết hạn quá 30 ngày: xóa;
  - thử lại `blob_deletions`.

### 5.8 Pháp lý và quyền riêng tư
- Cập nhật `/quyen-rieng-tu`, `docs/phap-ly/DATA-SAFETY.md` (thêm "ảnh/video do người dùng gửi", "chẩn đoán ứng dụng", mục đích: hỗ trợ và sửa lỗi) và `DANH-GIA-TAC-DONG.md`.
- Biểu mẫu có dòng: "Chủ app sẽ xem nội dung, ảnh và video bạn gửi để sửa lỗi. Ảnh xóa sau 180 ngày, video sau 90 ngày kể từ khi xử lý xong (chậm nhất 1 năm sau khi gửi)."

## 6. Kiểm thử bắt buộc
- Contract: Zod của meta, giới hạn và mã lỗi.
- Gateway:
  - nhận đủ ảnh và video;
  - từ chối tệp giả đuôi (magic bytes);
  - vượt cỡ thì không còn tệp mồ côi;
  - khách gửi được;
  - quá 5 lần/ngày bị chặn;
  - `DELETE /v1/me` xóa cả tệp;
  - job dọn chạy đúng mốc.
- Quản trị:
  - không có vai trò thì cùng lỗi với sai mật khẩu;
  - TOTP đúng, sai, dùng lại mã cũ;
  - mã dự phòng dùng một lần;
  - token app bị từ chối ở `/admin/v1`;
  - thu quyền có hiệu lực ngay;
  - nhật ký ghi cùng transaction (thao tác lỗi thì không có dòng nhật ký);
  - URL ký hết hạn sau 5 phút;
  - `ADMIN_API_ENABLED=false` trả 404.
- App: unit cho biểu mẫu (giới hạn, giữ nháp, vẽ lại ảnh); e2e Playwright: gửi góp ý có ảnh, thấy trong "Góp ý của tôi", quản trị đổi trạng thái, app thấy chấm đỏ.
- Android (skill `thu-tren-emulator`): chọn ảnh và video từ thư viện trong WebView, gửi được.
- `pnpm lint:boundaries`, size-limit.

- Bổ sung sau rà:
  - phiên quản trị: hết hạn khi rảnh 30 phút, tối đa 12 giờ, đăng xuất thì thu hồi, cookie refresh chỉ gửi tới `/admin/v1/auth`;
  - CORS `/v1` không nhận `ADMIN_ORIGIN`;
  - trigger chặn sửa và xóa nhật ký;
  - gộp tài khoản chuyển góp ý sang tài khoản đích;
  - tài khoản chờ xóa vẫn giữ góp ý, xóa cứng thì xóa cả tệp;
  - mốc dọn theo `done_at` và mốc 365 ngày.

## 7. Để lại cho người làm
- Bố cục chi tiết, chữ trên nút (vi + en), kiểu chấm đỏ: theo token `packages/ui` và ảnh phác.
- Chọn thư viện TOTP (MIT/ISC/Apache) và cách dựng mã QR (thư viện MIT, chỉ nạp trong `apps/admin`).
- Cách lấy phiên bản Android trong WebView (Capacitor `Device` nếu đã có, không thì user agent).
- Tên chính xác của route và thành phần, miễn theo quy ước hiện có.

## 8. Câu hỏi đã hỏi người dùng sau khi rà
Người đọc độc lập đã rà (21/11).

- **Q1. Lấy ảnh chụp màn hình theo cách nào?** Hai lựa chọn: chọn ảnh có sẵn, hoặc thêm nút nổi "Báo lỗi" để app tự chụp màn đang mở. Người dùng chọn **chọn ảnh có sẵn**.

Các điểm người thiết kế tự chốt sau rà (người dùng xem khi duyệt):
- phiên quản trị theo §B7: `admin_sessions`, cookie HttpOnly, rảnh 30 phút thì hết, tối đa 12 giờ, cảnh báo email;
- nhật ký quản trị giữ 2 năm, trigger chặn sửa và xóa;
- góp ý theo tài khoản khi gộp;
- tài khoản chờ xóa vẫn giữ góp ý;
- mốc dọn tệp theo `done_at`, tối đa 365 ngày;
- CORS và giới hạn multipart tách theo scope;
- đăng nhập quản trị chờ Task 2 của dự án 3.

## 9. Phụ thuộc vào dự án 3 (đăng nhập)
| Phần của 5a | Cần gì từ dự án 3 | Ở đâu trong kế hoạch dự án 3 | Nếu chưa có |
|---|---|---|---|
| Schema (FK tới `users`, danh tính mật khẩu) | Migration `0008_auth_identities` | Task 1, PR #11 (nhánh `claude/da3-t1-schema-cfea77`) | Migration 5a đánh số sau khi 0008 vào `main`; `db:generate` lúc gộp |
| Đăng nhập quản trị (`/admin/v1/auth/login`) | Hàm kiểm mật khẩu argon2id + giới hạn sai, API đăng ký tài khoản mật khẩu | Task 2 | Làm trước các phần không cần đăng nhập (góp ý phía app, kho tệp, API hàng chờ có test bằng phiên quản trị giả trong test). Đợt đăng nhập quản trị chờ Task 2 gộp |
| Tạo tài khoản cho chủ app | Đăng ký tài khoản mật khẩu (API Task 2; giao diện Task 7) | Task 2 / Task 7 | Trước khi có giao diện, đăng ký bằng API (lệnh `curl` ghi trong hướng dẫn), rồi `admin:grant` |
| Cảnh báo email | Adapter `MailProvider` (Gmail SMTP) + email đã gắn | Task 2 | `MAIL_PROVIDER=none` ⇒ bỏ qua cảnh báo, không lỗi |
| Xóa cứng tài khoản gọi `purgeUserFeedbackBlobs` | Xóa mềm 30 ngày + job xóa cứng | Task 4 | Gắn vào `DELETE /v1/me` hiện tại; khi Task 4 gộp thì chuyển chỗ gọi sang job xóa cứng |
| Gộp tài khoản chuyển góp ý | `services/auth/merge.ts` + bảng luật gộp | Task 5 | Thêm dòng luật khi một trong hai bên gộp sau (ai gộp sau thì thêm) |
| Trang quản trị cùng site với Gateway (cookie `SameSite=Strict`) | Không | — | — |
