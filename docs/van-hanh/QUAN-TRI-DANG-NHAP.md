# Đăng nhập trang quản trị (dự án 5a, Task 4): cách vận hành

> Chỉ nói về **vận hành**. Thiết kế: `docs/superpowers/specs/2026-11-21-gop-y-bao-loi-design.md` §5.4. Không có giá trị khóa thật nào trong tệp này (repo công khai).

## 1. Bật lần đầu (máy dev)

1. Sinh hai khóa **khác nhau**, cất ở `~/.becutit/gateway.env` (ngoài repo), không dán vào chat hay commit:
   - `ADMIN_MFA_KEY` = 32 byte ngẫu nhiên dạng hex (64 ký tự). Lệnh sinh: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `ADMIN_JWT_SECRET` = chuỗi ngẫu nhiên ≥ 32 ký tự, khác `JWT_SECRET`.
2. Khởi động Gateway. Thiếu một trong hai khóa thì mọi đường dẫn `/admin/v1/*` trả `503 admin_disabled` (cố ý: không tự sinh khóa).
3. Tạo tài khoản riêng cho quản trị (đừng dùng tài khoản học): `POST /v1/auth/register` với tên + mật khẩu mạnh. Nên gắn email đã xác minh nếu muốn nhận cảnh báo.
4. Cấp quyền (dừng Gateway dev trước nếu đang dùng PGlite):
   `corepack pnpm --filter @vietlearning/gateway admin:grant --username <tên> --role owner`
5. Lệnh `admin:grant` **in ra MÃ MỜI** (dùng một lần, hết hạn sau 24 giờ, chỉ hiện lần đó; DB chỉ lưu băm). Đăng nhập quản trị, nhập mã mời,
   đăng ký mã 6 số bằng Google Authenticator/Aegis, và **chép 10 mã dự phòng** (chỉ hiện một lần). Không có mã mời thì biết mật khẩu cũng
   không đăng ký được mã 6 số. Lệnh cần `ADMIN_MFA_KEY` (để băm mã mời). Mất mã mời/hết hạn: chạy lại `admin:grant` cùng vai trò để cấp mã mới.

## 2. Việc hay gặp

| Tình huống | Làm gì |
|---|---|
| Mất điện thoại | Dùng một mã dự phòng để vào, hoặc chạy `admin:reset-totp --username <tên>` rồi đăng ký lại bằng MÃ MỜI mới do lệnh in ra (lệnh đóng mọi phiên). |
| Thu quyền | `admin:revoke --username <tên> --role <vai trò>`: có hiệu lực ngay ở request kế tiếp; hết vai trò thì đóng luôn các phiên. |
| Bị khóa 15 phút (sai 5 lần) | Ai cũng có thể làm khóa tên chủ app bằng cách gõ sai (đánh đổi theo spec). Gỡ ngay: `admin:unlock --username <tên>` (chạy cùng `AUTH_OTP_PEPPER` với Gateway; bộ đếm theo IP của kẻ gõ sai tự hết sau 15 phút). |
| Đổi mật khẩu / xóa tài khoản | Tự đóng mọi phiên quản trị của người đó. |
| Đổi `ADMIN_MFA_KEY` | Mọi bí mật TOTP và mã dự phòng cũ vô hiệu: chạy `admin:reset-totp` cho từng người. |
| Nghi lộ khóa/phiên | Xoay `ADMIN_JWT_SECRET` (access token chết ngay), chạy `admin:reset-totp` cho chủ app (đóng mọi phiên). |

## 3. Dữ liệu và dọn dẹp

