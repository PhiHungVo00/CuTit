# Nhật ký GĐ3 — Hội thoại AI (nhánh `claude/gd3-hoi-thoai-cebfb5`)

Kế hoạch: `docs/superpowers/plans/2026-11-18-gd3-hoi-thoai.md`. Mọi bước làm TDD, commit nhỏ.

## 1. Nhập vai cuối mỗi unit
- 3 kịch bản mới (bản nháp `reviewed:false`, có trường `unit`): `sc5` Gặp hàng xóm mới (u1), `sc6` Mua trái cây ở chợ (u2, có dứa/thơm, số đếm), `sc7` Ăn trưa rồi hỏi đường (u3).
- Mỗi unit có bài cuối `u{n}l5` với `"roleplay": "sc…"`, `exercises: []`. `pathModel` tự đếm ⇒ unit giờ có 5 bài.
- Lộ trình chỉ liên kết qua URL (`lessonHref` ⇒ `/nhap-vai?kb=sc5&bai=u1l5`), không import chéo MFE. `/bai-hoc/u1l5` chuyển hướng.
- Khi “Học tiếp” trỏ vào bài nhập vai: thêm link “Chưa nói được lúc này? Sang bài sau: …”, để người học không bị kẹt khi mất mạng hoặc hết lượt AI. Bài nhập vai không bị ghi là đã xong.
- Màn nhập vai đọc `kb`/`bai`. Kết thúc khi đã nói ≥ 1 lượt thì gọi `progressStore.completeLesson(bai, {total: số nhiệm vụ, firstTryCorrect: số nhiệm vụ xong})` ⇒ XP như bài thường. `bai` chỉ được ghi khi đúng là bài của kịch bản đó.
- Gia sư giả lập có từ khóa + lời nhắc cho sc5–sc7. Có test bảo đảm mọi kịch bản đều được phủ.

## 2. Gọi thoại với Bé Cu Tít (`/goi-thoai`, vào từ màn Trò chuyện)
- Vòng: micro → **tự nhận ngừng nói** (`SilenceDetector`: ngưỡng = nền ồn × 3 kẹp [0.015, 0.08]; im 1.2 s ⇒ dừng; không nói 8 s ⇒ tạm dừng; tối đa 15 s) → STT `/v1/speech/transcribe` → lượt chat `mode:'call'` → đọc trả lời → nghe tiếp.
- Máy trạng thái thuần `callReducer` (half-duplex: micro chỉ mở lại sau khi đọc xong; tối đa 12 lượt/cuộc; hết lượt ⇒ kết thúc; lỗi mạng ⇒ tạm dừng + “Thử lại”).
- Đọc trả lời (`createSpeaker`): thử `/v1/speech/synthesize` (time-box 4 s). Nếu Gateway trả 503 thì nhớ cho cả cuộc gọi và dùng TTS của máy. Luôn có watchdog `max(3 s, 90 ms/ký tự)`, nên vòng gọi không treo khi máy không báo “đọc xong”.
- Nút “🐢 Nói chậm lại”: đọc lại câu cuối chậm (audio 0.75×, TTS máy rate 0.7) và giữ chậm cho các câu sau. Phụ đề bật/tắt. “⌨️ Gõ thay nói” (tự chuyển khi micro bị từ chối). Gác máy.
- Hộp đồng ý micro `voice` tách thành `VoiceConsent` dùng chung. Bản cho gọi thoại nói rõ “gửi đi ngay khi bạn ngừng nói” (chat vẫn cho sửa chữ trước khi gửi).
- `useVoiceInput` thêm `autoStop` và `cancel`. Guard dùng ref, để lượt 2 không bị giá trị `status` cũ chặn.
- Sửa sau review:
  - Luôn xin giọng máy chủ tốc độ chuẩn và chỉ chậm lúc phát. Trước đó bị chậm hai lần (~0.56×) và tách khóa cache.
  - Âm thanh máy chủ dừng khi watchdog chạy, khi gác máy và khi rời màn.
  - “Thử lại” sau lỗi mạng dùng `session.retry`, nên không lặp câu của người học (có e2e).
  - Hết thời lượng nhận giọng nói (STT 600 s/ngày) báo riêng và chuyển sang gõ chữ.

## 3. Tổng kết sau buổi nói/nhập vai
- `buildSummary`: lỗi đã sửa (itemRef `roleplay:<câu đúng>` như cũ) + từ mới (`conv:word:<từ>`), bỏ trùng theo NFC.
- `SessionSummary`: mỗi mục một nút “＋ Thêm vào ôn tập” (thẻ SM-2 sẵn có), nút “Thêm tất cả”. **Không tự lưu nữa** (trước đây nhập vai tự lưu lỗi).
- `done.newWords` (contract): AI đề xuất, Gateway lọc (phải có nguyên cụm trong câu trả lời, có nghĩa `en`, bỏ đại từ, tối đa 3). Bộ giả lập lấy từ của khóa học có trong câu trả lời.

