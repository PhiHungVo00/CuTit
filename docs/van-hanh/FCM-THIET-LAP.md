# Thiết lập FCM (thông báo đẩy) — hướng dẫn từng bước

> **Dành cho ai:** chủ dự án (người có tài khoản Google). Không cần biết lập trình. Làm đúng thứ tự từng bước.
> **Nguồn:** spec `docs/superpowers/specs/2026-11-25-ban-be-design.md`, mục 8.2 và 8.3. Trạng thái: **chưa làm** (tài liệu này viết trước khi có code).
> **Lưu ý tuyệt đối:** tài liệu này **không** chứa khóa, mật khẩu hay giá trị thật nào. Tệp bạn tải về **không bao giờ** được đưa lên GitHub, dán vào chat, gửi qua email hay chụp màn hình.

---

## 0. FCM là gì, và vì sao cần làm tay

FCM (Firebase Cloud Messaging) là dịch vụ của Google để gửi **thông báo** tới điện thoại Android, kể cả khi app đang đóng. Bé Cu Tít cần FCM để báo "Minh vừa nhắn tin" hoặc "Lan đang gọi".

Việc này **không** do AI làm thay được, vì phải đăng nhập bằng tài khoản Google của chủ dự án và bấm xác nhận trên trang của Google.

Gói miễn phí là **Spark**. Gói này đủ cho dự án ở giai đoạn thử nghiệm.

---

## 1. Chuẩn bị

- Một tài khoản Google (chủ dự án dùng).
- Máy tính Windows, đã cài app Bé Cu Tít (bản Android đã build hoặc sắp build).
- Biết tên thư mục người dùng của mình, ví dụ `C:\Users\TenBan`. Trong tài liệu này, `~` nghĩa là thư mục đó.

---

## 2. Tạo dự án Firebase (gói Spark)

1. Mở trình duyệt, vào **console.firebase.google.com**. Đăng nhập bằng tài khoản Google của chủ dự án.
2. Bấm **Create a project** (Tạo dự án) hoặc **Add project**.
3. Đặt tên dự án, ví dụ `becutit-dev`. Bấm **Tiếp tục**.
4. Tắt Google Analytics nếu không cần (bỏ tích ô). Bấm **Create project**. Đợi vài chục giây.
5. Khi thấy chữ **Your new project is ready** (Dự án mới đã sẵn sàng), bấm **Continue**.
6. Kiểm tra gói: góc trên bên trái, cạnh tên dự án, phải thấy **Spark plan**. Nếu thấy gói khác, dừng lại và hỏi người điều phối trước khi trả tiền.

> Gói Spark miễn phí. Không cần nhập thẻ thanh toán để làm FCM cơ bản.

---

## 3. Thêm ứng dụng Android

1. Trong trang tổng quan dự án, bấm biểu tượng **Android** (hình robot).
2. Ô **Android package name** (tên gói Android): nhập đúng từng ký tự:

   ```
   vn.edu.uit.becutit
   ```

   Đây là mã định danh app, phải khớp với `applicationId` trong `apps/host-shell/android/app/build.gradle`.
3. Ô **App nickname** (tên gợi nhớ): ghi `Bé Cu Tít Android`. Không bắt buộc.
4. Ô **SHA-1**: **để trống** ở bước này. Thêm sau nếu cần (xem mục 7).
5. Bấm **Register app** (Đăng ký ứng dụng).

> Nếu app có thêm hậu tố (ví dụ bản debug), hỏi người làm kỹ thuật xem có cần thêm ứng dụng thứ hai không. Spec ghi: thêm các hậu tố của flavor nếu khác id.

---

## 4. Tải `google-services.json` và đặt đúng chỗ

1. Ở bước tiếp theo của Firebase, bấm **Download google-services.json**. Tệp tên đúng là `google-services.json`.
2. Chép tệp này vào thư mục:

   ```
   apps/host-shell/android/app/
   ```

   Đây là thư mục `app` nằm trong `android` của `host-shell` (trong thư mục dự án trên máy bạn).