- Phiên: rảnh 30 phút thì hết, tối đa 12 giờ. Refresh xoay vòng mỗi lần làm mới (ân hạn 30 giây cho request song song); dùng lại cookie cũ quá ân hạn ⇒ thu hồi cả phiên. Phiên hết hạn quá 30 ngày bị job dọn hằng ngày xóa.
- Nhật ký quản trị `admin_audit_log` chỉ thêm (trigger ở DB), giữ 2 năm rồi `admin_audit_purge` xóa. Hành động: `auth.login`, `auth.totp_enrolled`, `auth.failed`, `role.grant`, `role.revoke`, `totp.reset` (Task 5 thêm `feedback.*`).
- Cảnh báo email (nếu `MAIL_PROVIDER` bật và tài khoản có email đã xác minh): đăng nhập quản trị thành công, sai mã 6 số quá 5 lần, được cấp vai trò. `MAIL_PROVIDER=none` thì bỏ qua, đăng nhập vẫn chạy.
- Triển khai thật (Postgres): vai trò DB của Gateway phải là chủ bảng (xem migration `0010`). `ADMIN_API_ENABLED` mặc định **tắt** ở production, bật có chủ đích.

## 4. Chạy trang quản trị web trên máy (Task 6)

Trang `apps/admin` chỉ chạy **localhost** (chưa triển khai production). Nó là ứng dụng riêng, không nằm trong app học.

1. Gateway đã bật khối quản trị (mục 1) và `ADMIN_ORIGIN` **trùng nguồn của trang** (mặc định `http://localhost:5180`). Muốn kèm xem ảnh/video của góp ý thì đặt thêm `ADMIN_BLOB_URL_SECRET` (≥ 32 ký tự, khác các khóa khác).
2. Chạy trang: `corepack pnpm --filter @vietlearning/admin dev` (cổng 5180; đổi bằng `ADMIN_PORT`, nhớ đổi `ADMIN_ORIGIN` của Gateway cho khớp). Mở `http://localhost:5180`.
3. Gốc Gateway chọn **lúc build** bằng `VITE_GATEWAY_URL` (mặc định `http://localhost:4000`, không phải bí mật). Bản build thử: `VITE_GATEWAY_URL=http://localhost:4000 corepack pnpm --filter @vietlearning/admin build` rồi `... preview`.
4. Lần đầu: nhập tên + mật khẩu → trang hỏi **MÃ MỜI** (mục 1.5) → quét QR hoặc gõ chuỗi bí mật vào ứng dụng xác thực → nhập mã 6 số → chép 10 mã dự phòng → bấm "Tôi đã lưu". Những lần sau: mật khẩu → mã 6 số (hoặc mã dự phòng).

Điều cần biết:
- Token truy cập (10 phút) chỉ nằm trong bộ nhớ của tab; phiên dài hơn do cookie HttpOnly của Gateway giữ. Tải lại trang không hỏi lại mã; đóng tab rồi mở lại trong thời hạn phiên cũng vậy. Không có gì trong localStorage/sessionStorage.
- Trang có CSP chặt (bản build: thẻ `<meta>`; `preview`: thêm header): script chỉ từ chính trang; kết nối, ảnh, video chỉ tới Gateway. Bản `dev` không áp CSP (HMR cần script nội tuyến).
- Ảnh/video góp ý hiện bằng `<img>`/`<video controls>` lấy thẳng từ URL ký (sống 5 phút). Hết hạn thì bấm "Tải lại tệp". Trang không bao giờ nhúng nội dung người dùng như tài liệu và không render HTML do người dùng viết.
- Vai trò: ẩn/khóa nút theo vai trò (chỉ owner/editor đổi trạng thái; chỉ owner xem nhật ký), nhưng quyền thật do Gateway kiểm mỗi request (hiện Gateway chỉ cho `owner`; vai trò khác nhận 403 và trang báo "không có quyền").
- Chạy thử đầy đủ (Gateway thật PGlite tạm + trình duyệt): `corepack pnpm --filter @vietlearning/gateway... build` rồi `corepack pnpm --filter @vietlearning/admin e2e` (cổng `E2E_ADMIN_PORT`/`E2E_GATEWAY_PORT`; ảnh chụp ra thư mục `E2E_SHOTS` nếu đặt). Bộ e2e tự sinh khóa ngẫu nhiên và tài khoản thử, rồi xóa thư mục tạm.
