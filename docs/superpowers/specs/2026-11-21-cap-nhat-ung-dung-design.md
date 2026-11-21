# Thiết kế dự án 8 — Cập nhật ứng dụng (web/PWA + Android Play + APK cài tay)

> Ngày: 2026-11-21 · Trạng thái: **chờ người dùng duyệt** (đã qua một lượt người đọc độc lập rà, 5 câu hỏi đã xử lý) · Hiện trạng đã kiểm: nhật ký dòng 104.
> Người dùng đã chốt trong phiên thiết kế: **ý C** (nhắc mềm, chỉ chặn khi dưới "bản tối thiểu", offline không chặn) và **cách 1** (Gateway là nguồn duy nhất về phiên bản).

## 1. Mục đích và lý do
Khi ra bản mới, người dùng ở **mọi kênh** phải biết và lên được bản mới; bản quá cũ không được làm hỏng dữ liệu đồng bộ khi máy chủ đổi.

Hiện trạng (đã đọc code):
- **Web/PWA** (`apps/host-shell/vite.config.ts`): `registerType:'autoUpdate'` + `skipWaiting`/`clientsClaim`, `main.tsx` đăng ký SW lười ⇒ tự lấy bản mới và **tự tải lại trang**, có thể giữa bài/giữa lúc thu âm; tab mở lâu không kiểm định kỳ.
- **Android**: web nằm trong APK, SW tắt khi native, `versionCode 1`/`versionName "1.0"` cố định (`android/app/build.gradle`) ⇒ không tự cập nhật. Bản Play phụ thuộc cài đặt tự cập nhật của máy; **APK cài tay (nút "Tải APK" ở trang giới thiệu — dự án 7) không bao giờ biết có bản mới**.
- **Gateway** không biết phiên bản client, không có cách chặn bản cũ.

**Thành công nghĩa là:** bạn ra bản mới ⇒ trong ≤ 6 giờ người đang mở app (≤ lần mở kế tiếp với người không mở) thấy lời nhắc đúng kênh; bấm một nút là lên bản mới (Play: cập nhật ngay trong app; APK: mở trang tải; web: tải lại). Khi bạn nâng "bản tối thiểu" trên máy chủ, bản cũ hơn có mạng sẽ thấy màn "Cần cập nhật" thay vì gọi máy chủ sai định dạng. Không ai bị ngắt giữa bài/thu âm, không ai mất dữ liệu chưa đồng bộ.

## 2. Mục tiêu / không làm / phản mục tiêu
**Mục tiêu**
1. Contract + endpoint công khai `GET /v1/app/version` trả bản mới nhất, bản tối thiểu, ghi chú "Có gì mới" vi+en, link tải (chỉ kênh APK).
2. Lưới an toàn ở Gateway: client gửi số build trong header; dưới bản tối thiểu ⇒ `426 app_update_required` (trừ vài đường miễn trừ).
3. Client: mô-đun kiểm cập nhật **nạp lười**, kiểm khi mở / khi quay lại app / mỗi 6 giờ; nhắc mềm có "Để sau" (3 ngày), màn bắt buộc khi dưới tối thiểu.
4. Android Play: cập nhật trong app bằng `@capawesome/capacitor-app-update` 7.2.0 (MIT).
5. Android APK cài tay: mở trang tải của dự án 7 bằng trình duyệt ngoài.
6. Web/PWA: chuyển sang chế độ **prompt** ("Có bản mới — tải lại?"), kiểm SW định kỳ, không tự tải lại khi đang bận.
7. Số build tự tăng ở CI, dùng chung cho web và Android (`versionCode`), `versionName` lấy từ `package.json`.

**Không làm (dự án này)**
- OTA/live update (Capgo, Capawesome Live Update…): có phí hoặc giấy phép/hạ tầng riêng — để sau.
- Tự tải và cài APK trong app (cần quyền `REQUEST_INSTALL_PACKAGES`, rủi ro chính sách/bảo mật).
- iOS/App Store (plugin có `getAppUpdateInfo` iOS nhưng iOS để sau).
- Trang quản trị chỉnh phiên bản, phát hành theo phần trăm người dùng, trang nhật ký thay đổi đầy đủ.
- Phát hành thật lên Play Console, keystore ký bản release, thử In-App Updates thật (cần internal app sharing) — thuộc phần phát hành để cuối (`release-tasks-later`).

