# Thiết kế dự án 5a: Góp ý / Báo lỗi và trang quản trị nền

> Ngày: 2026-11-21 · Trạng thái: **CHỜ NGƯỜI DÙNG DUYỆT** · Góp ý gốc: đợt 2 số 1 và số 11 trong `docs/nhat-ky/GOP-Y-20-11.md`.
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
- **Ảnh chụp màn hình tự động:** **không làm trong 5a**. Lối vào ở Hồ sơ nên "màn đang mở" lúc đó chính là Hồ sơ, chụp ra vô ích. Xem mục 8, câu hỏi Q1.
- **Gửi:**
  - Một yêu cầu multipart `POST /v1/feedback` (Bearer, khách cũng được).
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
  - Ảnh ≤ 5 MB, video ≤ 50 MB (giới hạn của `@fastify/multipart` theo từng tệp và tổng).
  - **Loại tệp theo magic bytes**, không tin `Content-Type`: chỉ nhận WebP/JPEG/PNG cho ảnh, MP4/WebM/MOV cho video.
  - Ghi thẳng dòng chảy xuống kho tệp (không đọc hết vào RAM).
  - Lỗi giữa chừng: xóa các tệp đã ghi và không tạo dòng DB.
- `GET /v1/feedback/mine`: danh sách của chính người gọi, kèm các lời nhắn. **Không trả tệp** (người dùng đã có bản trên máy).
- `GET /v1/feedback/mine/unread-count` → `{count}`.
- `POST /v1/feedback/:id/read`.
- `DELETE /v1/me` (đã có): xóa mọi góp ý và tệp của người đó (dòng DB cascade; tệp xóa qua kho tệp sau khi transaction xong, lỗi thì ghi vào bảng dọn để thử lại).

### 5.3 Kho tệp (năng lực trừu tượng mới)
- Interface `BlobStore { put(key, stream, {contentType, maxBytes}), get(key, range?), delete(key), size(key) }` trong `apps/gateway/src/services/blob/`.
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
  - Bí mật TOTP **mã hóa AES-256-GCM** bằng `ADMIN_TOTP_ENC_KEY` (biến môi trường, không có thì `/admin/v1` trả 503), lưu ở `staff_totp(user_id pk, secret_enc, confirmed_at, last_used_step)`.
  - Chặn dùng lại cùng một mã (`last_used_step`).
  - Thư viện: `otpauth` (MIT) hoặc tương đương MIT/ISC. Người làm kiểm số tải, lần cập nhật và lỗ hổng.
- **Đăng nhập quản trị** (`/admin/v1/auth/*`, không Bearer app):
  1. `POST /admin/v1/auth/login {username, password}`: dùng lại hàm kiểm mật khẩu của dự án 3. Sai, hoặc không có vai trò, thì **cùng một lỗi** `invalid_credentials`. Trả `{ticket}` sống 5 phút.
  2. `POST /admin/v1/auth/totp {ticket, code}` (hoặc `{ticket, backupCode}`): trả **token quản trị** (JWT `typ:'admin'`, khóa ký riêng `ADMIN_JWT_SECRET`, sống **30 phút, gia hạn trượt khi dùng, tối đa 8 giờ** rồi phải đăng nhập lại).
  - Giới hạn: 5 lần sai mỗi 15 phút, theo IP và theo tên đăng nhập.
- **Kiểm quyền ở mỗi request `/admin/v1`:** hook kiểm `typ:'admin'`, rồi **đọc `staff_roles` từ DB mỗi lần** (không cache, lưu lượng nhỏ). Thu quyền thì có hiệu lực ngay. Token app thường (`typ:'access'`) không dùng được ở đây, và ngược lại.
- **Bật/tắt:** `ADMIN_API_ENABLED` (mặc định `false` ở production, `true` ở dev). `ADMIN_ORIGIN` là nguồn CORS duy nhất của `/admin/v1` (mặc định `http://localhost:5180`).

