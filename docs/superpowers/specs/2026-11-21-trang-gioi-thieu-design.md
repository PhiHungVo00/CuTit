# Thiết kế dự án 7: Trang giới thiệu cho bản web

> Ngày: 2026-11-21 · Trạng thái: **ĐÃ DUYỆT 2026-11-21** (đã qua người đọc độc lập rà) · Góp ý gốc: đợt 2, số 6 trong `docs/nhat-ky/GOP-Y-20-11.md`.
> Liên quan: `docs/thiet-ke/DE-XUAT-TRIEN-KHAI.md` (tên miền `.id.vn`, Cloudflare Pages), `docs/superpowers/specs/2026-11-21-dang-nhap-design.md` (màn đăng nhập, trang xóa tài khoản).
> Ký hiệu: *(gọi của người thiết kế)* = người dùng chưa nói, người thiết kế tự quyết; người dùng sửa được khi đọc.

## 1. Mục đích và lý do
Hiện bản web mở thẳng vào app. Người lạ vào không hiểu app là gì. Người dùng muốn có một **trang chủ giống các app học ngôn ngữ lớn** (không sao chép Duolingo): giới thiệu app, rồi dẫn tới **Bắt đầu học trên web**, **Đăng nhập** hoặc **Tải APK**.

Điều người dùng muốn khách cảm thấy trong 5 giây đầu: **chất văn hóa Việt Nam**.

**Thành công nghĩa là:**
- Một người chưa biết app, mở trang trên điện thoại, trong vài giây hiểu được đây là app học tiếng Việt có Cu Tít và chất làng quê Việt.
- Họ bấm một trong ba nút mà không phải tìm.
- Trang mở nhanh cả trên mạng yếu.

## 2. Mục tiêu / không làm / phản mục tiêu
**Mục tiêu:**
- Trang chủ song ngữ (vi/en) ở `<tên>.id.vn`.
- Phần đầu trang theo hướng C: tranh làng quê, Cu Tít vẫy chào, tiêu đề, hai nút chính.
- Ô "Một câu, ba miền" nghe được.
- Ba điểm nổi bật, mỗi điểm kèm ảnh chụp app thật.
- Hỏi đáp ngắn.
- Chân trang có Quyền riêng tư và **Xóa tài khoản**.
- Trang hướng dẫn cài APK.
- Trang **Xóa tài khoản** trên web (Play bắt buộc).

**Không làm:** blog, bảng giá, lời chứng thực, bảng xếp hạng, đăng nhập ngay trên trang giới thiệu, thu thập email, công cụ đo lường bên thứ ba, cookie.

**Phản mục tiêu.** Những thứ dưới đây làm trang hỏng mục đích dù vẫn chạy được:
- Trang nặng hoặc chậm, phải tải cả app mới hiện ra.
- Nhạc tự phát.
- Trông giống bản sao của Duolingo: màu xanh lá cú, bố cục y hệt, linh vật kiểu cú.
- Hứa "miễn phí mãi mãi", trong khi dự án 6 sẽ có gói đăng ký.
- Nút Tải APK trỏ tới tệp chưa ký hoặc tệp debug.
- Chữ trong ảnh chụp không khớp ngôn ngữ trang.

## 3. Ràng buộc
- Bảy nguyên tắc ở `AGENTS.md`. Trang tĩnh không giữ khóa nào. Nếu có gọi Gateway thì chỉ là gọi công khai; **bản đầu không gọi Gateway** *(gọi của người thiết kế)*.
- Tên miền: `.id.vn` do người dùng tự đăng ký (eKYC). Trước khi có tên miền thì chạy ở `*.pages.dev` làm staging.
- Người học chính là **người nước ngoài và trẻ Việt kiều** (D4), nên tiếng Anh quan trọng ngang tiếng Việt.
- Nhân vật và tranh do người dùng tạo bằng Gemini (`docs/thiet-ke/CAU-LENH-TAO-TU-THE.md`, có ghi chú quyền dùng).
- Mã tham khảo bên ngoài chỉ dùng nếu giấy phép MIT/Apache/BSD/ISC, ghi nguồn.

## 4. Các phương án đã cân nhắc

