# Thiết kế dự án 1 — Nhận diện & giao diện Bé Cu Tít

> Ngày: 2026-11-20 · Trạng thái: **đã duyệt 2026-11-20** · Nguồn quyết định: `docs/nhat-ky/GOP-Y-20-11.md`
> Dự án 1/6 trong đợt góp ý 20/11 (xem thứ tự ở tài liệu góp ý). Phủ góp ý số 3, 4, 5, 8, 9, 10, 12.

## 1. Mục đích và lý do

Người dùng thử app thấy nó giống **một bộ công cụ rời rạc**: thanh tab lẫn công cụ (Xưng hô, Phát âm) với khu vực chính, cài đặt rải 5 chỗ, không hồ sơ cá nhân, không nhân vật, không chuyển động/âm thanh, icon là emoji. Kiểm kê (`docs/thiet-ke/KIEM-KE-GIAO-DIEN.md`) xác nhận thêm nguyên nhân gốc: `packages/ui` có Button/Card nhưng **không MFE nào dùng**, mỗi MFE tự viết lại; có **hai bộ màu lệch nhau** (`packages/ui/src/theme.css` vs `packages/ui/src/theme/tokens.ts`).

Mục tiêu: app **phát hành thật** có một bản sắc thống nhất — cậu bé thôn quê Bé Cu Tít, tông ấm làng quê Việt — và điều hướng rõ ràng.

**Thành công nghĩa là:** người mới mở app hiểu ngay 4 khu vực + biết chạm Cu Tít để nói chuyện với AI; mọi màn dùng chung một bộ thành phần và một bộ màu; có phản hồi chuyển động + âm thanh cho đúng/sai/xong bài; cài đặt ở đúng một chỗ.

## 2. Mục tiêu / không làm / phản mục tiêu

**Mục tiêu**
- Thanh tab mới + bong bóng Cu Tít; màn Hồ sơ; Cài đặt chung.
- Hệ thống thiết kế dùng chung (token màu/chữ/bo góc/bóng, thành phần) lấy màu từ nhân vật.
- Nhân vật Cu Tít theo trạng thái (11 tư thế + icon app) + splash.
- Chuyển cảnh giữa màn, chuyển động phản hồi, âm thanh hiệu ứng, nhạc nền.
- Bộ icon vẽ thống nhất thay emoji ở điều hướng và nút.

**Không làm trong dự án này**
- Gom logic AI / sửa 16 điểm bối rối AI (dự án 2; phần Gateway đang làm ở nhánh `gateway-ai-du-phong`). Dự án 1 chỉ dựng **khung** bong bóng + màn chat có nút đổi chế độ, nối vào các màn chat/gọi thoại/camera hiện có.
- Đăng nhập Google/email (dự án 3), chat bạn bè (dự án 4), quản trị (dự án 5), gói đăng ký (dự án 6). Hồ sơ/Cài đặt chừa chỗ cho các mục này nhưng không làm.
- Thay ảnh nháp bằng bản nét (việc của người dùng tạo bằng Gemini; chỉ thay tệp cùng tên).

**Phản mục tiêu (làm xong mà dính những điều này là thất bại)**
- Gói JS đầu vượt ngân sách `apps/host-shell/.size-limit.cjs` (gói đầu 64,5 kB, còn dư ~0,4 kB) — mọi thứ mới phải nằm ở chunk lazy.
- Nhạc nền/âm hiệu ứng lọt vào lúc thu âm micro hoặc lúc nghe giọng mẫu (làm sai chấm phát âm).
- Bong bóng che nút/nội dung quan trọng.
- Chuỗi giao diện chỉ có một ngôn ngữ (luật: mọi chuỗi vi + en qua `i18n.ts`).
- Chuyển động chạy khi người dùng bật "giảm chuyển động".
- Mất tiến độ/cài đặt cũ của người dùng khi đổi chỗ cài đặt.

## 3. Ràng buộc

