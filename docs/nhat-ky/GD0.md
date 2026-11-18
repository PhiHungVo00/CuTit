# Nhật ký GĐ0 — Nền móng (DB + tài khoản khách + đồng bộ)

> Nhánh: `claude/gd0-nen-mong-70509e` (từ `main` @ `9300083`). Plan chi tiết: `docs/superpowers/plans/2026-11-17-gd0-nen-mong.md`.
> Tệp riêng để tránh xung đột merge; phiên điều phối sẽ gộp vào `docs/NHAT_KY_CHUYEN_DOI_MOBILE.md`.

## Việc đã làm

| # | Commit | Nội dung | Kiểm chứng |
|---|---|---|---|
| 1 | `335378b` | Plan chi tiết 10 task (TDD) | — |
| 2 | `0f436b1` | **Schema DB viết lại theo R4** (`packages/contracts/src/db/schema.ts`): `users.email` null, `is_guest`, `account_type`, `parent_user_id`, `recovery_code_hash`, `deleted_at`; `preferences.speed real` + `ui_language`; `srs_cards` có `front/back/source` + unique `(user_id,item_ref)`; bảng mới `consents`, `refresh_tokens`, `xp_events` (chỉ thêm), `daily_activity`, `lesson_progress`, `achievements`, `sync_events` (sổ chống trùng). Mọi FK tới `users` là `ON DELETE CASCADE`. Migration **`apps/gateway/drizzle/0000_init.sql`** (drizzle-kit 0.30.6, drizzle-orm 0.39.3). DB mở **lười**: `DATABASE_URL` → postgres-js, không có → PGlite (`memory://` khi test, `apps/gateway/.data/pglite` khi dev, đã gitignore); migration tự chạy lúc mở. **R13:** `turbo.json` `"agentGuidance": false` | `db.test.mjs` (cascade sạch). Đã kiểm tra chỉ còn **một** bản drizzle-orm trong lockfile (`pnpm dedupe`), tránh lệch kiểu giữa contracts và gateway |
| 3 | `43c73a5` | **Contract** `packages/contracts/src/api/account.ts`: `AuthGuestResponse` (token + `recoveryCode`), `AuthRefreshRequest`, `AuthRecoverRequest` (chuẩn hóa mã: bỏ gạch/khoảng trắng, O→0, I/L→1), `SyncEvent` (9 loại, `clientEventId` uuid + `at`), `SyncRequest` ≤ 200, `ProgressSnapshot`, `SyncResponse`, `DeleteMeResponse`. Ghi chú hình dạng sự kiện GĐ1 vào thư mục ghi chú chung | 2 test contracts |
| 4 | `18c8ead` | **Auth**: `POST /v1/auth/guest|refresh|recover` (ngoài hook xác thực, giới hạn theo IP `AUTH_RATE_LIMIT_PER_MINUTE`=10). Access JWT 15 phút `{sub, typ:'access'}`; refresh token 32 byte lưu sha256, **xoay vòng** (dùng lại ⇒ 401); mã khôi phục 16 ký tự Crockford base32 (80 bit) lưu sha256. **`AUTH_REQUIRED` mặc định bật ở mọi môi trường**; dev/test thiếu `JWT_SECRET` ⇒ sinh ngẫu nhiên mỗi lần chạy (client tự làm mới bằng refresh token trong DB), production thiếu ⇒ không khởi động. Token của user không còn ⇒ 401 `account_deleted` (cache 60 s, xóa ngay khi `DELETE /me`). Test cũ của route AI đặt `AUTH_REQUIRED:'false'` (principal ẩn danh chỉ còn cho test cô lập) | 6 test auth |
| 5 | `dc0399d` | **Thay mock bằng DB**: `/srs/due`, `/analytics/summary?today=` (streak theo ngày ĐỊA PHƯƠNG client gửi), `GET/PUT /preferences`. **`POST /v1/sync`**: mỗi sự kiện ghi sổ `sync_events` + tác dụng trong CÙNG transaction ⇒ gửi lại không nhân đôi; LWW cho hồ sơ/tùy chỉnh/thẻ; giây học lấy max; XP chỉ thêm; bài học giữ `completed` + điểm cao nhất. **`DELETE /v1/me`** xóa cứng (cascade cả `xp_events`). **A5** lưu ở `placement_sessions` (`advance()` thuần + lọc theo user; sessionId của người khác ⇒ 404) | `learner.test.mjs` 4, `sync.test.mjs` 6, placement HTTP có ca 404 |
| 6 | `326869a` | **Client phiên khách** `@vietlearning/api-client/session`: tạo khách lười, single-flight, refresh → (401) khôi phục bằng mã đã lưu → (vẫn 401) khách mới; mất mạng ⇒ lỗi `offline` ngay. Core client: `onUnauthorized` ⇒ gửi lại đúng một lần | 6 test |
| 7 | `5097c0a` | **Outbox local-first** `@vietlearning/state/sync` (tệp mới, `index.ts` KHÔNG sửa): so store với “bóng” lưu bền ⇒ sự kiện; gộp theo khóa; con trỏ thời gian cho attempts (mảng cắt 1000); áp snapshot vào store + bóng cùng lúc; đổi tài khoản (khôi phục/xóa) là thao tác nguyên tử (`pullAndReplace(fn)`, `resetLocal(fn)`), lỗi ⇒ giữ nguyên dữ liệu; `enqueueSyncEvent()` cho GĐ1 | 7 test |
| 8 | `ad07bcd` | **Host + M12**: `getToken/onUnauthorized` qua chunk lười `account/bootstrap` (app native lưu phiên bằng **Capacitor Preferences**, web localStorage); engine chạy sau `load`. M12 mục “Tài khoản & sao lưu”: mã khôi phục (sao chép), trạng thái đồng bộ, “Đồng bộ ngay”, khôi phục trên máy này, **“Xóa tài khoản và dữ liệu”** xóa thật trên server (mất mạng ⇒ báo, không xóa local). Bản ghi đồng ý đi theo outbox lên `consents`. Chuỗi vi + en. **Ngân sách bundle đầu 68 → 68.5 kB** (đo 68.12 kB; phần tăng là wiring auth + retry 401 + map chunk lười; Zod/phiên/sync đều nằm ở chunk lười) | vitest AccountSection 5 |
| 9 | `c0442cf` | **e2e với Gateway thật**: Playwright chạy kèm `node apps/gateway/dist/index.js` (PGlite RAM, không AI, không đọc khóa Gemini, cổng qua `E2E_PORT`/`E2E_GATEWAY_PORT`, không dùng lại server có sẵn). `e2e/sync.spec.ts`: lưu thẻ → mất mạng → thêm thẻ → có mạng ⇒ server đúng 2 thẻ không trùng; tải lại còn; hồ sơ trình duyệt mới nhập mã ⇒ thấy đủ thẻ; xóa tài khoản ⇒ mã hết hiệu lực, máy sạch | **e2e 49 passed, 2 skipped** (sync spec chỉ chạy ở pixel-7) |
| 10 | (commit này) | `AGENTS.md` theo kiến trúc thật (R9): bỏ “Module Federation” runtime, thêm `api-client`, `native`, `state`, mục “Lệch TDD có chủ đích”, lệnh boundaries/migration/e2e; giữ khối turbo | `pnpm build` xong ⇒ `git status` sạch |

