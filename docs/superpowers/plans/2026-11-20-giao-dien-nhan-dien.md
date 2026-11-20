# Nhận diện & giao diện Bé Cu Tít — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đổi app sang bản sắc Bé Cu Tít (bảng màu làng quê, nhân vật theo trạng thái, 4 tab + bong bóng, Hồ sơ/Cài đặt, chuyển cảnh, âm hiệu ứng, nhạc nền) mà không vượt ngân sách gói đầu.

**Architecture:** Token màu một nguồn trong `packages/ui/src/theme.css`; thành phần chung (`CuTit`, icon, nút/thẻ) trong `packages/ui`; điều phối âm thanh trong `packages/shared/src/audio` (mọi nguồn phát/thu báo vào đây, không import chéo MFE); cài đặt theo máy (giao diện, âm, nhạc, chuyển động) là slice **cục bộ không đồng bộ** `deviceSettings` trong `packages/state`; host-shell giữ thanh tab, bong bóng, router, chuyển cảnh.

**Tech Stack:** React 18, react-router, Tailwind v4 + CSS variables, Zustand (persist), Web Audio API, View Transitions API, Capacitor 7 Android, Vitest / `node --test`, Playwright e2e, size-limit.

**Spec:** `docs/superpowers/specs/2026-11-20-giao-dien-nhan-dien-design.md` (đọc kèm mục 8 — quyết định bổ sung).

## Global Constraints

- Nhánh nền: `claude/app-improvement-feedback-a500bb` (commit `3a64444` trở đi). Mỗi đợt (wave) mở phiên con trong worktree riêng cắt từ nhánh này; gộp về nhánh này sau khi đợt xong.
- Gói đầu (`app-*.js` + `react-*.js`): trần hiện 64,5 kB; được nâng **tối đa 67,5 kB**, ghi lý do vào `.size-limit.cjs` + nhật ký. Ảnh, âm, nhạc, màn Hồ sơ/Cài đặt/Bạn bè/Luyện tập, hiệu ứng ăn mừng: **lazy**.
- Bảng màu sáng: nền `#FBF3E4` · bề mặt `#FFFDF8` · tiêu đề `#5A3E28` · chữ `#3B2A1E` · nhấn `#E9B949` · chính/thành công `#6FA544` · trời `#CFE8F3` · viền `#EADFCB`. Font Be Vietnam Pro. Bo góc 16–24px. Có bộ tối tương ứng; chữ đạt tương phản WCAG AA (≥ 4,5:1).
- Mọi chuỗi giao diện có **vi + en** qua `i18n.ts` (`defineMessages`) của gói/MFE sở hữu; nội dung học giữ tiếng Việt.
- `pnpm lint:boundaries` phải sạch: MFE không import MFE khác.
- Chuyển cảnh ≤ 200 ms; `prefers-reduced-motion` **và** công tắc "giảm chuyển động" tắt mọi chuyển động, kể cả `::view-transition-*`.
- Âm: chỉ dùng tệp trong `docs/thiet-ke/am-thanh/v3/chon/` (9 âm) và `v3/nen/` (3 nhạc); `.ogg` Opus + `.mp3` dự phòng.
- Không đổi contract `/v1/sync`, không migration DB.
- Mỗi task kết thúc bằng commit nhỏ; mỗi phiên con thêm **một dòng nhật ký** (`docs/NHAT_KY_CHUYEN_DOI_MOBILE.md` mục 3) ghi đã kiểm gì.

## Review Focus

1. **Nhạc nền lọt vào lúc thu âm/nghe mẫu** (nguồn âm mới hoặc bị quên chưa báo điều phối) ⇒ chấm phát âm sai. Kiểm: test điều phối (Task 3) + test từng nguồn (Task 4) + e2e/AVD (Task 12).
2. **Người dùng cũ** mở bản mới: theme đang lưu `becutit.theme` = `dark` và `/tuy-chinh`, `/kham-pha`, `/ho-so` cũ trong lịch sử/link ⇒ phải giữ cài đặt và chuyển hướng, không trắng màn. Kiểm: Task 1 (đọc khóa cũ), Task 8 (chuyển hướng).
3. **Bong bóng che nút** ở màn nhỏ 320px/bàn phím mở ⇒ Task 9 có test ẩn khi `visualViewport` co và e2e 320px.
4. **WebView không có `startViewTransition`** (Android 7–9) ⇒ fade CSS, không lỗi. Task 10 test nhánh không hỗ trợ.
5. **Tự phát nhạc bị chặn** (chưa có cử chỉ, máy im lặng, app khác đang phát) ⇒ không ném lỗi, không phát dồn sau. Task 3 test `play()` bị từ chối.

---

## Bản đồ tệp và đợt làm song song

