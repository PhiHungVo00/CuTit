# Soi giao diện đợt 2 — Cu Tít xuyên suốt, phân cấp thị giác, hoạt ảnh

> Ngày 21/11/2026 · nhánh `claude/app-improvement-feedback-a500bb` (commit `b909b3b`) · **chỉ đọc code + chạy app + chụp màn, không sửa code app.**
> Cách soi: build `host-shell` + Gateway thật PGlite, Playwright (Chrome) ở **375×812 và 320×640, sáng/tối, vi** (≈150 ảnh thô, không lưu vào repo), đi qua 4 tab, bài học (câu sai/đúng/xong bài), kiểm tra, ôn tập, luyện tập các loại, xưng hô, văn hóa, phương ngữ, phát âm, phòng thanh, chat/gọi/camera/nhập vai, Hồ sơ, Tiến độ, Cài đặt, làm quen, **trạng thái** rỗng / đang tải / lỗi / đúng-sai / xong bài / ngoại tuyến. Đo hoạt ảnh bằng `document.getAnimations()`. Kiểm tràn ngang: **không màn nào tràn** ở 320 và 375.
> Chưa soi: bản `en` (đã có ảnh dự án 1), thiết bị thật/emulator, `prefers-reduced-motion`.
> Ảnh có chú thích: [`anh/`](anh/) (số trên ảnh khớp số trong bảng dưới).

---

## 0. Phát hiện lớn nhất (đọc cái này nếu chỉ có 1 phút)

1. **`packages/ui/src/mascot/cutit.css` không được import ở đâu cả** → bản build **không có** lớp `.ct-cutit` và cả 5 hoạt ảnh Cu Tít (`ct-nhun/nay/lac/tho/nghieng`) lẫn luật tắt khi giảm chuyển động của chúng (grep trong `dist/assets/*.css` và `*.js`: 0 kết quả; `getAnimations()` trên mọi màn Cu Tít = rỗng). Hệ quả phụ: `flex:none` cũng mất, nên ở màn Chat ảnh Cu Tít chào (khai 56px) bị **ép còn 14,75px** (đo ở 375px; 12px ở 320px). Spec nói "Cu Tít có chuyển động theo trạng thái" nhưng thực tế đang đứng im. Sửa 1 dòng `import './cutit.css'` trong `CuTit.tsx`.
2. **Bong bóng Cu Tít che nội dung/nút**: `.shell-main` chỉ chừa chỗ cho thanh tab, không chừa cho bong bóng 60px ở góc phải dưới. Che nút **Tiếp →** ở màn làm quen (ảnh 01), che mũi tên `>` ở Hồ sơ, che ngày CN ở lịch tuần, che biểu đồ 7 ngày (ảnh 09), che dòng chữ cuối ở Phương ngữ/Văn hóa/Phát âm/Xưng hô. Ở 320px còn tệ hơn.
3. **Ngoại tuyến: ảnh Cu Tít vỡ, hiện chữ alt xuống dòng từng chữ** (ảnh 05). Nguyên nhân: Workbox `globPatterns` trong `apps/host-shell/vite.config.ts:59` chỉ có `js,css,html,woff2,png,svg`, **không có `webp`** → 11 ảnh Cu Tít không được precache, trong khi spec cam kết chạy ngoại tuyến.
4. **Cu Tít vắng ở đúng chỗ cần nhất**: trạng thái rỗng, lỗi, tải, ngoại tuyến gần như không có Cu Tít. Tư thế `buon` (buồn) **không dùng ở đâu** (grep: 0). Cu Tít chỉ "sống" ở màn Gọi/Chat/xong bài; các tab chính (Học, Luyện tập, Hồ sơ) và Cài đặt không có.
5. **Hoạt ảnh gần như bằng 0 ngoài chuyển cảnh màn**: không có hoạt ảnh vào màn, danh sách lần lượt, bảng phản hồi đúng/sai hiện tức thì (đo: 0 animation sau khi bấm đáp án), xong bài không có pháo/XP đếm, thanh tiến độ chỉ `transition: width` mặc định (150 ms `ease`, không theo token `--ct-motion-*`).
6. **Phân cấp màn Học**: tiêu đề 3 dòng "Học Tiếng Việt Cùng Bé Cu Tít" (to nhất) cạnh nút English tranh chú ý với nút CTA; 3 ô chỉ số chiếm ngang CTA; không có Cu Tít chào/nhắc ngay đầu trang.
7. **Màn xong bài**: "Xong bài “Xin chào!”!" (hai dấu `!`), dòng "Đúng ngay lần đầu: 0%" in nổi gần bằng +10 XP và **0% là tin xấu đặt ngay dưới ăn mừng** (ảnh 07).
8. **Khối chữ chặn trước camera/gọi** (ảnh 03): đoạn dài 7–8 dòng chữ nhỏ trước nút "Đồng ý"; nút chính bị đẩy xuống mép màn.

