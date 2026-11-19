# Nhật ký AUDIT-SỰ CỐ: audit log, quy trình lộ dữ liệu, backup (nhánh `claude/audit-log-su-co-c5fc65`)

Bù các thiếu sót theo slide "vibecoder.fyi":

- **Mục 04:** lịch sử phiên bản / audit log và backup.
- **Mục 08:** lộ dữ liệu phải báo cơ quan chuyên trách trong 72 giờ; "cần có log để biết mình bị lộ".

Làm theo TDD: viết test đỏ trước, rồi mới viết mã.

## 1. Bảng `audit_events` (migration `0006_audit_events`)

**Contract trước.** Bảng `auditEvents` thêm ở cuối `packages/contracts/src/db/schema.ts`, sau đó sinh migration bằng `pnpm --filter @vietlearning/gateway db:generate --name audit_events`. SQL sinh ra chỉ tạo bảng mới, không đụng bảng cũ.

**Các cột:**

- `id`
- `type`
- `outcome`: `success` / `failure` / `blocked`
- `user_id`: nullable, **FK `ON DELETE SET NULL`**
- `ip_hash`
- `user_agent`
- `metadata` (jsonb)
- `created_at`

**Index:** `created_at`, (`type`, `created_at`), `user_id`.

### Ghi qua service dùng chung `apps/gateway/src/services/audit/audit.ts` (`AuditLog`)

**Không làm chậm request:**

- `record()` trả về ngay. Lệnh ghi DB chạy nền.
- Lỗi ghi chỉ thành `warn` trong log, không làm hỏng request.
- Hàng đợi tối đa 1000 lần ghi. Vượt thì bỏ dòng mới và cảnh báo.
- Khi app đóng: `flush()` chạy trước khi đóng DB.

**Riêng tư:**

- IP chỉ lưu dạng `HMAC-SHA256(AUDIT_IP_SALT, ip)`, cắt còn 32 hex.
- User-agent rút gọn ≤ 120 ký tự và bỏ ký tự điều khiển.
- `metadata` theo **danh sách trắng Zod** cho từng loại sự kiện, trường lạ bị bỏ. Vì vậy không lọt token, mã khôi phục, mã mời, dữ liệu học hay id người khác.

**Ẩn danh hóa khi xóa tài khoản:**

- FK `ON DELETE SET NULL` đặt `user_id` = null ngay trong transaction xóa user.
- Dòng `account.deleted` cũng không gắn `user_id`.
- Có dòng ghi muộn (user vừa bị xóa trước khi dòng kịp ghi, gây lỗi FK 23503)? Ghi lại với `user_id` = null, không mất sự kiện.

**Sự kiện được ghi:**

| type | Khi nào |
|---|---|
| `auth.guest_created` | tạo khách |
| `auth.recover` | khôi phục bằng mã: đúng ⇒ `success`; sai ⇒ `failure`, `reason` = `invalid_recovery_code` hoặc `account_deleted` |
| `auth.refresh_reuse` | refresh token đã xoay vòng bị dùng lại. Hàm mới `refreshTokenOwnerIfReused` trong `tokens.ts` phân biệt trường hợp này với token lạ |
| `auth.rate_limited` | vượt rate limit `/v1/auth` (`onExceeded` của `@fastify/rate-limit`). Hook này gọi ở **mọi** request vượt giới hạn, nên gộp còn **một dòng mỗi (route, IP) mỗi 10 phút** |
| `auth.failure_burst` | ≥ 5 lỗi xác thực trong 10 phút từ một IP: token sai (ở `RequestPipeline.authenticate`; token chỉ **hết hạn** thì không tính vì client tự làm mới), refresh token sai, mã khôi phục sai. Mỗi cửa sổ một dòng |
| `account.deleted` | `DELETE /v1/me` |
| `friends.invite_created` / `friends.invite_accepted` | tạo / nhập mã mời. Nhập sai ⇒ `failure` + mã lỗi, không lưu mã đã nhập |

**Lưu 180 ngày:**

- `purgeAuditEvents(db, now)` xóa các dòng cũ hơn 180 ngày.
- App chạy hàm này mỗi ngày bằng timer `unref`. Lần đầu sau 1 phút, để không mở PGlite lúc khởi động hay trong test. Timer được hủy khi app đóng.

**Cấu hình mới `AUDIT_IP_SALT`:**

- Production **bắt buộc**, ≥ 32 ký tự.
- Dev/test dùng muối cố định công khai.
- Tách khỏi `JWT_SECRET` có chủ đích: quy trình sự cố có bước xoay `JWT_SECRET`. Nếu muối gắn với nó thì xoay xong sẽ mất khả năng đối chiếu IP.
- Đã ghi vào `.env.example`.

**Test** (`apps/gateway/test/audit.test.mjs`, 14 ca, viết trước, đỏ rồi mới xanh):

