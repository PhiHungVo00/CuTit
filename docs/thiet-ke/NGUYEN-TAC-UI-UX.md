# Nguyên tắc UI/UX của Bé Cu Tít (4 nhóm, có số đo)

> Ngày 22/11/2026. Viết lại từ 4 nhóm người dùng đưa vào, đối chiếu chuẩn công khai (WCAG 2.2, Material, Apple HIG, NN/g) và **đo trên code hiện tại**.
> Mục đích: mọi phiên làm giao diện dùng chung một bảng kiểm. Mỗi luật có **con số** và **cách kiểm**, không chỉ là tên định luật.
> Liên quan: `docs/thiet-ke/soi-fe/BAO-CAO.md` (soi FE đợt 2), `docs/thiet-ke/KIEM-KE-GIAO-DIEN.md`, token ở `packages/ui/src/theme.css`.

Câu hỏi gốc khi nhìn một màn: **(1) mắt rơi vào đâu trước? (2) cái gì đi với cái gì? (3) có phải đoán không? (4) có khựng ở bước nào không?**

---

## 1. Điều hướng ánh nhìn: cái gì đập vào mắt trước

Gom từ: phân cấp thị giác, tương phản, 1/3, phối màu 60–30–10.

| Luật | Con số áp vào app | Cách kiểm |
|---|---|---|
| **Một điểm nhấn chính mỗi màn** | Mỗi màn có đúng 1 nút chính dùng `--ct-accent`. Hành động khác dùng nút viền hoặc nút chữ | Chụp màn, nheo mắt (hoặc làm mờ 8px): còn nhận ra nút chính không |
| **60–30–10** | 60% nền `canvas/surface` (kem hoặc nâu ấm), 30% chữ và đường kẻ `ink/line`, **≤10% màu nhấn** (`accent`, `gold`, chip). Màu nhấn không dùng làm nền khối lớn | Ảnh chụp: diện tích màu nhấn ≤ 1/10 khung |
| **Thang chữ có thứ bậc** | Tối đa **4 cỡ** mỗi màn: tiêu đề 26 / phụ đề 18 / thân 15–16 / chú thích 13. Chênh giữa hai bậc liền nhau ≥ 1,2 lần | Đếm cỡ chữ trong màn (DevTools) |
| **Tương phản chữ** | Chữ thường ≥ **4.5:1**, chữ lớn (≥ 24px hoặc ≥ 18,66px đậm) ≥ **3:1**; viền ô nhập, icon có nghĩa ≥ **3:1** (WCAG 1.4.3, 1.4.11) | axe-core trong e2e; Lighthouse a11y giữ 100 |
| **Vị trí đắc địa** | Thông tin quan trọng nhất ở **1/3 trên** màn (vùng mắt nhìn trước). Nút hành động chính ở **1/3 dưới** (vùng ngón cái, xem nhóm 4) | Chụp 360×800 và 412×915 |
| **Cu Tít là điểm nhấn cảm xúc, không tranh với nút chính** | Cu Tít đứng cạnh tiêu đề hoặc ở trạng thái rỗng. Không đặt chồng lên nút chính, không nhảy liên tục (giới hạn 3–5 chu kỳ, P2-4 soi FE) | Nheo mắt: Cu Tít và nút chính không cùng "nặng" |

**Đo trên code (22/11):** đang có **13 cỡ chữ** rải rác (`text-sm` 131 chỗ, `text-[15px]` 83, `text-xs` 49, `text-lg` 44, `text-base` 21, `text-[26px]` 12, `text-xl` 10, `text-[16px]` 10, `text-2xl` 7, `text-3xl` 4, cùng `17/20/22px` mỗi cỡ một chỗ) ⇒ **nên gom thành thang 5 token** (`--ct-text-title/heading/body/body-sm/caption`). Đây là việc của P2-1 soi FE.

## 2. Gom nhóm và tạo khoảng thở: cái gì đi với cái gì

Gom từ: gần gũi, khoảng trắng, Gestalt, Miller (chia cụm), lưới 8pt.

