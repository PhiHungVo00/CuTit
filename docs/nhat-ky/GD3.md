# Nhật ký GĐ3 — Hội thoại AI (nhánh `claude/gd3-hoi-thoai-cebfb5`)

Kế hoạch: `docs/superpowers/plans/2026-11-18-gd3-hoi-thoai.md`.

## 2026-11-18 — đã xong (dừng giữa chừng vì hết hạn mức phiên)
- **Task 1 Nội dung**: 3 kịch bản cuối unit `sc5` (hàng xóm mới, u1), `sc6` (mua trái cây, u2), `sc7` (ăn trưa + hỏi đường, u3), `reviewed:false`; mỗi unit có bài cuối `u{n}l5` với `roleplay`, `exercises: []`.
- **Task 2–3 Gateway chat**: `mode: 'chat'|'call'` (prompt văn nói, không “sửa” dấu của bản chép lời, `PROMPT_VERSION tutor-2026.11.2`), `done.newWords` (lọc: phải có trong reply, có nghĩa), gia sư giả lập phủ sc5–sc7; lượt chat không còn chờ TTS.
- **Task 4 Quota**: bảng `ai_usage` + migration `0001_ai_usage`, `DbQuotaStore` (upsert nguyên tử), năng lực `turn` (`MAX_CHAT_TURNS_PER_DAY=60`), `done.turnsLeft`, `GET /v1/quota`, 429 có `capability` + `resetAt`.
- **Task 5 Lộ trình**: `lessonHref` (bài nhập vai ⇒ `/nhap-vai?kb=..&bai=..`), `/bai-hoc/u1l5` chuyển hướng, link “bỏ qua, sang bài sau”.
- **Task 6 Tổng kết**: màn nhập vai đọc `kb`/`bai`, xong ⇒ `completeLesson`; tổng kết lỗi + từ mới, một chạm thêm thẻ SM-2. api-client phân biệt hết lượt ngày với rate-limit phút.
- **Task 7 (một phần)**: `SilenceDetector` + `callReducer` (thuần, có test). Chưa nối `useVoiceInput({autoStop})`.

## Còn lại
- Task 7: `useVoiceInput` tùy chọn `autoStop` (bỏ guard `status` cũ).
- Task 8: màn `/goi-thoai` (CallScreen, `useCall`, `speakReply` gọi `/v1/speech/synthesize` có time-box + fallback TTS máy + watchdog, nút nói chậm, phụ đề, gõ thay nói, VoiceConsent tách riêng, thông báo hết lượt có giờ reset), route Host + size-limit.
- Task 9: e2e (sửa `path.spec.ts` 4/4 → 5/5 và đi qua nhập vai; `app.spec.ts` nhập vai không còn tự lưu thẻ ⇒ bấm một chạm; e2e gọi thoại 2 lượt micro giả, cổng 4213/4040), `pnpm build/test/lint:boundaries/size`, thử 1 lượt Gemini thật.
- Migration sẽ trùng số `0001` với phiên “nối tiến độ” — ai merge sau sinh lại (ghi chú ở thư mục ghi chú chung).
- D4 (chế độ trẻ em không gọi tự do): chưa làm, để GĐ4.