### 5.5 Quản trị: hàng chờ góp ý (API)
- `GET /admin/v1/queue?type=feedback&status=&kind=&cursor=`: mới nhất lên đầu, phân trang theo con trỏ. Trường `type` để dự án 4 thêm `chat_report`.
- `GET /admin/v1/feedback/:id`: nội dung, ngữ cảnh, danh sách tệp, các lời nhắn, mã người dùng rút gọn (không email).
- `POST /admin/v1/feedback/:id/status {status, message?}`: `status` ∈ `received | in_progress | done`, `message` ≤ 1000 ký tự. Mỗi lần gọi thêm một dòng `feedback_events` và đặt `unread=true` cho người dùng nếu có lời nhắn hoặc đổi trạng thái.
- `GET /admin/v1/feedback/:id/files/:fileId/url`: trả URL **ký HMAC sống 5 phút** (`/admin/v1/blob?k=…&exp=…&sig=…`) để thẻ `<img>`/`<video>` mở được (hỗ trợ `Range` cho video). Không có URL công khai.
- **Nhật ký quản trị** `admin_audit_log(id, actor_user_id | 'cli', action, target_type, target_id, meta jsonb, created_at)`:
  - **ghi trong cùng transaction** với thao tác (không dùng `audit.record` bắn-rồi-quên);
  - chỉ thêm, không sửa, không xóa;
  - ghi các hành động: `auth.login`, `auth.totp_enrolled`, `auth.failed`, `feedback.status`, `feedback.view_file`, `role.grant`, `role.revoke`, `totp.reset`.
- `GET /admin/v1/audit?cursor=`: xem nhật ký.

### 5.6 Trang quản trị `apps/admin`
- Vite + React 18 + `packages/ui` (token màu, nút). Cổng dev **5180**. Không nằm trong APK, không là MFE, không bị host-shell import. Thêm luật vào `pnpm lint:boundaries`: không app nào import `apps/admin`.
- Client gọi Gateway qua `packages/api-client` (thêm một client nhỏ cho `/admin/v1`, cùng cách chuẩn hóa lỗi). Token quản trị **chỉ giữ trong bộ nhớ** (tải lại trang thì đăng nhập lại) *(gọi của người thiết kế: an toàn hơn localStorage, chủ app ít khi tải lại)*. CSP chặt, không nhúng script ngoài.
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
admin_audit_log(id bigserial pk, actor_user_id uuid null, actor_kind 'user'|'cli', action, target_type,
                target_id text null, meta jsonb, created_at)   -- không FK tới users để giữ khi xóa tài khoản
```
- **Dọn định kỳ** (job trong Gateway, mỗi ngày):
  - ảnh của góp ý `done` quá **180 ngày** → xóa tệp, đặt `purged_at`;
  - video quá **90 ngày** → xóa tệp, đặt `purged_at`;
  - chữ giữ lại *(gọi của người thiết kế)*;
  - thử lại `blob_deletions`.

### 5.8 Pháp lý và quyền riêng tư
- Cập nhật `/quyen-rieng-tu`, `docs/phap-ly/DATA-SAFETY.md` (thêm "ảnh/video do người dùng gửi", "chẩn đoán ứng dụng", mục đích: hỗ trợ và sửa lỗi) và `DANH-GIA-TAC-DONG.md`.
- Biểu mẫu có dòng: "Chủ app sẽ xem nội dung, ảnh và video bạn gửi để sửa lỗi. Ảnh xóa sau 180 ngày, video sau 90 ngày kể từ khi xử lý xong."

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

## 7. Để lại cho người làm
- Bố cục chi tiết, chữ trên nút (vi + en), kiểu chấm đỏ: theo token `packages/ui` và ảnh phác.
- Chọn thư viện TOTP (MIT/ISC/Apache) và cách dựng mã QR (thư viện MIT, chỉ nạp trong `apps/admin`).
- Cách lấy phiên bản Android trong WebView (Capacitor `Device` nếu đã có, không thì user agent).
- Tên chính xác của route và thành phần, miễn theo quy ước hiện có.

## 8. Câu hỏi đã hỏi người dùng sau khi rà
*(Điền sau bước người đọc độc lập rà.)*
