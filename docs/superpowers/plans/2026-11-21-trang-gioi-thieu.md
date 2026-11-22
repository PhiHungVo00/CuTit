# Trang giới thiệu bản web (dự án 7): kế hoạch triển khai

> **Trạng thái:** ĐÃ DUYỆT 2026-11-22 (người dùng duyệt kế hoạch).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang chủ tĩnh, song ngữ, ở `<tên>.id.vn`. Phần đầu theo hướng C (tranh làng quê + Cu Tít) mang chất văn hóa Việt. Trang có ô nghe 3 miền và dẫn khách tới **Bắt đầu miễn phí trên web**, **Đăng nhập** hoặc **Tải APK**.

**Architecture:**
- `apps/landing`: Vite multi-page, HTML + CSS + một ít TypeScript, không React. Dựng sẵn `/` (vi), `/en/`, `/tai-apk`, `/en/tai-apk`. Chữ lấy từ `src/messages.ts` lúc build.
- Thông tin APK đọc từ `apps/landing/apk-release.json` (không có tệp ⇒ hiện "Sắp có").
- Trang pháp lý chỉ link sang app. Host-shell thêm route công khai `/xoa-tai-khoan`.

**Tech Stack:** Vite (multi-page), TypeScript, `@fontsource/be-vietnam-pro` (400, 800), size-limit, Playwright, axe-core, ffmpeg (chỉ dùng một lần cho script âm thanh, chạy trên máy).

**Spec:** `docs/superpowers/specs/2026-11-21-trang-gioi-thieu-design.md` (đã duyệt 2026-11-21). Liên quan: `docs/thiet-ke/DE-XUAT-TRIEN-KHAI.md`, spec dự án 3.

## Global Constraints

- Phần đầu theo **hướng C**:
  - tranh làng quê vẽ phẳng, Cu Tít đội nón lá vẫy chào;
  - tiêu đề vi "Học tiếng Việt như người Việt nói, cùng Bé Cu Tít" / en "Learn Vietnamese the way it's really spoken, with Cu Tít";
  - nút chính **"Bắt đầu miễn phí trên web"**, nút phụ **"Tải APK cho Android"**.
- **Nhạc không tự phát.** Hoạt ảnh tôn trọng `prefers-reduced-motion`.
- Link:
  - Bắt đầu → `https://app.<tên>.id.vn/`;
  - Đăng nhập → `/dang-nhap` của app, trước khi dự án 3 gộp thì là `/ho-so`;
  - Quyền riêng tư → `https://app.<tên>.id.vn/quyen-rieng-tu`;
  - Xóa tài khoản → `https://app.<tên>.id.vn/xoa-tai-khoan`.

  Gốc app là biến build `LANDING_APP_ORIGIN` (mặc định `http://localhost:5173` khi dev).
- **Không cookie, không công cụ đo lường bên thứ ba, không gọi Gateway.**
- **Luôn dùng chủ đề sáng.** Màu là các biến `--ct-*` của chủ đề sáng, trích từ `packages/ui/src/theme.css`. **Không import** nguyên tệp (vì có khối Tailwind `@theme inline`).
- **Ngân sách:**
  - HTML + CSS + JS trang đầu ≤ **30 kB gzip** (không tính ảnh và font);
  - font ≤ **80 kB** (400 + 800, tập con latin + vietnamese, woff2);
  - tranh đầu trang ≤ **150 kB**;
  - Lighthouse di động: Performance ≥ 90, Accessibility ≥ 95;
  - khung 360 px không cuộn ngang.
- Song ngữ:
  - `/` là tiếng Việt, `/en/` là tiếng Anh, có `hreflang`;
  - trình duyệt không phải `vi` ⇒ **gợi ý** "View in English?", **không tự chuyển trang**;
  - lựa chọn lưu trong `localStorage` (bọc try/catch).
- Không giống bản sao của Duolingo: không màu xanh lá cú, không linh vật cú, không chép bố cục.
- Mỗi phiên con thêm **một dòng** nhật ký `docs/NHAT_KY_CHUYEN_DOI_MOBILE.md`. Chạy `kiem-truoc-khi-gop` trước khi gộp.

## Review Focus

