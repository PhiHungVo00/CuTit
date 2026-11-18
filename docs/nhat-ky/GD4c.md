# Nhật ký GĐ4c — Bạn học hợp tác (nhánh `claude/gd4-ban-be-78fb3c`)

Kế hoạch tổng: `docs/KE_HOACH_PHAT_TRIEN_TOAN_DIEN.md`, GĐ4 mục 3. **D7 = không**: không bảng xếp hạng, không league.
Mọi bước TDD: viết test đỏ trước rồi mới viết mã.

## 1. Thiết kế
- **Kết bạn bằng mã mời.** Tài khoản khách không có email hay tên thật, nên mỗi người tự đặt **tên hiển thị**.
  - Tên dài 2–24 ký tự: chữ (mọi ngôn ngữ, có dấu, NFC), số, khoảng trắng và `. _ - '`. Không cho link, `@`, emoji, ký tự điều khiển.
  - Mã mời 8 ký tự Crockford base32, dạng `XXXX-XXXX` (dùng chung bảng chữ với mã khôi phục).
  - Mã chỉ dùng **một lần**, hết hạn sau **48 giờ**. Mỗi người chỉ có một mã đang sống: tạo mã mới thì mã cũ chết.
  - Mỗi người tối đa **5 bạn**. Hủy kết bạn được, sau đó kết bạn lại được.
- **Nhiệm vụ tuần chung:** mỗi cặp bạn có một nhiệm vụ "cùng đạt N phút/tuần".
  - N chọn được 30, 60, 90 hoặc 120; mặc định 60. Người nào trong cặp đổi thì cả hai cùng thấy.
  - Tuần bắt đầu thứ Hai, tính theo ngày địa phương `today` mà client gửi (giống `/analytics/summary`).
  - Số phút lấy từ `daily_activity.seconds`, tức thời gian học đã đồng bộ qua `/v1/sync` (`activity.set`). Không cần sự kiện mới.
  - Giao diện chỉ có **một thanh "Chúng ta: X/N phút"**, không tách màu theo người. Thứ tự thành viên cố định: **mình trước, bạn sau**, không sắp theo đóng góp.
- **Streak chung** = số tuần liên tiếp cả cặp cùng đạt mục tiêu.
  - Tuần này chưa đạt thì đếm từ tuần trước.
  - Chỉ tính từ tuần kết bạn, nhìn lại tối đa 104 tuần.
- **Không lưu tiến độ hay streak.** Tất cả tính lúc đọc từ `daily_activity`. Xóa tài khoản (cascade) thì đóng góp mất theo, không còn bản sao nào.
  - Đánh đổi: đổi mục tiêu tuần thì streak cũ được tính lại theo mục tiêu mới.
- **Riêng tư:** phản hồi không chứa userId của ai (chỉ có id quan hệ bạn bè), không có lỗi, điểm, XP hay chi tiết bài. Có test quét chuỗi phản hồi để chặn các trường này.
- **Trẻ em (D4):** mọi route `/v1/friends*` gọi `assertSocialAllowed` (`apps/gateway/src/services/social/friends.ts`).
  - Hàm này đọc `users.account_type`, cột đã có từ GĐ0, nên **không cần đợi phiên chế độ trẻ em**.
  - Nếu là `child` thì trả 403 `social_not_allowed`.
  - Mã mời của tài khoản đã chuyển thành `child` cũng bị coi là `invite_invalid`.
  - Phía UI: panel chỉ hiện "Hồ sơ trẻ em không dùng tính năng bạn học". **Điểm nối cho phiên trẻ em:** khi client biết `account_type` thì ẩn luôn thẻ "Học cùng bạn bè" trong `ProgressScreen.tsx` (một điều kiện quanh `<section aria-labelledby="ct-friends">`).

## 2. Contract (Nguyên tắc 5) — `packages/contracts/src/api/friends.ts`
| Route | Ý nghĩa | Lỗi |
|---|---|---|
| `GET /v1/friends?today=` | tên của tôi, mã đang sống, danh sách bạn + nhiệm vụ | 403 |
| `PUT /v1/friends/profile` | đặt tên hiển thị | 400 tên sai |
| `POST /v1/friends/invite` | mã mới (thay mã cũ) | 409 `display_name_required` |
| `POST /v1/friends/accept?today=` | nhập mã ⇒ nhiệm vụ của cặp mới | 404 `invite_invalid` (sai, hết hạn hay đã dùng đều trả cùng lỗi), 400 `self_invite`, 409 `already_friends` / `friend_limit` |
| `PUT /v1/friends/:id/goal?today=` | đổi mục tiêu chung | 400, 404 `friend_not_found` |
| `DELETE /v1/friends/:id` | hủy kết bạn | 404 |

- `api-client`: `request()` nhận thêm `method: 'DELETE'` (chỉ đổi kiểu, không thêm byte).
- **Rate limit:** `FRIEND_INVITE_RATE_LIMIT_PER_MINUTE` (mặc định 5) tính **riêng cho từng route** tạo mã và nhập mã, theo người dùng, nằm ngoài mức 60/phút chung. Có test 429.

## 3. DB — migration `0004_friend_quests`
- 3 bảng mới, mọi FK `ON DELETE CASCADE` về `users`. **Không sửa bảng `users`**, vì phiên trẻ em đang dùng 0003.
  - `social_profiles(user_id PK, display_name)`
  - `friend_invites(user_id PK, code UNIQUE, expires_at)`
  - `friendships(id, user_a < user_b, goal_minutes, created_at)`: unique theo cặp, có index trên `user_b`.
