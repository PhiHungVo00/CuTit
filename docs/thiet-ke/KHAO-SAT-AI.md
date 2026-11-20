# Khảo sát hiện trạng AI (chỉ đọc, chưa sửa code)

> Ngày khảo sát: 2026-11-20. Nhánh `claude/app-improvement-feedback-a500bb`. Phạm vi: chỉ đọc mã và tra trang chính thức. Không sửa code, không commit, không đổi nhánh.
> Mục đích: có số liệu thật trước khi bàn thiết kế gom chat, camera và gọi thoại vào bong bóng Cu Tít. Góp ý gốc: "AI chưa rõ có miễn phí không; camera AI, chat AI hay live AI chưa rõ".

**Kết luận ngắn:**
- Không có chỗ nào trong app báo "miễn phí" hay "trả phí". Mọi lượt AI đều đi qua Gateway và có hạn mức theo người dùng mỗi ngày, nhưng hạn mức này chỉ hiện ở màn gọi thoại, còn lại chỉ hiện khi đã hết.
- "Gọi thoại" KHÔNG phải Gemini Live API. Đây là chuỗi lần lượt: ghi âm → STT (Gemini, không realtime) → chat (Gemini) → đọc bằng giọng máy. Không có WebSocket hay luồng âm thanh hai chiều trong mã nguồn.
- Hạn mức Gemini nằm ở cấp project và dùng chung cho mọi người dùng. Hạn mức của app theo từng người không bảo vệ được hạn mức chung này.

---

## 1. Ba (bốn) luồng AI hiện có

| Luồng | Màn (đường dẫn) | MFE sở hữu | Route Gateway | Model Gemini | STT / TTS | Cần mạng | Quyền xin |
|---|---|---|---|---|---|---|---|
| Chat (gõ hoặc nói) | `/hoi-thoai` ([routes.tsx:65](apps/host-shell/src/routes.tsx:65)) | mfe-conversation | `POST /v1/chat/turn` (SSE) ([chat.ts:29](apps/gateway/src/routes/chat.ts:29)); nói: `POST /v1/speech/transcribe` ([speech.ts:24](apps/gateway/src/routes/speech.ts:24)) | Chat và STT dùng `GEMINI_MODEL`, mặc định `gemini-3.5-flash-lite` ([config.ts:72](apps/gateway/src/config.ts:72)) | STT: gửi WAV lên Gateway, Gemini chép lời ([stt.ts](apps/gateway/src/providers/stt.ts), [tasks.ts:74](apps/gateway/src/services/ai/tasks.ts:74)). TTS: không tự phát. Lời trả lời đọc bằng giọng máy | Có. Không có mạng thì chuyển sang gõ chữ | Micro (có hộp đồng ý trong app trước khi hỏi quyền hệ thống, [VoiceConsent.tsx](apps/mfe-conversation/src/chat/VoiceConsent.tsx)) |
| Nhập vai | `/nhap-vai` ([routes.tsx:73](apps/host-shell/src/routes.tsx:73)) | mfe-conversation (dùng chung `useChatSession`, [RoleplayScreen.tsx:53](apps/mfe-conversation/src/roleplay/RoleplayScreen.tsx:53)) | `POST /v1/chat/turn` có `scenarioId` | Như chat | Như chat | Có | Micro, cùng đồng ý `voice` |
| Gọi thoại | `/goi-thoai` ([routes.tsx:167](apps/host-shell/src/routes.tsx:167)) | mfe-conversation ([CallScreen.tsx](apps/mfe-conversation/src/call/CallScreen.tsx), [useCall.ts](apps/mfe-conversation/src/call/useCall.ts)) | `POST /v1/speech/transcribe` → `POST /v1/chat/turn` (mode `call`) → `POST /v1/speech/synthesize` | Như chat | STT qua Gemini. TTS: `synth()` gọi `/v1/speech/synthesize` ([useCall.ts:10](apps/mfe-conversation/src/call/useCall.ts:10)); nếu 503 thì đọc bằng TTS máy | Có | Micro, tự dừng khi im lặng (`SilenceDetector`) |
| Camera (nhận diện vật) | `/camera` ([routes.tsx:113](apps/host-shell/src/routes.tsx:113)) | mfe-vision ([CameraScreen.tsx](apps/mfe-vision/src/camera/CameraScreen.tsx)) | `POST /v1/vision/label` ([content.ts:21](apps/gateway/src/routes/content.ts:21)) | Cùng `GEMINI_MODEL`, qua `labelImage` ([tasks.ts:20](apps/gateway/src/services/ai/tasks.ts:20)) | Không dùng STT/TTS | Có | Camera, có hộp đồng ý riêng ([CameraScreen.tsx:48,118](apps/mfe-vision/src/camera/CameraScreen.tsx:48)). Có thể chọn ảnh từ thư viện |

