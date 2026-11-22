# Cập nhật ứng dụng (dự án 8) — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Người dùng ở mọi kênh (web/PWA, Android Play, APK cài tay) biết và lên được bản mới; bản dưới "bản tối thiểu" có mạng bị chặn bằng màn "Cần cập nhật"; APK tự tải và tự cài; không ngắt bài học, không chặn người offline, không mất dữ liệu.

**Architecture:** Contract trước (`packages/contracts/src/api/appVersion.ts`). Gateway đọc `config/app-versions.json`, có `GET /v1/app/version` công khai và hook 426 ở scope `/v1`. api-client gửi `x-app-build`/`x-app-channel`, ánh xạ 426. Host có mô-đun lười `src/update/` (lịch kiểm, nhắc mềm/bắt buộc, PWA prompt, kênh `play` qua `@capawesome/capacitor-app-update`, kênh `apk` qua cầu nối native tự viết `ApkUpdater`). Android tách flavor `play`/`apk`.

**Tech Stack:** Zod, Fastify, `node --test`, React 18 + Vite + vite-plugin-pwa ^0.21.2, Vitest, Playwright, Capacitor 7, `@capawesome/capacitor-app-update@7.2.0` (MIT), Java (Android DownloadManager/PackageInstaller), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-21-cap-nhat-ung-dung-design.md` (đã duyệt 2026-11-21). Kế hoạch **đã duyệt 2026-11-22**. Spec thắng khi khác kế hoạch.

## Global Constraints

- Contract trước (Nguyên tắc 5); không import chéo MFE; không bí mật ở client; mọi chuỗi vi + en (bảng 5.8 của spec, đúng từng chữ).
- Gói đầu ≤ **67,5 kB gzip** (`apps/host-shell/.size-limit.cjs`); mọi logic/UI cập nhật ở chunk lười; dòng size-limit mới cho chunk cập nhật **≤ 3,5 kB**.
- `build = x·1 000 000 + y·1 000 + z` từ `version` của `apps/host-shell/package.json`; `y, z ≤ 999`. Bản dev (`import.meta.env.DEV`) không kiểm và không gửi header.
- Kênh lúc chạy: không native ⇒ `web`; native + `Capacitor.isPluginAvailable('ApkUpdater')` ⇒ `apk`; còn lại ⇒ `play`.
- Kênh `web`/`play` không bao giờ nhận `apkFile`/`downloadUrl`; flavor `play` không có `REQUEST_INSTALL_PACKAGES` và không biên dịch `ApkUpdaterPlugin`.
- Hằng số: kiểm mỗi `checkAfterSec` (mặc định 21 600 s), không hỏi lại < 30 phút, "Để sau" 3 ngày theo `latestBuild`, rate limit endpoint 30/phút/IP, `APP_VERSIONS_TTL_MS` mặc định 60 000.
- Hook 426 chỉ ở scope `/v1` (không `/v1/auth`); miễn trừ `GET /v1/app/version`, `DELETE /v1/me`; thiếu/sai header ⇒ cho qua.
- Không ngắt khi "bận" (`isAudioBusy()` hoặc route bài học/bài tập); offline không bao giờ hiện màn chặn.
- APK release chỉ `https://`, host trong `APK_DOWNLOAD_HOSTS`; native kiểm SHA-256 + kích thước + tên gói `vn.edu.uit.becutit` + `versionCode` lớn hơn trước khi cài.
- Mỗi phiên con thêm **một dòng** nhật ký `docs/NHAT_KY_CHUYEN_DOI_MOBILE.md` (số dòng kế tiếp, phiên chính kiểm trùng). Task 3, 6, 7 đụng native ⇒ `kien-truc` xem lại trước khi gộp; không gì vào `main` khi chưa qua skill `kiem-truoc-khi-gop`.

## Review Focus