---

## 1. Bảng Cu Tít theo màn

Kí hiệu: ✅ hợp ngữ cảnh · ⚠️ có nhưng sai/yếu · ❌ không có (thiếu). "Tư thế" theo `CuTitMood`. Kích thước px.

| Màn | Trạng thái | Cu Tít hiện có | Đánh giá / chỗ thiếu |
|---|---|---|---|
| **Học** (`/`) | mới vào, 0 dữ liệu | ❌ (chỉ bong bóng 52px góc phải) | Thiếu `chao` ở đầu trang (lời chào + lý do bấm "Bắt đầu bài đầu tiên"). Chưa có `nhac-hoc` khi lâu không học, `khen` khi có chuỗi |
| | có chuỗi/XP | ❌ | Thiếu phản hồi theo chuỗi ngày (chuỗi 7 → `an-mung`) |
| Bài học (`/bai-hoc/:id`) | đang làm bài | ❌ (bong bóng ẩn — đúng, màn tập trung) | Không cần Cu Tít to; nhưng khoảng trống nửa dưới màn rất lớn |
| | phản hồi **đúng** | `khen` ~40 trong bảng phản hồi (`packages/exercises/src/feedback.tsx`) | ✅ nhỏ nhưng hợp; không chuyển động |
| | phản hồi **sai** | `dong-vien` ~40 | ✅ hợp (động viên, không phạt) |
| | **xong bài** | `an-mung` 120 (`mfe-path/LessonScreen.tsx:91`) | ✅ tư thế đúng; ⚠️ đứng im (hoạt ảnh `nay` mất do mục 0.1) |
| Kiểm tra vượt unit | giới thiệu | ❌ | Thiếu `suy-nghi`/`dong-vien` ("10 câu, 80%…" trơ trụi, ảnh `kiem-tra`) |
| | kết quả | `an-mung` hoặc `dong-vien` 96 | ✅ |
| Ôn tập (`/on-tap`) | rỗng (0 thẻ, 0 lỗi) | ❌ | Rất thiếu: toàn "(0)" và chữ xám; nên `ngu`/`khen` (ảnh 04) |
| | xong phiên | `an-mung` 112 / 64 | ✅ |
| Luyện tập (hub) | — | ❌ | Danh sách 5 mục thuần chữ; nên `nhac-hoc` nhỏ + gợi ý "hôm nay làm gì" |
| Luyện tập (M5) | làm bài | ❌ | OK (tập trung); xong phiên `an-mung` 120 ✅ |
| Ghép câu (M8) | — | ❌ | Có thể `suy-nghi` khi sai |
| Phát âm (M2) | kết quả | `khen`/`dong-vien` 64 | ✅ |
| Phòng thanh | đáp đúng/sai | `khen`/`dong-vien` 56 | ✅ |
| Xưng hô (M3) | chưa chọn | ❌ | Màn nhiều ô nhất app, không cần thêm |
| | đã chọn | `chan-dung` 56 trong thẻ "lời khuyên" | ⚠️ tư thế trung tính; nên `chao` hoặc `suy-nghi` |
| Văn hóa | đang hỏi AI | `suy-nghi` 96 | ✅ |
| | rỗng / lỗi / ngoại tuyến | ❌ | Thiếu |
| Phương ngữ | — | ❌ | OK, nhưng bong bóng che dòng cuối |
| **Chat** | rỗng/chào | `chao` 56 **nhưng bị ép 14,75px** | ❌ gần như không thấy (0.1) |
| | đang chờ AI | `chan-dung` 40 (bong bóng chat; **không** `suy-nghi`) | ⚠️ tư thế lệch ngữ cảnh. `useThinking` chỉ đổi bong bóng nổi, mà bong bóng nổi lại bị ẩn khi bàn phím mở |
| | **hết lượt AI hôm nay** | ❌ | Thiếu `buon` ("Bạn đã dùng hết lượt hôm nay" chỉ là hộp đỏ, ảnh `chat-loi`) |
| | **mất mạng** | ❌ | Thiếu `buon`/`ngu` ("Không có kết nối mạng" hộp đỏ) |
| Gọi thoại | giới thiệu | `chao` 112 | ✅ |
| | đang gọi | `nghe`/`noi`/`suy-nghi`/`chao` 112 | ✅ hợp nhất app (nên giữ làm chuẩn) |
| Camera | trước khi mở | ❌ | Thiếu; nên `chao` 80 + gợi ý |
| | đang nhận diện | `suy-nghi` 56 | ✅ |
| Nhập vai | — | ❌ | Có thể dùng `nghe` khi đang nói (mfe-conversation đã có tư thế) |
| **Bạn bè** | rỗng | `chao` 112 | ✅ tốt nhất app về cảm xúc; ⚠️ hiện chữ "Mời một người bạn…" nhưng ô tên + nút "Lưu tên" xám phía dưới làm Cu Tít bị nhấn yếu |
| | có bạn | ❌ | Chỗ lý tưởng cho nhân vật phụ (mục 4) |
| **Hồ sơ** | luôn | ❌ (ảnh 02) | Màn "của tôi" mà không có nhân vật/avatar; chỉ 4 ô chỉ số + 4 dòng menu |
| Tiến độ | chưa có thẻ | `ngu` 72 | ✅ hợp |
| | có thẻ đến hạn | `nhac-hoc` 72 | ✅ |
| | hết thẻ đến hạn | `khen` 72 | ✅ |
| | biểu đồ rỗng/ít | ❌ | ⚠️ ô lớn 130px trống hoác (ảnh 09) |
| Cài đặt (+ nhóm) | — | ❌ | Chấp nhận được; nên `chao` ở nhóm Tài khoản (mã khôi phục) vì tâm lý "cẩn trọng" |
| Quyền riêng tư | — | ❌ | Văn bản dài 4.800 px, không cần |
| Làm quen (`/bat-dau`) | bước 1–3 | ❌ | Thiếu mạnh: màn **đầu tiên người dùng thấy**, không có Cu Tít chào |
| | xong | `khen` 120 | ✅ |
| **Ngoại tuyến** (băng + mọi màn) | — | ❌ → **ảnh vỡ ở Chat** | Cần `ngu`/`buon` + precache webp |
| Bong bóng nổi | mọi tab | `chan-dung` 52 / `suy-nghi` khi AI chờ | ✅ ý tưởng tốt; ⚠️ che nội dung (0.2) |
| Tư thế **không dùng ở đâu** | — | `buon` | Dùng cho lỗi/hết lượt/ngoại tuyến |

