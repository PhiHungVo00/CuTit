# Chuỗi dự phòng AI, hạn mức theo giờ Việt Nam, trần toàn cục

> Áp dụng cho `apps/gateway`. Quyết định ngày 20/11/2026: xếp tầng **nhiều API miễn phí** (OpenRouter `:free`, Groq, Cloudflare, Nous…) sau Gemini; chấp nhận rủi ro dữ liệu của tầng free. Danh sách nhà cung cấp cuối cùng CHƯA chốt nên mọi thứ cấu hình bằng biến môi trường, không sửa code.

## 1. Cấu hình chuỗi

Ba biến, mỗi biến là danh sách `nhà_cung_cấp[:model]` cách nhau bằng dấu phẩy, thử **từ trái sang phải**:

| Biến | Dùng cho | Mặc định khi không đặt |
|---|---|---|
| `LLM_CHAIN` | chat, nhập vai, gọi thoại, hỏi văn hóa, giải thích bài tập | `gemini` nếu có `GEMINI_API_KEY`, không thì bộ giả lập (`mock: true`) |
| `VISION_CHAIN` | nhận diện ảnh camera | như trên |
| `STT_CHAIN` | chép lời giọng nói (và chấm phát âm) | như trên |

Ví dụ:

```
LLM_CHAIN=gemini,openrouter:google/gemma-4-31b-it:free,groq:openai/gpt-oss-120b
VISION_CHAIN=gemini,openrouter:google/gemma-4-31b-it:free
STT_CHAIN=gemini,groq:whisper-large-v3-turbo
```

