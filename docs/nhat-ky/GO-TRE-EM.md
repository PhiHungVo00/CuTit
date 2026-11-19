# Nhật ký — Gỡ chế độ trẻ em (nhánh `claude/go-che-do-tre-em-eaf07a`, 19/11/2026)

## 0. Quyết định
Người dùng đổi **D4** (19/11): “đối tượng dùng app bao hàm trẻ em” nghĩa là **trẻ dùng app như mọi người**, không đặt luật hạn chế riêng.
Vì vậy gỡ hẳn chế độ trẻ em của GĐ4b (`docs/nhat-ky/GD4b.md`, gộp ở `0b31e48`) và phần chặn trẻ em của Bạn học (GĐ4c).
Kế hoạch tổng đã cập nhật: `docs/KE_HOACH_PHAT_TRIEN_TOAN_DIEN.md` (GĐ4 mục 4, mục 9 D4, bảng quyết định).
Các điểm pháp lý “chờ quyết định” ở `GD4b.md` mục 6 (ngưỡng tuổi, đồng ý có thể kiểm chứng của cha mẹ, ảnh/giọng trẻ gửi Gemini, lọc chữ trẻ gõ, mục trẻ em trong chính sách, thời gian lưu) **không còn áp dụng** cho tính năng nào.

## 1. Cách làm
`git revert -m 1 --no-commit 0b31e48` để có danh sách thay đổi chính xác, rồi:
- giữ lại những gì KHÔNG được đảo: migration `0003_child_mode` + snapshot + journal (đã phát hành), mẫu âm thanh `docs/d9-tts-mau/*` (đi cùng nhánh đó nhưng là của D9), `GD4b.md`, nhật ký tổng;
- giải xung đột với code sinh ra sau GĐ4b (`friendsRoutes`, ngân sách `PathHomeRoute` 3.45 kB của R10);
- giữ `method: 'DELETE'` trong `api-client` (GĐ4b thêm, nhưng Bạn học dùng cho “hủy kết bạn”);
- gỡ tay phần chặn trẻ em của Bạn học (không nằm trong merge GĐ4b).
Commit cuối là commit thường, không phải commit “Revert …”.

## 2. Đã gỡ
**Contracts (Nguyên tắc 5, sửa trước):**
- `packages/contracts/src/api/family.ts` và export (`AccountInfoSchema`, `ChildProfileSchema`, `FAMILY_ERROR`, `MAX_CHILDREN`…);
- `FriendErrorCode.notAllowed` (`social_not_allowed`);
- `users.parentMediaConsentAt` + index `users_parent_idx` trong schema.

**Gateway:**
- `pipeline/accountPolicy.ts` và mọi chỗ gọi (`/v1/chat/turn`, gọi thoại, `/v1/speech/transcribe|assess`, `/v1/vision/label`, `/v1/culture/ask`, `DELETE /v1/me`);
- `principal.accountType` (chỉ để phục vụ chế độ trẻ; xác thực quay lại kiểm tra “user còn tồn tại”, cache 60 s như GĐ0);
- `CHILD_MAX_CHAT_TURNS_PER_DAY`, `CHILD_AI_LIMIT_PERCENT`, `pipeline.limitFor` (quota/turnsLeft dùng `pipeline.limit`);
- `routes/family.ts` (`GET /v1/me/account`, `/v1/family/*`), `test/family.test.mjs`;
- `deleteUser` quay lại bản GĐ0 (trả `boolean`, không còn bia mộ credential của hồ sơ trẻ);
- Bạn học: `assertSocialAllowed`, kiểm tra “người mời là child ⇒ invite_invalid”, test “tài khoản trẻ em 403”.

**Client:**
- `@vietlearning/state/family` (`familyStore`, `useIsChild`, `useMediaAllowed`, `familyErrorText`) + test + subpath trong `package.json`;
- `session.switchToChild/switchToParent/parentInfo`, khóa `becutit.auth.parent`, lý do `'switched'`, lỗi `child_session_expired`
  (`packages/api-client/src/session.ts`) + test. **Giữ nguyên GĐ0:** tạo khách lười, refresh xoay vòng, cứu bằng mã khôi phục, `account_deleted`;
- host: `account/family.ts`, `familyI18n.ts`, `FamilyRoute.tsx`, `ChildLock.tsx`, màn khóa camera, chuyển hướng gọi thoại, nhánh `?muc=gia-dinh` của Tùy chỉnh,
  `refreshAccountInfo` + `GET /v1/me/account` trong `account/bootstrap.ts`, `familyStore.resetFamily()` trong `onLocalReset`;