Ghi chú bổ sung:
- Route `POST /v1/culture/ask` ([content.ts:56](apps/gateway/src/routes/content.ts:56)) cũng gọi Gemini cùng model (`answerCulture`). Màn Văn hóa dùng nó ([CultureGuideScreen.tsx:25](apps/mfe-knowledge/src/components/culture/CultureGuideScreen.tsx:25)). Đây là luồng AI thứ năm, chưa có trong câu hỏi gốc.
- Route `practice/explain` và `sentence/check` ([practice.ts:31,73](apps/gateway/src/routes/practice.ts:31)) cũng có thể dùng LLM. Chưa đọc hết để xác nhận, không đưa vào bảng chính.
- **Không có** Gemini Live API. Tìm `live|bidi|websocket` trong `apps/` và `packages/` chỉ ra `aria-live`. Không có kết nối realtime.

### 1.1 Cấu hình model và nhà cung cấp

| Thành phần | Biến môi trường (mặc định) | Mã nguồn | Ghi chú |
|---|---|---|---|
| LLM, STT, vision, văn hóa | `GEMINI_API_KEY` (không có ⇒ bộ giả lập `mock: true`), `GEMINI_MODEL` = `gemini-3.5-flash-lite`, `LLM_TIMEOUT_MS` = 8000 | [config.ts:68](apps/gateway/src/config.ts:68), [llm.ts:103](apps/gateway/src/providers/llm.ts:103) | Endpoint `generativelanguage.googleapis.com/.../generateContent`, khóa gửi qua header ([llm.ts:72](apps/gateway/src/providers/llm.ts:72)) |
| TTS | `TTS_PROVIDER` = `none` (mặc định), `GEMINI_TTS_MODEL` = `gemini-3.8-flash-tts`, `GEMINI_TTS_VOICE` = `Kore` | [config.ts:76](apps/gateway/src/config.ts:76), [tts.ts:162](apps/gateway/src/providers/tts.ts:162) | Phải bật rõ ràng `TTS_PROVIDER=gemini`. Mặc định là TẮT, nên trên máy chưa cấu hình thì `/speech/synthesize` trả 503 và app dùng giọng máy |
| TTS cục bộ (dựng sẵn) | `TTS_PROVIDER=openai-compatible`, `TTS_BASE_URL` = `127.0.0.1:8765/v1` | [config.ts:76,81](apps/gateway/src/config.ts:76) | Dùng VieNeu-TTS trên máy để dựng âm thanh khóa học, không tốn hạn mức |
| Mẫu env | [.env.example:36-39](.env.example:36) | | Ghi "Model mặc định gemini-3.5-flash-lite" |

Quy tắc an toàn: khóa không bao giờ đi tới client (Nguyên tắc 2). Lỗi từ Gemini được rút gọn thành mã nội bộ, không trả nguyên văn ([llm.ts:80](apps/gateway/src/providers/llm.ts:80)).

---

## 2. Hạn mức (quota)

### 2.1 Hạn mức của app, theo người dùng, theo ngày UTC