1. **Trình duyệt chặn `localStorage`** (cửa sổ ẩn danh, Safari chặn) ⇒ trang vẫn hiện bình thường, nút VI/EN vẫn đổi được. Chỉ là không nhớ lựa chọn. Test ở Task 1.
2. **Không có `apk-release.json`, hoặc tệp hỏng/thiếu trường** ⇒ build không vỡ, nút hiện "Sắp có". Test ở Task 1.
3. **Khách mở trên iPhone hoặc máy tính rồi bấm Tải APK** ⇒ trang `/tai-apk` nói rõ nên dùng bản web, kèm nút sang web. Test ở Task 1.
4. **Chữ tiêu đề nằm trên tranh có độ tương phản thấp** (tranh thật thay nền SVG) ⇒ vẫn đạt AA nhờ lớp phủ. axe chạy với cả nền SVG lẫn tranh thật. Test ở Task 1 và Task 4.
5. **Âm thanh không tải được** (mạng yếu, tệp 404) ⇒ nút ▶ báo lỗi nhẹ, không treo, không lỗi JS. Test ở Task 1.

---

## Đợt và bản đồ tệp

| Đợt | Task | Phiên (model) | Tệp chính |
|---|---|---|---|
| 1 | 1 | `7-landing-khung` (`lam-tinh-nang`, Sonnet) | `apps/landing/**` trừ `public/audio`, `public/img/anh-chup` |
| 1 | 2 | `7-landing-tai-nguyen` (`tai-lieu`, Haiku; script âm thanh: `sua-nho`, Sonnet) | `apps/landing/public/audio/**`, `apps/landing/public/img/anh-chup/**`, `apps/landing/scripts/lay-am-thanh.mjs`, `docs/thiet-ke/CAU-LENH-TAO-TU-THE.md` |
| 1 | 3 | `7-xoa-tai-khoan-apk` (`sua-nho`, Sonnet) | `apps/host-shell/src/screens/DeleteAccountInfoRoute.tsx`, `routes.tsx`, `privacyI18n.ts` (hoặc tệp i18n mới), `apps/host-shell/scripts/build-apk.ps1` |
| 2 | 4 | phiên chính | kiểm toàn bộ, chụp ảnh gửi người dùng, CI |

Ba task đợt 1 không chạm cùng tệp. Task 1 dùng **ô giữ chỗ** cho âm thanh và ảnh chụp theo đúng tên tệp Task 2 tạo (xem Interfaces Task 2).

**Phụ thuộc dự án 3:** chữ trang `/xoa-tai-khoan` và link Đăng nhập phải sửa lại khi dự án 3 gộp (xóa mềm 30 ngày, route `/dang-nhap`). Task 4 kiểm lại nếu dự án 3 đã gộp; nếu chưa thì ghi việc này vào nhật ký.

---

### Task 1: Khung `apps/landing`: trang vi/en, `/tai-apk`, ngân sách, CI

**Files:**
- Create:
  - `apps/landing/package.json` (`@vietlearning/landing`, scripts `dev`, `build`, `preview`, `size`, `test`);
  - `vite.config.ts` (multi-page: `index.html`, `en/index.html`, `tai-apk/index.html`, `en/tai-apk/index.html`; define `__APK__` từ `apk-release.json`);
  - `src/messages.ts`, `src/render.ts` (chèn chữ vào HTML lúc build qua plugin `transformIndexHtml`), `src/main.ts` (đổi ngôn ngữ, gợi ý EN, phát âm thanh, nhạc), `src/apk.ts`;
  - `src/styles/tokens.css` (sinh bởi `scripts/trich-token.mjs`), `src/styles/landing.css`;
  - `scripts/trich-token.mjs`, `scripts/kiem-link.mjs`;
  - `public/img/hero-fallback.svg`, `public/_headers`, `public/robots.txt`, `public/sitemap.xml`, `public/og.png` (tạm dựng từ icon app);
  - `.size-limit.cjs`;
  - `test/*.test.ts` (vitest + jsdom);
  - `e2e/landing.spec.ts`, `playwright.config.ts`.
- Modify: `.github/workflows/ci.yml` (bước build + size + e2e cho landing), `pnpm-workspace.yaml`/`turbo.json` nếu cần.

**Interfaces:**
- Produces:
  - `type ApkRelease = { version: string; url: string; bytes: number; sha256: string; minAndroid: string }`
  - `readApkRelease(path): ApkRelease | null`: thiếu tệp, JSON hỏng hoặc thiếu trường ⇒ `null` kèm cảnh báo build
  - `messages: Record<'vi'|'en', Messages>`: khóa `hero.title`, `hero.sub`, `cta.web`, `cta.apk`, `cta.apkSoon`, `nav.login`, `ba.title`, `ba.sentence`, `ba.honorific`, `feat.path`, `feat.chat`, `feat.culture` (title + body), `faq[]`, `footer.*`, `apk.*`
- Consumes: tên tệp của Task 2:
  - `public/audio/ba-mien-{bac,trung,nam}.{ogg,mp3}`;
  - `public/img/anh-chup/{vi,en}/{lo-trinh,tro-chuyen,xung-ho}.webp` (dài 1080 px, khung Pixel 7).

  Trong lúc chờ Task 2: tệp giữ chỗ cùng tên (ảnh xám nhỏ, âm thanh im lặng 0,5 giây).