1. **App quay lại từ nền đúng lúc đang ở giữa bài học, và kết quả là `update_required`** ⇒ không hiện màn chặn giữa bài; hiện ngay khi rời màn bài học. Test ở Task 5.
2. **Web mở hai tab, cập nhật ở tab A** ⇒ tab B không gãy âm thầm (chunk cũ bị xóa khỏi precache): tab B nhận `controllerchange` và hiện thẻ "Có bản mới — tải lại?". Test ở Task 5.
3. **Sửa `app-versions.json` thành JSON hỏng khi Gateway đang chạy** ⇒ giữ cấu hình tốt gần nhất, log lỗi, không sập (chỉ lúc khởi động mới nghiêm ngặt). Test ở Task 2.
4. **Người dùng mở Cài đặt "nguồn không xác định" rồi quay lại mà không bật** ⇒ thẻ giải thích vẫn còn, không tự mở Cài đặt lặp lại. Test ở Task 7.
5. **426 trả về đúng lúc mở luồng SSE chat** ⇒ `streamEvents` ném `update-required` (không treo watchdog 15 s), gọi `onUpdateRequired`. Test ở Task 4.

---

## Đợt và bản đồ tệp

| Đợt | Task | Phiên con (agent · model · effort) | Tệp chính |
|---|---|---|---|
| 1 | 1 | `da8-contract` · `sua-nho` · Sonnet · medium | `packages/contracts/src/api/appVersion.ts`, `api/index.ts`, `apps/host-shell/scripts/version.mjs` |
| 2 | 2 | `da8-gateway` · `lam-tinh-nang` · Sonnet · high | `apps/gateway/src/routes/appVersion.ts`, `src/services/appVersion/**`, `src/app.ts`, `src/config.ts`, `config/app-versions.json` |
| 2 | 3 | `da8-build-android` · `lam-tinh-nang` · Sonnet · high (+`kien-truc` xem lại) | `apps/host-shell/vite.config.ts` (chỉ `define`), `android/app/build.gradle`, `android/app/src/{play,apk}/**`, `MainActivity.java`, `.github/workflows/ci.yml`, skill `thu-tren-emulator` |
| 2 | 4 | `da8-api-client` · `sua-nho` · Sonnet · medium | `packages/api-client/src/{config,index}.ts`, `packages/state/src/sync.ts` |
| 3 | 5 | `da8-host-update` · `lam-tinh-nang` · Sonnet · high | `apps/host-shell/src/update/**`, `src/main.tsx`, `vite.config.ts` (chỉ `VitePWA`), `.size-limit.cjs`, `e2e/update.spec.ts` |
| 3 | 6 | `da8-apk-native` · `kien-truc` · Opus · xhigh | `android/app/src/apk/java/vn/edu/uit/becutit/ApkUpdaterPlugin.java`, `packages/native/src/apkUpdater.ts` |
| 4 | 7 | `da8-apk-luong` · `lam-tinh-nang` · Sonnet · high | `apps/host-shell/src/update/apk.ts`, `docs/van-hanh/PHAT-HANH-BAN-MOI.md`; AVD |
| 4 | 8 | phiên chính (Opus) | kiểm toàn nhánh, `kien-truc` review, `kiem-truoc-khi-gop` |

Task 3 và Task 5 cùng chạm `vite.config.ts`: Task 3 chỉ thêm khối `define`, Task 5 chỉ sửa khối `VitePWA`; gộp lấy cả hai. Mỗi đợt bắt đầu từ nhánh đã gộp đợt trước.

---

### Task 1: Contract + hàm số build

**Files:** Create `packages/contracts/src/api/appVersion.ts`, `apps/host-shell/scripts/version.mjs`, `packages/contracts/test/app-version.test.mjs`, `apps/host-shell/scripts/version.test.mjs`; Modify `packages/contracts/src/api/index.ts`, `apps/host-shell/package.json` (script test chạy thêm `node --test scripts/`).

**Interfaces — Produces:**
- Đúng như spec 5.2: `AppChannelSchema`, `AppVersionQuerySchema`, `AppVersionResponseSchema` (gồm `apkFile`, `downloadUrl`, `checkAfterSec`), `AppUpdateRequiredErrorSchema`, `APP_BUILD_HEADER = 'x-app-build'`, `APP_CHANNEL_HEADER = 'x-app-channel'`; type `AppChannel`, `AppVersionResponse`.
- `AppVersionsConfigSchema` = `{ web, play, apk }` mỗi kênh `{ latestBuild, latestVersion, minBuild, notes|null, downloadUrl|null, apkFile|null }`, refine `minBuild ≤ latestBuild`, `downloadUrl`/`apkFile` chỉ ở `apk` (host allowlist kiểm ở Gateway, không ở contract).
- `scripts/version.mjs`: `export function versionToBuild(version: string): number` (ném lỗi nếu không khớp `^\d+\.\d+\.\d+$` hoặc `y`/`z` > 999), `export function readAppVersion(): { version: string, build: number }` (đọc `package.json` cạnh nó).