Tóm tắt phủ sóng: 11 tư thế nhưng thực dụng chỉ ~7 (`chao`, `khen`, `an-mung`, `dong-vien`, `suy-nghi`, `nghe`/`noi` chỉ ở gọi/chat, `ngu`/`nhac-hoc` đúng 1 màn). **0/4 tab chính có Cu Tít trong thân trang** (chỉ bong bóng).

---

## 2. Phân cấp thị giác từng màn (điểm 1–5; 5 = rất tốt)

Tiêu chí: (a) mắt nhìn vào đâu trước, (b) hành động chính nổi nhất không, (c) cỡ chữ/đậm/màu/khoảng trắng, (d) nút chính/phụ tách bạch, (e) mật độ, (f) căn lề/nhịp lưới.

| Màn | Điểm | Mắt nhìn vào đâu trước | Vấn đề chính | Ảnh |
|---|---|---|---|---|
| Học (có dữ liệu) | **3** | Tiêu đề xanh 3 dòng (to nhất) rồi nút English; CTA xanh đặc đứng thứ 2 | Tiêu đề tranh CTA; "Học tiếp" tốt (xanh đặc, phụ đề đậm) nhưng chỉ số 🔥⭐❄ cùng cỡ nên "XP 0" ngang hàng chuỗi; chữ "Từ đã thuộc…" 11px ở "Tổng kết tuần"; bong bóng che chữ | `08-hoc-phan-cap.png` |
| Học (mới) | **3** | Như trên; CTA "Bắt đầu bài đầu tiên" nổi | Lịch tuần 7 vòng tròn rỗng + "Tổng kết tuần" toàn số 0 = nhiều khối chữ xám không có gì để làm | — |
| Luyện tập hub | **3** | Tiêu đề, rồi dòng "Ôn hôm nay" | 5 hàng cùng trọng lượng, không có lối chính; mô tả 2–3 dòng 12px xám trên nền kem, độ tương phản yếu | — |
| Bạn bè | **3** | Ảnh Cu Tít 80px | Khối dưới (ô nhập tên + nút xám nhạt "Lưu tên" disabled) trông như đã hỏng; CTA chính thật (mời bạn) vắng, chỉ có "Lưu tên" | — |
| Hồ sơ | **3** | Ô "Chuỗi ngày 1 ngày" viền xanh | 4 ô chỉ số viền xanh = chữ "nút" nhưng không bấm được; 4 dòng menu bấm được thì viền ngoài nhạt. Nhầm *hiện ra bấm được / không bấm được* | `02` |
| Tiến độ | **3** | "1 ngày"/"0 phút" (số to) | Biểu đồ 7 ngày trống 130px; bong bóng đè lên | `09` |
| Ôn tập | **3** | Tiêu đề, 3 thẻ trắng | Tất cả "(0)" cùng cỡ; không có CTA chính khi rỗng | `04` |
| Bài học — câu hỏi | **4** | Câu hỏi đậm 16px | Gọn, rõ; bốn đáp án to dễ chạm. Nửa dưới màn trống (ảnh nhưng tốt cho tập trung). Thanh tiến độ rỗng (xám) lúc câu 1 | — |
| Bài học — phản hồi sai | **4** | Đáp án đúng xanh đặc + ô sai viền đỏ | Phản hồi đỏ nhạt + nút Tiếp xanh = tốt. **Nút phụ "Giải thích thêm" trắng nằm giữa phản hồi và nút Tiếp, kéo mắt trước nút chính** | `06` |
| Bài học — xong bài | **3** | Cu Tít + "+10 XP" | Tiêu đề lặp `!!`; **"Đúng ngay lần đầu: 0%" nổi quá**, dòng "Câu sai được lưu vào Ôn tập" là thông tin thật hữu ích nhưng chữ 12px; nút "Học tiếp" tốt | `07` |
| Kiểm tra | **3** | Tiêu đề 2 dòng | CTA xanh tốt nhưng trang trơ, chữ 14px xám | — |
| Làm quen | **3** | Thanh tiến độ rồi tiêu đề | **Nút Tiếp bị bong bóng đè**; 6 ngôn ngữ (한국어, 日本語…) cùng khối với tiếng Anh/Việt, danh sách dài; không cuộn tới nút ngay | `01` |
| Chat (rỗng) | **3** | Nút "Gọi Bé Cu Tít" xanh to | Nút gọi chiếm toàn bề rộng, đẩy ô chat xuống; "Chat" (hành động chính của màn "Trò chuyện") yếu hơn "Gọi"; Cu Tít bị ép (0.1) | — |
| Chat (lỗi hết lượt) | **3** | Hộp đỏ nhạt giữa màn | Hộp lỗi + nút "Thử lại" phụ giống nút chính; "Thử lại" vô nghĩa khi hết lượt trong ngày (nên ẩn / nói giờ reset) | `chat-loi` |
| Gọi thoại | **4** | Cu Tít 112 | Tốt; nút "Bắt đầu gọi" xanh, "Gõ thay nói" phụ rõ | — |
| Camera (đồng ý) | **2** | Khối chữ | Đoạn 8 dòng 12px trước nút; nút chính cắt ở mép dưới | `03` |
| Nhập vai | **4** | Tên kịch bản đậm | Danh sách 5+ thẻ đều nhau, rõ; đã đủ | — |
| Xưng hô | **3** | Tiêu đề + "Bảng 20 cặp chuẩn" | Rất đặc (chip lồng chip); 3 nhóm chip cùng trọng lượng; cần cuộn mới thấy kết quả — **kết quả (cái người dùng muốn) nằm dưới màn** | `xung-ho-cuon` |
| Văn hóa | **3** | "Hỏi Bé Cu Tít" | Ô hỏi AI chiếm đầu trang, nút "Hỏi" disabled xám xanh; danh sách thẻ bị che bởi bong bóng | — |
| Phương ngữ | **4** | Tên từ + 3 miền | Nhịp lưới đều, tốt; bong bóng che | — |
| Phát âm | **3** | Lưới 6 thanh | Đẹp; chữ trục biểu đồ 10px | — |
| Cài đặt | **4** | Danh sách | Rõ, đều, chevron; thiếu nhóm "thường dùng" | — |

