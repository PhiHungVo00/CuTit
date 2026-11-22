# Góp ý / Báo lỗi + trang quản trị nền (dự án 5a): kế hoạch triển khai

> **Trạng thái:** ĐÃ DUYỆT 2026-11-22 (người dùng duyệt kế hoạch).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho người dùng gửi góp ý/báo lỗi kèm ảnh và video ngay trong app, rồi xem trạng thái và lời nhắn trả lời. Chủ app xử lý hàng chờ trên trang quản trị web `apps/admin`, đăng nhập bằng mật khẩu + mã 6 số.

**Architecture:** Làm contract trước (`packages/contracts/src/api/feedback.ts`, `admin.ts`) và schema bằng một migration mới. Gateway gồm:
- `/v1/feedback*`: nhận multipart, ghi tệp qua `BlobStore` (`fs` | `r2`);
- `/admin/v1/*`: có hook riêng (`typ:'admin'`, đọc `staff_roles` mỗi request), `admin_sessions` với cookie refresh HttpOnly, TOTP, nhật ký `admin_audit_log` ghi trong cùng transaction;
- job dọn tệp hằng ngày.

Phía người dùng là màn `/gop-y` trong `mfe-learner`. Phía chủ app là `apps/admin` (Vite + React), cổng 5180.

**Tech Stack:** Zod, Drizzle (PGlite dev/test), Fastify + `@fastify/multipart` (giới hạn theo request), `otpauth` (MIT, chọn lại nếu kiểm thấy không ổn), thư viện QR MIT (chỉ ở `apps/admin`), React 18 + Vite, Vitest / `node --test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-21-gop-y-bao-loi-design.md` (đã duyệt 21/11). Nền: `docs/thiet-ke/DE-XUAT-DANG-NHAP-PHAN-QUYEN.md` §B1, §B7. Khi hai tài liệu khác nhau thì **spec thắng**.

## Global Constraints

