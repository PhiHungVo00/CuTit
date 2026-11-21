# Nghiên cứu: âm thanh UI và chuyển động cho Bé Cu Tít

> Ngày: 2026-11-20. Loại: nghiên cứu (đọc web + đọc repo). Chưa cài gói, chưa sửa code, chưa tải tệp âm thanh.
> Trạng thái số liệu: kích thước lấy từ trang Bundlephobia hoặc npm, **chưa đo bằng build của repo**. Mục nào chưa kiểm chứng được ghi rõ ở mục 6.

## 0. Tóm tắt

- **Âm thanh:** dùng bộ **Kenney UI Audio** (CC0) làm nguồn chính. Bổ sung file **Freesound CC0** khi cần. Tránh nguồn có điều khoản không rõ.
- **Phát âm:** hiệu ứng ngắn dùng **Web Audio API** (giải mã sẵn một lần). Âm thanh dài dùng thẻ `Audio` như `coursePlayer` đang làm.
- **Chuyển động:** dùng **CSS + View Transitions API** (0 kB, có dự phòng). Không thêm thư viện vào gói đầu.
- **Ngân sách:** gói đầu còn dư khoảng 0,4 kB so với giới hạn 64,5 kB. Mọi thư viện chuyển động đều vượt mức này nếu nằm ở gói đầu, nên chỉ được nạp lười trong chunk của màn dùng nó.
- **Chuyển cảnh react-router:** bắt đầu bằng hiệu ứng fade CSS theo `pathname`. Thêm `document.startViewTransition` sau, có kiểm tra tính năng và nạp trước chunk đích.

---

## 1. Ràng buộc lấy từ repo

| Điểm | Vị trí | Ghi chú |
|---|---|---|
| Giới hạn gói đầu | `apps/host-shell/.size-limit.cjs` (không phải thư mục gốc) | Gói đầu `app-*.js` + `react-*.js` tối đa **64.5 kB gzip**. Ghi chú trong file: đo 64.12 kB (R10, 2026-11-18). Dư khoảng 0,4 kB. |
| Tắt chuyển động khi người dùng bật "giảm chuyển động" | `apps/host-shell/src/styles/global.css` (khoảng dòng 76) | Đã có `@media (prefers-reduced-motion: reduce)` tắt `animation` và `transition` của `*`, `*::before`, `*::after`. **Rủi ro:** quy tắc này không khớp các pseudo-element `::view-transition-*`, nên View Transitions vẫn chạy nếu không thêm quy tắc riêng. Cần kiểm chứng. |
| Âm thanh hiện có | `packages/exercises/src/audio/coursePlayer.ts` (dòng 104 có `new Audio(src)`) | Phát tệp dựng sẵn theo miền, cache trong `becutit-audio-v1`, rơi về TTS máy khi thiếu. |
| Nút tắt âm | Không tìm thấy | Tìm trong `apps/host-shell/src` (tsx) không có chỗ nào điều khiển âm thanh hay tắt tiếng. **Cần thêm** (xem mục 2.4). |
| Route lazy | `apps/host-shell/src/routes.tsx` (`lazyScreen`) và `main.tsx` | Mỗi màn là một chunk. `lazyScreen` nhớ module đã tải và `main.tsx` chờ chunk màn đầu. Đây là điểm ảnh hưởng đến mục C. |
| Phiên bản React / Router | `apps/host-shell/package.json` | `react` ^18.3.1, `react-router-dom` ^6.30.6. |
| Quy tắc song ngữ | Ghi nhớ của dự án | Mọi chữ trên giao diện (kể cả thông báo) phải có vi và en. Nội dung học vẫn là tiếng Việt. |

---

## 2. Mục A: Âm thanh hiệu ứng UI

### 2.1 Nguồn âm thanh (kiểm tra giấy phép)