- Mã mời lưu **mã gốc**, không băm, để chủ mã mở lại app vẫn thấy mã. Lý do chấp nhận được: mã chỉ sống 48 giờ, dùng một lần, chỉ tạo được quan hệ bạn học, không đăng nhập được.
- Nhập mã chạy trong **một transaction**: `DELETE … WHERE code AND expires_at > now RETURNING`, rồi kiểm tra từng điều kiện. Lỗi nào cũng ném ra ⇒ rollback ⇒ **mã không bị tiêu** (có test cho `already_friends` và `friend_limit`).
- Sinh migration: `db:generate` ra `0003_friend_quests` vì main mới tới 0002. Tôi đã đổi tên tệp, snapshot và `tag` trong `_journal.json` thành **`0004_friend_quests`** (migrator đọc tệp theo tag).
  - **Khi gộp sau nhánh trẻ em (0003):** xóa 0004 cùng snapshot của nhánh này, lấy journal của main, chạy lại `pnpm --filter @vietlearning/gateway db:generate --name friend_quests`. SQL sinh ra sẽ giống hệt.

## 4. Giao diện — `apps/mfe-learner/src/friends/`
- Màn **Tiến độ (M9)** có thêm thẻ "Học cùng bạn bè" với nút "Mở bạn học". `FriendsPanel` là **chunk lười** (`React.lazy`), chỉ tải và chỉ gọi mạng khi bấm. Lý do: xem màn Tiến độ không được tự tạo tài khoản khách hay cần mạng.
- **Không thêm route nào ở host** (gói đầu chỉ còn ~60 B).
- Chuỗi vi/en của panel nằm trong `friends/i18n.ts`, cùng chunk lười. `src/i18n.ts` chỉ thêm 3 khóa cho thẻ ở M9.
- Luồng giao diện:
  1. Đặt tên hiển thị, kèm câu nói rõ bạn bè thấy gì.
  2. Tạo mã: có nút chép, hiện hạn dùng.
  3. Nhập mã của bạn bè.
  4. Mỗi bạn một thẻ nhiệm vụ: thanh "chúng ta", "còn N phút", 🎉 khi đạt, 🔥 streak tuần, phần đóng góp (mình trước), chọn mục tiêu, hủy kết bạn (có xác nhận).
- Lỗi được đổi theo `err.code` của Gateway thành câu dễ hiểu. 429 báo "đợi một phút".

## 5. Kiểm tra (2026-11-18)
- Contract: 3 test mới.
- Gateway: 11 test mới ở `test/friends.test.mjs`; toàn Gateway 97/97. Các test bao phủ:
  - Mã dùng một lần, thay mã cũ, mã của chính mình, đã là bạn, hết hạn.
  - Cộng dồn đúng tuần; mình đứng trước; không lộ userId, điểm hay XP.
  - Đổi mục tiêu; người ngoài cặp không đổi hay xóa được.
  - Streak (tuần trước khi kết bạn không tính).
  - Giới hạn 5 bạn ở cả hai phía; hủy kết bạn.
  - Trẻ em 403 ở mọi route.
  - **Xóa tài khoản ⇒ không còn bạn, mã, tên, quan hệ, hoạt động.**
  - Rate limit 429 riêng từng route.
- mfe-learner: 6 test `FriendsPanel` (tên sai, tạo/nhập mã, lỗi mã, đạt mục tiêu + streak + đổi mục tiêu + hủy, trẻ em, tiếng Anh).
- e2e `e2e/friends.spec.ts` (pixel-7, Gateway thật):
  - Hai hồ sơ trình duyệt riêng, mỗi máy có sẵn thời gian học hôm nay (20 và 45 phút), đồng bộ lên server.
  - Đặt tên, Lan tạo mã, Tom nhập mã viết thường có khoảng trắng.
  - **Cả hai thấy "Chúng ta: 65/60 phút", 🎉, 🔥 1 tuần, đóng góp mình trước.**
  - Lan đổi mục tiêu thành 90, Tom thấy 65/90.
  - Hủy kết bạn: cả hai không còn thấy nhau.
- Size: gói đầu 68,43/68,5 kB (+0,01 do 3 khóa i18n), M9 2,87/5 kB, **chunk mới `FriendsPanel` 4,52 kB** (ngân sách 5 kB, đã thêm vào `.size-limit.cjs`), CSS 7,63/7,8 kB.
- `pnpm lint:boundaries`: 0 vi phạm. `pnpm test` 35/35 task. **e2e toàn bộ: 80 đạt, 7 bỏ qua, 0 lỗi** (cổng 4186/4013).
- Bẫy e2e đã gặp: chạy cả bộ, màn Tùy chỉnh đôi khi mở trước khi bộ đồng bộ (khởi động lười) gắn trạng thái ⇒ không hiện “Đã sao lưu”. Lỗi có từ trước, không thuộc tính năng này. Test bạn học dùng `toPass` (tải lại + đồng bộ lại); chạy lặp 5/5 đạt.

## 6. Còn lại / ghi chú cho người gộp
- Tệp dễ xung đột: `apps/gateway/src/app.ts` (đăng ký `friendsRoutes`), `src/config.ts`, `packages/contracts/src/db/schema.ts` (bảng 20–22 ở cuối), `packages/contracts/src/api/index.ts`, `drizzle/meta/_journal.json`, `apps/host-shell/.size-limit.cjs`, `apps/mfe-learner/src/i18n.ts`, `ProgressScreen.tsx`.
- Chưa làm: nhóm 3 người trở lên (nhiệm vụ hiện theo từng cặp), thông báo khi bạn góp phút, đổi tên hiển thị sau khi đã đặt (API có sẵn `PUT /v1/friends/profile`, UI chưa có nút).