- [ ] **Step 1: Viết test hỏng** — `app-version.test.mjs`: response hợp lệ parse được; `apkFile.url` `http://` bị từ chối; `sha256` 63 ký tự bị từ chối; config có `downloadUrl` ở kênh `play` bị từ chối; `minBuild 5 > latestBuild 4` bị từ chối. `version.test.mjs`: `versionToBuild('1.4.2') === 1004002`, `versionToBuild('1.0.0') === 1000000`, `'1.1000.0'` ném lỗi, `'1.4'` ném lỗi.
- [ ] **Step 2:** `pnpm --filter @vietlearning/contracts test` và `node --test apps/host-shell/scripts/` ⇒ FAIL (chưa có module).
- [ ] **Step 3:** Viết hai tệp theo Interfaces; export từ `api/index.ts`.
- [ ] **Step 4:** Chạy lại ⇒ PASS; `pnpm --filter @vietlearning/contracts build` xanh.
- [ ] **Step 5:** Dòng nhật ký + commit `feat(contracts): hợp đồng kiểm phiên bản app (dự án 8)`.

### Task 2: Gateway — cấu hình, endpoint, hook 426

**Files:** Create `apps/gateway/config/app-versions.json` (cả 3 kênh `latestBuild 0, latestVersion "0.0.0", minBuild 0, notes null, downloadUrl null, apkFile null`), `src/services/appVersion/store.ts`, `src/routes/appVersion.ts`, `src/services/appVersion/updateGate.ts`, `test/app-version.test.mjs`; Modify `src/config.ts`, `src/app.ts`.

**Interfaces:**
- Consumes: Task 1 schemas.
- Produces: env `APP_VERSIONS_FILE` (mặc định `config/app-versions.json` cạnh gói), `APP_VERSIONS_TTL_MS` (60 000), `APP_VERSION_RATE_LIMIT_PER_MINUTE` (30), `APK_DOWNLOAD_HOSTS` (chuỗi host cách dấu phẩy, mặc định rỗng). `createAppVersionStore({ file, ttlMs, apkHosts }): { get(): AppVersionsConfig }` — đọc đồng bộ lúc tạo (sai ⇒ ném, Gateway không khởi động); sau đó đọc lại khi quá TTL, sai ⇒ giữ bản cũ + `log.error`. `computeStatus(build, ch): 'up_to_date'|'update_available'|'update_required'`. `updateGate(store)`: hook `onRequest`.

- [ ] **Step 1: Test hỏng** (`test/app-version.test.mjs`, dùng `app.inject` như các test khác):
  - `GET /v1/app/version?channel=play&build=5` không token ⇒ 200, `apkFile: null`, `downloadUrl: null`; `channel=apk` với cấu hình có `apkFile` ⇒ trả đúng `apkFile`. Tệp cấu hình đặt `apkFile` ở kênh `play` ⇒ tạo app ném lỗi. Query sai (`channel=ios`, `build=-1`) ⇒ 400.
  - `status`: build < min ⇒ `update_required`; min ≤ build < latest ⇒ `update_available`; ≥ latest ⇒ `up_to_date`; `checkAfterSec === 21600`; header `cache-control: no-store`.
  - `apk` có `apkFile` host `evil.example` không trong `APK_DOWNLOAD_HOSTS` ⇒ khởi động ném.
  - Hook: `GET /v1/me` kèm `x-app-build: 1`, `x-app-channel: play`, min 2 ⇒ 426 `{error:'app_update_required', minBuild:2, channel:'play'}` (trước cả 401); không header ⇒ không 426; `x-app-build: abc` ⇒ không 426; build = min ⇒ không 426; `DELETE /v1/me` dưới min ⇒ không 426; `/v1/auth/guest` dưới min ⇒ không 426.
  - Preflight `OPTIONS /v1/me` với `Origin` cho phép + `Access-Control-Request-Headers: x-app-build,x-app-channel,authorization` ⇒ `access-control-allow-headers` chứa cả hai.
  - **Review Focus 3:** ghi tệp hỏng sau khi tạo store, `ttlMs: 0` ⇒ `get()` vẫn trả cấu hình cũ, không ném.
  - Rate limit: 31 request/phút cùng IP ⇒ 429.
