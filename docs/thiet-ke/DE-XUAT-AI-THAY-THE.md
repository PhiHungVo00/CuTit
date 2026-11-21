# Đề xuất xử lý vấn đề AI và phương án AI thay thế

> Ngày tra cứu: **2026-11-20**. Chỉ nghiên cứu và đề xuất, chưa sửa code, chưa tạo tài khoản, chưa gọi thử API nào của bên thứ ba. Nền: [KHAO-SAT-AI.md](KHAO-SAT-AI.md).
> Quy ước nguồn: **[CT]** = tôi đã tải và đọc trang chính thức của nhà cung cấp. **[TK]** = chỉ thấy qua kết quả tìm kiếm (đoạn trích), chưa đọc trang gốc. **[BT]** = bên thứ ba. **[?]** = chưa xác nhận được. Mọi số ghi "ước tính" là phép tính của tôi từ giả định nêu rõ, không phải số của nhà cung cấp.
> Giới hạn của việc tra: không có độ trễ, chất lượng tiếng Việt hay vị trí máy chủ nào được **đo** ở đây. Các cột đó ghi "chưa đo" và cần thử thật (mục 7).

---

## 0. Tóm tắt (đọc phần này là đủ để quyết)

1. **Gói free không đủ cho phát hành đại trà, và dữ liệu có rủi ro pháp lý.** Trang giá Gemini ghi gói free: "Content used to improve our products" = Có; gói trả phí = Không ([CT](https://ai.google.dev/gemini-api/docs/pricing)). Giới hạn tính theo project, không theo khóa ([CT](https://ai.google.dev/gemini-api/docs/rate-limits)).
2. **Gemini trả phí rẻ hơn người ta nghĩ.** Gemini 3.5 Flash-Lite trả phí: $0,30 / 1 triệu token vào, $2,50 / 1 triệu token ra ([CT](https://ai.google.dev/gemini-api/docs/pricing)). Ước tính khoảng **$0,2 đến $0,4 mỗi người dùng hoạt động mỗi tháng** (mục 3.4). 1 000 người/ngày khoảng $200 đến $400/tháng.
3. **Không có API free khác thay được Gemini cho cả bốn năng lực.** Free thật còn lại: Groq (Whisper + LLM, có trần cứng 1 000 lượt/ngày cho cả tổ chức), Cloudflare Workers AI (10 000 Neurons/ngày, đủ cho khoảng 25 người/ngày), OpenRouter `:free` (50 lượt/ngày). Cerebras không còn gói free vĩnh viễn, chỉ còn $5 dùng thử 30 ngày ([CT](https://inference-docs.cerebras.ai/support/rate-limits)). Hugging Face có vẻ đã bỏ tín dụng free [?].
4. **Tự host hoặc chạy trên máy điện thoại đều trái Nguyên tắc 1** và cần bạn chấp nhận "lệch có chủ đích" (mục 2). Không khuyến nghị làm chính.
5. **Khuyến nghị:** Gemini trả phí làm chính + Groq free làm dự phòng khi 429 + trả lời mẫu cuối cùng; thêm trần toàn cục và hiện số lượt còn lại trong bong bóng Cu Tít (mục 5).

---

## 1. Nhà cung cấp API có gói miễn phí

### 1.1 Bảng tổng hợp (theo trang chính thức nếu có)

| Nhà cung cấp | Năng lực | Giới hạn free | Dữ liệu có dùng để huấn luyện? | Dùng production/thương mại? | Ghi chú |
|---|---|---|---|---|---|
| **Gemini API** (đang dùng) | LLM + JSON, STT (đa phương thức), vision, TTS | Giới hạn theo **project**, RPM/RPD từng model chỉ xem được trong AI Studio, không in ở trang tài liệu. RPD reset nửa đêm giờ Pacific ([CT](https://ai.google.dev/gemini-api/docs/rate-limits)). **Số RPM/RPD thật: [?]** (xem việc cần làm ở mục 7) | **Có** ở gói free, **Không** ở gói trả phí ([CT](https://ai.google.dev/gemini-api/docs/pricing)) | Gói free ghi "for developers and small projects" ([CT](https://ai.google.dev/gemini-api/docs/pricing)). Điều khoản chi tiết: [?] chưa đọc | Có JSON schema (đang dùng `responseSchema`). Trả phí Tier 1 chỉ cần gắn billing ([CT](https://ai.google.dev/gemini-api/docs/rate-limits)) |
| **Groq** | LLM (gpt-oss-120b/20b, qwen3.8-27b), STT (whisper-large-v3, v3-turbo), TTS (orpheus: tiếng Anh/Ả Rập, **không có tiếng Việt**) | Bảng của Groq ([CT](https://console.groq.com/docs/rate-limits)): LLM **30 RPM, 1 000 RPD, 8K TPM, 200K TPD**. Whisper **20 RPM, 2 000 RPD, 7,2K giây âm thanh/giờ, 28,8K giây/ngày** (= 8 giờ audio/ngày). Giới hạn theo **tổ chức**, không theo người dùng | Mặc định **không lưu** dữ liệu suy luận; chỉ giữ để khắc phục sự cố hoặc điều tra lạm dụng ([CT](https://console.groq.com/docs/your-data)). Không đọc được điều khoản "không huấn luyện" trực tiếp [?] | Trang giới hạn nói nâng lên "Developer plan" để có hạn mức cao hơn; quyền thương mại của gói free: [?] chưa tìm thấy | OpenAI-compatible. JSON schema: [?] cần kiểm theo từng model |
| **Cerebras** | LLM (gpt-oss-120b, qwen-3.8-27b) | **Không còn gói free vĩnh viễn.** $5 tín dụng sau khi thêm phương thức thanh toán đã xác minh, hết hạn sau 30 ngày. Free Trial: gpt-oss-120b 5 RPM; qwen-3.8-27b 300 RPM, 150K TPM ([CT](https://inference-docs.cerebras.ai/support/rate-limits)) | Chưa đọc điều khoản [?] | Chỉ dùng thử | Loại khỏi danh sách "free" |
| **OpenRouter** (model `:free`) | LLM nhiều hãng; không phải lựa chọn tốt cho STT/TTS | **20 RPM; 50 lượt/ngày** nếu đã mua dưới 10 credit, **1 000 lượt/ngày** nếu từ 10 credit ([CT](https://openrouter.ai/docs/api/reference/limits)). Reset theo ngày UTC | OpenRouter mặc định không log nội dung prompt ([CT](https://openrouter.ai/docs/faq)); nhưng **nhà cung cấp phía sau model `:free` có thể log hoặc huấn luyện: [?] chưa xác nhận** | [?] | Model free đổi theo thời gian; không nên làm tầng chính |
| **Mistral La Plateforme** (gói Experiment) | LLM (có JSON mode), STT (Voxtral: chưa tra) | Mistral không in số cố định trong tài liệu, chỉ trỏ vào trang giới hạn trong console ([TK](https://docs.mistral.ai/deployment/laplateforme/tier)). Bên thứ ba ghi ~1 request/giây, 500 000 token/phút [BT, chưa xác nhận] | **Có thể dùng để huấn luyện** ở gói Experiment (có quyền tắt) ([TK](https://help.mistral.ai/en/articles/323757-do-you-use-my-user-data-to-train-your-artificial-intelligence-models)) | [?] | Vướng cùng rủi ro dữ liệu như Gemini free, nên không có lợi |
| **Cloudflare Workers AI** | LLM, STT (Whisper), TTS (MeloTTS **tiếng Anh**, Deepgram Aura tiếng Anh/Tây Ban Nha), vision (llama-3.2-11b-vision) | **10 000 Neurons/ngày** miễn phí cho mọi người; reset 00:00 UTC; trên mức đó phải lên gói Workers Paid, $0,011 / 1 000 Neurons ([CT](https://developers.cloudflare.com/workers-ai/platform/pricing/)) | Chưa đọc điều khoản dữ liệu [?] | Có, nhưng vượt free thì phải trả | Có `@cf/aisingapore/gemma-sea-lion-v4-27b-it` (hướng Đông Nam Á, cần thử tiếng Việt). OpenAI-compatible endpoint: [?] |
| **GitHub Models** | LLM nhiều hãng | Giới hạn theo RPM/RPD/token mỗi request/đồng thời; muốn production phải bật trả phí ([TK](https://docs.github.com/en/github-models/use-github-models/prototyping-with-ai-models)). Số cụ thể: [?] (bên thứ ba ghi 15 RPM, 150 RPD cho tầng thấp, chưa xác nhận) | [?] | **Chỉ để thử nghiệm (prototyping)** | Loại: không dùng cho app phát hành |
| **Together / DeepInfra** | LLM | **Chưa tra** (không thấy gói free ổn định trong lượt tìm này) | [?] | [?] | Chỉ cân nhắc như nhà cung cấp **trả phí** rẻ |
| **Hugging Face Inference Providers** | LLM, STT, v.v. qua nhiều hãng | Tài liệu cũ: $0,10/tháng tín dụng cho tài khoản free. Một trang theo dõi (ghi ngày 2026-10-15) nói tín dụng free đã bỏ ([BT](https://www.usagepricing.com/blueprint/activity/hugging-face-2026-10-15-free-inference-credits-removed), chưa xác nhận) | [?] | [?] | Coi như **không có free dùng được** |
| **FPT.AI** | TTS tiếng Việt, STT tiếng Việt | TTS: tài liệu Voice Maker ghi miễn phí **100 000 ký tự đầu mỗi tháng** ([TK](https://docs.fpt.ai/docs/en/speech/documentation/voice-maker)). STT: trang giá chỉ nói "liên hệ" ([CT](https://docs.fpt.ai/docs/en/speech/documentation/stt-pricing)); một trang riêng ghi 0 đến 60 phút/tháng, không rõ còn hiệu lực [?] | [?] | [?] hỏi FPT | Máy chủ ở Việt Nam là điểm cộng về dữ liệu, **chưa xác nhận**. Không có LLM chat |
| **Viettel AI** | TTS tiếng Việt, STT | Bài viết của Viettel (3/2025): 50 000 ký tự free trong 1 tháng sau đăng ký; demo giới hạn 300 ký tự ([TK](https://viettelai.vn/en/tin-tuc/top-5-phan-mem-doc-van-ban-thanh-giong-noi-mien-phi)). Trang giá chính thức: [?] chưa tìm thấy | [?] | [?] | Chỉ là dùng thử 1 tháng |
| **Zalo AI** | TTS tiếng Việt | **Không tìm thấy trang giá hay free chính thức** [?] | [?] | [?] | Cần hỏi trực tiếp |

### 1.2 Theo từng năng lực: ai đáp ứng được gì

| Năng lực | Ứng viên free dùng được | Lý do loại các bên khác | Rủi ro chính |
|---|---|---|---|
| **LLM chat + JSON** | Gemini (đang dùng), Groq (gpt-oss, qwen3.8-27b), Cloudflare (gemma-sea-lion, qwen) | Cerebras hết free; GitHub Models cấm production; OpenRouter 50 lượt/ngày | **Chất lượng tiếng Việt của mọi model ngoài Gemini: [?] chưa đo.** Qwen và Gemma tuyên bố đa ngôn ngữ nhưng chưa có số Vietnamese cụ thể được tra |
| **STT tiếng Việt** | Groq Whisper large-v3 / turbo (8 giờ audio/ngày cho cả tổ chức), Cloudflare Whisper (~214 phút/ngày nếu chỉ dùng Whisper v3-turbo: 10 000 ÷ 46,63 Neurons/phút) | Gemini STT đang dùng là model đa phương thức, tốn chung quota LLM | Nhật ký D9 ghi Whisper **nghe thanh Huế kém** (WER 33 đến 50% ở câu mẫu) và từ đơn sai nhiều ([D9-TTS-LOCAL.md](../nhat-ky/D9-TTS-LOCAL.md)). Với trẻ em và từ đơn, Whisper chưa chắc tốt hơn Gemini |
| **TTS tiếng Việt** | **Không cần server nếu dùng gói dựng sẵn VieNeu + giọng máy**. Free server: FPT.AI 100 000 ký tự/tháng | Groq và Cloudflare TTS không có tiếng Việt (theo danh sách model đã đọc) | Giọng máy khác nhau tùy thiết bị (điểm bối rối số 8) |
| **Vision** | Gemini; Cloudflare llama-3.2-11b-vision | Groq: danh sách model đã đọc không có model vision | Chất lượng nhận vật tiếng Việt trên model nhỏ: chưa đo |

**Điểm kỹ thuật quan trọng:** Groq, Cerebras, OpenRouter, Mistral và (có thể) Cloudflare và GitHub Models đều theo dạng OpenAI-compatible. **Một lớp `OpenAiCompatLlmProvider` duy nhất** phủ được tất cả, chỉ khác `baseUrl`, tên model và khóa. Chi phí viết một lớp, không phải sáu.

---

## 2. Model chạy local / tự host

### 2a. Trên server riêng (trái Nguyên tắc 1 nếu dùng cho **suy luận khi chạy app**)

| Thành phần | Ứng viên | Thông tin tra được | Chưa biết |
|---|---|---|---|
| LLM | Qwen, Gemma, Llama, Vistral, SeaLLM chạy bằng Ollama/vLLM/llama.cpp | Vistral-7B-Chat: bản Hugging Face chính thức bị khóa (phải đồng ý chia sẻ liên hệ), bản sao ghi giấy phép AFL-3.0, cần xác nhận ([TK](https://huggingface.co/Viet-Mistral/Vistral-7B-Chat)). SeaLLM: giấy phép riêng "SeaLLMs Terms of Use", không phải mã nguồn mở chuẩn ([TK](https://huggingface.co/SeaLLMs/SeaLLM-7B-v2)). Gemma 4: Apache 2.0 theo bài báo [BT] ([TK](https://ai.google.dev/gemma/docs/core/model_card_4)); nên đọc lại trang giấy phép trước khi dùng | **Số VMLU giữa các nguồn mâu thuẫn** (SeaLLM-7B-v2: 45,74 hay 60,72). Không có số Qwen3 tiếng Việt. Chất lượng khi sinh JSON đúng schema: chưa đo |
| STT | faster-whisper (đã dùng trong D9, MIT); **PhoWhisper** (VinAI) | PhoWhisper-large 1,55B tham số, WER 8,14 (CMV-Vi), 4,67 (VIVOS); medium 769M chỉ kém chút (8,27 / 4,97); tiny 39M kém rõ (19,05 trên CMV-Vi) ([TK](https://arxiv.org/pdf/2406.02555)). **Giấy phép: mâu thuẫn** (Hugging Face ghi BSD-3-Clause, GitHub ghi Apache-2.0) [?] | Độ trễ thật, chất lượng với giọng trẻ em |
| TTS | VieNeu-TTS (đã dùng ở D9, Apache-2.0 theo [nhật ký D9](../nhat-ky/D9-TTS-LOCAL.md)) | Nhật ký D9 đo: khoảng **1 đến 2 giây mỗi tệp trên CPU** (Ryzen 5 5600H, fp32). Gói GGUF (Q4/Q8) hỗ trợ CPU và streaming ([TK](https://pypi.org/project/vieneu/1.1.5/)) | Có chịu được tải đồng thời không, giấy phép bản 0.3B GGUF |

**Chi phí thuê máy (chỉ là mốc, giá đổi theo ngày):** RTX 4090 trên RunPod Community khoảng $0,34/giờ; RTX 4090 Secure $0,74 đến $0,89/giờ; L4 on-demand khoảng $0,49/giờ ([BT](https://www.frenzycap.com/gpu-prices), [BT](https://www.hostinger.com/tutorials/?p=158956)). Chạy 24/7 (720 giờ/tháng): **L4 ≈ $350/tháng, RTX 4090 Community ≈ $245/tháng, Secure ≈ $530 đến $640/tháng** (phép nhân của tôi). Đây là **chi phí cố định**, không đổi theo số người dùng.

**Chịu được bao nhiêu người:** [?] **Không có số đo trong tài liệu nào tôi đọc.** Không nên đưa con số "chịu 1 000 người" khi chưa chạy thử tải. Cần đo: số yêu cầu đồng thời một GPU L4/4090 phục vụ được cho model 7B đến 9B lượng tử hóa, cộng Whisper và VieNeu trên cùng máy.

**Trái Nguyên tắc 1.** Nguyên tắc 1 viết "Không tự train hoặc tự host AI trong MVP". Tự host lúc chạy app là lệch có chủ đích. Dựng sẵn âm thanh lúc soạn nội dung (đã làm ở D9) **không** trái nguyên tắc vì app chỉ phục vụ tệp tĩnh. Ngoài ra bạn vận hành thêm: bảo trì máy chủ GPU, giám sát, bảo mật, cập nhật model.

### 2b. Chạy ngay trên điện thoại (trái Nguyên tắc 1 và có thể trái "client mỏng")

| Thành phần | Thông tin tra được | Chưa biết |
|---|---|---|
| LLM nhỏ | Gemma 4 E2B qua LiteRT-LM: **2,58 GB**; E4B: **3,65 GB** ([TK](https://ai.google.dev/edge/litert-lm/models/gemma-4)). Một hướng dẫn cho nhà phát triển nói E2B chạy trên máy Android từ 6 GB RAM, 52 token/giây trên GPU ở Samsung S26 Ultra (số của Google, máy cao cấp) ([TK](https://developers.googleblog.com/en/blazing-fast-on-device-genai-with-litert-lm/)). MediaPipe LLM Inference cho Gemma 4 "ở chế độ bảo trì" ([TK](https://ai.google.dev/edge/litert-lm/overview)). Gemma 4 được ghi hỗ trợ 140+ ngôn ngữ nhưng "35+ ngôn ngữ dùng ngay" ([TK](https://ai.google.dev/gemma/docs/core/model_card_4)) | **Tốc độ trên máy tầm trung; chất lượng tiếng Việt; chất lượng JSON đúng schema.** Chưa có số nào tra được |
| STT trên máy | whisper.cpp (GGML): tiny **75 MB**, base **142 MB**, small **466 MB** ([TK](https://huggingface.co/ggerganov/whisper.cpp)). RAM chạy ước 270 đến 850 MB tùy nguồn (mâu thuẫn). PhoWhisper-tiny/base kém hơn rõ so với large ở WER ([TK](https://arxiv.org/pdf/2406.02555)) | Tốc độ Android thật, WER với giọng trẻ em |
| TTS trên máy | Web Speech / TTS sẵn máy (đang dùng khi server 503). Không tốn APK | Giọng khác giữa thiết bị |

**Đánh giá:** tải thêm **≥ 2,6 GB cho LLM** không thực tế với đối tượng học sinh và máy phổ thông, và chất lượng tiếng Việt chưa kiểm chứng. **Không khuyến nghị cho LLM.** STT tiny/base trên máy có thể là **dự phòng khi mất mạng** (75 đến 142 MB tải thêm lúc cần, không nằm trong APK), nhưng độ chính xác chưa đủ để chấm phát âm. TTS sẵn máy: nên dùng nhiều hơn (đã có).

---

## 3. Kiến trúc đề xuất

### 3.1 Hiện trạng code (đã đọc)

- `LlmProvider.generateJson(req)` (`providers/llm.ts`): interface trừu tượng, hiện chỉ có `GeminiProvider`. `createLlmProvider` trả `null` khi không có khóa (bộ giả lập `mock: true`).
- `SttProvider` (`providers/stt.ts`): hiện `LlmSttProvider` (STT qua Gemini). `OpenAiCompatSttProvider` **đã có**, trỏ `POST {base}/audio/transcriptions` (Groq dùng cùng dạng), **nhưng**: tên model cố định `'whisper'`, **không gửi header khóa**, và `createSttProvider(llm)` chỉ nhận LLM, chưa đọc cấu hình. Cần mở rộng.
- `TtsProvider` + `createTtsProvider(config)`: đã có `gemini` và `openai-compatible`, chọn bằng `TTS_PROVIDER`.
- Lỗi Gemini 429 → `503 llm_busy`; hết quota app → `429 quota_exceeded` kèm `resetAt` (`pipeline/RequestPipeline.ts`). Hai mã khác nhau nhưng giao diện chưa phân biệt (điểm 6).
- Quota theo người/ngày UTC (60 lượt, 100K token, 600 giây STT, 15K ký tự TTS, vision 200 cố định). **Không có trần toàn cục.**

### 3.2 Đề xuất (không code ở bước này)

```
yêu cầu → quota người dùng → trần toàn cục (MỚI) → cache (MỚI)
        → Chain: [Gemini trả phí] → [Groq / OpenAI-compat free] → [trả lời mẫu có nhãn]
```

1. **`FallbackLlmProvider`**: bọc danh sách provider, thử lần lượt khi lỗi `llm_busy`, `llm_timeout`, `llm_unavailable` (KHÔNG thử lại khi `llm_blocked`, lỗi nội dung). Vẫn là một `LlmProvider`, giữ Nguyên tắc 4. Cấu hình bằng biến môi trường (ví dụ `LLM_CHAIN=gemini,groq`).
2. **`OpenAiCompatLlmProvider`** (một lớp phủ Groq, Cerebras, OpenRouter, Mistral). Cần chuyển `schema` kiểu OpenAPI-subset sang JSON Schema `response_format`, và **vẫn xác thực lại bằng Zod ở nơi gọi** (Nguyên tắc 6) vì model nhỏ hay sinh JSON sai.
3. **Khoảng trống cần nói rõ:** `JsonRequest.turns` có phần âm thanh/ảnh dạng `inline`. Nhà cung cấp chỉ có chữ (Groq gpt-oss) không nhận ảnh hay âm thanh. Hệ quả: dự phòng cho **STT** phải là provider STT riêng (Groq Whisper); dự phòng cho **camera** thì chưa có (Gemini hoặc Cloudflare llama-vision), nên khi cả chuỗi lỗi, camera trả lỗi thân thiện "Cu Tít nghỉ một chút" thay vì mock.
4. **Phân tầng theo gói**: `plan: 'free' | 'plus'` trong hồ sơ tài khoản; gói free dùng model rẻ hoặc dự phòng và hạn mức nhỏ, gói trả phí dùng model tốt, hạn mức lớn. Hạn mức theo gói đọc từ cấu hình, không cố định trong code (hiện vision cố định 200 trong code).
5. **Trần toàn cục**: bộ đếm theo ngày (và theo phút) cho mỗi nhà cung cấp, chặn trước khi gọi, để không đốt hết RPD chung. Khi gần trần, chuyển provider kế tiếp thay vì đợi lỗi 429.
6. **Cache**: (a) trả lời LLM cho câu hỏi văn hóa/giải thích có `promptVersion` giống nhau theo khóa băm; (b) nhãn vision theo băm ảnh (chỉ giữ nhãn, không giữ ảnh); (c) TTS: gói âm thanh dựng sẵn VieNeu đã có (D9), mở rộng thay vì gọi TTS thời gian chạy.
7. **Việc đưa về máy để giảm lời gọi** (không cần chấp nhận lệch nguyên tắc): TTS sẵn máy khi chưa có gói dựng sẵn; phát hiện im lặng/độ dài trước khi gửi STT (đã có `SilenceDetector`); từ chối gửi âm thanh < 0,5 giây; câu hỏi lặp từ nội dung bài học trả bằng nội dung có sẵn, không gọi LLM.

### 3.3 Giả định tính chi phí (của tôi, không phải số nhà cung cấp)

Một **người dùng hoạt động trong ngày** = 10 lượt chat (mỗi lượt khoảng 800 token vào gồm cả prompt hệ thống, 200 token ra), 4 câu nói qua STT (khoảng 6 giây mỗi câu, 24 giây tổng), 1 ảnh camera. Token "thinking" của model có thể làm tăng token ra, nên tôi nhân hệ số 1,5 cho giá trần. Tháng = 30 ngày.

### 3.4 Chi phí ước tính mỗi tháng

| Phương án | Công thức giá (nguồn) | 100 người/ngày | 1 000 người/ngày | 10 000 người/ngày |
|---|---|---|---|---|
| **A. Gemini trả phí (Flash-Lite)** | $0,30 vào, $2,50 ra / 1 triệu token ([CT](https://ai.google.dev/gemini-api/docs/pricing)). Mỗi người/ngày ≈ 8K vào + 2K ra ≈ $0,0074; ×1,5 ≈ $0,011. STT và ảnh cộng thêm không đáng kể (đo bằng token âm thanh: chưa tra giá riêng) | **$22 đến $33** | **$220 đến $330** | **$2 200 đến $3 300** |
| **B. Cloudflare Workers AI** (gemma-sea-lion-v4-27b + Whisper v3-turbo) | LLM $0,351 vào, $0,555 ra / 1 triệu token; Whisper $0,0005/phút; miễn phí 10 000 Neurons/ngày ([CT](https://developers.cloudflare.com/workers-ai/platform/pricing/)). Mỗi người/ngày ≈ 8K vào + 2K ra ≈ $0,0039, + 0,4 phút Whisper ≈ $0,0002 → **≈ $0,0041** | **≈ $12** (đầu ngày dùng phần free ≈ 26 người, nên thực tế thấp hơn một chút) | **≈ $120** | **≈ $1 200**. **Chưa biết chất lượng tiếng Việt và JSON của model này** |
| **C. Tự host GPU thuê** (L4 hoặc 4090 + faster-whisper/PhoWhisper + VieNeu + LLM 7 đến 9B) | Chi phí cố định ≈ **$245 đến $350/tháng** cho **một** máy ([BT](https://www.frenzycap.com/gpu-prices)) | $245 đến $350 (đắt nhất cho quy mô nhỏ) | $245 đến $700 (cần 1 đến 2 máy; số tải: [?]) | **[?]** cần vài máy; không có số đo, không ước tính |
| **D. Free thuần** (Gemini free + Groq + Cloudflare free) | $0 | Còn dưới trần RPD? **[?]** (Gemini RPD chưa xác nhận); Groq LLM tối đa 1 000 lượt/ngày, 10 lượt chat/người → **dưới 100 người/ngày nếu chỉ Groq**; Cloudflare ≈ 26 người/ngày | Không đủ | Không đủ |
| **Cộng thêm cho mọi phương án có server** | Hosting Gateway + Postgres: chưa ước tính (phụ thuộc nhà cung cấp bạn chọn) | | | |

**Cách đọc:** A và B rẻ ở mọi quy mô tới 10 000 người; C chỉ có lợi khi lưu lượng lớn hơn nhiều (khoảng trên 10 000 người/ngày theo giá A) và bạn chấp nhận vận hành máy chủ. Ước tính mang tính thứ tự độ lớn. Gemini thực tế có thể thấp hơn nếu bật context caching ($0,03/1 triệu token cho phần prompt hệ thống lặp lại, theo trang giá).

---

## 4. Vấn đề dữ liệu cá nhân (Luật 91/2025)

- Gói free của Gemini cho Google dùng nội dung để cải thiện sản phẩm ([CT](https://ai.google.dev/gemini-api/docs/pricing)). Ảnh trẻ em, giọng nói, tên nằm trong nội dung này.
- Gói trả phí ghi rõ "không dùng". Đây là lý do chính để **chuyển Gemini sang trả phí khi phát hành**, không chỉ vì hạn mức.
- Mọi provider dự phòng cũng phải đạt cùng mức. Groq: mặc định không lưu dữ liệu suy luận ([CT](https://console.groq.com/docs/your-data)). Mistral Experiment, OpenRouter `:free`, Cloudflare, GitHub Models: **chưa xác nhận** → không đưa vào chuỗi mặc định cho tới khi đọc điều khoản.
- Việc cần pháp lý (không tự quyết ở đây): xem lại `docs/phap-ly/`, ghi tên các nhà xử lý (Google, Groq) và nơi đặt máy chủ trong chính sách bảo mật.

---

## 5. Xử lý 16 điểm bối rối (mục 5 của KHAO-SAT-AI.md)

Cột **Phụ thuộc NCC** = có đổi tùy lựa chọn nhà cung cấp hay không.

| # | Điểm bối rối | Cách sửa cụ thể | Phụ thuộc NCC? |
|---|---|---|---|
| 1 | Không nói miễn phí hay trả phí | Nhãn nhỏ trong Hồ sơ và dưới ô chat: "Gói Miễn phí · X lượt AI/ngày". Khi chưa có gói trả phí, vẫn ghi "Miễn phí trong thời gian đầu" để người học biết sẽ có gói. Một câu trong màn đồng ý đầu tiên | Không (nhưng nội dung gói đổi khi có phương án A/B) |
| 2 | Không thấy số lượt còn lại | Dòng phụ trong bong bóng Cu Tít: "Còn 42 lượt hôm nay". Gọi `GET /v1/quota` (đã có) khi mở màn chat, nhập vai, camera và cập nhật theo phản hồi của mỗi lượt (thêm `remaining` vào kết quả `chat/turn`). Còn ≤ 5: đổi màu nhẹ | Không |
| 3 | Hai loại hạn mức chạy song song | Quy về **một con số hiển thị**: "lượt". Giữ token/giây nói ở nền; chỉ khi một loại sắp hết mới giải thích bằng lời ("Còn ít thời gian nói, hãy gõ chữ nhé") | Không |
| 4 | Mỗi câu nói trong gọi thoại tính 1 lượt, 60 câu hết ngày | Tách quota gọi thoại khỏi chat (ví dụ "30 phút nói/ngày") hoặc nói rõ "mỗi câu nói 1 lượt" trên màn gọi thoại. Gợi ý: đếm bằng **giây nói**, không đếm câu | Có (giá STT/LLM của NCC quyết định hạn mức hợp lý) |
| 5 | Reset theo UTC, Gemini reset nửa đêm Pacific | Reset theo **00:00 giờ Việt Nam** (UTC+7, tức 17:00 UTC; hiện tại reset lúc **07:00 sáng giờ Việt Nam**). Hiển thị giờ theo múi giờ máy. Hạn mức Gemini là chuyện nội bộ của Gateway, người dùng không cần biết giờ Pacific | Một phần: Cloudflare reset 00:00 UTC ([CT](https://developers.cloudflare.com/workers-ai/platform/pricing/)), OpenRouter UTC. Vì hạn mức của **app** là cái người dùng thấy, đặt giờ riêng của app |
| 6 | "AI bận" (429 Gemini) giống "hết lượt" | Hai thông báo khác nhau. `quota_exceeded` → "Bạn đã dùng hết lượt hôm nay, mới lúc 00:00". `llm_busy` → "Cu Tít đang bận, thử lại sau ít giây" kèm nút Thử lại, **không trừ lượt** nếu AI lỗi. Có chuỗi dự phòng thì người dùng gần như không thấy lỗi này | Có (giảm hẳn nếu có provider dự phòng) |
| 7 | Gọi thoại không realtime, có khoảng lặng, tưởng app đơ | Chỉ báo từng bước trên màn gọi thoại: "Cu Tít đang nghe…" → "đang nghĩ…" → "đang nói…" (đã có `callMachine`, thêm nhãn và hiệu ứng). Thêm âm "ừm" ngắn trong lúc chờ. **Realtime thật**: cần Live API, mà tài liệu giá hiện có mô hình Live loại preview bị ghi đã ngừng ngày 2026-11-17 [BT, chưa xác nhận], nên **không** đề xuất chuyển sang Live API ở giai đoạn này | Có (chỉ báo từng bước thì không; realtime thì có) |
| 8 | Giọng đọc khác nhau theo máy | Ưu tiên phát gói âm thanh dựng sẵn VieNeu (D9) cho nội dung khóa học. Với lời Cu Tít (AI), dùng giọng máy và cho chọn giọng trong Cài đặt. Cu Tít chỉ có **một** nhận dạng giọng chính | Không |
| 9 | Nhãn "trả lời mẫu" dễ bị bỏ qua | Khi chạy chế độ mẫu, hiện **dải cố định trên đầu màn chat** "Cu Tít đang nghỉ ngơi, đây là câu trả lời mẫu", không chỉ nhãn nhỏ trong bong bóng. Ở bản phát hành thật, mock không bao giờ xuất hiện nếu có chuỗi dự phòng | Có |
| 10 | Chat, nhập vai, gọi thoại chung một hộp đồng ý micro | **Giữ chung** (một quyền hệ điều hành), nhưng đổi lời hộp thành "Dùng micro để nói chuyện với Cu Tít (chat, nhập vai, gọi thoại)" để người học biết phạm vi. Gộp hộp đồng ý camera và micro thành **một màn đồng ý theo nhóm**, hỏi quyền hệ điều hành lúc dùng lần đầu | Không |
| 11 | Camera có hộp đồng ý riêng khác micro | Như trên: gộp thành một hộp "Quyền thiết bị" có hai công tắc; quyền hệ điều hành vẫn hỏi riêng lúc cần | Không |
| 12 | Giới hạn 15 giây mỗi câu nói bị cắt không rõ lý do | Hiện đồng hồ đếm ngược trên nút ghi âm từ giây thứ 10, và thông báo "Câu hơi dài, Cu Tít nghe 15 giây thôi nhé". Cho phép tăng lên 20 giây nếu quota STT dư | Có (giá STT) |
| 13 | Thiết bị không thu âm được trong app | Giữ thông báo hiện có, thêm nút "Gõ chữ" nổi bật và liên kết trợ giúp. Ghi log (không có nội dung) loại thiết bị để biết tỉ lệ | Không |
| 14 | Quyền bị từ chối vĩnh viễn | Đã xử lý (nút mở Cài đặt). Giữ nguyên, chỉ thêm câu hướng dẫn ngắn 2 bước | Không |
| 15 | Chưa rõ có màn rút đồng ý micro không | Thêm công tắc "Quyền dùng micro/camera" trong Cài đặt, rút đồng ý thì xóa cờ `consents` trong `packages/state` và dừng ghi âm. Cần kiểm lại thực tế mã có sẵn tính năng này chưa (khảo sát chưa kiểm tra) | Không |
| 16 | Bản debug cho HTTP (cleartext), release không | Thêm kiểm tra trong CI/checklist phát hành: biên dịch bản release trỏ `https://` và thử một lượt chat. Hiển thị lỗi kết nối riêng ("Không kết nối được máy chủ") khác với lỗi AI bận | Không |

**Điểm bổ sung đáng làm** (không nằm trong 16 điểm): camera chưa kiểm tra có báo thân thiện khi 429 hay không (KHAO-SAT-AI.md mục 2.2). Cần kiểm trong `CameraScreen.tsx`.

---

## 6. Khuyến nghị cuối

**Phương án chính (A + dự phòng):**
- **Gemini trả phí (Tier 1, gắn billing)** làm nhà cung cấp chính cho chat, nhập vai, STT, vision. Lý do: dữ liệu không dùng để cải thiện sản phẩm (xử lý vấn đề Luật 91/2025), chi phí ước tính $0,2 đến $0,4 mỗi người/tháng, không đổi kiến trúc, giữ Nguyên tắc 1 đến 7.
- **Chuỗi dự phòng khi 429/lỗi:** Groq (Whisper v3-turbo cho STT; gpt-oss hoặc qwen cho chat) → trả lời mẫu có nhãn rõ. Chỉ bật Groq sau khi thử chất lượng tiếng Việt và đọc điều khoản (mục 7).
- **Trần toàn cục + chỉ báo lượt còn lại + tách thông báo "bận" và "hết lượt"** (điểm 2, 3, 5, 6 ở mục 5) làm trước vì không phụ thuộc nhà cung cấp.
- **TTS:** tiếp tục gói dựng sẵn VieNeu + giọng máy. Không gọi TTS server lúc chạy.

**Phương án dự phòng (B):** Cloudflare Workers AI (gemma-sea-lion-v4-27b + Whisper v3-turbo), rẻ hơn A khoảng 2 đến 3 lần ở cùng lưu lượng (≈ $0,004 so với $0,007 đến $0,011 mỗi người/ngày). Chỉ chuyển sang B nếu bài thử tiếng Việt cho kết quả tương đương Gemini, vì **chưa có số chất lượng nào**.

**Không khuyến nghị:** tự host GPU (C) và chạy LLM trên máy (2b) ở giai đoạn này. Cả hai trái Nguyên tắc 1, tốn công vận hành hoặc tải ≥ 2,6 GB, và chất lượng tiếng Việt chưa kiểm chứng.

### Quyết định chỉ bạn trả lời được

1. **Có chấp nhận chi phí trả phí Gemini (ước tính $20 đến $330/tháng cho 100 đến 1 000 người/ngày) khi phát hành không?** Nếu không, chỉ còn lựa chọn D (free thuần, dưới ~100 người/ngày và vướng quyền riêng tư).
2. **Có chấp nhận dữ liệu giọng nói và ảnh đi tới hai nhà cung cấp (Google, Groq) ở nước ngoài không?** Nếu muốn dữ liệu ở Việt Nam, phải thử FPT.AI (chưa biết có LLM chat và giá).
3. **Có đồng ý "lệch có chủ đích" Nguyên tắc 1** nếu sau này chọn tự host (C) hoặc chạy STT trên máy làm dự phòng offline?
4. **Giờ reset hạn mức:** 00:00 giờ Việt Nam hay theo múi giờ từng người?
5. **Quota gọi thoại tính bằng câu hay bằng giây?** Ảnh hưởng chi phí và độ rõ ràng.
6. **Khi cả chuỗi lỗi:** hiện "Cu Tít nghỉ" (không chat) hay trả lời mẫu? Trả lời mẫu dễ gây hiểu nhầm AI đang hoạt động (điểm 9).
7. **Gói trả phí của app:** bao nhiêu lượt cho gói free và gói trả phí? Cần để tính lại bảng 3.4.

---

## 7. Việc cần kiểm trước khi chốt (ngày 2026-11-20, chưa làm)

- Chụp RPM/RPD thật của `gemini-3.5-flash-lite` và `gemini-3.8-flash-tts` trong AI Studio (không có trong tài liệu).
- Thử 20 câu mẫu tiếng Việt (chat, trẻ em, từ đơn, thanh điệu) trên Gemini, Groq (gpt-oss, qwen3.8-27b), Cloudflare (gemma-sea-lion): chấm chất lượng và tỉ lệ JSON đúng schema bằng Zod. Đo độ trễ và ghi vị trí máy chủ từ phản hồi.
- Thử 20 file ghi âm (giọng người lớn và trẻ em, 3 miền) trên Gemini STT, Groq Whisper v3-turbo, PhoWhisper (nếu có tài nguyên): so WER.
- Đọc điều khoản dữ liệu và quyền thương mại của Groq, Cloudflare, OpenRouter, Mistral, GitHub Models (hiện chỉ có đoạn trích tìm kiếm hoặc chưa tra).
- Hỏi trực tiếp FPT.AI, Viettel AI, Zalo AI về gói miễn phí và điều khoản (không tìm thấy trang giá chính thức rõ ràng).
- Nếu đi theo phương án C: chạy thử tải một máy L4/4090 để có số "chịu bao nhiêu người".
