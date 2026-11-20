# Đề xuất thiết kế: Đăng nhập (Google + email) và Phân quyền + Trang quản trị

> Ngày: 20/11/2026 · Trạng thái: **ĐỀ XUẤT, chưa sửa code, chưa có migration**.
> Phạm vi: dự án (3) “đăng nhập” và dự án (5) “quản trị” trong thứ tự ở `docs/nhat-ky/GOP-Y-20-11.md:39`, làm **sau** dự án giao diện.
> Đầu vào: góp ý 1 và 11 (`GOP-Y-20-11.md:7`, `:17`), đề xuất đã nói (`:35`, `:37`), quyết định D2/D3/D4/D7 (`docs/KE_HOACH_PHAT_TRIEN_TOAN_DIEN.md:216`, `:233`, `:238–243`), 7 nguyên tắc (`AGENTS.md:43–49`).
> Ký hiệu bằng chứng: **[C]** = đã đọc code (dẫn tệp:dòng) · **[N]** = nguồn ngoài (tài liệu hãng, blog, tóm tắt tìm kiếm), **chưa kiểm chứng độc lập, phải đọc lại trang gốc trước khi quyết**. Giá, giấy phép, phiên bản plugin, điều khoản Apple/Google/Meta và phạm vi Nghị định đều thuộc loại [N].
> Trong phiên này tôi **có tra** (qua tóm tắt tìm kiếm hoặc đọc trang): plugin Capgo, Credential Manager và kiểm ID token, Play Families policy, Apple 4.8 (chỉ diễn đàn), giá Firebase/Clerk/Supabase, giá dịch vụ mail, Nghị định 147/2024 (chỉ tin tức). Các mục [N] sau là **hiểu biết sẵn có, chưa tra lại**: Clerk không có SDK Capacitor chính thức, giấy phép BSL của Directus, COPPA, callback xóa dữ liệu của Meta, thu hồi token và private relay của Apple, chính sách nội dung do người dùng tạo (UGC) của Play.

---

## 0. Tóm tắt (đọc phần này là đủ)

**Phần A: Đăng nhập Google + email (Facebook sau, Apple khi có iOS)**
1. **Tự làm mỏng trong Gateway, không dùng Firebase/Supabase/Clerk.** Lý do giống hệt D2 đã chốt (Neon thay Supabase để “mọi thứ qua Gateway, không lộ anon key ở client”, `KE_HOACH…:238`). Gateway không giữ mật khẩu nào. Nó chỉ (a) kiểm chữ ký ID token của Google, (b) gửi mã email một lần. Không tốn phí theo MAU, không có kho người dùng thứ hai, không thêm một bên xử lý dữ liệu ở nước ngoài.
2. **Android:** Credential Manager (“Sign in with Google”) qua một cầu nối trong `packages/native`. Ruột cầu nối bắt đầu bằng plugin `@capgo/capacitor-social-login` dòng 7.x (cho Capacitor 7) sau một buổi thử trên emulator. Nếu plugin không ổn thì tự viết plugin Kotlin nhỏ, vì dự án đã có tiền lệ `SystemBarsPlugin.java`. Bản web dùng Google Identity Services, nạp lười. **Client chỉ giữ client ID (định danh công khai), không giữ secret.**
3. **Email:** **mã 6 số gửi qua email (OTP)**, không dùng magic link, không dùng mật khẩu. OTP không cần App Links hay domain cho deep link, chạy giống nhau trên Android, web và iOS, và không phải giữ mật khẩu băm.
4. **Nâng cấp khách thì không có dữ liệu nào phải di chuyển.** Tài khoản khách đã nằm trên server, nên nâng cấp chỉ là thêm một dòng `identities` trỏ vào **đúng `users.id` cũ** và đặt `is_guest = false` (`packages/contracts/src/db/schema.ts:34–37`).
5. **Gộp khi đã có tài khoản ở máy khác:** gộp phía server trong một transaction, theo đúng luật xung đột của `/v1/sync` (`apps/gateway/src/services/learner/repo.ts:204–301`). Hộp thoại cũng có lựa chọn rẻ hơn là “chỉ giữ tiến độ của tài khoản”. **Không dùng lại** `deleteUser` hay `pullAndReplace`. Có thêm kết quả mới `account_merged`.
6. **Bốn chỗ trong code bắt buộc phải đổi** (chi tiết ở A6):
   - Phiên client hiện tự tạo khách mới khi làm mới token thất bại (`packages/api-client/src/session.ts:182–184`). Với tài khoản thật, việc này âm thầm tách dữ liệu, nên phải đổi thành trạng thái “đã đăng xuất”.
   - Mã khôi phục nằm nguyên văn trên máy và được tự dùng (`session.ts:157`, `:173`). Với tài khoản thật, đó là đường vòng qua mặt Google, nên tắt khi nâng cấp.
   - Chưa có đăng xuất.
   - Audit cần thêm loại sự kiện.
7. **Ước lượng:** khoảng **18–20 ngày công** cho Google + email trên Android + web, kèm gộp. Facebook thêm 3–4 ngày, Apple (iOS) thêm 3–5 ngày.

**Phần B: Phân quyền + trang quản trị**
1. **Vai trò:** chủ app, biên tập, người duyệt, hỗ trợ. Quyền tra trong DB ở mỗi request quản trị (JWT hiện chỉ mang `sub`/`typ`, `apps/gateway/src/services/auth/tokens.ts:33`). Chủ app đầu tiên được cấp bằng **lệnh CLI**, không có API cấp quyền đầu tiên.
2. **Nội dung chuyển vào DB có phiên bản:** nháp → duyệt → **bản phát hành bất biến** (snapshot). Rollback bằng cách tạo bản phát hành mới chép từ bản cũ.
   - App vẫn offline nhờ một **gói nội dung JSON** đi kèm bản build, cộng gói mới tải về (manifest + sha256, cùng khuôn với gói âm thanh `apps/gateway/src/routes/audio.ts:9–11`). Gói mới chỉ kích hoạt ở **lần mở app sau**.
   - **Id nội dung bất biến, không bao giờ xóa cứng**, vì dữ liệu người học trỏ vào id (`schema.ts:102`, `:115`, `:216`, `:243`).
3. **Trang admin là một app web riêng `apps/admin`** (không nằm trong APK). API đặt trong Gateway, scope riêng `/admin/v1`, với:
   - token riêng, bắt buộc 2FA (TOTP), xác thực lại cho thao tác nguy hiểm;
   - **nhật ký quản trị ghi trong cùng transaction** với thao tác, chỉ thêm, không dùng lại `audit.record` (loại này ghi kiểu bắn-rồi-quên và có thể bỏ dòng khi hàng đợi đầy, `apps/gateway/src/services/audit/audit.ts:117–137`).
4. **A6/A7:** luật nằm yên trong code, chỉ dữ liệu được sửa.
   - Phải chuyển `NOT_AUTO_LOCALIZED` (đang viết cứng, `packages/content/src/dialects/dialectMap.ts:32`) thành trường dữ liệu.
   - Phải xóa bộ nhớ đệm regex `localizers` (`:34`) mỗi khi đổi gói.
   - Mỗi bản phát hành phải tính lại đáp án A6 của các tình huống và cho người duyệt xem chênh lệch.
   - Sửa chữ thì mất âm thanh dựng sẵn, nên bản phát hành có bước báo độ phủ âm thanh.
5. **Phản biện về thứ tự:** chat (4) đang xếp trước quản trị (5), nhưng chat cần chặn/báo cáo/khóa ngay từ ngày đầu. **Đề xuất tách (5) thành 5a và 5b:**
   - **5a (nền quản trị: vai trò, 2FA, nhật ký, khóa người dùng, hàng chờ báo cáo)** làm trước hoặc cùng (4);
   - **5b (CMS nội dung + gói offline)** làm sau.
6. **Ước lượng:** 5a khoảng **8–10 ngày công**, 5b khoảng **15–20 ngày công**.

**Câu hỏi quan trọng nhất cần bạn** (đủ danh sách ở A11 và B12):
- tạo OAuth client trên Google Cloud và có domain hay không;
- chọn dịch vụ gửi email;
- khai đối tượng trên Play Console và xử lý trẻ em khi thu email (liên quan D4);
- ai là chủ app/biên tập/người duyệt;
- có tách dự án 5 hay không;
- có cần tư vấn pháp lý về chat theo Nghị định 147/2024 không.

---

## 1. Hiện trạng đã kiểm [C]

| Mảng | Hiện trạng | Bằng chứng |
|---|---|---|
| Tạo khách | `POST /v1/auth/guest`: tạo user `is_guest=true`, lưu sha256 của mã khôi phục, trả token + mã (một lần) | `apps/gateway/src/routes/auth.ts:22–29` |
| Làm mới / khôi phục | `/refresh` xoay vòng refresh token, ghi audit khi token cũ bị dùng lại (nhưng **không thu hồi cả họ token**). `/recover` tra theo sha256 mã. Cả hai trả `account_deleted` nếu khớp bia mộ | `auth.ts:32–48`, `:51–70`; `tokens.ts:41–66` |
| Token | Access JWT HS256 `{sub, typ:'access'}` 15 phút; refresh 32 byte, lưu sha256, 90 ngày; mã khôi phục 80 bit nên sha256 thường là đủ | `tokens.ts:7–15`, `:26–35` |
| Xác thực request | Hook `onRequest` kiểm JWT + `typ`, kiểm user còn tồn tại (cache 60 s) | `apps/gateway/src/pipeline/RequestPipeline.ts:58–105` |
| Rate limit | `/v1/auth/*`: **chỉ theo IP**, 10 lần/phút. `/v1/*`: theo người dùng, 60 lần/phút | `apps/gateway/src/app.ts:150–162`, `:165–173`; `apps/gateway/src/config.ts:50–52` |
| Xóa tài khoản | `DELETE /v1/me`: xóa cứng (cascade), chép sha256 refresh token + mã khôi phục vào **bia mộ** `deleted_accounts` để máy khác nhận `account_deleted` rồi xóa dữ liệu trên máy | `apps/gateway/src/routes/me.ts:89–98`; `repo.ts:183–200`; `schema.ts:286–294` |
| Phiên client | Tạo khách lười, single-flight. Làm mới hỏng thì thử mã khôi phục đã lưu, **cuối cùng tự tạo khách mới**. Mã khôi phục lưu nguyên văn trong Preferences/localStorage | `packages/api-client/src/session.ts:50–55`, `:157`, `:162–185` |
| Đổi tài khoản trên máy | `pullAndReplace`: đổi tài khoản rồi **xóa hàng đợi** và thay dữ liệu máy bằng dữ liệu server. `doFlush` từ chối chạy khi đang `switching` | `packages/state/src/sync.ts:569–593` (xóa hàng đợi ở `:575`), `:502–503` |
| Bị xóa ở máy khác | `remote-deleted` thì Host xóa dữ liệu máy | `apps/host-shell/src/account/bootstrap.ts:36–42`; `session.ts:147–152` |
| Audit | `audit_events` chỉ thêm, ghi bất đồng bộ (bỏ dòng khi hàng đợi đầy), metadata theo danh sách trắng, **cấm id người khác**, `user_id` thành NULL khi xóa tài khoản, giữ 180 ngày | `audit.ts:18`, `:28–37`, `:117–137`; `schema.ts:352–379` |
| Cột sẵn có | `users.email` unique (chưa dùng), `account_type`/`parent_user_id` (vô hại) | `schema.ts:36–43` |
| Nội dung | JSON tĩnh khoảng 100 kB trong `packages/content/src/data/`, import tĩnh `with { type: 'json' }` rồi xuất thành hằng đồng bộ (`HONORIFIC_PAIRS_20` dùng ở 8 tệp, `DIALECT_DICTIONARY` 5, `COURSE` 11, `SENTENCE_ITEMS` 6). Gateway cũng đọc (chat, culture, practice, assess, placement) | `packages/content/src/honorifics/HonorificInterpreter.ts:7`, `:64`; `dialectMap.ts:5`, `:19`; `packages/content/src/course/course.ts:7–11`, `:77–99`; `apps/gateway/src/routes/content.ts:10`, `:62` |
| Bảng nội dung | `content_items` đã có từ migration 0000 nhưng **không code nào dùng** (grep) | `schema.ts:147–156`; `apps/gateway/drizzle/0000_init.sql:37` |
| Gói âm thanh | Công khai, tên tệp sha256 bất biến (cache 1 năm), manifest gói cache ngắn. Văn bản đổi thì khóa âm thanh đổi | `audio.ts:9–11`, `:13–28`; `apps/gateway/src/services/tts/prebuild.ts:10–13` |
| Native | `appId vn.edu.uit.becutit`. Manifest chỉ có một intent-filter (MAIN/LAUNCHER), chưa có deep link. Plugin tự viết đã có (`SystemBarsPlugin.java`, `AppSettingsPlugin.java`). Quy tắc không trả proxy plugin qua Promise | `apps/host-shell/capacitor.config.ts:13`; `apps/host-shell/android/app/src/main/AndroidManifest.xml:20–23`; `apps/host-shell/src/native/bootstrap.ts:15–21` |
| Pháp lý | Hồ sơ ĐGTĐ và Data safety đang khẳng định **không có email/SĐT** | `docs/phap-ly/DANH-GIA-TAC-DONG.md:119`; `docs/phap-ly/DATA-SAFETY.md:25` |

