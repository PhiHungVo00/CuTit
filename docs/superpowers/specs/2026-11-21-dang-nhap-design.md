# Thiết kế dự án 3 — Đăng nhập: Google + tên đăng nhập/mật khẩu

> Ngày: 2026-11-21 · Trạng thái: **chờ người dùng duyệt** · Nền kỹ thuật chi tiết: `docs/thiet-ke/DE-XUAT-DANG-NHAP-PHAN-QUYEN.md` Phần A (đọc kèm; tài liệu này chỉ ghi chỗ **khác** hoặc **chốt** so với đề xuất đó). Góp ý gốc: số 1 trong `docs/nhat-ky/GOP-Y-20-11.md`.

## 1. Mục đích và lý do
Góp ý số 1: app chưa có đăng nhập/đăng ký phổ biến. Hiện chỉ có **tài khoản khách + mã khôi phục** (`apps/gateway/src/routes/auth.ts`, `packages/api-client/src/session.ts`). App sẽ phát hành thật: người dùng cần một tài khoản dùng được trên nhiều máy, lấy lại được khi mất máy/quên mật khẩu, mà **không tốn tiền dịch vụ và không cần xác minh doanh nghiệp**.

**Thành công nghĩa là:** người mới vẫn học thử ngay bằng khách; bấm "Đăng nhập bằng Google" hoặc tạo tên đăng nhập/mật khẩu thì giữ nguyên tiến độ; đăng nhập trên máy khác thấy đủ tiến độ; quên mật khẩu lấy lại được bằng email (nếu đã gắn) hoặc mã dự phòng.

## 2. Mục tiêu / không làm / phản mục tiêu
**Mục tiêu:** đăng nhập/đăng ký Google; đăng ký/đăng nhập bằng tên đăng nhập + mật khẩu; gắn email (tùy chọn, xác minh bằng mã 6 số) để lấy lại mật khẩu; mã dự phòng; nâng cấp khách → tài khoản không mất tiến độ; gộp khi đã có tài khoản ở máy khác; đăng xuất; liên kết thêm/gỡ phương thức; sửa 3 lỗ hổng hiện có (tự tạo khách khi refresh lỗi, mã khôi phục nguyên văn tự dùng, bia mộ mã khôi phục bị dọn sau 90 ngày).
**Không làm:** Facebook (cần xác minh doanh nghiệp với Meta), Apple (khi có iOS), SMS (không miễn phí; ở VN cần brandname), đăng nhập web/trang admin (dự án 5), gói trả phí (dự án 6).
**Phản mục tiêu:** lưu mật khẩu nguyên văn hoặc băm yếu; lộ việc tên đăng nhập/email nào đã tồn tại qua thông báo lỗi; tự gộp tài khoản theo email; mất tiến độ khi nâng cấp/gộp; khóa người dùng ở ngoài (gỡ phương thức cuối); giữ bí mật (client secret, mật khẩu ứng dụng Gmail) ở client.

## 3. Ràng buộc
- 7 nguyên tắc `AGENTS.md`; contract trước; migration mới đánh số tiếp (không sửa migration cũ; nhánh Gateway AI đã dùng `0007`, dự án này dùng số kế tiếp khi gộp).
- Người dùng chốt (21/11): **Google + tên đăng nhập/mật khẩu**, quên mật khẩu bằng **mã gửi qua Gmail riêng của app** hoặc **mã dự phòng**; khách vẫn học thử.
- Trẻ em dùng app như mọi người (D4). Đụng DB/auth ⇒ `kien-truc` xem lại trước khi gộp.

## 4. Các phương án đã cân nhắc
| Quyết định | Phương án | Chọn | Lý do |
|---|---|---|---|
| Phương thức | Google · email OTP · Facebook · tên đăng nhập/mật khẩu · SMS | **Google + mật khẩu** (+ email để lấy lại) | Google không cần xác minh doanh nghiệp (chỉ xin `openid email profile`); mật khẩu không cần dịch vụ ngoài. Facebook cần Meta duyệt; SMS tốn tiền. |
| Gửi mã | Resend/Brevo (cần tên miền) · **Gmail SMTP tài khoản riêng** · không gửi mail | **Gmail SMTP** | Miễn phí, không cần tên miền; ~500 thư/ngày; qua adapter để đổi sang Resend khi có tên miền. |
| Nền tảng | Firebase/Supabase/Clerk · **tự làm mỏng trong Gateway** | **Tự làm** | Như đề xuất A2: không SDK hãng ở client, không kho người dùng thứ hai, không phí theo MAU. |
| Gộp tài khoản | M1 chọn một bên · **M2 gộp thật phía server** | **M2** | Không mất tiến độ; mô hình đồng bộ đã gộp được (đề xuất A6.2(3)). |

