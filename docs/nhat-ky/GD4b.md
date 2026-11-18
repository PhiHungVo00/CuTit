# Nhật ký GĐ4b — Chế độ trẻ em (D4) (nhánh `claude/gd4-tre-em-fc0faf`)

Phạm vi theo kế hoạch tổng (mục 9, D4): hồ sơ trẻ do phụ huynh tạo, không bảng xếp hạng/so sánh xã hội, không chat AI tự do (chỉ nhập vai có kịch bản), không camera/ghi âm gửi lên server khi chưa có đồng ý của phụ huynh, nhắc học do phụ huynh đặt. Làm theo TDD: contract → test Gateway (đỏ) → Gateway → client → e2e.

## 1. Dữ liệu & contract (Nguyên tắc 5)
- `account_type` (`adult`|`child`) + `parent_user_id` (FK `ON DELETE CASCADE`) đã có từ GĐ0. Migration **`0003_child_mode`**:
  - thêm `users.parent_media_consent_at`: thời điểm phụ huynh cho phép gửi ảnh/ghi âm, null = chưa cho hoặc đã thu hồi;
  - thêm index `users_parent_idx`.
- **Đồng ý của phụ huynh KHÔNG nằm ở bảng `consents`.** Token trẻ gửi được `consent.grant` bất kỳ qua `/v1/sync`, và bảng đó chỉ thêm, không thu hồi. Vì vậy cột trên chỉ đổi được bằng token phụ huynh. Có test cho trường hợp trẻ tự “đồng ý” qua sync: vẫn bị 403.
- **Server không lưu tên trẻ.** Biệt danh chỉ nằm trên máy (`becutit.family`), để giảm dữ liệu cá nhân của trẻ. Hồ sơ trẻ **không có mã khôi phục**: phụ huynh cấp phiên cho trẻ.
- `packages/contracts/src/api/family.ts`:
  - `AccountInfoSchema`, `ChildProfileSchema`, `ChildListResponseSchema`, `ChildConsentRequestSchema`;
  - `FAMILY_ERROR` (`child_free_chat_blocked`, `parent_consent_required`, `adult_only`, `child_limit_reached`);
  - `MAX_CHILDREN = 5`.

## 2. Gateway ép luật (client chỉ là lớp ngoài — Nguyên tắc 2)
- `request.principal.accountType` được nạp từ DB lúc xác thực, cùng truy vấn “user còn tồn tại”, cache 60 s. Principal ẩn danh tính là người lớn.
- **`apps/gateway/src/pipeline/accountPolicy.ts`** gom mọi luật để dùng lại (phiên Bạn bè gọi `requireAdult` cho tính năng xã hội):
  - `isChild`, `requireAdult` (403 `adult_only`);
  - `requireNotFreeChat` (403 `child_free_chat_blocked`);
  - `requireMediaConsent` (403 `parent_consent_required`). Đọc DB mỗi lần, không cache, nên thu hồi có hiệu lực ngay ở mọi instance.
- Chặn, luôn **trước** khi đọc tệp tải lên và trước khi trừ hạn mức:
  - `/v1/chat/turn`:
    - trẻ không có `scenarioId` ⇒ 403;
    - `mode:'call'` ⇒ 403 (gọi thoại là trò chuyện tự do);
    - `userAudioBase64` khi chưa có đồng ý ⇒ 403;
    - chặn trước nhánh SSE, nên lỗi vẫn là JSON.
  - `/v1/speech/transcribe`, `/v1/speech/assess`, `/v1/vision/label`: trẻ chưa có đồng ý của phụ huynh ⇒ 403.
  - `/v1/culture/ask` ⇒ 403 cho trẻ. **Quyết định:** đây là hỏi đáp tự do với LLM (dù có RAG). Trẻ vẫn đọc 20 thẻ văn hóa đã duyệt; ô hỏi bị ẩn.
  - `DELETE /v1/me` của trẻ ⇒ 403. Phụ huynh xóa hồ sơ trẻ.
- **Hạn mức thấp hơn:**
  - `CHILD_MAX_CHAT_TURNS_PER_DAY=15` (người lớn 60);
  - `CHILD_AI_LIMIT_PERCENT=40` (token LLM, giây STT, ký tự TTS, ảnh);
  - `pipeline.limitFor(req, cap)`. `/v1/quota` và `turnsLeft` báo đúng hạn mức của trẻ.
- **API gia đình** (`routes/family.ts`, chỉ người lớn; hồ sơ không phải con mình ⇒ 404):
  - `GET /v1/me/account`;
  - `POST|GET /v1/family/children`;
  - `POST /v1/family/children/:id/session` (cấp token cho trẻ);
  - `PUT /v1/family/children/:id/consent`;
  - `GET /v1/family/children/:id/summary`;
  - `DELETE /v1/family/children/:id`.
