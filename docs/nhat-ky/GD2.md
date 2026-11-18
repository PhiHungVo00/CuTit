# Nhật ký GĐ2 — Kỹ năng đặc thù tiếng Việt

> Nhánh `claude/gd2-ky-nang-viet-6eb955` (dựng trên `fa16cd9`). Plan: `docs/superpowers/plans/2026-11-18-gd2-ky-nang-viet.md`.
> Kế hoạch tổng: `docs/KE_HOACH_PHAT_TRIEN_TOAN_DIEN.md` mục 5 (GĐ2 điểm 1, 2, 3, 5), R5, D9. Điểm 4 (xưng hô ngữ cảnh) và 6 (Stories) không thuộc brief này.
> Mức bằng chứng: 🟢 đã chạy · 🔵 đọc code.

## 0. Baseline trước khi sửa (2026-11-18) 🟢
`pnpm install --frozen-lockfile` OK · `pnpm build` 19/19 task · `pnpm test` 35/35 task.

## 1. Đã làm
| Việc | Commit | Ghi chú |
|---|---|---|
| Contract `packages/contracts/src/api/speech.ts` (Assess, AudioPack, Explain) | `2b36032` | `AssessResponseSchema` cũ (chưa client nào dùng) chuyển sang file mới, hình dạng mới. |
| **A3 thật** `apps/gateway/src/services/assessment/` + năng lực `stt` | `2b36032` | Xem mục 2. 🟢 |
| Nội dung: bài `speak` (10 bài, không ở bài 1), `dialectNotes` mỗi unit, `localizeText` (A7), `speakableTexts` | `8420d0b` | 🟢 |
| **TTS theo miền (D9)**: `providers/tts.ts`, `FileAudioStore`, `runPrebuild`, route `/audio/*`, `/speech/synthesize` dùng tệp dựng sẵn | `63d13b1` | Xem mục 3. 🟢 |
| Script CLI `pnpm --filter @vietlearning/gateway tts:prebuild -- --pack u1 --dialect south` | `c16f5b1` | Chạy thật: mục 4. |
| Dạng bài **nói lại câu** + player âm thanh offline | `5c2069f` | Xem mục 5. 🟢 |
| `TONE_SETS` (8 bộ cặp tối thiểu, nháp) + gói `tones` | `36cc6b2` | 🟢 |
| **Phòng tập thanh điệu** `/phong-thanh` (mfe-speech-lab) | `749e1c8` | Xem mục 6. 🟢 |
| **Chế độ miền** trong bài học + thẻ “miền khác nói thế nào” | `0a58f40` | Xem mục 7. 🟢 |
| **Giải thích câu trả lời** bằng LLM | `fab588a` | Xem mục 8. 🟢 |
| e2e `gd2.spec.ts`, ngân sách gói, nhật ký | commit cuối | Mục 9. |

## 2. A3 — chấm câu (R5)
- STT (qua năng lực `stt`, hiện dùng Gemini đa phương thức) **không nhận câu mẫu** → tránh “nghe theo đáp án”.
- So khớp **âm tiết** sau NFC + chữ thường + bỏ dấu câu. Thanh lấy từ dấu tổ hợp (U+0300 huyền, U+0301 sắc, U+0309 hỏi, U+0303 ngã, U+0323 nặng).
- Căn chỉnh Levenshtein: khớp 0, chỉ khác dấu thanh 0.4, khác hẳn 1, chèn/xóa 1; khi bằng chi phí ưu tiên “thiếu ở cuối” (người học dừng sớm).
- Trạng thái: `correct` / `tone` (đúng chữ sai thanh, có `expectedTone`/`heardTone`) / `wrong` / `missing` / `extra`. Điểm = (đúng + 0.5·sai thanh)/số âm tiết × 100 − 5/âm tiết thừa.
- **A2 từng âm tiết** chỉ khi tách được đúng số đoạn hữu thanh (khoảng lặng ≥ 80 ms) = số âm tiết; không thì không phán thanh. Không làm forced alignment (ngoài danh mục A1–A8). Trạng thái đúng/sai do chữ quyết định.
- Không có STT (e2e, máy không khóa) → `mock: true`, client coi là **bỏ qua, không tính sai**.