- [ ] **Step 1:** Viết test thất bại:
  - **vitest:**
    - `readApkRelease` trả `null` khi thiếu tệp, khi JSON hỏng, khi thiếu `sha256`;
    - đủ trường ⇒ trả object;
    - mỗi khóa trong `messages.vi` đều có ở `messages.en` và ngược lại;
    - `localStorage` ném lỗi ⇒ `setLang('en')` vẫn đổi `document.documentElement.lang` và không ném.
  - **Playwright** (trên `vite preview`):
    - `/` có `<html lang="vi">` và tiêu đề đúng chữ; `/en/` có `lang="en"`;
    - nút chính trỏ `LANDING_APP_ORIGIN + '/'`;
    - không có `apk-release.json` ⇒ nút APK có chữ "Sắp có" và `aria-disabled="true"`;
    - có tệp mẫu ⇒ trỏ `/tai-apk`, trang `/tai-apk` hiện phiên bản, cỡ tệp (MB), SHA-256;
    - user agent iPhone ở `/tai-apk` ⇒ hiện gợi ý dùng bản web;
    - tải trang không phát âm thanh nào (`HTMLMediaElement.paused` đúng hết);
    - bấm ▶ Bắc ⇒ phát `ba-mien-bac`; tệp âm thanh trả 404 (route chặn) ⇒ nút báo lỗi, không có lỗi JS trong console;
    - `navigator.language='en-US'` ở `/` ⇒ hiện dải "View in English?", URL vẫn là `/`;
    - khung 360×740 ⇒ `scrollWidth <= innerWidth`;
    - axe: 0 lỗi `serious`/`critical`;
    - `kiem-link.mjs` ⇒ mọi link nội bộ trỏ tới tệp có trong `dist`.
- [ ] **Step 2:** `pnpm --filter @vietlearning/landing test` và `e2e` thấy FAIL.
- [ ] **Step 3:** Cài đặt theo spec §5.1–5.4 và ảnh phác `docs/thiet-ke/ban-phac/7-trang-gioi-thieu.html`:
  - hỏi đáp dùng `<details>`;
  - `_headers`: CSP `default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self'`, HTML `cache-control: max-age=300`, tệp có hash `max-age=31536000, immutable`;
  - Open Graph và `hreflang` ở cả 4 trang;
  - preload font 800.
- [ ] **Step 4:** Test PASS.
  - `pnpm --filter @vietlearning/landing size`: trang đầu ≤ 30 kB gzip, font ≤ 80 kB.
  - Lighthouse di động chạy tay (`npx lighthouse` trên `preview`): Performance ≥ 90, Accessibility ≥ 95. Ghi số vào nhật ký.
- [ ] **Step 5:** Commit `feat(landing): trang giới thiệu vi/en, trang tải APK, ngân sách, CI` + dòng nhật ký.

### Task 2: Tài nguyên: âm thanh 3 miền, ảnh chụp app, câu lệnh tranh Gemini

**Files:** Create `apps/landing/scripts/lay-am-thanh.mjs`, `apps/landing/public/audio/ba-mien-{bac,trung,nam}.{ogg,mp3}`, `apps/landing/public/img/anh-chup/{vi,en}/{lo-trinh,tro-chuyen,xung-ho}.webp`, `apps/landing/public/audio/NGUON.md`; Modify `docs/thiet-ke/CAU-LENH-TAO-TU-THE.md` (mục mới "Trang giới thiệu").

**Interfaces:**
- Produces: đúng tên tệp ở trên (Task 1 dùng).
  - Âm thanh: Opus 48 kbps mono `.ogg` + MP3 64 kbps dự phòng, mỗi tệp ≤ 40 kB.
  - Ảnh: WebP, cạnh dài 1080 px, ≤ 90 kB mỗi ảnh.
- `lay-am-thanh.mjs --cau "<câu>"`:
  - đọc manifest `apps/gateway/.data/tts/packs/*-{bac,trung,nam}.json`, tìm khóa sha256 của câu;
  - chuyển WAV sang ogg/mp3 bằng `ffmpeg`;
  - không tìm thấy thì báo dùng skill `dung-am-thanh` hoặc mẫu ở `docs/d9-tts-mau/`.

- [ ] **Step 1:** Viết test thất bại: `node --test apps/landing/scripts/lay-am-thanh.test.mjs`, dùng manifest giả trong thư mục tạm.
  - Câu có trong manifest ⇒ trả đường dẫn WAV đúng cho 3 miền.
  - Câu không có ⇒ thoát mã 2 kèm hướng dẫn.