| Luật | Con số áp vào app | Cách kiểm |
|---|---|---|
| **Lưới 8pt (nửa bước 4)** | Khoảng cách chỉ dùng 4, 8, 12, 16, 24, 32, 48 px (Tailwind `1, 2, 3, 4, 6, 8, 12`). Không dùng 5, 7, 10, 14 | grep `p-/gap-/m-` lạ trong diff |
| **Gần trong nhóm, xa giữa nhóm** | Trong nhóm 8–12px, giữa các nhóm ≥ **24px** (tỉ lệ ≥ 2:1) | Ảnh chụp: thấy được ranh giới nhóm mà không cần đường kẻ |
| **Tiêu đề dính với nội dung của nó** | Khoảng trên tiêu đề nhóm ≥ 2 lần khoảng dưới | Như trên |
| **Chia cụm (chunking)** | Danh sách dài thì chia theo nhóm có tên (ví dụ Cài đặt: Học / Âm thanh / Tài khoản). **Không áp máy móc "7±2"** cho menu: menu nhìn thấy được thì người dùng nhận ra chứ không cần nhớ (NN/g). 7±2 dùng cho thứ phải *nhớ*: mã khôi phục, chuỗi bước | Đếm mục trong nhóm; mã dài thì chia khối 4 ký tự |
| **Một màn, một việc** | Bài học: một câu hỏi mỗi màn. Onboarding: một quyết định mỗi bước | Đọc luồng |
| **Đừng làm "bức tường chữ"** | Đoạn văn ≤ 3–4 dòng trên điện thoại. Văn bản pháp lý hay riêng tư dài thì rút gọn và để nút "Chi tiết" mở rộng (P1-6) | Ảnh chụp 360px |

**Đo trên code:** khoảng cách chủ yếu là `2/3/4` (8/12/16px) đúng lưới; `5`, `1.5`, `0.5` có vài chỗ, cần rà khi chạm vào.

## 3. Giữ trật tự và sự quen thuộc: đừng bắt não phải đoán

Gom từ: căn chỉnh, lặp lại và nhất quán, định luật Jakob, tỷ lệ vàng.

| Luật | Con số áp vào app | Cách kiểm |
|---|---|---|
| **Một trục căn trái** | Chữ thân và tiêu đề căn trái theo lề 16px (điện thoại). Căn giữa chỉ dùng cho màn trống, màn chúc mừng, hộp thoại ngắn | Ảnh chụp: các mép trái thẳng hàng |
| **Thành phần dùng chung** | Nút, thẻ, chip, ô nhập, EmptyState lấy từ `packages/ui`. **Không tự viết lại trong từng MFE** (kiểm kê 20/11: mỗi MFE tự viết `card`/`primaryBtn`) | Review diff: không có class nút hay thẻ mới tự chế |
| **Màu mang nghĩa cố định** | Xanh `accent` = hành động hoặc đúng; `danger` = sai hoặc xóa; `gold` = thưởng, XP; chip1/2/3 = ngôi 1 / ngôi 2 / kính ngữ. Không dùng `danger` để trang trí | Review |
| **Jakob, quen tay** | Thanh tab dưới (4–5 mục), quay lại ở góc trên trái, đóng ✕ góc trên phải, hành động chính ở đáy. Đăng nhập theo mẫu phổ biến: Google trước, rồi tên đăng nhập và mật khẩu, có hiện/ẩn mật khẩu | So với app phổ biến |
| **Trạng thái đủ bộ** | Mỗi màn có dữ liệu ngoài mạng phải có 4 trạng thái: **đang tải / rỗng / lỗi / ngoại tuyến** (EmptyState + Cu Tít, P1-3) | Test vitest cho từng trạng thái |
| **Tỷ lệ vàng** | Chỉ dùng làm gợi ý cho bố cục ảnh bìa hoặc tranh (landing, thẻ lớn). **Không bắt buộc** trong UI vận hành, vì lưới 8pt và căn chỉnh quan trọng hơn | — |
| **Song ngữ không vỡ bố cục** | Chuỗi tiếng Anh thường dài hơn hoặc ngắn hơn tiếng Việt 20–30%: nút không cắt chữ, không xuống 3 dòng | Chụp vi + en |

## 4. Giảm sức cản: dễ đọc, dễ bấm

Gom từ: Fitts, Hick, typography.