- **Xóa tài khoản phụ huynh:** DB cascade xóa luôn hồ sơ trẻ. `deleteUser` còn ghi “bia mộ” cho credential của trẻ và trả mọi id đã xóa (`string[]`) để bỏ cache. Máy của trẻ nhận `account_deleted`, không phải `invalid_*`. Giao diện cảnh báo “Tài khoản này đang quản lý N hồ sơ trẻ…”.
- Test: `apps/gateway/test/family.test.mjs`, 8 test, viết trước khi có code (đỏ 404). Toàn bộ gateway 94/94.

## 3. Client
- **Chuyển hồ sơ trên máy:**
  - `session.switchToChild(tokens)` cất phiên phụ huynh (`becutit.auth.parent`). `switchToParent()` trả lại phiên đó. `parentInfo()` đọc phiên đang cất.
  - Chỉ chuyển qua `SyncEngine.pullAndReplace`, sau khi đã gửi hết hàng đợi (gửi lại tới khi `pending=0`, vì đồng hồ học có thể thêm sự kiện giữa chừng). Lý do: nếu đổi token theo đường khác, nhánh “owner đổi” sẽ tải dữ liệu của phụ huynh lên hồ sơ trẻ.
  - **Mất mạng ⇒ không cho chuyển** (dữ liệu của mỗi hồ sơ nằm ở server).
  - Hồ sơ trẻ refresh hỏng ⇒ lỗi `child_session_expired`, **không** tạo khách người lớn mới (nếu tạo thì thoát được chế độ trẻ).
  - Hồ sơ trẻ bị phụ huynh xóa ⇒ máy quay về phiên phụ huynh.
- **`@vietlearning/state/family`** (subpath, không re-export từ index):
  - `familyStore`: mode, đồng ý media, biệt danh, số hồ sơ trẻ, PIN;
  - `useIsChild()`, `useMediaAllowed()`, `familyErrorText()`.
  - Loại tài khoản lấy từ `GET /v1/me/account` mỗi lần khởi động đồng bộ, nên tài khoản trẻ khôi phục vẫn bị khóa.
- **Cổng phụ huynh:**
  - PIN 4–8 chữ số, lưu **PBKDF2-SHA256 210k vòng + muối 16 byte**, không lưu PIN thô; so sánh thời gian hằng.
  - Sai 3 lần ⇒ khóa 30 s, sau đó gấp đôi mỗi lần (tối đa 15 phút).
  - Quên PIN ⇒ nhập mã khôi phục của tài khoản phụ huynh đang cất trên máy.
- **Mục Gia đình** `/tuy-chinh?muc=gia-dinh` (nạp lười từ chunk Tùy chỉnh, không thêm route vào bundle đầu):
  - đặt PIN, tạo hồ sơ (biệt danh chỉ lưu trên máy);
  - “Dùng hồ sơ này”, xem tiến độ (phút/tuần, chuỗi ngày, % đúng, thẻ cần ôn);
  - công tắc “Cho phép gửi ảnh và giọng nói” kèm giải thích, xóa hồ sơ có xác nhận.
- **Khóa giao diện** (lời thân thiện, song ngữ vi/en):
  - `/hoi-thoai` ⇒ màn khóa gợi ý “Đi nhập vai”;
  - `/goi-thoai` ⇒ chuyển về `/hoi-thoai`;
  - `/camera` khi chưa có đồng ý ⇒ màn khóa riêng;
  - micro trong nhập vai ⇒ “Bé gõ chữ để trả lời nhé”;
  - bài nói lại câu ⇒ “cần bố mẹ cho phép… bấm bỏ qua”;
  - ô hỏi văn hóa bị ẩn.
- Tùy chỉnh của hồ sơ trẻ: không hiện mã khôi phục, khôi phục hay xóa tài khoản, chỉ có “Đổi hồ sơ (cần bố mẹ)”.
- **Nhắc học do phụ huynh đặt:** lịch nhắc là của máy (`packages/native` reminders, không đồng bộ). Phụ huynh đặt ở hồ sơ của mình. Hồ sơ trẻ chỉ xem giờ nhắc, không có nút đổi.
- **Bảng xếp hạng/so sánh xã hội:** chưa có tính năng nào. Phiên Bạn bè (0004) dùng `requireAdult` ở server và `useIsChild()` ở client. Đã ghi chú trong thư mục ghi chú chung.