- [ ] **Step 2:** `pnpm --filter @vietlearning/gateway test` ⇒ các test mới FAIL.
- [ ] **Step 3:** Viết store/route/hook; trong `app.ts` đăng ký route trong scope riêng `{ prefix: '/v1/app' }` có rate limit theo IP (mẫu `/v1/auth`), đăng ký **trước** scope `/v1`; thêm `v1.addHook('onRequest', updateGate(store))` **trước** `pipeline.authenticate`.
- [ ] **Step 4:** Test ⇒ PASS; toàn bộ test Gateway cũ vẫn xanh.
- [ ] **Step 5:** Dòng nhật ký + commit `feat(gateway): /v1/app/version + chặn bản cũ 426 (dự án 8)`.

### Task 3: Số phiên bản vào bundle + Android flavor + CI

**Files:** Modify `apps/host-shell/vite.config.ts` (khối `define`), `src/vite-env.d.ts`, `android/app/build.gradle`, `MainActivity.java`, `.github/workflows/ci.yml`, `.claude/skills/thu-tren-emulator/SKILL.md` (lệnh gradle); Create `android/app/src/play/java/vn/edu/uit/becutit/FlavorPlugins.java`, `android/app/src/apk/java/vn/edu/uit/becutit/FlavorPlugins.java`, `android/app/src/apk/AndroidManifest.xml`, `apps/host-shell/scripts/check-apk.mjs`.

**Interfaces:**
- Consumes: `readAppVersion()` (Task 1).
- Produces: `import.meta.env.VITE_APP_VERSION: string`, `import.meta.env.VITE_APP_BUILD: string` (số dạng chuỗi). Gradle: `versionName = version`, `versionCode = versionToBuild(version)` (Groovy đọc `../../package.json` bằng `JsonSlurper`, cùng công thức). `flavorDimensions "store"`, `productFlavors { play {}; apk {} }`. `FlavorPlugins.register(BridgeActivity a)`: bản `play` rỗng; bản `apk` gọi `a.registerPlugin(ApkUpdaterPlugin.class)` — **trong Task 3 bản `apk` để rỗng kèm TODO trỏ Task 6** (lớp plugin chưa có). `MainActivity.onCreate` gọi `FlavorPlugins.register(this)` trước `super.onCreate`. Manifest `apk` khai `android.permission.REQUEST_INSTALL_PACKAGES`. `node scripts/check-apk.mjs <apk> --flavor play|apk` kiểm `versionCode` (đọc `output-metadata.json` cạnh APK) và có/không quyền (`aapt dump permissions` từ build-tools).

- [ ] **Step 1:** Thêm bước CI chạy `check-apk.mjs` cho cả hai APK (chưa có flavor ⇒ bước đỏ khi chạy tay `./gradlew assemblePlayDebug` — xác nhận lỗi "Task not found").
- [ ] **Step 2:** Làm gradle/flavor/manifest/`FlavorPlugins`/`define`.
- [ ] **Step 3:** Chạy `pnpm --filter @vietlearning/host-shell build`, `cap sync android`, `./gradlew assemblePlayDebug assembleApkDebug` ⇒ hai APK; `check-apk.mjs` ⇒ `play`: không có quyền, `apk`: có quyền, `versionCode` = `versionToBuild(version)`.
- [ ] **Step 4:** CI job APK: build cả hai, chạy check, tải lên hai artifact; cập nhật skill `thu-tren-emulator` (`assemblePlayDebug`, đường dẫn APK mới).
- [ ] **Step 5:** Cài bản `play` debug lên AVD (skill `thu-tren-emulator`): app mở bình thường (không hồi quy native). Dòng nhật ký + commit `build: số phiên bản từ package.json + flavor play/apk (dự án 8)`.

### Task 4: api-client gửi header, ánh xạ 426; tạm dừng đồng bộ

