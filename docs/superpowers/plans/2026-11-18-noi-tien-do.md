# Nối tiến độ GĐ0 ↔ GĐ1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đồng bộ store `becutit.progress` (XP, ngày học, đóng băng, bài đã xong, vượt unit) lên Gateway; máy B tự về trạng thái mới khi tài khoản bị xóa ở máy A; có trang Chính sách quyền riêng tư song ngữ.

**Architecture:** Engine `packages/state/src/sync.ts` thêm "bóng" thứ hai cho `progressStore` (so khác ⇒ sự kiện `xp.add`/`lesson.progress`/`day.mark`/`progress.set`), áp ảnh chụp server vào cả hai store. Gateway thêm bảng `learner_progress` (số bài, đóng băng còn giữ, mục tiêu ngày) và `deleted_accounts` (bia mộ: băm refresh token + mã khôi phục, không có dữ liệu học) để `/v1/auth/refresh` và `/v1/auth/recover` trả `account_deleted`. Host nghe sự kiện phiên `remote-deleted` ⇒ một đường xóa duy nhất `engine.resetLocal()` + hủy nhắc + thông báo.

**Tech Stack:** TypeScript, Zod (contracts), Fastify + Drizzle (PGlite trong test), Zustand, React, Playwright.

**Spec:** brief của phiên (nhật ký chính bước 37 — "Còn lại sau gộp"); ghi chú `side-session-notes/.../GD0-contract-cho-GD1.md`, `GD1-ghi-chu-cho-GD0.md`.

## Global Constraints

- Contract trước: sửa `packages/contracts/src/api/account.ts` + `src/db/schema.ts` trước gateway/client; migration mới sinh bằng `pnpm --filter @vietlearning/gateway db:generate --name <ten>` (không sửa `0000_init.sql`).
- Mọi chuỗi UI có vi + en qua `i18n.ts` (Host: `src/i18n.ts`, trang chính sách: file i18n riêng tải lười).
- Không import chéo MFE; M12 link tới trang chính sách bằng URL `/quyen-rieng-tu`.
- Không sửa `apps/mfe-conversation/**`, `packages/exercises/**`, `apps/gateway/src/routes/{speech,chat}.ts`, `services/assessment/**`, TTS provider (GĐ2/GĐ3).
- Ngân sách tải ban đầu 68.5 kB (`apps/host-shell/.size-limit.cjs`) — chuỗi thông báo trong Host phải ngắn.
- Không commit thay đổi turbo tự ghi vào `AGENTS.md`.

## Quyết định dữ liệu

| Trường `becutit.progress` | Lên server | Ghi chú |
|---|---|---|
| `xpByDay` | `xp.add` (delta theo ngày, tách ≤1000) → `xp_events` + `daily_activity.xp` | server chuẩn: áp snapshot `xp.byDay` khi hàng đợi rỗng |
| `lessons[id].best` | `lesson.progress` completed, `score = round(best*100)` | `times` không đồng bộ (khôi phục = 1) |
| `testedOut[unit]` | `lesson.progress` với `lessonId = "testout:<unitId>"` (id bài thật dạng `u1l1` ⇒ không trùng) | |
| `frozenDays` | `day.mark { freezeUsed: true }` | |
| đạt mục tiêu ngày | `day.mark { goalMet: true }` khi `activity[day] ≥ dailyGoal*60` | |
| `lessonsDone`, `freezes`, `dailyGoal` | `progress.set` (LWW) → bảng `learner_progress` | |
| `reminder`, `mistakes`, `toneStats` | không | cài đặt/thống kê theo máy; khôi phục ⇒ `mistakes`/`toneStats` về rỗng |

## Review Focus