| Quyết định | Phương án | Chọn | Lý do |
|---|---|---|---|
| Phần đầu trang | A. Làng của Cu Tít (cảm xúc) · B. Một câu, ba miền (chứng minh) · **C. Kết hợp** | **C** (người dùng chọn) | Tranh làng tạo cảm xúc. Ô ba miền ngay bên dưới chứng minh điểm khác biệt (ít app dạy 3 miền và xưng hô). |
| Làm bằng gì | **① Trang tĩnh riêng `apps/landing`, HTML thường** · ② Gộp vào host-shell · ③ Astro | **①** (người dùng đồng ý) | ② bắt khách tải cả app, chậm. ③ thêm một công cụ phải bảo trì trong khi ① đã đủ. |
| Đặt ở đâu | **Trang giới thiệu ở `<tên>.id.vn`, app ở `app.<tên>.id.vn`** · Cùng một miền, app ở `/app` | **Tách miền phụ** *(gọi của người thiết kế, khớp sơ đồ ở DE-XUAT-TRIEN-KHAI)* | Hai bản build và hai project Pages độc lập. Service worker (PWA) của app không chiếm trang chủ. |
| Tệp APK | Cloudflare Pages (tệp < 25 MiB) · R2 · GitHub Releases | **Pages nếu < 25 MiB, ngược lại R2** *(gọi của người thiết kế)* | Repo không công khai nên GitHub Releases không dùng được cho khách. Chốt lúc triển khai, khi biết cỡ bản APK ký. |

## 5. Thiết kế đã chốt

### 5.1 Cấu trúc trang (từ trên xuống, xem ảnh phác `docs/thiet-ke/ban-phac/7-trang-gioi-thieu.html`)
1. **Thanh trên:** logo Cu Tít + "Bé Cu Tít"; nút đổi **VI/EN**; nút **Đăng nhập**.
2. **Phần đầu (hướng C):**
   - Nền là **tranh làng quê vẽ phẳng** theo màu của app: lũy tre, đồng lúa, trâu, mái đình.
   - **Cu Tít đội nón lá vẫy chào**, có hoạt ảnh nhẹ; tôn trọng `prefers-reduced-motion`.
   - Tiêu đề: vi "Học tiếng Việt như người Việt nói, cùng Bé Cu Tít" / en "Learn Vietnamese the way it's really spoken, with Cu Tít" *(chữ do người thiết kế đề xuất)*.
   - Một câu phụ ngắn.
   - Hai nút: **Bắt đầu miễn phí trên web** (nút chính) và **Tải APK cho Android**.
   - Nút nhỏ **"🎵 Nghe làng quê"** phát `sang-lang.ogg`, **không tự phát**.
3. **"Một câu, ba miền":**
   - Một câu chào thật, có 3 nút ▶ **Bắc / Trung / Nam**.
   - Kèm một ví dụ xưng hô: cùng câu "Bạn ăn cơm chưa?" khi nói với ông, chị, em.
   - Âm thanh là **3–6 tệp dựng sẵn**, chuyển sang Opus/MP3 nhỏ, commit vào `apps/landing/public/audio/`. Không gọi Gateway.
   - Nguồn tệp: app không đóng gói âm thanh theo miền. Âm thanh khóa học là WAV đặt tên theo sha256, Gateway phục vụ, nằm trong thư mục **không commit** `apps/gateway/.data/tts` (tra theo manifest `packs/<gói>-<miền>.json`). Mẫu đã commit có ở `docs/d9-tts-mau/`.
   - Cách lấy: tra manifest để chọn câu, hoặc dựng lại bằng skill `dung-am-thanh`. Cần một script nhỏ một lần (tìm, chuyển đổi, chép).
4. **Ba điểm nổi bật**, mỗi điểm một ảnh chụp app thật (khung điện thoại) và 2 dòng chữ:
   - **Lộ trình bài học** theo bước nhỏ;
   - **Trò chuyện và gọi với Cu Tít (AI)**;
   - **Xưng hô và văn hóa**.

   Ảnh chụp bằng skill `chup-man-hinh-app`, mỗi ngôn ngữ một bộ, định dạng WebP, có `width`/`height` để trang không giật.
5. **Hỏi đáp** (thẻ `<details>`, không cần JS):
   - Có tốn tiền không? ("Bắt đầu miễn phí; sau này có thể có gói nâng cao".)
   - Có app iOS không? ("Chưa; dùng bản web trên Safari".)
   - Cài APK thế nào? (link sang trang hướng dẫn)
   - Dữ liệu của tôi đi đâu? (link Quyền riêng tư)
   - Học được offline không?
6. **Lời mời cuối trang:** lặp lại hai nút chính.
7. **Chân trang:** Quyền riêng tư · Xóa tài khoản · Hướng dẫn cài APK · Góp ý (dẫn vào app `/gop-y`, dự án 5a) · © năm, tên app.