## 5. Thiết kế đã chốt

### 5.1 Google
Như đề xuất A3: Android dùng Credential Manager qua cầu nối `packages/native/src/identity.ts` (thử plugin Capgo 7.x trước, không ổn thì plugin Kotlin tự viết theo mẫu `SystemBarsPlugin.java`); web dùng Google Identity Services nạp lười. Gateway kiểm ID token bằng JWKS, nonce một lần do server cấp, `aud` = Web client ID, khóa định danh là `sub`. Không lưu email đầy đủ của Google (chỉ bản che).

### 5.2 Tên đăng nhập + mật khẩu (khác đề xuất gốc)
- **Tên đăng nhập:** 3–24 ký tự `a-z 0-9 . _`, không phân biệt hoa thường (lưu dạng chuẩn hóa), không bắt đầu/kết thúc bằng `.`; danh sách cấm (admin, cutit, becutit, support…). Hiển thị tên khác với tên đăng nhập (tên hiển thị đã có ở bạn bè).
- **Mật khẩu:** tối thiểu 8 ký tự, tối đa 128; **không** bắt buộc ký hiệu/hoa (theo NIST SP 800-63B), nhưng **chặn mật khẩu phổ biến** (danh sách ~10 000 mật khẩu hay gặp đóng gói ở Gateway) và chặn trùng tên đăng nhập. Băm **argon2id** (tham số OWASP: m=19 MiB, t=2, p=1) ở Gateway.
- **Lưu:** dòng `identities` provider `password`, `subject` = tên đăng nhập chuẩn hóa; băm mật khẩu ở bảng riêng `password_credentials(user_id pk, password_hash, updated_at)` để bảng `identities` không chứa bí mật.
- **Đăng nhập sai:** luôn trả cùng một lỗi `invalid_credentials` (không lộ tên tồn tại hay không); giới hạn theo IP và theo tên đăng nhập (5 lần sai/15 phút ⇒ khóa tạm tăng dần), ghi audit `auth.password_failed` gộp.
- **Đổi mật khẩu** (khi đã đăng nhập, nhập mật khẩu cũ) ⇒ thu hồi mọi refresh token khác.

### 5.3 Email để lấy lại mật khẩu (tùy chọn) + Gmail
- Người dùng có thể **gắn email** ở Cài đặt › Tài khoản; xác minh bằng **mã 6 số** (như đề xuất A4: băm HMAC có pepper, sống 10 phút, ≤ 5 lần sai, giới hạn theo email và IP, luôn trả 202). Email gắn vào là danh tính `email`, **chỉ dùng để lấy lại mật khẩu** (xem mục 6).
- **Quên mật khẩu:** nhập tên đăng nhập **hoặc** email ⇒ nếu tài khoản có email đã xác minh, gửi mã 6 số; nhập đúng mã ⇒ đặt mật khẩu mới ⇒ thu hồi mọi phiên. Màn luôn hiện "Nếu thông tin đúng, mã đã được gửi" (không lộ).
- **Gửi mail:** adapter `MailProvider` (Nguyên tắc 4) với ruột đầu tiên `gmail-smtp` (`smtp.gmail.com:465`, TLS, đăng nhập bằng **mật khẩu ứng dụng** của tài khoản Gmail riêng). Env: `MAIL_PROVIDER=gmail-smtp`, `MAIL_FROM`, `MAIL_SMTP_USER`, `MAIL_SMTP_PASS`, `MAIL_DAILY_CAP=450` (chừa dư dưới mức ~500/ngày của Gmail). Hết trần ⇒ trả `provider_unavailable`, màn gợi ý dùng mã dự phòng. Mẫu thư song ngữ, chỉ chứa mã + thời hạn, không link.

### 5.4 Mã dự phòng (khác đề xuất gốc)
- Khi khách nâng cấp: **tắt mã khôi phục cũ** (nằm nguyên văn trên máy, tự dùng) như đề xuất A6.2(7), chép băm vào bia mộ lý do `upgraded`, giữ lâu dài.
- Tài khoản **mật khẩu** được cấp **mã dự phòng** ngay lúc đăng ký (hiện một lần, không lưu trên máy, khuyên chụp/ghi lại); dùng để đặt lại mật khẩu khi không có email. Tài khoản Google tự tạo mã dự phòng ở Cài đặt nếu muốn. Tạo mã mới ⇒ mã cũ hết hiệu lực.

