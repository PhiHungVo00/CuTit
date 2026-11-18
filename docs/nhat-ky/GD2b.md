# Nhật ký GĐ2b — Xưng hô trong ngữ cảnh + Truyện ngắn nghe

> Nhánh `claude/gd2b-xung-ho-truyen-a91b8a` (dựng trên `ce0a8ee`, main đã có GĐ0–GĐ4 + D9). **Chưa merge vào main.**
> Kế hoạch tổng: `docs/KE_HOACH_PHAT_TRIEN_TOAN_DIEN.md` mục 5, GĐ2 điểm 4 (xưng hô trong ngữ cảnh) và điểm 6 (Stories).
> Mức bằng chứng: 🟢 đã chạy · 🔵 đọc code.

## 0. Baseline (2026-11-18) 🟢
`pnpm build` OK. Kích thước trước khi sửa: dữ liệu khóa `course-*.js` 7.05 kB, trình chạy bài 4.16 kB, chunk luật A6 `HonorificInterpreter-*.js` 8.93 kB.

## 1. Đã làm
| Việc | Ghi chú |
|---|---|
| Dạng bài **Xưng hô theo tình huống** (`ExerciseRef {type:'situation', situation:'hs*'}`) | Mục 2. 🟢 |
| Dạng bài **Truyện ngắn** (`ExerciseRef {type:'story', story:'st*'}`, `StoryExercise` lazy) | Mục 3. 🟢 |
| Nội dung nháp: 6 tình huống `situations.json`, 3 truyện `stories.json` (`reviewed:false`) | Mục 4. |
| Chèn vào unit 1–3 + câu truyện vào `speakableTexts` | Mục 4. 🟢 |
| e2e `apps/host-shell/e2e/gd2b.spec.ts` | Mục 6. |

## 2. Xưng hô theo tình huống (A6, không viết luật mới)
- Tình huống = cảnh tiếng Việt (“Bạn (nữ, 20 tuổi) gặp anh Nam (26 tuổi) ở câu lạc bộ.”) + bản dịch + `context` (`ContextExpression`: tuổi hai bên, quan hệ, **giới tính hai bên luôn ghi rõ** — thiếu thì A6 trả dạng gạch chéo “bác/chú”).
- **Đáp án do luật A6 có sẵn suy ra** (`HonorificInterpreter.interpret(context)`), không chỉ định `pairId`. Trường `a6` trong JSON là **bản chụp** kết quả đó (cách xưng, cách gọi, `pairId`, lời giải A6 tiếng Việt, lời giải tiếng Anh của cặp trong 20 cặp). Test `packages/content/test/situations-stories.test.mjs` so bản chụp với `resolveSituation` (gọi luật thật): đổi luật A6 mà không chụp lại thì test đỏ.
  - Vì sao chụp thay vì gọi luật lúc chạy: gọi `interpret` (hoặc import 20 cặp) từ module dữ liệu khóa học làm Rollup gộp chunk A6 (8.9 kB) vào chunk dữ liệu chung mà M6/M10/trang chủ cũng tải (đo: 17.3 kB thay vì 7 kB).
- Lựa chọn dạng “xưng – gọi” (vd. `cháu – bác`), lấy từ 20 cặp A6 (bên đầu nếu có gạch chéo). **Nhiễu loại bỏ** cặp có thể chấp nhận được: cùng cách xưng hoặc cùng cách gọi với đáp án, cặp xưng “tôi” (trung tính), “con” khi đáp án là “cháu”, và mình–bạn ↔ tớ–cậu. Test chạy mọi tình huống × 5 seed.
- Dùng lại `ChoiceExercise` (variant `situation`), có “💡 Giải thích thêm”. Giao diện tiếng Anh: đề tiếng Anh, cảnh vẫn tiếng Việt + dòng dịch, lời giải `explanationEn`.
- Không dùng câu mẫu của A6 trong lời giải (câu mẫu A6 theo bối cảnh sân đình/làng, lạc với cảnh mua bán).

## 3. Truyện ngắn nghe (`packages/exercises/src/story/`)
- Pha nghe: tiêu đề, “▶ Nghe cả truyện” (đọc lần lượt từng câu, dừng khi rời bài — `stopPlayback()` mới trong `coursePlayer`), 🔈 từng câu, bản dịch ẩn mặc định (“Hiện bản dịch”), “🔇 Không nghe được lúc này” (bỏ qua cả truyện, không tính sai — e2e cũ đi hết bài nhờ nút này).
- Âm thanh qua `playText` của `coursePlayer`: tệp dựng sẵn theo miền nếu gói đã tải, không thì TTS của máy. **Mỗi câu thoại là một văn bản** trong `speakableTexts` (đã `localizeText` theo miền), nên chuỗi trình phát tra khớp đúng chuỗi script `tts:prebuild` dựng.
- Đổi từ theo miền (A7) cho câu thoại, tiêu đề, câu hỏi, đáp án, nhiễu (vd. miền Nam: “Chị ơi, thơm bao nhiêu tiền một trái?”, đáp án “thơm”). Test bảo đảm đổi miền không làm đáp án trùng nhiễu.
- Pha câu hỏi: 3 câu, mỗi câu phản hồi ngay (đúng/sai + đáp án), có “Xem lại truyện”. **Một truyện = một `ExerciseResult`**: đạt khi đúng ≥ 2/3 câu ở lượt trả lời; SM-2 đúng hết 5, đạt 3, chưa đạt 1 (phép đếm, không phải thuật toán học mới). Chưa đạt thì truyện quay lại cuối phiên như các câu khác.
- Thẻ ôn khi chưa đạt: mặt trước là câu hỏi bị sai (“Gặp bạn mới — Nam gọi Lan là gì?”), không phải đề chung. Thêm `ExerciseResult.front?`; `SessionRunner` dùng `r.front ?? …`.
- Kỹ năng ghi lượt làm bài (M9): situation → `honorific`, story → `drill` (không thêm `Skill` mới).

