---
name: dung-am-thanh
description: Dựng sẵn âm thanh khóa học theo 3 miền (Bắc/Trung/Nam) bằng VieNeu-TTS + faster-whisper chạy trên máy, duyệt tự động. Dùng sau khi thêm/sửa từ, câu, truyện, bộ thanh điệu trong 04-am-thanh-tri-thuc/packages/content, hoặc khi người dùng hỏi về giọng đọc theo miền (D9).
---

# Dựng âm thanh ba miền (D9)

Chi tiết và lịch sử quyết định: `docs/nhat-ky/D9-TTS-LOCAL.md`. Người dùng quyết định **không bật trả phí Gemini** và **không cần người nghe duyệt**.

1. **Máy chủ local** (venv ngoài repo đã cài sẵn ở `%USERPROFILE%\.becutit\tts`):
   `Start-Process "$env:USERPROFILE\.becutit\tts\Scripts\python.exe" -ArgumentList '-X','utf8','tools/tts-local/server.py','--port','8765' -PassThru`. Ghi PID, rồi chờ `http://127.0.0.1:8765/health`.
2. **Dựng** (chỉ tạo tệp mới hoặc thay đổi, chạy lại nhiều lần an toàn):
   `pnpm --filter @vietlearning/gateway tts:prebuild -- --pack all --dialect all`
   Chạy 2–4 lượt cho tới khi số "loại" ổn định (câu sai chữ được tạo lại tối đa 4 lần).
3. **Luật duyệt tự động** (`autoVerdict` trong `01-nen-tang/apps/gateway/src/services/tts/prebuild.ts`):
   - từ đơn: tin giọng mẫu;
   - câu: khớp nguyên văn **hoặc** khớp khi bỏ dấu thanh;
   - sai chữ: tạo lại, rồi loại; client dùng TTS của máy cho câu bị loại.
   - `--human-review` chỉ dùng khi người dùng yêu cầu.
4. **Giọng:** `TTS_VOICE_NORTH/CENTRAL/SOUTH` (mặc định Trúc Ly, Ngọc Trân, Thùy Dung). Đổi giọng thì khóa cache đổi theo.
5. Âm thanh nằm ở `01-nen-tang/apps/gateway/.data/tts` (gitignored, **không commit**). Khi deploy phải chuyển sang object storage (xem `docs/van-hanh/BACKUP.md`).
6. Dừng máy chủ TTS theo đúng PID. Ghi kết quả (đạt / loại theo gói × miền) vào nhật ký.