### 5.5 Nâng cấp, gộp, đăng xuất, phiên hỏng, xóa tài khoản
Theo đề xuất A6.2 (1)–(8), áp cho cả provider `password`: nâng cấp giữ nguyên `users.id`; đăng nhập trên máy có khách đã có tiến độ ⇒ hộp chọn **Gộp tiến độ máy này vào tài khoản** / **Chỉ dùng tiến độ của tài khoản**; gộp M2 trong một transaction theo bảng luật của đề xuất (không gộp đồng ý; cộng `ai_usage`; chép sổ chống trùng); đăng xuất ⇒ đẩy hàng đợi, thu hồi token, **xóa dữ liệu học trên máy** (máy dùng chung); phiên tài khoản hỏng ⇒ trạng thái "Đăng nhập lại để đồng bộ", **không** tự tạo khách; xóa tài khoản như cũ (mất mọi danh tính).

### 5.6 Giao diện
- **Lần đầu mở app:** vẫn vào học ngay (khách). Thẻ mời đăng nhập hiện sau khi xong bài đầu tiên và ở Hồ sơ (không chặn).
- **Màn đăng nhập/đăng ký** (từ Hồ sơ hoặc thẻ mời): nút "Tiếp tục với Google" (đúng hướng dẫn thương hiệu Google), phân cách "hoặc", tab **Đăng nhập** / **Tạo tài khoản** (tên đăng nhập, mật khẩu có nút hiện/ẩn, chỉ báo độ mạnh đơn giản), link "Quên mật khẩu?". Sau khi tạo tài khoản mật khẩu ⇒ màn **mã dự phòng** (bắt bấm "Tôi đã lưu").
- **Cài đặt › Tài khoản:** phương thức đã gắn (Google ••• , tên đăng nhập, email che), gắn email, đổi mật khẩu, tạo mã dự phòng, đăng xuất, đăng xuất mọi thiết bị, xóa tài khoản.
- `CuTit` minh họa (`chao` ở màn đăng nhập, `khen` khi tạo xong). Mọi chuỗi vi + en.

### 5.7 Pháp lý
Cập nhật `/quyen-rieng-tu`, `docs/phap-ly/DATA-SAFETY.md` (giờ có **email** khi người dùng gắn, **tên đăng nhập**), `DANH-GIA-TAC-DONG.md`; Google là bên xác thực. Trang yêu cầu xóa tài khoản trên web (Play bắt buộc) — để dự án có đăng nhập web/tên miền; trước đó ghi rõ cách xóa trong app.

