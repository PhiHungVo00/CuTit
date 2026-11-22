# Câu lệnh tạo bộ tư thế Bé Cu Tít bằng Gemini

Ảnh mẫu: `docs/thiet-ke/nhan-vat-mau-cu-tit.webp` (do bạn tạo bằng Gemini, 20/11/2026).

## Cách làm

1. Mở **một cuộc trò chuyện mới** trong Gemini, đính kèm ảnh mẫu.
2. Dán **câu lệnh chung** ở dưới, rồi lần lượt dán từng câu tư thế (mỗi lần một ảnh). Giữ nguyên cuộc trò chuyện để nhân vật không bị “trôi”.
3. Ảnh nào lệch (đổi màu áo, mất khăn rằn, mặt khác) thì bảo: “Làm lại, giữ đúng nhân vật như ảnh mẫu đầu tiên.”
4. Tải ảnh **độ phân giải cao nhất**, đặt tên đúng như cột “Tên tệp”, gửi lại cho mình (thả vào chat là được). Mình sẽ tách nền, cắt, nén và đưa vào app.

## Câu lệnh chung (dán đầu tiên, kèm ảnh mẫu)

```
Đây là nhân vật Bé Cu Tít, linh vật của một app học tiếng Việt. Từ giờ, mỗi lần mình mô tả một tư thế, hãy vẽ lại ĐÚNG nhân vật này:
- giữ nguyên khuôn mặt chibi, mắt nâu to, tóc đen rối, má hồng, miếng băng cá nhân trên má trái;
- nón lá, khăn rằn đen trắng quàng cổ, áo nâu cài cúc, quần đen xắn gấu, chân đất;
- cùng nét vẽ, cùng tông màu, viền trắng dày kiểu sticker quanh nhân vật.
Yêu cầu cho mọi ảnh: khung vuông 1:1, thấy toàn thân, nhân vật nằm giữa và chiếm khoảng 80% chiều cao; nền là MỘT màu xanh lá phẳng #00FF00 (không cảnh vật, không bóng đổ xuống nền, không chữ, không chữ ký, không khung).
Trả lời "Đã hiểu" rồi chờ mình mô tả tư thế đầu tiên.
```

## Các tư thế (mỗi dòng một ảnh)

| # | Tên tệp | Dùng ở đâu trong app | Câu dán vào Gemini |
|---|---|---|---|
| 1 | `cutit-chao.png` | Mở app, bong bóng Cu Tít, giới thiệu | Cu Tít mỉm cười tươi, một tay vẫy chào, tay kia cầm cọng lúa. |
| 2 | `cutit-khen.png` | Trả lời đúng | Cu Tít cười híp mắt, giơ ngón tay cái, hơi nghiêng người về phía trước. |
| 3 | `cutit-an-mung.png` | Xong bài, lên cấp, chuỗi ngày | Cu Tít nhảy cẫng lên, hai tay giơ cao, nón lá bay khỏi đầu một chút, miệng cười lớn. |
| 4 | `cutit-dong-vien.png` | Trả lời sai | Cu Tít gãi đầu, cười hiền ngượng ngùng, ánh mắt ấm áp như nói "không sao đâu, thử lại nhé". |
| 5 | `cutit-suy-nghi.png` | AI đang trả lời / đang tải | Cu Tít một tay chống cằm, mắt nhìn lên trên, vẻ đang suy nghĩ. Không vẽ dấu hỏi hay chữ. |
| 6 | `cutit-nghe.png` | Đang thu âm giọng người học | Cu Tít khum một bàn tay sau tai, nghiêng đầu lắng nghe chăm chú, miệng mím cười. |
| 7 | `cutit-noi.png` | Cu Tít đang nói / đọc mẫu | Cu Tít miệng mở như đang nói, một tay đưa ra phía trước như đang giải thích. |
| 8 | `cutit-nhac-hoc.png` | Thông báo nhắc học, mục tiêu ngày | Cu Tít ôm một quyển vở trước ngực, mỉm cười mời gọi. |
| 9 | `cutit-buon.png` | Mất chuỗi ngày, lỗi mạng (nhẹ nhàng) | Cu Tít ngồi bó gối trên bãi cỏ nhỏ, hơi buồn nhưng vẫn dễ thương, không khóc. |
| 10 | `cutit-ngu.png` | Chưa có dữ liệu, ngoại tuyến | Cu Tít ngủ gật, ngồi tựa vào bó rơm nhỏ, nón lá che nửa mặt. |
| 11 | `cutit-chan-dung.png` | Avatar trong bong bóng và chat | Chân dung Cu Tít từ vai trở lên, nhìn thẳng, cười tươi, nón lá thấy rõ. Nhân vật chiếm gần hết khung. |
| 12 | `cutit-icon-app.png` | Biểu tượng app trên điện thoại | Biểu tượng ứng dụng: đầu và vai Cu Tít đội nón lá, cười tươi, nằm gọn trong vòng tròn chiếm 66% ở giữa khung; nền KHÔNG phải xanh lá mà là màu kem #FBF3E4 phẳng; không chữ. |