| Loại | Biến cấu hình | Mặc định | Đơn vị | Trừ khi nào | Nguồn |
|---|---|---|---|---|---|
| Lượt AI (`turn`) | `MAX_CHAT_TURNS_PER_DAY` | 60 | 1 yêu cầu chat hoặc 1 câu nói trong gọi thoại | Trước khi gọi AI | [config.ts:63](apps/gateway/src/config.ts:63), [chat.ts:36](apps/gateway/src/routes/chat.ts:36) |
| Token LLM (`llm`) | `MAX_LLM_TOKENS_PER_DAY` | 100 000 | Token, ước lượng trước rồi bù theo token thật | Trước khi gọi AI | [config.ts:61](apps/gateway/src/config.ts:61), [chat.ts:41](apps/gateway/src/routes/chat.ts:41) |
| STT (`stt`) | `MAX_STT_SECONDS_PER_DAY` | 600 giây | Giây âm thanh | Khi nhận âm thanh | [config.ts:60](apps/gateway/src/config.ts:60), [speech.ts:26](apps/gateway/src/routes/speech.ts:26) |
| TTS (`tts`) | `MAX_TTS_CHARS_PER_DAY` | 15 000 ký tự | Ký tự | Khi gọi `/speech/synthesize` | [config.ts:59](apps/gateway/src/config.ts:59), [speech.ts:48](apps/gateway/src/routes/speech.ts:48) |
| Vision | **cố định trong code** | 200 | Lượt | Khi gọi `/vision/label` | [RequestPipeline.ts:52](apps/gateway/src/pipeline/RequestPipeline.ts:52). Không đọc từ biến môi trường |

- Hạn mức lưu trong bảng `ai_usage` ([DbQuotaStore.ts](apps/gateway/src/pipeline/DbQuotaStore.ts)), nên không mất khi khởi động lại. Ngày reset là ngày UTC ([QuotaStore.ts:20](apps/gateway/src/pipeline/QuotaStore.ts:20)).
- Đây là hai lớp hạn mức khác nhau: hạn mức app (theo người) và hạn mức Gemini (theo project, xem mục 3). Hạn mức app không bảo vệ được hạn mức Gemini nếu cộng lại vượt ngưỡng.

### 2.2 Người dùng thấy hạn mức ở đâu

| Vị trí | Có thấy số còn lại không? | Bằng chứng |
|---|---|---|
| Màn chat, nhập vai, camera | **Không**. Không có ô "còn N lượt" | `GET /v1/quota` ([quota.ts:9](apps/gateway/src/routes/quota.ts:9)) chỉ được gọi ở [useCall.ts:81](apps/mfe-conversation/src/call/useCall.ts:81). Không màn nào khác gọi |
| Màn gọi thoại | Chỉ khi hết hạn mức: hiện thông báo "Hôm nay bạn đã dùng hết lượt nói chuyện với AI. Lượt mới bắt đầu lúc {giờ}." và "Bài học, ôn tập và các công cụ khác vẫn dùng bình thường" ([i18n.ts:50,61](apps/mfe-conversation/src/i18n.ts:50)) | [CallScreen.tsx:100](apps/mfe-conversation/src/call/CallScreen.tsx:100), [callMachine.ts:7](apps/mfe-conversation/src/call/callMachine.ts:7) |
| Chat gõ chữ hết hạn mức | Hiện thông báo `quotaOut` với giờ reset ([chatClient.ts:39-42,81](apps/mfe-conversation/src/chat/chatClient.ts:39)) | |
| Nói bằng giọng hết hạn mức STT | "Hôm nay bạn đã dùng hết thời lượng nhận giọng nói. Hãy gõ chữ nhé" ([i18n.ts:38](apps/mfe-conversation/src/i18n.ts:38)) và chuyển sang gõ chữ ([useCall.ts:46](apps/mfe-conversation/src/call/useCall.ts:46)) | |
| Camera hết hạn mức | Chưa kiểm tra đầy đủ. Lỗi 429 của Gateway không rõ có được hiển thị thân thiện hay không | Cần đọc thêm `CameraScreen.tsx` |