| Đợt | Task | Phiên con (Sonnet) | Tệp chính (không chồng nhau trong cùng đợt) |
|---|---|---|---|
| 0 | 1 | phiên chính hoặc 1 phiên | `packages/state/src/deviceSettings.ts`, `packages/state/src/index.ts` (chỉ thêm export), `packages/shared/src/audio/types.ts` |
| 1 | 2 | `ui-token-icon` | `packages/ui/src/theme.css`, `packages/ui/src/theme/tokens.ts`, `packages/ui/src/icons/*`, `packages/ui/src/components/*` |
| 1 | 3, 4 | `am-thanh-dieu-phoi` | `packages/shared/src/audio/*`, `packages/native/src/speech.ts`, `packages/audio-dsp/src/audio/AudioCaptureBridge.ts`, `packages/exercises/src/audio/coursePlayer.ts`, `apps/mfe-conversation/src/call/useCall.ts`, `apps/mfe-knowledge/src/services/speechSynthesis.ts`, `apps/host-shell/public/audio/*` |
| 1 | 5, 6 | `cutit-icon-app` | `packages/ui/src/mascot/*`, `packages/ui/assets/cutit/*`, `apps/host-shell/public/icons/*`, `apps/host-shell/android/app/src/main/res/*` |
| 2 | 7, 8, 9, 10, 14 | `khung-dieu-huong` | `apps/host-shell/src/App.tsx`, `routes.tsx`, `shell/*` (mới), `styles/*`, `i18n.ts`, `.size-limit.cjs`, `theme/ThemeContext.tsx` |
| 2 | 11 | `ho-so-cai-dat` | `apps/mfe-learner/src/profile/*`, `settings/*`, `friends/*` (mới/đổi), `apps/mfe-learner/src/index.ts` |
| 3 | 12 | nhiều phiên, mỗi MFE một phiên | `apps/mfe-<x>/src/**` của đúng MFE đó |
| 3 | 13 | phiên chính | kiểm toàn nhánh, AVD, nhật ký |

Đợt 1 chỉ chạm `packages/ui/src/index.ts` ở hai task (2 và 5) — mỗi bên chỉ **thêm dòng export**; khi gộp lấy cả hai.

---

### Task 1: Slice cài đặt theo máy `deviceSettings`

**Files:**
- Create: `packages/state/src/deviceSettings.ts`
- Modify: `packages/state/src/index.ts` (thêm `export * from './deviceSettings.js'`)
- Test: `packages/state/test/deviceSettings.test.mjs`