---

# PHẦN A. ĐĂNG NHẬP GOOGLE + EMAIL

## A1. Mục tiêu và ràng buộc
- **Giữ dùng thử bằng khách**, chưa hỏi thông tin (D3, `KE_HOACH…:239`). Đăng nhập là tùy chọn và được mời ở thời điểm hợp lý (sau bài đầu tiên, khi bật bạn bè, khi đổi máy).
- **Nâng cấp không mất tiến độ.** Gộp được khi đã có tài khoản ở máy khác. Liên kết được nhiều phương thức.
- **Nguyên tắc 2:** client không giữ secret.
  - OAuth **client ID** của Google, Facebook **App ID/client token** là định danh công khai, được thiết kế để nằm trong app (ghi rõ điều này vào nhật ký để không hiểu nhầm là “API key”).
  - Mọi secret (pepper OTP, khóa API gửi mail, Facebook app secret, khóa `.p8` của Apple) nằm ở biến môi trường Gateway.
- **Nguyên tắc 4:** Gateway gọi `identity.verify('google', …)` và `mail.send(…)`, không gọi tên hãng rải rác. Đổi nhà cung cấp qua biến môi trường. Thiếu cấu hình thì endpoint trả 503 `provider_unavailable` (giống TTS `none`, `config.ts:76`).
- **Nguyên tắc 5:** sửa `packages/contracts/src/api/account.ts` trước.

## A2. Nền tảng: tự làm hay dịch vụ auth

| Tiêu chí | **A. Tự làm mỏng trong Gateway** (đề xuất) | B. Firebase Auth | C. Supabase Auth | D. Clerk |
|---|---|---|---|---|
| Client nói chuyện thẳng với hãng? | Không: client chỉ nói với Google (lấy ID token) và Gateway | Có: SDK Firebase + cấu hình/“API key” trong app | Có: anon key trong client, **đúng lý do D2 đã loại Supabase** | Có: publishable key. Không thấy SDK Capacitor chính thức [N] |
| Kho người dùng thứ hai | Không: `users` là nguồn duy nhất | Có: Firebase UID phải ánh xạ sang `users.id` | Có: `auth.users` | Có |
| Chuyển dữ liệu ra nước ngoài thêm | Không thêm (chỉ Google như mọi app có đăng nhập Google; mail provider là một luồng mới, xem A4) | Thêm Firebase (Mỹ) vào hồ sơ Mẫu 09 | Thêm | Thêm |
| Chi phí | 0 theo MAU; chỉ phí gửi mail | Miễn phí khoảng 50k MAU, sau đó tính theo MAU [N] | Free khoảng 50k MAU [N] | Free khoảng 50k “monthly retained users” từ 02/2026 [N] |
| Gộp với tài khoản khách sẵn có | Tự nhiên (cùng `users.id`) | Phải nối anonymous auth của Firebase với khách của mình, hoặc bỏ khách cũ | Tương tự B | Tương tự B |
| Kích thước app / bundle đầu (trần 68 kB) | Chỉ một plugin nhỏ; GIS nạp lười trên web | SDK Firebase Android + `google-services.json`; SDK JS lớn | SDK JS | SDK JS |
| Công sức | Vừa: kiểm JWT bằng JWKS, OTP, gộp | Thấp cho phần đăng nhập, **nhưng vẫn phải tự làm gộp + ánh xạ** | Như B | Như B |
| Rủi ro tự chịu | Lỗi bảo mật của mình, nhưng mặt tấn công nhỏ (không mật khẩu) | Khóa chặt vào hãng | Như B | Như B |

**Phương án E** (Keycloak/Ory/Logto tự host): thêm một dịch vụ phải vận hành, không đáng với quy mô này.

**Đề xuất A**, vì ba lý do:
1. Cùng phép thử đã dùng cho D2.
2. Phần khó nhất (gộp, giữ khách) dịch vụ ngoài không làm hộ.
3. Không giữ mật khẩu: Google và hộp thư làm phần chứng minh danh tính.

Thư viện kiểm JWT: `jose` (một đường code cho Google, Apple và Facebook Limited Login, đều là OIDC/JWKS). Thêm gói chỉ làm ở bước thực hiện.

## A3. Google trên Android (và web)

### A3.1 Luồng
1. App gọi `POST /v1/auth/nonce`, Gateway trả `nonce` ngẫu nhiên, **dùng một lần**, hạn 5 phút (lưu băm trong `auth_challenges`, A7).
2. `packages/native` gọi `identity.signInWithGoogle({ nonce })`:
   - Android: Credential Manager, `GetSignInWithGoogleOption` với `serverClientId` = **Web client ID**, gắn `setNonce` [N].
   - Web: Google Identity Services, nạp script lười khi mở màn đăng nhập.
3. App gửi `{ idToken, nonce }` tới một trong hai endpoint:
   - Máy **đang có khách** (thường gặp, vì khách được tạo lười ở lần gọi Gateway đầu tiên): `POST /v1/me/identities/google`. Endpoint này nằm trong scope `/v1` **có hook xác thực** (`app.ts:165–173`), nên Bearer của khách được kiểm như mọi route khác và hưởng rate limit theo người dùng.
   - Máy **chưa có tài khoản nào**: `POST /v1/auth/google` (đăng nhập hoặc tạo tài khoản mới).
   - Scope `/v1/auth/*` **không có hook xác thực** (`app.ts:149–162`), nên không đặt luồng nào cần Bearer ở đó. Lý do: tránh mỗi handler tự kiểm token theo cách riêng.
4. Gateway kiểm token:
   - chữ ký theo JWKS của Google (cache theo `Cache-Control`);
   - `iss` thuộc {`accounts.google.com`, `https://accounts.google.com`};
   - `aud` = `GOOGLE_WEB_CLIENT_ID` (sau thêm iOS client ID vào danh sách);
   - `exp`, `iat` (lệch giờ ≤ 60 s, token không cũ hơn 10 phút);
   - **`nonce` khớp và chưa dùng**, rồi đánh dấu đã dùng;
   - `email_verified`.

   Khóa định danh là **`sub`**, không dùng email [N, tài liệu Google về kiểm ID token ở backend].
5. Gateway xử lý theo A6.2 (nâng cấp, đăng nhập hoặc cần gộp).

### A3.2 Chọn ruột cầu nối native

| Phương án | Ưu | Nhược |
|---|---|---|
| **`@capgo/capacitor-social-login` 7.x** | Một plugin cho Google (Credential Manager), Apple, Facebook. Trả ID token, có `nonce`. Giấy phép MPL-2.0 [N] | Dòng 7.x chỉ bảo trì “theo yêu cầu”, dòng 8.x mới được bảo trì chủ động (gắn Capacitor 8) [N] ⇒ phải kiểm peer deps với `@capacitor/core 7.6` |
| Tự viết plugin Kotlin (`androidx.credentials` + `googleid`) | Kiểm soát hết, không phụ thuộc bên thứ ba, đã có tiền lệ plugin tự viết [C] | Tự bảo trì. iOS và Facebook phải viết riêng |
| `@capacitor-firebase/authentication` (`skipNativeAuth`) | Ổn định | Kéo theo dự án Firebase + `google-services.json` mà không cần |
| OAuth qua Custom Tabs + PKCE, Gateway đổi mã | Một luồng cho mọi hãng | Trải nghiệm kém (nhảy trình duyệt), cần deep link/App Links (manifest chưa có, `AndroidManifest.xml:20–23`) |

**Đề xuất:**
- `packages/native/src/identity.ts` theo kiểu Bridge như `speech.ts`: interface `IdentityBridge`, ruột native và ruột web.
- Bắt đầu với Capgo 7.x sau **một buổi thử trên AVD**. Nếu peer deps lệch hoặc lỗi thì chuyển sang plugin tự viết; nơi gọi không phải sửa.
- Bắt buộc theo `AGENTS.md`: proxy plugin để ở biến ngoài, không resolve qua Promise (khuôn `apps/host-shell/src/native/bootstrap.ts:15–21`).
- Chạy skill `thu-tren-emulator` trước khi gộp.

### A3.3 Điều kiện thử và phát hành (dễ bị quên)
- **Emulator cần system image có Google Play** và một tài khoản Google thử. Cần kiểm AVD `BeCuTit_Pixel_API35` có phải image “Google Play” không.
- **Android OAuth client cần SHA-1 của khóa ký.** Gồm debug keystore để thử, upload key, và **khóa App Signing của Play** cho bản phát hành. Keystore phát hành đang hoãn (bộ nhớ dự án “release tasks later”), nên giai đoạn đầu dùng SHA-1 debug.
- Lỗi thường gặp `[28444] Developer console is not set up correctly` là do lệch SHA-1, package name hoặc web client ID [N].
- Màn đồng ý OAuth (consent screen) cần tên app, email hỗ trợ, logo, **URL chính sách quyền riêng tư và domain được ủy quyền**. ID token của Google có thể kèm tên và ảnh (Credential Manager không cho chọn bớt phần thông tin cơ bản, cần kiểm lại [N]). **Gateway bỏ qua và không lưu tên, ảnh.**

## A4. Email: OTP, magic link hay mật khẩu

