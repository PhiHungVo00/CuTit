# Phát hành bản mới của Bé Cu Tít (dự án 8)

> Tài liệu vận hành: các bước từ lúc có bản mới đến lúc người dùng ở **mọi kênh** (web/PWA, Google Play, APK cài tay) được nhắc cập nhật.
> **Không** ghi khóa, mật khẩu hay keystore vào tài liệu này hay vào repo (repo công khai). Bí mật nằm ở `~/.becutit/gateway.env` và nơi cất keystore riêng của bạn.
> Thiết kế: `docs/superpowers/specs/2026-11-21-cap-nhat-ung-dung-design.md`. Gateway đọc `apps/gateway/config/app-versions.json`.

## 0. Hiểu nhanh

- Số phiên bản nằm ở **một chỗ**: `version` trong `apps/host-shell/package.json` (ví dụ `1.5.2`).
- App tính `build = x·1 000 000 + y·1 000 + z` (`1.5.2` → `1005002`); `y`, `z` ≤ 999. Android dùng chính số này làm `versionCode`, nên **mỗi bản phát hành phải có `version` lớn hơn bản trước**.
- Gateway so `build` của app với `app-versions.json` của từng kênh:
  - `build < latestBuild` → nhắc **mềm** ("Có bản mới", có nút "Để sau").
  - `build < minBuild` → màn **bắt buộc** "Cần cập nhật để học tiếp" (chỉ khi có mạng; offline vẫn học bài đã tải).
- Kênh APK tự tải ngầm khi có Wi-Fi, rồi người dùng bấm "Cài đặt".

## 1. Quy trình từng bước

1. **Tăng `version`** trong `apps/host-shell/package.json`; ghi nhật ký (`docs/NHAT_KY_CHUYEN_DOI_MOBILE.md`).
2. **Kiểm** theo skill `kiem-truoc-khi-gop` (build, test, `lint:boundaries`, size, e2e) rồi gộp vào `main`.
3. **Web/PWA**: triển khai `apps/host-shell/dist` (xem `docs/thiet-ke/DE-XUAT-TRIEN-KHAI.md`). Người dùng web nhận thẻ "Có bản mới — tải lại?".
4. **Google Play**: dựng `assemblePlayRelease` (cần keystore **của Play**, giữ ngoài repo), tải lên Play Console. Play lo phần "bản mới" cho người dùng Play.
5. **APK cài tay**: dựng `assembleApkRelease` (cần keystore APK, giữ ngoài repo), rồi:
   1. Tính **SHA-256** và **kích thước** của tệp APK:
      - Windows: `certutil -hashfile becutit-1.5.2.apk SHA256` (lấy dòng chuỗi 64 ký tự, đổi sang chữ thường); kích thước: `(Get-Item becutit-1.5.2.apk).Length`.
      - Linux/macOS: `sha256sum becutit-1.5.2.apk` và `stat -c %s becutit-1.5.2.apk`.
   2. Đăng APK lên **địa chỉ https cố định theo phiên bản** (dự án 7). Host của địa chỉ đó phải nằm trong biến môi trường Gateway `APK_DOWNLOAD_HOSTS`, nếu không Gateway **không khởi động**.
   3. Sửa kênh `apk` trong `apps/gateway/config/app-versions.json`:
      - `latestBuild`, `latestVersion` (đúng `version` mới);
      - `apkFile`: `{ "url": "https://…", "sha256": "<64 ký tự hex thường>", "sizeBytes": <số byte> }`;
      - `downloadUrl`: trang tải dự phòng (người dùng bấm "Mở trang tải" khi tự cài lỗi);
      - `notes`: `{ "vi": "…", "en": "…" }` (chữ thuần, ≤ 280 ký tự mỗi ngôn ngữ).
6. **Sửa các kênh còn lại** của `app-versions.json` (`web`, `play`) cho đúng `latestBuild`/`latestVersion`/`notes`. Kênh `web`/`play` **không** được có `apkFile`/`downloadUrl`.
7. **Triển khai Gateway** với tệp cấu hình mới. Gateway đọc lại tệp sau mỗi `APP_VERSIONS_TTL_MS` (mặc định 60 giây); nếu tệp bị lỗi JSON lúc đang chạy thì giữ cấu hình tốt gần nhất và ghi log lỗi (nhưng **lúc khởi động** tệp sai sẽ chặn khởi động).
8. **Thử**: gọi `GET /v1/app/version?channel=apk&build=<build cũ>` ⇒ `status: "update_available"` kèm `apkFile`. Trên máy thật: app cũ hiện thẻ nhắc; bản APK tự tải khi có Wi-Fi.

## 2. Luật bắt buộc

- **Chỉ nâng `minBuild` khi bản mới đã có ở MỌI kênh** (web đã triển khai, Play đã duyệt/phát hành, APK đã đăng). Nâng sớm = người dùng bị chặn mà chưa có bản để cập nhật.
- Khi nâng `minBuild`, đặt `minBuildEnforceAt` (giờ có múi, ví dụ `2026-12-01T10:00:00+07:00`) **≥ lúc triển khai + 2 giờ** để người đang học kịp xong. Chỉ đặt `null` (chặn ngay) cho sự cố khẩn.
- **Một keystore APK dùng mãi mãi.** Android chỉ cho cài đè khi cùng khóa ký; mất khóa nghĩa là người dùng phải gỡ rồi cài lại. Sao lưu keystore ở nơi riêng, **không** đưa vào repo, CI công khai hay tài liệu.
- APK release chỉ `https://`; app kiểm SHA-256, kích thước, tên gói `vn.edu.uit.becutit` và `versionCode` lớn hơn bản đang chạy **trước khi cài** — SHA sai ⇒ app báo lỗi và không cài.
- Dữ liệu học không mất khi cập nhật (nằm trong bộ nhớ app; app còn cố đẩy hàng đợi đồng bộ tối đa 3 giây trước khi cài). Hàng đợi đồng bộ giữ tối đa **5000 sự kiện**; một máy offline rất lâu có thể bị bỏ sự kiện cũ nhất — nên không để `minBuildEnforceAt` quá gấp với người ít vào app.
- Nếu tự cài lỗi **quá 3 lần cùng một bản**, app không tự tải lại nữa (người dùng vẫn bấm "Cập nhật" được, hoặc "Mở trang tải").

## 3. Hoàn tác / sự cố

- Gỡ nhắc: đặt `latestBuild` bằng bản người dùng đang chạy (hoặc hạ `minBuild`) rồi chờ ≤ 60 giây (TTL).
- Gỡ chặn khẩn: hạ `minBuild` ≤ build người dùng, hoặc đặt `minBuildEnforceAt` vào tương lai.
- APK đăng sai (SHA/kích thước không khớp): sửa `apkFile` cho đúng tệp thật; app tự xóa tệp lỗi và báo "Không cập nhật được".

## 4. Chưa kiểm thử ở đây

- Play In-App Updates thật cần bản đã lên Play (internal app sharing); chưa thử khi viết tài liệu này.
- Ký release và URL đăng APK thật thuộc phần phát hành (dự án 7).
