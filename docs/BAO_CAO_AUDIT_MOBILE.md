# Báo cáo kiểm tra toàn diện & đề xuất tối ưu hiệu năng mobile

> Nhánh: `claude/mobile-optimization-review-6ef57e` · Ngày: 2026-11-15
> Ảnh chụp tình trạng repo TRƯỚC khi chuyển đổi (chưa sửa dòng mã nào lúc viết). Tiến độ xử lý từng mục: xem `docs/NHAT_KY_CHUYEN_DOI_MOBILE.md`.
>
> **Mức bằng chứng của mỗi phát hiện:** 🟢 **đã chạy** (tôi chạy thử và thấy tận mắt) · 🔵 **đọc code** (suy ra từ mã nguồn, chưa chạy) · 🟡 **cần thử trên thiết bị thật**

---

## 0. Tóm tắt (5 dòng)

1. `pnpm install`, `pnpm build` (14/14 task) và `pnpm test` đều qua 🟢. Riêng test thì chỉ `packages/content` có bài kiểm tra, các package còn lại chưa có bài nào.
2. **Chỉ màn hình M3 (Ma trận xưng hô) là đã làm thật.** 5 MFE còn lại chỉ là placeholder 10 dòng. Toàn bộ Gateway trả dữ liệu mock, YIN/DTW/Strategy/Bridge mới là khung hoặc trả số giả.
3. **Module Federation chưa hề tồn tại.** Host import thẳng `@vietlearning/mfe-knowledge` qua `workspace:*` và không có plugin federation nào, vậy mà giao diện vẫn ghi "Nạp động Remote".
4. **Chưa có gì của PWA:** không manifest, không service worker, không theme-color. Trong khi TDD §4.3 coi PWA là trụ cột của chiến lược mobile.
5. Gateway có lỗ hổng thật: CORS phản chiếu mọi origin, không có xác thực, request rỗng vẫn trả 200, và `.env` không bao giờ được nạp.

=> "Chuyển sang hiệu năng tốt nhất cho mobile" hiện **chưa phải bài toán tối ưu**. Đây là bài toán **dựng đúng nền tảng mobile ngay từ đầu**, trước khi 5 MFE còn lại được viết theo khuôn sai.

---

## 1. Danh sách lỗ hổng / lỗi

### P0 — Bảo mật & tính đúng đắn (phải sửa trước)

| # | Vấn đề | Vị trí | Bằng chứng |
|---|---|---|---|
| 1 | **CORS `origin: true` phản chiếu mọi origin.** Gửi thử `Origin: https://evil.example` thì nhận về `access-control-allow-origin: https://evil.example`. Biến `CORS_ORIGIN` trong `.env` không được dùng tới. | `apps/gateway/src/index.ts:12` | 🟢 |
| 2 | **`dotenv` không bao giờ được import.** Lệnh `cp .env.example apps/gateway/.env` trong README vì vậy không có tác dụng gì. | `apps/gateway/src/index.ts` | 🔵 |
| 3 | **Không có xác thực và quota.** `RequestPipeline.process()` chỉ là hàm rỗng. Khi nối API trả phí (STT/TTS/LLM), bất kỳ ai cũng gọi được và đốt tiền. | `pipeline/RequestPipeline.ts` | 🔵 |
| 4 | **Không kiểm tra đầu vào.** `POST /v1/speech/tts` với body `{}` vẫn trả 200, vì kết quả `safeParse` bị bỏ qua. `practice.ts` import schema nhưng không dùng. Vi phạm nguyên tắc 5 và 6. | `routes/speech.ts`, `routes/practice.ts` | 🟢 |
| 5 | **Response lệch contract.** `VoiceTurnResponseSchema.turnId` yêu cầu uuid, nhưng mock trả `'mock-turn-…'`. Response không được validate. | `routes/chat.ts` | 🔵 |
| 6 | **Khóa cache TTS bị trùng.** `hex(text).slice(0,8)` chỉ lấy 4 byte UTF-8 đầu, nên "Chào bạn…" và "Chào em…" ra cùng một URL âm thanh. | `cache/TTSCacheProxy.ts` | 🔵 |
| 7 | **`SanitizerVisitor` rỗng.** Nếu UI Block của agent đi qua nó (đúng như thiết kế), đây là lỗ XSS chờ sẵn. | `host-shell/src/protocol/BlockVisitor.ts` | 🔵 |
| 8 | **Rate limit lưu trong RAM theo IP.** Không chia sẻ được giữa các instance. Người dùng mobile sau NAT của nhà mạng dùng chung IP nên sẽ chặn lẫn nhau. | `index.ts:13` | 🔵 |
| 9 | Script `dev` của gateway dùng `ts-node/esm`, nhưng `ts-node` không có trong dependencies. | `apps/gateway/package.json` | 🔵 |