## 4. Ngân sách tải
- Bundle đầu **68.48/68.5 kB**. Bài học rút ra: mỗi chunk lười mới, kể cả lồng nhau, thêm một tên tệp vào bản đồ preload của `app-*.js` (~30 B). Vì vậy:
  - không thêm route `/gia-dinh`;
  - `ChildLock` chỉ dùng trong ChatRoute, camera có màn khóa riêng;
  - chuỗi lỗi chế độ trẻ đặt ở `state/family`, không ở `api-client` (bảng lỗi của api-client nằm trong bundle đầu, đo +250 B).
- Đã thử `manualChunks` để gộp chunk: **hỏng**. Rollup kéo zustand vào chunk `family`, chunk này bị modulepreload ngay từ đầu (số đo giả 65.5 kB). Đã bỏ cách này.
- `PathHomeRoute` 3.3 → **3.4 kB** (lazy): giờ nhắc chỉ xem ở hồ sơ trẻ, đo 3.31 kB.

## 5. Kiểm chứng
- `pnpm build` ✔, `pnpm test` 35/35 task ✔ (gateway 94, state 39, api-client 18, AccountSection 7 …), `pnpm lint:boundaries` ✔, `size` ✔.
- e2e 80/80, chạy 3 lần liên tiếp. Mới: `e2e/family.spec.ts` với Gateway thật, cổng 4012/4185, không mock endpoint bị chặn. Luồng:
  1. phụ huynh tạo mã khôi phục, đặt PIN, tạo hồ sơ “Bin”, chuyển sang hồ sơ đó;
  2. `/hoi-thoai`, `/goi-thoai`, `/camera` đều khóa;
  3. token trẻ gọi thẳng Gateway: chat tự do 403, gọi thoại 403, ảnh 403, nhập vai 200;
  4. PIN sai bị từ chối, PIN đúng đưa máy về phụ huynh với đúng mã khôi phục cũ.
- Lần chạy đầu e2e có 1 lỗi chập chờn: thoát hồ sơ trẻ báo “cần mạng”. Nguyên nhân khả dĩ: sự kiện đồng hồ học vào hàng đợi giữa lúc gửi. Đã sửa bằng cách gửi lại tới khi hàng đợi rỗng; sau đó 3 lần liên tiếp đều xanh.

## 6. Chờ quyết định (pháp lý — KHÔNG tự chốt)
- **Ngưỡng tuổi.** Nghị định 13/2023 coi trẻ em là dưới 16 tuổi (Điều 20: cần đồng ý của cha mẹ, và của trẻ nếu trẻ từ 7 tuổi). COPPA (Mỹ) là dưới 13. App chưa hỏi tuổi. Có cần cổng tuổi khi tạo tài khoản không?
- **PIN trên máy có đủ là “đồng ý có thể kiểm chứng của cha mẹ”** (verifiable parental consent theo COPPA / Điều 20 NĐ13) không? Hiện chỉ ghi thời điểm đồng ý ở server và log `parent media consent changed`, chưa có bằng chứng danh tính phụ huynh.
- **Ảnh/giọng nói của trẻ gửi Google Gemini** (máy chủ có thể ở ngoài Việt Nam). Cần quyết:
  - điều khoản của nhà cung cấp có cho dùng với người dùng dưới 18 không;
  - có cần đánh giá tác động chuyển dữ liệu ra nước ngoài không.
  - Tạm thời mặc định TẮT cho đến khi phụ huynh bật.
- **Nhập vai AI của trẻ** vẫn gửi chữ trẻ gõ tới LLM (theo D4: “chỉ nhập vai có kịch bản”). Cần quyết: có cần lọc nội dung/thông tin cá nhân trong chữ trẻ gõ không.
- **Chính sách quyền riêng tư** (bản nháp `/quyen-rieng-tu`) chưa có mục về trẻ em. Cần người phụ trách viết sau khi chốt các điểm trên.
- **Thời gian lưu dữ liệu của trẻ** khi phụ huynh ngừng dùng: hiện giữ cho tới khi xóa, giống người lớn.

## 7. Ghi chú gộp
- Migration `0003_child_mode` (phiên Bạn bè dùng 0004). Khi gộp: sinh lại journal drizzle.
- File chung có thể đụng phiên khác:
  - gateway: `app.ts`, `RequestPipeline.ts`, `routes/{chat,speech,content,me,quota}.ts`, `services/learner/repo.ts` (`deleteUser` trả `string[]`);
  - client: `packages/api-client/src/session.ts` (`UserChangeReason` thêm `'switched'`), `apps/host-shell/src/account/bootstrap.ts`, `PreferencesRoute.tsx`, `mfe-learner/AccountSection.tsx`, `mfe-path/GoalPanel.tsx`, `.size-limit.cjs`.