| | **Mã 6 số (OTP)**, đề xuất | Magic link | Mật khẩu |
|---|---|---|---|
| Cần domain/deep link | Chỉ cần domain gửi mail | Domain + **Android App Links** (`assetlinks.json`) + iOS Universal Links; manifest hiện chưa có | Domain gửi mail (đặt lại mật khẩu) |
| Mở trên máy khác/trình duyệt khác | Không vấn đề (gõ mã) | Hay mở nhầm trình duyệt, không về app | — |
| Bộ quét thư “bấm thử” link | Không ảnh hưởng | Có thể đốt mất link dùng một lần, phải thêm trang “bấm để xác nhận” | — |
| Giữ bí mật ở server | Mã băm, sống 10 phút | Token băm | **Mật khẩu băm (argon2id)**, chống dò, kiểm mật khẩu lộ |
| Hỗ trợ người dùng | Ít | Ít | Nhiều (quên mật khẩu) |

**Chi tiết OTP đề xuất:**
- 6 chữ số, sống 10 phút, **tối đa 5 lần nhập sai cho mỗi mã** (sai quá thì hủy mã).
- Lưu `HMAC-SHA256(AUTH_OTP_PEPPER, email_norm + mã)`. Mã 6 số chỉ có 20 bit, nên **không đủ để dùng sha256 trần** như mã khôi phục 80 bit (`tokens.ts:11–12`). `AUTH_OTP_PEPPER` là bắt buộc ở production, kiểm trong `superRefine` giống `JWT_SECRET` (`config.ts:107–121`).
- So sánh thời gian hằng.
- `POST /v1/auth/email/start` **luôn trả 202** dù email có tài khoản hay không, để chống dò email.
- Chuẩn hóa email: trim, NFC, chữ thường. **Không** bỏ dấu chấm hay `+tag` của Gmail, để tránh gộp nhầm hai hộp thư.

**Dịch vụ gửi mail:**
- Gateway có adapter `MAIL_PROVIDER = resend | ses | smtp | console`. `console` chỉ dùng cho dev/test (in mã ra log) và **bị cấm ở production**.
- Có `MAIL_DAILY_CAP` để chặn hóa đơn bất ngờ.

| Dịch vụ | Gói rẻ nhất [N] | Ghi chú |
|---|---|---|
| Resend | Free 3.000 thư/tháng, **tối đa 100/ngày**; Pro 20 USD/50k | Dễ tích hợp. Trần 100/ngày có thể chạm khi ra mắt |
| Brevo | Free 300/ngày | Gói free gắn logo (cần kiểm với thư giao dịch) |
| Amazon SES | Khoảng 0,10–0,16 USD/1.000 thư (nguồn mâu thuẫn); tài khoản mới ở sandbox | Rẻ nhất khi lớn, thiết lập khó hơn |
| SMTP nhà cung cấp Việt Nam | — | Tránh thêm một luồng chuyển dữ liệu xuyên biên giới |

Mọi dịch vụ đều cần **domain đã xác minh** (SPF, DKIM, DMARC). Email người dùng gửi tới nhà cung cấp ở nước ngoài thì **phải thêm vào hồ sơ chuyển dữ liệu xuyên biên giới** (Mẫu 09, `DANH-GIA-TAC-DONG.md` mục B).

## A5. Facebook (sau) và Apple (khi có iOS)
- **Facebook:**
  - Trên Android, Limited Login thường **không trả `idToken`** [N]. Vì vậy Gateway kiểm access token bằng Graph `debug_token` với app access token (`APP_ID|APP_SECRET`, **chỉ ở server**), đối chiếu `app_id` và `is_valid`, rồi lấy `id` (app-scoped) làm `subject`.
  - Email từ Facebook có thể thiếu hoặc chưa xác minh, nên **không bao giờ liên kết tự động theo email**.
  - Meta yêu cầu URL hướng dẫn hoặc callback xóa dữ liệu [N]. Cần Meta app ở chế độ Live, và có thể cần xác minh doanh nghiệp hoặc xét duyệt [N].
- **Apple:**
  - Guideline 4.8: app dùng đăng nhập bên thứ ba cho tài khoản chính phải có thêm một lựa chọn tương đương về quyền riêng tư. **“Sign in with Apple” đáp ứng điều này** [N, phản hồi của App Review trên diễn đàn Apple]. Ngoại lệ “chỉ dùng hệ tài khoản riêng” chưa rõ có áp được khi app có cả Google hay không, nên coi Sign in with Apple là bắt buộc trên iOS.
  - Gateway kiểm `identityToken` theo JWKS của Apple (`aud` = bundle id), nonce dạng sha256.
  - **Khi xóa tài khoản phải gọi API thu hồi token của Apple.** Việc này cần client secret là JWT ký bằng khóa `.p8`, nằm ở server [N].
  - Thư gửi tới địa chỉ “private relay” của Apple chỉ tới được nếu đã đăng ký domain gửi với Apple [N].
- **Trên Android không làm Apple** (phải đi luồng web OAuth). Chỉ làm khi phát hành iOS.

## A6. Mô hình tài khoản và các luồng

### A6.1 Bảng `identities` (mới)
```
identities(
  id uuid pk,
  user_id uuid not null → users.id ON DELETE CASCADE,
  provider text not null,        -- 'google' | 'email' | 'facebook' | 'apple' (sau có thể 'phone', xem A9)
  subject text not null,         -- google/apple: 'sub'; facebook: id app-scoped; email: email_norm
  email_masked text,             -- 'a***@gmail.com' để hiển thị; KHÔNG lưu email đầy đủ của Google/Facebook
  email_verified boolean not null default false,
  created_at, last_used_at,
  unique(provider, subject), index(user_id)
)
```
- **Liên kết theo `(provider, subject)`, không theo email.** Hai danh tính trùng email ở hai hãng vẫn là hai danh tính khác nhau, trừ khi người dùng **đang đăng nhập** và chủ động liên kết. Nếu tự gộp theo email, kẻ tạo tài khoản Facebook bằng email chưa xác minh của nạn nhân có thể chiếm tài khoản.
- **Tối thiểu hóa dữ liệu:**
  - Với Google/Facebook chỉ cần `sub`. Email đầy đủ chỉ lưu ở danh tính `email` (vì đó chính là khóa đăng nhập).
  - Nếu sau này cần gửi thông báo tài khoản thì thêm cột bằng một migration mới.
  - Không dùng cột `users.email` có sẵn (`schema.ts:36`) để đăng nhập; để trống.

### A6.2 Các luồng

**(1) Nâng cấp khách → tài khoản thật** (đường chính, rẻ nhất)
- Khách gửi `POST /v1/me/identities/google` (hoặc `/v1/me/identities/email/verify`) với Bearer của mình (scope `/v1` có hook xác thực), kèm danh tính **chưa thuộc ai**.
- Gateway thêm `identities` cho **chính `users.id` đó** và đặt `is_guest=false`, trả `{status:'signed_in', linked:true, userId: <không đổi>}`.
- Không có dữ liệu nào di chuyển, đồng bộ không bị ảnh hưởng. Client đặt `StoredAuth.kind='account'` và tắt mã khôi phục (xem (7)).

**(2) Đăng nhập trên máy mới** (danh tính đã thuộc tài khoản U_A)
- Nếu máy không có khách, hoặc có khách **chưa có tiến độ** (server đếm: không có dòng `srs_cards`, `attempts`, `xp_events`, `lesson_progress`):
  - Gateway trả token của U_A và xóa khách rỗng. Hash refresh token và mã khôi phục của khách đi vào bia mộ với lý do `merged` (xem A7).
  - Client chạy `pullAndReplace` như luồng khôi phục hiện tại (`apps/mfe-learner/src/preferences/AccountSection.tsx:107`).
- Nếu khách **có tiến độ**, Gateway trả `{status:'needs_merge', mergeTicket, target:{createdAt, hasProgress}}`, rồi chuyển sang luồng (3).

**(3) Gộp: hai phương án**

| | M1. “Chọn một bên” | **M2. Gộp thật phía server** (đề xuất) |
|---|---|---|
| Người dùng thấy | “Tài khoản này đã có tiến độ. Dùng tiến độ của tài khoản (bỏ tiến độ trên máy này)?” | Ba nút: **Gộp tiến độ máy này vào tài khoản** · Chỉ dùng tiến độ của tài khoản · Hủy |
| Cách làm | Xóa khách U_B rồi `pullAndReplace` sang U_A | Một transaction chuyển/gộp từng bảng của U_B vào U_A theo bảng dưới, rồi xóa U_B |
| Công sức | Khoảng 1 ngày | Khoảng 3 ngày kèm test từng bảng |
| Mất dữ liệu | Có (tiến độ trên máy B) | Không |

Lý do đề xuất M2: mô hình đồng bộ đã được thiết kế để gộp được (LWW, `greatest`, OR, chỉ thêm, sổ chống trùng), nên luật gộp chỉ là chép lại luật của `applyOne`. Yêu cầu của bạn là “không mất tiến độ”. M1 vẫn có mặt như một nút trong cùng hộp thoại.

**Luật gộp M2 (U_B khách → U_A đích):**
- Khóa hai dòng `users` theo thứ tự id (`FOR UPDATE`) để tránh deadlock.
- Chỉ cho gộp **khách vào tài khoản**, không gộp hai tài khoản thật với nhau ở bản đầu.

| Bảng | Luật | Căn cứ |
|---|---|---|
| `users` (hồ sơ) | LWW theo `profile_updated_at` | như `profile.set`, `repo.ts:208–215` |
| `preferences` | LWW theo `updated_at` | `putPreferences`, `repo.ts:48` |
| `srs_cards` (+ `srs_reviews`) | Trùng `item_ref` thì giữ thẻ có `updated_at` mới hơn. Lịch sử ôn chuyển sang id thẻ được giữ | `srs.upsert`, `repo.ts:218–226` |
| `attempts`, `placement_sessions`, `sessions`/`messages` | Đổi `user_id` sang U_A | chỉ thêm |
| `xp_events` | Đổi `user_id`; trùng `client_event_id` (UUID) thì bỏ | unique `schema.ts:220` |
| `daily_activity` | `seconds = greatest`, **`xp = cộng`** (sự kiện XP của hai bên khác nhau), `goal_met`/`freeze_used` dùng OR | `activity.set`/`xp.add`/`day.mark`, `repo.ts:232–240`, `:249–255`, `:275–291` |
| `lesson_progress` | completed thắng, `best_score = max`, `completed_at` lấy giá trị sớm nhất | `repo.ts:256–271` |
| `achievements` | Hợp, `earned_at` sớm nhất | `repo.ts:272–274` |
| `learner_progress` | LWW, riêng `lessons_done = max` (không lùi số bài) | `repo.ts:292–300` |
| `consents` | **Không gộp: giữ đồng ý của U_A.** Máy sẽ hỏi lại khi cần. Coi đồng ý trên máy B là đồng ý cho tài khoản A là suy diễn, trái với “im lặng không phải là đồng ý” (Luật 91/2025 Điều 9, `DANH-GIA-TAC-DONG.md:16`) | an toàn pháp lý |
| `ai_usage` | **Cộng `units`** theo (ngày, năng lực), để gộp không làm mới hạn mức AI | `schema.ts:301–311` |
| `sync_events` | Chép sổ chống trùng của U_B sang U_A (bỏ trùng). Nhờ đó các sự kiện còn trong hàng đợi của các máy U_B **gửi lại vào U_A cũng không bị cộng hai lần** | `schema.ts:264–273`; `repo.ts:309–327` |
| `social_profiles` | U_A có thì giữ của U_A, chưa có thì chuyển của U_B | PK user, `schema.ts:318–324` |
| `friend_invites` | Xóa của U_B | PK user, `schema.ts:330–337` |
| `friendships` | Đổi U_B thành U_A, **sắp lại `user_a < user_b`** (`apps/gateway/src/services/social/friends.ts:73`). Bỏ cặp tự-kết-bạn (nếu A và B từng là bạn). Trùng cặp thì giữ dòng cũ hơn (unique `schema.ts:349`) | |
| `audit_events` | **Không sửa dòng cũ** (giữ nguyên tắc chỉ thêm, `audit.ts:11`). Khi xóa U_B, FK `ON DELETE SET NULL` tự ẩn danh các dòng của U_B như khi xóa tài khoản. Dòng mới `auth.account_merged` ghi trên U_A, không chứa id U_B | `schema.ts:353–358`, `:368` |
| `refresh_tokens` + mã khôi phục của U_B | Chép hash refresh token **và hash mã khôi phục** vào bia mộ với lý do **`merged`**, rồi xóa U_B (cascade) | bảng A7 |

