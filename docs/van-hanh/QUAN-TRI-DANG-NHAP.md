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
5. **Đăng nhập quản trị ngay**, đăng ký mã 6 số bằng Google Authenticator/Aegis, và **chép 10 mã dự phòng** (chỉ hiện một lần).
   Vì sao ngay: trước khi chủ đăng ký, ai biết mật khẩu và vào trước sẽ đăng ký được mã 6 số của họ.

## 2. Việc hay gặp

| Tình huống | Làm gì |
|---|---|
| Mất điện thoại | Dùng một mã dự phòng để vào, hoặc chạy `admin:reset-totp --username <tên>` rồi đăng ký lại (lệnh đóng mọi phiên). |
| Thu quyền | `admin:revoke --username <tên> --role <vai trò>`: có hiệu lực ngay ở request kế tiếp; hết vai trò thì đóng luôn các phiên. |
| Bị khóa 15 phút (sai 5 lần) | Chờ hết cửa sổ. Ai cũng có thể làm khóa tên chủ app bằng cách gõ sai; đây là đánh đổi theo spec, gỡ bằng chờ hoặc đổi IP. |
| Đổi `ADMIN_MFA_KEY` | Mọi bí mật TOTP và mã dự phòng cũ vô hiệu: chạy `admin:reset-totp` cho từng người. |
| Nghi lộ khóa/phiên | Xoay `ADMIN_JWT_SECRET` (access token chết ngay), chạy `admin:reset-totp` cho chủ app (đóng mọi phiên). |

## 3. Dữ liệu và dọn dẹp

- Phiên: rảnh 30 phút thì hết, tối đa 12 giờ. Phiên hết hạn quá 30 ngày bị job dọn hằng ngày xóa.
- Nhật ký quản trị `admin_audit_log` chỉ thêm (trigger ở DB), giữ 2 năm rồi `admin_audit_purge` xóa. Hành động: `auth.login`, `auth.totp_enrolled`, `auth.failed`, `role.grant`, `role.revoke`, `totp.reset` (Task 5 thêm `feedback.*`).
- Cảnh báo email (nếu `MAIL_PROVIDER` bật và tài khoản có email đã xác minh): đăng nhập quản trị thành công, sai mã 6 số quá 5 lần, được cấp vai trò. `MAIL_PROVIDER=none` thì bỏ qua, đăng nhập vẫn chạy.
- Triển khai thật (Postgres): vai trò DB của Gateway phải là chủ bảng (xem migration `0010`). `ADMIN_API_ENABLED` mặc định **tắt** ở production, bật có chủ đích.