## 3. TTS theo miền (D9)
- Prompt *director's notes* (AUDIO PROFILE / DIRECTOR'S NOTES / “Read ONLY the transcript, word for word” / TRANSCRIPT riêng), không dùng `systemInstruction` (model TTS trả 400).
- Bật **chỉ khi** `TTS_PROVIDER=gemini` (mặc định `none` kể cả khi có khóa — tránh tiêu 10 lượt/ngày). `GEMINI_TTS_MODEL` (mặc định `gemini-3.8-flash-tts`), `GEMINI_TTS_VOICE` (`Kore`), `TTS_AUDIO_DIR`, `PUBLIC_BASE_URL`.
- Đầu ra PCM `audio/L16;rate=24000` được bọc WAV (`pcm16ToWav`). Khóa = sha256(văn bản NFC, `model/giọng/phiên bản prompt`, tốc độ, miền).
- Kho: `apps/gateway/.data/tts/<hash>.wav`, `packs/<gói>-<miền>.json` (chỉ tệp **đạt**), `state/<gói>-<miền>.json` (ok / rejected / unverified + lời STT nghe được).
- Script chạy nhiều lần: bỏ qua tệp đạt; tệp `unverified` chỉ kiểm lại; tệp bị loại tổng hợp lại tối đa 2 lần; 429 TTS hoặc STT lỗi → dừng êm, lưu trạng thái. Kiểm lại STT dùng timeout 30 s (giới hạn 9 s của app không đủ — lần đầu bị `llm_timeout`).
- Route công khai `GET /audio/<hash>.wav` (immutable), `GET /audio/packs/<gói>-<miền>.json` (5 phút), tên tệp kiểm bằng regex, `cross-origin-resource-policy: cross-origin` (helmet mặc định chặn `<audio>` khác origin).
- **Âm thanh không commit vào git** (`apps/gateway/.data/` đã gitignore) — chờ quyết định: commit tệp nén nhỏ hay object storage (R2/S3) khi deploy (GĐ5).

## 4. Chạy thật script (2026-11-18) 🟢
`tts:prebuild --pack u1 --dialect south` — gói u1 có **23 văn bản**.
- Lần 1: tổng hợp 1 tệp (“xin chào”), STT kiểm lại bị timeout 8 s → để `unverified` (đúng thiết kế).
- Lần 2 (STT 30 s): kiểm lại không tổng hợp lại → **LOẠI** “xin chào”, STT nghe ra “Chào bạn, xin chào.” (model tự thêm từ — đúng loại lỗi D9 đã thấy). Tổng hợp câu tiếp theo → **429 hết hạn mức ngày**, dừng êm.
- **Kết quả: đạt 0/23 · loại 1 · chưa tạo 22.** Gói miễn phí đã hết lượt trong ngày (lượt còn lại bị dùng ở lần thử D9 trước đó). Chưa thể kết luận chất lượng; cần người nghe tệp bị loại để biết STT hay TTS sai.
- Client chưa có tệp → tự dùng TTS của máy (đã kiểm bằng test).

## 5. Nói lại câu (`packages/exercises/src/speak/`)
- Ghi ≤ 8 s, WAV 16 kHz → `/v1/speech/assess`. Lần đầu bấm micro: hỏi đồng ý `consents.voice` (cùng khóa M1), nói rõ bản ghi đi qua máy chủ app tới dịch vụ nhận dạng, app không lưu.
- Kết quả kiểu ELSA: tô màu từng âm tiết (✓ đúng, 〜 sai thanh, ✗ sai, ∅ thiếu — có ký hiệu cho người mù màu), “bạn nói thêm”, danh sách **thanh lệch** (từ chữ STT và từ cao độ A2 nếu có), nhãn đọc màn hình đầy đủ. Nút Thử lại / Tiếp / **Không nói được lúc này**.
- Đạt ≥ 70 điểm; SM-2: ≥90→5, ≥80→4, ≥70→3, còn lại 1. Mock → gọi `onSkip` (không ghi lượt sai, không tạo thẻ).
- `coursePlayer`: tải gói unit × miền vào Cache Storage `becutit-audio-v1` khi mở bài (mạng trước, mất mạng đọc bản lưu), phát tệp dựng sẵn hoặc TTS của máy. `say()` của mọi dạng bài dùng player.

## 6. Phòng tập thanh điệu (`apps/mfe-speech-lab/src/gym/`, route `/phong-thanh`, ô ở Khám phá — không tính vào 12 công cụ)
- Nghe phân biệt: một bộ cặp tối thiểu, 2–3 lựa chọn khác thanh; không có âm thanh vẫn làm được.
- Bắt thanh: 10 câu, chọn 1 trong 6 thanh trước khi hết giờ; bắt đầu 5 s, đúng ×0.85, sai ×1.15, kẹp 1.5–6 s (luật trò chơi, không phải thuật toán học).
- Tiến bộ: mỗi thanh có điểm **nói** (từ `toneStats` của store tiến độ, chỉ đọc) + tỉ lệ **nghe đúng** + xu hướng 7 ngày. Kết quả nghe lưu store riêng `becutit.toneGym` (30 ngày) — **chưa đồng bộ lên server** (store tiến độ/đồng bộ thuộc phiên khác).
- `TONE_SETS` 8 bộ (ma, la, ba, ca, me, co, ban, tai), `reviewed:false` — cần người bản ngữ duyệt nghĩa.