| Luật | Con số áp vào app | Cách kiểm |
|---|---|---|
| **Vùng chạm** | Mục tiêu chạm ≥ **44×44px** (Apple; dự án đang dùng `min-h-11` = 44px); nút chính **48px** (`min-h-12`, Material 48dp). Sàn pháp lý WCAG 2.5.8 AA là 24×24 CSS px; 44 là mức AAA (2.5.5) | axe `target-size`; e2e đo `boundingBox` nút chính |
| **Khoảng giữa hai mục chạm** | ≥ **8px** (Material) | Ảnh chụp, DevTools |
| **Fitts, gần ngón cái** | Hành động chính ở đáy màn, rộng gần hết bề ngang (trừ lề 16px). Hành động phá hủy (xóa) xa nút chính và có bước xác nhận | Chụp 360px, cầm máy thật thử một tay |
| **Hick, ít lựa chọn mỗi lúc** | Mỗi bước quyết định ≤ **3–4 lựa chọn chính**. Lựa chọn hiếm dùng gom vào "Khác" hoặc "Thêm" (ví dụ P1-5: ngôn ngữ ít dùng vào "Khác") | Đếm nút trên màn |
| **Cỡ chữ thân** | Thân ≥ **15px** (app đang dùng 15). Chữ phụ ≥ **12px**, nhãn tab ≥ **11px** (P2-3) | grep `text-[1[01]px]`, `text-xs` ở chữ quan trọng |
| **Độ dài dòng** | Điện thoại 30–45 ký tự mỗi dòng. Màn rộng giới hạn `max-width` ~ **65ch** (45–75 ký tự) | Chụp máy tính |
| **Giãn dòng cho tiếng Việt** | Thân `line-height` **≥ 1.5** vì dấu chồng (ặ, ỗ, ữ) cần chỗ. Tiêu đề ≥ 1.25 | Chụp chữ có dấu chồng: dấu không chạm dòng trên |
| **Phản hồi tức thì** | Chạm ⇒ có phản hồi trong **≤ 100ms** (đổi trạng thái nút); việc > 1s có chỉ báo (Cu Tít "suy nghĩ"). Ngưỡng hiệu năng e2e: một lần chạm < 300ms với CPU chậm 4× | e2e `@perf` |
| **Chuyển động có chừng mực** | 120 / 180 / 280ms theo token, tôn trọng `prefers-reduced-motion` / `data-reduced-motion` | Test với giảm chuyển động bật |

---

## Bảng kiểm 12 dòng cho mỗi PR có đổi giao diện

Dán vào mô tả PR, đánh dấu từng dòng:

1. [ ] Mỗi màn có **một** nút chính; nheo mắt vẫn thấy nó trước.
2. [ ] Màu nhấn ≤ 10% diện tích; màu đúng nghĩa (đúng/sai/thưởng).
3. [ ] ≤ 4 cỡ chữ mỗi màn, lấy từ thang token; thân ≥ 15px, `line-height` ≥ 1.5.
4. [ ] Khoảng cách thuộc lưới 4/8; trong nhóm ≤ 12px, giữa nhóm ≥ 24px.
5. [ ] Căn trái một trục (trừ màn trống hoặc chúc mừng).
6. [ ] Dùng thành phần `packages/ui`, không tự chế nút hay thẻ mới.
7. [ ] Vùng chạm ≥ 44px (nút chính 48px), cách nhau ≥ 8px; nút chính ở đáy.
8. [ ] Mỗi bước ≤ 3–4 lựa chọn chính; còn lại vào "Khác".
9. [ ] Đủ 4 trạng thái tải / rỗng / lỗi / ngoại tuyến (nếu có dữ liệu).
10. [ ] Ảnh chụp **vi + en, sáng + tối, 360px**: không cắt chữ, không cuộn ngang.
11. [ ] axe-core 0 lỗi; Lighthouse a11y 100; tương phản ≥ 4.5:1.
12. [ ] Tôn trọng giảm chuyển động; phản hồi chạm ≤ 100ms.

## Nguồn đã tham khảo

- W3C, Understanding SC 2.5.8 Target Size (Minimum): https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- Google, Android Accessibility, Touch target size (48dp, cách 8dp): https://support.google.com/accessibility/android/answer/7101858
- Material Design, Applying density: https://material.io/design/layout/applying-density.html
- Smashing Magazine (2024), vùng chạm tối thiểu theo WCAG: https://smashingmagazine.com/2024/07/getting-bottom-minimum-wcag-conformant-interactive-element-size/
- Stephanie Walter, menu không cần luật 7±2 (dẫn NN/g "Short-Term Memory and Web Usability"): https://stephaniewalter.design/blog/your-menu-doesnt-need-millers-7±2-rule/
- WCAG 2.2 1.4.3 / 1.4.11 (tương phản chữ 4.5:1, thành phần 3:1); Apple HIG (vùng chạm 44pt). Đây là kiến thức chuẩn công khai, chưa mở lại trang trong phiên này.
