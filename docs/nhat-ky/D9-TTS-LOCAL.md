# D9 — Giọng đọc ba miền bằng TTS chạy trên máy (miễn phí)

> Quyết định của bạn (2026-11-18): không bật trả phí Gemini. Thay bằng **VieNeu-TTS v3 Turbo** (Apache-2.0) và **faster-whisper** (MIT), chạy trên máy lúc soạn nội dung. Kế hoạch tổng: mục 9 (D9). Bối cảnh: `GD2.md` mục 3–4.

## 1. Kiến trúc

- **Máy chủ local `tools/tts-local/server.py`**: API kiểu OpenAI, chỉ nghe ở `127.0.0.1:8765`.
  - `POST /v1/audio/speech` → WAV 24 kHz mono PCM16. Model trả 48 kHz, server resample bằng soxr để tệp nhẹ một nửa.
  - `POST /v1/audio/transcriptions` → `{text}`. Âm thanh được đệm 0,5 s lặng ở hai đầu, tắt `condition_on_previous_text`, temperature 0. **Không** đưa câu mong đợi làm prompt.
  - Môi trường: venv `%USERPROFILE%\.becutit\tts`, Python 3.11, nằm ngoài repo.
  - Ryzen 5 5600H không có VNNI nên chạy fp32; int8 có thể ra âm rè.
- **Gateway (Nguyên tắc 4)**:
  - `TTS_PROVIDER=openai-compatible` → `OpenAiCompatTtsProvider`. Biến môi trường: `TTS_BASE_URL`, `TTS_MODEL`, `TTS_VOICE_NORTH/CENTRAL/SOUTH`.
  - `OpenAiCompatSttProvider` hiện chỉ script dựng sẵn dùng.
  - Giọng theo miền đi vào khóa cache qua `ttsVoiceId(p, dialect)` ở **cả** `prebuild.ts` lẫn `routes/speech.ts`. Nhờ vậy tệp dựng sẵn và tệp tạo lúc chạy có cùng khóa.
- **Nguyên tắc 1** (không tự host AI) vẫn đúng lúc chạy app. Model chỉ là **công cụ soạn nội dung**: app và Gateway production chỉ phục vụ tệp tĩnh.

## 2. Giọng chọn (bạn đã nghe mẫu và duyệt "Đạt")

| Miền | Giọng | Ghi chú |
|---|---|---|
| Bắc | Trúc Ly (nữ) | Bắc có 16 giọng mẫu |
| Trung | Ngọc Trân (nữ) | **chỉ có 2 giọng Trung** (thêm Quang Sơn, nam) |
| Nam | Thùy Dung (nữ) | Nam có 7 giọng |

- Đổi giọng bằng biến môi trường. Khóa cache đổi theo, nên không lẫn tệp cũ.
- `infer()` mặc định gắn **watermark** (không nghe thấy). Đang giữ nguyên.

## 3. Cách kiểm (rút ra từ chạy thật)

- **Câu nhiều âm tiết:** Whisper phải chép ra **đúng nguyên văn**. Trước khi so, chuẩn hóa NFC, bỏ dấu câu, đổi chữ số 0–10 thành chữ ("2 ly" → "hai ly"). Sai thì tạo lại, tối đa 4 lần; vẫn sai thì chuyển sang **chờ nghe**.
- **Từ đơn:** Whisper chép rất kém: ảo giác "Xin hãy đăng ký kênh…", "tôi" thành "ui", "má/mả/mã/mạ" đều thành "Mà".
  - **Đo F0 (pyin)** cho thấy model **đọc đúng thanh**:
    - Bắc: ma phẳng, mà rơi 9 nửa cung, má cuối lên, mả trũng, mã lên có gãy, mạ ngắn và tắc.
    - Nam: hỏi = ngã cùng một đường lượn, đúng đặc điểm giọng Nam.
  - Vì vậy từ đơn mà STT không khớp thì chuyển thẳng sang **chờ nghe**, không tạo lại vô ích.
- **Miền Trung:** Whisper nghe thanh Huế kém (WER 33–50% ở câu mẫu), nên **mọi tệp Trung đều chờ người nghe duyệt**.
- **Manifest gói chỉ gồm tệp `ok`.** Tệp chờ nghe không bao giờ tới client; client dùng TTS của máy thay thế.