- 7 nguyên tắc `AGENTS.md`; đặc biệt **Nguyên tắc 7**: không import chéo MFE (`pnpm lint:boundaries`) ⇒ thành phần dùng chung phải nằm trong `packages/ui`, trạng thái dùng chung trong `packages/state`.
- Ghép MFE lúc build (route lazy), Capacitor 7 Android; WebView Chromium 124 trên Android 15 đã kiểm (spike nhánh `claude/busy-haslett-29afa5`, `docs/thiet-ke/THU-CHUYEN-CANH-AM-ANDROID.md` trên nhánh đó).
- i18n tự viết `defineMessages`; nội dung học giữ tiếng Việt.
- Ảnh Cu Tít hiện là **bản nháp** ~230px (`docs/thiet-ke/tam/`); thiết kế phải chịu được việc thay bằng bản nét cùng tên.
- Âm thanh/nhạc: mọi tệp được dùng thương mại (tự tổng hợp, CC0 hoặc public domain — xem `docs/thiet-ke/am-thanh/v3/README.md`).

## 4. Các phương án đã cân nhắc (người dùng đã chọn)

| Quyết định | Phương án | Chọn | Lý do / đánh đổi |
|---|---|---|---|
| Nhân vật | A ảnh tĩnh nhiều tư thế + chuyển động bằng code · B vector có khung xương (Rive, cần họa sĩ) | **A** | Nhanh, gần như miễn phí, nhẹ; mất chớp mắt/nhép miệng. Giữ đường đổi sang B: mọi màn chỉ gọi một thành phần theo trạng thái. |
| Thanh tab | A 5 tab phẳng · B 5 tab, Cu Tít nổi giữa · C 4 tab + Cu Tít bong bóng nổi | **C** | Cu Tít có mặt mọi màn, gọi được giữa bài; phải xử lý che nội dung. |
| Hồ sơ | A thẻ lớn + bánh răng · B danh sách gọn, Cài đặt là mục cuối · C banner cảnh + ô lối vào | **B** | Gọn. |
| Cài đặt | A một trang dài · B trang mục lục + trang con · C trang dài + thanh nhảy nhóm | **B** | Mỗi nhóm một trang con, dễ mở rộng (đăng nhập, gói đăng ký sau này). |
| Bong bóng | A bảng trượt 3 chế độ · B menu quạt · C mở thẳng chat, nút đổi chế độ | **C** | Ít bước nhất; chế độ đổi trong màn chat. |
| Chuyển động | CSS + View Transitions · thư viện `motion` · `react-spring` · `auto-animate` | **CSS + View Transitions** (0 kB), `auto-animate` (~3,4 kB) lazy nếu cần | Ngân sách gói đầu. Đã chạy được trên WebView 124. |
| Âm thanh | Kenney CC0 (bản 1) · tự tổng hợp chất quê (bản 2) | **Bản 2** + âm quê thật (bản 3) | Bản 1 "máy móc". |
| Phát âm thanh | Web Audio · thẻ `<audio>` | **Web Audio** cho âm ngắn, `<audio>` cho nhạc nền | Đo: Web Audio gọi ~3 ms. |

## 5. Thiết kế đã chốt

Bản phác lưu ở `docs/thiet-ke/ban-phac/` (`bo-cuc-tab.html`, `ho-so.html`, `cai-dat.html`, `bong-bong-cu-tit.html`; mở qua máy chủ brainstorm hoặc đọc mã).

### 5.1 Bảng màu và chữ (lấy từ ảnh Cu Tít)
Nền kem `#FBF3E4` · bề mặt `#FFFDF8` · nâu đất (tiêu đề) `#5A3E28` · chữ `#3B2A1E` · vàng rơm (nhấn) `#E9B949` · xanh lúa (chính/thành công) `#6FA544` · xanh trời `#CFE8F3` · viền `#EADFCB`. Font Be Vietnam Pro (đã tự host). Bo góc mềm 16–24px; avatar Cu Tít viền trắng kiểu sticker. **Một nguồn token duy nhất** — gộp hai bộ màu đang lệch; chế độ tối phải có bộ tương ứng (đạt tương phản WCAG AA).