**Vì sao không dùng lại code cũ:**
- `deleteUser` (`repo.ts:183–195`) ghi bia mộ “đã xóa”. Khi đó các máy khác của U_B nhận `account_deleted`, đi qua `remoteDeleted` (`session.ts:147–152`), rồi Host **xóa sạch dữ liệu máy** (`bootstrap.ts:36–42`). Với gộp, kết quả đúng phải là “đăng nhập lại”.
- `pullAndReplace` xóa hàng đợi (`sync.ts:575`), trong khi gộp cần **đẩy hết hàng đợi lên U_B trước**. Thêm nữa, `doFlush` bỏ qua khi đang `switching` (`sync.ts:503`).

Vì vậy cần một method mới trong engine, `mergeInto(switchAccount)`, chạy bốn bước:
1. `flush()` khi còn là U_B (bắt buộc có mạng);
2. `POST /v1/me/merge {mergeTicket, strategy}` với Bearer của U_B (scope `/v1` có hook xác thực);
3. nhận token U_A;
4. `replaceFromServer()`.

**Máy thứ ba còn giữ U_B:**
- Lần làm mới token nhận `401 account_merged`. Client phát lý do mới `merged-elsewhere` và hiện “Tài khoản khách này đã được gộp vào tài khoản Google/email, hãy đăng nhập”, **không xóa dữ liệu máy**.
- Sau khi đăng nhập U_A: đẩy hàng đợi cũ (giữ nguyên `clientEventId`; sổ chống trùng đã chép sang U_A nên không cộng hai lần), rồi kéo và thay.

`mergeTicket`:
- được cấp ngay sau khi Gateway vừa kiểm danh tính của U_A (Google hoặc OTP);
- gắn với cặp (U_B, U_A), dùng một lần, sống 10 phút;
- lưu băm trong `auth_challenges`.

**(4) Liên kết thêm / gỡ liên kết**
- `GET /v1/me/identities` liệt kê danh tính với email đã che.
- Liên kết thêm: gọi `/v1/me/identities/google` hoặc `/v1/me/identities/email/verify` khi đã là tài khoản. Nếu danh tính đã thuộc người khác thì trả `409 identity_in_use` (không gộp hai tài khoản thật).
- `DELETE /v1/me/identities/:id`: từ chối `409 last_identity` nếu đó là phương thức cuối cùng (và không có mã dự phòng), để người dùng không tự khóa mình ở ngoài.

**(5) Đăng xuất** (hiện chưa có)
- `POST /v1/auth/logout {refreshToken, everywhere?}` thu hồi một hoặc mọi refresh token. Endpoint này xác thực bằng chính refresh token (giữ được token là đủ), nên nằm được trong scope `/v1/auth` không có hook.
- Client: `flush`, gọi logout, rồi `resetLocal()` **không xóa tài khoản** (`sync.ts:595–620`), để máy dùng chung (trẻ em, gia đình) không lộ dữ liệu. Lần sau mở app sẽ tự tạo khách mới như người mới.

**(6) Phiên của tài khoản thật hết hạn hoặc hỏng**
- `obtain()` hiện tự tạo khách mới (`session.ts:182–184`). Với `kind:'account'`, đổi thành: phát `signed-out`, giữ dữ liệu máy và hàng đợi (chủ vẫn là U_A), cho học offline, hiện “Đăng nhập lại để đồng bộ”. **Không thử mã khôi phục, không tạo khách.**
- Nếu người dùng đăng nhập bằng một tài khoản khác U_A, hỏi trước. Dữ liệu máy thuộc U_A, nên phải đăng xuất máy (đẩy và xóa) rồi mới vào tài khoản mới.

**(7) Mã khôi phục sau khi nâng cấp**
- Đề xuất: **tắt khi gắn danh tính đầu tiên.** Server đặt `recovery_code_hash = NULL` và chép hash vào bia mộ lý do `upgraded`; client xóa mã khỏi máy.
- Lý do: mã nằm nguyên văn trên máy và được tự dùng (`session.ts:157`, `:173`), tức là một đường vào bỏ qua Google.
- Tác dụng của bia mộ: máy khác còn giữ mã đó sẽ nhận `account_upgraded` (mời đăng nhập Google/email) thay vì âm thầm tạo khách mới.
- **Thời hạn bia mộ phải khác nhau theo loại credential.** Hiện mọi dòng bia mộ bị dọn sau 90 ngày (`repo.ts:176`, `:190`), vì refresh token hết hạn sau 90 ngày. **Mã khôi phục thì không bao giờ hết hạn.** Một máy offline quá 90 ngày sẽ không còn thấy dòng `upgraded`/`merged`, rơi xuống nhánh tự tạo khách (`session.ts:182–184`) và tách dữ liệu.
  - Vì vậy hash mã khôi phục giữ **lâu dài**: không dọn, hoặc tối thiểu vài năm, cần bạn chốt.
  - Hash refresh token vẫn dọn sau 90 ngày.
  - Cần cột `expires_at` (NULL = giữ mãi), và job dọn theo cột này thay cho `deleted_at` (A7).
- Tùy chọn “Tạo mã dự phòng” (`POST /v1/me/recovery-code`): sinh mã mới, hiện một lần, **không lưu trên máy**. **Tài khoản nhân sự (Phần B) cấm mã dự phòng.**

**(8) Xóa tài khoản**
- `DELETE /v1/me` giữ nguyên. `identities` mất theo cascade, bia mộ như cũ (`repo.ts:183–195`).
- Ghi rõ trên giao diện: “Đăng nhập lại bằng Google sẽ tạo tài khoản mới trống”.
- iOS: gọi thu hồi token Apple. Facebook: endpoint callback xóa dữ liệu.
- Khi có đăng nhập web, **trang yêu cầu xóa trên web mà Play bắt buộc** (`DATA-SAFETY.md:16`) làm được đúng nghĩa: đăng nhập rồi xóa.

**Phiên khác** (tùy chọn, nên có): `refresh_tokens.family_id`. Khi phát hiện dùng lại token đã xoay vòng, **thu hồi cả họ** (hiện chỉ ghi audit, `auth.ts:40–41`). Với tài khoản thật đây là biện pháp chống lộ token đáng làm.

## A7. Thay đổi contract và schema dự kiến (chưa làm)

**Schema** (một migration mới, ví dụ `0007_identities`, sinh bằng `db:generate`; **không sửa 0000–0006**):

| Thay đổi | Ghi chú |
|---|---|
| `identities` (A6.1) | mới |
| `auth_challenges(id, kind 'oidc_nonce'\|'email_otp'\|'merge_ticket', key_hash, subject, user_id null, attempts, expires_at, consumed_at, created_at)` | một bảng cho mọi thử thách ngắn hạn; job dọn sau 1 ngày (cùng lịch với dọn audit, `app.ts:102–111`) |
| `deleted_accounts` + cột `reason text not null default 'deleted'` (`deleted` \| `merged` \| `upgraded`) + cột `expires_at` (NULL = giữ mãi) | `ALTER TABLE ADD COLUMN` trong migration mới. Bảng giữ tên, ý nghĩa mở rộng thành “credential đã nghỉ hưu”. Hash refresh token: `expires_at` = +90 ngày. Hash mã khôi phục: giữ lâu dài (A6.2(7)). Đổi job dọn (`repo.ts:190`) sang lọc theo `expires_at` |
| `refresh_tokens` + `family_id uuid`, `last_used_at` (tùy chọn `device_label`) | thu hồi theo họ; danh sách thiết bị (sau) |
| `users`: không đổi | `is_guest` lật thành false; `email` để trống |

**Contract** (`packages/contracts/src/api/account.ts`, viết trước):
- `AuthProviderSchema = z.enum(['google','email','facebook','apple'])`
- `AuthNonceResponseSchema {nonce, expiresIn}`
- `AuthGoogleRequestSchema {idToken, nonce}`, dùng chung cho `POST /v1/auth/google` (không Bearer) và `POST /v1/me/identities/google` (có Bearer); sau thêm `AuthFacebookRequestSchema`, `AuthAppleRequestSchema`
- `AuthEmailStartRequestSchema {email}` (luôn 202); `AuthEmailVerifyRequestSchema {email, code}`
- `AuthSignInResponseSchema`: union phân biệt theo `status`, gồm `signed_in {tokens…, linked, isGuest:false, providers}` và `needs_merge {mergeTicket, target:{createdAt, hasProgress}}`
- `AuthMergeRequestSchema {mergeTicket, strategy:'merge'|'discard_device'}` cho `POST /v1/me/merge` → `AuthTokensSchema` (`account.ts:38–46`)
- **Chia scope:** `/v1/auth/*` (không hook) chỉ chứa các luồng không cần Bearer: `nonce`, `google`, `email/start`, `email/verify`, `refresh`, `recover`, `logout`. `/v1/me/*` (có hook, `app.ts:165–173`) chứa `identities/*`, `merge`, `recovery-code`
- `AuthLogoutRequestSchema {refreshToken, everywhere?}`
- `IdentityListResponseSchema`, `RecoveryCodeResponseSchema`
- Mã lỗi mới: `account_merged`, `account_upgraded`, `identity_in_use`, `last_identity`, `provider_unavailable`, `otp_invalid`, `otp_expired`, `otp_locked` (sau thêm `account_suspended` ở Phần B)

**`packages/api-client/src/session.ts`:**
- `StoredAuth` thêm `kind: 'guest'|'account'` và `providers`.
- Method mới: `signInWithGoogle`, `startEmail`, `verifyEmail`, `merge`, `logout`, `identities`.
- `UserChangeReason` thêm `signed-in`, `merged`, `signed-out`, `merged-elsewhere`.
- `obtain()` theo A6.2(6).

**`packages/state/src/sync.ts`:** `mergeInto(switchAccount)`.

**`packages/native`:** `identity.ts` (Bridge native/web).