## 7. Chế độ miền (A7)
- `buildItem` đổi từ hiển thị/đọc/đáp án của nghĩa, nghe chọn, điền từ, ghép câu, nói lại câu theo `preferences.dialect`. **Không** đổi bài luyện thanh; `refKey` giữ nguyên (thẻ ôn, lỗi gần đây dùng chung giữa các miền).
- Thay **nguyên từ** khớp dạng Bắc, một lượt (không thay dây chuyền gầy→ốm→bệnh), giữ hoa đầu câu. Bỏ mục đồng hình: d4 roi, d8 ngã, d16 ô, d18 hoa, d25 thế, d29 ốm (Bắc = bệnh, Nam = gầy).
- Thẻ “miền khác nói thế nào” ở mỗi unit (5 mục/unit, chunk lazy khi mở), bấm nghe theo giọng từng miền.
- Giọng theo miền chỉ có khi có tệp dựng sẵn; TTS của máy vẫn là một giọng chung.

## 8. Giải thích câu trả lời
- `POST /v1/practice/explain` → JSON `{explanation, tip}` qua `llm.generateJson`, Zod ở Gateway, sai schema → 502 `llm_bad_output`. Không có khóa → lời giải theo mẫu, `mock: true`.
- Cache trong RAM (LRU 500) theo sha256(phiên bản prompt, dạng bài, đề, đáp án, câu trả lời, ngôn ngữ) — không thêm migration DB (tránh trùng số với phiên song song). Trừ quota `llm` chỉ khi gọi thật.
- Nút “💡 Giải thích thêm” sau câu sai (trắc nghiệm, ghép câu), hiển thị chữ thuần, không dùng `role="status"` để không lẫn phản hồi đúng/sai.

## 9. Kiểm tra cuối (2026-11-18) 🟢
- `pnpm build` 19/19 · `pnpm test` 35/35 task (**161** test node:test + **116** vitest) · `pnpm lint:boundaries` 0 vi phạm (326 module).
- Ngân sách: tải ban đầu **67.67 / 68.5 kB**. Nâng có lý do: CSS 7.5 → 7.8 kB (đo 7.51), trang chủ lộ trình 3 → 3.3 kB (đo 3.12). Mục mới: Nói lại câu 3.47/3.9 · Phòng tập 5.2/5.8 · Thẻ miền 0.69/1.5 · coursePlayer 0.99/1.5 · A7 1.46/2 kB.
- e2e (cổng 4203/4030): `gd2.spec.ts` 6/6 (nói lại câu với micro giả lập + mock Gateway thật + kết quả đủ trạng thái; micro bị từ chối; phòng tập thanh ở Pixel 7 và 320 px). Toàn bộ: **66 passed, 3 skipped (perf)**. Lần chạy đầu có 1 lỗi chập chờn ở `sync.spec.ts` (GĐ0, timeout khi chạy song song); chạy riêng 3/3 qua, chạy lại toàn bộ qua.

## 10. Cần người quyết
1. **Bật trả phí Gemini** (hoặc chạy rải nhiều ngày): gói miễn phí 10 lượt TTS/ngày/model; 3 unit × 3 miền ≈ 200 văn bản (+ gói tones 37).
2. **Nghe duyệt giọng** theo miền, và nghe tệp bị loại `apps/gateway/.data/tts/bbbd9c67….wav` (“xin chào”) để biết model đọc thừa hay STT nghe nhầm.
3. Lưu âm thanh: commit vào git / object storage khi deploy.
4. Người bản ngữ duyệt: `TONE_SETS`, 10 bài `speak`, danh sách mục A7 bị loại khỏi thay tự động.

## 11. Lưu ý kỹ thuật
- Sửa JSON trong `packages/content` thì `tsc -b` không chép lại vào `dist` — chạy `pnpm exec tsc -b --force` trong package đó.
- Khi bật TTS, M1/M7 (`routes/chat.ts`, phiên GĐ3) sẽ nhận `audioUrl` tương đối `/audio/...` — cần thêm gốc URL như `/speech/synthesize`. `TTSCacheProxy.configured` chỉ true khi có nhà cung cấp, nên mặc định chat không gọi TTS.
- Tệp đã sửa ngoài phạm vi riêng (thêm, không xóa): `apps/gateway/src/app.ts`, `config.ts`, `cache/TTSCacheProxy.ts`, `routes/speech.ts`, `routes/practice.ts`; `packages/contracts/src/api/endpoints.ts` (bỏ AssessResponse cũ); host `routes.tsx`, `screens/Explore.tsx`, `exploreI18n.ts`, `.size-limit.cjs`; `packages/prompts/src/PromptBuilder.ts`. Không đụng `sync.ts`, `progress.ts`, `gamification.ts`, `mfe-conversation`, `routes/chat.ts`.
