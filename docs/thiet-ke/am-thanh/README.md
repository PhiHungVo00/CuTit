# Bộ âm thanh hiệu ứng ứng viên (chưa gắn vào app)

9 sự kiện × 2 ứng viên (A/B). Nghe thử: mở [`nghe-thu.html`](nghe-thu.html) bằng trình duyệt (bấm đúp tệp; không cần máy chủ). Chọn xong thì gắn vào app ở bước sau.

## Giấy phép

Mọi tệp lấy từ **Kenney** (Kenney Vleugels, kenney.nl), giấy phép **Creative Commons Zero (CC0 1.0)**: https://creativecommons.org/publicdomain/zero/1.0/
- Tệp `License.txt` trong cả hai gói ghi: dùng được cho dự án cá nhân và **thương mại**; ghi công "không bắt buộc". Bản sao nằm ở [`giay-phep-kenney/`](giay-phep-kenney/).
- Tải ngày 20/11/2026 từ trang chính thức: https://kenney.nl/assets/interface-sounds (100 tệp, v1.0) và https://kenney.nl/assets/ui-audio (50 tệp, 2012). Trang tải của cả hai ghi "License: Creative Commons CC0".
- Không dùng gói nào ngoài Kenney. Không dùng Freesound.
- Nên ghi công trong màn "Giới thiệu": "Âm thanh: Kenney (kenney.nl), CC0".

## Danh sách tệp

Cột "Tên gốc" là tên tệp `.ogg` trong gói **Interface Sounds** (thư mục `Audio/`). Gói UI Audio đã tải và đọc license nhưng **không dùng tệp nào** (chỉ có click/chuyển công tắc, không có âm đúng/sai/hoàn thành).

| Tệp (`ung-vien/`) | Sự kiện | Tên gốc | Ogg | MP3 | Dài | Đỉnh |
|---|---|---|---|---|---|---|
| tap-a | Chạm nút | click_001 | 476 B | 1009 B | 0,10 s | -3,1 dB |
| tap-b | Chạm nút | select_001 | 383 B | 696 B | 0,05 s | -4,6 dB |
| correct-a | Đúng | confirmation_001 | 1366 B | 2263 B | 0,30 s | -5,4 dB |
| correct-b | Đúng | confirmation_003 | 1382 B | 2420 B | 0,33 s | -4,5 dB |
| wrong-a | Sai | bong_001 | 665 B | 1166 B | 0,13 s | -3,7 dB |
| wrong-b | Sai | drop_002 | 834 B | 1636 B | 0,19 s | -3,3 dB |
| complete-a | Hoàn thành bài | confirmation_002 | 2306 B | 3674 B | 0,54 s | -3,8 dB |
| complete-b | Hoàn thành bài | confirmation_004 | 2147 B | 3360 B | 0,50 s | -5,7 dB |
| streak-a | Lên chuỗi ngày | maximize_004 | 1919 B | 2890 B | 0,41 s | -1,4 dB |
| streak-b | Lên chuỗi ngày | glass_004 | 3284 B | 4458 B | 0,66 s | -1,6 dB |
| bubble-open-a | Mở bong bóng Cu Tít | open_002 | 1611 B | 2420 B | 0,32 s | -6,3 dB |
| bubble-open-b | Mở bong bóng Cu Tít | maximize_003 | 1094 B | 1793 B | 0,22 s | -7,5 dB |
| speak-start-a | Cu Tít bắt đầu nói | question_001 | 2056 B | 3360 B | 0,50 s | -8,4 dB |
| speak-start-b | Cu Tít bắt đầu nói | pluck_002 | 699 B | 1166 B | 0,13 s | -5,5 dB |
| notify-a | Thông báo | glass_001 | 1361 B | 2107 B | 0,27 s | -3,0 dB |
| notify-b | Thông báo | select_003 | 1122 B | 1793 B | 0,22 s | -4,3 dB |
| tab-a | Chuyển tab | tick_004 | 460 B | 853 B | 0,06 s | -13,1 dB |
| tab-b | Chuyển tab | toggle_004 | 489 B | 853 B | 0,07 s | -13,4 dB |

**Tổng dung lượng:** 18 tệp `.ogg` = 23 654 B (≈ 23,1 kB); 18 tệp `.mp3` = 37 917 B (≈ 37,0 kB). Tệp lớn nhất 4,4 kB (streak-b.mp3), đều dưới ngưỡng 15 kB.

## Cách xử lý (ffmpeg 9.0)

1. Cắt khoảng lặng hai đầu (ngưỡng -55 dB), đổi sang mono 48 kHz.
2. Chuẩn hóa: đo LUFS trên bản **lặp lại** của clip (clip ngắn hơn cửa sổ 400 ms của ebur128 nên không đo trực tiếp được), rồi chỉnh gain về mục tiêu -16 LUFS (câu trả lời, hoàn thành, chuỗi, thông báo), -17/-18 (chạm, bong bóng, nói, sai: mềm hơn), **-26 (chuyển tab: rất khẽ)**.
3. Giới hạn đỉnh `alimiter` ở -3 dBFS rồi mã hóa; sau mã hóa đo lại, nếu đỉnh > -1,2 dB thì giảm gain từng 1,5 dB và mã hóa lại. Kết quả: mọi tệp ogg và mp3 có đỉnh ≤ -1,4 dBFS.
4. `.ogg` = Opus 32 kb/s mono; `.mp3` = LAME 48 kb/s mono 44,1 kHz (dự phòng cho trình duyệt/thiết bị không phát Opus, ví dụ Safari/iOS cũ).

**Lưu ý đo đạc:** LUFS đo trên bản lặp là xấp xỉ. Clip rất ngắn (tap, tab, wrong) bị giới hạn đỉnh nên nhỏ hơn mục tiêu (khoảng -19 đến -27 LUFS); đó là chủ ý, vì âm chạm lặp nhiều lần không nên to. Hai đỉnh -1,4/-1,6 dB (streak) là sát ngưỡng nhất.

## Chưa nghe thật

Phiên tạo bộ này chọn ứng viên theo tên gói, độ dài và độ to đo được, **không nghe được bằng tai**. Quyết định cuối thuộc người dùng sau khi nghe `nghe-thu.html`.

## Sự kiện thiếu âm hợp

- **Sai (nhẹ nhàng):** Kenney Interface Sounds có 8 âm `error_*` nhưng đều là kiểu "lỗi" (đục, buzz), không dùng cho trẻ em. Hai ứng viên là `bong_001` và `drop_002` (âm trầm ngắn, không phải âm báo lỗi). Khả năng cao chưa đủ ấm; nếu nghe thấy cứng, nên thử `question_*` (đi xuống nhẹ) hoặc tự tạo âm hạ cao độ nhẹ.
- **Cu Tít bắt đầu nói:** gói không có âm "nhân vật" (chibi, giọng, chuông gió). `question_001` và `pluck_002` là âm giao diện, chưa có tính cách. Có thể thiếu nét vui; nếu muốn nhân vật hóa thì cần tệp Freesound CC0 hoặc ghi âm riêng.
- Các sự kiện còn lại (chạm, đúng, hoàn thành, chuỗi, bong bóng, thông báo, tab) có ứng viên hợp lý.