### P1 — Lỗi chức năng & hiệu năng mobile

| # | Vấn đề | Vị trí | Bằng chứng |
|---|---|---|---|
| 10 | **Race condition khi phát âm.** `speak()` gọi `stop()` → `cancel()`, và Chrome bắn `onerror` (interrupted) cho utterance cũ. Lỗi này kích hoạt `speakViaGateway(câu cũ)`, rồi `onEnd` của câu cũ reset trạng thái của câu mới. | `services/speechSynthesis.ts` | 🔵 / 🟡 |
| 11 | `getVoices()` được đọc đồng bộ nên lần đầu thường trả mảng rỗng: không có giọng `vi` và có thể đọc bằng giọng tiếng Anh. Nhánh gateway không bao giờ gọi `onError`. Nhánh cuối cùng **giả vờ đọc 1.2 giây**, nên người dùng không biết là đã lỗi. | như trên | 🔵 |
| 12 | **Android WebView (Capacitor) có thể không có `speechSynthesis`**, tức là mất luôn đường TTS chính trên app store. | — | 🟡 |
| 13 | `audio.vietlearning.app` không phân giải được DNS (curl trả về mã 000), nên đường TTS dự phòng chắc chắn hỏng. | gateway mock | 🟢 |
| 14 | **Đổi theme làm mất toàn bộ state.** `key={theme}` khiến màn hình bị remount. Ngoài ra có 2 state theme không đồng bộ (của simulator và của screen). | `mfe-knowledge/src/App.tsx` | 🔵 |
| 15 | **Hơn 1.200 dòng inline style, màu tính lại mỗi lần render.** Đổi theme phải re-render cả cây, không có CSS variables, không dùng `packages/ui/tokens`. | `HonorificMatrixScreen.tsx` | 🔵 |
| 16 | **Font chặn render.** MFE tải 13 biến thể (weight và italic) của Be Vietnam Pro từ Google Fonts. Host thì không tải font nào nhưng vẫn khai báo font đó. | `index.html` | 🔵 |
| 17 | `index.html` của host dùng class Tailwind (`bg-slate-50`) nhưng chưa cài Tailwind. | `host-shell/index.html` | 🔵 |
| 18 | **YIN có độ phức tạp O(N²) và chỉ trả một giá trị F0 cho cả buffer.** Không chia frame nên không ra được contour. Nếu chạy trên main thread cho cả câu nói, điện thoại sẽ đơ. TDD yêu cầu chạy trong Web Worker nhưng mã chưa làm. | `audio-dsp/src/pitch/yin.ts` | 🔵 |
| 19 | **DTW so sánh trực tiếp Hz**, không chuẩn hóa semitone theo trung bình. Giọng nam và giọng nữ vì vậy bị chấm điểm khác nhau. Pearson (theo spec A2) chưa có. | `audio-dsp/src/pitch/dtw.ts` | 🔵 |
| 20 | **Audio gửi dạng base64 trong JSON**, tốn thêm khoảng 33% dữ liệu di động. WAV 16kHz dài khoảng 30 giây sẽ vượt `bodyLimit` 1MB mặc định của Fastify. | `contracts/api/chat.ts` | 🔵 |
| 21 | **Mỗi MFE tự đóng gói React riêng** (khoảng 46KB gzip, kể cả MFE rỗng). Nếu ghép runtime mà không cấu hình `shared` thì sẽ có 7 bản React. EventBus "Singleton" cũng sẽ thành nhiều bản. | build output | 🟢 |