### 2.3 Khi hết hạn mức hoặc AI lỗi, app báo gì

| Tình huống | Mã Gateway | Hiển thị cho người dùng |
|---|---|---|
| Hết lượt AI trong ngày | 429 `quota_exceeded` kèm `resetAt` ([RequestPipeline.ts:120](apps/gateway/src/pipeline/RequestPipeline.ts:120)) | "Hôm nay bạn đã dùng hết lượt nói chuyện với AI…" |
| Gemini trả 429 (hết quota Gemini) | 503 `llm_busy` ([llm.ts:86](apps/gateway/src/providers/llm.ts:86)) | Thông báo lỗi chung (chưa kiểm tra chuỗi cụ thể). **Người dùng không phân biệt được đây là lỗi của app hay hết quota** |
| Gemini lỗi khác | 502 `llm_unavailable` | Lỗi chung |
| Gemini quá 8 giây | 504 `llm_timeout` ([llm.ts:80](apps/gateway/src/providers/llm.ts:80)) | Lỗi chung |
| Không có khóa Gemini | Bộ giả lập, mỗi tin có `mock: true` | Nhãn "· trả lời mẫu (chưa nối AI)" ([i18n.ts:13](apps/mfe-conversation/src/i18n.ts:13)) |
| Không có TTS server | 503 `tts_provider_not_configured` | Dùng giọng máy, không báo lỗi |

---

## 3. Gói miễn phí Gemini API và sức chịu tải

### 3.1 Tra cứu (ngày 2026-11-20)

