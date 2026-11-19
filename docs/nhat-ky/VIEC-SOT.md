# Nhật ký VIỆC SÓT: các mục “còn mở” kỹ thuật của GĐ3–GĐ4 (nhánh `claude/viec-ky-thuat-sot-e94bc4`)

Gom bốn mục kỹ thuật không cần người quyết, ghi rải rác trong `GD4a.md` mục 5, `GD4c.md` mục 6 và `NOI-TIEN-DO.md`. Làm theo TDD: viết test đỏ trước, rồi mới sửa.

## 1. Giới hạn 5 bạn bị vượt khi nhập mã đồng thời (GĐ4c mục 6)

**Lỗi.** `acceptInvite` đếm số bạn trong transaction nhưng không khóa gì. Trên Postgres thật (READ COMMITTED, nhiều kết nối), hai lượt nhập mã cùng chạm một người đều đếm được 4 rồi cùng chèn ⇒ 6 bạn.

**Tái hiện (đỏ).** Test mới `apps/gateway/test/friends-concurrency.test.mjs` chạy được trên cả hai DB:
- Mặc định chạy PGlite (`memory://`).
- Đặt `TEST_DATABASE_URL` thì chạy Postgres thật. Lần này dùng Docker `postgres:16-alpine` ở cổng 55432.

Ba ca kiểm tra:
1. Người có 4 bạn nhập 6 mã cùng lúc.
2. Phía người mời: người có 4 bạn vừa được nhập mã, vừa tự nhập mã người khác cùng lúc.
3. 6 người kết bạn vòng tròn cùng lúc (kiểm tra không deadlock).

Trước khi sửa, trên Postgres:
- Ca 1 có **2** lượt thành công (`200,200,409,…`).
- Ca 2 có **4** lượt thành công.

PGlite vẫn đạt vì nó chỉ có một kết nối, nên transaction luôn chạy tuần tự. Vì vậy phải có test trên Postgres thật.

**Sửa.** Sau khi “giữ” mã mời, khóa hai hàng `users` (người nhập và người mời) theo thứ tự id, rồi mới đếm:
- Câu lệnh: `SELECT id FROM users WHERE id IN (a,b) ORDER BY id FOR NO KEY UPDATE`.
- Hai lượt chạm cùng một người phải chờ nhau. Lượt sau đếm lại (câu lệnh mới trong READ COMMITTED) nên thấy bạn mới của lượt trước.
- Khóa theo thứ tự id cố định ⇒ không deadlock.
- Dùng `NO KEY UPDATE` thay `UPDATE`: hai lượt vẫn loại trừ nhau, nhưng không chặn các insert có khóa ngoại tới `users` (đồng bộ, `daily_activity`…), vì các insert đó chỉ lấy `KEY SHARE`.

**Sau khi sửa:** Postgres 3/3, chạy lặp 3 lần đều đạt. PGlite 3/3. `friends.test.mjs` cũ vẫn 12/12.

Chạy lại trên Postgres:
```
docker run -d --name pg -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:16-alpine
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/postgres node --test apps/gateway/test/friends-concurrency.test.mjs
```
(Chạy sau `pnpm build`, vì test đọc `dist/`.) Khi không đặt biến, `pnpm test` chạy bản PGlite, nên CI không cần Docker.

## 2. Đổi tên hiển thị bạn học (GĐ4c)

API `PUT /v1/friends/profile` đã có từ trước. Lần này thêm UI trong `FriendsPanel`:
- Cạnh câu “Bạn bè thấy bạn là: …” có nút **Đổi tên** / **Change name**.
- Bấm vào mở lại form tên hiển thị, điền sẵn tên cũ, có nút **Lưu tên** và **Thôi**.
- Lưu thành công thì form đóng và hiện tên mới. Tên sai thì báo lỗi, form vẫn mở.

Form lần đầu và form đổi tên dùng chung một hàm `nameForm()`. Chuỗi mới nằm trong `friends/i18n.ts` (chunk lười), có vi + en.

