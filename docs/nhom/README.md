# Backlog nhóm 4 người

Gồm ba thứ, tất cả là **bản nháp** (chưa có Issue nào được đăng lên GitHub):

| Tệp | Là gì |
|---|---|
| `backlog.xlsx` | Dashboard + danh sách việc (72 việc). Mở bằng Excel, xem sheet **Hướng dẫn** trước. |
| `issues/issues.csv` | 40 Issue nháp cho thư mục 02, 03, 04 (tiêu đề, nội dung, nhãn, thư mục). Sinh từ cùng dữ liệu với sheet Việc. |
| `../../scripts/nhom/tao-issues.mjs` | Script tạo Issue bằng `gh`. **Mặc định chạy khô** (chỉ in ra). |

## Xem trước Issue (không tạo gì)

```powershell
node scripts/nhom/tao-issues.mjs
node scripts/nhom/tao-issues.mjs --thu-muc 02
```

## Tạo thật (chỉ khi chủ dự án đã đồng ý đăng lên repo công khai)

Cần cả ba cờ; thiếu một cờ là script từ chối. Không gán người (chưa có tên GitHub), gán tay trên GitHub sau đó. Chạy lại không tạo trùng (bỏ qua Issue cùng tiêu đề).

```powershell
node scripts/nhom/tao-issues.mjs --tao-that --repo <chủ>/<tên> --xac-nhan --thu-muc 02
```

## Ghi chú cần biết

- Đường dẫn trong các tệp dùng cấu trúc 4 thư mục của PR #34. Tới 23/11/2026 PR #34 ở trạng thái **đóng, chưa gộp vào `main`**; nếu cấu trúc đó chưa được áp dụng, bỏ tiền tố thư mục khi đối chiếu (xem sheet Hướng dẫn).
- Danh sách "tệp chưa có test" lấy từ danh sách tệp trên nhánh PR #34 ngày 23/11/2026. Kiểm lại bằng `git ls-files` trước khi làm.
- Tên người là giữ chỗ `NGUOI-1..4`. Không ghi tên thật khi chưa được người đó đồng ý.
- Cập nhật việc ở sheet **Việc**; sheet **Tổng quan** tự tính lại.