**Gateway:**
- `providers/identity.ts` (interface `IdentityProvider.verify`), `services/mail/`, `routes/auth.ts` (luồng không Bearer), `routes/me.ts` hoặc `routes/identities.ts` (luồng có Bearer), `services/auth/merge.ts`.
- Biến môi trường: `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_EXTRA_AUDIENCES`, `MAIL_PROVIDER`, `MAIL_API_KEY`, `MAIL_FROM`, `MAIL_DAILY_CAP`, `AUTH_OTP_PEPPER` (bắt buộc ở production), sau thêm `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET` và `APPLE_*`.

## A8. Rate limit và audit

**Rate limit** (thêm vào giới hạn IP 10 lần/phút sẵn có của `/v1/auth/*`, `app.ts:152–158`):

| Endpoint | Giới hạn đề xuất |
|---|---|
| `/auth/email/start` | mỗi email: 3 lần / 15 phút, 10 lần / ngày; mỗi IP: 10 lần / giờ; toàn hệ thống: `MAIL_DAILY_CAP` |
| `/auth/email/verify` và `/v1/me/identities/email/verify` | 5 lần sai mỗi mã (hủy mã); 10 lần sai mỗi email mỗi ngày thì khóa 1 giờ |
| `/auth/google`, `/auth/nonce` | theo IP như hiện tại; nonce dùng một lần |
| `/v1/me/merge`, `/v1/me/identities/*` | mỗi người dùng 5 lần / giờ (rate limit riêng route, như mã mời bạn bè `config.ts:54`), ngoài giới hạn chung 60 lần/phút của `/v1` |

Ý sản phẩm, cần bạn quyết: **hạn mức AI cho khách thấp hơn tài khoản thật.** Mỗi khách mới là một hạn mức AI mới (`auth.ts:17–18`), nên nâng cấp cũng là cách chống lạm dụng.

**Audit:** thêm vào danh sách trắng `METADATA` (`audit.ts:28–37`). **Không bao giờ ghi email vào metadata.**

| Loại | Metadata |
|---|---|
| `auth.signin` | `{provider, reason?}` (thành công/thất bại) |
| `auth.identity_linked` / `auth.identity_unlinked` | `{provider}` |
| `auth.account_merged` | `{strategy}` (không có id U_B) |
| `auth.email_code_sent` / `auth.email_code_failed` | `{}` / `{reason}` |
| `auth.recovery_code_rotated`, `auth.logout` | `{}` / `{everywhere}` |

## A9. Rủi ro bảo mật và pháp lý

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Chiếm tài khoản qua liên kết theo email | Cao | Liên kết theo `(provider, sub)`; không tự gộp theo email (A6.1) |
| Phát lại ID token bị đánh cắp | TB | Nonce do server cấp, dùng một lần; `aud`/`iss`/`exp` chặt |
| Dò mã OTP / dò email | TB | Giới hạn theo mã, theo email, theo IP; pepper; trả lời như nhau |
| Tài khoản bị tách âm thầm (khách mới thay tài khoản thật) | Cao | Trạng thái `signed-out` cho `kind:'account'` (A6.2(6)) |
| Lỗi gộp làm mất hoặc nhân đôi dữ liệu | Cao | Một transaction; test từng bảng; chép sổ chống trùng; diễn tập sao lưu/khôi phục (`docs/van-hanh/BACKUP.md`) trước khi bật; chỉ gộp khách vào tài khoản |
| Plugin 7.x ít được bảo trì [N] | TB | Cầu nối trong `packages/native` thay được ruột; phương án plugin tự viết |
| Bẫy native (proxy plugin qua Promise, SHA-1, image không có Play) | TB | Quy tắc `AGENTS.md`; skill `thu-tren-emulator`; `kien-truc` xem lại |
| Lộ DB giờ lộ cả email | TB | Chỉ lưu email đầy đủ ở danh tính `email`; mã hóa đĩa của hosting; **sửa hồ sơ** `DANH-GIA-TAC-DONG.md:119` (đang ghi “không có email”) |
| Hồ sơ pháp lý lệch thực tế | Cao (bị phạt) | Cập nhật Data safety (`DATA-SAFETY.md:25`: thêm Email address, Account management), chính sách `/quyen-rieng-tu`, hồ sơ ĐGTĐ mục A.c, Mẫu 09 (thêm nhà cung cấp mail) |
| **Trẻ em và thu email/Google (D4)** | Cao, cần bạn quyết | Luật 91/2025 Điều 24 (cha mẹ đồng ý cho trẻ; hồ sơ đang ghi “chính sách yêu cầu cha mẹ đồng ý thay”, `DANH-GIA-TAC-DONG.md:121`). Nếu phát hành tại Mỹ, COPPA coi email của trẻ dưới 13 là thông tin cá nhân, cần đồng ý có kiểm chứng của cha mẹ [N]. Play Families policy: app có nhóm trẻ em phải công bố việc thu dữ liệu; tính năng xã hội cần “hành động của người lớn” trước khi trẻ trao đổi thông tin cá nhân; app *chỉ* nhắm trẻ em không được dùng API OAuth chưa được duyệt cho trẻ em [N]. Gợi ý (cần bạn chốt vì chạm D4): khách vẫn mở cho mọi người (không có dữ liệu định danh); **chỉ khi liên kết email/Google** mới hỏi năm sinh theo kiểu trung lập; dưới ngưỡng thì “nhờ bố mẹ đăng nhập bằng email/Google của bố mẹ” |
| Nghị định 147/2024 (mạng xã hội phải xác thực tài khoản bằng SĐT Việt Nam hoặc mã định danh trước khi đăng nội dung) [N] | Chưa rõ, ảnh hưởng chủ yếu dự án chat (4) | Cần tư vấn xem chat/nhóm giữa bạn học có bị coi là “mạng xã hội” không. `identities.provider` để mở cho `phone` |

## A10. Ước lượng (ngày công, một người + agent)

| Hạng mục | Ngày | Agent theo `AGENTS.md` §5 |
|---|---|---|
| Contract + schema + migration 0007 | 1,5 | `kien-truc` (Opus, xhigh) |
| Gateway: identity Google (`jose`), nonce, nâng cấp/đăng nhập/gỡ liên kết, đăng xuất, mã dự phòng, thu hồi theo họ | 3 | `lam-tinh-nang`, `kien-truc` review |
| Email OTP + adapter mail + rate limit | 2 | `lam-tinh-nang` |
| Gộp phía server + test từng bảng | 3 | `kien-truc` |
| Client: phiên (`kind`, signed-out, logout, merge), `mergeInto` trong sync | 3 | `kien-truc` (race/đồng bộ) |
| Native: cầu nối + plugin + emulator (image Play) + GIS web | 2–3 | `kien-truc` + skill `thu-tren-emulator` |
| Giao diện: tấm đăng nhập, mục Tài khoản trong Hồ sơ, hộp thoại gộp, i18n vi+en | 2 | `lam-tinh-nang` (sau dự án giao diện) |
| Audit, hồ sơ pháp lý, e2e | 1,5 | `tai-lieu` viết, `kien-truc` duyệt phần pháp lý |
| **Tổng** | **≈ 18–20 ngày** (khoảng 4 tuần lịch) | |
| Facebook (sau) | +3–4 | |
| Apple (khi có iOS, gồm thu hồi token) | +3–5 | |

## A11. Câu hỏi chỉ bạn trả lời được (Phần A)
1. **Google Cloud:** bạn tạo project, màn đồng ý OAuth, **Web client ID** và **Android client ID** (package `vn.edu.uit.becutit` + SHA-1 debug trước). Tài khoản Google Cloud đứng tên cá nhân hay tổ chức?
2. **Domain:** có mua domain không? Domain cần cho gửi mail (SPF/DKIM), URL chính sách trong màn đồng ý OAuth, trang yêu cầu xóa tài khoản trên web (`DATA-SAFETY.md:16`), và App Links nếu sau này muốn magic link.
3. **Dịch vụ gửi email:** Resend, Brevo, Amazon SES hay SMTP nhà cung cấp Việt Nam? Bạn tạo tài khoản và xác minh domain. Bạn có đồng ý ghi thêm luồng chuyển email ra nước ngoài vào hồ sơ Mẫu 09 không (nếu chọn dịch vụ nước ngoài)?
4. **Email:** OTP 6 số (đề xuất), magic link, hay mật khẩu?
5. **Gộp:** M2 gộp thật (đề xuất), hay chỉ M1 chọn một bên?
6. **Mã khôi phục sau nâng cấp:** tắt, cho tạo mã dự phòng tùy chọn (đề xuất), hay giữ như cũ? Hash của mã đã nghỉ hưu giữ bao lâu trong bia mộ (đề xuất: lâu dài, vì mã không hết hạn)?
7. **Đăng xuất trên máy dùng chung:** xóa dữ liệu học trên máy (đề xuất), hay giữ?
8. **Trẻ em (D4):** khai “nhóm tuổi mục tiêu” trên Play Console thế nào (có nhóm dưới 13 không)? Khi liên kết email/Google có hỏi năm sinh và chuyển sang “tài khoản của bố mẹ” dưới ngưỡng không? Có phát hành ở Mỹ không (COPPA)?
9. **Facebook:** có làm không, và khi nào sẵn sàng tạo Meta app, xác minh doanh nghiệp?
10. **Nền tảng:** đồng ý tự làm mỏng trong Gateway (đề xuất) thay vì Firebase/Supabase/Clerk?
11. **Hạn mức AI:** khách có hạn mức thấp hơn tài khoản thật không?
12. Pháp nhân phát hành (cá nhân, hộ kinh doanh hay doanh nghiệp) là ai? Câu này ảnh hưởng tài khoản Google Cloud/Meta/Apple Developer và hồ sơ (`DANH-GIA-TAC-DONG.md` mục C.1).

---

# PHẦN B. PHÂN QUYỀN + TRANG QUẢN TRỊ

## B1. Vai trò và ma trận quyền
- Nhân sự là `users` **có danh tính thật** (Google hoặc email). Đề xuất dùng **tài khoản riêng cho công việc**, không dùng tài khoản học cá nhân.
- Tài khoản nhân sự không có mã khôi phục.
- Một người có thể giữ nhiều vai trò.

| Quyền | Chủ app | Biên tập | Người duyệt | Hỗ trợ |
|---|:-:|:-:|:-:|:-:|
| Xem nội dung + lịch sử | ✓ | ✓ | ✓ | ✓ (chỉ đọc) |
| Tạo/sửa bản nháp, gửi duyệt | ✓ | ✓ | — | — |
| Duyệt/từ chối bản nháp **của người khác** | ✓ | — | ✓ | — |
| Duyệt âm thanh (nghe xác nhận giọng miền, D9) | ✓ | — | ✓ | — |
| Tạo bản phát hành, đẩy lên kênh beta/stable, rollback | ✓ | — | ✓ (tùy bạn chọn) | — |
| Tra cứu tài khoản (thông tin tối thiểu, email che) | ✓ | — | — | ✓ |
| Khóa/mở khóa người dùng (bắt buộc lý do) | ✓ | — | — | ✓ |
| Xử lý báo cáo vi phạm | ✓ | — | — | ✓ |
| Xử lý yêu cầu quyền dữ liệu (xuất, xóa hộ) | ✓ | — | — | ✓ |
| Hiện email đầy đủ (bắt buộc lý do, ghi nhật ký) | ✓ | — | — | ✓ |
| Cấp/thu vai trò nhân sự | ✓ | — | — | — |
| Xem nhật ký quản trị | ✓ | — | — | — |

