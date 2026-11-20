# Nguồn API miễn phí bổ sung (xếp tầng) cho Gateway

> Ngày tra: **2026-11-20**. Chỉ nghiên cứu: không sửa code, không tạo tài khoản, không gọi thử API. Bổ sung cho [DE-XUAT-AI-THAY-THE.md](DE-XUAT-AI-THAY-THE.md) (đã có Groq, Cloudflare, OpenRouter, Mistral, GitHub Models, Cerebras, HF, FPT/Viettel/Zalo; không lặp lại ở đây trừ khi có số mới).
> Cách tra: các trang chính thức được đọc bằng công cụ tải trang (ngày 2026-11-20). **[CT]** = đọc trên trang chính thức. **[TK]** = chỉ thấy đoạn trích tìm kiếm/bên thứ ba. **[?]** = chưa xác nhận. Một số trang chạy bằng JavaScript hoặc 404 nên không đọc được, ghi rõ ở từng dòng.
> **Không có chất lượng tiếng Việt nào được đo ở đây.** Cột "tiếng Việt" chỉ ghi điều tài liệu nói, hầu hết là [?].

---

## 0. Tóm tắt

1. **Phát hiện quan trọng nhất không nằm ở nguồn mới mà ở nguồn cũ: điều khoản Gemini.** Trang điều khoản (hiệu lực 2026-03-23) ghi "You must be 18 years of age or older to use the APIs" và cấm dùng dịch vụ trong app "likely to be accessed by individuals under the age of 18" ([CT](https://aistudio.google.com/docs/terms), `ai.google.dev/gemini-api/terms` chuyển hướng về đây). Ngoài ra: gói miễn phí "Unpaid Services" cho Google dùng nội dung để cải thiện sản phẩm và người duyệt có thể đọc; "Do not submit sensitive, confidential, or personal information to the Unpaid Services"; và "You may use only Paid Services when making API Clients available to users in the European Economic Area, Switzerland, or the United Kingdom". **App Bé Cu Tít dành cho học sinh nên cần người có thẩm quyền (pháp lý) đọc lại điều khoản này trước khi phát hành, kể cả khi trả phí.** Tôi chỉ trích câu, không kết luận pháp lý.
2. **Khoảng 1/3 nguồn "free" nổi tiếng không dùng được cho app thật** vì điều khoản (mục 5): OpenCode Zen (chat free bắt buộc dùng trong OpenCode), NVIDIA trial, SambaNova (Preview, "should not be used in production"), Cerebras ($5 dùng thử 30 ngày + ghi chú "not intended for production"), Cohere trial (1 000 lượt/tháng, "evaluation keys").
2b. **Không còn free thật:** Hugging Face (free users "Monthly Credits: None"), Chutes ("We do not offer a free tier at this time"), Mistral (trang giới hạn ghi free mode "doesn't include API access"), Kluster (tên miền không phân giải được).
3. **Còn lại dùng được làm tầng dự phòng, theo mức tin cậy:** Cloudflare Workers AI (điều khoản dữ liệu rõ nhất), Groq, OpenRouter `:free`, Gemma qua cùng khóa AI Studio, Zhipu GLM-Flash [?]. Cộng dồn **chỉ phục vụ khoảng 100 đến 150 người hoạt động/ngày** (mục 6), chưa tính Gemini free. Xếp tầng giúp **chịu lỗi 429**, không giúp **mở rộng**.

---

## 1. Bảng từng nguồn (chỉ nguồn chưa có trong DE-XUAT hoặc có số mới)

Ký hiệu cột "Production/thương mại?": ✅ không thấy cấm, ⚠️ có hạn chế, ⛔ cấm hoặc ghi rõ không dành cho production, ❓ chưa tìm thấy điều khoản.

| Nguồn | Năng lực (theo tài liệu) | Giới hạn free | Thẻ? | Production/thương mại? (điều khoản) | OpenAI-compatible? | Model mạnh nhất có trong gói free / tiếng Việt |
|---|---|---|---|---|---|---|
| **OpenCode Zen** | LLM chat. Ảnh/âm thanh chỉ ở nhóm "System One" trả phí. Model free: big-pickle, deepseek-v4.1-flash-free, flint-40b-free, longcat-2.5-free, hy4-flash-free, nemotron-3.5-*-free… ([CT](https://opencode.ai/docs/zen/)) | LongCat 2.5 Free: 100 lượt/ngày; model khác [?]. Nhiều model "free for a limited time" | Cần "billing details and credits" cho model Console; free [?] | ⛔ **"Free-tier chat models require OpenCode; use paid models or Go from other clients."** ([CT](https://opencode.ai/docs/zen/)). ToS (2026-11-08): "only use the Services for your own internal use", không "on behalf of or for the benefit of any third party"; cấm "automatically or programmatically extracts data or Output" ([CT](https://opencode.ai/legal/terms-of-service)). Tài khoản không trả phí: "we may use Content to further develop and improve our Services" | Có: `https://opencode.ai/inference/openai/v1/chat/completions` | DeepSeek V4.1 Flash Free (zero-retention); Việt [?] |
| **Cerebras** | LLM: gpt-oss-120b, qwen-3.8-27b (có nhận ảnh) ([CT](https://inference-docs.cerebras.ai/models/overview)) | Không còn free vĩnh viễn. Trial: gpt-oss-120b **5 RPM**, 1M token/ngày; qwen-3.8-27b **300 RPM**, 750K TPM ([CT](https://inference-docs.cerebras.ai/support/rate-limits)); $5 hết hạn sau 30 ngày | **Có** (phương thức thanh toán đã xác minh mới được $5) | ⛔ Trang giá: "For development, evaluation, and experimentation; not intended for production use" ([CT](https://www.cerebras.ai/pricing), dòng của bảng không hiển thị nên không rõ áp cho tầng nào). Dữ liệu: "We do not retain inputs and outputs" ([CT](https://www.cerebras.ai/privacy-policy)); không dùng huấn luyện ([CT](https://www.cerebras.ai/terms-of-service)) | Có: `https://api.cerebras.ai/v1` | qwen-3.8-27b (đa ngôn ngữ, Việt [?]) |
| **SambaNova Cloud** | LLM: gpt-oss-120b, gemma-4-31B-it (chỉ 2 model đọc được) | Free: **20 RPM, 20 RPD, 200K token/ngày** mỗi model. Developer: 60 RPM, 12 000 RPD, 20M token/ngày ([CT](https://docs.sambanova.ai/docs/en/models/rate-limits)) | Trang gói ghi phải "add a payment method and purchase credits" ([CT](https://cloud.sambanova.ai/plans)); mâu thuẫn với trang giới hạn [?] | ⛔ "intended for evaluation purposes and developer experimentation only, and should not be used in production environments" ([CT](https://docs.sambanova.ai/docs/en/models/rate-limits)) | [?] | Gemma 4 31B (Việt [?]) |
| **NVIDIA NIM** (build.nvidia.com) | LLM, đa phương thức (nemotron-3.5-super-vl, nemotron-3.5-lightning, deepseek-v4.1-flash) ([CT](https://build.nvidia.com/)) | Người dùng diễn đàn nói 40 RPM; **chính thức [?]** | [?] | ⛔/❓ Không đọc được điều khoản chính thức. Một người dùng diễn đàn: "only for study or develope your product , but not for production it's in ToS" ([TK](https://forums.developer.nvidia.com/t/is-nim-free/369368), lời người dùng, không phải NVIDIA). Docs gọi là "prototype applications" ([CT](https://docs.api.nvidia.com/)). Trong OpenCode, hai model NVIDIA ghi "Trial use only … logged … to improve NVIDIA products" ([CT](https://opencode.ai/docs/zen/)) | [?] (trang giới thiệu chưa nêu URL) | Việt [?] |
| **Mistral** | LLM, Voxtral STT (chưa xác nhận) | Trang giới hạn: "Free mode includes a monthly usage budget for trying Vibe and Studio. It doesn't include API access"; "Creating API keys and using the API require billing activation and pay-as-you-go" ([CT](https://docs.mistral.ai/admin/billing-usage/usage-limits)). Bài trợ giúp về gói Experiment trả 404 ([CT](https://help.mistral.ai/en/articles/450104-how-can-i-try-the-api-for-free-with-the-experiment-plan)) nên **có thể đã bỏ** | Billing bắt buộc | ⛔ Không có free API để cân nhắc. ToS thương mại (2026-09-25) mục 4.2: mặc định không huấn luyện, trừ khi chưa tắt ở sản phẩm bật mặc định, Labs/Preview ([CT](https://legal.mistral.ai/terms/commercial-terms-of-service)) | [?] | – |
| **Google AI Studio: model khác** | Flash 3.8 / 3.6 / Flash-Lite 3.5 "Free of charge" ở bảng giá ([CT](https://aistudio.google.com/docs/pricing)). **Gemma 4** "Free of charge" nhưng đó là tóm tắt do công cụ tạo, **chưa đọc nguyên văn** | RPM/RPD Flash và Gemma **không in ở tài liệu**, chỉ xem trong AI Studio ([CT](https://aistudio.google.com/docs/rate-limits)). Số 30 RPM / 14 400 RPD cho Gemma 3 chỉ từ diễn đàn/bên thứ ba ([TK](https://discuss.ai.google.dev/t/questions-about-gemma-models/100257)) | Không (gói free) | ⚠️ Xem mục 0 điểm 1 và mục 5 | Có (endpoint tương thích OpenAI của Gemini) [?] chưa kiểm | Gemini Flash là mốc 88/100. Gemma: Việt [?], JSON schema [?] |
| **Hugging Face Inference Providers** | LLM/STT nhiều hãng | **"Free Users: Monthly Credits: None"**; PRO $2/tháng ([CT](https://huggingface.co/docs/inference-providers/pricing)) | – | – | Có: `https://router.huggingface.co/v1` | Loại: không free |
| **Chutes** | LLM (Qwen3.8-27B-TEE, DeepSeek-V4.1-Flash, Kimi, GLM) | "We do not offer a free tier at this time" ([CT](https://chutes.ai/pricing)) | – | Trả tiền thì ✅ ("integrate the Platform into your own products", [CT](https://chutes.ai/terms)). Dữ liệu: "does not train on your content" ([CT](https://chutes.ai/privacy)) | Có: `https://llm.chutes.ai/v1` | Loại khỏi danh sách free |
| **Together AI** | LLM, vision (Nemotron 3.5 Super VL $0,15/$0,50 mỗi triệu token), STT (Whisper Large v3 **$0,0015/phút**) ([CT](https://www.together.ai/pricing)) | Bảng giá có vài dòng "Free" (Ternary Bonsai 27B $0/$0) nhưng **chưa rõ miễn phí cho mọi tài khoản hay có hạn** [?]; không in tín dụng; tài liệu giới hạn không có số ([CT](https://docs.together.ai/docs/rate-limits)) | [?] | ❓ | [?] | Không đủ thông tin; xem như **trả phí rẻ** |
| **Novita** | LLM, vision (Qwen3 VL, GLM-4.6V) | Trang giá/hướng dẫn không nêu tín dụng hay model free ([CT](https://novita.ai/pricing)) | [?] | ❓ | Có (docs ghi, URL [?]) | Chỉ trả phí |
| **Hyperbolic** | – | Trang giá chuyển hướng rồi 404 | [?] | ❓ | – | [?] không xác nhận được |
| **Kluster** | – | `kluster.ai` không phân giải được (DNS) | – | – | – | Có thể đã ngừng [?] |
| **LLM7** | – | Trang chủ chỉ trả tiêu đề, không đọc được | [?] | ❓ | [?] | [?] |
| **Pollinations** | LLM nhiều hãng, **vision, STT Whisper large-v3 (≤25 MB), TTS tts-1** ([CT](https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/APIDOCS.md)) | Tài liệu mô tả "prepaid credit"; **tầng free hiện tại và giới hạn không đọc được** [?] | Đăng nhập lấy khóa; thẻ [?] | ❓ MIT chỉ áp cho mã nguồn. Điều khoản dịch vụ và việc lưu/huấn luyện dữ liệu: chưa đọc | Có: `https://gen.pollinations.ai/v1` | Việt [?]; model có Gemini 3.7 Flash, Qwen3.8-27B |
| **DeepSeek** | LLM, vision ở `deepseek-flash`, STT $0,116/giờ audio | **Không có free** (chỉ "free quota for paid services" [?]). `deepseek-flash` $0,15/$0,6 mỗi triệu token (giờ thấp điểm) ([CT](https://api-docs.deepseek.com/quick_start/pricing)); chỉ giới hạn đồng thời (2 500) ([CT](https://api-docs.deepseek.com/quick_start/rate_limit)) | Trả trước | ✅ không thấy cấm; chính sách riêng tư chưa đọc ([ToS](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html)) | Có: `https://api.deepseek.com` | **Là phương án trả phí rất rẻ**, không phải free. Máy chủ ở Trung Quốc: vấn đề dữ liệu [?] |
| **Zhipu Z.ai (GLM)** | **Free:** GLM-4.7-Flash (chữ), GLM-4.5-Flash, **GLM-4.6V-Flash (vision)** ([CT](https://docs.z.ai/guides/overview/pricing)). ASR GLM-ASR-2512 trả phí ~$0,0024/phút | RPM/RPD/token cho model free: **[?]** (chỉ nói "different concurrency quotas") ([CT](https://docs.z.ai/guides/overview/concept-param)) | [?] | ❓ Điều khoản chưa đọc; dữ liệu [?] (nhà cung cấp Trung Quốc) | Có: `https://api.z.ai/api/paas/v4/` | GLM-4.7-Flash; Việt [?] |
| **Alibaba Model Studio (DashScope quốc tế)** | Qwen3.8-flash / 3.7-plus / 4-max nhận chữ+ảnh+video | **Một lần**: ~1 triệu token mỗi model, hiệu lực **90 ngày**, chỉ vùng Singapore. Danh sách bị loại khỏi quota mới gồm hầu hết Qwen-VL, qwen-plus/flash/max, Qwen3-ASR ([CT](https://www.alibabacloud.com/help/en/model-studio/new-free-quota), cập nhật 2026-11-16) | [?] | ❓ Trang ghi "Avoid enabling this feature in production environments" (về công tắc Free Quota Only) | Có: `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` [?] cần kiểm | Không phải nguồn free bền: chỉ dùng thử |
| **Cohere** | LLM (Command), Command A Vision, Transcribe/audio | Trial key: **1 000 lượt/tháng**; chat 20 RPM; audio 5 RPM ([CT](https://docs.cohere.com/docs/rate-limits)) | [?] | ⛔ Gọi là "evaluation keys". ToS (bản 2022) mục 4.1: Cohere được dùng Customer Data để "IMPROVE AND ENHANCE THE COHERE SOLUTION" ([CT](https://cohere.com/terms-of-use)) | Không (API riêng; có lớp tương thích [?]) | Aya hỗ trợ 23 đến 70 ngôn ngữ, **Việt không được liệt kê** [?] |

### Các nguồn đã có trong DE-XUAT, bổ sung số mới (đọc 2026-11-20)

| Nguồn | Số mới / điều khoản | Nguồn |
|---|---|---|
| **Groq** | Điều khoản API (Services Agreement, sửa 2026-06-22): "AI Model Services … used … for preview or production use"; mục 5.1 có dịch vụ "fee-free … for a limited time or based on usage limits"; **không thấy câu cấm thương mại cho gói free**. "You must be 18 years of age or older"; nếu app "directed towards or is likely to be accessed by individuals under the age of majority" thì bạn "solely responsible" tuân thủ (nghĩa vụ, không phải lệnh cấm). Mục 4.2: Groq không dùng Input/Output để huấn luyện. Bảng giới hạn đọc được là của **Developer plan** (Whisper large-v3 và v3-turbo: 20 RPM, 2K RPD); **số gói free: [?]** (tab không hiển thị) | [CT](https://console.groq.com/docs/legal/services-agreement), [CT](https://console.groq.com/docs/rate-limits) |
| **Cloudflare Workers AI** | 10 000 Neurons/ngày; chat **300 RPM**, ASR **720 RPM** (model bắt buộc gói trả tiền: 20 RPM). "Cloudflare does not use Customer Content processed by Workers AI to train AI models"; "Zero data retention" cho suy luận chuẩn (tắt AI Gateway log/cache). Có `llama-3.2-11b-vision-instruct`, `llama-4-scout-17b-16e`, `whisper-large-v3-turbo`. Quyền thương mại của gói free: chưa đọc Subscription Agreement [?]. Reset 00:00 UTC | [CT](https://developers.cloudflare.com/workers-ai/platform/pricing/), [CT](https://developers.cloudflare.com/workers-ai/platform/limits/), [CT](https://developers.cloudflare.com/workers-ai/platform/data-usage/) |
| **OpenRouter** | FAQ: free tier "usually not suitable for production use". 20 RPM; 50 RPD (<10 credit) hoặc 1 000 RPD (≥10). Prompt "not logged by default", nhưng ToS 6.1: "Some Models may store or train on your Inputs". ToS cho phép dùng thương mại nhưng cấm "reselling API access". Danh sách model `:free` hiện tại: **không lấy được** [?] | [CT](https://openrouter.ai/docs/faq), [CT](https://openrouter.ai/docs/api/reference/limits), [CT](https://openrouter.ai/terms) |

---

## 2. Trả lời câu hỏi OpenCode

- **OpenCode Zen có API dùng ngoài OpenCode không?** Có API chuẩn OpenAI (`/inference/openai/v1/chat/completions`, khóa Bearer `OPENCODE_API_KEY`). **Nhưng model chat miễn phí bị khóa vào công cụ OpenCode:** "Free-tier chat models require OpenCode; use paid models or Go from other clients" ([CT](https://opencode.ai/docs/zen/)). Model trả phí dùng được từ client khác.
- **Điều khoản có cho làm backend app không?** ToS: "own internal use", không "for the benefit of any third party" ([CT](https://opencode.ai/legal/terms-of-service)). Không thấy câu cấm "thương mại" nguyên văn, nhưng câu internal-use đủ chặn việc đặt làm backend phục vụ học sinh.
- **Dữ liệu:** nhiều model free dùng dữ liệu để cải thiện model (big-pickle, iceman, inkling, flint). Vài model nói không huấn luyện (deepseek-v4.1-flash-free, hy4-flash-free, longcat). Nemotron free: "Trial use only", log để cải thiện sản phẩm NVIDIA.
- **Kết luận: không dùng** OpenCode Zen free làm tầng của Gateway.

---

## 3. Xếp hạng chuỗi dự phòng

Điều kiện chung: người dùng đã chấp nhận dữ liệu có thể bị dùng để huấn luyện (quyết định 20/11), nhưng **điều khoản về trẻ vị thành niên (Gemini, Groq) là chuyện khác**, không phải chuyện dữ liệu huấn luyện.

### 3.1 LLM chat + JSON (thứ tự thử)

| # | Nguồn | Vì sao | Điều kiện / cần kiểm trước |
|---|---|---|---|
| 1 | **Gemini free** (flash-lite, đang dùng, 88/100) | Mốc chất lượng | RPD thật xem ở AI Studio [?]; xử lý điều khoản <18 và EEA (mục 0) |
| 2 | **Gemma 4 qua AI Studio** (cùng khóa) | Không thêm tài khoản; **hạn mức tính riêng theo model** nên cộng thêm lượt | Số liệu RPD chưa chính thức; Việt và JSON schema chưa đo |
| 3 | **Cloudflare Workers AI** (llama-4-scout hoặc model SEA-LION) | Điều khoản dữ liệu rõ nhất (không huấn luyện, không lưu); 300 RPM | 10 000 Neurons/ngày thấp; Việt chưa đo |
| 4 | **Groq** (gpt-oss-120b / qwen) | Nhanh; không huấn luyện; điều khoản cho production | Số gói free [?]; nghĩa vụ app trẻ em |
| 5 | **OpenRouter `:free`** | Nhiều model, một khóa (đã có) | 50 lượt/ngày ở tài khoản chưa nạp; nhà cung cấp phía sau có thể huấn luyện (đã chấp nhận); FAQ nói không hợp production |
| 6 | **Zhipu GLM-4.7-Flash** [?] | Free thật, RPM [?] | Chưa đọc điều khoản; chưa rõ nơi đặt dữ liệu; Việt [?] |

### 3.2 STT tiếng Việt

| # | Nguồn | Ghi chú |
|---|---|---|
| 1 | **Gemini** (đang dùng) | Tốn chung quota LLM |
| 2 | **Groq Whisper large-v3 / turbo** | Developer plan 2 000 RPD; gói free [?]; Whisper nghe thanh Huế kém (nhật ký D9) |
| 3 | **Cloudflare `whisper-large-v3-turbo`** | 720 RPM; ~214 phút/ngày theo tính trong DE-XUAT; Việt [?] |
| 4 | **Pollinations Whisper** | [?] tầng free và điều khoản chưa đọc, chỉ thử nghiệm |

Không nguồn mới nào có STT free bền ngoài hai nguồn trên (Together/Zhipu/DeepSeek/Cohere đều trả tiền hoặc trial).

### 3.3 Vision (camera)

| # | Nguồn | Ghi chú |
|---|---|---|
| 1 | **Gemini** | Mốc |
| 2 | **Cloudflare `llama-3.2-11b-vision-instruct` hoặc `llama-4-scout`** | Cùng quota Neurons với chat |
| 3 | **Zhipu GLM-4.6V-Flash** [?] | Free; chưa có giới hạn và điều khoản |

Groq vision: có trang docs `console.groq.com/docs/vision` nhưng **chưa đọc** [?].

---

## 4. Việc cần kiểm trước khi bật từng tầng

- Chạy 20 câu tiếng Việt mẫu qua từng model (đã nêu ở DE-XUAT mục 7), chấm JSON bằng Zod.
- Mở AI Studio chụp RPM/RPD của Flash-Lite và Gemma.
- Mở console Groq chụp bảng giới hạn **gói free** (tài liệu hiển thị bảng Developer).
- Đọc `cloudflare.com/terms` (Self-Serve Subscription Agreement) về dùng thương mại gói free.
- Đọc điều khoản Z.ai/BigModel và `developer.nvidia.com/legal/terms` (chưa đọc được).

---

## 5. Không được dùng vì điều khoản

| Nguồn | Câu điều khoản | Trang |
|---|---|---|
| OpenCode Zen (model chat free) | "Free-tier chat models require OpenCode; use paid models or Go from other clients." và "only use the Services for your own internal use" | [docs](https://opencode.ai/docs/zen/), [ToS](https://opencode.ai/legal/terms-of-service) |
| SambaNova | "should not be used in production environments" | [CT](https://docs.sambanova.ai/docs/en/models/rate-limits) |
| Cerebras | "not intended for production use" (dòng bảng giá, tầng áp dụng chưa rõ) + cần thẻ | [CT](https://www.cerebras.ai/pricing) |
| NVIDIA build.nvidia.com | Chưa có câu chính thức. Chỉ có lời người dùng diễn đàn; trong OpenCode: "Trial use only". Giữ ở trạng thái **không dùng cho tới khi đọc được điều khoản** | [TK](https://forums.developer.nvidia.com/t/is-nim-free/369368) |
| Cohere trial | "evaluation keys (free but limited in usage)"; 1 000 lượt/tháng | [CT](https://docs.cohere.com/docs/rate-limits) |
| Mistral | "Free mode … doesn't include API access" | [CT](https://docs.mistral.ai/admin/billing-usage/usage-limits) |
| OpenRouter `:free` làm tầng chính | "usually not suitable for production use" (chỉ nên làm tầng cuối) | [CT](https://openrouter.ai/docs/faq) |
| **Gemini (mọi gói) với app cho người <18** | "likely to be accessed by individuals under the age of 18"; EEA/UK/CH chỉ gói trả phí | [CT](https://aistudio.google.com/docs/terms) |

---

## 6. Ước tính lượt/ngày nếu xếp tầng (phép tính của tôi)

Giả định như DE-XUAT 3.3: một người hoạt động/ngày ≈ 10 lượt chat + 4 câu STT + 1 ảnh.

| Tầng | Lượt chat/ngày | Người hoạt động/ngày tương đương |
|---|---|---|
| Gemini free (flash-lite) | **[?]** chưa biết RPD | [?] |
| Gemma qua AI Studio | ~14 400 nếu số diễn đàn đúng [?] | ~1 400 [?] chưa chính thức |
| Cloudflare 10 000 Neurons/ngày | ~260 lượt (≈ 26 người, theo DE-XUAT) | ~26 |
| Groq free | [?] (nếu như 1 000 RPD) | ≤ 100 |
| OpenRouter `:free` | 50 (hoặc 1 000 nếu nạp ≥ 10 credit) | 5 (hoặc 100) |
| Zhipu GLM-Flash | [?] | [?] |
| **Cộng các số đã biết (Cloudflare + Groq + OpenRouter, không Gemini/Gemma)** | ~1 300 | **~130** (≈ 230 nếu OpenRouter đã nạp ≥ 10 credit) |

Mọi số "≤" là **trần** nếu tầng đó đạt đúng hạn mức và model trả lời tốt. STT dùng tầng riêng (Groq Whisper và Cloudflare Whisper), vision chỉ có Cloudflare nên là cổ chai (~100 ảnh/ngày nếu dành hết Neurons cho ảnh [?] chưa tính). **Nếu Gemma RPD đúng 14 400 thì Gemma là tầng lớn nhất**, nhưng đó là số chưa chính thức: ưu tiên đo.

---

## 7. Khóa cần tạo và biến môi trường gợi ý (`~/.becutit/gateway.env`)

Tôi **không tạo tài khoản**. Cột "trang tạo khóa" lấy từ tài liệu nhà cung cấp; ô [?] là chưa đọc được đường dẫn chính xác.

| Nguồn | Biến môi trường gợi ý | Tạo khóa ở đâu | Ghi chú |
|---|---|---|---|
| Gemini (đã có) | `GEMINI_API_KEY` (tên hiện tại theo code) | aistudio.google.com | Gemma dùng chung khóa |
| Cloudflare Workers AI | `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` | dash.cloudflare.com → AI → Workers AI (API token quyền Workers AI) [?] đường dẫn | Endpoint tương thích OpenAI `…/ai/v1` [?] chưa xác nhận |
| Groq | `GROQ_API_KEY` | console.groq.com/keys [?] | `https://api.groq.com/openai/v1` |
| OpenRouter (đã có) | `OPENROUTER_API_KEY` | openrouter.ai/keys | Nạp ≥ 10 credit để lên 1 000 RPD |
| Zhipu Z.ai | `ZAI_API_KEY` | docs.z.ai/guides/overview/quick-start (trang quản lý khóa) | Chỉ khi chấp nhận [?] điều khoản |

Gợi ý cấu hình chuỗi: `LLM_CHAIN=gemini,gemma,cloudflare,groq,openrouter`, `STT_CHAIN=gemini,groq,cloudflare`, `VISION_CHAIN=gemini,cloudflare`. (Tên chuỗi khớp ý tưởng `LLM_CHAIN` trong DE-XUAT 3.2; chưa có trong code.)

---

## 8. Giới hạn của tài liệu này

- Nhiều trang là trang JS (Pollinations, LLM7, Hyperbolic, BigModel) hoặc 404 nên đọc không hết; dòng nào ghi [?] nghĩa là chưa biết, không phải "không có".
- Trang giá Gemini bị cắt giữa chừng; các dòng Flash-Lite 3.1, 2.5 và Gemma 4 là từ phần tóm tắt tự động, **cần xác nhận ở AI Studio**.
- Mọi nhận định "dùng được" chỉ là "không thấy câu cấm", **không phải ý kiến pháp lý**, nhất là với app trẻ em.
- Không đo chất lượng tiếng Việt hay độ trễ nào.
