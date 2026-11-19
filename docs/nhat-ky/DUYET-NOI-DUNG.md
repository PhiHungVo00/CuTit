# Duyệt nội dung học (D8): các mục còn `reviewed: false`

> Nhánh `claude/duyet-noi-dung-22d0e0`, ngày 2026-11-19. Người dùng đã giao việc duyệt cho Claude (xem dòng 34 nhật ký chính). Mục khớp nguồn tin cậy ⇒ `reviewed: true`. Mục sai hoặc gượng ⇒ sửa trước rồi mới đặt `true`.

## Kết quả

| Tệp | Số mục | Đã duyệt | Phải sửa | Còn `false` |
|---|---:|---:|---:|---:|
| `course/words.json` | 49 | 49 | 2 (w33, w45) | 0 |
| `course/sentences.json` | 11 | 11 | 1 (cs8) | 0 |
| `course/situations.json` | 6 | 6 | 3 (hs1, hs3, hs5: chỉ sửa đề cảnh) | 0 |
| `course/stories.json` | 3 | 3 | 2 (st1, st3: chỉ sửa câu hỏi) | 0 |
| `course/unit-1/2/3.json` | 3 | 3 | 0 | 0 |
| `scenarios.json` (sc5–sc7) | 3 | 3 | 0 | 0 |
| `toneSets.json` | 8 | 8 | 5 (t2, t3, t4, t5, t8) | 0 |

**Không còn mục nào để `false`** trong `packages/content/src/data/`.

## Đã kiểm tra những gì

- **Chính tả, dấu thanh:** toàn bộ chuỗi đều ở dạng NFC (test `course.test.mjs` kiểm tra). Thanh của từ trong bài luyện thanh khớp đúng thanh ghi (`tone-sets.test.mjs`). Thanh của từ trong các bài `tone` ở unit cũng đúng: chào (huyền), tên (ngang), khỏe (hỏi), bốn (sắc), bảy (hỏi), chợ (nặng), phở (hỏi), đường (huyền), trái (sắc).
- **Xưng hô A6:** đáp án của 6 tình huống được tính lại bằng `HonorificInterpreter` và khớp bản chụp `a6`. Phần `a6` không sửa tay. Ngoài ra đã sinh **toàn bộ tập đáp án nhiễu** theo `situationDistractors` (`packages/exercises/src/build.ts`). Với hs4 (cháu – bác), cặp “cháu – chú” bị loại khỏi nhiễu nên không có hai đáp án đúng. Với hs2 (mình – bạn), “tôi – bạn” và “tớ – cậu” cũng bị loại. Ba lỗi về đề cảnh được ghi trong bảng dưới.
- **Phương ngữ A7:** ghi chú miền trong từ vựng khớp `dialects.json`: d3 dứa/thơm, d19 vâng/dạ, d15 quả/trái, d28 cốc/ly. Các từ nằm ngoài 30 mục A7 (mắc, ký, ngàn, quẹo, khóm) được đối chiếu Wiktionary (xem Nguồn). Câu gốc viết theo miền Bắc vì `localizeText` chỉ đổi từ dạng Bắc sang miền đích, nên cs8 phải sửa (xem bảng).
- **Câu điền chỗ trống:** đã xem từng chỗ trống của unit 1–3: s5#2, s7#3, s9#3, s10#2, s11#2, s15#3, s16#4, s30#1/#2, s31#3, s48#2, s49#1, cs11#1. Ô trống nào cũng là một từ có nghĩa rõ trong câu.
- **Truyện:** mỗi câu hỏi có đáp án nằm thẳng trong lời thoại. Câu hỏi và nhiễu cũng được đổi theo miền (`loc` trong `build.ts`), nên đáp án vẫn khớp truyện ở chế độ Trung/Nam.
- **Nhập vai sc5–sc7:** nhiệm vụ hợp văn hóa. sc5 gọi hàng xóm trung niên là “cô”, xưng “cháu” (đúng cặp A6 h5), khớp lời của gia sư giả lập. sc6 xưng “em” với chị bán hàng, nhất quán với tình huống hs3. sc7 dùng “Cho tôi…”, “tính tiền”, “… ở đâu?”, đều có trong unit 3.
- **Cặp tối thiểu thanh điệu:** mỗi dạng được tra trên Wiktionary. Theo yêu cầu, bỏ những dạng chỉ dùng trong từ ghép hoặc ít gặp.

## Mục đã sửa