### 5.2 Điều hướng
4 tab: **Học · Luyện tập · Bạn bè · Hồ sơ**, icon SVG nét thống nhất (không emoji). Ánh xạ màn (theo kiểm kê mục 2):
- **Học**: `/` lộ trình, `/bai-hoc/:id`, `/kiem-tra/:id`; tra cứu `/xung-ho`, `/van-hoa`, `/phuong-ngu` vào từ Học.
- **Luyện tập**: `/on-tap`, `/phat-am`, `/phong-thanh`, `/luyen-tap`, `/ghep-cau`.
- **Bạn bè**: route mới `/ban-be` (chuyển panel bạn học khỏi màn Tiến độ).
- **Hồ sơ**: `/ho-so` (bố cục B), Cài đặt `/cai-dat` (thay `/tuy-chinh`, giữ chuyển hướng từ đường cũ), `/bat-dau` (xếp lớp) vào từ Hồ sơ, `/quyen-rieng-tu` từ Cài đặt.
- **Cu Tít (bong bóng)**: `/hoi-thoai` mặc định; nút đổi chế độ sang `/nhap-vai`, `/goi-thoai`, `/camera`.
- `/kham-pha` bỏ khỏi tab (giữ đường dẫn chuyển hướng để link cũ không gãy).

### 5.3 Bong bóng Cu Tít (phương án C)
Nút tròn góc phải dưới, phía trên thanh tab, mặt `cutit-chan-dung`. Chạm ⇒ mở thẳng màn chat; đầu màn chat có nút đổi chế độ Chat · Nhập vai · Gọi thoại · Camera. Trạng thái bong bóng: thường · đang suy nghĩ (`cutit-suy-nghi`, khi chờ AI) · có tin mới (chấm vàng) · ẩn. **Chống che:** thu nhỏ khi cuộn xuống, hiện lại khi cuộn lên; ẩn khi bàn phím mở, khi đang ở màn Cu Tít, khi đang làm bài có nút ở góc phải dưới, khi thu âm. Chừa lề dưới cho nội dung cuộn. Người mới: một lần giới thiệu bong bóng (chú thích chỉ vào, tắt được).

### 5.4 Hồ sơ (phương án B) và Cài đặt (phương án B)
Hồ sơ: đầu trang gọn (ảnh đại diện, tên, trình độ), danh sách: thống kê (chuỗi ngày, phút học, từ đã thuộc, huy hiệu), bạn học, xếp lớp, … **Cài đặt là mục cuối**.
Cài đặt: trang mục lục ⇒ trang con theo nhóm. Gom đủ mọi cài đặt đang rải (kiểm kê mục 1): Giao diện (sáng/tối/theo máy — hiện chỉ có ở màn Xưng hô), Ngôn ngữ vi/en (nút 🌐 ở Trang chủ), Học (phương ngữ, tốc độ đọc 🐢, mục tiêu, nhắc học), **Âm thanh** (âm hiệu ứng bật/tắt, rung, nhạc nền bật/tắt, chọn bài, âm lượng), Chuyển động (giảm chuyển động), Quyền riêng tư & đồng ý (gồm rút đồng ý micro/camera), Tài khoản (mã khôi phục; chừa chỗ đăng nhập), Xóa tài khoản. Hai trường phương ngữ trùng nghĩa (`profile.dialect` / `preferences.dialect`) phải gộp một, có chuyển dữ liệu cũ.

### 5.5 Nhân vật theo trạng thái
Một thành phần dùng chung (đề xuất `CuTit` trong `packages/ui`) nhận `mood` ∈ {chao, khen, an-mung, dong-vien, suy-nghi, nghe, noi, nhac-hoc, buon, ngu, chan-dung}, kèm chuyển động nhẹ theo trạng thái (nhún khi khen, nảy khi ăn mừng, lắc nhẹ khi động viên, thở chậm khi ngủ). Ảnh nạp lười theo trạng thái. Dùng ở: bong bóng, lời chào trang chủ, phản hồi đúng/sai, màn xong bài, trạng thái rỗng/ngoại tuyến, nhắc học. Icon app + splash Android từ `cutit-icon-app` (adaptive icon nền kem).

