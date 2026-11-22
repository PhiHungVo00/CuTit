# Nguồn âm thanh trang giới thiệu

Ô “Một câu, ba miền” (dự án 7, spec `docs/superpowers/specs/2026-11-21-trang-gioi-thieu-design.md` mục 5.1). Tệp tạo bằng `apps/landing/scripts/lay-am-thanh.mjs`; không gọi Gateway lúc chạy.

| Mục | Giá trị |
|---|---|
| Câu | **“Xin chào! Tôi tên là Lan.”** (có trong cả 3 manifest `u1-*`) |
| Miền Bắc → tệp | `ba-mien-bac.{ogg,mp3}`, giọng **Trúc Ly** (nữ) |
| Miền Trung → tệp | `ba-mien-trung.{ogg,mp3}`, giọng **Ngọc Trân** (nữ) |
| Miền Nam → tệp | `ba-mien-nam.{ogg,mp3}`, giọng **Thùy Dung** (nữ) |
| Mô hình TTS | VieNeu-TTS v3 Turbo (Apache-2.0), chạy trên máy, ngày 2026-11-18 |
| Kiểm | Luật tự động của dự án (`autoVerdict`, D9): STT chép khớp nguyên văn hoặc khớp khi bỏ dấu thanh. **Người nghe chưa duyệt** từng tệp. |
| Chuyển đổi | ffmpeg: ogg = Opus 48 kbps mono; mp3 = 64 kbps mono; bỏ metadata |
| Dung lượng | ogg 9–10 kB, mp3 13–15 kB (trần 40 kB) |
| Kho gốc | Kho âm thanh khóa học `apps/gateway/.data/tts/` (không commit), manifest `packs/u1-{north,central,south}.json` |

Lưu ý:
- Mô hình gắn **watermark không nghe thấy** mặc định (D9, giữ nguyên).
- Giọng do mô hình tổng hợp, không phải người thật đọc; không có nguồn giọng riêng nào bị sao chép.
- Tệp chỉ dùng trong trang giới thiệu; nếu đổi câu thì chạy lại script với `--cau "<câu mới>"`.