**Files:** Modify `packages/api-client/src/config.ts`, `src/index.ts`, `packages/state/src/sync.ts`; Test `packages/api-client/test/update-required.test.mjs`, test sync hiện có của `packages/state`.

**Interfaces:**
- Consumes: `APP_BUILD_HEADER`, `APP_CHANNEL_HEADER`, `AppUpdateRequiredErrorSchema` (Task 1).
- Produces: `GatewayConfig` thêm `appBuild?: number`, `appChannel?: AppChannel`, `onUpdateRequired?: (info: { minBuild: number; channel: AppChannel }) => void`. `GatewayErrorKind` thêm `'update-required'` (status 426). `describeGatewayError` vi "Cần cập nhật ứng dụng để tiếp tục." / en "Please update the app to continue.". `onUpdateRequired` gọi tối đa **một lần mỗi lần chạy** (biến module). Sync: `pauseSync(reason: 'update-required'): void`, `resumeSync(): void` export từ `@vietlearning/state/sync`; khi tạm dừng không đẩy, vẫn nhận sự kiện vào outbox.

- [ ] **Step 1: Test hỏng** — fetch giả: có `appBuild: 1004002, appChannel: 'play'` ⇒ request mang 2 header; không `appBuild` ⇒ không header; response 426 ⇒ `GatewayRequestError.kind === 'update-required'`, callback gọi 1 lần dù hai request 426; **Review Focus 5:** `streamEvents` nhận 426 ⇒ reject `update-required` ngay (không chờ watchdog), callback gọi. Sync: sau `pauseSync`, `enqueue` vẫn tăng outbox, không gọi fetch; `resumeSync` ⇒ đẩy.
- [ ] **Step 2:** Chạy test api-client + state ⇒ FAIL.
- [ ] **Step 3:** Cài đặt; phần trong `config.ts` chỉ là 3 trường + truyền header (giữ gói đầu nhỏ).
- [ ] **Step 4:** Test ⇒ PASS; `pnpm --filter @vietlearning/host-shell build && pnpm --filter @vietlearning/host-shell size` ⇒ gói đầu vẫn ≤ 67,5 kB.
- [ ] **Step 5:** Dòng nhật ký + commit `feat(api-client): header phiên bản + lỗi update-required; tạm dừng đồng bộ (dự án 8)`.

### Task 5: Mô-đun cập nhật của Host (web + play + giao diện)

**Files:** Create `apps/host-shell/src/update/start.ts`, `scheduler.ts`, `state.ts`, `busy.ts`, `channel.ts`, `web.ts`, `play.ts`, `apk.ts` (tạm: chỉ mở `downloadUrl`/chữ `apkNoLink`), `UpdatePrompt.tsx`, `ForcedUpdate.tsx`, `updateI18n.ts`, các `*.test.ts(x)`, `e2e/update.spec.ts`; Modify `src/main.tsx`, `vite.config.ts` (khối `VitePWA`), `.size-limit.cjs`, `package.json` (thêm `@capawesome/capacitor-app-update@7.2.0`, ghim đúng bản).

**Interfaces:**
- Consumes: Task 1 schemas, Task 3 `VITE_APP_*`, Task 4 `appBuild/appChannel/onUpdateRequired`, `pauseSync/resumeSync`, `isAudioBusy/onAudioBusyChange` (`@vietlearning/shared`), `isNativeApp` (`src/native/platform.ts`).
- Produces: `start.ts`: `export function startUpdates(): void` (gọi một lần ở `load`), `export function forceRequired(info): void`. `channel.ts`: `detectChannel(): AppChannel`; `interface ChannelUpdater { softUpdate(r: AppVersionResponse): Promise<void>; forcedUpdate(r: AppVersionResponse): Promise<void> }` — `web.ts`, `play.ts`, `apk.ts` mỗi tệp `export const updater: ChannelUpdater`. `state.ts`: khóa `becutit.update` `{ lastCheckAt, lastResponse, snoozedBuild, snoozedUntil }` (try/catch). `busy.ts`: `isBusy(path: string): boolean`, `BUSY_ROUTES` (builder liệt kê từ `routes.tsx`/`navMap.ts`: bài học lộ trình, `/luyen-tap`, `/ghep-cau`, `/nhap-vai`, phòng tập thanh, gọi thoại).
- `main.tsx`: bỏ `registerSW({ immediate: true })`; ở `load` (production): `import('./update/start').then(m => m.startUpdates())`; `configureGateway` thêm `appBuild` (production), `appChannel: detectChannel` nhẹ — nếu `detectChannel` kéo `@capacitor/core` vào gói đầu thì truyền `appChannel` sau từ `startUpdates()` qua `configureGateway`; `onUpdateRequired: (i) => import('./update/start').then(m => m.forceRequired(i))`.
- PWA: `registerType: 'prompt'`, bỏ `skipWaiting`/`clientsClaim`; `registerSW({ onNeedRefresh, onRegisteredSW })` trong `web.ts`.