### P2 — UX mobile, a11y, dữ liệu

| # | Vấn đề | Bằng chứng |
|---|---|---|
| 22 | Nút bấm cao khoảng 22–28px (tốc độ, bậc tuổi, giới tính), dưới mức tối thiểu 44pt (iOS) / 48dp (Android). | 🔵 |
| 23 | Nhiều chữ chỉ 0.68–0.72rem (khoảng 11px), khó đọc với chữ có dấu chồng như "ễ", "ự". | 🔵 |
| 24 | Ô tìm kiếm trong drawer có `fontSize: 0.86rem` (dưới 16px), nên **iOS Safari tự zoom khi focus**. | 🔵 |
| 25 | Dùng `100vh` thay vì `100dvh`, nên trên iOS layout bị nhảy theo thanh địa chỉ. Không có `env(safe-area-inset-*)` cho tai thỏ và home bar. | 🔵 |
| 26 | Lưới `minmax(320px,1fr)` cộng padding sẽ tràn ngang trên màn hình 320px. | 🔵 |
| 27 | Drawer: không khóa cuộn nền, không đóng bằng Esc, không có `role="dialog"`, không focus trap. Toàn bộ dự án có **0 thuộc tính `aria-*`/`role`**. | 🟢 (grep) |
| 28 | `backdropFilter: blur(6px)` phủ toàn màn hình, rất nặng trên Android tầm thấp. | 🟡 |
| 29 | Drawer `position: fixed` nằm trong khung simulator `overflow:hidden` nên thoát ra ngoài khung điện thoại giả lập. | 🔵 |
| 30 | `packages/content/data/*.json` **không được dùng**. 20 cặp xưng hô bị hardcode trong TS, nên hai nguồn sẽ lệch nhau. | 🟢 (grep) |
| 31 | **Sai dữ liệu A7:** `{ north: 'muỗng', central: 'thìa' }` bị ngược. Miền Bắc dùng "thìa", miền Nam dùng "muỗng". | 🔵 |
| 32 | Danh mục drawer dùng `'civic'` còn nút quan hệ dùng `'work'`, hai khái niệm lệch nhau. | 🔵 |
| 33 | Host truyền `onPairChange` dạng arrow inline nên effect chạy lại sau mỗi render (không lặp vô hạn, chỉ thừa render). | 🔵 |
| 34 | `packages/ui` khai báo `clsx`, `tailwind-merge` nhưng không dùng, và thiếu `react` trong peerDependencies. | 🔵 |

---

## 2. Phản biện (những chỗ tôi không đồng ý)

**① Đừng dùng Module Federation runtime cho bản mobile.** Đây là điểm quan trọng nhất.
MF runtime bắt app tải `remoteEntry.js` của từng remote khi chạy. Trên 4G, việc này tạo ra waterfall request, dễ bị trùng React, và **phá vỡ offline/Capacitor**, vì app trong store phải đóng gói sẵn mọi thứ, không thể tải remote từ CDN. Chính TDD cũng đặt mục tiêu LCP ≤ 2.5 giây trên 4G, và MF runtime đi ngược mục tiêu đó.
**Đề xuất:** ghép lúc build (build-time composition). Giữ mỗi MFE là một package độc lập, host dùng `React.lazy()` theo route nên vẫn code-split. Ép quy tắc "không import chéo" bằng `dependency-cruiser` hoặc `eslint-plugin-boundaries`. Bạn vẫn giữ được ranh giới sở hữu của 5 thành viên, chỉ không phải trả chi phí runtime.
Vì TDD bắt buộc MF, có một phương án dung hòa: **MF thật cho bản web demo** (để chấm điểm kiến trúc), **build-time cho bản PWA/Capacitor**. Quyết định này thuộc về bạn và nhóm.