| Nguồn | Giấy phép và điều khoản | Dùng thương mại | Ghi công | Link | Đánh giá |
|---|---|---|---|---|---|
| **Kenney UI Audio** (50 tệp) | Trang tải ghi "Creative Commons CC0" (đã mở trang). | Có. Trang hỗ trợ của Kenney nói "all game assets … public domain (CC0)" và "You're free to use them, even in commercial projects" (đã mở trang). | **Không bắt buộc.** Trang hỗ trợ: "Attribution is not required." | Gói: https://www.kenney.nl/assets/ui-audio · Hỗ trợ: https://kenney.nl/support | **Chọn làm nguồn chính.** Trang hỗ trợ nói về "game assets" chung, không nói riêng âm thanh. Nên lưu ảnh chụp trang license tại thời điểm tải. |
| **Kenney Interface Sounds** (100 tệp, theo kết quả tìm kiếm) | Kết quả tìm kiếm ghi CC0. | Như trên (suy ra, chưa mở trang). | Không bắt buộc (suy ra). | https://kenney.nl/assets/interface-sounds | Bổ sung nếu cần thêm âm. **Chưa kiểm chứng trực tiếp.** |
| **Freesound** (tệp lẻ) | Giấy phép theo **từng tệp**: CC0, CC-BY, CC-BY-NC. Mở FAQ: CC0 "You could even sell the sound". CC-BY-NC "can't earn any money". CC-BY phải ghi tên tác giả. | Chỉ dùng tệp **CC0**. CC-BY-NC bị loại vì app bán gói đăng ký. | CC0: không. CC-BY: có (loại bỏ). | FAQ: https://freesound.org/help/faq/ | Dùng làm nguồn bổ sung. Lọc bộ lọc giấy phép CC0 và kiểm từng tệp trước khi tải. |
| **Pixabay** | Điều khoản: âm thanh (kể cả hiệu ứng) được phép dùng; "You do not need to credit Pixabay or the contributor of Content". Không được "sell or distribute the Content … on a Standalone basis". Trang điều khoản không nói về việc dùng trong app (đã mở trang: https://pixabay.com/service/terms/). | Có, theo điều khoản. | Không bắt buộc. | https://pixabay.com/service/terms/ | **Không nên dùng làm nguồn chính.** Điều khoản cấm bán nội dung riêng lẻ; app bán đăng ký cần xác nhận cách hiểu. FAQ Pixabay trả về HTTP 429 khi mở, nên chưa đọc được trực tiếp. |
| **Mixkit** | Trang license không hiển thị điều khoản đầy đủ (đã mở: https://mixkit.co/license/). | Chưa kiểm chứng. | Chưa kiểm chứng. | https://mixkit.co/license/ | **Loại** cho đến khi đọc được điều khoản đầy đủ. |

**Khuyến nghị giấy phép:**
1. Chỉ nhận tệp có giấy phép **CC0** (Kenney, Freesound CC0). Không nhận CC-BY-NC và tệp không rõ.
2. Mỗi tệp ghi vào một tệp nội bộ (ví dụ `packages/exercises/audio/SOURCES.md`): tên tệp, nguồn, link trang, ngày tải, giấy phép, ảnh chụp trang license. Việc này không bắt buộc về pháp lý nhưng giúp kiểm tra khi có người hỏi.
3. Bản phát hành có bán gói: nên có một người có thẩm quyền xác nhận cách hiểu "Standalone" của điều khoản Pixabay nếu dùng Pixabay. Với CC0 của Kenney và Freesound thì không cần.
4. Âm thanh không được có giọng người thật hoặc nhãn hiệu. Khi chọn tệp, kiểm tra điều này.

### 2.2 Gợi ý âm thanh theo sự kiện

Chọn tên tệp cụ thể bằng cách mở bộ Kenney. Chưa chọn tên tệp ở đây để tránh bịa tên.

| Sự kiện | Gợi ý cảm giác | Độ dài mục tiêu |
|---|---|---|
| Đúng | Tiếng "ding" sáng, cao | ≤ 0,4 s |
| Sai | Tiếng trầm, nhẹ, không gắt | ≤ 0,4 s |
| Chạm nút | Tiếng "click" rất ngắn | ≤ 0,1 s |
| Hoàn thành bài | Chuỗi 2–3 nốt đi lên | ≤ 1,2 s |
| Lên chuỗi ngày (streak) | Tiếng kèn/nhạc ngắn vui | ≤ 1,5 s |
| Mở Cu Tít (mascot) | Tiếng "pop" nhẹ, dễ thương | ≤ 0,6 s |
| Thông báo | Tiếng chuông nhẹ, không lặp | ≤ 1,0 s |

Không dùng tiếng quá to hay chói cho trẻ em. Âm lượng chuẩn hóa về khoảng -16 LUFS cho cả bộ (khuyến nghị, chưa kiểm chứng).

### 2.3 Định dạng, dung lượng, cách phát

- **Định dạng:** `.mp3` (mono, 44,1 kHz, 96–128 kbps) cho an toàn trên WebView. `.ogg` (Opus hoặc Vorbis) nhỏ hơn nhưng **chưa kiểm chứng** trên WebView thật. Có thể cung cấp cả hai và chọn theo `canPlayType`.
- **Dung lượng ước tính** (chưa đo): một tệp ≤ 1,5 s ở 96 kbps khoảng 10–20 kB. **Mục tiêu tổng ≤ 150 kB** cho khoảng 12 hiệu ứng.
- **Không đưa vào gói JS.** Đặt tệp trong `public/` hoặc tải lười. Cache như `coursePlayer` (Cache Storage) để học offline vẫn có tiếng. Tệp âm không ảnh hưởng `.size-limit.cjs`.

**So sánh cách phát:**

| Cách | Ưu | Nhược | Dùng cho |
|---|---|---|---|
| **Web Audio API** (`AudioContext`, `decodeAudioData` một lần, lưu `AudioBuffer`, gọi `start()`) | Độ trễ thấp, phát chồng nhiều lần được, không tạo phần tử mới mỗi lần | Phải `resume()` context sau cử chỉ đầu tiên của người dùng; code nhiều hơn | Hiệu ứng UI ngắn (đúng, sai, chạm) |
| **Thẻ `Audio`** (`new Audio(src)`, như `coursePlayer`) | Đơn giản, đã có trong repo | Độ trễ cao hơn khi bấm nhanh liên tiếp; mỗi lần có thể bị chặn tự phát | Âm dài: giọng đọc bài, truyện |

**Độ trễ và tự phát trên Android WebView:** chưa kiểm chứng. Cần đo trên AVD `BeCuTit_Pixel_API35` (theo skill `thu-tren-emulator`): thời điểm chạm đến thời điểm âm bắt đầu. Chưa đo trên máy thật.

### 2.4 Tôn trọng im lặng và cài đặt tắt âm

- **Chế độ im lặng của Android** (ringer) có thể không tắt tiếng media của WebView. **Chưa kiểm chứng.** Web không đọc được trạng thái này, nên không dựa vào nó.
- **Cần làm (việc sửa logic app, giao cho agent khác):** thêm công tắc "Âm thanh" trong màn M12 Tùy chỉnh (`apps/mfe-learner` hoặc nơi có màn Tùy chỉnh), lưu trong `packages/state` (kho bền). Mọi chỗ gọi phát âm đọc cờ này trước khi phát. Mặc định nên **bật** và dễ tắt.
- Khi app xuống nền (`visibilitychange` hoặc sự kiện `@capacitor/app` `pause`), dừng âm đang phát.
- Chữ trên công tắc và nhãn phải song ngữ vi và en.

---

## 3. Mục B: Thư viện chuyển động

### 3.1 So sánh

| Lựa chọn | Kích thước gzip | Giấy phép | Hợp React 18 | Ghi chú |
|---|---|---|---|---|
| **CSS + View Transitions API** | 0 kB (không thêm gói) | Không áp dụng (nền tảng web) | Có | Hỗ trợ trên WebView **chưa chắc** (mục 6). Cần dự phòng CSS. |
| **`motion`** (Framer Motion bản mới) | Trang tài liệu: đầy đủ ~43 kB; `m` + `LazyMotion` ~5 kB ban đầu; `domAnimation` +24 kB; `domMax` +38 kB (trang không ghi phiên bản) | MIT (npm `motion@14.14.0`) | Có: peer `react ^18.0.0 \|\| ^19.0.0` (đã đọc npm registry) | Mạnh nhất cho cử chỉ và thoát (exit). Số liệu tài liệu có thể cũ, chưa đo v14. |
| **`@react-spring/web`** | Bundlephobia `@react-spring/web@10.0.3`: **18,9 kB** gzip | MIT (npm `10.1.2`) | Có: peer `^16.8 \|\| … \|\| ^19` | Hướng vật lý lò xo. Nặng hơn mức cần cho app này. Số liệu là bản 10.0.3, chưa đo 10.1.2. |
| **`@formkit/auto-animate`** | Bundlephobia `0.10.2`: **3,4 kB** gzip | MIT (npm `0.10.2`) | Có: không có peer dependency | Chỉ hoạt ảnh thêm/bớt/đổi chỗ phần tử trong danh sách. Không làm chuyển cảnh trang. |

Nguồn:
- motion: https://motion.dev/docs/react-reduce-bundle-size · npm: https://registry.npmjs.org/motion/latest
- @react-spring/web: https://bundlephobia.com/package/@react-spring/web@10.0.3 · npm: https://registry.npmjs.org/@react-spring/web/latest
- auto-animate: https://bundlephobia.com/package/@formkit/auto-animate@0.10.2 · npm: https://registry.npmjs.org/@formkit/auto-animate/latest

### 3.2 Đề xuất: CSS + View Transitions, không thêm thư viện vào gói đầu

Lý do:
1. Gói đầu chỉ dư khoảng 0,4 kB. `auto-animate` (3,4 kB) hay `motion` (≥ 5 kB ở chế độ nhẹ) không vừa nếu nằm ở gói đầu.
2. Chuyển cảnh trang và hầu hết hiệu ứng nhỏ (nảy nút, fade, trượt) làm được bằng CSS `@keyframes` và `transition`. Không cần thư viện.
3. View Transitions cho cảm giác "chuyển cảnh thật" mà không tốn byte, và có dự phòng nếu WebView không hỗ trợ.

**Nếu cần thêm (ví dụ danh sách huy hiệu, bảng xếp hạng bạn học):** dùng `auto-animate` trong **chunk của màn đó**. Import ở module màn (đã lazy qua `routes.tsx`), không import ở `main.tsx`. Chạy `pnpm --filter @vietlearning/host-shell size` để xác nhận gói đầu không đổi.

**Không dùng `motion` ngay.** Chỉ cân nhắc khi cần cử chỉ kéo-thả hoặc hoạt ảnh thoát phức tạp, và khi đó nạp bằng `LazyMotion` + `m` trong chunk màn đó.

### 3.3 Tôn trọng `prefers-reduced-motion`

- Quy tắc sẵn có trong `apps/host-shell/src/styles/global.css` đã tắt `animation` và `transition` của mọi phần tử thường.
- **Thiếu:** pseudo-element `::view-transition-*` có thể không bị tắt. Cần thêm quy tắc riêng (ví dụ đặt `animation-duration: 0s` hoặc `animation: none` cho `::view-transition-group(*)`, `::view-transition-old(*)`, `::view-transition-new(*)` trong `@media (prefers-reduced-motion: reduce)`). **Chưa kiểm chứng.**
- Với `motion` (nếu sau này dùng): dùng cấu hình `reducedMotion` của `MotionConfig` ở mức ứng dụng. Chưa kiểm chứng tên API ở v14.
- Hoạt ảnh bắt buộc để hiểu nội dung (ví dụ tiến độ) nên giữ dưới dạng thay đổi màu hoặc chữ, không chỉ chuyển động.

---

## 4. Mục C: Chuyển cảnh giữa màn với react-router

### 4.1 Bối cảnh

- Mỗi màn là một chunk nạp lười. `lazyScreen` (`apps/host-shell/src/routes.tsx`) giữ module đã tải để không hiện khung chờ khi đã có sẵn. `main.tsx` chờ chunk màn đầu trước khi render.
- Chuyển màn trong app vẫn có thể **suspend** khi chunk chưa về. Suspense khiến DOM chưa thay đổi đúng lúc, nên chuyển cảnh dễ bị lệch.

### 4.2 Các cách làm

| Cách | Mô tả | Ưu | Rủi ro |
|---|---|---|---|
| **1. Fade CSS theo `pathname`** | Bọc `<Outlet/>` trong thẻ có `key={pathname}` và `@keyframes` fade ngắn | 0 kB. Không phụ thuộc API. Chạy trên mọi WebView | Không có hiệu ứng "biến hình" giữa hai màn. Remount mỗi lần đổi màn (cần kiểm tra trạng thái giữ lại) |
| **2. `document.startViewTransition` tự gọi** | Trong trình xử lý bấm: nạp trước chunk đích (`load()` của `lazyScreen`), rồi `document.startViewTransition(() => flushSync(() => navigate(to)))` | 0 kB. Cho chuyển cảnh thật. Dùng `flushSync` của `react-dom` (có trong React 18) | Nếu callback suspend, VT chờ hoặc bỏ qua. Phải nạp chunk trước. Cần kiểm tra tính năng `'startViewTransition' in document` |
| **3. Prop `viewTransition` của react-router** | `<Link viewTransition>` hoặc `navigate(to, {viewTransition: true})` | Ít code | Trang tài liệu bản 8.5.2 ghi API này **đã bị đánh dấu deprecated** (trang: https://reactrouter.com/how-to/view-transitions). Thay bằng `<ViewTransition>` của React, yêu cầu **React 19.3+**; repo đang React 18.3. Có khẳng định trong kết quả tìm kiếm rằng prop có từ 6.17 (dạng `unstable_`), **chưa kiểm chứng trên 6.30.6**. Không nên dựa vào. |
| **4. `AnimatePresence` của `motion`** | Giữ màn cũ để chạy hoạt ảnh thoát | Chuyển cảnh đẹp, có thoát | Thêm ≥ 5 kB vào chunk. Phải giữ màn cũ mounted khi chunk mới đang nạp. Xung đột với `lazyScreen` |

### 4.3 Rủi ro chung cần kiểm tra

- **Suspense giữa chuyển cảnh:** nạp chunk đích trước khi bắt đầu chuyển cảnh (cách 2). Nếu không, màn trắng hoặc VT bị bỏ.
- **Vị trí cuộn và trạng thái:** kiểm tra màn quay lại có giữ đúng cuộn và trạng thái không (đặc biệt phòng tập thanh điệu và chat).
- **Quản lý tiêu điểm:** sau khi đổi màn, đưa tiêu điểm vào tiêu đề màn (a11y). Chưa kiểm tra trong repo.
- **Nút Back phần cứng Android** (`@capacitor/app`): chuyển cảnh không được làm lệch lịch sử điều hướng. Kiểm trên AVD.
- **Hiệu năng máy yếu:** snapshot của View Transition tốn bộ nhớ. Đo trên máy thật hoặc AVD với CPU chậm. Chưa đo.
- **Tiếp cận giảm chuyển động:** với `prefers-reduced-motion`, bỏ hiệu ứng trượt, chỉ giữ đổi tức thì (mục 3.3).

### 4.4 Đề xuất cho mục C

1. **Làm ngay:** cách 1 (fade CSS theo `pathname`), 0 kB, không rủi ro API.
2. **Làm sau, cải tiến dần:** cách 2, bật khi `'startViewTransition' in document`, luôn nạp chunk trước. Nếu không hỗ trợ thì dùng cách 1.
3. **Không dùng:** cách 3 (deprecated, và repo đang React 18). **Chưa dùng:** cách 4 (quá nặng cho gói đầu).

---

## 5. Đề xuất cuối

1. **Âm thanh:** dùng Kenney UI Audio (CC0) làm nguồn chính; Freesound chỉ lấy tệp CC0; mỗi tệp ghi nguồn và giấy phép vào `SOURCES.md`.
2. **Phát âm:** Web Audio cho hiệu ứng ngắn, thẻ `Audio` cho âm dài; thêm công tắc "Âm thanh" trong M12 (việc sửa logic, giao agent khác).
3. **Chuyển động:** CSS + View Transitions có dự phòng, 0 kB. Không thêm thư viện vào gói đầu. Nếu cần, `auto-animate` nạp lười trong chunk màn.
4. **Chuyển cảnh:** fade CSS theo `pathname` trước; sau đó `startViewTransition` có nạp chunk trước.
5. **Việc tiếp theo:** đo độ trễ âm và chuyển cảnh trên AVD, đo kích thước gói bằng `pnpm --filter @vietlearning/host-shell size` sau khi thêm thử.

---

## 6. Chưa kiểm chứng

- **Pixabay FAQ** (`https://pixabay.com/service/faq/`): trả về HTTP 429, không đọc được. Nội dung "third-party rights" lấy từ kết quả tìm kiếm.
- **Kenney**: trang tải ghi "Creative Commons CC0" nhưng không nói riêng âm thanh có ghi công hay không. Kết luận dựa vào trang hỗ trợ nói chung. Kenney Interface Sounds chưa mở trực tiếp.
- **Freesound**: FAQ đã đọc, nhưng chưa mở trang tệp cụ thể nào.
- **Mixkit**: trang license không có điều khoản đầy đủ.
- **Hỗ trợ View Transitions trong Android WebView**: kết quả tìm kiếm mâu thuẫn (mốc Chrome 127 cho chuyển trang nhiều trang, caniuse ghi 144–156 cho cross-document). Không có số liệu chắc cho WebView trên máy Google Play. Cần đo trên AVD và ghi phiên bản WebView.
- **Kích thước `motion` v14**: số liệu trên trang tài liệu không ghi phiên bản. Chưa đo bằng Bundlephobia cho v14.
- **`@react-spring/web` 10.1.2**: số liệu đo cho 10.0.3.
- **Prop `viewTransition` trong react-router 6.30.6**: chưa kiểm chứng.
- **Độ trễ phát âm và tự phát trên WebView**, **ảnh hưởng chế độ im lặng Android**: chưa kiểm chứng.
- **Dung lượng tệp âm (10–20 kB mỗi tệp)**: ước tính, chưa đo.
- **Chưa đo gì bằng build**: không chạy `pnpm build` hay `size` trong lần nghiên cứu này.

## 7. Nguồn

- Kenney UI Audio: https://www.kenney.nl/assets/ui-audio
- Kenney hỗ trợ (ghi công và thương mại): https://kenney.nl/support
- Kenney Interface Sounds (chưa mở trực tiếp): https://kenney.nl/assets/interface-sounds
- Freesound FAQ: https://freesound.org/help/faq/
- Pixabay điều khoản: https://pixabay.com/service/terms/
- Pixabay FAQ (không mở được, HTTP 429): https://pixabay.com/service/faq/
- Mixkit license (thiếu điều khoản): https://mixkit.co/license/
- motion, tài liệu giảm kích thước: https://motion.dev/docs/react-reduce-bundle-size
- motion, npm registry: https://registry.npmjs.org/motion/latest
- @react-spring/web, Bundlephobia: https://bundlephobia.com/package/@react-spring/web@10.0.3
- @react-spring/web, npm registry: https://registry.npmjs.org/@react-spring/web/latest
- @formkit/auto-animate, Bundlephobia: https://bundlephobia.com/package/@formkit/auto-animate@0.10.2
- @formkit/auto-animate, npm registry: https://registry.npmjs.org/@formkit/auto-animate/latest
- React Router, View Transitions (bản 8.5.2): https://reactrouter.com/how-to/view-transitions
- Chromium, ghi chú ship View Transitions (kết quả tìm kiếm, mâu thuẫn): https://groups.google.com/a/chromium.org/g/blink-dev/c/AJJiH6Pjr50
- caniuse, View Transitions: https://caniuse.com/view-transitions