Vấn đề **xuyên suốt** (hệ thống, không phải từng màn):

- **Chữ nhỏ**: nhãn thanh tab ≈ 10px, nhãn ô chỉ số 11px, mô tả danh sách 12px, "Hôm nay 0/10 phút" 10px (WCAG không bắt buộc nhưng ở 320px đọc rất khó). Dùng thang chữ có sàn 12px cho thông tin phụ và 14px cho thông tin cần đọc.
- **Hai kiểu "viền xanh"** nghĩa khác nhau (card chỉ số viền xanh ở Hồ sơ = *không bấm*; nút phụ viền xanh = *bấm được*). Đề xuất: viền xanh chỉ cho thứ bấm được.
- **Nút chính xanh đặc luôn đủ nổi**, nhưng **hay có 2 khối xanh đặc cùng màn** (Chat: "Gọi" + "Gửi"; Gọi: "Bắt đầu gọi" + "Đồng ý, ghi âm") → mất thứ bậc.
- **Khoảng trắng**: lề 16px nhất quán ✅; nhưng khoảng cách dọc giữa các card ≈ 12–16px chưa tách nhóm (Học: lịch tuần/Tổng kết tuần/Ôn hôm nay dính nhau). Nên 24px giữa nhóm, 12px trong nhóm.
- **Bong bóng nổi** phá cả lưới lẫn phân cấp (mục 0.2).
- **Tương phản**: chữ xám trên nền kem ở màn sáng (mô tả hàng, "Chưa có thẻ đến hạn") ≈ 4,3:1 (ước lượng bằng mắt, **chưa đo bằng công cụ** — Axe MCP không kết nối trong phiên này); nên đo lại.
- Tối: bố cục giống sáng, không lỗi riêng; viền card tối hơi mờ hơn bản sáng (chấp nhận).

