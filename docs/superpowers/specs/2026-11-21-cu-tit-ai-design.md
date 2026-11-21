# Thiết kế dự án 2 — Cu Tít AI (chat kiểu Messenger, gọi thường/gọi video, tình huống cuối unit)

> Ngày: 2026-11-21 · Trạng thái: **chờ người dùng duyệt** · Nguồn: `docs/nhat-ky/GOP-Y-20-11.md` (góp ý số 6), `docs/thiet-ke/KHAO-SAT-AI.md`, `docs/thiet-ke/DE-XUAT-AI-THAY-THE.md`, `docs/van-hanh/AI-CHUOI-DU-PHONG.md` (nhánh `claude/gateway-ai-du-phong-79bacc`).
> Phụ thuộc: dự án 1 (bong bóng Cu Tít, `CuTit`, `@vietlearning/ui`, điều phối âm thanh) đã/đang gộp vào `claude/app-improvement-feedback-a500bb`.

## 1. Mục đích và lý do

Góp ý số 6: người dùng không biết AI **miễn phí hay trả phí**, và không phân biệt được **chat AI, camera AI, "live AI"**. Khảo sát tìm ra 16 điểm gây bối rối (`KHAO-SAT-AI.md` mục 5). Bốn năng lực AI hiện nằm rải ở `/hoi-thoai`, `/nhap-vai`, `/goi-thoai`, `/camera`; dự án 1 mới gom tạm bằng một thanh đổi chế độ (`CuTitModeBar`).

Mục tiêu: **một chỗ duy nhất để nói chuyện với Cu Tít, quen thuộc như chat với bạn bè** — mỗi biểu tượng quen thuộc là một năng lực AI; người dùng luôn biết còn bao nhiêu lượt, AI đang làm gì, và vì sao không trả lời.

**Thành công nghĩa là:** người mới mở bong bóng hiểu ngay cách gõ, nói, chụp ảnh, gọi; không bao giờ tưởng app bị đơ khi chờ AI; phân biệt được "Cu Tít bận" với "hết lượt hôm nay"; mỗi lượt AI chờ ≤ ~2 giây trong điều kiện bình thường.

## 2. Mục tiêu / không làm / phản mục tiêu

**Mục tiêu**
- Màn chat Cu Tít kiểu Messenger thay `CuTitModeBar`: chat chữ, tin nhắn giọng nói, chụp ảnh nhận dạng, gọi thường, gọi video.
- **Gọi video với Cu Tít** (mới): theo lượt; mỗi lượt nói kèm một khung hình camera.
- **Tình huống (nhập vai) chuyển ra cuối unit**: kịch bản rẽ nhánh không cần AI + nút "Luyện với Cu Tít" mở chat AI theo tình huống đó.
- Sửa đủ 16 điểm bối rối (bảng mục 6) ở phần giao diện; phần Gateway đã có ở nhánh `gateway-ai-du-phong`.
- Gộp nhánh Gateway AI (sau khi `kien-truc` xem lại) và chốt chuỗi nhà cung cấp.
- Cập nhật chính sách quyền riêng tư + hộp đồng ý: dữ liệu chữ/giọng/ảnh gửi tới nhà cung cấp AI nào.

**Không làm**
- Gọi/chat **thời gian thực giữa người với người** (dự án 4; cần WebRTC + máy chủ TURN).
- Gọi AI thời gian thực kiểu Live API (nói chen, video liên tục) — để cho gói trả phí sau này.
- Gói đăng ký/trả phí (dự án 6). Ở dự án này chỉ ghi nhãn "Miễn phí trong thời gian đầu".
- Đăng nhập Google (dự án 3).

**Phản mục tiêu**
- AI trả lời mẫu mà người dùng tưởng là AI thật.
- Trừ lượt khi AI lỗi.
- Nhạc nền/âm hiệu ứng lẫn vào lúc thu âm hoặc lúc gọi.
- Gửi ảnh/giọng khi người dùng chưa đồng ý, hoặc đồng ý mà không biết gửi đi đâu.
- MFE import chéo MFE (`pnpm lint:boundaries`).
- Chuỗi giao diện chỉ một ngôn ngữ.

## 3. Ràng buộc