**Luật bốn mắt:** người viết khác người duyệt. Giai đoạn chỉ có một người thì cho chủ app tự duyệt bằng cờ cấu hình `CONTENT_SELF_APPROVE`, nhưng dòng nhật ký gắn `self_approved: true`.

**Kiểm quyền:** `requirePermission('content.publish')` đọc `staff_roles` từ DB **ở mỗi request quản trị**, không cache (lưu lượng quản trị rất nhỏ). Thu quyền có hiệu lực ngay. Hiện JWT không mang vai trò (`tokens.ts:33`) và giữ nguyên như thế.

**Chủ app đầu tiên:** lệnh CLI `pnpm --filter @vietlearning/gateway admin:grant --email <x> --role owner`, chạy với quyền truy cập DB (vốn đã là ranh giới tin cậy), có ghi nhật ký với tác nhân `cli`. **Không có API hay biến môi trường nào tự cấp quyền.**

## B2. Nội dung: phương án lưu trữ

| | **B-A. DB có phiên bản trong Gateway + gói phát hành bất biến** (đề xuất) | B-B. Git làm CMS | B-C. CMS dựng sẵn (Directus/Payload/Strapi) |
|---|---|---|---|
| Cách làm | Bảng nội dung + bản sửa + bản phát hành (B3). Gateway kiểm Zod + luật nghiệp vụ rồi dựng gói | Admin ghi commit/PR vào `packages/content/src/data` qua GitHub API; CI chạy test nội dung hiện có; merge thì CI dựng gói | Dịch vụ CMS cạnh Gateway; webhook xuất bản gọi Gateway dựng gói |
| Lịch sử / rollback | Tự làm (đơn giản: snapshot) | Miễn phí (git) | Có sẵn |
| Kiểm luật (NFC, tham chiếu, A6, A7) | Dùng lại hàm của `packages/content` ngay trong luồng duyệt | Test sẵn có chạy ở CI | Phải viết hook, dễ bị bỏ qua vì CMS ghi thẳng DB |
| Tài khoản + 2FA | Chung hệ tài khoản app | Cần UI riêng đọc/ghi PR; token GitHub có quyền ghi repo nằm trên server ⇒ chiếm được admin là sửa được cả code (phải dựa vào branch protection) | Hệ người dùng/2FA riêng của CMS |
| Vận hành | Không thêm dịch vụ | Phụ thuộc GitHub + thời gian CI (vài phút) | Thêm một dịch vụ phải vá, sao lưu, bảo vệ; giấy phép (Directus là BSL) [N] |
| Quản lý người dùng (phải có) | Cùng app admin | Vẫn phải làm riêng | Vẫn phải làm riêng trong Gateway |

**Đề xuất B-A.** Bạn muốn **một** trang quản trị cho cả nội dung lẫn người dùng, đi cùng hệ tài khoản và 2FA, có kiểm luật A6/A7 ngay lúc duyệt. B-B rẻ hơn nếu chỉ cần sửa nội dung, nhưng phần UI cho người duyệt không rành Git vẫn phải viết, và nó trái yêu cầu “chuyển sang DB”.

Bảng `content_items` hiện có (`schema.ts:147–156`) chưa ai dùng và không chứa được lịch sử (một dòng mỗi id). **Không dùng lại.** Tạo bảng mới, sau đó xóa `content_items` bằng một migration mới (không sửa 0000).

## B3. Mô hình dữ liệu và quy trình

```
content_entities(id text pk,        -- GIỮ NGUYÊN id hiện có: 'w33', 'h5', 'd28', 'u1', 'u1l2', 'hs4', 'st1'…
                 type text,          -- honorific | dialect | culture | sentence | course_word | course_sentence |
                                     -- unit | situation | story | scenario | placement | tone_set | tone
                 created_by, created_at, retired_at)          -- KHÔNG xóa cứng
content_revisions(id uuid pk, entity_id → content_entities, rev int, payload jsonb, schema_version int,
                  status 'draft'|'in_review'|'approved'|'rejected'|'superseded',
                  base_rev int,      -- khóa lạc quan: sửa chồng lên bản đã đổi ⇒ phải làm lại
                  author_id, created_at, submitted_at, reviewed_by, reviewed_at, review_note,
                  unique(entity_id, rev))
content_releases(id serial pk,       -- = contentVersion, tăng dần
                 schema_version int, min_app_version text, notes, created_by, created_at,
                 pack_sha256, pack_size, copied_from_release int null)   -- rollback = bản chép
content_release_items(release_id, entity_id, revision_id, pk(release_id, entity_id))   -- bất biến
content_channels(name pk 'beta'|'stable', release_id, updated_by, updated_at)
```

**Quy trình:**
1. Biên tập tạo hoặc sửa bản nháp, gửi duyệt (`in_review`).
2. Người duyệt (khác tác giả) bấm **Duyệt** hoặc **Từ chối** (kèm ghi chú). Màn duyệt luôn hiện chênh lệch (diff) với bản đang xuất bản và **kết quả kiểm tra tự động** (B5).
3. “Tạo bản phát hành” = bản phát hành hiện tại + các bản đã duyệt. Bước này chạy **bộ kiểm toàn gói**; còn lỗi thì không tạo được. Dựng gói JSON, tính sha256, lưu.
4. Đẩy lên kênh **beta** (máy nhân sự hoặc người thử) trước, rồi **stable**.
5. **Rollback:** chọn bản cũ N. Hệ thống tạo bản phát hành mới N+k **chép** các mục của N rồi trỏ stable vào đó. Số phiên bản luôn tăng, nên client chỉ cần luật “khác thì tải”, và lịch sử thẳng một đường.
6. **Gỡ một mục** = đặt `retired_at` (không cho bài mới tham chiếu). **Không xóa cứng**, vì dữ liệu người học trỏ vào id: `lesson_progress.lesson_id` (`schema.ts:243`), `srs_cards.item_ref` (`:115`), `xp_events.lesson_id` (`:216`), `attempts.item_id` (`:102`). Thẻ SRS vẫn ôn được vì `srs_cards` lưu sẵn `front/back` (`:116–117`).

**Nhập lần đầu:** script đọc JSON hiện tại thành `content_entities` + `rev 1 approved` + bản phát hành số 1. Chạy script này trên DB production một lần, có ghi nhật ký quản trị. Phải kiểm **gói số 1 tương đương ngữ nghĩa** với JSON hiện tại (cùng kết quả test).

## B4. Gói nội dung offline
- **Định dạng gói:** giữ **đúng hình dạng các tệp JSON hiện tại** (`honorifics`, `dialects`, `course{units,words,sentences,situations,stories}`, `sentences`, `culture`, `placement`, `scenarios`, `toneSets`, `tones`) cộng `{contentVersion, schemaVersion, minAppVersion, createdAt}`. Nhờ vậy code của `packages/content` gần như không đổi. Kích thước khoảng 101 kB thô (đo bằng `wc -c` các tệp data), gzip còn nhỏ hơn nhiều.
- **Phục vụ** (cùng khuôn gói âm thanh, `audio.ts:9–11`, `:23–27`):
  - `GET /content/manifest.json`: công khai, cache 5 phút, gồm `{contentVersion, schemaVersion, minAppVersion, url, sha256, size}`;
  - `GET /content/packs/<v>-<sha>.json`: bất biến, cache 1 năm.
  - Nội dung miễn phí không phải dữ liệu cá nhân nên để công khai. Khi có gói đăng ký (dự án 6) thì nội dung trả phí dùng URL có chữ ký.
- **Toàn vẹn:** HTTPS + sha256 trong manifest. Tùy chọn ký manifest bằng Ed25519 (khóa công khai nằm trong app) nếu sau này dùng CDN.
- **Client:**
  - Bản build **đóng kèm gói nền**, nên lần mở đầu tiên chạy offline hoàn toàn.
  - **Nguồn của gói nền (đề xuất): JSON trong repo vẫn là bản nền được commit**, không phải bước build tự kéo từ DB.
    - Sau mỗi bản phát hành stable, chạy lệnh `content:export`. Lệnh này kéo gói về `packages/content/src/data/` và mở PR (chạy luôn test nội dung trong CI).
    - Nhờ vậy build tái lập được, CI không cần quyền vào DB production, và test/e2e có dữ liệu cố định.
    - Phương án kia (build kéo thẳng từ kênh stable) cho gói nền mới hơn, nhưng build phụ thuộc mạng và secret.
  - Khi có mạng và rảnh (sau lần vẽ đầu), Host đọc manifest. Tải gói nếu `contentVersion` khác gói đang dùng, `schemaVersion` nằm trong khoảng app hỗ trợ, và phiên bản app ≥ `minAppVersion`.
  - Kiểm sha256 + Zod (trong chunk nạp lười, giữ ngân sách bundle đầu).
  - Lưu **IndexedDB** (WebView của Capacitor giữ bền; không cần plugin native mới; Preferences/localStorage không hợp với JSON 100 kB).
  - **Kích hoạt ở lần mở app sau**, không đổi giữa chừng một bài.
  - Giữ gói trước làm dự phòng nếu gói mới hỏng lúc khởi động.
- **`packages/content` đổi sang “nạp lúc khởi động” nhưng giữ API đồng bộ:**
  - Hiện các hằng như `HONORIFIC_PAIRS_20`, `DIALECT_DICTIONARY`, `COURSE`, `ALL_SENTENCES` (tính sẵn lúc nạp module, `course.ts:99`) có khoảng 30 lượt dùng (8 + 5 + 11 + 6 tệp, có thể trùng nhau).
  - Thêm `hydrateContent(pack)`: gán lại các binding (live `export let` hoặc getter), tính lại dữ liệu dẫn xuất, xóa cache (`localizers`).
  - Host gọi hàm này **trước khi các route MFE lười được vẽ**. Gateway gọi lúc khởi động và sau mỗi lần xuất bản.
  - MFE ghép lúc build dùng chung một bản `packages/content`, nên singleton này hợp lệ và không phạm Nguyên tắc 7 (MFE vẫn chỉ import package, không import nhau).
- **Gateway:**
  - Đọc bản stable từ DB lúc khởi động. Có nhiều instance thì hỏi lại con trỏ kênh mỗi 60 s (hoặc `LISTEN/NOTIFY`). DB lỗi thì dùng gói đóng kèm.
  - **Chưa có bản phát hành nào thì dùng gói đóng kèm.** Đây là trạng thái bình thường của dev/test/e2e: PGlite khởi tạo rỗng (`config.ts:101`, `memory://` khi test), và migration chỉ tạo bảng (`apps/gateway/src/db/client.ts:41`, `:53`). Khi đó `GET /content/manifest.json` trả về gói nền, hoặc 404 để client giữ gói đang có. Test không phải nạp dữ liệu mẫu vào DB.
  - **Lệch phiên bản** (máy dùng gói cũ, Gateway dùng gói mới): route tra nội dung theo id phải chịu được id lạ hoặc thiếu. Client gửi header `X-Content-Version` để ghi log.