---

## 3. Hoạt ảnh

### 3.1 Hiện có (đo thật)

| Hoạt ảnh | Thời lượng / đường cong | Ở đâu | Nhận xét |
|---|---|---|---|
| View Transitions đổi màn | root `250ms linear` nhóm; fade vào/ra `160ms` linear | `global.css:483` | ✅ có; đường cong `linear` hơi máy móc |
| Fade dự phòng WebView cũ | `150ms ease-out` | `html.route-fade .shell-main` | ✅ |
| Nút (`Button`) | `120ms ease` opacity+transform | `packages/ui/Button.tsx` | ✅ theo token |
| Toggle/Segmented | `180ms`/`120ms ease` | `packages/ui` | ✅ |
| Thanh tiến độ (làm quen, bài học, luyện tập) | `transition-[width]` Tailwind mặc định = `150ms cubic-bezier(0.4,0,0.2,1)` | 3 nơi | ⚠️ khác token `--ct-motion-*` |
| Bong bóng co mini | `180ms` | `.cutit-bubble` | ✅ |
| Spinner | `0.8s linear` | `global.css:295` | ✅ |
| Nút micro (ToneLab) | `active:scale-95` | ToneLabScreen | ⚠️ lẻ loi, chỉ một nút |
| `MobileSimulatorFrame` | `0.3s ease` | mfe-knowledge | ⚠️ khác thang, có thể chết code trong app thật |
| **Cu Tít: 5 chuyển động** | `nay 0.9s`, `nhun 1.6s`, `lac 2.4s`, `tho 4s`, `nghieng 2.8s`, `ease-in-out` vô hạn | `cutit.css` | ❌ **KHÔNG hoạt động** (mục 0.1) |

Thang thời lượng token chỉ có 2 mức (120/180ms). **Chuyển cảnh 160/250ms nằm ngoài token**, thanh tiến độ 150ms nằm ngoài — nên gom về token.