- Khôi phục rồi flush tiếp: tổng XP server KHÔNG tăng (bóng cập nhật cùng lúc với store) — test ở Task 2.
- Bản ghi `becutit.sync` cũ không có bóng tiến độ ⇒ tải lên toàn bộ tiến độ cũ đúng một lần — test ở Task 2.
- XP một ngày > 1000 hoặc khóa ngày hỏng không được làm kẹt cả lô (400 mãi) — test ở Task 2.
- Request khác (chat) tạo khách mới đúng lúc máy B bị xóa: dữ liệu cũ không được tải lên khách mới — test ở Task 3 (session không trả token khách mới cho lần gửi lại; engine bị khóa trong lúc xóa).
- Streak server tính cả ngày đóng băng, bằng `streakWithFreezes` của client — test ở Task 1.

---

### Task 1: Contract + Gateway (day.mark, progress.set, snapshot, streak, bia mộ)

**Files:**
- Modify: `packages/contracts/src/api/account.ts`, `packages/contracts/src/db/schema.ts`
- Create: `apps/gateway/drizzle/0001_*.sql` (sinh)
- Modify: `apps/gateway/src/services/learner/repo.ts`, `apps/gateway/src/routes/auth.ts`, `apps/gateway/src/services/auth/tokens.ts`
- Test: `apps/gateway/test/sync.test.mjs`, `apps/gateway/test/auth.test.mjs`

**Interfaces — Produces:**
- Sự kiện `{ type: 'day.mark', day, goalMet?: true, freezeUsed?: true }` (OR một chiều), `{ type: 'progress.set', lessonsDone: int 0..100000, freezes: int 0..2, dailyGoal: 5|10|15|20 }` (LWW theo `at`).
- Snapshot thêm `dayFlags: { goalMet: Day[]; frozen: Day[] }` (default rỗng) và `progressState: { lessonsDone, freezes, dailyGoal } | null` (default null).
- Hằng `TESTOUT_PREFIX = 'testout:'` export từ contracts.
- `/v1/auth/refresh` và `/v1/auth/recover` trả `401 { error: 'account_deleted' }` khi credential thuộc tài khoản đã xóa.

- [ ] Test: `day.mark` hai lần (goalMet rồi freezeUsed) ⇒ `snapshot.dayFlags` có cả hai; gửi lại cùng id ⇒ duplicates.
- [ ] Test: `progress.set` với `at` cũ hơn không đè bản mới; snapshot trả bản mới.
- [ ] Test: summary streak = 3 khi hôm qua chỉ có `freezeUsed`, hôm kia + hôm nay có XP.
- [ ] Test: tạo khách, xóa `/v1/me`, refresh bằng refresh token cũ ⇒ 401 `account_deleted`; recover bằng mã cũ ⇒ 401 `account_deleted`; refresh token rác ⇒ `invalid_refresh_token`.
- [ ] Chạy ⇒ FAIL; sửa contract + schema (bảng `learner_progress`, `deleted_accounts(credential_hash PK, deleted_at)`), `db:generate --name progress_tombstone`, repo (`applyOne`, `snapshot`, `summary` dùng `freeze_used`, `deleteUser` chép băm vào bia mộ trong cùng transaction và dọn bia mộ > 90 ngày), auth routes ⇒ PASS.
- [ ] Commit `feat(gateway): progress flags, learner_progress, account_deleted tombstones`.

### Task 2: Engine đồng bộ tiến độ (client)

**Files:** Modify `packages/state/src/sync.ts`; Test `packages/state/test/sync.test.mjs`.

**Interfaces — Produces:** `SyncOptions.onLocalReset?: () => void` (gọi sau khi `resetLocal` xóa dữ liệu; Host dùng để hủy nhắc). `resetLocal` cũng gọi `progressStore.resetProgress()`.