- [ ] **Step 2–4:** FAIL → cài → PASS. Chạy script thật với một câu chào đã có đủ 3 miền. Nếu không có thì dựng bằng skill `dung-am-thanh` (đã được duyệt sẵn cho âm thanh). Ghi câu, nguồn và giọng vào `NGUON.md`.
  - Ảnh chụp: dùng skill `chup-man-hinh-app` (Pixel 7, chủ đề sáng, vi và en) cho 3 màn Lộ trình, Trò chuyện với Cu Tít, Xưng hô. Chuyển sang WebP 1080 px.
  - Viết câu lệnh Gemini cho: (a) tranh làng 2400×1200, trái để trống cho chữ, cùng bảng màu của app; (b) Cu Tít đội nón lá vẫy tay, nền xanh lá phẳng để tách nền; (c) ảnh chia sẻ 1200×630. Ghi chú quyền dùng như các mục đã có.
- [ ] **Step 5:** Commit `feat(landing): âm thanh 3 miền, ảnh chụp app, câu lệnh tranh` + dòng nhật ký.

### Task 3: App: trang công khai "Xóa tài khoản" + bước phát hành APK ghi `apk-release.json`

**Files:**
- Create: `apps/host-shell/src/screens/DeleteAccountInfoRoute.tsx`, `apps/host-shell/src/deleteAccountI18n.ts`.
- Modify: `apps/host-shell/src/routes.tsx` (`PATH_ROUTES` thêm `/xoa-tai-khoan`, nạp lười, không cần tài khoản, không tạo khách khi chỉ mở trang này), `apps/host-shell/scripts/build-apk.ps1` (tham số `-ReleaseManifest <đường dẫn>`: sau khi build bản **ký phát hành**, ghi `{version, url, bytes, sha256, minAndroid}`; bản debug **không** ghi).
- Test: `apps/host-shell/src/screens/DeleteAccountInfoRoute.test.tsx`, e2e thêm ca trong `apps/host-shell/e2e/dieu-huong.spec.ts`.

**Interfaces:**
- Produces:
  - route `/xoa-tai-khoan` (vi + en theo ngôn ngữ app; khách lạ chưa có hồ sơ thì theo `navigator.language`);
  - tệp `apk-release.json` đúng kiểu `ApkRelease` của Task 1.
- Nội dung trang (spec §5.4):
  - cách xóa trong app;
  - dữ liệu bị xóa và dữ liệu giữ lại kèm thời hạn (theo `docs/phap-ly/`);
  - địa chỉ liên hệ quyền riêng tư hiện "Sắp có".

  Trước khi dự án 3 gộp: mô tả luồng hiện tại (`DELETE /v1/me`, xóa ngay), kèm comment `// TODO dự án 3: xóa mềm 30 ngày`.

- [ ] **Step 1:** Viết test thất bại:
  - mở `/xoa-tai-khoan` ở phiên mới ⇒ **không** có request `POST /v1/auth/guest` (e2e chặn và đếm request);
  - có đủ chữ vi và en;
  - có link tới `/quyen-rieng-tu`;
  - `build-apk.ps1 -ReleaseManifest` ở chế độ debug ⇒ không tạo tệp.
- [ ] **Step 2–4:** FAIL → cài → PASS; `pnpm build`, size host-shell vẫn trong ngân sách.
- [ ] **Step 5:** Commit `feat(host-shell): trang công khai Xóa tài khoản + bước ghi apk-release.json` + dòng nhật ký.

### Task 4: Kiểm toàn bộ + gửi người dùng xem (phiên chính)

- [ ] **Step 1:** Gộp 3 nhánh. Thay các tệp giữ chỗ bằng tài nguyên thật của Task 2. Chạy lại test và e2e của landing. Nếu đã có tranh Gemini thì thay `hero-fallback.svg`, rồi chạy lại axe và size.
- [ ] **Step 2:** Chạy skill `kiem-truoc-khi-gop`.
- [ ] **Step 3:** Chụp trang ở khung Pixel 7 và 1440 px, cả vi và en. Gửi người dùng xem (SendUserFile), kèm câu chữ tiêu đề và hỏi đáp để họ duyệt.
- [ ] **Step 4:** Nếu dự án 3 đã gộp thì đổi link Đăng nhập sang `/dang-nhap` và sửa chữ trang `/xoa-tai-khoan` theo xóa mềm 30 ngày. Nếu chưa thì ghi việc còn lại vào nhật ký.
- [ ] **Step 5:** Commit + nhật ký. Mở PR, bật Auto-fix. **Không triển khai lên Cloudflare** (đó là việc của dự án triển khai).