### 3.2 Thiếu (người dùng cảm nhận được)

| Thời điểm | Hiện trạng đo được | Đề xuất |
|---|---|---|
| **Vào màn** | Chỉ cross-fade toàn trang | Thân trang trượt lên 8px + fade, 180ms `ease-out`, một lần |
| **Danh sách xuất hiện lần lượt** | 0 hoạt ảnh (Luyện tập hub, Nhập vai, Cài đặt, thẻ Văn hóa) | Stagger 30–40ms/mục, tối đa 6 mục đầu, không quá 280ms tổng |
| **Bấm đáp án / nút** | Đáp án trong bài học chỉ đổi màu tức thì | Nhấn: `scale .97` 80ms; đáp án đúng "nảy" 1 lần 200ms |
| **Phản hồi đúng/sai** | `getAnimations()` ngay sau bấm = **[]**; bảng phản hồi bật tức thì (nhảy layout đẩy nút xuống) | Bảng trượt lên 160ms; Cu Tít `khen` nảy 1 lần; sai: lắc ô sai 2 lần nhỏ (tắt khi giảm chuyển động) |
| **Tiến độ** | Thanh dài bằng nhảy theo `150ms` | Thanh có cùng token; thêm "pop" nhỏ khi hoàn tất câu |
| **Xong bài / ăn mừng** | Cu Tít đứng im, +XP hiện tức thì | XP đếm 0→+10 trong 600ms; 12–20 hạt giấy (CSS, không thư viện) 1,2s; Cu Tít `an-mung` nảy 2 chu kỳ rồi dừng |
| **Chuyển tư thế Cu Tít** | Đổi `src` của `<img>` → nháy ảnh (có thể nháy trắng khi ảnh chưa giải mã, vì `loading="lazy"`) | Preload tư thế kế (đã có `mood`), cross-fade 120ms bằng 2 `<img>` xếp chồng; **không** thêm gói đầu vì chỉ khi CuTit render |
| **Chat đang chờ AI** | Chỉ "..." trong bóng + chữ "Đang gửi…" | Ba chấm nhảy so le + Cu Tít `suy-nghi` |
| Streak tăng | Không có | Ngọn lửa 🔥 "bật" khi tăng |

### 3.3 Thừa / gây rối

- **Nhấp nháy ảnh Cu Tít ở bong bóng**: mỗi lần `thinking` đổi, ảnh đổi tư thế không chuyển → giật. Thêm cross-fade (mục trên).
- **Vô hạn lặp** (`infinite`) cho `lac`, `tho`, `nghieng`: chỉ nên chạy khi đang trong ngữ cảnh (đang chờ), dừng sau 3–5 chu kỳ để tiết kiệm pin và bớt phân tâm khi đọc. Chuyển động `tho` 4s trên `ngu` ổn (nhẹ).
- **Hoạt ảnh vô hạn của bong bóng khi `thinking` + Cu Tít to ở màn Gọi** có thể chồng nhau; chỉ cho một Cu Tít chuyển động mỗi màn.
- Không thấy hoạt ảnh gây rối thực sự ở bản hiện tại (vì Cu Tít đang đứng im). **Cảnh báo**: khi sửa mục 0.1, 5 hoạt ảnh vô hạn sẽ bật lên cùng lúc — cần giới hạn số chu kỳ và kiểm lại luật giảm chuyển động (rule `.ct-cutit--anim {animation:none!important}` sẽ có hiệu lực khi CSS được import).

### 3.4 Nhất quán

Hiện ≥ 7 giá trị khác nhau (120, 150, 160, 180, 250, 300, 800ms) và 4 đường cong (`ease`, `ease-out`, `linear`, `cubic-bezier`). Đề xuất bộ token: `--ct-motion-fast 120`, `base 180`, `slow 280`, `celebrate 1200`; đường cong `--ct-ease-out: cubic-bezier(.2,.8,.2,1)` cho vào, `--ct-ease-in-out` cho vòng lặp.

---

## 4. Nhân vật phụ

**Kết luận: nên thêm đúng 2 nhân vật nhỏ, có vai rõ, và chỉ ở nơi Cu Tít hiện trống. Không thêm cho mỗi màn.**