**② 23 mẫu GoF phần lớn là vỏ rỗng.** Mediator, Visitor, Composite, Chain, Strategy, Bridge, Abstract Factory… hầu hết chỉ là `console.log` hoặc hàm trống. Với nhóm 5 người làm trong 8 tuần, đây là over-engineering, làm tăng code mà không thêm tính năng. Nên giữ những mẫu có hành vi thật (Interpreter A6, Observer/EventBus, Memento, State) và bỏ những mẫu chỉ để "đủ số".

**③ "Hiệu năng tốt nhất" không có nghĩa là viết lại bằng React Native/Flutter.** TDD R7 đã loại phương án này, và tôi đồng ý. Điểm nghẽn hiện tại không nằm ở React hay native, mà ở font, việc không có cache, DSP sắp chạy trên main thread, và định dạng payload. Viết lại sẽ tốn vài tuần mà không giải quyết được gốc vấn đề.

**④ Khung "điện thoại giả lập" trên desktop không phải là kiểm thử mobile.** Nó không mô phỏng được CPU yếu, touch, bàn phím ảo, safe area hay iOS zoom. Thay bằng Playwright device emulation kèm giả lập CPU chậm, và debug từ xa trên máy thật (Chrome `chrome://inspect`, Safari Web Inspector).

---

## 3. Kế hoạch chuyển đổi theo giai đoạn

### Giai đoạn 0: Vá P0 (khoảng 1 ngày)
- Nạp `dotenv`. Đổi CORS sang danh sách cho phép đọc từ `CORS_ORIGIN`. Thêm `@fastify/helmet`.
- Bắt buộc dùng Zod cho cả request **và** response, tận dụng `fastify-type-provider-zod`.
- Xác thực JWT trong `RequestPipeline`. Đưa rate limit và quota lên Redis.
- Khóa cache TTS = `sha256(text|voice|speed|dialect)`.
- **Vì sao:** chi phí sửa nhỏ, nhưng nếu để nguyên thì việc nối API trả phí rất nguy hiểm.

### Giai đoạn 1: Nền tảng mobile shell (2–3 ngày)
- Host dùng React Router và `React.lazy` cho từng màn hình. Ghép MFE lúc build (chờ bạn quyết định ở mục ②.①).
- `vite-plugin-pwa`: manifest, icon, precache shell và nội dung tĩnh (20 cặp, phương ngữ, văn hóa đều dùng được offline). Thêm `theme-color`.
- Font: `@fontsource/be-vietnam-pro`, chỉ subset `vietnamese` + `latin`, 3–4 weight, `font-display: swap`, preload weight chính.
- Thẻ viewport với `viewport-fit=cover`, `100dvh`, safe-area insets.
- **Vì sao:** đây là nơi quyết định LCP, khả năng cài đặt và offline, nên phải xong trước khi 5 MFE kia được viết.

### Giai đoạn 2: Design system và refactor M3 (2–3 ngày)
- Dùng Tailwind v4 (đúng như TDD) với design token là CSS variables, chuyển theme bằng `data-theme`. Đổi theme khi đó **không cần re-render React** và bỏ được `key={theme}`.
- Tách `HonorificMatrixScreen` (1.233 dòng) thành các component nhỏ có memo. Kích thước chạm tối thiểu 44px, chữ tối thiểu 14px, ô nhập 16px.
- Drawer dùng Radix Dialog (có sẵn focus trap, Esc, scroll lock, aria). Thay blur bằng nền đục.
- Đưa 20 cặp về một nguồn duy nhất (JSON + Zod), sửa dữ liệu A7.
- Viết lại `SpeechService`: sửa race condition bằng token theo lượt phát, chờ sự kiện `voiceschanged`, báo lỗi thật (bỏ giả vờ đọc). Thêm adapter Capacitor TTS cho bản native.