## 4. Kiểm soát chi phí
- Bảng `ai_usage(user_id, usage_day_utc, capability, units)` + migration `0002_ai_usage` (đổi số khi gộp main, vì `0001_progress_tombstone` đã có trước). `DbQuotaStore` trừ hạn mức nguyên tử bằng `INSERT … ON CONFLICT DO UPDATE … WHERE units + n ≤ limit` (20 yêu cầu song song, hạn mức 5 ⇒ đúng 5). Principal ẩn danh đếm trong RAM. Xóa tài khoản xóa luôn bộ đếm (cascade).
- Năng lực mới `turn`: `MAX_CHAT_TURNS_PER_DAY=60` lượt/ngày UTC. `done.turnsLeft`, `GET /v1/quota`. Lỗi 429 có `capability` + `resetAt`.
- Giới hạn độ dài: câu ≤ 500 ký tự (contract), ghi âm ≤ 15 s, gọi thoại trả lời ≤ 300 token (chat 700), 12 lượt/cuộc gọi.
- Lượt chat **không còn chờ TTS ở Gateway** (trước đây mỗi lượt gọi TTS nếu có nhà cung cấp ⇒ chậm + đốt hạn mức TTS cho cả chat gõ).
- Báo hết lượt song ngữ kèm giờ lượt mới (giờ máy người học) + “Bài học, ôn tập… vẫn dùng bình thường”. api-client tách 429 do gửi quá nhanh (“Bạn gửi hơi nhanh…”) khỏi hết lượt ngày.

## 5. Prompt `tutor-2026.11.2`
- `setMode('call')`: văn nói 1–2 câu, không emoji/markdown, KHÔNG sửa dấu/viết hoa/dấu câu của bản chép lời. Yêu cầu `newWords`.
- **Thử Gemini thật (1 lượt, `gemini-3.5-flash-lite`)**: `mock:false`, schema đầu ra mới được chấp nhận, `newWords` = dứa/ngọt, `turnsLeft: 59`. Nhưng model **vẫn “sửa” dấu + viết hoa** dù prompt cấm ⇒ thêm chốt chặn tất định `dropTranscriptionNoise` ở Gateway (chế độ gọi bỏ lời sửa nếu khớp bản chép lời sau khi bỏ dấu/hoa/dấu câu). Có test.

## Kiểm tra (lần chạy cuối trên HEAD, đúng thứ tự build → test → lint → build host → size → e2e)
- `pnpm build` ✅ 19/19 task.
- `pnpm test` ✅ 35/35 task, **273 test**: gateway 59, state 27, content 24, api-client 12, audio-dsp 12, contracts 10, mfe-conversation 36, exercises 23, mfe-path 22, mfe-knowledge 18, mfe-learner 9, ui 8, mfe-practice 7, host 3, mfe-vision 2, speech-lab 1.
- `pnpm lint:boundaries` ✅ 310 module, 0 vi phạm.
- size-limit ✅: tải ban đầu **68.1/68.5 kB**. Chunk mới: `CallRoute` 4.39 kB (ngân sách 5), `useChatSession` 8.83 kB (10; phần chat dùng chung M1/M7/gọi thoại tách ra, nên `ChatRoute` còn ~0.7 kB), `SessionSummary` 1.03 kB (1.5).
- e2e ✅ **70 qua, 3 bỏ qua** (`@perf` chỉ chạy ở project perf). Cổng 4213/4040, Gateway thật PGlite, provider giả. `e2e/conversation.spec.ts` gồm: nhập vai cuối unit 1 ⇒ 5/5 bài + XP + thêm từ vào ôn tập; gọi thoại 2 lượt bằng micro giả tự nhận ngừng nói; thử lại sau mất mạng không lặp câu; hết lượt ≠ gửi quá nhanh; giao diện tiếng Anh. Đã sửa `path.spec.ts` (4/5, 5/5, link bỏ qua) và `app.spec.ts` (nhập vai: một chạm lưu thẻ).
- Bẫy đã gặp: `pnpm test` (turbo) build lại `apps/host-shell/dist` **không có** `VITE_GATEWAY_URL` ⇒ bản build trỏ cổng 4000 và mọi test e2e cần Gateway báo “mất mạng”. Luôn chạy `VITE_GATEWAY_URL=http://localhost:4040 pnpm --filter @vietlearning/host-shell build` NGAY TRƯỚC e2e.

## Lệch có chủ đích — cần Lead Dev xác nhận
- `SilenceDetector` (`apps/mfe-conversation/src/call/silenceDetector.ts`) là luật ngưỡng năng lượng tự viết. Nó chỉ so mức RMS sẵn có với nền ồn, không xử lý tín hiệu mới, nhưng vẫn nằm ngoài danh mục A1–A8. Phương án thay: thư viện VAD (tốn bundle) hoặc bắt người học bấm dừng.
- Màn `/goi-thoai` nằm ngoài M1–M12 của TDD (thuộc M1 mở rộng, quyết định GĐ3 trong kế hoạch tổng). Không thêm vào 12 công cụ ở Khám phá.

## Đồng bộ sau khi merge
- Đã kiểm tra (chỉ đọc) nhánh “nối tiến độ”: `sync.ts` so khác trạng thái `progressStore` ⇒ `completeLesson` của bài nhập vai sinh `xp.add` + `lesson.progress` như bài thường, không cần sửa thêm.

## Còn lại / lưu ý merge
- **Migration trùng số `0001`** với phiên “nối tiến độ” (`progress_tombstone`). Bên merge sau xóa `0001` + snapshot của mình rồi chạy lại `db:generate`.
- `TTSCacheProxy` vẫn chưa có nhà cung cấp ⇒ gọi thoại đang đọc bằng TTS của máy. Khi GĐ2 nối TTS, màn gọi tự dùng (D9 khuyên câu động dùng TTS máy vì hạn mức TTS Gemini 10 lần/ngày; có thể cần cờ tắt).
- Kịch bản sc5–sc7 cần người bản ngữ duyệt (D8).
- D4 chế độ trẻ em (không gọi/chat tự do): chưa làm, thuộc GĐ4.
- Chưa thử trên máy Android thật (micro/TTS thật) — thuộc việc phát hành hoãn lại.