3. **Không commit tệp này lên GitHub.** Lý do: repo này là **công khai**; ai cũng xem được tệp commit.
   - **Cảnh báo (kiểm ngày 26/11):** dòng bỏ qua `google-services.json` trong `apps/host-shell/android/.gitignore` đang bị **chú thích** (có dấu `#`), nên Git hiện **chưa** bỏ qua tệp này. Trước khi đặt tệp vào thư mục, phải bật lại quy tắc đó (việc này làm trong một PR nhỏ riêng, người làm kỹ thuật làm).
   - Sau khi đặt tệp, mở PowerShell trong thư mục dự án và gõ `git status`. Nếu thấy `google-services.json` trong danh sách "Untracked files" (tệp chưa theo dõi), **đừng** `git add`. Báo người điều phối.
4. Bấm **Next**, rồi **Continue to console**. Bước "Thêm SDK" có thể bỏ qua: dự án đã có sẵn cấu hình Gradle.

> **Ai sẽ dùng tệp này?** Việc build APK trên máy chủ CI cần tệp này làm **secret** (bí mật của CI). Người làm CI sẽ đặt nội dung tệp vào mục Secrets của GitHub. Bạn chỉ cần lưu tệp trên máy để build tại chỗ. Không dán nội dung tệp vào bất kỳ ô nào trên mạng.

---

## 5. Tạo khóa tài khoản dịch vụ (service account)

Khóa này để **máy chủ Gateway** gửi thông báo. Đây là khóa **nhạy cảm nhất** của phần FCM.

1. Trong Firebase Console, bấm biểu tượng **bánh răng** (Project settings / Cài đặt dự án), bên cạnh **Project Overview**.
2. Chọn tab **Service accounts** (Tài khoản dịch vụ).
3. Bấm **Generate new private key** (Tạo khóa riêng mới). Xác nhận. Trình duyệt tải về một tệp `.json`.
4. Kiểm tra quyền của tài khoản dịch vụ (cần thiết cho FCM):
   - Vào **Google Cloud Console** (console.cloud.google.com), chọn đúng dự án.
   - Mục **IAM & Admin** › **IAM**. Tìm tài khoản có đuôi `@...iam.gserviceaccount.com`.
   - Đảm bảo tài khoản có vai trò **Firebase Cloud Messaging API Admin** (hoặc vai trò tương đương do Google gợi ý). Nếu không tìm thấy, ghi lại tên vai trò Google hiển thị và báo người làm kỹ thuật.
5. Đổi tên tệp vừa tải về thành `fcm-service-account.json` (nếu cần) và chuyển vào thư mục:

   ```
   ~\.becutit\fcm-service-account.json
   ```

   Ví dụ đầy đủ: `C:\Users\TenBan\.becutit\fcm-service-account.json`.
   Nếu thư mục `.becutit` chưa có, tạo mới. Thư mục này nằm **ngoài** repo, nên không lo bị commit nhầm.
6. **Xóa tệp tải về ở thư mục Downloads** sau khi đã chuyển xong (kéo vào thùng rác rồi xóa thùng rác). Tệp chỉ nên còn ở một chỗ.

> **Quy tắc vàng:**
> - Không mở tệp này trong chat với AI, không dán nội dung, không chụp màn hình.
> - Không đưa tệp lên GitHub, Google Drive, Zalo, Messenger hay email.
> - Nếu lỡ đưa đi đâu, **vào Firebase và xóa khóa đó ngay**, rồi tạo khóa mới. Báo người điều phối.

---

## 6. Khai báo cho Gateway (máy chủ) trong `~/.becutit/gateway.env`