- **Nhánh nền:** `main` sau khi dự án 3 Task 1 (migration `0008_auth_identities`, PR #11) đã gộp. Migration 5a sinh bằng `pnpm --filter @vietlearning/gateway db:generate --name feedback_admin`, không đặt số tay, không sửa migration cũ.
- **Task 4 chờ dự án 3 Task 2** (`verifyPassword`, `/v1/auth/register`) gộp vào `main`. Trước đó chỉ chạy Task 1–3.
- **Bảy nguyên tắc:**
  - contract trước;
  - không bí mật ở client;
  - kho tệp qua `BLOB_PROVIDER`;
  - `apps/admin` không bị app nào import (thêm luật dependency-cruiser).
- **Góp ý:**
  - `kind` ∈ `bug|idea|other`; `body` 10–2000 ký tự.
  - Tối đa **3 ảnh** (≤ 5 MB mỗi ảnh, WebP/JPEG/PNG) và **1 video** (≤ 50 MB, ≤ 60 giây, MP4/WebM/MOV). Tổng ≤ 66 MB.
  - **5 góp ý/người/ngày** + giới hạn IP 20/giờ.
- **Trạng thái:** `received|in_progress|done`. Lời nhắn ≤ 1000 ký tự.
- **Dọn tệp:**
  - ảnh: 180 ngày sau `done_at`;
  - video: 90 ngày sau `done_at`;
  - góp ý chưa xong: mọi tệp sau 365 ngày tính từ `created_at`;
  - nhật ký quản trị: giữ 2 năm;
  - phiên quản trị: hết hạn quá 30 ngày thì xóa.
- **Quản trị:**
  - TOTP RFC 6238, 30 giây, 6 số, SHA-1, 10 mã dự phòng;
  - bí mật mã hóa AES-256-GCM bằng `ADMIN_MFA_KEY`;
  - access JWT `typ:'admin'`, ký bằng `ADMIN_JWT_SECRET`, sống 10 phút;
  - phiên: rảnh 30 phút thì hết, tối đa 12 giờ; cookie `HttpOnly; Secure; SameSite=Strict; Path=/admin/v1/auth`;
  - sai 5 lần/15 phút (theo IP và theo tên) thì khóa;
  - không có vai trò thì trả **cùng** `invalid_credentials`.
- **Biến môi trường mới:**
  - `BLOB_PROVIDER=fs|r2` (mặc định `fs`), `BLOB_DIR` (mặc định `~/.becutit/blobs`), `BLOB_TOTAL_CAP_MB=8000`;
  - `ADMIN_API_ENABLED` (production mặc định `false`), `ADMIN_ORIGIN=http://localhost:5180`;
  - `ADMIN_MFA_KEY`, `ADMIN_JWT_SECRET`, `ADMIN_BLOB_URL_SECRET`.

  Thêm tên biến (không có giá trị) vào `.env.example`.
- Chuỗi trong app có vi + en (`apps/mfe-learner/src/i18n.ts`). `apps/admin` chỉ tiếng Việt.
- Mỗi phiên con thêm **một dòng** vào `docs/NHAT_KY_CHUYEN_DOI_MOBILE.md`. Phần này đụng DB và auth, nên **`kien-truc` xem lại** trước khi gộp. Chạy skill `kiem-truoc-khi-gop`.

## Review Focus

1. **Mạng rớt giữa lúc tải video 50 MB** → chữ và tệp đã chọn vẫn còn trên màn, bấm "Gửi lại" thành công. Server không có tệp mồ côi, không có dòng DB dở. Test ở Task 2 (server hủy giữa chừng) và Task 3 (giữ trạng thái màn).
2. **Tệp đổi đuôi** (`.exe` đổi thành `.mp4`, SVG đổi thành `.png`) → bị từ chối nhờ magic bytes, kể cả khi `Content-Type` nói dối. Test ở Task 2.
3. **Cookie refresh hoặc access token quản trị bị dùng ở `/v1`, và token app bị dùng ở `/admin/v1`** → đều 401. `/v1` không trả header CORS cho `ADMIN_ORIGIN`. Test ở Task 4.
4. **Hai lần đăng nhập cùng một mã TOTP trong cùng 30 giây** (gõ lại, hoặc kẻ gian nhìn trộm) → lần thứ hai bị từ chối. Test ở Task 4.
5. **Ảnh từ thư viện có EXIF vị trí GPS** → ảnh gửi lên (WebP vẽ lại) không còn EXIF. Test ở Task 3.

---

## Đợt và bản đồ tệp

| Đợt | Task | Phiên (model) | Tệp chính |
|---|---|---|---|
| 1 | 1 | `5a-contract-schema` (`kien-truc`, Opus) | `packages/contracts/src/api/feedback.ts`, `admin.ts`, `packages/contracts/src/db/schema.ts`, migration |
| 2 | 2 | `5a-gateway-gop-y` (`lam-tinh-nang`, Sonnet) | `apps/gateway/src/services/blob/**`, `services/feedback/**`, `routes/feedback.ts`, `jobs/feedbackPurge.ts` |
| 2 | 3 | `5a-app-gop-y` (`lam-tinh-nang`, Sonnet) | `apps/mfe-learner/src/feedback/**`, `packages/api-client/src/feedback.ts`, `apps/host-shell/src/routes.tsx`, `vite.config.ts` |
| 2* | 4 | `5a-admin-auth` (`kien-truc`, Opus) | `apps/gateway/src/services/admin/**`, `routes/admin/auth.ts`, `pipeline/adminHook.ts`, `scripts/admin-cli.ts`, `app.ts` (CORS) |
| 3 | 5 | `5a-admin-hang-cho` (`lam-tinh-nang`, Sonnet) | `apps/gateway/src/routes/admin/feedback.ts`, `routes/admin/audit.ts`, `routes/admin/blob.ts` |
| 3 | 6 | `5a-admin-web` (`lam-tinh-nang`, Sonnet) | `apps/admin/**`, `packages/api-client/src/admin.ts`, `.dependency-cruiser.cjs` |
| 4 | 7 | phiên chính | gộp tài khoản, pháp lý, e2e toàn luồng, AVD, `kien-truc` review |

\* Task 4 chạy cùng đợt 2 **chỉ khi** dự án 3 Task 2 đã ở `main`. Nếu chưa thì chờ, Task 2 và Task 3 vẫn chạy.

**Va chạm tệp:**
- Task 2 và Task 4 cùng sửa `apps/gateway/src/app.ts` và `config.ts`. Task 2 chỉ thêm `register(feedbackRoutes)` trong khối `/v1` và biến `BLOB_*`. Task 4 tách CORS và thêm khối `/admin/v1`. Khi gộp, lấy cả hai.
- Task 5 thêm route vào khối `/admin/v1` do Task 4 tạo.

---

### Task 1: Contract + schema + migration

**Files:** Create `packages/contracts/src/api/feedback.ts`, `packages/contracts/src/api/admin.ts`, `packages/contracts/test/feedback-contract.test.mjs`; Modify `packages/contracts/src/db/schema.ts`, `packages/contracts/src/index.ts` (export); migration sinh tự động + `apps/gateway/test/feedback-schema-migration.test.mjs`.

**Interfaces — Produces:**
- `FEEDBACK_LIMITS = { bodyMin: 10, bodyMax: 2000, images: 3, videos: 1, imageBytes: 5*2**20, videoBytes: 50*2**20, videoMs: 60_000, perDay: 5, replyMax: 1000 }`
- `FeedbackKindSchema = z.enum(['bug','idea','other'])`; `FeedbackStatusSchema = z.enum(['received','in_progress','done'])`
- `FeedbackContextSchema {appVersion: string, build: string, platform: 'android'|'web', osVersion: string, locale: 'vi'|'en', route: string, recentRoutes: string[] (≤5, mỗi chuỗi bắt đầu '/', không '?'), error?: {name: string, firstFrame: string}}`
- `FeedbackCreateMetaSchema {kind, body, context}` (phần `meta` của multipart) → `FeedbackCreateResponseSchema {id: uuid}`
- `MyFeedbackSchema {id, kind, body, status, createdAt, unread: boolean, files: {media: 'image'|'video', purged: boolean}[], events: {at, status: FeedbackStatus|null, message: string|null}[]}`; `MyFeedbackListSchema {items: MyFeedback[]}`; `UnreadCountSchema {count: number}`
- Admin: `AdminLoginRequestSchema {username, password}` → `AdminLoginResponseSchema {ticket, next: 'totp'|'enroll'}`; `AdminEnrollRequestSchema {ticket}` → `AdminEnrollResponseSchema {otpauthUrl, secret}`; `AdminTotpConfirmSchema {ticket, code}` → `AdminSessionSchema & {backupCodes: string[] (10)}`; `AdminTotpRequestSchema {ticket, code?: /^\d{6}$/, backupCode?: string}` (đúng một trong hai) → `AdminSessionSchema {accessToken, expiresIn}`; `QueueQuerySchema {type: 'feedback', status?, kind?, cursor?}` → `QueueItemSchema {type:'feedback', id, kind, excerpt (≤120), status, appVersion, route, fileCount, createdAt, accountPendingDeletion: boolean}` + `nextCursor`; `AdminFeedbackDetailSchema` (= MyFeedback + `context`, `userIdShort`, `files: {id, media, contentType, bytes, durationMs, purged}[]`); `AdminStatusRequestSchema {status, message?}`; `SignedUrlSchema {url, expiresAt}`; `AuditEntrySchema {id, at, actorKind, actorUserIdShort, action, targetType, targetId, meta}`.
- Mã lỗi mới: `feedback_limit, file_too_large, file_type, too_many_files, video_too_long, storage_full, admin_disabled, invalid_credentials` (dùng lại), `totp_invalid, totp_required, session_expired`.
- Bảng: theo spec §5.7 (`feedback_reports`, `feedback_files`, `feedback_events`, `blob_deletions`, `staff_roles`, `staff_totp`, `admin_sessions`, `admin_audit_log`). Thêm **trigger chặn UPDATE/DELETE trên `admin_audit_log`**, viết tay trong migration tùy chỉnh (`db:generate --custom`, tên `admin_audit_append_only`). Thêm hàm `admin_audit_purge(before timestamptz)` dạng `SECURITY DEFINER`, tắt trigger cục bộ để job dọn được.

- [ ] **Step 1:** Viết test thất bại:
  - `FeedbackCreateMetaSchema` từ chối `body` 9 ký tự và 2001 ký tự;
  - từ chối `recentRoutes` có `'/a?x=1'` hoặc 6 phần tử;
  - `AdminTotpRequestSchema` từ chối khi có cả `code` lẫn `backupCode`, và khi không có cái nào;
  - test migration: chạy trên PGlite rỗng và trên DB đã có `0008`;
  - `UPDATE admin_audit_log` ném lỗi; `admin_audit_purge(now())` xóa được.
- [ ] **Step 2:** `pnpm --filter @vietlearning/contracts test` thấy FAIL.
- [ ] **Step 3:** Cài contract + schema, rồi `db:generate --name feedback_admin` + migration tùy chỉnh.
- [ ] **Step 4:** Test contracts và test migration của gateway PASS; `pnpm build` xanh.
- [ ] **Step 5:** Commit `feat(contracts): góp ý/báo lỗi + quản trị (TOTP, phiên, nhật ký) + migration`, thêm dòng nhật ký.

### Task 2: Gateway: kho tệp, gửi góp ý, "của tôi", dọn tệp

**Files:**
- Create: `apps/gateway/src/services/blob/BlobStore.ts`, `fsBlobStore.ts`, `index.ts` (`createBlobStore(config)`); `apps/gateway/src/services/feedback/repo.ts`, `fileSniff.ts`, `purge.ts`; `apps/gateway/src/routes/feedback.ts`; `apps/gateway/src/jobs/feedbackPurge.ts`.
- Modify: `apps/gateway/src/app.ts` (register trong khối `/v1`), `config.ts` (`BLOB_*`), `apps/gateway/src/routes/me.ts` (gọi `purgeUserFeedbackBlobs` sau khi xóa cứng).
- Test: `apps/gateway/test/feedback.test.mjs`, `blob-store.test.mjs`, `feedback-purge.test.mjs`.

**Interfaces:**
- Consumes: contract Task 1.
- Produces:
  - `interface BlobStore { put(key: string, src: Readable, o: {contentType: string, maxBytes: number}): Promise<{bytes: number}>; get(key: string, range?: {start: number, end?: number}): Promise<{stream: Readable, bytes: number, contentType: string} | null>; delete(key: string): Promise<void>; totalBytes(): Promise<number> }`
  - `sniffMedia(head: Buffer): {media: 'image'|'video', contentType: string} | null`
  - `purgeUserFeedbackBlobs(db, blob, userId): Promise<void>`: lấy khóa tệp **trước** khi xóa, xóa tệp **sau** commit; lỗi thì ghi `blob_deletions`
  - `runFeedbackPurge(db, blob, now: Date): Promise<{images: number, videos: number, stale: number, retried: number}>`
  - Routes: `POST /v1/feedback`, `GET /v1/feedback/mine`, `GET /v1/feedback/mine/unread-count`, `POST /v1/feedback/:id/read`

- [ ] **Step 1:** Viết test thất bại (Gateway thật với PGlite `memory://`, `BLOB_DIR` là thư mục tạm):
  - khách gửi 1 ảnh PNG + 1 MP4 nhỏ → 200, có 2 dòng `feedback_files`, tệp có trên đĩa;
  - tệp tên `.mp4` nhưng nội dung PE/`MZ` → `400 file_type`;
  - SVG gửi với `Content-Type: image/png` → `400 file_type`;
  - 4 ảnh → `400 too_many_files`;
  - ảnh 5 MB + 1 byte → `413 file_too_large`, thư mục tạm **rỗng**, 0 dòng DB;
  - client ngắt kết nối giữa lúc gửi video → 0 dòng DB, 0 tệp;
  - lần gửi thứ 6 trong ngày → `429 feedback_limit`;
  - vượt `BLOB_TOTAL_CAP_MB` → `507 storage_full`, nhưng bản chỉ có chữ vẫn nhận;
  - `GET /mine` chỉ thấy của mình; `unread-count` tăng khi `feedback_events` có lời nhắn, `POST read` đưa về 0;
  - `DELETE /v1/me` → tệp bị xóa; kho tệp ném lỗi khi xóa → có dòng `blob_deletions`;
  - `runFeedbackPurge`, với `now` giả: ảnh `done` 181 ngày → xóa, 179 ngày → giữ; video `done` 91 ngày → xóa; chưa xong 366 ngày → xóa; chữ còn nguyên.
- [ ] **Step 2:** `pnpm --filter @vietlearning/gateway build && pnpm --filter @vietlearning/gateway test` thấy FAIL.
- [ ] **Step 3:** Cài đặt:
  - Route dùng `request.parts({ limits: { files: 4, fileSize: FEEDBACK_LIMITS.videoBytes, fields: 1 } })` với `bodyLimit` riêng (≥ 66 MB). **Không đổi** cấu hình multipart chung ở `app.ts:98–100`.
  - Đọc 4100 byte đầu để `sniffMedia`, rồi nối dòng chảy vào `blob.put`, đếm byte, quá giới hạn từng loại thì hủy.
  - Ghi DB trong một transaction **sau khi** mọi tệp ghi xong. Lỗi bất kỳ thì xóa các khóa đã ghi.
  - Độ dài video **không** kiểm ở server; app tự kiểm.
- [ ] **Step 4:** Test PASS. Đăng ký job `feedbackPurge` vào bộ hẹn giờ hằng ngày hiện có (nếu chưa có bộ hẹn giờ thì dùng `setInterval` 24 giờ, khởi chạy sau 1 phút, tắt khi `NODE_ENV=test`).
- [ ] **Step 5:** Commit `feat(gateway): góp ý/báo lỗi: kho tệp, gửi kèm ảnh/video, dọn tệp`, thêm dòng nhật ký.

### Task 3: App: màn Góp ý / Báo lỗi + "Góp ý của tôi" + chấm đỏ

**Files:**
- Create: `apps/mfe-learner/src/feedback/FeedbackScreen.tsx`, `MyFeedback.tsx`, `prepareImage.ts`, `videoDuration.ts`, `feedbackDraft.ts`, `useFeedbackUnread.ts`; `packages/api-client/src/feedback.ts`; `apps/host-shell/src/screens/FeedbackRoute.tsx`.
- Modify: `apps/mfe-learner/src/index.ts` (export), `apps/mfe-learner/src/i18n.ts`, `apps/mfe-learner/src/profile/**` (dòng "Góp ý / Báo lỗi" + chấm), `apps/host-shell/src/routes.tsx` (`PATH_ROUTES` thêm `/gop-y`, `/gop-y/cua-toi`), `apps/host-shell/src/components/ScreenErrorBoundary.tsx` (nút "Báo lỗi"), `apps/host-shell/vite.config.ts` (define `__APP_VERSION__`, `__BUILD_ID__`), chấm đỏ ở tab Hồ sơ (`apps/host-shell/src/shell/**`), theo dõi 5 đường dẫn gần nhất (`apps/host-shell/src/shell/**`, lưu trong bộ nhớ).
- Test: `apps/mfe-learner/src/feedback/*.test.tsx`, `packages/api-client/test/feedback.test.mjs`.

**Interfaces:**
- Consumes: contract Task 1. Không gọi Gateway thật trong unit test (mock `fetch`).
- Produces:
  - `submitFeedback(meta: FeedbackCreateMeta, files: Blob[], onProgress: (p: number) => void, signal?: AbortSignal): Promise<{id}>`: dùng `XMLHttpRequest` để có tiến độ tải lên, Bearer qua phiên hiện có, gửi lại một lần khi 401 như các client khác
  - `listMyFeedback()`, `unreadFeedbackCount()`, `markFeedbackRead(id)`
  - `prepareImage(file: File): Promise<Blob>`: vẽ lại qua canvas thành WebP, cạnh dài ≤ 1920
  - `readVideoDurationMs(file: File): Promise<number>`
  - `FeedbackScreen` nhận `{ initialKind?: FeedbackKind, error?: {name, firstFrame}, context: Omit<FeedbackContext,'error'> }`. Host dựng `context` (route trước, 5 đường dẫn gần nhất, phiên bản), vì MFE không biết lịch sử điều hướng.

- [ ] **Step 1:** Viết test thất bại:
  - `prepareImage` với JPEG có EXIF GPS (fixture) → kết quả là `image/webp`, không có chuỗi `Exif`;
  - ảnh 4000×3000 → cạnh dài 1920;
  - chọn video 61 giây (mock `duration`) → báo lỗi `video_too_long`, không gửi;
  - chọn ảnh thứ 4 → nút thêm bị vô hiệu;
  - `body` 9 ký tự → nút Gửi vô hiệu;
  - gửi lỗi mạng → chữ và tệp còn nguyên, hiện nút "Gửi lại", nháp chữ nằm trong `localStorage`;
  - gửi xong → nháp bị xóa, hiện Cu Tít `khen`;
  - dòng "Gửi kèm: …" hiện đúng phiên bản và route;
  - có dòng thông báo "Chủ app sẽ xem nội dung, ảnh và video bạn gửi để sửa lỗi…" (chữ đúng spec §5.8, vi + en);
  - `unread>0` → có chấm ở dòng Hồ sơ;
  - mọi chuỗi có cả vi và en.
- [ ] **Step 2:** `pnpm --filter @vietlearning/mfe-learner test` thấy FAIL.
- [ ] **Step 3:** Cài đặt:
  - Màn nạp lười. `ScreenErrorBoundary` mở `/gop-y?loai=loi` và chuyển tên lỗi qua state điều hướng.
  - Không thêm thư viện nào vào gói đầu.
  - Hỏi số chưa đọc sau lần vẽ đầu (`requestIdleCallback`, có dự phòng) và khi mở Hồ sơ.
- [ ] **Step 4:** Test PASS; `pnpm build`; `pnpm --filter @vietlearning/host-shell size` vẫn trong ngân sách; `pnpm lint:boundaries` xanh.
- [ ] **Step 5:** Commit `feat(learner): màn Góp ý / Báo lỗi + Góp ý của tôi`, thêm dòng nhật ký.

### Task 4: Gateway: đăng nhập quản trị (mật khẩu + TOTP), phiên, quyền, CLI

**Chờ:** dự án 3 Task 2 ở `main` (`verifyPassword`, `/v1/auth/register`, `MailProvider`).

**Files:**
- Create: `apps/gateway/src/services/admin/totp.ts`, `crypto.ts`, `sessions.ts`, `roles.ts`, `audit.ts`, `alerts.ts`; `apps/gateway/src/pipeline/adminHook.ts`; `apps/gateway/src/routes/admin/auth.ts`; `apps/gateway/src/scripts/admin-cli.ts`.
- Modify: `apps/gateway/src/app.ts` (tách CORS: `/admin/v1` chỉ `ADMIN_ORIGIN` + `credentials:true`; `/v1` giữ danh sách cũ và **loại** `ADMIN_ORIGIN`; khối `/admin/v1` chỉ đăng ký khi `ADMIN_API_ENABLED`), `config.ts`, `apps/gateway/package.json` (scripts `admin:grant`, `admin:revoke`, `admin:reset-totp`).
- Test: `apps/gateway/test/admin-auth.test.mjs`, `admin-cli.test.mjs`.

**Interfaces:**
- Consumes: `verifyPassword` (dự án 3), `MailProvider` (dự án 3), bảng của Task 1.
- Produces:
  - `withAdminAudit<T>(db, entry: {actorUserId|null, actorKind, action, targetType, targetId?, meta?, ipHash?, userAgent?}, fn: (tx) => Promise<T>): Promise<T>`: ghi nhật ký **trong cùng transaction** với `fn`
  - `requireAdmin(role: 'owner'|'editor'|'reviewer'|'support')`: preHandler, gắn `request.admin = {userId, roles}`
  - Routes `POST /admin/v1/auth/login | totp/enroll | totp/confirm | totp | refresh | logout`. Luồng: `login` → (`next=enroll`: `totp/enroll` → `totp/confirm` ⇒ phiên + mã dự phòng) | (`next=totp`: `totp` ⇒ phiên)
  - CLI `admin:grant --username <x> --role owner`, `admin:revoke --username <x> --role <r>`, `admin:reset-totp --username <x>` (tác nhân `cli` trong nhật ký)

- [ ] **Step 1:** Viết test thất bại:
  - sai mật khẩu, và đúng mật khẩu nhưng không có vai trò → response **giống hệt** (`invalid_credentials`, cùng body);
  - lần đầu (chưa có `staff_totp` đã xác nhận) → `login` trả `next:'enroll'`; `totp/enroll` trả `otpauthUrl`; `totp/confirm` với mã đúng → phiên + 10 mã dự phòng;
  - **đã xác nhận TOTP** → `login` trả `next:'totp'`, và `totp/enroll` với ticket đó → 403 (không đăng ký lại được chỉ bằng mật khẩu); gọi `totp` khi `next=enroll` → 403;
  - mã đúng → access `typ:'admin'` + cookie `HttpOnly; SameSite=Strict; Path=/admin/v1/auth`;
  - **cùng mã dùng lần 2 trong 30 giây** → `totp_invalid`;
  - mã dự phòng dùng lần 2 → `totp_invalid`;
  - 6 lần sai → `rate_limited`;
  - access quản trị gọi `/v1/me` → 401; access app gọi `/admin/v1/...` → 401;
  - rảnh 31 phút → refresh trả `session_expired`; 12 giờ + 1 phút → `session_expired` dù vẫn đang dùng;
  - logout → refresh cũ hết hiệu lực;
  - CLI `admin:revoke` → request kế tiếp 403 (không cache);
  - preflight `OPTIONS /v1/me` với `Origin: http://localhost:5180` → không có `access-control-allow-origin`;
  - `ADMIN_API_ENABLED=false` → `/admin/v1/auth/login` 404;
  - thiếu `ADMIN_MFA_KEY` → 503 `admin_disabled`;
  - `withAdminAudit` mà `fn` ném lỗi → 0 dòng nhật ký;
  - `MAIL_PROVIDER=none` → đăng nhập vẫn thành công, không gửi cảnh báo.
- [ ] **Step 2:** Build + test thấy FAIL.
- [ ] **Step 3:** Cài đặt:
  - TOTP qua `otpauth` (kiểm giấy phép, số tải, lần cập nhật trước khi thêm; ghi vào nhật ký);
  - chấp nhận lệch ±1 bước;
  - `last_used_step` chặn mã ≤ bước đã dùng;
  - băm mã dự phòng và refresh bằng sha256;
  - `ip_hash` = HMAC IP bằng khóa có sẵn của audit (`apps/gateway/src/services/audit/audit.ts`);
  - thêm vào job dọn hằng ngày của Task 2: xóa `admin_sessions` hết hạn quá 30 ngày và gọi `admin_audit_purge(now() - interval '2 years')`. Có test với đồng hồ giả.
- [ ] **Step 4:** Test PASS.
- [ ] **Step 5:** Commit `feat(gateway): đăng nhập quản trị mật khẩu + TOTP, phiên, quyền, CLI cấp quyền`, thêm dòng nhật ký.

### Task 5: Gateway: API hàng chờ, chi tiết, trạng thái, URL ký, nhật ký

**Files:** Create `apps/gateway/src/routes/admin/feedback.ts`, `audit.ts`, `blob.ts`, `apps/gateway/src/services/admin/signedUrl.ts`; Modify khối `/admin/v1` trong `app.ts`; Test `apps/gateway/test/admin-feedback.test.mjs`.

**Interfaces:**
- Consumes: `requireAdmin`, `withAdminAudit` (Task 4); `BlobStore` (Task 2).
- Produces:
  - `/admin/v1/blob` đăng ký **ngoài** `requireAdmin` (chữ ký là xác thực), đặt `cross-origin-resource-policy: cross-origin`
  - `GET /admin/v1/queue`, `GET /admin/v1/feedback/:id`, `POST /admin/v1/feedback/:id/status`, `GET /admin/v1/feedback/:id/files/:fileId/url`, `GET /admin/v1/blob?k&exp&sig` (hỗ trợ `Range`), `GET /admin/v1/audit`
  - `signBlobUrl(key, ttlSec=300): {url, expiresAt}`, `verifyBlobUrl(k, exp, sig): boolean` (HMAC-SHA256 bằng `ADMIN_BLOB_URL_SECRET`)

- [ ] **Step 1:** Viết test thất bại:
  - hàng chờ mới nhất lên đầu, lọc theo `status`/`kind` đúng, con trỏ không lặp hay mất dòng khi có góp ý mới chen vào;
  - tài khoản có `delete_at` (dự án 3) → `accountPendingDeletion:true` (nếu cột chưa có thì `false`, test bỏ qua có điều kiện);
  - `status` đổi sang `done` → đặt `done_at`, thêm `feedback_events`, `user_unread=true`, có một dòng nhật ký `feedback.status`;
  - lời nhắn 1001 ký tự → 400;
  - URL ký hết hạn (đồng hồ giả +301 giây) → 403; `sig` sai → 403;
  - `Range: bytes=0-99` → 206 đúng 100 byte;
  - lấy URL của tệp → nhật ký `feedback.view_file`;
  - tệp đã `purged` → `url` trả 410;
  - `GET /admin/v1/blob` có chữ ký đúng, **không** Bearer → 200 kèm `cross-origin-resource-policy: cross-origin`.
- [ ] **Step 2–4:** FAIL → cài → PASS.
- [ ] **Step 5:** Commit `feat(gateway): hàng chờ góp ý cho quản trị + URL ký + nhật ký`, thêm dòng nhật ký.

### Task 6: Trang quản trị `apps/admin`

**Files:**
- Create: `apps/admin/package.json` (`@vietlearning/admin`, scripts `dev` cổng 5180, `build`, `test`), `vite.config.ts`, `index.html` (CSP chặt, không script ngoài), `src/main.tsx`, `src/App.tsx`, `src/auth/LoginPage.tsx`, `TotpPage.tsx`, `EnrollPage.tsx`, `src/queue/QueuePage.tsx`, `src/queue/DetailPanel.tsx`, `src/audit/AuditPage.tsx`, `src/session.ts`; `packages/api-client/src/admin.ts`.
- Modify: `.dependency-cruiser.cjs` (luật `no-import-admin-app`: không gói nào import `apps/admin`; `apps/admin` không import `apps/*` khác), `turbo.json` nếu cần, `pnpm-workspace.yaml` nếu cần.
- Test: `apps/admin/src/**/*.test.tsx`, `packages/api-client/test/admin.test.mjs`.

**Interfaces:**
- Consumes: contract Task 1; routes Task 4–5.
- Produces:
  - `createAdminClient(baseUrl): { login, totp, confirmTotp, refresh, logout, queue, detail, setStatus, fileUrl, audit }`
  - access chỉ giữ trong bộ nhớ;
  - 401 thì gọi `refresh` (cookie, `credentials:'include'`) một lần; hỏng thì về màn đăng nhập.

- [ ] **Step 1:** Viết test thất bại (mock `fetch`):
  - đăng nhập → màn mã 6 số; có `enrollment` → màn QR + chuỗi bí mật → xác nhận → 10 mã dự phòng, phải bấm "Tôi đã lưu" mới đi tiếp;
  - tải lại trang (khởi động lại client) → gọi refresh, không hỏi lại mã;
  - hàng chờ hiện số chưa xong, bộ lọc đổi query; chọn dòng → chi tiết hiện ảnh (thẻ `img` dùng URL ký) và video (`video controls`);
  - lưu trạng thái + lời nhắn → gọi `setStatus` đúng body, danh sách cập nhật;
  - 401 hai lần liên tiếp → về màn đăng nhập;
  - Playwright (trang quản trị thật ở 5180 + Gateway thật ở 4000): mở chi tiết góp ý có ảnh ⇒ `img.naturalWidth > 0` (ảnh hiện thật trong trình duyệt khác nguồn).
- [ ] **Step 2–4:** FAIL → cài (dùng `packages/ui` cho token và nút; QR bằng thư viện MIT chỉ cài trong `apps/admin`) → PASS; `pnpm lint:boundaries` xanh; `pnpm build`.
- [ ] **Step 5:** Commit `feat(admin): trang quản trị: đăng nhập TOTP, hàng chờ góp ý, nhật ký`, thêm dòng nhật ký.

### Task 7: Nối dự án 3, pháp lý, kiểm toàn nhánh (phiên chính)

**Files:** Modify `apps/gateway/src/services/auth/merge.ts` (dự án 3, nếu đã gộp), `apps/gateway/src/routes/me.ts` / job xóa cứng của dự án 3, `docs/phap-ly/DATA-SAFETY.md`, `docs/phap-ly/DANH-GIA-TAC-DONG.md`, chữ trang `/quyen-rieng-tu` (`apps/host-shell/src/privacyI18n.ts`), `.env.example`, `docs/van-hanh/` (hướng dẫn tạo tài khoản chủ app bằng `curl` tới `/v1/auth/register`, rồi `admin:grant`); Create `apps/host-shell/e2e/gop-y.spec.ts`.

- [ ] **Step 1:** Viết test thất bại:
  - `auth-merge.test.mjs`, thêm ca: khách có 2 góp ý gộp vào tài khoản, ở cả `merge` lẫn `discard_device` → 2 góp ý thuộc tài khoản đích, tệp còn;
  - job xóa cứng của dự án 3 → gọi `purgeUserFeedbackBlobs` (bỏ chỗ gọi tạm ở `DELETE /v1/me` nếu Task 4 dự án 3 đã chuyển xóa cứng sang job);
  - e2e: người dùng gửi góp ý có ảnh → "Góp ý của tôi" thấy "Đã nhận" → quản trị (đăng nhập bằng API trong e2e, TOTP sinh từ bí mật test) đổi "Đã xong" + lời nhắn → app thấy chấm đỏ và lời nhắn.
- [ ] **Step 2–4:** FAIL → cài → PASS. Chạy skill `kiem-truoc-khi-gop` (build, test, ranh giới, size, e2e, axe). Chạy skill `thu-tren-emulator` để chọn ảnh và video từ thư viện Android rồi gửi. `kien-truc` review (DB, auth, tệp).
- [ ] **Step 5:** Commit `feat: 5a nối gộp/xóa tài khoản, pháp lý, e2e` + nhật ký. Mở PR, bật Auto-fix.