### Giai đoạn 3: Audio/DSP chạy ngoài main thread (3–4 ngày, trước khi làm M2)
- Thu âm bằng AudioWorklet (PCM 16kHz). YIN chạy theo frame (khoảng 32ms, hop 10ms) trong Web Worker qua Comlink.
- DTW trên semitone đã trừ trung bình, có Sakoe-Chiba band, thêm Pearson.
- Upload audio dạng `multipart` hoặc binary (Opus/WebM khi có), bỏ base64. Nâng `bodyLimit` cho route âm thanh.
- **Vì sao:** đây là phần duy nhất thực sự nặng CPU trên điện thoại. TDD đặt mục tiêu F0 ≤ 1 giây cho đoạn 5 giây trên máy tầm trung.

### Giai đoạn 4: Đo lường và chặn hồi quy (1–2 ngày)
- Lighthouse CI (mobile, 4G chậm), budget LCP ≤ 2.5 giây. `size-limit` cho từng chunk.
- Playwright với các profile iPhone/Pixel và giả lập CPU chậm 4×. Kiểm tra trên máy thật trước khi đóng gói Capacitor.

---

## 4. Tech stack đề xuất (đều nằm trong khung TDD)

| Hạng mục | Giữ / Thêm / Bỏ | Lý do |
|---|---|---|
| React 18 + Vite + TS | **Giữ** | Đã chạy tốt, React 19 không cần thiết lúc này |
| Module Federation runtime | **Bỏ cho bản mobile** (chờ bạn quyết) | Waterfall, trùng React, phá offline |
| React Router + `React.lazy` | **Thêm** | Code-split theo màn hình |
| Tailwind v4 + CSS variables | **Thêm** (thay inline style) | Đổi theme không re-render, CSS nhỏ |
| Radix UI (Dialog, Slider, Toggle) | **Thêm** | A11y và touch có sẵn |
| TanStack Query + Zustand | **Thêm** (theo TDD) | Cache server state, dùng offline khi kết hợp persist |
| `vite-plugin-pwa` (Workbox) | **Thêm** | Cài đặt được, offline, precache nội dung |
| `@fontsource/be-vietnam-pro` | **Thêm** | Tự host font, subset tiếng Việt, không chặn render |
| Web Worker + Comlink, AudioWorklet | **Thêm** | DSP chạy ngoài main thread |
| Capacitor 6 + `@capacitor-community/text-to-speech` | **Thêm khi lên store** | Bổ sung TTS cho WebView |
| `@fastify/helmet`, `fastify-type-provider-zod`, `@fastify/jwt`, ioredis | **Thêm** (gateway) | Bảo mật và đảm bảo contract |
| `dependency-cruiser` | **Thêm** | Ép nguyên tắc 7 khi bỏ MF runtime |
| Lighthouse CI, `size-limit`, Playwright | **Thêm** | Đo đạc thay vì đoán |
| `clsx`/`tailwind-merge` trong `packages/ui` | Giữ khi đã có Tailwind, nếu không thì bỏ | Hiện chưa dùng |
| React Native / Flutter | **Không dùng** | TDD R7, và không giải quyết điểm nghẽn thật |

---

## 5. Những gì chưa kiểm chứng
- Các mục 🟡 (WebView TTS, chi phí blur, race condition trên Chrome mobile) cần thử trên máy thật.
- Chưa đo Lighthouse vì chưa có trang mobile hoàn chỉnh để đo.
- Chưa đọc phần mô phỏng trong `docs/interactive_architecture.html` hay các script Python trong `docs/` (không thuộc runtime của app).
