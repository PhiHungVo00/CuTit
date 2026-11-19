# Kế hoạch backup và khôi phục

> Phạm vi: DB của Gateway (Postgres khi triển khai; PGlite khi dev) và âm thanh dựng sẵn.
> Trạng thái 19/11/2026: **máy chủ thật đang hoãn**. Script đã có và đã thử thật trên Postgres 16 (Docker). Lịch chạy, nơi lưu và người phụ trách sẽ điền khi triển khai.

## 1. Mục tiêu

| Chỉ số | Mục tiêu | Ghi chú |
|---|---|---|
| RPO (mất tối đa bao nhiêu dữ liệu) | ≤ 24 giờ với `pg_dump`; vài phút với PITR | App là local-first: hàng đợi đồng bộ trên máy vẫn còn sự kiện chưa gửi, nên khi máy mở lại app thì phần lớn dữ liệu mất sẽ được đẩy lên lại. |
| RTO (bao lâu chạy lại được) | ≤ 4 giờ | `pg_restore` DB cỡ hiện tại mất dưới 1 giây; thời gian chủ yếu là dựng hạ tầng. |
| Thử khôi phục | Mỗi tháng một lần, và sau mỗi migration lớn | Backup chưa thử khôi phục thì coi như chưa có backup. |

## 2. Hai lớp backup khi deploy (Postgres/Neon)

1. **PITR của nhà cung cấp** (lớp 1, khôi phục nhanh):
   - Neon có "restore window" hay "history retention": khôi phục hoặc tạo nhánh DB tại một thời điểm bất kỳ trong cửa sổ đó. Đặt cửa sổ tối đa gói cho phép, mục tiêu ≥ 7 ngày `[CẦN ĐIỀN: gói, số ngày]`.
   - Supabase có PITR ở gói trả phí.
   - Lớp này nằm **cùng nhà cung cấp** với DB chính, nên không chống được mất tài khoản, xóa project hay nhà cung cấp gặp sự cố. Vì vậy cần lớp 2.
2. **`pg_dump` hằng ngày ra object storage ở nơi khác** (lớp 2, nằm ngoài DB chính):
   - Chạy `apps/gateway/scripts/backup-db.ts` lúc 02:00 UTC mỗi ngày bằng GitHub Actions `schedule` hoặc cron trên máy chủ `[CẦN ĐIỀN]`.
   - Đẩy tệp `.dump` và `.sha256` lên bucket ở **nhà cung cấp khác** hoặc **vùng khác**, ví dụ Cloudflare R2 hoặc S3 `[CẦN ĐIỀN]`. Ví dụ: `rclone copy .data/backups r2:becutit-backup/daily/`.
   - Bucket phải:
     - riêng tư;
     - bật versioning / object lock (WORM), để kẻ tấn công có khóa Gateway cũng không xóa được backup;
     - dùng khóa ghi riêng, chỉ được ghi, không được xóa.
   - Thời gian giữ: 30 bản hằng ngày, 12 bản hằng tháng (lifecycle rule của bucket). Bản cục bộ giữ 30 ngày, luôn còn ít nhất 7 bản (`BACKUP_KEEP_DAYS`).

### Backup chứa dữ liệu cá nhân

- Mã hóa khi lưu: bật SSE của bucket. Tốt hơn nữa là mã hóa trước khi đẩy (`age` hoặc `gpg`, khóa giải mã cất ngoài server) `[CẦN ĐIỀN]`.
- Chỉ người phụ trách vận hành có quyền đọc bucket.
- Backup cũng tuân theo thời hạn lưu trong chính sách quyền riêng tư: hết hạn giữ thì tự xóa theo lifecycle.

## 3. Script

```bash
# Backup (cần pg_dump cùng hoặc MỚI HƠN bản major của server: Neon PG 16/17 ⇒ cài postgresql-client-17)
DATABASE_URL=postgres://... BACKUP_DIR=/var/backups/becutit pnpm --filter @vietlearning/gateway db:backup

# Thử khôi phục vào DB TẠM (tạo trống trước; script từ chối nếu trùng host+cổng+tên DB với DATABASE_URL)
RESTORE_DATABASE_URL=postgres://.../becutit_restore_test \
  pnpm --filter @vietlearning/gateway db:restore-test -- --file /var/backups/becutit/becutit-20261119T020000Z.dump
```

- `backup-db.ts`:
  - chạy `pg_dump --format=custom --no-owner --no-privileges --compress=6`;
  - ghi `becutit-<UTC>.dump` kèm `.sha256`;
  - dọn bản cục bộ quá hạn.
  - URL và mật khẩu đi qua biến `PG*`, không nằm trong argv hay log.
  - Không có `DATABASE_URL` (dev dùng PGlite) thì báo rồi thoát. Backup PGlite bằng cách sao chép thư mục `apps/gateway/.data/pglite` khi Gateway đã tắt.
- `restore-test.ts`:
  - chạy `pg_restore --single-transaction --exit-on-error` vào DB tạm;
  - kiểm tra số migration (`drizzle.__drizzle_migrations`) bằng số migration trong `apps/gateway/drizzle/meta/_journal.json`;
  - kiểm tra các bảng chính có mặt và in số dòng;
  - sai thì thoát mã 1.
  - DB đích không trống thì khôi phục thất bại (đã thử).