- [ ] **Step 1: Test hỏng (Vitest, timer giả)** —
  - Lịch: kiểm lúc `startUpdates`, khi `visibilitychange→visible`, sau `checkAfterSec`; lần thứ hai trong 30 phút bị bỏ; dev không kiểm.
  - "Để sau" ⇒ cùng `latestBuild` không hiện trong 3 ngày; `latestBuild` lớn hơn ⇒ hiện ngay.
  - Offline (`navigator.onLine=false`) + `lastResponse.status='update_required'` ⇒ chỉ dải `forcedOffline`, không `ForcedUpdate`; sự kiện `online` ⇒ kiểm lại.
  - **Review Focus 1:** kết quả `update_required` khi `isBusy('/luyen-tap')` ⇒ không hiện; điều hướng sang `/` ⇒ hiện `ForcedUpdate` (`role="alertdialog"`, không nút đóng) và gọi `pauseSync`.
  - `isAudioBusy()` true ⇒ không hiện nhắc mềm; `onAudioBusyChange(false)` ⇒ hiện.
  - Kênh: `play` + `flexibleUpdateAllowed` ⇒ `startFlexibleUpdate`; tải xong ⇒ thẻ `restartTitle`; `UPDATE_NOT_AVAILABLE` ⇒ `openAppStore`; bắt buộc + `immediateUpdateAllowed` ⇒ `performImmediateUpdate` (plugin giả qua `vi.mock`). `web` ⇒ `updateSW(true)`.
  - **Review Focus 2:** `controllerchange` ở tab không bấm cập nhật ⇒ hiện thẻ `webReloadTitle`.
  - Ghi chú hiển thị chữ thuần (chuỗi `<b>x</b>` hiện nguyên văn).
- [ ] **Step 2:** `pnpm --filter @vietlearning/host-shell test` ⇒ FAIL.
- [ ] **Step 3:** Cài đặt; chuỗi đúng bảng 5.8; thẻ nhắc nằm trên thanh tab, có Cu Tít nhỏ, `role="status"`; plugin Capawesome chỉ `import()` trong `play.ts`.
- [ ] **Step 4:** Test ⇒ PASS.
- [ ] **Step 5: e2e** `e2e/update.spec.ts` — Gateway e2e chạy với `APP_VERSIONS_FILE` = tệp tạm, `APP_VERSIONS_TTL_MS=0` (thêm vào `webServer.env` của `playwright.config.ts`); test ghi tệp với số từ `readAppVersion()`: (a) `web.minBuild = build+1` ⇒ màn bắt buộc sau khi có request `/v1` (đường 426 thật); (b) `context.setOffline(true)` ⇒ chỉ dải; (c) đang ở bài luyện tập ⇒ không có màn chặn, về trang chủ ⇒ có. Chạy trên `pixel-7` và `android-nho-320`.
- [ ] **Step 6:** `.size-limit.cjs` thêm `{ name: 'Cập nhật app (lazy)', path: 'dist/assets/start-*.js', limit: '3.5 kB', gzip: true }` (đổi glob theo tên chunk thật); `pnpm --filter @vietlearning/host-shell size` ⇒ gói đầu ≤ 67,5 kB, chunk ≤ 3,5 kB.
- [ ] **Step 7:** Dòng nhật ký + commit `feat(host): kiểm và nhắc cập nhật app, PWA hỏi trước khi tải lại (dự án 8)`.

### Task 6: Cầu nối native `ApkUpdater` (flavor `apk`)