## B5. Ảnh hưởng tới thuật toán đọc nội dung tĩnh
Nguyên tắc chung: **luật (code) ở yên trong code** (danh mục đóng A1–A8, `AGENTS.md` §3); **chỉ dữ liệu sửa được qua admin**. Bộ kiểm khi phát hành tách từ các test hiện có trong `packages/content/test/` (`course.test.mjs`, `data.test.mjs`, `dialect-localize.test.mjs`, `honorific.test.mjs`, `situations-stories.test.mjs`, `speakable.test.mjs`, `tone-sets.test.mjs`, `course-roleplay.test.mjs`) thành hàm thuần `validatePack(pack): Issue[]`. Test và Gateway dùng chung hàm này.

- **A6, xưng hô** (`HonorificInterpreter.ts`):
  - Dữ liệu cặp (`relationName`, `explanation`, `example`, `wisdom`, bản tiếng Anh) sửa được.
  - Trường **đi vào luật** (`id`, `relation`, `speakerAge`, `listenerAge`, giới tính) chỉ chủ app sửa được, vì `interpret()` chọn cặp theo luật và tuổi (`:70–90`), còn `getPairById` dùng id (`:73`, `:514`).
  - Một số chuỗi nằm **trong nhánh luật** (ví dụ `'thầy/cô'`, câu mẫu ở `:85–87`) vẫn do code sở hữu: liệt kê rõ trên admin là “chỉ dev sửa”, hoặc sau này tách ra dữ liệu.
  - **Mỗi bản phát hành phải tính lại đáp án của mọi tình huống `hs*`** (đáp án do luật A6 suy ra, như đợt duyệt D8 đã làm, `docs/nhat-ky/DUYET-NOI-DUNG.md`) và cho người duyệt xem chênh lệch. Sửa một cặp có thể âm thầm đổi đáp án đúng của bài tập.
- **A7, phương ngữ** (`dialectMap.ts`):
  - `NOT_AUTO_LOCALIZED` là tập id viết cứng (`:32`). Phải chuyển thành trường `autoLocalize: false` trong dữ liệu (đổi contract). Nếu không, biên tập thêm một mục đồng hình (kiểu “ốm”, “ngã”) sẽ khiến mọi câu bị thay sai.
  - Cache `localizers` ở cấp module (`:34–47`) phải xóa trong `hydrateContent`.
  - Cờ `reviewed` (`:15–16`, lọc ở `:39`) thành trường dẫn xuất (chỉ mục đã xuất bản mới vào gói). Giữ trường này cho tương thích.
  - Bộ kiểm: câu gốc phải viết theo **miền Bắc**, vì `localizeText` chỉ đổi từ dạng Bắc (`:49–61`; bài học từ cs8 ở `DUYET-NOI-DUNG.md`). Quét câu có dạng Trung/Nam của mục `autoLocalize` thì cảnh báo.
- **A1/A2, thanh điệu (`tones.json`, `toneSets.json`), A8 (câu ghép), A5 (`placement.json`):** dữ liệu sửa được, thuật toán cố định. Bộ kiểm: thanh của từ khớp thanh khai báo; token câu ghép đúng NFC; câu xếp lớp đủ mỗi mức.
- **Khóa học (`course.ts`):** `ExerciseRef` là union đóng (`:15–35`) và `Unit.level: 'A1'` (`:60`). Thêm loại bài tập hoặc cấp độ mới cần **app mới**, nên gói phải mang `schemaVersion` + `minAppVersion`, và admin chỉ cho chọn loại bài mà schema hiện tại có. Bộ kiểm: mọi tham chiếu (`word`, `sentence`, `pair`, `entry`, `situation`, `story`, `roleplay`) trỏ tới id còn sống.
- **Âm thanh dựng sẵn (D9):**
  - Khóa âm thanh là sha256 của văn bản + giọng (`audio.ts:9`), nên sửa chữ là mất âm thanh. Câu chưa có âm thanh thì client đọc bằng TTS của máy (`prebuild.ts:10`).
  - Bản phát hành phải có **báo cáo độ phủ âm thanh** theo miền.
  - Dựng âm thanh chạy trên máy chủ app vì VieNeu chạy local (`KE_HOACH…`, mục D9): `tts:prebuild --release N` kéo gói từ Gateway rồi tải âm thanh lên qua endpoint quản trị `audio.upload` (token máy có phạm vi hẹp).
  - Lưu âm thanh ở production phải chuyển từ đĩa cục bộ (`config.ts:86–87`) sang kho đối tượng (GĐ5).
  - Màn **duyệt âm thanh** cho người duyệt thay luôn hàng chờ `humanReview` (`prebuild.ts:12–13`).
- **Gateway** (chat tutor, RAG văn hóa, chấm A3, xếp lớp A5): dùng cùng `hydrateContent` nên không đổi logic. Prompt (`packages/prompts`) **không** đưa vào admin (Nguyên tắc 6: đầu ra JSON có schema; sửa prompt cần dev và test).

## B6. Trang admin đặt ở đâu

| | **`apps/admin` (SPA riêng) + API `/admin/v1` trong Gateway** (đề xuất) | Admin render HTML ngay trong Gateway (AdminJS/htmx) | Công cụ DB/CMS bên ngoài (Retool, Directus…) |
|---|---|---|---|
| Tách khỏi app học | Có: không vào APK, không vào bundle Host | Có | Có |
| Đi qua kiểm tra + nhật ký của Gateway | Có | Có, nhưng công cụ CRUD tự động dễ đi vòng qua luật nghiệp vụ | **Không**: ghi thẳng DB |
| Bảo mật | Origin riêng, CSP chặt, token riêng | Gateway hiện là API JSON thuần, tắt CSP (`app.ts:78`); phục vụ HTML thì phải làm lại phần bảo vệ | Hệ tài khoản riêng |
| Dùng lại | `packages/ui`, `contracts`, `api-client`, **`packages/exercises` để xem trước bài học thật** | Ít | Không |

**Đề xuất:**
- `apps/admin` (Vite + React), host tĩnh ở subdomain riêng (ví dụ `admin.<domain>`).
- API là một scope Fastify riêng `/admin/v1` trong Gateway, với CORS chỉ cho origin admin. CORS hiện là danh sách chung (`app.ts:82–86`), cần tách theo scope.
- Có thể tách scope này thành tiến trình riêng, cổng không công khai, mà không viết lại.
- `apps/admin` là app, không phải MFE. Thêm luật `lint:boundaries`: không MFE nào import admin, admin không import MFE (chỉ import package).
- Màn sửa nội dung là **form sinh từ Zod schema** theo từng loại, cộng một trình sửa bài học riêng (chọn `ExerciseRef`) và nút xem trước bằng `packages/exercises`.

## B7. Bảo vệ: đăng nhập admin, 2FA, nhật ký
- **Đăng nhập:**
  - Google hoặc email OTP (dùng lại Phần A), sau đó **bắt buộc TOTP** (RFC 6238). Đăng ký TOTP ở lần đăng nhập đầu.
  - Secret TOTP mã hóa AES-256-GCM bằng `ADMIN_MFA_KEY` (bắt buộc ở production). Chống dùng lại mã bằng `last_used_step`. Có 10 mã dự phòng băm.
  - Passkey (WebAuthn, chống phishing) để giai đoạn sau.
- **Phiên admin tách khỏi phiên học:**
  - JWT `typ:'admin'` ký bằng **khóa riêng `ADMIN_JWT_SECRET`**, sống 10 phút.
  - Bảng `admin_sessions` (băm refresh, `mfa_at`, hết hạn tuyệt đối 12 giờ, rảnh 30 phút thì hết, thu hồi được).
  - Refresh nằm trong cookie `HttpOnly; Secure; SameSite=Strict` với path `/admin/v1/auth`.
  - Token học không vào được `/admin` (kiểm `typ`, như `RequestPipeline.ts:65` đang làm cho `/v1`), và ngược lại.
- **Xác thực lại (step-up, nhập lại TOTP trong 5 phút)** cho: cấp/thu vai trò, rollback, khóa vĩnh viễn, xóa hộ tài khoản, xuất dữ liệu người dùng, hiện email đầy đủ.
- **Lớp chặn ngoài (tùy chọn, rẻ):** Cloudflare Access hoặc danh sách IP trước `admin.<domain>`.
- **Nhật ký quản trị `admin_audit_log`** (không dùng lại `audit.record`):
  - Cột: `id, at, actor_user_id` (**không FK**, để giữ được “ai đã làm” kể cả khi tài khoản nhân sự bị xóa; UUID là bí danh, bảng ánh xạ người thật nằm trong hồ sơ nhân sự ngoài DB), `actor_role, action, target_type, target_id` (**được phép** là id người dùng, khác `audit_events`), `reason` (bắt buộc với thao tác lên người dùng), `diff jsonb` (nội dung: JSON patch; người dùng: trường đổi, không có dữ liệu cá nhân), `step_up, ip_hash, user_agent`.
  - **Ghi trong cùng transaction** với thao tác: không ghi được nhật ký thì không thao tác.
  - **Chỉ thêm, ép ở DB** bằng trigger `BEFORE UPDATE OR DELETE` → `RAISE` trong migration tùy chỉnh.
  - Giữ lâu hơn 180 ngày của `audit_events` (`audit.ts:18`); đề xuất 2 năm, cần bạn chốt.
  - Ghi cả **thao tác đọc** dữ liệu cá nhân (hiện email, xuất dữ liệu).
- **Cảnh báo:** cấp vai trò mới, đăng nhập admin từ IP lạ, sai TOTP nhiều lần thì gửi email cho chủ app.

## B8. Quản lý người dùng
- **Tra cứu:** theo `userId` hoặc **email khớp chính xác**. Không có danh sách duyệt toàn bộ email. Màn hình hiện ngày tạo, khách/thật, các phương thức (email che), ngày hoạt động gần nhất (`daily_activity`), trạng thái khóa, số bạn, báo cáo liên quan. **Không hiện chi tiết học**, trừ khi xử lý yêu cầu xuất dữ liệu.
- **Khóa:**
  - Bảng `user_restrictions(id, user_id → users CASCADE, scope 'social'|'ai'|'all', reason_code, note, created_by, created_at, expires_at, lifted_at, lifted_by)` (giữ lịch sử).
  - Ép ở chỗ `userExists` (`RequestPipeline.ts:93–105`, cache 60 s, thu hồi ở một instance qua `forgetUser` `:108–110`) và ở bước xoay vòng refresh (`tokens.ts:59–63`). Scope `all` trả `403 account_suspended`.
  - **Luôn cho phép** `DELETE /v1/me` và xuất dữ liệu (quyền của chủ thể dữ liệu).
  - Khóa `social` là mức nhẹ, phù hợp với vi phạm khi chat: vẫn học được.
- **Báo cáo vi phạm** (bảng do dự án chat định nghĩa trong contract; admin dùng):
  - `reports(id, reporter_id → users SET NULL, target_user_id → users CASCADE, target_kind 'message'|'profile'|'group', target_ref, reason_code, note ≤ 500, evidence jsonb, status 'open'|'actioned'|'dismissed', assigned_to, resolved_by, resolved_at, resolution_code, created_at)`.
  - `evidence` là **bản chụp tin nhắn lúc báo cáo**, để người gửi tự xóa cũng không mất bằng chứng. Xóa sau 90 ngày kể từ khi xử lý.
  - Hàng chờ có hạn xử lý. Thao tác gồm: bỏ qua, cảnh cáo, khóa theo scope, xóa nội dung, chuyển cấp.
  - Play yêu cầu app có nội dung do người dùng tạo phải có báo cáo, chặn và kiểm duyệt kịp thời [N].