### 5.6 Chuyển động và chuyển cảnh
Chuyển cảnh giữa màn bằng `document.startViewTransition` khi có (nạp chunk đích trước), không có thì fade CSS; ≤ 150–200 ms. Phản hồi: nút nhấn co nhẹ, thẻ đúng/sai rung/nảy, thanh tiến độ chạy mượt, xong bài có hiệu ứng ăn mừng (không dùng thư viện nặng). Luật `prefers-reduced-motion` + công tắc "giảm chuyển động" trong Cài đặt phải phủ cả `::view-transition-*`.

### 5.7 Âm thanh và nhạc nền
Âm hiệu ứng (bản 2, người dùng chọn): chạm nút A, đúng A, sai B, hoàn thành A, lên chuỗi ngày A, mở bong bóng A, Cu Tít nói C, thông báo B, chuyển tab A — đã gom ở `docs/thiet-ke/am-thanh/v3/chon/`. Âm quê thật (`v3/que/`) và âm lai (`v3/lai/`) là tùy chọn trang trí. Phát bằng Web Audio, giải mã sẵn, `resume()` sau cử chỉ đầu tiên.
**Nhạc nền** (`v3/nen/`: Sáng làng, Chiều đồng, Trâu về): **bật sẵn** khi mở app; mặc định **xoay vòng theo giờ**; Cài đặt cho chọn phát cố định 1 bài, tắt nhạc, chỉnh âm lượng. Phát xuyên suốt, **tự dừng (hạ dần) khi có hoạt động âm thanh** — thu âm/luyện phát âm, giọng đọc mẫu/âm thanh bài học, Cu Tít nói, gọi thoại — và phát lại khi xong; dừng khi app chạy nền. Một bộ điều phối âm thanh trung tâm (ưu tiên: giọng nói > âm hiệu ứng > nhạc nền) để các MFE báo "đang dùng âm thanh" qua Event Bus/state slice, không import chéo.

## 6. Để lại cho người làm (builder) quyết

- Cách tổ chức mã của bộ thành phần trong `packages/ui` và tên thành phần (ngoài `CuTit`).
- Cơ chế cụ thể của bộ điều phối âm thanh (Event Bus `packages/shared` hay slice trong `packages/state`), miễn không import chéo MFE.
- Đường cong/thời lượng chuyển động cụ thể trong giới hạn ở 5.6.
- Thứ tự di chuyển từng MFE sang thành phần chung (có thể theo từng PR nhỏ).
- Bộ icon SVG: tự vẽ hay dùng bộ mã nguồn mở có giấy phép thương mại (ghi giấy phép).

## 7. Việc người dùng còn làm (không chặn bắt đầu)
- Tạo bản nét từng tư thế Cu Tít bằng Gemini (`docs/thiet-ke/CAU-LENH-TAO-TU-THE.md`), sửa #9 (mất nón) và #12 (nền kem).
- Nghe lại nhạc nền/âm quê trên máy thật sau khi gắn vào app.

## 8. Quyết định bổ sung sau khi người đọc độc lập rà (đánh dấu **[Claude quyết]** — người dùng xem lại)