## 6. Quyết định của Claude (người dùng xem lại)
- Quy tắc tên đăng nhập/mật khẩu, argon2id, khóa tạm sau 5 lần sai (5.2).
- Mã dự phòng bắt buộc cấp cho tài khoản mật khẩu (5.4).
- Thẻ mời đăng nhập sau bài đầu tiên, không chặn (5.6).
- Khách có hạn mức AI **thấp hơn** tài khoản thật (đề xuất ½), để khuyến khích đăng nhập — cấu hình env.
- Gộp chỉ khách → tài khoản (không gộp hai tài khoản thật).
- **Mã dự phòng (chốt sau khi rà):** chỉ dùng để **đặt lại mật khẩu** (nhập tên đăng nhập + mã), **không** đăng nhập thẳng. Dùng **một lần**; dùng xong app hiện ngay mã mới (một lần). Chỉ cấp cho tài khoản **có mật khẩu** — tài khoản chỉ có Google không có mã dự phòng (khôi phục là việc của Google), tránh cửa sau bỏ qua Google. Mã dự phòng **không** tính là một phương thức khi xét `last_identity`. Route `/v1/auth/recover` cũ **chỉ còn cho khách**; với tài khoản đã nâng cấp trả `account_upgraded`.
- **Email chỉ để lấy lại mật khẩu (chốt):** **không** có luồng đăng nhập/đăng ký bằng email + mã, không tạo tài khoản từ email (bỏ câu "đăng nhập bằng email + mã cũng dùng được" ở 5.3). Gắn email: nhập mã xác minh **trước**, chỉ sau khi đúng mã mới báo nếu email đã gắn tài khoản khác ("Email này không gắn được, hãy dùng email khác") — người biết được điều này phải đang giữ hộp thư đó.
- **Đăng xuất khi còn dữ liệu chưa đồng bộ (người dùng chốt 21/11):** thử đẩy hàng đợi; nếu offline/lỗi ⇒ **chờ có mạng**: hiện "Sẽ đăng xuất ngay khi có mạng để không mất N mục chưa đồng bộ", có mạng thì tự đẩy rồi đăng xuất (có nút Hủy đăng xuất). Không có nút "vẫn đăng xuất".
- **Đồng bộ định kỳ (người dùng yêu cầu):** hiện app đã đẩy thay đổi sau ~2 s, khi có mạng lại và khi app xuống nền; bổ sung **kéo dữ liệu từ server mỗi 5 phút khi app đang mở và mỗi lần app trở lại màn hình**, để thay đổi từ máy khác hiện về.
- **Tên đăng nhập (chốt):** không đổi được ở bản đầu; được giải phóng 30 ngày sau khi tài khoản bị xóa hẳn.
- **Xóa tài khoản có 30 ngày để quay lại (người dùng chốt 21/11):** bấm xóa ⇒ tài khoản **bị khóa ngay** (đăng xuất mọi máy, ẩn khỏi bạn bè, ngừng xử lý dữ liệu) và hẹn **xóa vĩnh viễn sau 30 ngày**; đăng nhập lại trong 30 ngày ⇒ hỏi "Khôi phục tài khoản?" ⇒ khôi phục nguyên vẹn. Hết hạn ⇒ job xóa cứng như `DELETE /v1/me` hiện tại + bia mộ. Màn xóa và chính sách quyền riêng tư ghi rõ thời hạn này; người dùng có thể chọn **"Xóa ngay"** (không chờ 30 ngày) để đáp ứng yêu cầu xóa theo luật. Cần đối chiếu thời hạn xử lý yêu cầu xóa trong Luật 91/2025 + NĐ 356/2025 (`docs/nhat-ky/LUAT-UX.md`) trước khi phát hành.
- **Lộ tên và khóa tạm (chốt):** đăng ký được phép báo "tên đã có người dùng" (bắt buộc), anti-goal "không lộ" chỉ áp cho đăng nhập/quên mật khẩu. Khóa tạm theo **cặp (IP, tên đăng nhập)**: 5 lần sai/15 phút; thêm trần theo IP 30 lần/15 phút và làm chậm (không khóa) khi một tên đăng nhập bị sai > 50 lần/giờ từ nhiều IP — để kẻ xấu không khóa được tài khoản người khác.

## 7. Câu hỏi chỉ người dùng trả lời được (không chặn bắt đầu code phía Gateway)
1. **Google Cloud:** đứng tên **người dùng** (đã chốt 21/11). Claude tạo project + OAuth client (Web + Android) trong trình duyệt khi bạn đăng nhập.
2. **Gmail riêng của app:** người dùng nhờ Claude tạo (21/11) — Claude điền phần thông tin chung trong trình duyệt; **mật khẩu và mã xác minh số điện thoại do người dùng tự nhập**.
3. **Trẻ em trên Play Console:** có khai nhóm dưới 13 tuổi không? Có phát hành ở Mỹ không (COPPA)? Ảnh hưởng việc thu email/tên đăng nhập của trẻ.
4. **Pháp nhân phát hành** (cá nhân / hộ kinh doanh / doanh nghiệp).

## 8. Để lại cho người làm
Bố cục mã Gateway (routes/services), thư viện argon2 (ưu tiên `@node-rs/argon2`, không cần build native trên Windows), thư viện SMTP (`nodemailer`), chi tiết hoạt ảnh màn đăng nhập, cách đóng gói danh sách mật khẩu phổ biến.

## 9. Kiểm chứng
Test Gateway: đăng ký/đăng nhập/sai mật khẩu (một mã lỗi), khóa tạm, đổi/đặt lại mật khẩu thu hồi phiên, OTP (hết hạn, sai 5 lần), trần thư/ngày, Google ID token giả (JWKS giả), nâng cấp giữ `users.id`, gộp M2 từng bảng (Postgres thật bằng Docker + PGlite), đăng xuất, bia mộ; contract test; e2e: khách → tạo tài khoản → máy mới đăng nhập thấy tiến độ, quên mật khẩu bằng mã dự phòng; AVD: Google Credential Manager (image có Google Play); `kien-truc` xem lại; `kiem-truoc-khi-gop`.