## 4. Nội dung (bản nháp, chờ người bản ngữ duyệt — D8)
| Unit | Tình huống (bài) | Truyện (bài) |
|---|---|---|
| u1 | hs1 em–anh (u1l2, thêm), hs2 mình–bạn (u1l4, **thay** `pronoun h14`) | st1 “Gặp bạn mới” 6 câu (cuối u1l4, **thay** `listen w12` vì “khỏe” đã có nghĩa + luyện thanh trong bài) |
| u2 | hs3 em–chị (u2l2), hs4 cháu–bác (u2l3) | st2 “Đi chợ mua dứa” 5 câu (cuối u2l4) |
| u3 | hs5 anh–em (u3l1), hs6 cháu–ông (u3l3, quan hệ họ hàng) | st3 “Ăn phở rồi hỏi đường” 6 câu (cuối u3l4) |
- Mọi bài thường vẫn 8–12 câu; bài 1 không có truyện (người mới < 60 giây).
- Tránh từ A7 dễ lệch nghĩa trong truyện (“bát” → “chén” ở miền Nam không đúng với tô phở, nên không dùng “bát”).
- Gói âm thanh (số văn bản Bắc/Trung/Nam): u1 23 → **29**, u2 27 → **32**, u3 25 → **31**. Cần chạy lại `tts:prebuild` cho các câu mới.

## 5. Kích thước gói + sự cố build 🟢
- **Không dựng `Map` cấp module** trong `situations.ts` / `stories.ts` (tra bằng `.find`): module không có tác dụng phụ nên Rollup chỉ đưa dữ liệu tình huống + truyện vào chunk `build-*` mà chỉ lộ trình tải. Thử dựng Map cấp module (như `course.ts`) thì truyện rơi vào chunk dữ liệu chung `course-*` mà M6/M10/trang chủ… cũng tải (8.1 kB thay vì 7.1 kB).
- Đo cuối: tải ban đầu **68.48/68.5 kB** (không đổi), dữ liệu khóa `course-*` **7.09/8.5 kB** (gốc 7.05), chunk xưng hô A6 **8.93 kB** (y nguyên, cùng hash), `build-*` (dựng bài + dữ liệu GĐ2b) **4.84 kB** — ngân sách mới 5.5 kB, `StoryExercise-*` **1.76 kB** — ngân sách mới 2 kB. `.size-limit.cjs` chỉ thêm 2 dòng.
- **`vite build` chết chập chờn** với mã `-1073740791` (0xC0000409, không in lỗi) ngay sau “modules transformed”, cả ở **bản gốc `ce0a8ee`** (5/5 lần khi máy đang bận vì phiên khác cùng build/test), còn lúc máy rảnh thì qua liên tục. Không liên quan thay đổi GĐ2b; lúc đầu tôi tưởng do tree-shake (sai — đã thử lại khi máy rảnh: 3/3 qua). Cách chạy: build lại khi crash. Nếu CI gặp, thử `node --stack-size=2000 node_modules/vite/bin/vite.js build` (đã thấy qua khi máy bận) và báo phiên R10 (gói đầu) vì cùng đụng build host.

## 6. Kiểm tra cuối (2026-11-18) 🟢
- `pnpm build` 19/19 · `pnpm test` 35/35 task (content **36**, exercises **47**, mfe-path 30, gateway 106, state 54, …) · `pnpm lint:boundaries` 0 vi phạm · `size-limit` đạt hết.
- e2e (host build với `VITE_GATEWAY_URL=http://localhost:4014`, `E2E_PORT=4187 E2E_GATEWAY_PORT=4014`): **97 passed, 10 skipped** (skip có sẵn: các spec đồng bộ/gia đình chỉ chạy ở Pixel 7, perf), 0 failed.
  - `gd2b.spec.ts` 8/8 (Pixel 7 + 320 px): tình huống sai → đáp án A6 + lời giải → câu quay lại và chọn đúng; giao diện tiếng Anh; truyện: nghe cả truyện (đếm 6 câu qua `speechSynthesis` giả lập), bản dịch, 3 câu hỏi, điểm 3/3; miền Nam “thơm … trái”.
  - Sửa kèm `path.spec.ts` (có sẵn từ GĐ1): tua đồng hồ +26 giờ nên chạy sau 22:00 nhảy sang ngày kia, chuỗi ngày về 0 → trượt theo giờ chạy. Nay tua tới 23:59 ngày mai.

## 7. Cần người quyết / người bản ngữ
1. Duyệt 6 tình huống (cảnh tự nhiên? cách xưng hợp với vùng?) và 3 truyện + câu hỏi (D8).
2. A6 xếp người lạ ≥ 20 tuổi hơn mình luôn là “cháu – bác” bất kể giới tính/tuổi (vd. bà cụ 70 tuổi cũng “bác”); tình huống hs4 chọn người bán **nam 55 tuổi** để tránh chỗ này. Nếu muốn có “bà/ông” với người lạ cao tuổi thì phải sửa luật A6 (cần Lead Dev duyệt).
3. Chạy lại `tts:prebuild` cho câu truyện khi có hạn mức Gemini.