| Mục | Trước | Sau | Lý do | Nguồn |
|---|---|---|---|---|
| w33 `cân` (en) | kilogram (North) | kilo (North, colloquial); scale | “cân” trước hết là cái cân, động từ “cân”. Nghĩa “ký lô” chỉ là khẩu ngữ | [Wiktionary: cân](https://en.wiktionary.org/wiki/c%C3%A2n) |
| w45 `rẽ phải` | (không có ghi chú) | thêm ghi chú “Miền Nam hay nói ‘quẹo phải’” (vi + en) | Cho nhất quán với w44 “rẽ trái / quẹo trái” | [Wiktionary: quẹo](https://en.wiktionary.org/wiki/qu%E1%BA%B9o) (Trung, Nam; Bắc: rẽ) |
| cs8 | Cho tôi hai **ly** cà phê | Cho tôi hai **cốc** cà phê | Câu gốc phải viết theo miền Bắc (quy ước của `localizeText`). “ly” là dạng Trung/Nam của d28, mà bài u3l1 lại hỏi ngay d28 cốc/ly. Sau khi sửa, ở chế độ Trung/Nam câu vẫn tự đổi thành “ly” | `dialects.json` d28; `dialectMap.ts` |
| hs1 (cảnh) | …gặp **anh** Nam (26 tuổi)… | …gặp Nam (nam, 26 tuổi)… | Đề cảnh lộ đáp án “anh”: chỉ có một lựa chọn kết thúc bằng “– anh”. Sửa theo kiểu của hs4, chỉ cho tuổi và giới tính | (logic bài) |
| hs3 (cảnh) | …mua dứa của **chị** bán hàng 30 tuổi | …mua dứa của một người bán hàng nữ 30 tuổi | Cùng lỗi lộ đáp án “chị” | (logic bài) |
| hs5 (cảnh) | …gọi món với **cậu** phục vụ 19 tuổi | …gọi món với một nam phục vụ 19 tuổi | Chữ “cậu” trong đề dễ kéo người học chọn nhiễu “tớ – cậu” | (logic bài; `situationDistractors`) |
| st1 câu hỏi 3 (nhiễu) | Nam không nói. | Nam mệt. | Nhiễu cũ gượng, không phải câu trả lời cho “Nam có khỏe không?” | (ngữ dụng) |
| st3 câu hỏi 3 | Đi chợ thế nào? | Muốn đến chợ thì đi thế nào? | “Đi chợ thế nào?” dễ hiểu thành “đi chợ ra sao / có vui không”. Câu mới hỏi rõ đường. Ở miền Trung câu đổi thành “…đi răng?”, miền Nam “…đi sao?” | (ngữ dụng; A7 d21 cho bản Trung/Nam) |
| t2 `la` | la, là, lá, **lả**, **lã**, lạ | la, là, lá, lạ | “lã” chỉ dùng trong từ ghép (nước lã). “lả” ít gặp khi đứng một mình (mệt lả, đói lả) | [Wiktionary: lã](https://en.wiktionary.org/wiki/l%C3%A3), [lả](https://en.wiktionary.org/wiki/l%E1%BA%A3) |
| t3 `bả` (en) | bait | poisoned bait | Nghĩa chính của bả là mồi tẩm thuốc độc (bả chuột), không phải mồi câu | [kaikki/Wiktionary: bả](https://kaikki.org/dictionary/Vietnamese/meaning/b/b%E1%BA%A3/b%E1%BA%A3.html), [VDict: bả](https://vdict.com/b%E1%BA%A3,2,0,0.html) |
| t4 `ca` (en) | to sing; shift | work shift; to sing (South) | Nghĩa “hát” là khẩu ngữ miền Nam. Nghĩa “ca làm” không mang nhãn vùng | [Wiktionary: ca](https://en.wiktionary.org/wiki/ca) |
| t5 `me` | me, mè, **mé**, mẻ, mẹ | me, mè, mẻ, mẹ | “mé” là khẩu ngữ, nghĩa “phía, bên” chứ không phải “edge”, lại ít gặp | [Wiktionary: mé](https://en.wiktionary.org/wiki/m%C3%A9) |
| t5 `mè` (en) | sesame | sesame (South; North: vừng) | “mè” là từ Trung/Nam. Ghi chú này khớp A7 d14 | [Wiktionary: mè](https://en.wiktionary.org/wiki/m%C3%A8), `dialects.json` d14 |
| t8 `tải` (en) | to load | to carry; to download | Từ điển ghi nghĩa “chuyên chở” và “tải xuống”, không có nghĩa “load” | [Wiktionary: tải](https://en.wiktionary.org/wiki/t%E1%BA%A3i) |

## Đúng sẵn, đã đối chiếu (giữ nguyên)

- **Từ vựng:** số đếm 1–10, chào hỏi, đại từ (anh/chị/em/ông/bà theo A6). “tính tiền” = “the bill, please”: Wiktionary ghi đây là thán từ gọi tính tiền, ví dụ “Em ơi, tính tiền!” ([Wiktionary](https://en.wiktionary.org/wiki/t%C3%ADnh_ti%E1%BB%81n)). Các ghi chú miền: “mắc” = đắt (Trung/Nam) ([Wiktionary: mắc](https://en.wiktionary.org/wiki/m%E1%BA%AFc)); “ngàn” dùng thường xuyên ở Trung/Nam ([Wiktionary: ngàn](https://en.wiktionary.org/wiki/ng%C3%A0n)); “khóm” = dứa ở miền Nam ([Wiktionary: khóm](https://en.wiktionary.org/wiki/kh%C3%B3m)), báo miền Tây cũng gọi khóm Cầu Đúc, khóm Tắc Cậu ([Tạp chí Công Thương](https://tapchicongthuong.vn/a-dang-san-pham-tu-khom-tac-cau-141784.htm)); “ký” = kilôgam trong cách nói miền Nam, báo địa phương viết “250 ký khóm khô”. Các nguồn tổng hợp đối chiếu Bắc–Nam cũng xác nhận đắt/mắc và dứa/thơm ([UH Mānoa Vietnamese 102](https://sites.google.com/a/hawaii.edu/pbll-vietnamese/vietnamese-102/project-3-language-awareness), [Vietcetera](https://vietcetera.com/en/from-north-centre-to-south-exploring-vietnams-linguistic-diversity)).
- **Câu cs1–cs7, cs9–cs11:** câu ngắn, trật tự chuẩn, đúng trình độ A1. cs6 là câu miền Nam có gắn nhãn sẵn.
- **st3:** câu “cho anh một phở bò và một trà đá” được giữ. Lối gọi món bỏ lượng từ này rất thường gặp ở quán miền Bắc. Nếu sau này muốn câu sách vở hơn có thể đổi thành “một bát phở bò”, nhưng như vậy khóa âm thanh của câu sẽ đổi.
- **t1, t6, t7:** mọi dạng là từ có thật và nghĩa ghi đúng: mã (quân mã; mã số), mạ (cây mạ), cọ (bàn chải; cây cọ), ban (ban, ủy ban), bản (bản sao; phiên bản)…

## Âm thanh dựng sẵn (D9): cần chạy lại `tts:prebuild`

Văn bản được đọc nằm ở `speakableTexts` (`packages/content/src/course/speakable.ts`). Câu hỏi truyện, đề cảnh tình huống và nghĩa tiếng Anh **không** được đọc, nên không cần dựng lại.

| Gói | Thay đổi | Việc cần làm |
|---|---|---|
| `u3`, miền **Bắc** | “Cho tôi hai ly cà phê” → “**Cho tôi hai cốc cà phê**” | Dựng mới câu này. Gói Trung/Nam không đổi, vẫn “…hai ly cà phê” |
| `tones` | Bỏ “lả”, “lã”, “mé” | Không có câu mới. Có thể xóa ba tệp thừa |

```powershell
pnpm --filter @vietlearning/gateway tts:prebuild -- --pack u3 --dialect north
```

## Kiểm thử

- Test nội dung: thay `reviewed === false` bằng kiểm tra kiểu boolean (`course.test.mjs`, `course-roleplay.test.mjs`, `situations-stories.test.mjs`), giống cách `data.test.mjs` làm cho phương ngữ và văn hóa.
- e2e: `gd2b.spec.ts` chờ đề cảnh mới “Nam (nam, 26 tuổi)”.
- Nhãn “chờ duyệt / bản nháp” của unit 1–3, câu ghép và kịch bản sc5–sc7 không còn hiện, vì UI chỉ hiện nhãn khi `!reviewed`.
- Kết quả: `pnpm build` 19/19, `pnpm test` 35/35, `pnpm lint:boundaries` không có vi phạm, e2e 97/97 (gateway cổng 4016, web cổng 4189).