- Dấu `:` **đầu tiên** tách tên nhà cung cấp khỏi model; model được chứa `/` và `:` (vd. `...:free`).
- **Nhà cung cấp có sẵn URL gốc:** `openrouter`, `groq`, `nous`, `cloudflare`. Khóa ở `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `NOUS_API_KEY`, `CLOUDFLARE_API_KEY` (+ `CLOUDFLARE_ACCOUNT_ID`). Ghi đè URL bằng `<TÊN>_BASE_URL`.
- **Nhà cung cấp khác** (kiểu OpenAI `/chat/completions`, `/audio/transcriptions`): đặt `<TÊN>_BASE_URL` và `<TÊN>_API_KEY`, rồi dùng `ten:model` trong chuỗi.
- `<TÊN>_JSON_MODE` = `json_object` (mặc định) | `json_schema` (structured output) | `none`. Nếu nhà cung cấp trả 400 vì `response_format`, Gateway tự thử lại không có rồi nhớ.
- **Mục thiếu khóa/URL/model bị bỏ qua và ghi log cảnh báo** (một tệp env dùng chung nhiều máy), không làm Gateway dừng. Không còn mục nào ⇒ bộ giả lập.
- `LLM_CHAIN` **không** tự áp cho ảnh: nguồn chỉ nhận ảnh khi nó nằm trong `VISION_CHAIN` (nguồn đó được dựng với `vision: true`). Gemini luôn nhận ảnh và âm thanh.
- STT kiểu Whisper: `groq:whisper-large-v3-turbo` gọi `POST {base}/audio/transcriptions`, ngôn ngữ `STT_LANGUAGE` (mặc định `vi`). Lưu ý nhật ký D9: Whisper nghe thanh Huế và từ đơn kém, cần thử chất lượng trước khi bật.

## 2. Cách chuỗi hoạt động

Khi một nguồn gặp **429 / 5xx / timeout / lỗi mạng / JSON không qua Zod của nơi gọi**, Gateway thử nguồn kế (`accept` ở `JsonRequest` là bộ kiểm Zod của nơi gọi, Nguyên tắc 6).

- **Ngắt mạch tạm (mỗi nguồn):** 429 hoặc 401/402/403/404 ⇒ nghỉ `AI_BREAKER_MS` (mặc định 3 phút; theo `Retry-After` nếu có, trong khoảng 30 s … 4× giá trị này). Timeout/5xx **liên tiếp** `AI_BREAKER_FAILURES` (3) lần ⇒ nghỉ `AI_BREAKER_TRANSIENT_MS` (1 phút). Hết hạn nghỉ ⇒ cho thử lại một lần. JSON sai không làm ngắt mạch.
- **Ngân sách thời gian:** client chờ ~10 s nên cả chuỗi dùng tối đa `LLM_CHAIN_BUDGET_MS` (9 s). Nguồn đang gọi chừa lại `AI_CHAIN_RESERVE_MS` (3 s) cho nguồn dự phòng kế tiếp (một lần, không nhân theo số nguồn), nên nguồn đầu chậm không ăn hết thời gian của dự phòng. **Đánh đổi:** chuỗi nhiều nguồn ⇒ nguồn đầu chỉ còn ≈ 6 s (Gemini hôm 20/11 đo được 6–9 s, thậm chí timeout 8 s với prompt gia sư thật). Muốn cho Gemini nhiều thời gian hơn: tăng `LLM_CHAIN_BUDGET_MS` (tối đa 9,5 s) hoặc giảm `AI_CHAIN_RESERVE_MS`.
- **Không thử nguồn khác** khi `llm_blocked` (bộ lọc an toàn) hoặc lỗi do yêu cầu của ta.
- **Hết chuỗi ⇒ `503 llm_busy`** (kèm `retryAfterSec` nếu có nguồn đang ngắt mạch). Với chat: **không** trả lời mẫu trá hình AI (mock chỉ khi chưa cấu hình AI).
- **Nguồn đã trả lời:** log `AI source answered {chain, source, ms}` (không có khóa); header `x-ai-provider: <nguồn>` ở các route trả JSON một lần (chat JSON, vision, culture, explain, transcribe). Luồng SSE đã gửi header trước khi gọi AI nên chỉ có log.
- Trạng thái ngắt mạch nằm **trong RAM từng instance** (không chia sẻ giữa các instance; khởi động lại là xóa).
- **Đánh đổi đã biết:** khi MỌI nguồn đang ngắt mạch, Gateway trả `llm_busy` ngay (không thử lại) cho tới khi hết hạn nghỉ. Với chuỗi chỉ một nguồn (mặc định `gemini`), một lần 429 vì RPM ⇒ mọi người dùng nhận `llm_busy` tới 3 phút; nên đặt `AI_BREAKER_MS` nhỏ hơn (vd. 30000) cho chuỗi một nguồn, hoặc thêm nguồn dự phòng.

## 3. Hạn mức

- **Không trừ lượt khi AI lỗi:** `chat/turn`, `speech/transcribe`, `speech/assess`, `vision/label`, `culture/ask`, `practice/explain` trừ trước (để chặn sớm) rồi **hoàn lại** nếu AI lỗi/hết chuỗi. Hoàn chỉ tác động ngày hiện tại và không xuống dưới 0. Đường không có AI (mock) vẫn trừ như cũ.
- **Hai mã lỗi khác nhau:** `429 quota_exceeded` (hết lượt; kèm `capability`, `resetAt`, và `scope: "global"` nếu là trần chung) và `503 llm_busy` (AI bận; không trừ lượt; thử lại được).
- **`remaining`** (`turns`, `llmTokens`, `sttSeconds`, `visionImages`; không âm) có trong kết quả mọi route AI trên và trong sự kiện SSE `done` (`turnsLeft` giữ để tương thích).
- **Ngày hạn mức = ngày giờ Việt Nam (UTC+7):** đổi ngày lúc 00:00 giờ Việt Nam = 17:00 UTC; `resetAt` là mốc đó. Khóa ngày là chuỗi `YYYY-MM-DD` tính theo UTC+7 (cột DB vẫn tên `usage_day_utc`, không đổi tên để khỏi migration phá vỡ).
  - *Chuyển đổi lúc triển khai:* khóa cũ (ngày UTC) và mới trùng nhau trong 00:00–17:00 UTC (đếm tiếp). Từ 17:00 UTC khóa mới nhảy sang ngày kế ⇒ người đã dùng trong khung 17:00–24:00 UTC của ngày triển khai được đếm lại từ 0 **một lần** (tối đa một ngày hạn mức; không mất lượt, không cộng nhầm). **Nên triển khai trong khoảng 00:00–17:00 UTC** để hiệu ứng này bằng 0.
- **Trần toàn cục (cả app, mỗi ngày giờ VN):** `GLOBAL_MAX_TURNS_PER_DAY` (2000), `GLOBAL_MAX_LLM_TOKENS_PER_DAY` (4 000 000), `GLOBAL_MAX_STT_SECONDS_PER_DAY` (28 800 = 8 giờ, trần Whisper của Groq), `GLOBAL_MAX_VISION_PER_DAY` (500); `0` = tắt. Lưu bảng `ai_global_usage` (migration `0007`), cộng nguyên tử như `ai_usage`. Hết trần ⇒ `429 quota_exceeded` + `scope: "global"`, phần đã trừ của người dùng được hoàn. **Lỗi AI hoàn lượt NGƯỜI DÙNG nhưng chỉ hoàn trần chung khi chưa gọi nhà cung cấp nào** (mọi nguồn đang ngắt mạch/bỏ qua); lần gọi đã chạm nhà cung cấp (kể cả lỗi, JSON sai, `llm_blocked`) vẫn tính vào trần chung vì trần này bảo vệ hạn mức của nhà cung cấp. Token chỉ đếm theo **ước lượng trước khi gọi** ở trần chung (phần chênh token thật chỉ cộng vào hạn mức người dùng). Đặt các trần theo hạn mức free thật của nguồn **rẻ nhất** trong chuỗi.
- Chưa làm: trần theo **từng nhà cung cấp** (hiện ngắt mạch sau 429 thay thế một phần); quota gọi thoại theo giây nói; gói trả phí/free.

## 4. Chạy thử thật

```powershell
pnpm --filter @vietlearning/gateway build
$env:LLM_CHAIN='gemini,openrouter:google/gemma-4-31b-it:free'; node apps/gateway/scripts/ai-chain-smoke.mjs
```

Đọc khóa từ `%USERPROFILE%\.becutit\gateway.env`, in nguồn đã trả lời, độ trễ và token; không in khóa. Thử dự phòng: `LLM_CHAIN='gemini:ten-model-khong-ton-tai,openrouter:...'` (nguồn đầu 404 ⇒ nguồn sau trả lời). Danh sách model free của OpenRouter đổi theo thời gian: `curl https://openrouter.ai/api/v1/models` rồi lọc `:free`.