| Nhân vật | Vai | Ở đâu | Lý do / giới hạn |
|---|---|---|---|
| **Con trâu** (có trong ảnh mẫu `docs/thiet-ke/nhan-vat-mau-cu-tit.webp`) | **Bạn đồng hành của chuỗi ngày** — to dần/vui hơn khi chuỗi dài; ngủ khi chuỗi đứt | Bạn bè (cạnh danh sách), thẻ chuỗi ở Học, màn xong bài khi tăng chuỗi | Cho Bạn bè/chuỗi một "mặt" (hiện 3 ô số vô hồn). Cũng gánh nghĩa "đồng quê Việt Nam", cùng bảng màu Cu Tít |
| **Chim sẻ** | **Người đưa tin**: thông báo, nhắc học, "có bạn mời" | Banner nhỏ ở thông báo trong app, màn Bạn bè khi có lời mời, nhắc bài trong thông báo hệ thống | Tránh dùng Cu Tít cho cả "thông báo" lẫn "dạy" — tách giọng |

Nguyên tắc để không rối: (1) **một nhân vật chính mỗi màn** (Cu Tít), nhân vật phụ chỉ làm nền nhỏ ≤ 40px; (2) nhân vật phụ **không nói** (không bong bóng thoại, không tư thế riêng cho từng lỗi) — chỉ 3 trạng thái (vui/ngủ/gọi); (3) mỗi nhân vật thêm ~3 ảnh WebP ≈ 45 kB nhưng **lazy** như Cu Tít ⇒ **0 byte gói đầu**; (4) cần ảnh tạo bằng cùng quy trình `CAU-LENH-TAO-TU-THE.md` để cùng nét; (5) làm sau khi P0/P1 xong, vì hiện Cu Tít chính còn chưa hoạt động đúng.

Không đề xuất: nhân vật cho mỗi miền (Bắc/Trung/Nam) — hợp lý về nội dung nhưng thêm 3 bộ ảnh; để dự án riêng nếu muốn.

---

## 5. Đề xuất ưu tiên

Công sức: S ≤ 0,5 ngày · M ≈ 1–2 ngày · L > 2 ngày. "Gói đầu" = bundle tải đầu (đang ≈ 28,5 kB gzip cho `index-*.js` chính trong bản vừa build; trần dự án 67,5 kB).

### P0 — lỗi thật, sửa ngay

| # | Màn | Vấn đề | Cách sửa | Công | Gói đầu |
|---|---|---|---|---|---|
| P0-1 | Mọi màn có Cu Tít | `cutit.css` không import → không hoạt ảnh, ảnh Chat bị ép 14px, luật giảm chuyển động của Cu Tít không có hiệu lực | `import './cutit.css'` trong `CuTit.tsx`; thêm test kiểm `getComputedStyle(.ct-cutit).flexShrink==='0'` và test reduced-motion | S | +≈0,5 kB CSS; **vào gói đầu** nếu bong bóng nạp CSS ở chunk đầu (bong bóng lazy nên khả năng nằm chunk lười — kiểm `pnpm build` size-limit) |
| P0-2 | Bong bóng ↔ nội dung | Bong bóng che nút Tiếp, chevron, biểu đồ, chữ cuối | `.shell-main:not(.focus)` thêm `padding-bottom` cộng 72px (hoặc bong bóng tự ẩn khi sát nút/CTA ở đáy; hoặc dời lên khi có `.cta-bottom`); riêng Làm quen đặt `focus` | S | 0 |
| P0-3 | Ngoại tuyến | Ảnh Cu Tít vỡ, alt xuống dòng từng chữ | `globPatterns` thêm `webp`; alt/`onError` ẩn ảnh khi lỗi (đặt `aria-hidden` + ẩn `alt` trực quan) | S | 0 (precache ngoài gói đầu) |
| P0-4 | Chat | Hết lượt/mất mạng chỉ có hộp đỏ, nút "Thử lại" vô nghĩa khi hết lượt | Hiện `buon` + câu giờ reset; ẩn "Thử lại" khi `kind==='quota'` | S | 0 |

### P1 — làm app "sống" và đúng thứ bậc