**Files:** Create `apps/host-shell/android/app/src/apk/java/vn/edu/uit/becutit/ApkUpdaterPlugin.java`, `packages/native/src/apkUpdater.ts`, `packages/native/test/apkUpdater.test.mjs`; Modify `android/app/src/apk/java/vn/edu/uit/becutit/FlavorPlugins.java` (đăng ký plugin), `android/app/src/apk/AndroidManifest.xml` (FileProvider nếu dùng), `packages/native/package.json` (subpath `./apk-updater`, **không** re-export từ `index.ts`).

**Interfaces — Produces** (`@vietlearning/native/apk-updater`):
```ts
export type ApkInstallStatus = 'pending_user' | 'success' | 'cancelled' | 'failed';
export interface ApkUpdaterPlugin {
  download(o: { url: string; sha256: string; sizeBytes: number; build: number; allowMetered: boolean }): Promise<{ state: 'done' | 'queued' }>;
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  install(o: { build: number }): Promise<void>;   // kiểm SHA/kích thước/tên gói/versionCode trước; sai ⇒ reject code 'verify_failed'
  cleanup(): Promise<void>;
  addListener(e: 'downloadProgress', cb: (p: { percent: number }) => void): Promise<{ remove(): void }>;
  addListener(e: 'downloadState', cb: (s: { state: 'done' | 'failed'; code?: 'network' | 'storage' | 'verify_failed' }) => void): Promise<{ remove(): void }>;
  addListener(e: 'installStatus', cb: (s: { status: ApkInstallStatus; message?: string }) => void): Promise<{ remove(): void }>;
}
export const ApkUpdater: ApkUpdaterPlugin;  // registerPlugin('ApkUpdater')
export function isApkUpdaterAvailable(): boolean;
```
Native: `DownloadManager` vào `getExternalFilesDir("updates")`, tên `becutit-<build>.apk`; `setAllowedOverMetered(allowMetered)`; chỉ `https://` trừ khi `BuildConfig.DEBUG`; kiểm SHA-256 + kích thước khi tải xong và **lại lần nữa** ngay trước `install`; `getPackageArchiveInfo` ⇒ `packageName` = `getPackageName()` và `longVersionCode` > bản đang chạy; cài bằng `PackageInstaller` session + `PendingIntent` broadcast (`STATUS_PENDING_USER_ACTION` ⇒ mở intent xác nhận, phát `pending_user`); `cleanup` xóa tệp có build ≤ bản đang chạy. `canInstall` = `getPackageManager().canRequestPackageInstalls()`; `openInstallSettings` = `ACTION_MANAGE_UNKNOWN_APP_SOURCES` với `package:` của app.

- [ ] **Step 1: Test JS hỏng** — `isApkUpdaterAvailable()` false trên web/khi plugin không có; wrapper không gọi native khi không khả dụng.
- [ ] **Step 2:** Viết plugin Java + cầu nối TS; test JS ⇒ PASS; `./gradlew assemblePlayDebug assembleApkDebug` xanh; `check-apk.mjs` vẫn đúng (bản `play` không có lớp plugin: `apkanalyzer dex packages` không thấy `ApkUpdaterPlugin`).
- [ ] **Step 3: AVD thủ công** — bản `apk` debug `1.0.0` trên AVD; dựng `1.0.1` (đổi `version`), phục vụ bằng `npx http-server` trên máy dev; gọi plugin qua CDP: `download` (http, debug) ⇒ `done`; `install` ⇒ hộp xác nhận ⇒ app mở lại bản `1.0.1`; SHA sai ⇒ `verify_failed`, không có hộp cài; APK tên gói khác ⇒ `verify_failed`.
- [ ] **Step 4:** Tự rà bảo mật (đường dẫn tệp không theo input, không `MODE_WORLD_READABLE`, URL scheme, intent có `FLAG_IMMUTABLE`); dòng nhật ký + commit `feat(android): cầu nối tự tải và cài APK cho flavor apk (dự án 8)`.

### Task 7: Nối luồng APK vào mô-đun cập nhật + tài liệu phát hành

**Files:** Modify `apps/host-shell/src/update/apk.ts`, `UpdatePrompt.tsx`, `updateI18n.ts` (khóa `apk*` theo bảng 5.8); Test `src/update/apk.test.ts`; Create `docs/van-hanh/PHAT-HANH-BAN-MOI.md`.