- **Yêu cầu quyền dữ liệu:**
  - Hỗ trợ viên xuất dữ liệu (dùng lại `snapshot()`, `repo.ts:119`) và xóa hộ khi yêu cầu đã được xác minh (đăng nhập trên trang web xóa tài khoản).
  - Tốt hơn: làm luôn **tự phục vụ** `GET /v1/me/export`. Hồ sơ đang ghi “chưa có chức năng xuất” (`DANH-GIA-TAC-DONG.md:108`); thời hạn theo NĐ 356 Điều 5 (`:110`).

## B9. Thay đổi schema/contract dự kiến (chưa làm)
**Migration mới:**
- `0008_staff_admin`: `staff_roles`, `staff_mfa`, `admin_sessions`, `admin_audit_log` + trigger chỉ thêm, `user_restrictions`.
- `0009_content_cms`: `content_entities`, `content_revisions`, `content_releases`, `content_release_items`, `content_channels`.
- Sau đó một migration xóa `content_items`.
- `reports` thuộc migration của dự án chat.

**Contract:**
- `packages/contracts/src/content/*.ts`: Zod cho từng loại nội dung (thêm `autoLocalize` cho mục phương ngữ), `ContentPackSchema`, `ContentManifestSchema`.
- `packages/contracts/src/api/admin.ts`, nhóm endpoint dưới `/admin/v1`:
  - `auth`: google/email, totp enroll/verify, refresh, logout, step-up;
  - `content`: list/get, history, draft create/update, submit, approve, reject, diff;
  - `releases`: validate, create, promote, rollback, list;
  - `audio`: coverage, upload;
  - `users`: lookup, get, restrict, lift, export, delete;
  - `reports`: list, get, resolve;
  - `staff`: list, grant, revoke;
  - `audit`: query.

**Biến môi trường:** `ADMIN_JWT_SECRET`, `ADMIN_MFA_KEY`, `ADMIN_ORIGIN`, `CONTENT_SELF_APPROVE`.

## B10. Rủi ro bảo mật và pháp lý

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Chiếm tài khoản admin ⇒ phá nội dung toàn bộ người dùng (kể cả trẻ em) hoặc lộ dữ liệu | Cao | TOTP bắt buộc, step-up, phiên ngắn, origin riêng, quyền tối thiểu, cảnh báo khi cấp quyền, lớp chặn ngoài |
| Nội dung sai hoặc độc hại lên mọi máy | Cao | Bốn mắt, bộ kiểm tự động, kênh beta, rollback bằng bản chép, client giữ gói trước, chỉ kích hoạt khi mở lại app |
| Gói bị sửa trên đường truyền hoặc CDN | TB | HTTPS + sha256; tùy chọn chữ ký Ed25519 |
| Mất tiến độ do xóa hoặc đổi id | Cao | Id bất biến, chỉ `retired`; bộ kiểm tham chiếu |
| Lệch phiên bản client/Gateway | TB | `schemaVersion`/`minAppVersion`; Gateway chịu được id lạ |
| Nhân sự lạm quyền xem dữ liệu | TB | Email che, lý do bắt buộc, nhật ký cả thao tác đọc; danh sách nhân sự trong hồ sơ (NĐ 356 Điều 13 về nhân sự BVDLCN, `DANH-GIA-TAC-DONG.md:28`) |
| Nhật ký lưu id người dùng sau khi họ xóa tài khoản | Thấp | UUID không còn ánh xạ tới ai (bí danh); ghi vào hồ sơ |
| Chat/nhóm có thể thuộc “mạng xã hội” theo NĐ 147/2024 (xác thực SĐT/mã định danh, có thể cần giấy phép) [N] | Chưa rõ | Tư vấn pháp lý trước dự án 4 |
| Chính sách UGC/Families của Play với tính năng xã hội có trẻ em [N] | Cao | Nhắc an toàn trong app, báo cáo + chặn, kiểm duyệt có hạn xử lý; chat chỉ giữa bạn đã kết bạn (không ẩn danh: Play cấm app chat ẩn danh nhắm trẻ em từ 26/08/2026 [N]) |
| Bản quyền nội dung do biên tập viên đóng góp | TB | Thỏa thuận chuyển giao hoặc cấp phép (giống lưu ý quyền dùng ảnh nhân vật tạo bằng Gemini, `GOP-Y-20-11.md:51`, `docs/thiet-ke/CAU-LENH-TAO-TU-THE.md:42–44`) |

## B11. Ước lượng

| Hạng mục | Ngày | Agent |
|---|---|---|
| **5a.** Vai trò + kiểm quyền, CLI cấp chủ app, đăng nhập admin + TOTP + step-up + `admin_sessions`, nhật ký quản trị (trigger), `user_restrictions` + ép ở pipeline | 4–5 | `kien-truc` |
| **5a.** `apps/admin` khung + đăng nhập + tra cứu người dùng + khóa + hàng chờ báo cáo (bảng `reports` từ dự án chat) + xuất dữ liệu | 4–5 | `lam-tinh-nang`, `kien-truc` review |
| **5a, tổng** | **≈ 8–10** | |
| **5b.** Contract nội dung (Zod từng loại), bảng, script nhập JSON + kiểm giống hệt | 3–4 | `kien-truc` (schema) + `lam-tinh-nang` |
| **5b.** Tách bộ kiểm từ test, dựng bản phát hành, manifest/gói, kênh, rollback | 3–4 | `lam-tinh-nang` |
| **5b.** `packages/content` nạp lúc khởi động (`hydrateContent`), A6/A7 (`autoLocalize`, xóa cache), Gateway nạp từ DB | 3–4 | `kien-truc` (lan nhiều tệp, có race lúc khởi động) |
| **5b.** Client tải/kiểm/lưu IndexedDB/kích hoạt + dự phòng; thử trên emulator | 2–3 | `lam-tinh-nang` + skill `thu-tren-emulator` |
| **5b.** Màn sửa nội dung (form từ schema, trình sửa bài, diff, xem trước), độ phủ âm thanh + duyệt âm thanh + upload | 4–6 | `lam-tinh-nang` |
| **5b, tổng** | **≈ 15–20** | |

## B12. Câu hỏi chỉ bạn trả lời được (Phần B)
1. **Nhân sự ban đầu:** ai là chủ app? Có biên tập và người duyệt bản ngữ nào không (quy trình D8)? Giai đoạn chỉ một người thì cho chủ app tự duyệt (`CONTENT_SELF_APPROVE`) không?
2. **Ai được tạo bản phát hành và rollback:** chỉ chủ app, hay cả người duyệt?
3. **Tách dự án 5** thành 5a (làm trước hoặc cùng chat) và 5b (sau): đồng ý không?
4. **Subdomain admin**, và có thêm lớp chặn ngoài (Cloudflare Access hoặc danh sách IP) không?
5. **2FA:** TOTP (Google Authenticator…) trước, passkey sau. Đồng ý không?
6. **Thời gian lưu:** nhật ký quản trị (đề xuất 2 năm), bằng chứng báo cáo (đề xuất 90 ngày sau khi xử lý).
7. **Kênh beta** cho người thử nội bộ: có cần không?
8. **Chính sách cộng đồng:** các mức xử lý (cảnh cáo, khóa xã hội, khóa toàn bộ), thời hạn, cách kháng nghị. Đây là nội dung chính sách bạn phải duyệt.
9. **NĐ 147/2024:** có thuê hoặc nhờ tư vấn pháp lý trước dự án chat không?
10. **Kho đối tượng** cho gói nội dung và âm thanh ở production (Cloudflare R2, S3…): chọn lúc GĐ5, nhưng 5b cần biết hướng.
11. **Bản quyền nội dung** do người ngoài đóng góp: có ký thỏa thuận không?

---

## C. Thứ tự và phụ thuộc đề xuất
- **Thứ tự đang chốt** (`GOP-Y-20-11.md:39`): (1) giao diện → (2) gom AI → (3) đăng nhập → (4) bạn bè/chat → (5) quản trị → (6) gói đăng ký.
- **Đề xuất sửa:** (1) → (2) → (3) → **(5a) nền quản trị** → (4) chat → **(5b) CMS nội dung** → (6).
- **Lý do:**
  - Chat cần báo cáo, chặn, khóa và người xử lý ngay từ ngày đầu (chính sách Play [N], trẻ em dùng app theo D4).
  - Nhân sự cần tài khoản thật, nên (3) phải xong trước (5a).
  - (5b) không phụ thuộc (4), có thể chạy song song với (4) bằng phiên/agent khác.
- **Phụ thuộc vào dự án giao diện:** tab **Hồ sơ** (bạn đã chọn 4 tab Học · Luyện tập · Bạn bè · Hồ sơ, Cu Tít là bong bóng nổi, `GOP-Y-20-11.md:47`) là nơi đặt “Đăng nhập / Tài khoản / Thiết bị / Mã dự phòng / Xóa tài khoản”. Mục Tài khoản ở M12 (`AccountSection.tsx`) sẽ chuyển sang đó.
- **Quy trình bắt buộc:**
  - mọi phần đụng DB, auth, native, pháp lý phải qua `kien-truc`;
  - phần native chạy `thu-tren-emulator`;
  - trước khi gộp chạy `kiem-truoc-khi-gop` (`AGENTS.md` §5);
  - mỗi bước ghi nhật ký `docs/NHAT_KY_CHUYEN_DOI_MOBILE.md`.

## Nguồn tham khảo [N] (đọc lại bản hiện hành trước khi quyết)
- Android, Credential Manager / Sign in with Google: https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation
- Google, kiểm ID token ở backend (hướng dẫn One Tap cũ, các bước kiểm vẫn áp dụng): https://developer.android.com/identity/legacy/one-tap/idtoken-auth
- Plugin `@capgo/capacitor-social-login`: https://github.com/Cap-go/capacitor-social-login · https://capgo.app/docs/plugins/social-login/
- Google Play Families policy: https://support.google.com/googleplay/android-developer/answer/9893335 · khai đối tượng: https://support.google.com/googleplay/android-developer/answer/9867159
- Apple Guideline 4.8 (thảo luận trên diễn đàn Apple, chưa đọc nguyên văn guideline): https://developer.apple.com/forums/thread/765145
- Giá Firebase Auth (blog bên thứ ba): https://blog.logto.io/firebase-authentication-pricing · Clerk: https://clerk.com/articles/clerk-pricing-explained · Supabase: https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/
- So sánh dịch vụ gửi mail (bên thứ ba): https://freetier.co/articles/free-email-sending-tiers-2026 · https://toolquestor.com/vs/resend-vs-amazon-ses
- Nghị định 147/2024/NĐ-CP (tin tức/luật sư, chưa đọc nguyên văn): https://luatvietnam.vn/tin-van-ban-moi/tu-25-12-2024-tai-khoan-mang-xa-hoi-da-xac-thuc-bang-so-dien-thoai-moi-duoc-dang-bai-186-99855-article.html · https://kpmg.com/vn/vi/home/phan-tich-chuyen-sau/2025/02/understanding-vietnam-new-internet-regulations.html
- Căn cứ pháp lý Việt Nam đã tra trong dự án: `docs/phap-ly/DANH-GIA-TAC-DONG.md` mục 0.