**Interfaces:**
- Produces:
  - `type ThemeChoice = 'light' | 'dark' | 'system'`
  - `MusicChoice` **nhập từ** `@vietlearning/shared/audio` (Task 3 định nghĩa; `state` đã phụ thuộc `shared`, `shared` không được phụ thuộc `state` — tránh vòng). Đợt 0 làm trước Task 3 nên Task 1 tạo luôn tệp `packages/shared/src/audio/types.ts` chỉ chứa `export type MusicTrack = 'sang-lang' | 'chieu-dong' | 'trau-ve'; export type MusicChoice = 'rotate' | MusicTrack; export interface AudioSettings { sfx: boolean; haptics: boolean; music: boolean; musicTrack: MusicChoice; musicVolume: number }`.
  - `interface DeviceSettings extends AudioSettings {` theme: ThemeChoice; sfx: boolean; haptics: boolean; music: boolean; musicTrack: MusicChoice; musicVolume: number /*0..1*/; reducedMotion: boolean; seenBubbleIntro: boolean }`
  - `const DEFAULT_DEVICE_SETTINGS: DeviceSettings` = `{ theme:'light', sfx:true, haptics:true, music:true, musicTrack:'rotate', musicVolume:0.35, reducedMotion:false, seenBubbleIntro:false }`
  - `const deviceSettingsStore` (Zustand + persist, khóa `becutit.device`), `useDeviceSettings<T>(sel)`, `setDeviceSettings(p: Partial<DeviceSettings>): void`
  - `function trackForHour(hour: number): 'sang-lang' | 'chieu-dong' | 'trau-ve'`
  - `function preferredDialect(s: { profile: { dialect }, preferences: { dialect } }): Dialect` (spec mục 8.6: nguồn đúng `preferences.dialect`, rỗng thì `profile.dialect`)

- [ ] **Step 1: Viết test thất bại** — `trackForHour(5)==='sang-lang'`, `trackForHour(11)==='sang-lang'`, `trackForHour(12)==='chieu-dong'`, `trackForHour(17)==='chieu-dong'`, `trackForHour(18)==='trau-ve'`, `trackForHour(4)==='trau-ve'`; mặc định đúng `DEFAULT_DEVICE_SETTINGS`; **di trú**: khi chưa có `becutit.device` mà `localStorage['becutit.theme']==='dark'` thì `theme==='dark'` (người dùng cũ giữ giao diện tối); `preferredDialect` trả `preferences.dialect` khi có, ngược lại `profile.dialect`.
- [ ] **Step 2:** `pnpm --filter @vietlearning/state test` ⇒ FAIL (chưa có module).
- [ ] **Step 3:** Cài đặt `deviceSettings.ts`; slice **không** nằm trong `partialize` của learner store và không đi vào `/v1/sync`.
- [ ] **Step 4:** Chạy lại test ⇒ PASS; `pnpm --filter @vietlearning/state build` ⇒ OK.
- [ ] **Step 5:** Commit `feat(state): deviceSettings cục bộ (giao diện, âm, nhạc, chuyển động)` + dòng nhật ký.

### Task 2: Token màu một nguồn + icon + thành phần nền

**Files:**
- Modify: `packages/ui/src/theme.css` (giá trị `--ct-*` cho `[data-theme="light"]` = bảng màu Global Constraints; `[data-theme="dark"]` = bộ tối ấm tương ứng; thêm `--ct-radius-*`, `--ct-shadow-*`, `--ct-motion-fast: 120ms`, `--ct-motion-base: 180ms`)
- Modify: `packages/ui/src/theme/tokens.ts` (xóa bộ màu Indigo lệch; chỉ xuất tên biến CSS, mascot = nón lá/khăn rằn/áo nâu)
- Create: `packages/ui/src/icons/Icon.tsx`, `packages/ui/src/icons/paths.ts`
- Modify: `packages/ui/src/components/Button.tsx`, `Card.tsx`; Create: `packages/ui/src/components/ListRow.tsx`, `Toggle.tsx`, `SegmentedControl.tsx`
- Modify: `packages/ui/src/index.ts` (thêm export)
- Test: `packages/ui/src/components/components.test.tsx`, `packages/ui/src/theme/contrast.test.ts`

**Interfaces:**
- Produces: `type IconName = 'hoc' | 'luyen-tap' | 'ban-be' | 'ho-so' | 'cai-dat' | 'quay-lai' | 'chat' | 'goi' | 'camera' | 'nhap-vai' | 'loa' | 'tat-loa' | 'nhac' | 'mat-trang' | 'mat-troi' | 'chuyen-dong' | 'khoa' | 'thung-rac' | 'ngon-ngu' | 'mui-ten-phai'`; `<Icon name size? title? />` (SVG nét 1.75, `currentColor`, `aria-hidden` khi không có `title`); `<Button variant: 'primary'|'secondary'|'ghost'|'danger' busy? />`; `<Card />`; `<ListRow icon label hint? to? onClick? trailing? />`; `<Toggle checked onChange label />` (role="switch"); `<SegmentedControl options value onChange />`.

- [ ] **Step 1:** Test thất bại: `contrast.test.ts` đọc `theme.css`, tính tỉ lệ tương phản `ink`/`canvas`, `ink`/`surface`, `accent-ink`/`accent` cho cả sáng và tối ⇒ mỗi cặp ≥ 4.5; `components.test.tsx`: `Toggle` có `role="switch"` và `aria-checked`, `Button busy` có `aria-busy="true"` và `disabled`, `Icon` không `title` ⇒ `aria-hidden="true"`.
- [ ] **Step 2:** `pnpm --filter @vietlearning/ui test` ⇒ FAIL.
- [ ] **Step 3:** Cài đặt. Bộ icon: tự vẽ hoặc lấy bộ mã nguồn mở có giấy phép thương mại (ghi giấy phép trong `paths.ts`).
- [ ] **Step 4:** Test ⇒ PASS; `pnpm build` ⇒ OK; size: CSS toàn app ≤ trần hiện tại (7,8 kB) hoặc nâng có ghi lý do.
- [ ] **Step 5:** Commit `feat(ui): bảng màu Cu Tít một nguồn, icon, thành phần nền` + nhật ký.

### Task 3: Điều phối âm thanh (`packages/shared/src/audio`)

**Files:**
- Create: `packages/shared/src/audio/focus.ts`, `sfx.ts`, `music.ts`, `index.ts`; Modify: `packages/shared/src/index.ts`, `packages/shared/package.json` (subpath `./audio`)
- Create: `apps/host-shell/public/audio/sfx/<9 tệp>.ogg|.mp3`, `apps/host-shell/public/audio/nhac/<3 tệp>.ogg` (chép từ `docs/thiet-ke/am-thanh/v3/chon/` và `v3/nen/`)
- Test: `packages/shared/test/audio-focus.test.mjs`, `packages/shared/test/music.test.mjs`

**Interfaces:**
- Produces:
  - `type AudioUse = 'record' | 'speech' | 'lesson-audio' | 'call'`
  - `acquireAudio(use: AudioUse): () => void` — trả hàm `release`; gọi release hai lần vô hại.
  - `onAudioBusyChange(cb: (busy: boolean) => void): () => void`; `isAudioBusy(): boolean`
  - `type SfxName = 'cham-nut' | 'dung' | 'sai' | 'hoan-thanh' | 'chuoi-ngay' | 'mo-bong-bong' | 'cutit-noi' | 'thong-bao' | 'chuyen-tab'`
  - `playSfx(name: SfxName): void` — no-op khi `sfx` tắt hoặc `isAudioBusy()` với `use==='record'`; giải mã sẵn bằng Web Audio, nạp lười lần đầu.
  - `unlockAudio(): void` — gọi ở cử chỉ đầu tiên (`resume()` AudioContext, bắt đầu nhạc nếu bật).
  - `music: { start(): void; stop(): void; setTrack(t: MusicChoice): void; setVolume(v: number): void }` — `<audio loop>`; bận ⇒ hạ dần về 0 trong 300 ms rồi pause; hết bận ⇒ chờ 1000 ms rồi phát lại; `visibilitychange` hidden ⇒ pause.
  - Đọc cài đặt qua tham số khởi tạo `configureAudio(get: () => AudioSettings, env?: { isSilent?: () => Promise<boolean>; onFocusLost?: (cb: () => void) => () => void })` — `AudioSettings` ở `types.ts` (Task 1); `env` do host-shell cấp từ cầu nối native (Task 14); thiếu `env` (web) ⇒ coi như không im lặng.
  - `haptic(kind: 'nhe' | 'thanh-cong' | 'loi'): void` — `navigator.vibrate` (10 / [10,40,10] / 30 ms), no-op khi `haptics` tắt hoặc không hỗ trợ.
  - Nhạc **không** bắt đầu khi `env.isSilent()` trả true; `onFocusLost` ⇒ `music.stop()` tới lần `unlockAudio()`/mở lại app kế tiếp.

- [ ] **Step 1:** Test thất bại (giả lập `Audio`/`AudioContext`, đồng hồ giả): hai nguồn acquire, một release ⇒ vẫn bận; release cả hai ⇒ hết bận; nhạc đang phát + `acquireAudio('record')` ⇒ volume về 0 rồi `pause()` trong 300 ms; release ⇒ `play()` sau 1000 ms; `play()` reject (`NotAllowedError`) ⇒ không ném, không thử lại cho tới `unlockAudio()`; `setTrack('rotate')` lúc 13:00 ⇒ src chứa `chieu-dong`; `sfx=false` ⇒ `playSfx` không tạo nguồn phát.
- [ ] **Step 2:** `pnpm --filter @vietlearning/shared test` ⇒ FAIL.
- [ ] **Step 3:** Cài đặt.
- [ ] **Step 4:** Test ⇒ PASS; build ⇒ OK.
- [ ] **Step 5:** Commit `feat(shared): điều phối âm thanh, âm hiệu ứng, nhạc nền` + nhật ký.

### Task 4: Mọi nguồn phát/thu báo vào điều phối

**Files:**
- Modify: `packages/native/src/speech.ts` (speak ⇒ `acquireAudio('speech')`, release khi xong/lỗi/hủy), `packages/native/package.json` (+ `@vietlearning/shared`)
- Modify: `packages/audio-dsp/src/audio/AudioCaptureBridge.ts` (bắt đầu thu ⇒ `'record'`), `packages/audio-dsp/package.json`
- Modify: `packages/exercises/src/audio/coursePlayer.ts` (`'lesson-audio'`)
- Modify: `apps/mfe-conversation/src/call/useCall.ts` (cả cuộc gọi ⇒ `'call'`)
- Modify: `apps/mfe-knowledge/src/services/speechSynthesis.ts` (`'speech'`)
- Test: test sẵn có của từng gói + mỗi tệp một ca mới

**Interfaces:**
- Consumes: `acquireAudio`, `AudioUse` (Task 3).

- [ ] **Step 1:** Mỗi nguồn một test thất bại: sau khi bắt đầu ⇒ `isAudioBusy()===true`; sau khi kết thúc **và** sau khi lỗi/hủy ⇒ `false`. Thêm kiểm `grep` trong test CI: không còn `new Audio(`/`speechSynthesis.speak` ngoài các tệp đã bọc (danh sách trắng trong test `packages/shared/test/audio-sources.test.mjs`).
- [ ] **Step 2:** Chạy test từng gói ⇒ FAIL.
- [ ] **Step 3:** Bọc từng nguồn (dùng `try/finally` để release luôn chạy).
- [ ] **Step 4:** `pnpm test`, `pnpm build`, `pnpm lint:boundaries` ⇒ PASS.
- [ ] **Step 5:** Commit `feat(audio): mọi nguồn âm báo điều phối để dừng nhạc nền` + nhật ký.

### Task 5: Thành phần `CuTit` theo trạng thái

**Files:**
- Create: `packages/ui/src/mascot/CuTit.tsx`, `packages/ui/src/mascot/cutit.css`, `packages/ui/assets/cutit/cutit-<mood>.webp` (11 tệp từ `docs/thiet-ke/tam/`)
- Modify: `packages/ui/src/index.ts` (thêm export), `packages/ui/package.json` (subpath `./mascot`)
- Test: `packages/ui/src/mascot/CuTit.test.tsx`

**Interfaces:**
- Produces: `type CuTitMood = 'chao'|'khen'|'an-mung'|'dong-vien'|'suy-nghi'|'nghe'|'noi'|'nhac-hoc'|'buon'|'ngu'|'chan-dung'`; `<CuTit mood size?: number /*px, mặc định 96*/ animate?: boolean /*mặc định true*/ alt?: string />` — ảnh nạp lười theo `mood` (`import.meta` URL/Vite asset), lớp chuyển động: `khen` nhún, `an-mung` nảy, `dong-vien` lắc nhẹ, `ngu` thở chậm, `suy-nghi` nghiêng; tắt khi `prefers-reduced-motion` hoặc `html[data-reduced-motion="true"]`.

- [ ] **Step 1:** Test thất bại: `mood="khen"` ⇒ `img` có `src` chứa `cutit-khen`; `alt` mặc định từ i18n vi/en (ví dụ vi "Bé Cu Tít đang khen bạn"); `animate={false}` ⇒ không có class chuyển động; đổi `mood` ⇒ đổi `src` không remount khung.
- [ ] **Step 2:** `pnpm --filter @vietlearning/ui test` ⇒ FAIL.
- [ ] **Step 3:** Cài đặt; ảnh `loading="lazy"`, `decoding="async"`, khai `width/height` tránh CLS.
- [ ] **Step 4:** Test ⇒ PASS; build ⇒ OK.
- [ ] **Step 5:** Commit `feat(ui): CuTit theo trạng thái` + nhật ký.

### Task 6: Icon app + splash Android/PWA

**Files:**
- Modify: `apps/host-shell/public/icons/icon-192.png`, `icon-512.png` (+ `icon-maskable-512.png` mới), `apps/host-shell/public/manifest*` (màu nền `#FBF3E4`, theme `#6FA544` hoặc theo file hiện có)
- Modify: `apps/host-shell/android/app/src/main/res/mipmap-*/ic_launcher*.png`, `mipmap-anydpi-v26/ic_launcher.xml` (adaptive: foreground = đầu Cu Tít, background = `#FBF3E4`), `drawable*/splash*.png`
- Create: `apps/host-shell/scripts/make-icons.mjs` (sinh mọi kích thước từ `docs/thiet-ke/tam/cutit-icon-app.webp`; chạy lại được khi có bản nét)

- [ ] **Step 1:** Viết script; chạy ⇒ đủ kích thước mdpi…xxxhdpi (48/72/96/144/192) + 512 Play.
- [ ] **Step 2:** `pnpm --filter @vietlearning/host-shell cap:sync` rồi build APK (`android:apk:win`) ⇒ thành công.
- [ ] **Step 3:** Cài trên AVD `BeCuTit_Pixel_API35` (skill `thu-tren-emulator`), chụp màn hình launcher + splash ⇒ icon Cu Tít, nền kem, không méo khi Android cắt tròn.
- [ ] **Step 4:** Commit `feat(android): icon app + splash Bé Cu Tít (ảnh nháp)` + nhật ký (ghi rõ ảnh còn là bản nháp ~230px).

### Task 7: Nối giao diện + cài đặt vào khung app

**Files:**
- Modify: `apps/host-shell/src/theme/ThemeContext.tsx` (đọc/ghi `deviceSettings.theme`; `'system'` theo `prefers-color-scheme`; `data-reduced-motion` trên `<html>`), `apps/host-shell/src/main.tsx` (gọi `configureAudio` + `unlockAudio` ở `pointerdown` đầu tiên, `{ once: true }`)
- Test: `apps/host-shell/src/theme/ThemeContext.test.tsx`

**Interfaces:**
- Consumes: `deviceSettingsStore`, `setDeviceSettings` (Task 1); `configureAudio`, `unlockAudio`, `music` (Task 3).

- [ ] **Step 1:** Test thất bại: `theme:'system'` + media tối ⇒ `html[data-theme="dark"]`; `reducedMotion:true` ⇒ `html[data-reduced-motion="true"]`; đổi `music:false` ⇒ `music.stop()` được gọi; đổi `musicTrack:'trau-ve'` ⇒ `music.setTrack('trau-ve')`; đổi `musicVolume` ⇒ `music.setVolume`.
- [ ] **Step 2–4:** Chạy FAIL → cài đặt → PASS.
- [ ] **Step 5:** Commit `feat(host-shell): giao diện + âm thanh theo deviceSettings` + nhật ký.

### Task 8: 4 tab mới + bản đồ route

**Files:**
- Modify: `apps/host-shell/src/routes.tsx` (bỏ `inTabBar`; thêm `tab: 'hoc'|'luyen-tap'|'ban-be'|'ho-so'|null` và `focus: boolean` cho mỗi route theo spec mục 5.2 và 8.8), `apps/host-shell/src/App.tsx`, `apps/host-shell/src/i18n.ts`
- Create: `apps/host-shell/src/shell/TabBar.tsx`, `apps/host-shell/src/screens/PracticeHub.tsx` (trang Luyện tập: lối vào ôn tập, phát âm, phòng thanh, luyện tập, ghép câu), `apps/host-shell/src/screens/LegacyRedirects.tsx`
- Modify: `apps/host-shell/.size-limit.cjs` (trần gói đầu ≤ 67,5 kB, ghi lý do; thêm mục `PracticeHub-*.js`)
- Test: `apps/host-shell/src/shell/TabBar.test.tsx`, `apps/host-shell/e2e/dieu-huong.spec.ts`

**Interfaces:**
- Produces: `tabOf(pathname: string): TabId | null`; `isFocusRoute(pathname: string): boolean`; route mới `/luyen-tap-chung` (PracticeHub — giữ `/luyen-tap` cho M5), `/ban-be`, `/cai-dat`, `/cai-dat/:nhom` (đăng ký component lazy từ `@vietlearning/mfe-learner` — Task 11 cung cấp).
- Consumes: `Icon` (Task 2), `playSfx('chuyen-tab')` (Task 3).

- [ ] **Step 1:** Test thất bại: `tabOf('/xung-ho')==='hoc'`, `tabOf('/phat-am')==='luyen-tap'`, `tabOf('/cai-dat/am-thanh')==='ho-so'`, `tabOf('/ban-be')==='ban-be'`; `isFocusRoute('/bai-hoc/u1l1')===true`, `isFocusRoute('/hoi-thoai')===true`, `isFocusRoute('/van-hoa')===false`; TabBar render đúng 4 mục có nhãn vi/en, mục đang chọn có `aria-current="page"`; chuyển hướng: `/tuy-chinh`→`/cai-dat`, `/kham-pha`→`/luyen-tap-chung`, `/ho-so` vẫn là Hồ sơ.
- [ ] **Step 2–4:** FAIL → cài đặt → PASS. e2e `dieu-huong.spec.ts`: bấm đủ 4 tab, mỗi tab vẽ màn đúng; vào `/bai-hoc/...` thì không có thanh tab.
- [ ] **Step 5:** `pnpm --filter @vietlearning/host-shell size` ⇒ đạt; commit `feat(host-shell): 4 tab Học · Luyện tập · Bạn bè · Hồ sơ` + nhật ký.

### Task 9: Bong bóng Cu Tít

**Files:**
- Create: `apps/host-shell/src/shell/CuTitBubble.tsx`, `apps/host-shell/src/shell/useBubbleVisibility.ts`, `apps/host-shell/src/shell/BubbleIntro.tsx` (lazy)
- Modify: `apps/host-shell/src/App.tsx`, `apps/host-shell/src/i18n.ts`; màn chat: thêm thanh đổi chế độ trong `apps/host-shell/src/screens/ChatRoute.tsx`, `RoleplayRoute.tsx`, `CallRoute.tsx`, `CameraRoute.tsx` (host bọc, không sửa MFE)
- Test: `apps/host-shell/src/shell/useBubbleVisibility.test.ts`, e2e trong `dieu-huong.spec.ts`

**Interfaces:**
- Consumes: `CuTit` (Task 5), `playSfx('mo-bong-bong')`, `isFocusRoute`, `deviceSettings.seenBubbleIntro`.
- Produces: `useBubbleVisibility(): 'full' | 'mini' | 'hidden'`; trạng thái "đang suy nghĩ" nghe sự kiện bus `cutit:thinking` (`{ thinking: boolean }`) — MFE chat phát qua `EventBus` (Task 12 nối).

- [ ] **Step 1:** Test thất bại: route tập trung ⇒ `'hidden'`; cuộn xuống > 48px ⇒ `'mini'`, cuộn lên ⇒ `'full'`; `visualViewport.height` giảm > 150px (bàn phím) ⇒ `'hidden'`; `isAudioBusy()` vì `'record'` ⇒ `'hidden'`; chạm ⇒ điều hướng `/hoi-thoai`; lần đầu (`seenBubbleIntro:false`) hiện giới thiệu, bấm "Đã hiểu" ⇒ `seenBubbleIntro:true`.
- [ ] **Step 2–4:** FAIL → cài đặt → PASS; e2e ở 320×568: bong bóng không đè nút "Học tiếp" của trang chủ (kiểm `boundingBox` không giao nhau).
- [ ] **Step 5:** Commit `feat(host-shell): bong bóng Cu Tít mở thẳng chat` + nhật ký.

### Task 10: Chuyển cảnh

**Files:**
- Create: `apps/host-shell/src/shell/viewTransition.ts`; Modify: `apps/host-shell/src/routes.tsx` (`prefetchScreen` dùng chung), `apps/host-shell/src/styles/global.css` (fade dự phòng, luật `::view-transition-*` dưới `prefers-reduced-motion` và `html[data-reduced-motion="true"]`)
- Test: `apps/host-shell/src/shell/viewTransition.test.ts`

**Interfaces:**
- Produces: `navigateWithTransition(navigate: NavigateFunction, to: string, load?: () => Promise<unknown>): Promise<void>` — tải chunk đích trước, rồi `document.startViewTransition` nếu có, không thì điều hướng + lớp fade CSS 150 ms.

- [ ] **Step 1:** Test thất bại: không có `startViewTransition` ⇒ vẫn gọi `navigate(to)` đúng 1 lần; có ⇒ `load()` hoàn tất **trước** callback của transition; `reducedMotion` ⇒ điều hướng thẳng, không gọi transition.
- [ ] **Step 2–4:** FAIL → cài đặt → PASS. Dùng cho TabBar và lối vào chính.
- [ ] **Step 5:** Commit `feat(host-shell): chuyển cảnh View Transitions + fade dự phòng` + nhật ký.

### Task 11: Hồ sơ (B), Cài đặt (B), Bạn bè

**Files:**
- Create: `apps/mfe-learner/src/profile/ProfileScreen.tsx`, `apps/mfe-learner/src/settings/SettingsIndex.tsx`, `apps/mfe-learner/src/settings/groups/{GiaoDien,NgonNgu,Hoc,AmThanh,ChuyenDong,QuyenRiengTu,TaiKhoan}.tsx`, `apps/mfe-learner/src/settings/i18n.ts`, `apps/mfe-learner/src/friends/FriendsScreen.tsx`
- Modify: `apps/mfe-learner/src/index.ts` (xuất `ProfileScreen`, `SettingsIndex`, `SettingsGroup`, `FriendsScreen`), tận dụng `preferences/AccountSection.tsx` và phần tùy chỉnh trong `PreferencesScreen.tsx` (di chuyển, không nhân bản)
- Test: `apps/mfe-learner/src/settings/settings.test.tsx`, `apps/mfe-learner/src/profile/ProfileScreen.test.tsx`

**Interfaces:**
- Consumes: `useDeviceSettings`, `setDeviceSettings`, `preferredDialect` (Task 1); `ListRow`, `Toggle`, `SegmentedControl`, `Icon` (Task 2); `CuTit` (Task 5); `playSfx` (Task 3). Màn Cài đặt **chỉ ghi `deviceSettings`**; host-shell phản ứng (Task 7) — MFE không gọi `music` trực tiếp.
- Produces: `SettingsGroupId = 'giao-dien'|'ngon-ngu'|'hoc'|'am-thanh'|'chuyen-dong'|'quyen-rieng-tu'|'tai-khoan'`; `<SettingsGroup id />` cho route `/cai-dat/:nhom`.

- [ ] **Step 1:** Test thất bại: Hồ sơ hiện 4 số liệu (chuỗi ngày, phút học, từ đã thuộc, huy hiệu) và **mục cuối** là "Cài đặt"/"Settings"; mục lục Cài đặt có đủ 7 nhóm theo thứ tự trên; nhóm Âm thanh: tắt "Nhạc nền" ⇒ `deviceSettings.music===false`; chọn bài "Trâu về" ⇒ `musicTrack==='trau-ve'`; nhóm Học đổi phương ngữ ⇒ ghi cả `preferences.dialect` và `profile.dialect`; nhóm Quyền riêng tư có công tắc rút đồng ý micro/camera (gọi action `consent.revoke` hiện có); nhóm Tài khoản giữ mã khôi phục + xóa tài khoản như `AccountSection` cũ; FriendsScreen render `FriendsPanel` + `CuTit mood="chao"` ở trạng thái rỗng.
- [ ] **Step 2–4:** FAIL → cài đặt → PASS; size-limit thêm mục cho chunk mới (≤ 6 kB mỗi màn, ghi lý do nếu vượt).
- [ ] **Step 5:** Commit `feat(mfe-learner): Hồ sơ gọn, Cài đặt mục lục + trang con, màn Bạn bè` + nhật ký.

### Task 12: Đưa từng MFE sang thành phần chung + phản hồi đúng/sai

Một phiên con cho mỗi MFE: `mfe-path`, `mfe-practice`, `mfe-conversation`, `mfe-knowledge`, `mfe-speech-lab`, `mfe-vision`, `mfe-learner` (phần còn lại). Mỗi phiên chỉ sửa trong `apps/mfe-<x>/src/**` (và `packages/exercises` chỉ do phiên `mfe-path` sửa).

**Interfaces:**
- Consumes: `Button`, `Card`, `Icon` (Task 2); `CuTit` (Task 5); `playSfx` (Task 3); `EventBus.getInstance().publish('cutit:thinking', { thinking })` (Task 9, chỉ `mfe-conversation`).

- [ ] **Step 1:** Test thất bại theo MFE: trả lời đúng ⇒ `playSfx('dung')` + `CuTit mood="khen"`; sai ⇒ `playSfx('sai')` + `mood="dong-vien"`; xong bài ⇒ `playSfx('hoan-thanh')` + `mood="an-mung"`; lên chuỗi ngày ⇒ `'chuoi-ngay'`; chat chờ AI ⇒ phát `cutit:thinking` true rồi false; không còn emoji làm icon điều hướng/nút trong MFE đó (test đọc mã nguồn theo danh sách cho phép).
- [ ] **Step 2–4:** FAIL → thay `common/ui.tsx`/`ui.tsx` riêng bằng `@vietlearning/ui` → PASS; `pnpm lint:boundaries` sạch.
- [ ] **Step 5:** Commit theo MFE `refactor(mfe-<x>): thành phần chung + phản hồi Cu Tít` + nhật ký.

### Task 14: Cầu nối native chế độ im lặng + audio focus (Android)

Đợt 2, phiên `khung-dieu-huong` làm sau Task 7 (cùng đụng `main.tsx`).

**Files:**
- Create: `apps/host-shell/android/app/src/main/java/vn/edu/uit/becutit/AudioEnvPlugin.java` (theo mẫu `SystemBarsPlugin.java`): `isSilent()` = `AudioManager.getRingerMode() != RINGER_MODE_NORMAL`; xin `AUDIOFOCUS_GAIN` khi nhạc phát (`AudioAttributes.USAGE_GAME`, `CONTENT_TYPE_MUSIC`), phát sự kiện `focusLost` khi `AUDIOFOCUS_LOSS*`; `isOtherAudioPlaying()` = `AudioManager.isMusicActive()` trước khi xin focus.
- Modify: `MainActivity.java` (đăng ký plugin)
- Create: `packages/native/src/audioEnv.ts` — `getAudioEnv(): { isSilent(): Promise<boolean>; onFocusLost(cb): () => void }` (web: `isSilent` ⇒ `false`, `onFocusLost` ⇒ hàm rỗng)
- Modify: `apps/host-shell/src/main.tsx` (truyền `getAudioEnv()` vào `configureAudio`)
- Test: `packages/native/test/audioEnv.test.mjs` (nhánh web), kiểm tay trên AVD

- [ ] **Step 1:** Test web thất bại ⇒ cài `audioEnv.ts` ⇒ PASS.
- [ ] **Step 2:** Viết plugin Java, `cap:sync`, build APK ⇒ thành công.
- [ ] **Step 3:** AVD: đặt máy chế độ im lặng (`adb shell cmd audio set-ringer-mode silent` hoặc `adb shell settings`), mở app, chạm ⇒ không phát nhạc; trả về bình thường, mở lại ⇒ phát; phát nhạc từ app khác (`adb shell am start` một trình phát) ⇒ nhạc app dừng. Ghi kết quả vào nhật ký (emulator không có loa ⇒ kiểm bằng trạng thái `paused` qua CDP).
- [ ] **Step 4:** Commit `feat(native): chế độ im lặng + audio focus cho nhạc nền` + nhật ký.

### Task 13: Kiểm toàn nhánh

- [ ] **Step 1:** `pnpm build`, `pnpm test`, `pnpm lint:boundaries`, `pnpm --filter @vietlearning/host-shell size`, e2e (`VITE_GATEWAY_URL=http://localhost:4000 pnpm --filter @vietlearning/host-shell build` rồi `e2e`) ⇒ tất cả đạt.
- [ ] **Step 2:** Skill `chup-man-hinh-app`: 4 tab + Hồ sơ + Cài đặt + chat, sáng/tối, vi/en, 320px ⇒ không tràn, không chữ một ngôn ngữ.
- [ ] **Step 3:** Skill `thu-tren-emulator`: chuyển cảnh, bong bóng, nhạc bật sau chạm đầu, nhạc dừng khi thu âm ở `/phat-am` và khi gọi thoại, phát lại sau đó; người dùng cũ (cài bản trước, đặt tối, rồi cài đè) giữ giao diện tối.
- [ ] **Step 4:** Axe trên các màn mới ⇒ không lỗi mới.
- [ ] **Step 5:** Skill `kiem-truoc-khi-gop`; nhật ký tổng kết; hỏi người dùng trước khi gộp.