Gateway đọc cấu hình từ tệp `gateway.env` trong thư mục `~\.becutit\`. Tệp này cũng **không** nằm trong repo.

1. Mở (hoặc tạo) tệp:

   ```
   C:\Users\TenBan\.becutit\gateway.env
   ```

2. Thêm các dòng sau. **Chỉ viết tên biến và đường dẫn**, không viết giá trị bí mật vào tệp mẫu hay vào repo:

   ```
   PUSH_PROVIDER=fcm
   FCM_SERVICE_ACCOUNT_FILE=C:\Users\TenBan\.becutit\fcm-service-account.json
   ```

   Thay `TenBan` bằng tên thư mục người dùng thật của bạn.

3. **Giai đoạn dev/test (khuyến nghị làm trước):** dùng `PUSH_PROVIDER=log`. Khi đó Gateway **không** gửi thông báo thật, chỉ ghi nội dung thông báo ra log. Dùng để kiểm chức năng trước khi có thiết bị thật:

   ```
   PUSH_PROVIDER=log
   ```

   Khi đó **không cần** dòng `FCM_SERVICE_ACCOUNT_FILE`.

| Giá trị `PUSH_PROVIDER` | Ý nghĩa | Khi nào dùng |
|---|---|---|
| `none` | Không gửi, không ghi | Mặc định khi chưa cấu hình gì |
| `log` | Chỉ ghi ra log | Dev, test, máy không có Firebase |
| `fcm` | Gửi thật qua Google | Chỉ khi đã làm xong mục 2–5 và kiểm bằng `log` trước |

4. Lưu tệp. **Khởi động lại Gateway** để đọc cấu hình mới.

---

## 7. Dấu vân tay SHA-1/SHA-256 (chỉ khi cần)

Cho FCM cơ bản **không cần** bước này. Cần khi sau này dùng đăng nhập Google hoặc App Links.

Khi cần, lấy dấu vân tay của khóa ký (keystore) và thêm vào Firebase:

1. Firebase Console › Project settings › tab **Your apps** › chọn app Android › **Add fingerprint**.
2. Dán giá trị SHA-1 hoặc SHA-256 (đây là dấu vân tay công khai, không phải mật khẩu; nhưng vẫn không đưa vào chỗ không cần thiết).

---

## 8. Cách kiểm đã nối đúng (không cần điện thoại thật)

Làm theo thứ tự, mỗi bước đều có cách biết đạt hay chưa:

| Bước | Làm gì | Đạt khi |
|---|---|---|
| A | Chạy Gateway với `PUSH_PROVIDER=log` | Gateway khởi động, không báo lỗi về cấu hình push |
| B | Gửi thử một tin nhắn (khi có tính năng chat) | Trong log Gateway có dòng thông báo giả, không có khóa nào được in ra |
| C | Mở `gateway.env` và kiểm lại | Chỉ có tên biến và đường dẫn, không có chuỗi dài giống khóa |
| D | Đổi sang `PUSH_PROVIDER=fcm` và gửi thử | Thông báo về điện thoại thật có tên app. Lỗi `UNREGISTERED` nghĩa là token đã hết hạn, bình thường |
| E | Kiểm trên máy Android thật hoặc máy ảo | Thông báo hiện khi app đóng; bấm vào thông báo mở đúng màn |

> **Dấu hiệu cần dừng:** nếu log in ra một chuỗi bắt đầu bằng `-----BEGIN PRIVATE KEY-----` hoặc một đoạn JSON có `private_key`, **dừng ngay**. Báo người điều phối để xử lý log và xóa khóa cũ trong Firebase.

---

## 9. Việc tuyệt đối không làm

- Không commit `google-services.json`, `fcm-service-account.json`, `gateway.env` lên GitHub.
- Không dán khóa, token hay nội dung tệp vào chat với AI, ticket, ảnh chụp màn hình.
- Không đặt khóa vào APK hoặc vào mã phía app (app không bao giờ giữ khóa dịch vụ; chỉ Gateway giữ).
- Không dùng gói trả tiền khi chưa có quyết định của chủ dự án.

---

## 10. Khi gặp lỗi

| Hiện tượng | Nguyên nhân thường gặp | Việc cần làm |
|---|---|---|
| Gateway báo không tìm thấy tệp khóa | Đường dẫn sai hoặc tên tệp khác | Kiểm lại `FCM_SERVICE_ACCOUNT_FILE`; đường dẫn phải đầy đủ |
| Build Android không có thông báo | Thiếu `google-services.json` | Kiểm lại mục 4 |
| Gửi lỗi `PERMISSION_DENIED` | Tài khoản dịch vụ thiếu quyền | Kiểm lại mục 5, bước 4 |
| Thông báo không đến máy | Token cũ, hoặc người dùng tắt quyền thông báo | Mở app một lần để đăng ký lại token |

Nếu gặp lỗi khác, ghi lại thông báo lỗi (không kèm khóa) và báo người điều phối.

---

## Nguồn tham khảo

- Spec mục 8.2, 8.3 và 8.4: `docs/superpowers/specs/2026-11-25-ban-be-design.md`.
- Cấu hình Gradle đọc `google-services.json` tại `apps/host-shell/android/app/build.gradle`.
- Trang Firebase và Google Cloud: các tên menu có thể đổi theo thời gian. Nếu không khớp, tìm đúng mục theo tên chức năng (ví dụ "Service accounts", "Cloud Messaging").