**Phản mục tiêu** (làm xong mà dính một điều dưới đây là hỏng)
- Ngắt người học giữa bài, giữa lúc thu âm/gọi thoại, hoặc tải lại trang làm mất câu trả lời đang làm.
- Chặn người đang offline không cho học bài đã tải sẵn.
- Mất dữ liệu chưa đồng bộ khi bị bắt buộc cập nhật.
- Bản tải từ Play hiện link tải APK / tự cập nhật ngoài Play (vi phạm chính sách Google Play).
- Làm gói tải ban đầu vượt 67,5 kB gzip.
- Chặn được cả đường xóa tài khoản (quyền của người dùng theo NĐ13).

## 3. Ràng buộc
- 7 nguyên tắc `AGENTS.md`: **contract trước** (`packages/contracts`), không import chéo MFE, chuỗi giao diện song ngữ vi+en.
- Ngân sách gói đầu `apps/host-shell/.size-limit.cjs`: **67,5 kB gzip** (hiện còn rất ít dư). Mọi UI/logic cập nhật nằm ở chunk lười; gói đầu chỉ được thêm vài chục byte (trường cấu hình api-client + một `import()`).
- Capacitor **7** ⇒ dùng dòng 7.x của plugin (7.2.0, 28/10/2025, peer `@capacitor/core >=7.0.0`; dòng 7 đã được hãng đánh dấu ngừng phát triển, 8.x cần Capacitor 8 — nâng khi dự án lên Capacitor 8).
- `vite-plugin-pwa` hiện `^0.21.2` (có bản sửa lỗi kiểm định kỳ ở chế độ prompt — issue #663/#673, đã có từ 0.18.x).

### 3.1 Chính sách Google Play liên quan (nêu rõ theo yêu cầu)
- **Device and Network Abuse:** app phân phối qua Google Play **không được tự sửa, thay thế hoặc cập nhật bằng cách nào khác ngoài cơ chế cập nhật của Google Play**, và không được tải mã thực thi (dex, JAR, .so) từ nguồn khác Play. Hệ quả cho thiết kế:
  - Kênh `play` **không bao giờ** nhận/hiện `downloadUrl` (Gateway không trả, client cũng bỏ qua).
  - Cập nhật kênh `play` chỉ qua **Play In-App Updates API** (plugin) hoặc mở trang app trên Play Store.
  - Không xin quyền `REQUEST_INSTALL_PACKAGES` ở bất kỳ kênh nào.
- **APK cài tay** không chịu luật trên (không tải từ Play) nhưng ta vẫn chỉ **mở trang tải bằng trình duyệt**, để người dùng tự cài như lần đầu.
- **In-App Updates** chỉ hoạt động khi app được cài từ Play và Play đã biết bản mới (có độ trễ khi duyệt/rollout) ⇒ luôn có đường dự phòng "mở Play Store".
- Nguồn: [Device and Network Abuse](https://support.google.com/googleplay/android-developer/answer/9888379), [Play policy (dex/JAR/.so)](https://support.google.com/googleplay/android-developer/answer/16559646), [In-app updates — test](https://developer.android.com/guide/playcore/in-app-updates/test).

## 4. Các phương án đã cân nhắc
| Phương án | Ưu | Nhược | Kết quả |
|---|---|---|---|
| **1. Gateway là nguồn duy nhất** (endpoint phiên bản + header + 426) + Play In-App Updates + PWA prompt | Phủ cả 3 kênh; chặn được bản cũ ở máy chủ; đổi số trên máy chủ không cần ra bản app; theo đúng contract-first | Sửa cả contracts, Gateway, api-client, Host | **Chọn** (người dùng chốt) |
| 2. Chỉ dựa Play + PWA, không đụng máy chủ | Ít việc nhất | APK cài tay không bao giờ biết bản mới; không chặn được bản cũ ⇒ không làm được ý C | Loại |
| 3. Tệp `version.json` tĩnh cạnh trang web | Rẻ, cache CDN | Ngoài contract Zod; không có lưới chặn ở máy chủ; app native phải biết thêm một tên miền | Loại |

Mức chặn (người dùng chọn **C**): A chặn hẳn (kẹt người offline/hết dung lượng) · B chỉ nhắc (bản cũ làm hỏng đồng bộ) · **C nhắc mềm, chỉ chặn khi dưới bản tối thiểu, offline không chặn**.

Tham khảo cùng stack (chỉ dùng tài liệu/API, không chép code):
- `@capawesome/capacitor-app-update` — MIT — README 7.0.1 trên unpkg; registry npm (7.2.0, 28/10/2025; latest 8.1.1, 16/10/2026).
- vite-plugin-pwa — MIT — [Prompt for update](https://vite-pwa-org.netlify.app/guide/prompt-for-update), [Periodic SW updates](https://vite-pwa-org.netlify.app/guide/periodic-sw-updates), [React](https://vite-pwa-org.netlify.app/frameworks/react).
- Mẫu min-version/force-update ở máy chủ: mẫu phổ biến "client gửi phiên bản trong header, máy chủ trả **HTTP 426 Upgrade Required**" — tự viết theo pipeline Fastify sẵn có (hook `onRequest`), không có thư viện nào đáng thêm.

## 5. Thiết kế đã chốt

### 5.1 Định danh phiên bản
- **`version`**: chuỗi `x.y.z` trong `apps/host-shell/package.json` — **nguồn duy nhất**. Người phát hành tăng nó mỗi lần ra bản (bản nào lên Play cũng phải tăng ít nhất `z`).
- **`build`**: số nguyên **suy ra tất định từ `version`**: `x·1 000 000 + y·1 000 + z` (vd. `1.4.2` ⇒ `1004002`; giới hạn `y, z ≤ 999`; tối đa vẫn < 2 100 000 000 của Play). Lý do (thay cho `run_number` của CI): không reset khi thêm workflow phát hành sau này, mọi lượt build PR không làm tăng số, máy dev và CI ra cùng số, luôn > `versionCode 1` hiện tại. Một hàm thuần dùng chung (`versionToBuild`) cho Vite, Gradle (tính lại bằng Groovy đọc `package.json`) và test.
- Web: Vite inject `import.meta.env.VITE_APP_VERSION` + `VITE_APP_BUILD`. Android: `build.gradle` đọc `version` từ `../../package.json` ⇒ `versionName = version`, `versionCode = build` (không cần biến môi trường).
- Bản dev (`import.meta.env.DEV`) không kiểm cập nhật và không gửi header.
- **Kênh** `channel ∈ {web, play, apk}` quyết định **lúc chạy**: không native ⇒ `web`; native ⇒ `play`, **trừ khi** bundle được build với `VITE_DIST_CHANNEL=apk` (cùng một Vite build dùng cho web và `cap sync`, nên không có "native build" riêng để đặt mặc định). Thiếu cờ thì là `play` ⇒ an toàn chính sách, không bao giờ hiện link APK.

### 5.2 Contract (`packages/contracts/src/api/appVersion.ts`, export qua `api/index.ts`)
```ts
export const AppChannelSchema = z.enum(['web', 'play', 'apk']);

// GET /v1/app/version?channel=play&build=123   (công khai, không cần token)
export const AppVersionQuerySchema = z.object({
  channel: AppChannelSchema,
  build: z.coerce.number().int().min(0).max(2_000_000_000)
});

const NotesSchema = z.object({ vi: z.string().min(1).max(280), en: z.string().min(1).max(280) });

export const AppVersionResponseSchema = z.object({
  channel: AppChannelSchema,
  latestBuild: z.number().int().min(0),
  latestVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  minBuild: z.number().int().min(0),
  status: z.enum(['up_to_date', 'update_available', 'update_required']),
  notes: NotesSchema.nullable(),
  /** Chỉ kênh apk; https; null nếu chưa có trang tải */
  downloadUrl: z.string().url().startsWith('https://').nullable(),
  /** Gợi ý client chờ bao lâu mới hỏi lại (giây) */
  checkAfterSec: z.number().int().min(300).max(86_400)
});

// Lỗi 426 trên mọi route /v1 khi build < minBuild
export const AppUpdateRequiredErrorSchema = z.object({
  error: z.literal('app_update_required'),
  minBuild: z.number().int(),
  channel: AppChannelSchema
});

export const APP_BUILD_HEADER = 'x-app-build';
export const APP_CHANNEL_HEADER = 'x-app-channel';
```
`status` do Gateway tính: `build < minBuild` ⇒ `update_required`; `build < latestBuild` ⇒ `update_available`; còn lại `up_to_date`.

### 5.3 Gateway
- **Cấu hình**: tệp JSON `apps/gateway/config/app-versions.json` (commit trong repo, mặc định `minBuild 0`, `latestBuild 0` cho cả 3 kênh ⇒ không ai bị nhắc/chặn), có thể trỏ tệp khác bằng biến `APP_VERSIONS_FILE`; chu kỳ đọc lại `APP_VERSIONS_TTL_MS` (mặc định 60 000; e2e đặt 0 để đổi cấu hình giữa các test bằng cách ghi tệp). **Ai sửa tệp:** người/phiên AI phát hành, theo danh sách việc phát hành `docs/van-hanh/PHAT-HANH-BAN-MOI.md` (tạo trong dự án này): tăng `version` ⇒ build ⇒ phát hành ⇒ sửa `latestBuild`/`latestVersion`/`notes` (và `minBuild` khi máy chủ đổi không tương thích) ⇒ triển khai Gateway. Tự động hóa bước này thuộc workflow phát hành (để cuối). Dạng: `{ web: {...}, play: {...}, apk: {...} }`, mỗi kênh `{ latestBuild, latestVersion, minBuild, notes|null, downloadUrl|null }`. Kiểm bằng Zod lúc khởi động (**sai thì Gateway không khởi động**, như các biến môi trường khác); luật: `minBuild ≤ latestBuild`; `downloadUrl` chỉ được có ở `apk` và phải `https://`. Đọc lại tệp tối đa mỗi 60 giây (đổi số không cần khởi động lại; khi triển khai container thì đổi tệp = triển khai lại Gateway, **không** cần ra bản app).
- **Route** `GET /v1/app/version`: đăng ký trong **scope riêng không có hook xác thực** (giống `/v1/auth`), rate limit theo IP (dùng `AUTH_RATE_LIMIT_PER_MINUTE`-kiểu biến mới `APP_VERSION_RATE_LIMIT_PER_MINUTE`, mặc định 30), `Cache-Control: no-store`. Kênh `web`/`play` luôn trả `downloadUrl: null` bất kể cấu hình. `checkAfterSec` mặc định 21 600 (6 giờ).
- **Hook 426**: `onRequest` ở scope `/v1` (chạy **trước** xác thực). **Không** gắn ở `/v1/auth`: các lời gọi phiên trong `packages/api-client/src/session.ts` tự `fetch` (không qua `gatewayConfig()`), và nếu refresh token nhận 426 thì lỗi biến thành `'server'` trước khi tới `/v1` ⇒ màn bắt buộc không bao giờ hiện. Mọi route dữ liệu đều nằm ở `/v1` nên chặn ở đó là đủ. Nếu có header `x-app-build` hợp lệ + `x-app-channel` hợp lệ và `build < minBuild[channel]` ⇒ `426 { error:'app_update_required', minBuild, channel }`. **Không có header ⇒ cho qua** (các bản đã phát hành trước dự án này, curl, công cụ). **Miễn trừ:** `GET /v1/app/version`, `DELETE /v1/me` (quyền xóa tài khoản), `/healthz`, `/audio/*` (ngoài `/v1`). Header sai định dạng ⇒ coi như không có.
- **CORS**: hai header mới phải được phép trong preflight (`@fastify/cors` hiện phản chiếu header được hỏi — builder kiểm bằng test `inject` có `Origin` + `Access-Control-Request-Headers`).
- Audit: không ghi từng request 426 (chỉ log mức info có gộp nếu cần) — để builder.

### 5.4 api-client
- `GatewayConfig` thêm `appBuild?: number`, `appChannel?: 'web'|'play'|'apk'`, `onUpdateRequired?: (info) => void`. Có `appBuild` thì mọi request/SSE gửi 2 header. (Không gửi cho `/audio/*` — các tệp âm thanh đó không qua api-client.)
- Lỗi 426 ⇒ `GatewayErrorKind` mới `'update-required'`, gọi `onUpdateRequired` **một lần mỗi phiên chạy**; `describeGatewayError` có câu vi/en tương ứng. `session.ts` không đổi.
- **Hàng đợi đồng bộ** (`packages/state/src/sync.ts`): khi đã ở trạng thái bắt buộc cập nhật thì **tạm dừng đẩy** (thay vì thử lại mỗi ~60 s và nhận 426 liên tục); sự kiện vẫn vào outbox. Rủi ro đã biết: outbox giới hạn `OUTBOX_MAX = 5000` sự kiện và bỏ cái cũ nhất khi đầy — thời gian bị chặn thực tế ngắn nên chấp nhận, ghi vào tài liệu phát hành: "đặt `minBuild` chỉ khi bản mới đã có trên mọi kênh".
- Phần thêm vào `config.ts` (nằm trong gói đầu) phải tối thiểu; phần xử lý 426 nằm ở client lười như phần còn lại của api-client (R10).

### 5.5 Client — mô-đun kiểm cập nhật (Host, chunk lười)
Vị trí: `apps/host-shell/src/update/` (thuộc Host vì đây là năng lực khung app, không phải màn hình MFE). Chuỗi ở `apps/host-shell/src/update/updateI18n.ts` (chunk lười, không vào `i18n.ts` của gói đầu).

**Nạp lười**: hiện `main.tsx` đăng ký SW ở sự kiện `load` bằng `registerSW({ immediate: true })`. Đổi thành: ở sự kiện `load` gọi một `import('./update/start')`; mô-đun này lo cả đăng ký SW (web) lẫn kiểm cập nhật (mọi kênh). Hàm `onUpdateRequired` truyền vào `configureGateway` chỉ là một hàm nhỏ gọi `import('./update/start').then(m => m.forceRequired(info))`.

**Khi nào kiểm**: lần đầu sau khi mở; khi quay lại app (web: `visibilitychange` → `visible`; native: sự kiện `resume` của `@capacitor/app`, đã có trong dependencies); mỗi `checkAfterSec` (mặc định 6 giờ) khi trang đang hiện. Không hỏi lại trong vòng 30 phút kể từ lần hỏi thành công gần nhất. Dev (`build = 0`) không kiểm.

**Trạng thái lưu** (`localStorage` khóa `becutit.update`, bọc try/catch): `{ lastCheckAt, lastResponse, snoozedBuild, snoozedUntil }`.

**"Đang bận"** = `isAudioBusy()` (`@vietlearning/shared` audio focus: thu âm/nói/âm thanh bài/gọi) **hoặc** đang ở màn bài học/bài tập (builder xác định danh sách route trong `navMap`/routes: bài học lộ trình, luyện tập, ghép câu, nhập vai, phòng tập thanh, gọi thoại). Khi bận: không hiện nhắc mềm, không tải lại, không khởi động lại app; đợi `onAudioBusyChange(false)` + rời màn bận rồi mới hiện.

**Nhắc mềm** (`status = update_available`, hoặc SW web báo có bản mới):
- Thẻ nổi dưới cùng (trên thanh tab), `role="status"`, có Cu Tít nhỏ: tiêu đề, phiên bản, ghi chú "Có gì mới" theo ngôn ngữ giao diện (nếu có), nút **Cập nhật** và **Để sau**.
- "Để sau" ⇒ không nhắc lại bản `latestBuild` này trong 3 ngày (bản mới hơn thì nhắc ngay).
- Sketch:
```
┌────────────────────────────────────┐
│ 🐣 Có bản mới 1.4.0                 │
│ Thêm bài nhập vai đi chợ.           │
│        [ Để sau ]  [ Cập nhật ]     │
└────────────────────────────────────┘
```

**Bắt buộc** (`status = update_required` hoặc nhận 426):
- **Có mạng**: màn che toàn bộ, `role="alertdialog"`, focus vào tiêu đề, không có nút đóng; nút **Cập nhật ngay**. Chỉ hiện khi **không bận** — nếu đang thu âm/làm bài thì đợi xong lượt hiện tại (yêu cầu mạng của lượt đó đằng nào cũng nhận 426 và báo lỗi bình thường).
- **Offline** (`navigator.onLine === false` hoặc lần kiểm thất bại do mạng): **không chặn**; hiện dải nhỏ "Cần cập nhật khi có mạng" ở đầu trang, bài đã tải vẫn học được. Có mạng lại ⇒ kiểm lại ngay.
- Dữ liệu chưa đồng bộ nằm nguyên trong hàng đợi local-first (`@vietlearning/state/sync`), bản mới đọc tiếp và đẩy lên. **Luật cho mọi bản sau:** đổi định dạng hàng đợi đồng bộ phải kèm bước chuyển đổi dữ liệu cũ.
- Sketch:
```
┌────────────────────────────────────┐
│            🐣                       │
│   Cần cập nhật để học tiếp          │
│ Bản này đã cũ, máy chủ không còn    │
│ hỗ trợ. Tiến độ của bạn vẫn an toàn.│
│        [ Cập nhật ngay ]            │
└────────────────────────────────────┘
```

**Hành động "Cập nhật" theo kênh**
| Kênh | Nhắc mềm | Bắt buộc |
|---|---|---|
| `play` | `getAppUpdateInfo()`; nếu `updateAvailability = UPDATE_AVAILABLE` và `flexibleUpdateAllowed` ⇒ `startFlexibleUpdate()`, nghe `onFlexibleUpdateStateChange`; tải xong ⇒ thẻ "Khởi động lại để cập nhật" ⇒ `completeFlexibleUpdate()` (chỉ khi không bận). Không thì `openAppStore()` | `immediateUpdateAllowed` ⇒ `performImmediateUpdate()`; không thì `openAppStore()` |
| `apk` | Mở `downloadUrl` bằng trình duyệt ngoài. `downloadUrl = null` ⇒ ẩn nút, hiện "Hãy tải bản mới từ trang giới thiệu Bé Cu Tít" | Như mềm |
| `web` | `updateSW(true)` của `virtual:pwa-register` (kích hoạt SW mới + tải lại) | `registration.update()` rồi `updateSW(true)`; nếu SW chưa có bản mới thì `location.reload()` |

Plugin `@capawesome/capacitor-app-update` chỉ được `import()` trong chunk lười và chỉ khi `channel = play` và đang chạy native; không có trong bundle web đầu. Mở URL ngoài trên native: builder chọn cách đã có trong dự án (nếu chưa có thì thêm `@capacitor/browser` 7.x MIT, hoặc `window.open(url, '_system')`) và **kiểm trên AVD** rằng mở trình duyệt ngoài chứ không mở trong WebView.

### 5.6 Web/PWA
- `vite.config.ts`: `registerType: 'prompt'`; bỏ `skipWaiting`/`clientsClaim` (để SW mới chờ tới khi người dùng đồng ý); giữ `injectRegister: false`, đăng ký lười như hiện nay.
- `registerSW({ onNeedRefresh, onRegisteredSW })` gọi từ mô-đun cập nhật: `onNeedRefresh` ⇒ nhắc mềm kênh web; `onRegisteredSW` ⇒ gọi `registration.update()` mỗi 6 giờ và khi tab quay lại `visible` (bỏ qua khi offline / SW đang cài).
- Kênh web dùng SW cho "bản mới nhất" và chỉ dùng Gateway cho **bản tối thiểu** (header + 426 + `GET /v1/app/version` để biết `update_required`); `latestBuild` kênh web trong cấu hình có thể để bằng `minBuild`.
- `offlineReady` không cần thông báo.

### 5.7 Build & CI
- `ci.yml`: không cần biến số build (suy từ `package.json`). Job APK hiện có (debug, Gateway emulator) giữ nguyên, kênh `play`; thêm bước kiểm `versionCode` của APK = `versionToBuild(version)` (đọc `output-metadata.json`). **Không** tạo bản APK phân phối kênh `apk` trong dự án này (cần URL Gateway thật + ký release ⇒ phần phát hành / dự án 7); kênh `apk` được kiểm trên AVD bằng bản debug build tay với `VITE_DIST_CHANNEL=apk`.
- Thêm dòng size-limit cho chunk cập nhật (đề xuất ≤ 3 kB gzip; plugin Capawesome là chunk riêng, không tính vào gói đầu).

### 5.8 Chuỗi giao diện song ngữ (`updateI18n.ts`)
| Khóa | vi | en |
|---|---|---|
| `softTitle` | Có bản mới {version} | A new version {version} is available |
| `softLater` | Để sau | Later |
| `softUpdate` | Cập nhật | Update |
| `whatsNew` | Có gì mới | What's new |
| `restartTitle` | Đã tải xong bản mới | The update is ready |
| `restartAction` | Khởi động lại để cập nhật | Restart to update |
| `downloading` | Đang tải bản mới… {percent}% | Downloading the update… {percent}% |
| `forcedTitle` | Cần cập nhật để học tiếp | Please update to keep learning |
| `forcedBody` | Bản này đã cũ, máy chủ không còn hỗ trợ. Tiến độ của bạn vẫn được giữ an toàn. | This version is too old for our server. Your progress is safe. |
| `forcedAction` | Cập nhật ngay | Update now |
| `forcedOffline` | Cần cập nhật khi có mạng · Bài đã tải vẫn học được | Update needed when you're online · Downloaded lessons still work |
| `apkNoLink` | Hãy tải bản mới từ trang giới thiệu Bé Cu Tít. | Please download the new version from the Bé Cu Tít website. |
| `openStoreFailed` | Không mở được cửa hàng. Hãy mở Google Play và tìm "Bé Cu Tít". | Couldn't open the store. Open Google Play and search for "Bé Cu Tít". |
| `webReloadTitle` | Có bản mới — tải lại? | New version — reload? |
| `webReloadAction` | Tải lại | Reload |

Ghi chú "Có gì mới" đến từ Gateway (`notes.vi`/`notes.en`), hiển thị **chữ thuần** (không HTML). `describeGatewayError` thêm: vi "Cần cập nhật ứng dụng để tiếp tục." / en "Please update the app to continue."

### 5.9 Trường hợp offline / lỗi
| Tình huống | Hành vi |
|---|---|
| Mở app khi offline | Không kiểm; dùng `lastResponse` nếu có `update_required` ⇒ chỉ dải "Cần cập nhật khi có mạng"; kiểm lại khi sự kiện `online` |
| Gateway lỗi 5xx / timeout khi kiểm | Im lặng, thử lại ở lần kích hoạt kế (không quá 30 phút/lần) |
| Response sai schema | Bỏ qua (log debug), không nhắc |
| Play chưa biết bản mới (`UPDATE_NOT_AVAILABLE` dù Gateway nói có) | `openAppStore()`; bắt buộc mà Play chưa có ⇒ vẫn màn chặn + nút mở Play Store |
| App APK không có `downloadUrl` | Chữ `apkNoLink`, không nút |
| SW web cài lỗi | Không nhắc; lần kiểm kế thử lại |
| Đang bận khi có kết quả | Giữ kết quả, hiện khi hết bận |

### 5.10 Kiểm thử
- Contracts: test schema (status, `downloadUrl` chỉ https).
- Gateway: route (3 kênh, tính `status`, `downloadUrl` null cho web/play dù cấu hình có), cấu hình sai ⇒ không khởi động, hook 426 (dưới/ngang/trên min, thiếu header, header rác, miễn trừ `DELETE /v1/me` và `/v1/app/version`), preflight CORS với 2 header, rate limit IP.
- api-client: gửi header khi có `appBuild`; 426 ⇒ `update-required` + callback một lần.
- Host (vitest): lịch kiểm (khởi động/resume/6 giờ/30 phút), "Để sau" 3 ngày theo build, hoãn khi bận, offline không chặn, chọn hành động theo kênh (plugin giả).
- e2e (Playwright, Gateway PGlite thật, `APP_VERSIONS_FILE` = tệp tạm, `APP_VERSIONS_TTL_MS=0`; test ghi tệp với số tính từ `versionToBuild(version)` của bản build — không chặn bằng `page.route` để đi đúng đường 426 thật): cấu hình `minBuild` > build của bản e2e ⇒ màn bắt buộc; offline ⇒ chỉ dải; mở thẻ nhắc mềm bằng cấu hình `latestBuild` cao hơn; thẻ không hiện khi đang ở màn bài học.
- AVD (skill `thu-tren-emulator`): bản `apk` mở trình duyệt ngoài; bản `play` cài ngoài Play ⇒ plugin trả không khả dụng ⇒ rơi về `openAppStore()` không crash. **Thử In-App Updates thật cần Play internal app sharing ⇒ để phần phát hành.**
- size-limit: gói đầu ≤ 67,5 kB, chunk cập nhật ≤ 3 kB.

## 6. Phụ thuộc
- **Dự án 7 (trang giới thiệu):** cần một **URL tải APK ổn định** (ví dụ trang `/tai-app` luôn trỏ bản mới nhất) và quy trình đăng APK build với `VITE_DIST_CHANNEL=apk` + đúng `APP_BUILD`. Trước khi có ⇒ `apk.downloadUrl = null` (app vẫn nhắc bằng chữ `apkNoLink`).
- **Phần phát hành (để cuối):** tài khoản Play Console + pháp nhân, keystore ký release, AAB, thử In-App Updates qua internal app sharing, đặt `updatePriority` (Play Developer API — không bắt buộc), tên miền Gateway production.

## 7. Để lại cho người làm (builder)
- Danh sách route "bận" cụ thể; vị trí chính xác thẻ nhắc so với thanh tab và bong bóng Cu Tít.
- Cách mở URL ngoài trên native (5.5) — phải kiểm AVD.
- Cách đọc lại tệp cấu hình (mtime hay TTL 60 s), log 426 gộp.
- Chi tiết bước CI kiểm `versionCode`.

## 8. Các quyết định tôi (AI) tự đặt — người dùng kiểm khi đọc
- "Để sau" = 3 ngày; kiểm mỗi 6 giờ; không hỏi lại trong 30 phút.
- Số build suy từ `version` (`x·10⁶ + y·10³ + z`), không dùng số lượt chạy CI; native mặc định kênh `play`.
- Không chặn `/v1/auth` (chỉ chặn `/v1`); hàng đợi đồng bộ tạm dừng khi bị bắt buộc cập nhật.
- Sửa `app-versions.json` bằng tay theo danh sách việc phát hành; chưa tự động.
- Dự án này không tạo APK phân phối kênh `apk` (thuộc phát hành / dự án 7).
- Endpoint công khai không cần token; client thiếu header thì không bị chặn.
- Không chặn `DELETE /v1/me`.
- Kênh web lấy "bản mới" từ SW, chỉ dùng Gateway cho bản tối thiểu.
- Cấu hình phiên bản là tệp JSON trong repo (không làm trang quản trị, không lưu DB).