Test:
- Unit: thêm 2 ca và 1 ca tiếng Anh ⇒ `FriendsPanel` 8/8.
- e2e `friends.spec.ts`: Tom đổi tên thành “Tommy” ⇒ máy của Lan thấy “Bạn và Tommy”.

## 3. Link chính sách trong hộp đồng ý micro (NOI-TIEN-DO)

GĐ3 **chưa** làm mục này. Có hai hộp đồng ý ghi âm:
- `apps/mfe-conversation/src/chat/VoiceConsent.tsx`: dùng chung cho chat M1, nhập vai M7 và gọi thoại. Thêm `<Link to="/quyen-rieng-tu">` “Đọc chính sách quyền riêng tư / Read the privacy policy”. Test mới `VoiceConsent.test.tsx` (3 ca). e2e `conversation.spec.ts` kiểm tra link trong hộp của màn gọi thoại.
- `packages/exercises/src/speak/SpeakExercise.tsx`: hộp đồng ý của bài Nói trong lộ trình. Gói `exercises` có thể chạy không có Router (test, dev riêng), nên thêm `PolicyLink`: dùng `useInRouterContext()`, có Router thì dùng `Link`, không có thì dùng thẻ `<a>` thường. Thêm phụ thuộc `react-router-dom` (cùng bản `^6.30.6` với các MFE). Thêm 1 ca test, chạy cả có lẫn không có Router.

## 4. Nút 🐢 đọc chậm cho các nút nghe riêng (GĐ4a mục 5)

- Hệ số đọc chậm chuyển vào `packages/state`: `SLOW_FACTOR = 0.75`. `coursePlayer.SLOW_RATE` giờ lấy từ đây, nên lộ trình và các MFE dùng cùng một hệ số.
- Mỗi MFE có `src/listen.tsx` riêng (Nguyên tắc 7: không import chéo remote), gồm:
  - `say(text, base, slow)`: đọc bằng TTS của máy, tốc độ = tốc độ M12 × tốc độ gốc của màn × (0,75 nếu chậm).
  - `<SlowListen>`: nút 🐢 với aria-label song ngữ.
- Gắn vào:
  - M5 Luyện tập: “Nghe lại” (bài nghe chọn), “Nghe mẫu” (bài đọc lại). M8 Ghép câu: 🔈 sau khi ghép đúng.
  - M9 Ôn thẻ (`ReviewSession`).
  - M4 Camera: mỗi nhãn từ.
  - Chat M1 / nhập vai M7: mỗi tin của gia sư (dùng chung `ChatPanel`).
  - Gọi thoại đã có nút “🐢 Nói chậm lại” từ GĐ3, không đổi.
- Test: `listen.test.tsx` ở 4 MFE (3 ca mỗi MFE: tốc độ chậm, tốc độ M12 vẫn áp dụng, tiếng Anh). e2e `app.spec.ts` M5 kiểm tra có nút “Nghe chậm” ở bài đọc lại.

## 5. Kiểm tra

| Lệnh | Kết quả |
|---|---|
| `pnpm build` | 19/19 |
| `pnpm test` | (điền sau) |
| `pnpm lint:boundaries` | 0 vi phạm (410 module) |
| `pnpm --filter @vietlearning/host-shell size` | gói đầu **64.17 / 64.5 kB** (+50 B so với 64.12, do hằng `SLOW_FACTOR` nằm trong chunk `state` dùng chung); mọi chunk khác trong ngân sách |
| e2e (cổng 4190/4017) | (điền sau) |

## 6. Còn lại

- Chưa chạy thử trên emulator. Thay đổi lần này chỉ ở UI web và gateway, không đụng plugin native mới; nút 🐢 dùng lại `getDeviceSpeech().speak` đã chạy được.
- Test Postgres không chạy trong `pnpm test` mặc định (cần Docker). Muốn chạy thì đặt `TEST_DATABASE_URL`.