- 7 nguyên tắc `AGENTS.md` (đặc biệt 1 API-first, 2 không key ở client, 4 adapter, 6 JSON + Zod ở Gateway, 7 không import chéo MFE).
- Người dùng đã quyết (20/11): dùng **xếp tầng API miễn phí**, cho phép gửi **cả giọng nói và ảnh** qua API miễn phí, chấp nhận rủi ro dữ liệu (Luật 91/2025); trẻ em dùng app như mọi người (D4).
- Số đo thật (20/11): Groq `qwen/qwen3.8-27b` chat 0,7–0,9 s, điểm chấm tiếng Việt 75/100 (Gemini 88); Groq Whisper STT ~1 s; Gemini 1–7 s, đôi khi timeout; **Groq free chỉ 8 000 token/phút cho cả app** (prompt gia sư ≈ 3 000 token) ⇒ chuỗi phải có nguồn kế và trần toàn cục.
- Gói đầu ≤ 67,5 kB; màn mới lazy.

## 4. Các phương án đã cân nhắc

| Quyết định | Phương án | Chọn | Lý do |
|---|---|---|---|
| "Live AI" | A theo lượt, chờ 1–2 s · B thời gian thực (Live API) | **A** | Miễn phí, làm ngay; thời gian thực chỉ cần cho người với người (dự án 4). |
| Gọi | chỉ gọi thường · gọi thường + gọi video | **cả hai** | Người dùng yêu cầu; video theo lượt (một khung hình mỗi lượt). |
| Bố cục bong bóng | thanh 4 chế độ · **chat kiểu Messenger** (📷 🎤 ở ô soạn, 📞 📹 trên đầu) | **Messenger** | Ai cũng quen; dùng chung khung với chat bạn bè ở dự án 4. |
| Tình huống | giữ AI · kịch bản không AI · **kết hợp** | **Kết hợp** | Cuối unit chạy offline, không tốn lượt, chấm bằng luật A6; nút "Luyện với Cu Tít" cho ai muốn tự do. |
| Cấu trúc mã | **A mở rộng `mfe-conversation`** + chụp ảnh xuống `packages/native` · B MFE mới `mfe-cutit` · C host dựng khung | **A** | Đúng Nguyên tắc 7 và người sở hữu; ít di chuyển code. B di chuyển nhiều, lệch TDD; C trái Nguyên tắc 7. |

## 5. Thiết kế đã chốt

### 5.1 Màn chat Cu Tít (`/hoi-thoai`, thuộc `mfe-conversation`)
```
┌──────────────────────────────────┐
│ ←  (Cu Tít) Bé Cu Tít       📞  📹 │  gọi thường · gọi video
│    Còn 42 lượt hôm nay · Miễn phí   │
├──────────────────────────────────┤
│   Cu Tít: Chào bạn! …               │
│                    Bạn: Con chào…   │
│   Cu Tít: ▶ ━━━━ 0:04  (giọng đọc)  │
│                 Bạn: [ảnh quả cam]  │
│   Cu Tít: Đây là "quả cam" …        │
├──────────────────────────────────┤
│ 📷  [ Nhắn cho Cu Tít…      ]  🎤  │  chụp ảnh · gõ · giữ để nói
└──────────────────────────────────┘
```
- Đầu màn: `CuTit mood="chan-dung"` (đổi `suy-nghi` khi chờ AI), tên, dòng phụ "Còn N lượt hôm nay · Miễn phí trong thời gian đầu" (N từ `remaining.turns`; ≤ 5 đổi màu nhẹ), nút 📞 gọi thường, 📹 gọi video, nút quay lại.
- Ô soạn: 📷 chụp ảnh ⇒ ảnh hiện thành tin của người dùng, Cu Tít trả lời từ vựng/ví dụ (VISION_CHAIN); 🎤 **giữ để nói** ⇒ tin giọng nói (STT_CHAIN) hiện kèm bản chép lời, đếm ngược từ giây 10, cắt ở 15 s kèm câu giải thích; gõ chữ như hiện tại.
- Tin của Cu Tít có nút ▶ nghe lại (TTS máy / âm dựng sẵn), `playSfx('cutit-noi')` trước khi nói.
- `CuTitModeBar` của dự án 1 **bị gỡ**; route `/nhap-vai`, `/camera` vẫn chạy (link cũ), nhưng lối vào chính là màn chat.
- Phát `cutit:thinking` (bus) khi chờ AI để bong bóng đổi trạng thái (đã có ở dự án 1).