1. **Ngân sách gói đầu [Claude quyết]:** thanh tab, bong bóng (khung), router và bộ điều phối âm thanh phần lõi buộc ở gói đầu. Cho phép nâng trần gói đầu **tối đa +3 kB** (64,5 ⇒ ≤ 67,5 kB) trong `apps/host-shell/.size-limit.cjs`, ghi lý do vào nhật ký (đúng luật dự án). Mọi thứ khác lazy: ảnh/âm/nhạc, màn Hồ sơ/Cài đặt/Bạn bè, chuỗi i18n của màn con, hiệu ứng ăn mừng.
2. **Phạm vi bộ điều phối âm thanh [Claude quyết]:** bọc **mọi** nguồn phát/thu hiện có, tại điểm tập trung chứ không sửa từng MFE: TTS native + Web Speech trong `packages/native`; thu âm micro (nơi đang gọi `getUserMedia`/plugin ghi âm); phát âm thanh dựng sẵn bài học; gọi thoại. Mỗi nguồn báo bắt đầu/kết thúc ⇒ nhạc nền hạ dần về 0 rồi dừng, xong thì phát lại sau ~1 s.
3. **Nhạc "bật sẵn" [Claude quyết]:** do giới hạn tự phát của WebView, nhạc bắt đầu **sau lần chạm đầu tiên** của phiên. Tôn trọng audio focus Android: app khác đang phát nhạc ⇒ không phát; mất focus (cuộc gọi, app khác) ⇒ dừng. Máy để chế độ im lặng/rung ⇒ không phát nhạc nền (âm hiệu ứng cũng tắt). Xoay vòng theo **giờ máy**: 05:00–11:59 Sáng làng, 12:00–17:59 Chiều đồng, còn lại Trâu về.
4. **Tài sản [Claude quyết]:** 12 ảnh = 11 `mood` (tên tệp `cutit-<mood>.webp`, trùng tên ở `docs/thiet-ke/tam/`) + `cutit-icon-app`. Đưa vào app tại `packages/ui/assets/cutit/` (ảnh) và `apps/host-shell/public/audio/` (âm, nhạc — đã đặt tên theo sự kiện ở `v3/chon/`: `cham-nut`, `dung`, `sai`, `hoan-thanh`, `chuoi-ngay`, `mo-bong-bong`, `cutit-noi`, `thong-bao`, `chuyen-tab`). Định dạng: webp ảnh, ogg (Opus) + mp3 dự phòng cho âm. Precache offline: ảnh + âm hiệu ứng (nhỏ); nhạc nền **không** precache, tải lười lần đầu bật rồi cache runtime.
5. **Nhánh nền [Claude quyết]:** làm từ nhánh `claude/app-improvement-feedback-a500bb` sau khi commit toàn bộ tài liệu/tài sản hiện có (nó = `main` + tài liệu). Spike chuyển cảnh: chỉ dùng **kết luận**, không tái dùng mã. Nhánh Gateway AI không đụng giao diện ⇒ không xung đột.
6. **Gộp phương ngữ [Claude quyết]:** không đổi contract/DB trong dự án này. Phía client "đọc cả hai, ghi một": nguồn đúng là `preferences.dialect`; nếu trống thì lấy `profile.dialect`; mọi lần ghi cập nhật cả hai cho tương thích đồng bộ. Gộp hẳn ở schema để cho dự án sau (ghi tồn đọng).
7. **Tab Bạn bè:** panel bạn học GĐ4c **chạy với tài khoản khách** (đã thử trên APK, nhật ký dòng 51). Giữ nguyên trạng thái rỗng hiện có, thêm Cu Tít `mood="chao"` mời kết bạn.
8. **Thanh tab/bong bóng trên màn con [Claude quyết]:** ẩn thanh tab và bong bóng ở màn tập trung: bài học, kiểm tra, ôn tập đang làm, màn Cu Tít (chat/nhập vai/gọi thoại/camera — có nút quay lại). Màn tra cứu (`/xung-ho`, `/van-hoa`, `/phuong-ngu`) giữ thanh tab, sáng tab **Học**; màn luyện tập sáng tab **Luyện tập**; Cài đặt/xếp lớp/quyền riêng tư sáng **Hồ sơ**.

## 9. Kiểm chứng khi làm
`pnpm build`, `pnpm test`, `pnpm lint:boundaries`, size-limit, e2e host-shell; chụp màn sáng/tối vi/en (skill `chup-man-hinh-app`); thử APK trên AVD (skill `thu-tren-emulator`): chuyển cảnh, bong bóng không che, nhạc dừng khi thu âm; Axe không lỗi mới. Trước khi gộp: skill `kiem-truoc-khi-gop`.