## Lưu ý về quyền dùng

- Điều khoản AI tạo sinh của Google cho phép bạn dùng nội dung mình tạo ra, kể cả mục đích thương mại, miễn không vi phạm chính sách sử dụng của họ. Trước khi phát hành, **đọc lại điều khoản hiện hành** của Gemini cho loại tài khoản bạn dùng.
- Ảnh từ Gemini có watermark ẩn SynthID; có thể có thêm **dấu logo nhìn thấy được ở góc** tùy gói tài khoản. Nếu ảnh có logo ở góc, báo mình; không tự xóa logo nếu điều khoản không cho phép.
- Ảnh do AI tạo ra thường **không được bảo hộ bản quyền** ⇒ người khác có thể sao chép linh vật. Nếu muốn giữ độc quyền thương hiệu, về sau nên đăng ký nhãn hiệu cho tên + hình Bé Cu Tít, hoặc thuê họa sĩ vẽ lại (cách B, Rive).

## Trang giới thiệu (dự án 7)

Dùng cho trang giới thiệu bản web (`apps/landing`, spec `docs/superpowers/specs/2026-11-21-trang-gioi-thieu-design.md` mục 5.5). Cùng cách làm như trên: mở **cuộc trò chuyện mới**, đính kèm ảnh mẫu `docs/thiet-ke/nhan-vat-mau-cu-tit.webp`, dán câu lệnh chung trước rồi mới dán từng câu bên dưới.

Bảng màu lấy từ chủ đề sáng của app (`packages/ui/src/theme.css`): nền kem `#fbf3e4`, xanh lá `#6fa544`, vàng rơm `#e9b949`, xanh nhạt `#cfe8f3`, nâu chữ `#5a3e28` và `#3b2a1e`.

### Câu lệnh chung cho trang giới thiệu (dán đầu tiên, kèm ảnh mẫu)

```
Đây là nhân vật Bé Cu Tít, linh vật của một app học tiếng Việt. Giữ đúng nhân vật như ảnh mẫu: khuôn mặt chibi, mắt nâu to, tóc đen rối, má hồng, miếng băng cá nhân trên má trái, nón lá, khăn rằn đen trắng quàng cổ, áo nâu cài cúc, quần đen xắn gấu, chân đất.
Phong cách: vẽ phẳng, nét đều, tông màu ấm của làng quê Việt Nam (kem, xanh lá, vàng rơm, nâu). Không chữ, không chữ ký, không logo.
Trả lời "Đã hiểu" rồi chờ mình mô tả ảnh đầu tiên.
```

| # | Tên tệp mình sẽ nhận | Dùng ở đâu | Câu dán vào Gemini |
|---|---|---|---|
| a | `tranh-lang-que.png` | Nền phần đầu trang (2400×1200) | Tranh làng quê Việt Nam vẽ phẳng, khung ngang 2:1 (2400×1200). Bên trái để trống khoảng 40% chiều rộng, không vẽ gì ở đó, để đặt chữ lên. Bên phải: lũy tre xanh, đồng lúa vàng rơm, một con trâu nhỏ, mái đình nâu, vài cánh cò bay. Tông màu: kem `#fbf3e4`, xanh lá `#6fa544`, vàng rơm `#e9b949`, xanh nhạt `#cfe8f3`. Không có người, không có chữ, không có logo. |
| b | `cutit-vay-chao.png` | Nhân vật vẫy chào trong phần đầu trang | Cu Tít đội nón lá, một tay vẫy chào tươi cười, tay kia buông thõng. Toàn thân, nhân vật nằm giữa khung vuông, chiếm khoảng 80% chiều cao. Nét vẽ rõ, viền trắng dày kiểu sticker. Nền là MỘT màu xanh lá phẳng #00FF00 (không bóng đổ, không cảnh vật, không chữ) để tách nền. |
| c | `anh-chia-se.png` | Ảnh xem trước khi chia sẻ (Open Graph, 1200×630) | Khung ngang 1200×630. Bên trái: tranh làng quê như ảnh (a), thu nhỏ. Bên phải: Cu Tít đội nón lá cười tươi, nhìn người xem. Để trống phía trên bên trái khoảng 1/3 chiều cao cho chữ. Không chữ trong ảnh. |

### Lưu ý khi tải về

- Tải ảnh **độ phân giải cao nhất**, đặt tên đúng như cột “Tên tệp”, rồi gửi lại cho mình.
- Ảnh (b) cần nền xanh lá phẳng để tách nền: nếu Gemini cho nền có bóng hoặc cảnh vật, bảo làm lại.
- Quyền dùng và watermark áp dụng như các mục ở trên.
