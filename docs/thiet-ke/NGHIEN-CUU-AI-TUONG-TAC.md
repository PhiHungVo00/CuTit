# Nghiên cứu: AI tương tác trong chat Cu Tít (khối bấm trong chat + Cu Tít chủ động)

> Ngày: 2026-11-21 · Trạng thái: **đề xuất, chờ người dùng duyệt** (chỉ nghiên cứu, chưa viết code) · Liên quan: dự án 2 (`docs/superpowers/specs/2026-11-21-cu-tit-ai-design.md`, `docs/superpowers/plans/2026-11-21-cu-tit-ai.md`).
> Phạm vi tra web: mô tả **mẫu thiết kế** chung; không sao chép giao diện, nhân vật hay tên tính năng của sản phẩm nào.

## 0. Tóm tắt (đọc phần này là đủ để quyết)

1. **Đề xuất cốt lõi: để LLM "chọn và dẫn", không để LLM "chấm".** Khối bài tập trong chat dùng lại bộ dựng bài và bộ chấm đã có (`packages/exercises`: `buildItem`, `gradeAssess`, `verdict`; SM-2; A6). LLM chỉ (a) chọn *loại khối + mã bài có sẵn* (`ExerciseRef`) hoặc (b) soạn đề ngắn cho riêng khối trắc nghiệm/điền chỗ trống. Chấm đúng/sai luôn ở máy người học ⇒ không tốn token chấm, không bị LLM chấm sai, chạy được khi AI bận.
2. **Cu Tít chủ động = mẫu soạn sẵn + luật kích hoạt chạy ở client, 0 token.** LLM chỉ vào cuộc khi cần cá nhân hóa (vd. nhắc lại lỗi cụ thể), và có trần. Với Groq free 8 000 token/phút cho cả app, mỗi lượt chat (~3 000 token prompt) đã chiếm gần nửa phút; **không được để tính năng chủ động tự gọi LLM nền**.
3. **Mức làm phiền:** tối đa **1 gợi ý chủ động / 10 phút phiên học, 3 / ngày**, tắt được trong Cài đặt, im khi đang thu âm/gọi/ở "không làm phiền"; tự giảm khi người học bỏ qua 2 lần liên tiếp. Bằng chứng ngoài đời cho thấy nhắc quá tay làm người học phụ thuộc hoặc mệt (mục 1.4).
4. **Phạm vi:** gộp vào dự án 2 **chỉ phần khung + 3 khối P0** (gợi ý trả lời nhanh, trắc nghiệm/điền chỗ trống, thẻ lật) vì chúng dùng chung khung chat đang làm; phần còn lại tách **dự án 2b**.

---

## 1. Mẫu UI/UX AI tương tác trong app học

### 1.1 Nguồn đã tra (tóm tắt ý, không sao chép)