### 5.2 Ba nút đi đâu
- **Bắt đầu miễn phí trên web** → `https://app.<tên>.id.vn/`. App tự tạo tài khoản khách như hiện nay, không bắt đăng ký.
- **Đăng nhập** → `https://app.<tên>.id.vn/dang-nhap`, màn đăng nhập của dự án 3. Đường dẫn chính xác lấy theo route dự án 3 đặt. Nếu chưa có route thì trỏ về `/ho-so`, nơi có lối vào đăng nhập.
- **Tải APK** → trang `/tai-apk` gồm:
  - nút tải tệp;
  - phiên bản và cỡ tệp;
  - SHA-256 của tệp;
  - hướng dẫn 3 bước cho phép "Cài ứng dụng không rõ nguồn" trên Android, có hình.

  Trên máy không phải Android thì hiện thêm: "Trên iPhone/máy tính, hãy dùng bản web".
- **Trạng thái "Sắp có":** tới khi có **APK ký bằng khóa phát hành** (đang hoãn), nút Tải APK hiện "Sắp có", bấm vào không làm gì. Bật lên bằng tệp **`apps/landing/apk-release.json`** `{version, url, bytes, sha256, minAndroid}`. Bước phát hành APK (mở rộng `scripts/build-apk.ps1` hoặc job CI phát hành) ghi tệp này. Lúc build, trang đọc nó. Không có tệp thì hiện "Sắp có" *(gọi của người thiết kế: một nguồn cho cả phiên bản, cỡ tệp, SHA-256)*.

### 5.3 Song ngữ
- Hai bản HTML dựng sẵn: `/` (tiếng Việt) và `/en/` (tiếng Anh). Có `hreflang`, `<html lang>` đúng ngôn ngữ.
- **Lần đầu vào `/`:** một đoạn JS nhỏ đọc `navigator.language`. Nếu không phải `vi` thì **gợi ý** bằng một dải nhỏ "View in English?", **không tự chuyển trang** *(gọi của người thiết kế: tự chuyển làm máy tìm kiếm và người dùng khó chịu)*. Nút VI/EN nhớ lựa chọn trong `localStorage`.
- Chữ nằm trong một tệp `messages.ts` (vi + en) lúc build. Không dùng thư viện i18n.

### 5.4 Kỹ thuật
- `apps/landing`: **Vite multi-page, HTML + CSS + một ít TypeScript, không React**.
  - Màu lấy từ biến `--ct-*` của `packages/ui/src/theme.css`. Tệp đó mở đầu bằng khối `@theme inline` của Tailwind v4 ⇒ **không import nguyên tệp**. Thay vào đó, script build trích các biến `--ct-*` của **chủ đề sáng** ra một tệp CSS nhỏ, hoặc chép tay có ghi chú phải đồng bộ.
  - Trang **luôn dùng chủ đề sáng** (`data-theme="light"`) *(gọi của người thiết kế: tranh làng vẽ cho nền sáng; không có `data-theme` thì theme mặc định ra tối)*.
  - Font: Be Vietnam Pro qua `@fontsource/be-vietnam-pro` như app (`apps/host-shell/src/styles/fonts.css`), chỉ **400 và 800**, tập con `latin` + `vietnamese`, `font-display: swap`, preload bản 800 cho tiêu đề.
- **Ngân sách** (thêm vào size-limit):
  - HTML + CSS + JS của trang đầu **≤ 30 kB gzip**, không tính ảnh và font;
  - font ≤ 80 kB tổng (woff2, 2 độ đậm × 2 tập con);
  - tranh đầu trang ≤ 150 kB (WebP/AVIF, có `srcset`);
  - Lighthouse di động: Performance ≥ 90, Accessibility ≥ 95.
- **Không cookie, không công cụ đo lường bên thứ ba.** Sau này cần đếm lượt thì dùng Cloudflare Web Analytics (không cookie) và cập nhật trang quyền riêng tư (để dự án triển khai quyết).
- **SEO và chia sẻ:**
  - `<title>`, `description`, Open Graph và Twitter card có ảnh 1200×630 (tranh làng + Cu Tít);
  - `sitemap.xml`, `robots.txt`, `manifest` đơn giản và favicon từ icon app.
- **Trang pháp lý chỉ có một bản, nằm ở app** *(gọi của người thiết kế, khớp `DE-XUAT-TRIEN-KHAI.md` dòng 126: địa chỉ khai cho Google OAuth và Play nằm trên miền app)*:
  - **Quyền riêng tư:** trang giới thiệu chỉ **link** tới `https://app.<tên>.id.vn/quyen-rieng-tu`. Trang này đã có (`apps/host-shell/src/routes.tsx:141`, chữ trong `privacyI18n`). Không chép chữ pháp lý sang trang giới thiệu.
  - **Xóa tài khoản:** thêm **route công khai `/xoa-tai-khoan` trong host-shell** (nạp lười, không cần đăng nhập, vi + en). Trang giới thiệu link tới đó. Đây là địa chỉ khai cho Play.
  - Trang tĩnh riêng của trang giới thiệu chỉ có `/tai-apk` (và `/en/tai-apk`).