- [ ] Test: hoàn thành bài `u1l1` (xp 25) ⇒ hàng đợi có `xp.add{amount:25,day}`, `lesson.progress{lessonId:'u1l1',status:'completed',score:100}`, `progress.set{lessonsDone:1,...}`.
- [ ] Test: `passTestOut('u1')` ⇒ `lesson.progress{lessonId:'testout:u1'}`; `settleFreezes` ⇒ `day.mark{freezeUsed:true}`; activity ≥ 600 s với mục tiêu 10 ⇒ `day.mark{goalMet:true}` một lần.
- [ ] Test: bản ghi `becutit.sync` không có `progressShadow` + store có XP ⇒ tải lên một lần; xpByDay 2500 một ngày ⇒ ba sự kiện ≤1000.
- [ ] Test: `pullAndReplace` với snapshot server (xp.byDay, lessons, testout, dayFlags, progressState) ⇒ progressStore khớp; flush tiếp không sinh sự kiện (không cộng XP lần hai).
- [ ] Test: `resetLocal` xóa progressStore + gọi `onLocalReset`, không sinh sự kiện.
- [ ] Cài đặt ⇒ PASS; commit `feat(state): sync becutit.progress via outbox`.

### Task 3: account_deleted ở máy B

**Files:** Modify `packages/api-client/src/session.ts` (+test), `apps/host-shell/src/account/bootstrap.ts`, `apps/host-shell/src/App.tsx`, `apps/host-shell/src/i18n.ts`, `apps/mfe-learner/src/preferences/AccountSection.tsx`.

**Interfaces:** `UserChangeReason` thêm `'remote-deleted'`; `obtain()` gặp `account_deleted` ⇒ xóa phiên, phát `remote-deleted`, ném `GatewayRequestError('unauthorized', …, 401, 'account_deleted')` (KHÔNG tạo khách mới trong cùng lần gọi); `handleUnauthorized` ném lại lỗi này. Host: `onUserChange(remote-deleted)` ⇒ `engine.resetLocal()` (onLocalReset hủy nhắc) ⇒ lưu cờ `becutit.notice=account-deleted` ⇒ App hiện thông báo song ngữ có nút đóng.

- [ ] Test session: refresh trả `account_deleted` ⇒ getToken ném code `account_deleted`, phát `remote-deleted`, phiên trên máy bị xóa, không gọi `/v1/auth/guest`.
- [ ] Cài đặt ⇒ PASS; commit `feat: wipe device when account was deleted elsewhere`.

### Task 4: Trang Chính sách quyền riêng tư

**Files:** Create `apps/host-shell/src/screens/PrivacyRoute.tsx`, `apps/host-shell/src/privacyI18n.ts`; Modify `routes.tsx` (route `/quyen-rieng-tu` trong `PATH_ROUTES`), `apps/mfe-learner/src/preferences/PreferencesScreen.tsx` + `i18n.ts` (link).
- Nội dung lấy từ mã: dữ liệu học lưu ở server (bảng ở schema), Gemini cho chat/ảnh/giọng nói (máy chủ nước ngoài), `usage_logs`, refresh token 90 ngày, bia mộ 90 ngày, cách xóa (M12), liên hệ = chỗ trống cần điền; banner "Bản nháp — cần người phụ trách duyệt".
- Link từ hộp đồng ý micro (`apps/mfe-conversation/src/chat/ChatPanel.tsx`) thuộc vùng GĐ3 ⇒ KHÔNG sửa; để ghi chú bàn giao trong thư mục ghi chú chung.
- [ ] e2e: mở `/tuy-chinh` → link → trang có tiêu đề + nhãn bản nháp, đổi ngôn ngữ en.
- [ ] Commit `feat(host): bilingual privacy policy draft`.

### Task 5: e2e + kiểm tra toàn bộ + nhật ký + push

- [ ] `apps/host-shell/e2e/sync.spec.ts`: học 1 bài ⇒ context mới nhập mã ⇒ thấy XP + bài đã xong; xóa ở A ⇒ B tải lại ⇒ về onboarding + thông báo.
- [ ] `pnpm build`, `pnpm test`, `pnpm lint:boundaries`, size-limit, e2e (gateway 4020, web 4193).
- [ ] `docs/nhat-ky/NOI-TIEN-DO.md` + dòng trong nhật ký chính; push nhánh.