| Nguồn | Ý rút ra cho thiết kế |
|---|---|
| Nghiên cứu "AI Conversational Tutors in Foreign Language Learning" ([arXiv 2508.05156](https://arxiv.org/pdf/2508.05156)) | Gia sư chat cần tùy chọn **dịch câu trả lời, nghe lại, lặp lại câu cuối**; phản hồi tách rời bản ghi hội thoại thì giá trị giảm ⇒ phản hồi phải **nằm trong dòng chat**. Diện mạo gia sư ảnh hưởng động lực. |
| Dự án gia sư hội thoại ngoại ngữ ([Berkeley iSchool](https://www.ischool.berkeley.edu/node/18359)) | Khó nhất là **giữ mạch hội thoại mà vẫn gợi ý (scaffold)** ⇒ gợi ý ngắn, không ngắt mạch. |
| GELLI ([arXiv 2610.31987](https://arxiv.org/pdf/2610.31987)) | LLM hay **trôi khỏi mục tiêu bài, thoát vai, không tạo cơ hội dùng đúng cấu trúc đích** ⇒ cần khung bài có cấu trúc, đừng để LLM tự do. |
| Báo cáo về một app luyện nói có AI ([Busuu Conversations](https://www.busuu.com/en/languages/speak-fluently-with-busuu-conversations)) | Phản hồi **sau khi hội thoại kết thúc** (không ngắt giữa chừng) là mẫu phổ biến; một số app còn **biến hội thoại thành bài tập riêng cho người học**. |
| Mô tả tính năng "giải thích đáp án" của một app lớn ([Tech Learning](https://www.techlearning.com/how-to/what-is-duolingo-max-the-gpt-4-powered-learning-tool-explained-by-the-apps-product-manager), [OpenAI case study](https://openai.com/index/duolingo)) | Mẫu **"hỏi thêm sau khi làm bài"**: nút mở khung giải thích ngay dưới bài, hỏi tiếp được, rồi **quay lại bài**. Chỉ số họ dùng: người học đi bao xa rồi mới quay lại bài (càng ít = giải thích càng đủ). Nội dung AI có người rà. |
| Báo cáo về gia sư AI giáo dục phổ thông ([Chalkbeat 2026](https://www.chalkbeat.org/2026/08/25/ai-tutoring-students-khanmigo-khan-academy-engagement-study/), [Hechinger](https://hechingerreport.org/proof-points-khanmigo-math-ai-tutor/)) | **Học sinh ít chủ động hỏi gia sư AI** (≈ 1/3 số ngày), nhiều tin ngoài đề hoặc cố moi đáp án; sản phẩm sau đó **nhúng gợi ý vào ngay bài tập** thay vì tab chat riêng; gợi ý trước khi thử chỉ nên là *gợi ý nhẹ*. ⇒ **Khối bấm trong chat + gợi ý chủ động hiệu quả hơn chờ người học tự hỏi**; và đừng để "bấm hỏi đáp án" thành đường tắt. |
| Nghiên cứu nhắc học ở trẻ 10–12 tuổi ([PMC11192903](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11192903/)) | Nhắc đẩy đều đặn **không tăng ngày học, về lâu lại giảm học vào ngày không nhắc** (phụ thuộc nhắc). Mẫu mẫu nhỏ, trẻ em ⇒ thận trọng khi suy ra người lớn. |
| Working paper về streak và nhắc cá nhân hóa ([Northwestern WP-26-05](https://www.ipr.northwestern.edu/documents/working-papers/2026/wp-26-05.pdf)) | Nhắc **cá nhân hóa** và làm nổi chuỗi ngày cho hiệu ứng lớn hơn nhắc chung; nhưng streak có tranh cãi (có nơi bỏ vì làm nản khi đứt chuỗi ngoài ý muốn). ⇒ nhắc cụ thể ("hôm nay có 5 thẻ đến hạn") tốt hơn nhắc chung ("học đi nào!"); không phạt khi đứt. |

Hạn chế của bảng này: phần lớn là tài liệu ra mắt/bài viết, ít số đo độc lập; chỉ dùng để **chọn mẫu**, không dùng làm số liệu cam kết. Số đo hiệu quả thật phải lấy từ chính app (mục 1.3).

### 1.2 Mười mẫu khối bấm trong chat

Mỗi mẫu: **mục đích học · ví dụ tiếng Việt · đo bằng gì**. "Chấm" nói rõ ai chấm.

| # | Mẫu | Mục đích học | Ví dụ trong ngữ cảnh tiếng Việt | Đo hiệu quả |
|---|---|---|---|---|
| 1 | **Chip gợi ý trả lời nhanh** (2–3 chip dưới tin Cu Tít) | Giảm "trang giấy trắng", cho người mới một câu mẫu để nói/bấm; người giỏi bỏ qua và gõ tự do | Cu Tít hỏi "Bạn tên là gì?" → chip: *Con tên là Lan* · *Mình là Lan* · *Tôi là Lan* (khác xưng hô) | Tỷ lệ bấm chip; tỷ lệ chip rồi sửa lại bằng gõ tay (chip quá dễ/khó) |
| 2 | **Trắc nghiệm** 3–4 lựa chọn | Kiểm nhớ nghĩa/tình huống ngay sau khi Cu Tít vừa dạy | "Gọi bà ngoại, bạn nói: *Bà ơi* / *Cô ơi* / *Chị ơi*" | Đúng lần đầu %; thời gian trả lời; số lần sai cùng một mục |
| 3 | **Điền chỗ trống** (chip chọn từ vào chỗ trống) | Ngữ pháp/từ loại, đại từ | "___ ăn cơm chưa ạ?" ← *Bác* / *mày* / *tao* | như trên |
| 4 | **Sắp xếp từ** (kéo/chạm từ thành câu; tái dùng bộ `build`/Sentence Builder) | Trật tự câu (A8 đốt tre) | "đi / ăn / chúng ta / phở / nhé" | Số bước sửa; đúng lần đầu |
| 5 | **Chọn thanh điệu** (nghe → chọn dấu; tái dùng bài `tone`) | Phân biệt 6 thanh | Nghe "ma" → chọn *má / mà / mả / mã / mạ* | Đúng %; cặp thanh hay nhầm (hỏi–ngã) |
| 6 | **Nói lại câu có chấm** (A3 + A2; tái dùng `speak`) | Phát âm, ngữ điệu | "Cho con một tô phở" → điểm 0–100 + nghe lại bản chuẩn | Điểm trung bình theo thời gian; % đạt `SPEAK_PASS` (70) |
| 7 | **Thẻ ghi nhớ lật** (mặt trước → tự đánh giá "nhớ/mơ hồ/quên") | Ôn từ vừa gặp trong chat; cầu nối SM-2 | Lật "quả cam" → *orange* | Tỷ lệ "nhớ" ở lần ôn kế tiếp (SM-2 đã sinh dữ liệu này) |
| 8 | **Giải thích lỗi mở rộng** (thu gọn mặc định, bấm mở; có nút "hỏi thêm" = chip, không phải ô gõ tự do) | Hiểu *vì sao* sai, không chỉ biết sai | Câu "Tôi ăn cơm bà" → "bạn muốn nói *ăn cơm với bà*? thiếu từ nối *với*" | % mở; sau khi mở, sai lại cùng lỗi trong 3 ngày có giảm không |
| 9 | **So sánh phương ngữ** (hai thẻ song song Bắc/Nam, có nút nghe) | Nhận ra từ khác miền (A7) | "heo" (Nam) ↔ "lợn" (Bắc); nút nghe từng giọng | Có chọn "đổi miền" sau đó không; đúng ở bài nhận miền |
| 10 | **Thẻ xưng hô** (chọn 2 vai → hiện cặp đại từ đúng, lý do) | Chọn xưng hô đúng ngữ cảnh (A6) | "Bạn nói chuyện với cô giáo của mẹ" → chọn *Con–Cô* hay *Em–Cô* | Đúng %; loại quan hệ hay sai |

**Mẫu học tập nên giữ chung cho cả 10 khối:** (a) làm xong **hiện đáp án + một câu lý do**, không im lặng; (b) có nút **"Bỏ qua"** (không tính sai); (c) sai thì cho **thử lại một lần** rồi hiện đáp án (tránh vòng lặp); (d) khối **tự khóa sau khi trả lời** và giữ trong lịch sử chat ở trạng thái đã làm (xem lại được, không làm lại để gian lận XP).

### 1.3 Cách đo hiệu quả (dùng chung)

Sự kiện cục bộ (không gửi tên người học; tổng hợp theo loại khối), tận dụng `BlockStatsVisitor`:
- `block_shown` / `block_interacted` / `block_correct` / `block_skipped` / `block_expanded` theo `type`.
- **Chỉ số chính:** (1) tỷ lệ tương tác = bấm / hiển thị; (2) đúng lần đầu; (3) **sau 3 ngày**, thẻ SM-2 sinh từ khối có được nhớ không (hiệu quả thật, không chỉ "bấm cho vui"); (4) tỷ lệ tắt/bỏ qua gợi ý chủ động (mục 3.4).
- **Chỉ số cảnh báo:** khối bị bỏ qua > 60% ⇒ giảm tần suất hoặc đổi loại; khối đúng > 95% ⇒ quá dễ, tăng độ khó.

### 1.4 Nhắc chủ động: các tình huống và mức làm phiền

| Tình huống | Mục đích | Ví dụ tiếng Việt | Đo |
|---|---|---|---|
| **Ngừng tay** (không thao tác ~25–40 s giữa bài/chat) | Gỡ bí, không bỏ cuộc | Bong bóng: "Bí rồi hả? Gợi ý nhé: chữ đầu là *p…*" (+ nút gợi ý) | Tỷ lệ tiếp tục sau gợi ý |
| **Sai nhiều lần** (2–3 lần liên tiếp cùng mục) | Đổi cách dạy thay vì lặp lại | "Cặp *hỏi–ngã* khó thật! Thử nghe 2 âm cạnh nhau nhé?" → mở khối chọn thanh điệu dễ hơn | Sai lại cùng mục sau đó |
| **Có thẻ đến hạn** (SM-2 `dueAt ≤ now`) | Ôn đúng lúc quên | "Hôm nay có 6 từ sắp quên, ôn 2 phút nhé?" → khối thẻ lật 3–6 thẻ | % nhận lời; % nhớ |
| **Quay lại app sau ≥ 1 ngày** | Chào, nối mạch, không trách | "Lâu quá không gặp! Hôm qua mình học *chào hỏi*, ôn nhanh 1 câu nhé?" | Tỷ lệ phiên quay lại có học |
| **Sau bài / cuối unit** | Gợi ý **bước tiếp** (thay vì để người học tự tìm) | "Giỏi quá! Muốn luyện thanh *ngã* hay thử gọi phở?" (2 chip) | Tỷ lệ chọn chip; có học tiếp không |
| **Hoàn thành mục tiêu ngày / mốc** | Củng cố, không gây áp lực | "Đủ mục tiêu hôm nay rồi!" (không "đừng mất chuỗi") | — |

**Mức làm phiền chấp nhận được (đề xuất, chỉnh theo số đo thật):**
- Tối đa **1 gợi ý / 10 phút**, **3 / ngày**; trong một phiên chat, tối đa 1 khối do Cu Tít tự chèn mỗi 4 lượt.
- **Không bao giờ** chặn nội dung (luôn là bong bóng/chip nhỏ, đóng được bằng một chạm, tự biến mất sau ~12 s nếu không động).
- Người học **bỏ qua 2 gợi ý liên tiếp ⇒ im 24 giờ**; bỏ qua 3 lần/tuần ⇒ hạ tần suất một bậc.
- Không phạt khi đứt chuỗi; lời nhắc nói **điều cụ thể** (số thẻ, tên lỗi), không nói chung chung.
- Thông báo đẩy ngoài app dùng cơ chế sẵn có `packages/native/src/reminders.ts` (đã xin quyền khi người dùng bật), **không thêm loại mới** ở dự án này.

---

## 2. Áp vào app này

### 2.1 Hiện trạng liên quan (đã đọc)

- `AgentUIBlockType` hiện 5 loại (`pitch_visualizer`, `honorific_card`, `adaptive_drill`, `culture_pill`, `dialect_switch`); `payload` là `z.record(z.any())`; sự kiện SSE `blocks` tối đa 4 khối/lượt (`packages/contracts/src/api/chat.ts`).
- `SanitizerVisitor` (`packages/ui/src/agent-blocks/sanitize.ts`) cắt payload sâu 3 cấp, mảng ≤ 50, chuỗi ≤ 2 000, chặn URL không phải http(s), bỏ key nguy hiểm — **lớp phòng thủ thứ hai đã sẵn**.
- `AgentBlockView.tsx` hiện chỉ dựng thẻ chữ + link tới màn khác (đường dẫn cố định, không lấy URL từ payload).
- `packages/exercises` đã có `ExerciseItem` (choice/build/tone/speak/story), `ExerciseResult` (có `quality` 0–5 cho SM-2), `buildItem(ref, seed)`, `gradeAssess`, `verdict`.
- SM-2: `calculateSM2(ease, interval, reps, quality, now)`; A6: `HonorificInterpreter`, `HONORIFIC_PAIRS_20`.
- `packages/native/src/reminders.ts`: nhắc cục bộ đã có.

### 2.2 Vấn đề của `payload: z.record(z.any())` và cách sửa

Với khối tương tác, payload "tự do" là rủi ro: LLM sai kiểu thì UI vỡ; không có chỗ chặn đáp án vắng mặt. **Đề xuất:** đổi `AgentUIBlockSchema` thành **`z.discriminatedUnion('type', [...])`** với payload có kiểu riêng cho từng loại **mới**, giữ 5 loại cũ ở nhánh `payload: record` để **tương thích ngược** (bản app cũ vẫn đọc được khối cũ; khối mới chỉ gửi khi client khai báo hỗ trợ, xem 2.5). Theo Nguyên tắc 5 phải sửa `packages/contracts` trước.

### 2.3 Loại khối mới đề xuất

Tên theo kiểu hiện có (snake_case). Chữ "Chấm" = ai chấm. Mọi chuỗi ngắn có `.max()`; mọi tập lựa chọn có `.min(2).max(4)`.

```ts
// Dùng chung
const Id = z.string().max(64);
const Text = (n: number) => z.string().trim().min(1).max(n);
const Reason = Text(160); // lý do đáp án, hiển thị sau khi làm
```

| Loại khối | Payload Zod dự kiến | Ai chấm / cách chấm | Ghi chú |
|---|---|---|---|
| `quick_replies` | `{ replies: z.array(z.object({ text: Text(60), kind: z.enum(['say','ask']).default('say') })).min(2).max(3) }` | Không chấm. Bấm = gửi `text` như tin của người học | `kind:'ask'` = câu hỏi thêm ("Giải thích giúp con") |
| `quiz_choice` | `{ prompt: Text(120), display: Text(120).optional(), options: z.array(Text(40)).min(2).max(4), answerIndex: z.number().int().min(0).max(3), reason: Reason, wordRef: Text(40).optional() }` | **Client**: so `answerIndex`. Refine: `answerIndex < options.length`, các option khác nhau (NFC) | `wordRef` để tạo thẻ SM-2 |
| `quiz_cloze` | `{ sentence: Text(120) /* chứa đúng một "___" */, options: 3–4 từ, answerIndex, reason }` | **Client** | Refine: `sentence` có đúng 1 `___` |
| `exercise_ref` | `{ ref: ExerciseRefSchema /* kind + id có sẵn trong packages/content */, why: Text(100).optional() }` | **Client**, bằng **bộ bài có sẵn** (`buildItem` → `ExerciseResult`): build, tone, speak, choice, story | **Loại quan trọng nhất**: LLM chỉ chọn mã, không soạn nội dung ⇒ hết ảo giác, ~0 token đề. Gateway kiểm `isResolvable(ref)` |
| `flashcard_flip` | `{ cards: z.array(z.object({ front: Text(40), back: Text(80), speak: Text(60).optional() })).min(1).max(6) }` | **Người học tự đánh giá** nhớ/mơ hồ/quên → chất lượng SM-2 (5/3/1) | Thẻ do LLM sinh phải khớp từ đã dạy (lọc ở Gateway, như `newWords`) |
| `error_explain` | `{ original: Text(120), corrected: Text(120), explanation: Text(300), followUps: z.array(Text(50)).max(2).default([]) }` | Không chấm. Thu gọn mặc định | Có thể **suy ra từ `correction` sẵn có** ⇒ ~0 token thêm |
| `dialect_compare` | `{ concept: Text(40), variants: z.array(z.object({ region: z.enum(['north','central','south']), word: Text(40), example: Text(100).optional() })).min(2).max(3) }` | Không chấm; tra **A7** để khẳng định, không tin LLM | Gateway thay `variants` bằng dữ liệu `packages/content` nếu tìm được |
| `honorific_pick` | `{ scenario: Text(120), pairId: Text(32) /* HONORIFIC_PAIRS_20 */, options: z.array(Text(40)).min(2).max(4) }` | **Client bằng A6** (`HonorificInterpreter`): đáp án đúng lấy từ luật, **không** lấy từ LLM | LLM chỉ chọn `pairId` + câu cảnh; xem 2.7 |
| `next_step` | `{ choices: z.array(z.object({ label: Text(40), route: z.enum([...tuyến cố định...]) })).min(1).max(3) }` | Không chấm | Như `AgentBlockView` hiện tại: route là **enum cố định**, không lấy URL từ payload |

Quy ước: các loại cũ `pitch_visualizer`, `culture_pill`, `dialect_switch`, `adaptive_drill` giữ nguyên; `honorific_card` (thẻ giải thích chỉ-đọc) nằm cạnh `honorific_pick` (có bấm).

### 2.4 Nơi hiển thị

| Nơi | Khối phù hợp | Ghi chú |
|---|---|---|
| **Dòng chat** (dưới tin Cu Tít, cùng cột với tin) | tất cả 9 loại mới | Mỗi tin Cu Tít có ≤ 1 "khối bài tập" + ≤ 1 `quick_replies` |
| **Cuối bài / cuối unit** (màn kết quả của `mfe-path`) | `next_step`, `flashcard_flip` ôn từ sai | Mẫu soạn sẵn là chính |
| **Bong bóng nổi Cu Tít** (ngoài màn chat) | gợi ý chủ động ngắn + `quick_replies` 2 chip | Chỉ chữ + chip, không khối nặng; chạm mở chat có sẵn khối |
| **Không** hiển thị | trong lúc thu âm / gọi / đang phát nhạc nền ở chế độ "không làm phiền" | Mục 3.5 |

Khối đã làm xong hiện **trạng thái đã trả lời** (đáp án + lý do), lưu trong lịch sử cuộc trò chuyện (mục lịch sử của dự án 2) để mở lại xem được nhưng không làm lại.

### 2.5 Cách LLM sinh khối an toàn

1. **Hai tầng sinh để giữ token:**
   - *Tầng 1 (mặc định, rẻ):* LLM chọn trong danh sách **khối được phép** do Gateway truyền vào prompt rút gọn; ưu tiên `exercise_ref`, `quick_replies`, `next_step`, `error_explain` (dùng lại dữ liệu có sẵn).
   - *Tầng 2 (khi cần đề mới):* chỉ khi người học bấm "Cho con bài tập" hoặc luật chủ động cần cá nhân hóa ⇒ **một lời gọi riêng**, prompt ngắn (~600 token, không kèm prompt gia sư 3 000 token), yêu cầu JSON `{ blocks: [...] }`, `quiz_choice`/`quiz_cloze`/`flashcard_flip`.
2. **Zod hai chốt:** Gateway `safeParse` từng khối (bỏ khối sai, **không** hỏng cả lượt — đúng thói quen hiện tại), rồi client `sanitizeAgentBlocks` lần hai.
3. **Kiểm nghĩa ngoài schema (Gateway):** `answerIndex` hợp lệ; option không trùng; `___` đúng một; `ExerciseRef` resolvable; từ trong `flashcard_flip` có trong ngữ cảnh/`packages/content`; chuỗi tiếng Việt qua NFC; lọc từ tục (cùng bộ lọc `newWords` nếu có).
4. **Giới hạn số khối:** giữ `MAX_BLOCKS_PER_TURN = 4` ở contract, nhưng **chính sách thực tế ≤ 2 khối tương tác/lượt** (1 bài + 1 chip) và tối đa 3 khối bài chủ động mỗi cuộc trò chuyện; người học không bị "tràn bài".
5. **Dự phòng khi sai schema:** thử lại một lần với hướng dẫn sửa (chỉ nếu còn ngân sách token phút); không được thì **thay bằng khối mẫu soạn sẵn** cùng loại từ `packages/content`, hoặc chỉ gửi tin chữ. **Không trừ lượt** khi lỗi (đã là quy tắc dự án 2).
6. **Tương thích bản cũ:** request thêm cờ `supportedBlocks: z.array(AgentUIBlockType).optional()` (hoặc bản contract) — Gateway chỉ sinh loại client hiểu. Khối lạ ở client ⇒ bị bỏ (đã vậy nhờ `safeParse`).
7. **Chống chèn lệnh:** nội dung do người học gõ/đọc từ ảnh là *dữ liệu*; khối không bao giờ chứa URL, HTML, hay hành động tuỳ ý. `route` là enum.

### 2.6 Chi phí token với Groq free (8 000 token/phút cho cả app)

Con số ước lượng (token ≈ ký tự/3,5 cho tiếng Việt có dấu; **cần đo thật bằng `eval:llm`** trước khi cam kết):

| Thành phần | Ước lượng | Ghi chú |
|---|---|---|
| Lượt chat hiện tại | ~3 000 vào + ~150 ra | theo số đo dự án 2 |
| Thêm mô tả schema khối vào prompt gia sư | **+300–450 vào** (~10–15%) | phải rút gọn; chỉ liệt kê loại được phép + ví dụ 1 khối |
| 1 khối `exercise_ref` / `quick_replies` / `next_step` | ~25–60 ra | chỉ mã/chip ngắn |
| 1 khối `quiz_choice` / `quiz_cloze` | ~90–160 ra | |
| 1 khối `flashcard_flip` (4 thẻ) | ~120–200 ra | |
| Lời gọi "tạo bài" riêng (tầng 2) | ~600 vào + ~250–400 ra ≈ **~1 000** | không kèm prompt gia sư |

Hệ quả: 8 000 token/phút ≈ chỉ **~2 lượt chat/phút toàn app** (3 100 mỗi lượt) hoặc ~8 lời gọi tạo bài riêng/phút. Vì vậy:
- Khối chủ yếu dùng **dữ liệu có sẵn** (`exercise_ref`, thẻ từ SM-2, mẫu soạn sẵn) ⇒ **0 token thêm**.
- Lời gọi tạo bài tầng 2 qua **cùng trần toàn cục** với chat và **ưu tiên thấp hơn chat** (chat thường được đi trước); khi `llm_busy` ⇒ dùng ngay mẫu có sẵn, không xếp hàng chờ.
- **Bộ nhớ đệm đề theo chủ đề + cấp độ** ở Gateway (cùng `seed` → cùng đề): nhiều người học nhận chung một đề đã sinh, giảm gọi lặp. Đây là **ý tốt hơn "mỗi người một đề"**; cá nhân hóa thật sự chỉ ở chọn *mục nào* ôn (do SM-2/lỗi sai quyết định, không cần LLM).
- Mỗi khối **không trừ lượt chat** riêng, nhưng tính vào `llmTokens` hàng ngày; tầng 2 giới hạn 5 lần/ngày/người ở bản miễn phí (chỉnh theo số đo).
- Chỉ khi có thêm nguồn (Gemini, Cloudflare…) trong chuỗi `LLM_CHAIN` thì nới giới hạn.

### 2.7 Kết nối SM-2 (A4) và A6

**SM-2.** Mọi khối có chấm cho ra `ExerciseResult`-tương-đương `{ key, correct, skipped, quality, answer, front? }` rồi đi **cùng đường** với bài thường (cùng hàm ghi `reviewCards`/lượt làm bài trong `packages/state`), nên **không thêm thuật toán** (đúng danh mục 8 thuật toán):

| Kết quả khối | `quality` (0–5) | Thẻ ôn |
|---|---|---|
| Đúng lần đầu, nhanh | 5 | cập nhật thẻ (hoặc tạo mới) |
| Đúng lần thử lại | 3 | |
| Sai, xem đáp án | 1 | tạo thẻ mới/ép ôn sớm |
| Bỏ qua | không ghi | |
| `flashcard_flip`: nhớ / mơ hồ / quên | 5 / 3 / 1 | |
| `speak` | `gradeAssess(...)` sẵn | |

Khối từ LLM có `wordRef` (từ đã nằm trong `packages/content`) thì dùng khóa thẻ chuẩn; nếu từ **ngoài** kho nội dung, tạo thẻ loại `chat` kèm cờ `unreviewed` (như `reviewed:false` của kịch bản) và không đẩy vào lộ trình chính.

**A6 (khối xưng hô).** Đề do LLM chọn *tình huống* và `pairId` trong `HONORIFIC_PAIRS_20`; **đáp án đúng do luật A6 tính** (`HonorificInterpreter`), LLM không được "quyết" đúng/sai. Nếu luật không có đáp án chắc (vd. cặp ngoài 20 cặp) ⇒ khối bị bỏ và thay bằng `honorific_card` chỉ-đọc. Tài liệu hóa lý do sai lấy từ trường lý do của dữ liệu A6, không từ LLM.

**Ranh giới MFE (Nguyên tắc 7):** `apps/mfe-conversation` dựng khối bằng thành phần dùng chung đặt ở **`packages/exercises`/`packages/ui`** (hiện cả hai là gói chung, không phải MFE); không import `mfe-practice`. *Cần kiểm lại bằng `pnpm lint:boundaries` khi làm* (chưa kiểm trong nghiên cứu này).

---

## 3. Cu Tít chủ động

### 3.1 Nguyên tắc

1. **Mẫu soạn sẵn là mặc định; LLM chỉ khi cần cá nhân hóa** (đề xuất của yêu cầu — **đồng ý**, có lý do: mẫu 0 token, chạy offline, ổn định tông giọng, qua duyệt nội dung; LLM không bảo đảm các điểm này và bị trần 8 000 token/phút).
2. **Luật chạy ở client** (máy trạng thái nhỏ trong `mfe-conversation`/`host-shell`, đọc `@vietlearning/state` + EventBus). Không có server đẩy tin ở dự án này.
3. **Một gợi ý = một hành động** (một nút/một chip), có lối thoát rõ.

### 3.2 Luật kích hoạt (đề xuất)

| Mã | Sự kiện (nguồn) | Điều kiện | Nội dung | Hành động |
|---|---|---|---|---|
| T1 `idle` | không thao tác trong bài/chat 30 s (đo bằng timer của màn) | đang ở bài/chat; chưa gợi ý trong 10 phút | mẫu "gợi ý chữ đầu"/"nghe lại" | nút Gợi ý |
| T2 `struggle` | 2–3 lần sai liên tiếp cùng mục (từ `ExerciseResult`) | | mẫu "chuyển bài dễ hơn" + `exercise_ref` dễ hơn | mở khối |
| T3 `srs_due` | có ≥ 3 thẻ SM-2 đến hạn | chưa nhắc trong 12 giờ; ngoài giờ ngủ | mẫu "N từ sắp quên" | khối `flashcard_flip` |
| T4 `return` | mở app sau ≥ 24 giờ | 1 lần/ngày | mẫu "chào + ôn 1 câu" (**LLM tùy chọn** để nhắc đúng điều hôm qua) | `quick_replies` |
| T5 `after_lesson` | kết thúc bài/unit | luôn | mẫu + `next_step` (2 chip) | điều hướng |
| T6 `streak_soft` | đạt mục tiêu ngày | | mẫu mừng, **không** dọa mất chuỗi | không |

Ưu tiên khi nhiều luật cùng lúc: T2 > T5 > T3 > T4 > T1; mỗi lần chỉ phát một.

### 3.3 Mẫu hay LLM

| Luật | Mặc định | LLM khi |
|---|---|---|
| T1, T2, T5, T6 | mẫu 100% | không dùng |
| T3 | mẫu + điền số thẻ | không dùng |
| T4 | mẫu | người học bật "Cu Tít nhớ việc học của mình" **và** còn ngân sách token **và** chưa quá 1 lời gọi/ngày; sinh ≤ 40 token chữ; lỗi/timeout ⇒ dùng mẫu |

Mẫu song ngữ vi+en qua `i18n.ts` (đúng quy tắc song ngữ; nội dung học vẫn tiếng Việt), có 3–5 biến thể mỗi mẫu để không lặp.

### 3.4 Tần suất, giảm dần và tắt

- Trần: **1 / 10 phút, 3 / ngày** (mục 1.4); bỏ qua 2 liên tiếp ⇒ im 24 giờ; bỏ qua nhiều ⇒ tự hạ bậc.
- **Cài đặt › Cu Tít** (mới, trong `mfe-learner` M12): công tắc *"Cu Tít chủ động gợi ý"* (bật/tắt), mức *Ít · Vừa · Nhiều* (bậc trần), *"Dùng AI để cá nhân hóa lời nhắc"* (tắt mặc định, vì gửi dữ liệu học tới nhà cung cấp AI — cần khớp hộp đồng ý ở mục 5.6 của spec). Thông báo đẩy ngoài app vẫn ở mục nhắc học sẵn có.
- Lưu trạng thái đếm trong `packages/state` (bền, theo ngày giờ VN như hạn mức).

### 3.5 Hiển thị và tôn trọng âm thanh/không làm phiền

- Qua **bong bóng Cu Tít** (`CuTit` mood: `chan-dung` mặc định; `suy-nghi` khi chờ LLM; `noi` khi có lời; `an-mung` ở T5/T6; **tránh mood buồn** khi nhắc lỗi). Gợi ý hiện dạng bong bóng thoại nhỏ gần Cu Tít, tự ẩn sau ~12 s.
- **Âm thanh:** gợi ý chủ động **không tự phát giọng**; chỉ `playSfx('cutit-noi')` rất nhỏ nếu hiệu ứng đang bật, và **bỏ qua hẳn** nếu: đang `acquireAudio('call'|'record')`, tai nghe không cắm lúc người dùng đặt "im lặng", hoặc nhạc/âm bị tắt trong Cài đặt. Không phát đè nhạc nền.
- **Không làm phiền:** im lặng khi (a) đang thu âm/gọi/camera, (b) người dùng bật chế độ im lặng của hệ điều hành, (c) đang làm bài chấm giờ/đang nghe truyện, (d) giờ ngủ người dùng đặt (nếu có; nếu chưa có thì mặc định 22:00–07:00 giờ VN không gợi ý đẩy ngoài app).
- Trợ năng: gợi ý là vùng `role="status"` (không giật focus); chip đủ cỡ chạm (≥ 44 px, như `min-h-11` hiện dùng); không chỉ dựa màu; tôn trọng "giảm chuyển động".

---

## 4. Phạm vi đề xuất

### 4.1 Gộp vào dự án 2 hay tách 2b

**Đề xuất: gộp một phần nhỏ, tách phần lớn thành dự án 2b.**
- **Vào dự án 2 (thêm 2 task, khung):** (i) đổi `AgentUIBlockSchema` sang `discriminatedUnion` + 3 loại P0 (`quick_replies`, `quiz_choice`, `exercise_ref`) kèm tests Zod; (ii) `AgentBlockView` thành bộ dựng khối tương tác (khóa sau khi trả lời). Lý do: dự án 2 đang đổi khung chat và lịch sử, sửa contract và khung hiển thị **một lần** rẻ hơn hai lần; không gộp thì dự án 2b phải đập lại khung vừa xong.
- **Tách 2b (không chặn dự án 2):** tầng 2 tạo bài bằng LLM, các khối còn lại, **toàn bộ Cu Tít chủ động** (luật, trần, Cài đặt), đo hiệu quả. Lý do: phụ thuộc số đo token thật + quyết định quyền riêng tư; dự án 2 đã nhiều việc (gọi video, lịch sử, tình huống cuối unit).
- Phương án đã loại: **gộp hết vào dự án 2** (kéo dài, dồn rủi ro vào một PR); **tách hết** (đập lại khung chat).

### 4.2 Ưu tiên

| Mức | Việc | Điều kiện hoàn thành |
|---|---|---|
| **P0** (trong dự án 2) | Contract `discriminatedUnion` tương thích ngược; `quick_replies`; `quiz_choice`; `exercise_ref` (build/tone/speak/choice); kết quả → SM-2; kiểm Gateway (answerIndex, ExerciseRef hợp lệ); mẫu dự phòng khi sai schema | test Zod + Gateway; khối không phá app bản cũ; build/test/boundaries xanh; thử trên AVD (khối bấm trong WebView) |
| **P1** (dự án 2b) | `quiz_cloze`, `flashcard_flip`, `error_explain`, `next_step`; luật chủ động T2/T3/T5 + Cài đặt bật/tắt + trần; sự kiện đo | tần suất đúng trần (test đồng hồ giả); tắt là im hoàn toàn |
| **P2** | `honorific_pick` (A6), `dialect_compare` (A7); LLM tạo bài tầng 2 + bộ nhớ đệm đề; T1/T4 (+LLM cá nhân hóa); `speak` trong chat qua nút | `eval:llm` đạt ≥ 90% khối hợp schema; token đo thật khớp ước lượng |

### 4.3 Rủi ro

| Rủi ro | Mức | Giảm bằng |
|---|---|---|
| Hết 8 000 token/phút vì khối + prompt dài | Cao | Khối ưu tiên dữ liệu sẵn; prompt rút gọn; tầng 2 prompt riêng; bộ nhớ đệm đề; chat được ưu tiên hơn tạo bài |
| LLM sinh đề sai (đáp án sai, tiếng Việt lạ) | Cao | Chấm ở client theo `answerIndex` **do Gateway kiểm**; ưu tiên `exercise_ref`; A6/A7 là nguồn sự thật; cờ `unreviewed`; nút "báo lỗi bài" |
| Làm phiền / người học mệt (bằng chứng nhắc lâu dài có thể phản tác dụng) | Trung bình | Trần cứng, giảm dần, tắt được, nội dung cụ thể, đo tỷ lệ bỏ qua và dừng nếu > ngưỡng |
| Người học bấm "hỏi/đáp án" để lách bài (gia sư AI giáo dục phổ thông ghi nhận) | Trung bình | Chip "hỏi thêm" có giới hạn; bài chưa làm chỉ cho *gợi ý nhẹ*; XP chỉ tính lần đầu |
| Khối mới làm vỡ app bản cũ | Trung bình | `supportedBlocks`/phiên bản contract; client bỏ khối lạ (đã `safeParse`) |
| Phình gói đầu (≤ 67,5 kB) | Thấp | Khối trong `mfe-conversation` lazy; tái dùng component sẵn; kiểm `size` |
| Quyền riêng tư (cá nhân hóa gửi dữ liệu học ra nhà cung cấp) | Trung bình | Mặc định tắt; nằm trong hộp đồng ý; cập nhật `DATA-SAFETY.md` |
| Khó kiểm trên thiết bị thật (a11y, kéo-thả sắp xếp từ trên cảm ứng) | Thấp–TB | Thử AVD (skill `thu-tren-emulator`); sắp xếp từ dùng chạm-để-chọn thay vì kéo |
| Phạm vi trượt (2b phình) | Trung bình | Cắt P0/P1/P2; mỗi đợt một PR |

---

## 5. Quyết định cần người dùng

1. **Gộp hay tách?** Đề xuất: P0 (khung + 3 khối) **gộp vào dự án 2** (thêm 2 task), phần còn lại **dự án 2b**. Chọn: gộp một phần / tách hết / gộp hết.
2. **Nguyên tắc "LLM chọn–client chấm":** đồng ý chấm ở client (kể cả khối do LLM soạn đề)? Chấp nhận trade-off: đề LLM sai thì người học vẫn thấy đáp án sai nhưng nhất quán, bù bằng nút "báo lỗi" + cờ chưa duyệt.
3. **Mức làm phiền mặc định:** *Vừa* (1/10 phút, 3/ngày) hay *Ít* (1/giờ, 2/ngày)? Chủ động **bật sẵn** hay **tắt sẵn** cho người mới? (Đề xuất: bật sẵn, mức Ít cho tuần đầu; vì bằng chứng cho thấy người học ít tự hỏi AI.)
4. **Cá nhân hóa bằng LLM (T4):** có làm không? Cần thêm một dòng trong hộp đồng ý. (Đề xuất: P2, tắt mặc định.)
5. **Trần tạo bài LLM bản miễn phí:** 5 bài/ngày/người có ổn không, hay muốn dành cho gói trả phí (dự án 6)?
6. **Đối tượng học (đã ghi: người dùng trưởng thành là mặc định, 21/11):** giữ giọng gợi ý như người lớn/như bé? Ảnh hưởng độ "dễ thương" của bong bóng và lời mẫu.
7. **Streak:** có hiện chuỗi ngày không? Đề xuất: **không phạt** khi đứt, không nhắc "mất chuỗi".
8. **Giờ im lặng:** mặc định 22:00–07:00 giờ VN cho thông báo ngoài app — đồng ý?
9. **Ai duyệt mẫu lời nhắc?** (quy trình `docs/nhat-ky/DUYET-NOI-DUNG.md`): mẫu soạn sẵn ~30–40 câu vi+en cần người rà trước khi phát hành.
10. **Số đo hiệu quả:** đồng ý ghi sự kiện cục bộ theo loại khối (không định danh) để chỉnh trần? Nếu muốn gửi về server phải thêm vào chính sách quyền riêng tư.

---

## Phụ lục: những gì **chưa** kiểm trong nghiên cứu này

- Chưa chạy `pnpm lint:boundaries`/build; chưa đo token thật (số ở 2.6 là ước lượng); chưa chạy thử prompt sinh khối.
- Bằng chứng web: bài báo/working paper/tài liệu sản phẩm, chưa đọc toàn văn từng bài; hiệu ứng trên người học tiếng Việt chưa có số liệu.
- `ExerciseRefSchema` chưa có trong `packages/contracts`; cần xác định có sẵn dạng Zod hay chỉ kiểu TS trong `packages/content`/`packages/exercises` khi vào dự án 2b.

Nguồn: [arXiv 2508.05156](https://arxiv.org/pdf/2508.05156) · [Berkeley iSchool](https://www.ischool.berkeley.edu/node/18359) · [GELLI arXiv 2610.31987](https://arxiv.org/pdf/2610.31987) · [Busuu Conversations](https://www.busuu.com/en/languages/speak-fluently-with-busuu-conversations) · [Tech Learning](https://www.techlearning.com/how-to/what-is-duolingo-max-the-gpt-4-powered-learning-tool-explained-by-the-apps-product-manager) · [OpenAI case study](https://openai.com/index/duolingo) · [Chalkbeat 2026](https://www.chalkbeat.org/2026/08/25/ai-tutoring-students-khanmigo-khan-academy-engagement-study/) · [Hechinger](https://hechingerreport.org/proof-points-khanmigo-math-ai-tutor/) · [PMC11192903](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11192903/) · [Northwestern WP-26-05](https://www.ipr.northwestern.edu/documents/working-papers/2026/wp-26-05.pdf)