| Nội dung | Kết quả | Nguồn |
|---|---|---|
| Trang giới hạn tốc độ | `ai.google.dev/gemini-api/docs/rate-limits` hiện chuyển hướng sang `aistudio.google.com/docs/rate-limits`. Trang này **không liệt kê RPM/TPM/RPD miễn phí theo từng model**. Giá trị theo model nằm trong AI Studio. Ghi: "Requests per day (RPD) quotas reset at midnight Pacific time" | [aistudio.google.com/docs/rate-limits](https://aistudio.google.com/docs/rate-limits) (qua subagent đọc) |
| Trang giá | Chuyển hướng sang `aistudio.google.com/docs/pricing`. Mục Gemini 3.5 Flash-Lite: lượt tiêu chuẩn "Free of charge", "Used to improve our products: Yes" (miễn phí) và "No" (trả phí). Model TTS 3.8 Flash, 2.5 Flash và 2.5 Flash-Lite cũng ghi "Free of charge" ở mức Standard | [aistudio.google.com/docs/pricing](https://aistudio.google.com/docs/pricing) (qua subagent đọc; tóm tắt, chưa đối chiếu từng dòng bằng mắt) |
| Số liệu RPM/RPD cụ thể | **Chưa xác nhận được.** Các trang bên thứ ba cho số mâu thuẫn nhau (ví dụ 10 RPM và 500 RPD; hoặc 30 RPM và 1 500 RPD). Không dùng làm căn cứ | [scriptbyai.com](https://www.scriptbyai.com/gemini-api-rate-limits/), [freellm.net](https://freellm.net/models/google-gemini/gemini-3-5-flash-lite/) (bên thứ ba) |

**Cần làm để có số thật:** mở AI Studio ([aistudio.google.com](https://aistudio.google.com)), vào trang giới hạn tốc độ của project, chụp lại RPM và RPD của `gemini-3.5-flash-lite` và `gemini-3.8-flash-tts`. Ghi lại ngày.

Quy tắc quan trọng: giới hạn tính theo **project**, không theo khóa API. Tạo nhiều khóa trong cùng project không tăng hạn mức.

### 3.2 Ước tính (không chắc chắn, phụ thuộc số liệu chưa xác nhận)

Số lời gọi Gemini cho mỗi hoạt động:

| Hoạt động | Số lời gọi Gemini |
|---|---|
| Chat gõ, 1 lượt | 1 |
| Nói trong chat, 1 câu | 2 (STT + chat) |
| Gọi thoại, 1 câu nói | 2 |
| Gọi thoại 10 phút (ước 20 câu) | khoảng 40 |
| Camera, 1 ảnh | 1 |
| Văn hóa, 1 câu hỏi | 1 |

Công thức: số người dùng/ngày ≈ RPD ÷ (số lời gọi trung bình mỗi người/ngày). Với RPD là một con số giả định, không phải số đã xác nhận:

| RPD giả định | Người dùng/ngày nếu mỗi người 10 lời gọi (học nhẹ) | Nếu mỗi người 40 lời gọi (gọi thoại nhiều) |
|---|---|---|
| 500 (số bên thứ ba, chưa xác nhận) | khoảng 50 | khoảng 12 |
| 1 500 (số bên thứ ba, chưa xác nhận) | khoảng 150 | khoảng 37 |

Giới hạn RPM cũng quan trọng: nếu RPM thấp (ví dụ 10), 10 lời gọi/phút là trần đồng thời, bất kể RPD. Một người đang gọi thoại đã dùng gần hết trần này.

Ví dụ minh họa: 100 người dùng, mỗi người 60 lượt chat (hạn mức app) ⇒ tối đa 6 000 lời gọi/ngày. Con số này vượt xa mọi RPD bên thứ ba đã nêu. **Hạn mức app không đủ để giữ hạn mức Gemini.** Cần thêm trần toàn cục hoặc thông báo rõ khi hạn mức chung hết.

Kết luận cho bản phát hành: không thể dựa vào gói miễn phí cho người dùng đại trà. Cần có kế hoạch trả phí hoặc trần toàn cục.

### 3.3 Dữ liệu dùng để cải thiện sản phẩm (cần pháp lý xem)

Theo trang giá (qua subagent): gói miễn phí cho phép Google dùng nội dung để cải thiện sản phẩm. Gói trả phí thì không. Điều này áp dụng cho âm thanh, ảnh và văn bản người học gửi lên. Đây là rủi ro về quyền riêng tư, đặc biệt nếu người học là trẻ em. Cần đối chiếu thư mục `docs/phap-ly/` và công bố trong chính sách bảo mật trước khi phát hành.

---

## 4. "Gọi thoại" về kỹ thuật là gì

**Không phải Live API. Là chuỗi lần lượt.** Bằng chứng: không có WebSocket, không có luồng âm thanh hai chiều. Mỗi câu nói là một lần ghi âm WAV đầy đủ, gửi một lần qua multipart ([useVoiceInput.ts:22](apps/mfe-conversation/src/chat/useVoiceInput.ts:22)).

Chuỗi mỗi lượt:
1. Ghi âm WAV 16 kHz mono. Tự dừng khi im lặng hoặc sau tối đa 15 giây ([useVoiceInput.ts:9](apps/mfe-conversation/src/chat/useVoiceInput.ts:9)).
2. `POST /v1/speech/transcribe`: Gemini chép lời, không có mốc thời gian từng từ ([tasks.ts:74](apps/gateway/src/services/ai/tasks.ts:74)).
3. `POST /v1/chat/turn` với `mode: 'call'`: Gemini trả lời theo JSON có schema. Gateway chỉ phát từng từ qua SSE sau khi có đủ JSON, nên không có streaming thật từ Gemini ([chat.ts:90](apps/gateway/src/routes/chat.ts:90)).
4. `POST /v1/speech/synthesize`: TTS. Nếu không có TTS server thì 503 và app đọc bằng giọng máy ([useCall.ts:10](apps/mfe-conversation/src/call/useCall.ts:10)).

**Độ trễ đo được:** không tìm thấy số đo độ trễ lượt AI trong nhật ký hay test. Chỉ có các số hiệu năng trang (LCP, TBT) trong [NHAT_KY_CHUYEN_DOI_MOBILE.md](docs/NHAT_KY_CHUYEN_DOI_MOBILE.md) (hàng 31, 55, 56 của mục 3). Các mốc thiết kế đã biết:
- Timeout Gemini: 8 giây ([config.ts:73](apps/gateway/src/config.ts:73)).
- Watchdog phía client: 15 giây (ghi chú trong [chat.ts:60](apps/gateway/src/routes/chat.ts:60)).
- Độ trễ hiển thị từng từ giả: 12 ms mỗi từ với AI thật, 35 ms với bộ giả ([chat.ts:90](apps/gateway/src/routes/chat.ts:90)).

Cần đo thực: thời gian từ khi dừng nói đến khi nghe được tiếng trả lời, trên máy thật và mạng 4G, cho từng bước.

---

## 5. Chỗ người dùng có thể bối rối (theo góp ý)

1. Không có chỗ nào nói app miễn phí hay trả phí, và chưa có gói nào.
2. Không có ô "còn N lượt" ở chat, nhập vai hay camera. Người dùng chỉ biết khi bị chặn.
3. Hai loại hạn mức (lượt AI và token/giây giọng nói) hoạt động song song. Không rõ cái nào hết trước.
4. Mỗi câu nói trong gọi thoại tính là một lượt. Gọi 60 câu là hết ngày.
5. Giờ reset là giờ UTC trong app, nhưng Gemini reset lúc nửa đêm Pacific. Hai giờ khác nhau, dễ gây nhầm.
6. Lỗi "AI bận" (429 từ Gemini) và lỗi "hết lượt" của app trông giống nhau, người dùng khó biết lỗi nào.
7. "Gọi thoại" không realtime. Có khoảng lặng giữa các bước và có thể bị hiểu là app đơ.
8. Giọng đọc khác nhau tùy máy: giọng máy trên Android và trên web khác nhau, và nếu server có TTS thì giọng khác nữa.
9. Nhãn "trả lời mẫu (chưa nối AI)" chỉ hiện trong bong bóng tin nhắn, dễ bị bỏ qua. Người dùng có thể tưởng AI đang hoạt động.
10. Chat, nhập vai và gọi thoại dùng chung một hộp đồng ý micro (`voice`). Đồng ý một lần là đủ cho cả ba.
11. Camera có hộp đồng ý riêng, khác với micro. Hai bước xin quyền có thể gây rối.
12. Mỗi câu nói bị giới hạn 15 giây. Người học nói dài sẽ bị cắt mà không rõ lý do.
13. Một số thiết bị không thu âm được trong app. Chuyển sang gõ chữ với thông báo "Thiết bị này không thu âm được trong ứng dụng".
14. Quyền ghi âm và camera khi người dùng từ chối vĩnh viễn: đã xử lý nút mở Cài đặt (nhật ký mục 3, hàng 25 và 15).
15. Đồng ý micro lưu trong trạng thái cục bộ (`consents` trong [packages/state/src/index.ts:72,176](packages/state/src/index.ts:72)). Chưa kiểm tra có màn nào cho rút đồng ý không.
16. Trên bản debug Android, HTTP được phép (cleartext). Bản release thì không. Phải kiểm tra trước khi phát hành để không lộ lỗi "không gọi được Gateway".

---

## 6. Việc cần làm tiếp (đề xuất, chưa thực hiện)

- Lấy RPM và RPD thật của hai model từ AI Studio, ghi ngày.
- Đo độ trễ từng bước của gọi thoại trên APK thật.
- Quyết định về gói miễn phí: dữ liệu dùng để cải thiện sản phẩm có chấp nhận được không.
- Thêm trần toàn cục cho Gemini và phân biệt thông báo "AI bận" với "hết lượt".
- Hiển thị số lượt còn lại trong bong bóng Cu Tít.