| # | Màn | Vấn đề | Cách sửa | Công | Gói đầu |
|---|---|---|---|---|---|
| P1-1 | Học | Tiêu đề 3 dòng + English tranh CTA; chỉ số ngang hàng; không có Cu Tít | Tiêu đề một dòng "Chào bạn!" (Cu Tít `chao` 64 bên trái); English chuyển vào Cài đặt/Hồ sơ; 3 chỉ số thu nhỏ thành một hàng chip; CTA giữ | M | ≈ +0,3 kB (vẫn chunk lười của PathHome) |
| P1-2 | Phản hồi đúng/sai + Xong bài | Không có hoạt ảnh; "Đúng ngay lần đầu: 0%" nổi; `!!` | Bảng trượt 160ms; Cu Tít nảy; XP đếm; sửa tiêu đề; dòng % chỉ hiện khi ≥ 1 câu đúng, ngược lại thay bằng "Ôn lại 8 câu để nhớ lâu" kèm nút | M | ~0 (chunk bài học) |
| P1-3 | Rỗng/lỗi/tải ở Ôn tập, Hồ sơ, Tiến độ, Bạn bè | Không có Cu Tít; ô trống | `<EmptyState mood title body action/>` dùng chung (packages/ui): `ngu` rỗng, `buon` lỗi, `suy-nghi` tải, `ngu`+băng ngoại tuyến | M | +≈0,4 kB (component nhỏ, lazy) |
| P1-4 | Hồ sơ | Không có avatar/nhân vật; viền xanh gây hiểu nhầm | Cu Tít `chan-dung` 72 + tên + cấp; chỉ số bỏ viền xanh | S–M | ~0 |
| P1-5 | Làm quen | Màn đầu tiên trống Cu Tít, Tiếp bị che | Cu Tít `chao` 96 ở bước 1, `suy-nghi` khi đang chọn; bước 2 bỏ ngôn ngữ ít dùng vào "Khác" | M | ~0 |
| P1-6 | Camera/Gọi | Khối chữ riêng tư 8 dòng trước nút | Rút 2 dòng + "Chi tiết" mở rộng; nút chính cố định đáy | S–M | 0 |
| P1-7 | Chuyển tư thế Cu Tít | Nháy ảnh khi đổi tư thế | Hai `<img>` xếp chồng + `opacity 120ms`; preload tư thế kế | S–M | 0 |

### P2 — tinh chỉnh và mở rộng

| # | Việc | Công | Gói đầu |
|---|---|---|---|
| P2-1 | Gom token chuyển động (120/180/280/1200 + 2 đường cong), thay `transition-[width]`, MobileSimulatorFrame | S | 0 |
| P2-2 | Vào màn trượt lên + danh sách xuất hiện lần lượt (CSS thuần, tôn trọng `data-reduced-motion`) | M | +≈0,3 kB |
| P2-3 | Nhãn thanh tab ≥ 11px, mô tả hàng ≥ 12px; đo tương phản bằng Axe khi kết nối lại | S | 0 |
| P2-4 | Giới hạn chu kỳ lặp của Cu Tít (3–5 chu kỳ rồi dừng) | S | 0 |
| P2-5 | Con trâu (chuỗi/Bạn bè) + chim sẻ (thông báo) — mục 4 | L (cần ảnh) | 0 (lazy) |
| P2-6 | Kiểm tra ở emulator + `en` + `prefers-reduced-motion` sau khi sửa (phiên này chưa làm) | M | — |

Thứ tự đề xuất: P0-1 → P0-2 → P0-3 → P0-4 (một PR nhỏ, 1 ngày) → P1-2 + P1-3 + P1-1 → P1-5/6/7 → P2.

---

## 6. Điều chưa kiểm / hạn chế

- Không chạy Axe (MCP không kết nối) → mọi nhận định tương phản là mắt thường.
- Không thử trên emulator/thiết bị thật, không thử `prefers-reduced-motion` thật; chỉ đọc luật CSS.
- Màn `en` chỉ lấy từ ảnh dự án 1, không soi lại.
- Gateway chat trả lỗi "hết lượt hôm nay" vì quota AI của máy này; trạng thái đang tải chat chụp được bằng cách chặn mạng (`chat-dang-tai`), không phải do AI thật.
- Kích thước gói đầu lấy từ bản build local (index-*.js ≈ 28,5 kB gzip); chưa chạy `size-limit` chính thức.