- **Thứ tự với dự án 3:** dựng trang giới thiệu được ngay. **Nội dung trang Xóa tài khoản và link Đăng nhập** chốt **sau khi dự án 3 gộp** (route `/dang-nhap`, đường Cài đặt › Tài khoản › Xóa tài khoản, xóa mềm 30 ngày đều do dự án 3 làm). Trước đó, Đăng nhập trỏ `/ho-so`, còn trang xóa mô tả luồng hiện tại (`DELETE /v1/me`, xóa ngay) và ghi chú phải sửa.
- **Trang Xóa tài khoản** (Play bắt buộc có link web), nội dung:
  - cách xóa trong app (Hồ sơ › Cài đặt › Tài khoản › Xóa tài khoản);
  - dữ liệu nào bị xóa, dữ liệu nào giữ và trong bao lâu (theo `docs/phap-ly/`);
  - với người đã mất quyền vào app: liên hệ qua địa chỉ liên hệ quyền riêng tư (đang hoãn, `release-tasks-later`), hiện "Sắp có" tới khi có địa chỉ.

  **Không làm biểu mẫu xóa trên web** ở bản này *(gọi của người thiết kế: biểu mẫu xóa cần đăng nhập web, để sau)*.
- **Triển khai:**
  - Cloudflare Pages, project riêng `landing`, build `pnpm --filter @vietlearning/landing build`, thư mục ra `apps/landing/dist`.
  - Có `_headers`: CSP chặt, cache dài cho tệp có hash, cache ngắn cho HTML.
  - Việc triển khai thật thuộc dự án triển khai; dự án này chỉ đảm bảo build ra thư mục tĩnh chạy được.
  - Thêm job CI build và kiểm size.

### 5.5 Tranh minh họa (người dùng tạo bằng Gemini)
- Cần: (a) **tranh làng quê ngang** cho phần đầu, 2400×1200, có chỗ trống bên trái cho chữ; (b) **Cu Tít đội nón lá vẫy tay**, nền trong suốt. Đã có tư thế `chao` trong bộ 12 tư thế, cần bản nét cao. (c) ảnh chia sẻ 1200×630.
- Người làm viết sẵn câu lệnh Gemini vào `docs/thiet-ke/CAU-LENH-TAO-TU-THE.md` (mục mới).
- **Chưa có tranh thì dùng nền minh họa SVG đơn giản** (đồi, lũy tre bằng hình khối) để không chặn việc làm.

## 6. Kiểm thử bắt buộc
- Build ra đủ các trang vi/en; mọi link nội bộ sống (kiểm tự động lúc build).
- size-limit theo ngân sách ở 5.4; Lighthouse CI (hoặc chạy tay, ghi kết quả vào nhật ký).
- axe-core: không lỗi nghiêm trọng; tương phản chữ trên tranh đạt AA (có lớp phủ nếu cần).
- Playwright: bấm ba nút đi đúng URL; nút APK ở trạng thái "Sắp có" khi không có `apk-release.json`; nút nghe phát âm thanh, không tự phát; đổi VI/EN nhớ lựa chọn; chạy ở khung 360 px không cuộn ngang.
- Chụp ảnh trang ở khung Pixel 7 và máy tính, gửi người dùng xem.

## 7. Để lại cho người làm
- Bố cục chi tiết, khoảng cách, hoạt ảnh nhẹ, theo token `packages/ui` và ảnh phác.
- Câu chữ phụ và hỏi đáp: viết vi + en theo giọng thân thiện của app; người dùng xem lại khi duyệt ảnh chụp.
- Chọn câu và tệp âm thanh cho ô "ba miền" (câu đã có âm thanh dựng sẵn cả 3 miền).

## 8. Câu hỏi đã hỏi người dùng sau khi rà
Người đọc độc lập đã rà (21/11). **Không có câu nào cần người dùng quyết.** Các điểm đã tự chốt:
- trang pháp lý chỉ một bản, nằm ở app;
- thêm route `/xoa-tai-khoan` vào host-shell;
- nội dung trang xóa và link Đăng nhập chốt sau khi dự án 3 gộp;
- ngân sách tách riêng cho font;
- thông tin APK lấy từ `apk-release.json`;
- nguồn âm thanh;
- trang luôn dùng chủ đề sáng.