- Phần thuần của script có test trong `apps/gateway/test/backup.test.mjs`:
  - tách URL;
  - chặn khôi phục đè DB chính;
  - chọn bản quá hạn.

### Lần thử thật đầu tiên (19/11/2026, máy dev, Docker `postgres:16-alpine`, pg_dump 16.14)

1. Gateway chạy migration 0000–0006 trên Postgres thật, tạo 3 khách, 1 lần khôi phục sai, xóa 1 tài khoản. `audit_events` có 5 dòng; các dòng của tài khoản đã xóa có `user_id` = null.
2. `db:backup`: 45 KiB, sha256 khớp (`sha256sum -c` OK).
3. `db:restore-test` với đích trùng DB chính bị **từ chối**. Với đích là DB tạm: **ĐẠT** (0,4 s, 7 migration; users 2, refresh_tokens 2, audit_events 5).
4. Khôi phục lần hai vào DB đã có dữ liệu: `pg_restore` lỗi như mong đợi.

## 4. Sổ thử khôi phục định kỳ

| Ngày | Bản backup | Nơi khôi phục | Kết quả | Thời gian | Người |
|---|---|---|---|---|---|
| 2026-11-19 | becutit-20261119T120629Z.dump (thử nghiệm Docker) | Postgres 16 tạm | ĐẠT | 0,4 s | Claude (phiên audit-sự-cố) |
| [CẦN ĐIỀN mỗi tháng] | | | | | |

Mỗi lần thử: lấy bản **từ object storage** (không lấy bản cục bộ), kiểm tra sha256, chạy `db:restore-test`, ghi vào bảng, rồi **xóa DB tạm** vì nó chứa dữ liệu thật.

## 5. Khôi phục thật (sự cố mất dữ liệu)

1. Dừng ghi: tắt Gateway hoặc bật bảo trì.
2. Ưu tiên PITR (Neon: tạo nhánh tại thời điểm ngay trước sự cố, kiểm tra, rồi đổi `DATABASE_URL`). Nếu không được thì `pg_restore` bản gần nhất vào DB mới.
3. **Làm lại các lần xóa tài khoản.** Bản khôi phục có thể làm sống lại tài khoản đã bị người dùng xóa sau thời điểm backup, và việc này vi phạm quyền xóa. Cách làm:
   - Bảng `deleted_accounts` (chỉ lưu hash của refresh token và mã khôi phục, giữ 90 ngày) và các dòng `account.deleted` trong `audit_events` không chứa `user_id`. Nên đối chiếu như sau: lấy `credential_hash` trong `deleted_accounts` của **DB đang chạy** (bản trước sự cố, nếu còn đọc được) có `deleted_at` > thời điểm backup.
   - Trên DB đã khôi phục, xóa user có `recovery_code_hash` hoặc `refresh_tokens.token_hash` trùng các hash đó.
   - Nếu DB cũ mất hẳn: client của người đã xóa không còn token. Tài khoản sống lại không ai đăng nhập được và sẽ hết hạn theo chính sách lưu. Ghi rõ điều này trong hồ sơ sự cố.
4. Chạy Gateway: migration mới hơn bản backup tự chạy lúc mở DB.
5. Client local-first tự đẩy lại sự kiện chưa đồng bộ qua `/v1/sync` (idempotent theo `clientEventId`).
6. Nếu mất dữ liệu do sự cố bảo mật: theo [SU-CO-LO-DU-LIEU.md](SU-CO-LO-DU-LIEU.md).

## 6. Âm thanh dựng sẵn (`apps/gateway/.data/tts`): kế hoạch, CHƯA làm

Hiện các tệp WAV dựng sẵn (gói khóa học theo 3 miền, `packs/`, `state/`) nằm **trên đĩa của Gateway** (`TTS_AUDIO_DIR`, `FileAudioStore`) và được phục vụ qua `routes/audio.ts`. Khi deploy:

- Đĩa của nền tảng chạy container thường **tạm thời**: mất khi deploy lại. Nhiều instance cũng không dùng chung được đĩa này. Theo slide 12 ("không lưu tệp trên server"), cần chuyển sang **object storage**:
  - thêm một `AudioStore` thứ hai dùng S3/R2 (cùng interface với `FileAudioStore`, chọn qua env);
  - tệp phục vụ qua CDN với URL công khai đặt theo hash nội dung (bất biến, cache lâu dài);
  - `tts:prebuild` ghi thẳng lên bucket.
- Đây không phải dữ liệu cá nhân và tạo lại được từ `packages/content` + TTS. Dù vậy, tạo lại tốn nhiều giờ máy và hạn mức TTS/STT (và kết quả mỗi lần dựng có thể khác), nên bucket âm thanh cần bật versioning, và mỗi lần phát hành nên giữ một bản sao `packs/` + `state/`.
- Chưa làm vì máy chủ thật đang hoãn. Khi có máy chủ, làm cùng lúc với bước dựng hạ tầng.