## 4. Kết quả chạy toàn khóa (2026-11-18)

| Gói | Bắc đạt tự động | Nam đạt tự động | Trung |
|---|---|---|---|
| u1 (23) | 17 | 19 | 23 chờ nghe |
| u2 (27) | 12 | 12 | 27 chờ nghe |
| u3 (25) | 16 | 11 | 25 chờ nghe |
| tones (40) | 4 | 2 | 40 chờ nghe |

- **Tổng: 93 tệp đạt tự động, 252 tệp chờ người nghe**, khoảng 13 MB, mất khoảng 1–2 giây cho mỗi tệp trên CPU.
- Âm thanh nằm ở `apps/gateway/.data/tts/` (**gitignored, chưa commit**). Cách lưu khi deploy (commit tệp nén hay dùng object storage) quyết ở GĐ5.
- **Kiểm trong app thật:** chạy Gateway với thư mục này và bản build host, chọn Miền Nam, mở bài u1l1.
  - App tải `u1-south.json` và 19 WAV vào Cache Storage `becutit-audio-v1`.
  - Bấm "Nghe lại" thì phát `blob:` từ cache, tức tệp dựng sẵn, không phải TTS của máy.

## 5. Quy trình nghe duyệt

1. Chạy máy chủ local và script:
   ```
   %USERPROFILE%\.becutit\tts\Scripts\python.exe -X utf8 tools/tts-local/server.py
   pnpm --filter @vietlearning/gateway tts:prebuild -- --pack all --dialect all
   ```
2. Mở `apps/gateway/.data/tts/review/index.html` qua một máy chủ tĩnh (vd. `python -m http.server` trong `.data/tts`).
   - Trang gom mọi tệp chờ nghe theo gói × miền, có "Phát lần lượt".
   - Tích "sai" ở câu đọc sai chữ hoặc sai thanh. Trang sinh JSON `{"u1-central": ["câu sai"]}`.
3. Lưu JSON thành tệp, rồi chạy:
   ```
   tts:prebuild -- --approve --reject-file <tệp>
   ```
   Câu không tích chuyển sang `ok`, câu tích chuyển sang `rejected` và được tạo lại. Sau đó chạy lại `tts:prebuild` để ghi manifest và tạo lại câu sai.

## 6. Còn mở

- **Người nghe duyệt 252 tệp**, ưu tiên miền Trung và gói thanh điệu (phòng tập thanh cần đúng thanh).
- Tốc độ đọc là tốc độ tự nhiên (khoảng 4,5 âm tiết/giây), hơi nhanh với người mới. Hướng xử lý rẻ: nút đọc chậm phía client (`playbackRate` 0,8, trình duyệt giữ cao độ). Không cần tạo lại âm thanh.
- Lưu trữ âm thanh khi deploy (GĐ5).

## 7. Quyết định 19/11: bỏ bước người nghe, duyệt hoàn toàn tự động
Bạn quyết: giọng mẫu ba miền là giọng chuẩn, không cần người duyệt. Luật mới (`autoVerdict` trong `prebuild.ts`):
- **Từ đơn:** tin giọng mẫu. STT chép âm tiết đứng riêng rất kém; đo F0 bộ ma/má/mà… cho thấy model đọc đúng thanh.
- **Câu:** lời STT phải khớp nguyên văn **hoặc** khớp khi bỏ dấu thanh, vì STT nghe thanh Huế và giọng miền kém. Lỗi cần bắt ở câu là model đọc thiếu, thừa hoặc đổi chữ (đã gặp thật, vd. “Tôi tên là Lan”). Không khớp ⇒ tạo lại tối đa 4 lần ⇒ vẫn sai thì loại, client đọc câu đó bằng TTS của máy.
- `--human-review` vẫn còn nếu sau này muốn người nghe duyệt.

**Kết quả:** **347/387 tệp đạt** (Bắc 121, Trung 108, Nam 118; cả 3 gói thanh điệu 37/37). 40 câu bị loại, chủ yếu do Whisper không biết từ địa phương (“ở mô”, “món ni”, “quẹo”) hoặc model thêm chữ (“năm mươi nghìn ạ” ⇒ “50 nghìn nha”). Các câu này dùng TTS của máy.