- khóa micro trong chat/nhập vai (`ChatPanel`), bài nói lại câu (`SpeakExercise`), ẩn ô hỏi văn hóa, mục Gia đình + cảnh báo “đang quản lý N hồ sơ trẻ” trong `AccountSection`,
  giờ nhắc “chỉ xem” (`GoalPanel`), chuỗi i18n tương ứng (vi + en) và test;
- Bạn học: prop `onBlocked`, trạng thái `child` của `FriendsPanel`, chuỗi `childBlocked`, ẩn thẻ trong `ProgressScreen`;
- e2e `family.spec.ts`. `pullAndReplace` (GĐ0, khôi phục tài khoản) vẫn giữ.

## 3. Dữ liệu
- **Không sửa migration đã phát hành.** Migration mới `0005_drop_child_mode` (`pnpm --filter @vietlearning/gateway db:generate --name drop_child_mode`):
  `DROP INDEX "users_parent_idx"; ALTER TABLE "users" DROP COLUMN "parent_media_consent_at";`. `when` của 0005 lớn hơn mọi mục trước trong journal (DB cũ sẽ chạy nó).
  Đã chạy thật trên PGlite cũ của Gateway emulator (không lỗi).
- **Giữ** `users.account_type` (mặc định `adult`) và `users.parent_user_id` (FK cascade) từ GĐ0: schema nền, vô hại, không code nào đọc nữa (ghi chú trong `schema.ts`).
  Hàng `child` cũ trên DB dev (nếu có) giờ là tài khoản bình thường. Nếu sau này muốn bỏ hai cột: một migration nữa, không gấp.
- Khóa cũ trên máy dev đã từng dùng chế độ trẻ (`becutit.family`, `becutit.auth.parent`) thành rác vô hại; không viết code dọn (chưa phát hành bản nào có chế độ trẻ).

## 4. Kiểm chứng
| Bước | Kết quả |
|---|---|
| `pnpm build` | 19/19 |
| `pnpm test` | 35/35 task, 0 lỗi |
| `pnpm lint:boundaries` | 0 vi phạm (400 module) |
| `size` | đạt hết. Đo cùng máy với bản gốc `main` (`d5a6acf`): **gói đầu 64.16 → 64.11 kB**; Chat 1.28 kB → 743 B, Tùy chỉnh 4.13 → 3.77 kB, Tiến độ 3.09 → 3.04 kB, Văn hóa 2.54 → 2.50 kB; bớt 2 chunk, `dist/assets` 911.5 → 884.7 kB (chưa nén) |
| e2e (cổng 4192/4019) | 95/95 đạt (một lần chạy trọn). Hai lần khác mỗi lần 1 lỗi ở `app.spec` “nhập giọng nói: thu âm → gửi WAV” (tiếng Anh): khi máy bận, bản ghi 900 ms ra < 10 000 byte. Chạy riêng tuần tự ×10 (2 biến thể): 20/20 đạt ⇒ chập chờn theo tải, không liên quan (đường micro chỉ bỏ một kiểm tra luôn đúng với người lớn). Không sửa test |
| APK + emulator `BeCuTit_Pixel_API35` (cài mới, Gateway 4021, Gemini thật) | Tùy chỉnh không còn mục Gia đình; tạo tài khoản ⇒ hiện mã khôi phục; `POST /v1/auth/guest`, 16 lượt `/v1/sync`, không còn gọi `/v1/me/account`; `/hoi-thoai` không khóa, gửi “Cho toi mot bat pho” ⇒ sửa dấu + Cu Tít trả lời bằng Gemini (lượt đầu Gemini quá giờ ⇒ trả lời mẫu, lượt sau thật); `/camera` hiện nút mở camera/chọn ảnh, không màn khóa; 0 phản hồi 4xx/5xx. Đã tắt đúng PID emulator/Gateway đã mở |

## 5. Ghi chú gộp
- Không đụng tệp của PR CI/CD (`.github/workflows/ci.yml`, `gd2.spec`, `gd2b.spec`, perf, test `audio-dsp`).
- Migration 0005: nếu phiên khác cũng thêm 0005, sinh lại journal khi gộp như thường lệ.
- `apps/host-shell/.size-limit.cjs`: chỉ bỏ dòng chú thích GĐ4b; chưa hạ ngân sách (để người gộp quyết sau khi đo trên main).