### 5.2 Gọi thường và gọi video (`/goi-thoai?video=0|1`)
- **Gọi thường**: giữ máy trạng thái hiện có (`callMachine`), thêm chỉ báo rõ từng bước "Cu Tít đang nghe… đang nghĩ… đang nói…" + `CuTit` mood tương ứng (`nghe`/`suy-nghi`/`noi`), âm "ừm" ngắn khi chờ quá 1,2 s.
- **Gọi video**: màn chia đôi — Cu Tít (ảnh động theo mood) phía trên, khung camera người dùng (xem trước) phía dưới. **Mỗi lượt nói**, khi người dùng dừng nói, app chụp một khung hình (JPEG nén ≤ ~100 KB, cạnh dài ≤ 768 px) gửi cùng bản chép lời trong một lượt AI có ảnh. Không gửi video liên tục. Tắt camera giữa chừng ⇒ tiếp tục như gọi thường.
- Hạn mức: lượt gọi video tính thêm `visionImages` (đã có trong `remaining`); màn gọi hiện "Còn N lượt".
- Điều phối âm thanh: cả cuộc gọi là `acquireAudio('call')` (đã có).

### 5.3 Chụp ảnh dùng chung (`packages/native`)
- Chuyển phần mở camera/chụp/nén khỏi `apps/mfe-vision/src/camera` sang `packages/native/src/camera.ts` (Capacitor Camera trên Android, `getUserMedia` trên web), API: chụp một ảnh, mở/đóng luồng xem trước, chụp khung từ luồng xem trước. `mfe-vision` (màn AR, vào từ Luyện tập) và `mfe-conversation` đều dùng nó.

### 5.4 Tình huống cuối unit (`mfe-path` + `packages/exercises`)
- Bộ chạy kịch bản rẽ nhánh trong `packages/exercises`: dữ liệu từ `packages/content/src/scenarios` (mở rộng thêm nút thoại có sẵn câu Cu Tít, các lựa chọn của người học, nhánh tiếp theo, câu mẫu đúng xưng hô). Người học **chọn** câu hoặc **nói** câu (so khớp bằng STT trên máy nếu có, không thì chọn). Chấm xưng hô bằng luật A6 trong `packages/content/src/honorifics`; chấm đạt mục tiêu khi tới nút kết thúc tốt.
- Mỗi unit có ≥ 1 tình huống ở cuối; xong ⇒ phản hồi như bài học (`hoan-thanh`, `an-mung`), cộng XP như bài thường.
- Nút **"Luyện với Cu Tít"** ⇒ điều hướng `/hoi-thoai?tinh-huong=<id>`; màn chat mở với system prompt nhập vai của tình huống đó (Gateway đã nhận `scenarioId`), có dải nhỏ "Đang luyện: Gọi phở" và nút thoát về chat thường.
- Nội dung kịch bản do AI soạn nháp, gắn `reviewed:false` tới khi người duyệt (quy trình `docs/nhat-ky/DUYET-NOI-DUNG.md`).

### 5.5 Chuỗi nhà cung cấp (Gateway, cấu hình env)
`LLM_CHAIN=groq:qwen/qwen3.8-27b,gemini` (gpt-oss chỉ thêm khi qua bộ chấm), `STT_CHAIN=groq:whisper-large-v3-turbo,gemini`, `VISION_CHAIN=gemini,<nguồn vision free khác khi có>`. Trần toàn cục đặt theo hạn mức free thật của nguồn rẻ nhất (Groq 8 000 token/phút). Có thêm khóa (Cloudflare, Nous, OpenRouter nạp $10) thì chèn vào chuỗi sau khi chạy `eval:llm` đạt.

### 5.6 Quyền riêng tư và đồng ý
- Một hộp **"Quyền khi nói chuyện với Cu Tít"** lần đầu dùng bất kỳ năng lực có micro/camera: liệt kê dữ liệu (chữ, giọng nói, ảnh/khung hình khi gọi video) + **tên nhà cung cấp AI** (Google Gemini, Groq, …) + có thể bị dùng để cải thiện dịch vụ của họ; hai công tắc micro/camera; quyền hệ điều hành vẫn hỏi lúc dùng lần đầu. Rút lại ở Cài đặt › Quyền riêng tư (đã có).
- Cập nhật `/quyen-rieng-tu` (song ngữ) và `docs/phap-ly/DATA-SAFETY.md`, `DANH-GIA-TAC-DONG.md` cho các nhà cung cấp mới.

## 6. 16 điểm bối rối ⇒ cách xử lý trong dự án này