| 11 | (commit sau) | **Sau review:** (a) khôi phục dở dang (đã đổi tài khoản nhưng kéo dữ liệu lỗi/app bị tắt) ⇒ cờ `replacePending` lưu bền: không đưa dữ liệu máy cũ lên tài khoản mới, lần sau chỉ kéo + thay; (b) `at` của client bị chặn ở “bây giờ” của server (đồng hồ máy chạy nhanh không thắng LWW mãi); (c) e2e người dùng cũ: dữ liệu `becutit.learner` có từ trước GĐ0 được tải lên server; (d) M12 hiện mã khôi phục ngay khi có tài khoản; (e) chạy thật Gateway với PGlite **trên đĩa** ở đường dẫn mặc định (có dấu tiếng Việt + khoảng trắng): tạo khách, đồng bộ 1 thẻ, tắt (PID 41948) rồi mở lại (PID 22440, đã tắt) ⇒ refresh token còn dùng được, thẻ còn | state 16, gateway 49, e2e 50 passed + 3 skip |

**Kết quả cuối (2026-11-18):** `pnpm build` 17/17 · `pnpm test` 31/31 task (gateway **49** test, contracts 10, api-client 11, state 16, mfe-learner 9, …) · `pnpm lint:boundaries` 0 vi phạm (236 module) · size-limit đạt hết · e2e **50 passed, 3 skipped**. Test `@perf` (mở M3 < 1.5 s) có lần trượt khi chạy cả bộ, chạy riêng thì qua — đúng vấn đề đã biết Q19/R12, không do GĐ0.

## Cách chạy

```bash
# Gateway dev: PGlite tự tạo ở apps/gateway/.data/pglite, migration tự chạy
pnpm --filter @vietlearning/gateway build && node apps/gateway/dist/index.js
# e2e (tránh cổng của worktree khác)
VITE_GATEWAY_URL=http://localhost:4010 pnpm --filter @vietlearning/host-shell build
E2E_PORT=4183 E2E_GATEWAY_PORT=4010 pnpm --filter @vietlearning/host-shell e2e
```
Production: đặt `DATABASE_URL` (Neon/Supabase) + `JWT_SECRET` (≥ 32 ký tự).

## Chưa kiểm chứng
- **Đường Postgres thật (`DATABASE_URL`, postgres-js + migrator) CHƯA chạy lần nào** — chỉ PGlite (RAM + đĩa). Cần thử với Neon/Supabase trước khi phát hành (GĐ5).
- APK chưa build lại sau khi thêm `@capacitor/preferences`.

## Cần người quyết
- **Xóa tài khoản trên máy A khi máy B vẫn còn dữ liệu:** máy B (khi mở lại) không làm mới được phiên ⇒ hiện tại tự tạo tài khoản khách MỚI và tải dữ liệu đang có trên máy B lên. Như vậy “xóa thật” chỉ thật với dữ liệu trên server lúc xóa. Phương án khác: máy B thấy tài khoản bị xóa thì xóa luôn dữ liệu local (cần một mã lỗi phân biệt “đã xóa” với “token hỏng”). Đề xuất: làm phương án khác ở GĐ5.

## Việc chưa làm / lưu ý cho phiên sau
- **Chưa build lại APK** sau khi thêm `@capacitor/preferences` (cần `cap sync`; chưa thử trên emulator).
- Trang chính sách quyền riêng tư song ngữ (cần thêm route ⇒ `routes.tsx` thuộc phiên GĐ1), persist v2 `migrate` trong `packages/state/src/index.ts`.
- Nối Google/email (D3), backup tự động của nhà cung cấp DB + thử khôi phục (GĐ5), sinh lại mã khôi phục, ghi `srs_reviews`.
- Quota AI vẫn lưu RAM (một instance); cache “user còn tồn tại” 60 s — nhiều instance thì token của tài khoản vừa xóa còn dùng được tối đa 60 s.
- `/practice/generate|grade` vẫn mock (ngoài phạm vi GĐ0).
- Thẻ SRS bị xóa trên máy không có sự kiện xóa (API chưa có `srs.delete`).