**Interfaces:** Consumes `ApkUpdater` (Task 6), `ChannelUpdater` (Task 5), `pauseSync`/flush sync (Task 4).

- [ ] **Step 1: Test hỏng (plugin giả)** —
  - `update_available` + `apkFile` ⇒ `download({ allowMetered: false })` tự gọi; `downloadState done` ⇒ thẻ `apkReadyTitle` + nút `apkInstall`.
  - Bấm Cập nhật khi chưa tải xong và `navigator.connection.type === 'cellular'` (hoặc `saveData`) ⇒ hỏi `apkMeteredAsk`; "Tải ngay" ⇒ `allowMetered: true`; "Đợi Wi-Fi" ⇒ giữ `false`.
  - `canInstall` false ⇒ thẻ `apkAllowTitle`; **Review Focus 4:** `resume` mà vẫn false ⇒ thẻ còn, `openInstallSettings` chỉ được gọi khi người dùng bấm (đếm 1 lần).
  - Trước `install` gọi flush sync có giới hạn 3 s (flush treo ⇒ vẫn cài sau 3 s).
  - `installStatus cancelled` ⇒ về thẻ Cài đặt; `verify_failed`/`failed` ⇒ thẻ `apkFailed` + `apkOpenPage` (mở `downloadUrl`); quá 3 lần lỗi cùng build ⇒ không tự tải lại.
  - Bắt buộc ⇒ tải với `allowMetered: true` sau khi bấm `forcedAction`, màn chặn hiện `downloading {percent}%`.
  - `apkFile` null + `downloadUrl` có ⇒ mở trang; cả hai null ⇒ chữ `apkNoLink`.
- [ ] **Step 2:** Test ⇒ FAIL; cài đặt; test ⇒ PASS; size-limit chunk cập nhật vẫn ≤ 3,5 kB (vượt ⇒ tách `apk.ts` thành chunk riêng chỉ nạp khi kênh `apk`).
- [ ] **Step 3: AVD đầu-cuối** (skill `thu-tren-emulator`, cổng Gateway riêng): contract giữ **chỉ https**, nên dùng CDP `Fetch.enable` chặn response `/v1/app/version` và thay `apkFile.url` bằng `http://10.0.2.2:<cổng>/becutit-1.0.1.apk` (SHA/kích thước thật); kiểm https phía client chấp nhận ngoại lệ duy nhất host `10.0.2.2`/`localhost` (native debug cũng chỉ cho http khi `BuildConfig.DEBUG`) ⇒ thẻ tải xong ⇒ xin quyền ⇒ cài ⇒ app `1.0.1`, tiến độ còn; bản `play` cùng Gateway không hiện gì về APK.
- [ ] **Step 4:** `PHAT-HANH-BAN-MOI.md`: tăng `version` ⇒ build web + `assemblePlayRelease`/`assembleApkRelease` (khi có keystore) ⇒ tính SHA-256/kích thước (`certutil -hashfile <apk> SHA256` / `sha256sum`) ⇒ đăng APK lên URL theo phiên bản (dự án 7) ⇒ sửa `app-versions.json` ⇒ triển khai Gateway; luật: chỉ nâng `minBuild` khi bản mới có ở mọi kênh; một keystore APK dùng mãi; outbox 5000 sự kiện.
- [ ] **Step 5:** Dòng nhật ký + commit `feat(host): tự tải và cài bản APK mới (dự án 8)`.

### Task 8: Kiểm toàn nhánh (phiên chính)

- [ ] Gộp các nhánh đợt 4; `pnpm build`, `pnpm test`, `pnpm lint:boundaries`, `pnpm --filter @vietlearning/host-shell size`, e2e đầy đủ.
- [ ] `kien-truc` xem lại Task 2 (hook trước xác thực), Task 3/6/7 (native, quyền, kiểm tệp).
- [ ] Skill `kiem-truoc-khi-gop`; AVD cả hai flavor; báo cáo cuối giai đoạn theo mẫu `AGENTS.md` mục 6; ghi rõ phần chưa kiểm được (In-App Updates thật của Play cần internal app sharing — để phần phát hành).