| # | Điểm (`KHAO-SAT-AI.md` mục 5) | Xử lý |
|---|---|---|
| 1 | Không nói miễn phí/trả phí | Dòng phụ đầu chat "Miễn phí trong thời gian đầu"; một câu trong hộp đồng ý |
| 2 | Không thấy lượt còn lại | "Còn N lượt hôm nay" đầu chat + màn gọi (từ `remaining`) |
| 3 | Hai loại hạn mức song song | Hiển thị một con số "lượt"; khi token/giây nói sắp hết mới nói bằng lời |
| 4 | Gọi thoại mỗi câu 1 lượt | Màn gọi ghi rõ "mỗi câu nói = 1 lượt", hiện lượt còn lại |
| 5 | Reset theo UTC | Gateway đã đổi sang 00:00 giờ VN; giao diện ghi "Lượt mới lúc 0 giờ" |
| 6 | "Bận" giống "hết lượt" | `llm_busy` ⇒ "Cu Tít đang bận, thử lại sau ít giây" + nút Thử lại, không trừ lượt; `quota_exceeded` ⇒ "Hết lượt hôm nay, có lượt mới lúc 0 giờ"; `scope:global` ⇒ "Hôm nay nhiều bạn học quá, Cu Tít nghỉ một chút" |
| 7 | Gọi thoại có khoảng lặng | Chỉ báo từng bước + mood + âm "ừm" (5.2) |
| 8 | Giọng khác nhau theo máy | Nội dung khóa học dùng âm dựng sẵn; lời Cu Tít dùng TTS máy, chọn giọng ở Cài đặt |
| 9 | Nhãn "trả lời mẫu" dễ bỏ qua | Chế độ mẫu (chỉ khi chưa cấu hình AI) hiện dải cố định trên đầu chat |
| 10, 11 | Hộp đồng ý micro/camera rời rạc | Gộp thành một hộp (5.6) |
| 12 | Cắt 15 s không rõ lý do | Đếm ngược từ giây 10 + câu giải thích |
| 13 | Máy không thu âm được | Giữ thông báo, nút "Gõ chữ" nổi bật |
| 14 | Từ chối quyền vĩnh viễn | Giữ nút mở Cài đặt máy, thêm hướng dẫn 2 bước |
| 15 | Rút đồng ý | Đã có (Cài đặt › Quyền riêng tư) — kiểm lại phủ cả camera trong gọi video |
| 16 | Bản release chặn HTTP | Thêm bước vào checklist phát hành: build release trỏ `https://`, thử 1 lượt chat; lỗi kết nối hiện "Không kết nối được máy chủ" riêng |
| + | Camera chưa báo 429 thân thiện | Dùng chung bộ thông báo lỗi của mục 6 |

## 7. Quyết định bổ sung sau khi người đọc độc lập rà (đánh dấu **[Claude quyết]** — người dùng xem lại)