- từng loại sự kiện;
- không lưu IP thô, mã hay token;
- ẩn danh hóa khi xóa;
- ghi muộn sau khi xóa;
- rate limit chỉ ghi 1 dòng;
- failure burst: dưới ngưỡng không ghi, trên ngưỡng ghi 1 dòng;
- dọn 180 ngày;
- ghi lỗi không ném ra;
- danh sách trắng metadata;
- hàng đợi có giới hạn;
- cấu hình production.

## 2. Backup (`docs/van-hanh/BACKUP.md`)

- Logic nằm trong `src/services/backup/backup.ts`, để test import được từ `dist`.
- Hai script mỏng:
  - `scripts/backup-db.ts` (`pnpm --filter @vietlearning/gateway db:backup`);
  - `scripts/restore-test.ts` (`db:restore-test`).
- URL và mật khẩu đi qua biến `PG*`, không nằm trong argv hay log. Lệnh chạy không qua shell.
- Thử khôi phục bắt buộc DB đích riêng; trùng host+cổng+tên với `DATABASE_URL` thì từ chối.
- Test: `apps/gateway/test/backup.test.mjs` (6 ca).
- **Chạy thật** bằng Docker `postgres:16-alpine` (pg_dump 16.14; máy dev không cài pg_dump, nên đóng gói script bằng esbuild rồi chạy trong container có node):
  - Gateway chạy migration 0000–0006 trên Postgres thật. Các dòng audit của tài khoản đã xóa có `user_id` = null, đúng trên cả Postgres lẫn PGlite.
  - Backup 45 KiB, sha256 khớp.
  - Khôi phục vào DB chính bị từ chối. Khôi phục vào DB tạm ĐẠT (7 migration).
  - Khôi phục lần hai vào DB đã có dữ liệu thì lỗi, đúng như mong đợi.
  - Đã gỡ container.
- Tài liệu có:
  - PITR của Neon kèm `pg_dump` hằng ngày ra object storage ở nhà cung cấp khác (bucket versioning/khóa ghi, mã hóa);
  - sổ thử khôi phục hằng tháng;
  - cách làm lại các lần xóa tài khoản sau khi khôi phục;
  - kế hoạch chuyển `apps/gateway/.data/tts` sang object storage. Phần này **chưa làm** vì máy chủ thật đang hoãn.

## 3. Quy trình sự cố (`docs/van-hanh/SU-CO-LO-DU-LIEU.md`)

Các bước: phát hiện (truy vấn `audit_events` + dấu hiệu) → khoanh vùng → thu hồi khóa → báo cáo 72 giờ → thông báo người dùng → rút kinh nghiệm → diễn tập.

**Căn cứ pháp lý** đã kiểm tra bằng web ngày 19/11/2026, ghi nguồn trong tài liệu:

- Luật 91/2025/QH15 Điều 23: 72 giờ **kể từ khi phát hiện**, gửi cơ quan chuyên trách thuộc Bộ Công an; phải lập biên bản xác nhận.
- Nghị định 356/2025/NĐ-CP:
  - Điều 28: nội dung bắt buộc; gửi theo Mẫu số 08 hoặc qua Cổng quốc gia.
  - Điều 29: phải thông báo chủ thể trong 72 giờ khi lộ dữ liệu vị trí hoặc sinh trắc học; lưu hồ sơ ≥ 5 năm.
- Đánh dấu rõ những điểm **chưa kiểm tra được**: bố cục Mẫu số 08, địa chỉ tiếp nhận, mức phạt.
- Thông tin người phụ trách để `[CẦN ĐIỀN]`.

## 4. Kiểm tra

- `pnpm build`: 19/19.
- `pnpm test`: 35/35 task. Gateway 122/122, gồm 14 audit + 6 backup.
- `pnpm lint:boundaries`: 0 vi phạm.
- e2e (host build `VITE_GATEWAY_URL=http://localhost:4022`, `E2E_PORT=4193 E2E_GATEWAY_PORT=4022`): 95 đạt, 8 bỏ qua, 0 lỗi.

## 5. Việc sau (không làm trong nhánh này)

- **Thu hồi cả "họ" refresh token khi phát hiện dùng lại.** Hiện chỉ ghi audit. Thu hồi sẽ đăng xuất người dùng khi client gửi trùng do mạng chập chờn, nên cần thiết kế cùng client (thời gian ân hạn).
- **Chính sách quyền riêng tư** cần nêu việc xử lý mới: IP đã băm và user-agent rút gọn, lưu 180 ngày, mục đích an ninh. Phiên đang sửa `privacyI18n.ts` sẽ làm; đã để ghi chú ở thư mục ghi chú chung.
- Banner thông báo sự cố trong app; tạo lại mã khôi phục; `AudioStore` dùng object storage; lịch backup thật khi có máy chủ.