1. **Lượt gọi video [Claude quyết]:** contract trước — thêm trường tùy chọn `imageBase64` (JPEG, ≤ 150 KB sau base64) vào `VoiceTurnRequestSchema` của `/chat/turn`. Lượt có ảnh đi **`VISION_CHAIN`**, lượt không ảnh đi `LLM_CHAIN`. PromptBuilder thêm đoạn "người học đang cho bạn xem hình này". Groq hiện **không có model nhận ảnh** trong gói free ⇒ lượt gọi video sẽ chậm hơn (thường 2–7 s qua Gemini) cho tới khi có nguồn vision nhanh; màn gọi video hiện chỉ báo "Cu Tít đang xem…". Không chọn cách "gắn nhãn từ `/vision/label` vào câu" vì Cu Tít chỉ "thấy" một từ.
2. **Đếm lượt [Claude quyết]:** con số hiển thị = `remaining.turns`. Tin giọng nói = **1 lượt** (giây STT tính ngầm); lượt gọi video = **1 lượt + 1 ảnh**; chụp ảnh trong chat = 1 lượt + 1 ảnh. Khi `sttSeconds` hoặc `visionImages` hết trước `turns`: tắt nút 🎤 / 📷 / 📹 tương ứng, chú thích "Hết lượt nói/ảnh hôm nay, vẫn gõ chữ được". Chặn trước khi gửi dựa trên `remaining` lần trả lời gần nhất; Gateway vẫn là nơi quyết.
3. **Lịch sử chat [Claude quyết]:** lưu **chữ** của 50 tin gần nhất **trên máy** (`packages/state`, slice cục bộ, **không đồng bộ**), xóa khi xóa tài khoản/đăng xuất và có nút "Xóa cuộc trò chuyện". **Không lưu ảnh và âm thanh** — mở lại chỉ còn ô "Ảnh đã gửi"/"Tin giọng nói" + bản chép lời. Lý do: tránh lưu dữ liệu nhạy cảm của người dùng (có trẻ em), không phải sửa `/v1/sync`, DATA-SAFETY đơn giản. Chat bạn bè (dự án 4) sẽ có thiết kế lưu trữ riêng.
4. **▶ nghe lại [Claude quyết]:** tin của Cu Tít chỉ có nút ▶ đọc bằng TTS máy (không thanh thời gian). Sơ đồ mục 5.1 dòng "▶ ━━━━ 0:04" được hiểu là tin giọng nói **của người dùng** (có thời lượng thật từ bản ghi).
5. **Đồng ý [Claude quyết]:** hộp mới dùng hai khóa `consents.voice` và `consents.camera` sẵn có (không tạo khóa mới, không đổi state/sync), thêm `consents.aiProvidersVersion`. Vì danh sách nhà cung cấp đổi (thêm Groq…), **mọi người dùng thấy hộp mới một lần** khi mở Cu Tít (đổi nơi nhận dữ liệu thì phải hỏi lại); người đã đồng ý cũ thấy công tắc bật sẵn theo lựa chọn cũ nhưng phải bấm xác nhận.
6. **Nội dung tình huống [Claude quyết]:** bản phát hành **chỉ hiện kịch bản `reviewed:true`**; unit chưa có kịch bản đã duyệt thì **không có bước tình huống** (không khóa tiến độ). Mục tiêu nội dung: 1 kịch bản/unit cho các unit hiện có, AI soạn nháp, người dùng duyệt theo quy trình `DUYET-NOI-DUNG.md`. Kịch bản rẽ nhánh mới có `aiScenarioId` trỏ tới id cũ (`sc1`…) để nút "Luyện với Cu Tít" dùng lại prompt nhập vai Gateway đã có; không xóa định dạng cũ.
7. **Tốc độ và trần [Claude quyết]:** tiêu chí "≤ ~2 s" áp cho lượt chữ/giọng khi nguồn đầu chuỗi (Groq) còn hạn mức; lượt rơi sang Gemini và lượt có ảnh được phép tới ~8 s kèm chỉ báo. Thêm **prompt gọn cho chế độ gọi** (mục tiêu ≤ 1 200 token) để Groq gánh được nhiều lượt hơn. Trần toàn cục mặc định bản phát hành: giữ giá trị nhánh Gateway (`GLOBAL_MAX_TURNS_PER_DAY=2000`, `…_STT_SECONDS=28800`, `…_VISION=500`) và ghi trong tài liệu vận hành cách chỉnh theo hạn mức thật.
8. **Ngưỡng đưa nguồn mới vào chuỗi [Claude quyết]:** `eval:llm` điểm ≥ 75 **và** JSON đúng ≥ 23/24 **và** độ trễ trung vị ≤ 2 s. Không phải điều kiện gộp nhánh Gateway (nhánh gộp với chuỗi Groq qwen → Gemini đã đo).

## 8. Để lại cho người làm quyết
- Cấu trúc component trong `mfe-conversation` (tách `ChatScreen` thành header/list/composer…).
- Cách nén ảnh cụ thể, ngưỡng phát hiện dừng nói (đã có `silenceDetector`).
- Định dạng dữ liệu kịch bản rẽ nhánh (miễn đọc được bằng luật A6 và soạn được bằng tay).
- Cách hiển thị tin giọng nói (sóng âm hay thanh thời gian).

## 9. Kiểm chứng khi làm
Unit test từng phần (bộ chạy kịch bản, thông báo lỗi theo mã, đếm ngược, gửi khung hình); `pnpm build`, `pnpm test`, `pnpm lint:boundaries`, size; e2e: chat chữ/giọng/ảnh, gọi thường, gọi video (camera giả của Playwright), tình huống cuối unit + nút luyện AI, `llm_busy` và `quota_exceeded` hiện đúng câu; chạy thật với Groq (`apps/gateway/scripts/ai-chat-smoke.mjs`); AVD: gọi video thật với camera giả của emulator, nhạc nền dừng khi gọi; `kien-truc` xem lại nhánh Gateway trước khi gộp; skill `kiem-truoc-khi-gop`.
