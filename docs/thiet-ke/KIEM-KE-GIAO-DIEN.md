# Kiểm kê giao diện hiện tại (trước khi làm lại)

> Ngày: 2026-11-20 · Nhánh worktree: `ci-cd-9e1d23` · Phạm vi: chỉ đọc mã, không sửa app.
> Đường dẫn dạng `tệp:dòng` tính từ thư mục gốc repo. Tất cả là đọc bằng grep/đọc tệp.
> **Chưa kiểm chứng:** chưa chạy build, chưa đo `size-limit`, chưa mở app trên trình duyệt hay emulator.

## 0. Tóm tắt

| # | Điều quan trọng |
|---|---|
| 1 | Thanh tab hiện có 5 mục: Học 🏠, Ôn tập 🔁, Xưng hô 🏮, Phát âm 🎙️, Khám phá 🧭 (`apps/host-shell/src/App.tsx:95-127`). Chỉ `/xung-ho` và `/phat-am` có `inTabBar: true` (`apps/host-shell/src/routes.tsx:53`, `:85`). |
| 2 | Cài đặt nằm rải ở 5 chỗ: Tùy chỉnh (`/tuy-chinh`), nút 🌐 ở Trang chủ, nhóm Sáng/Tối ở màn Xưng hô, cài nhắc học ở Học, và "Bạn học" trong Hồ sơ. |
| 3 | **Không có nút Sáng/Tối trong Cài đặt.** Chỉ đổi được ở màn Xưng hô (`apps/mfe-knowledge/src/components/HonorificMatrixScreen.tsx:70-82`). Lựa chọn lưu ở `localStorage` khóa `becutit.theme`, mặc định tối (`apps/host-shell/src/theme/ThemeContext.tsx:6`, `:12`). |
| 4 | Không có âm thanh hiệu ứng (đúng/sai, lên cấp). Chuyển động rất ít. Đã có tắt chuyển động khi người dùng bật "giảm chuyển động" (`apps/host-shell/src/styles/global.css:76-84`). |
| 5 | UI trùng lặp: `packages/ui` có `Button`/`Card` nhưng không app nào import. Mỗi MFE tự viết lại `card`, `primaryBtn`, `ChoiceGroup`, nút 🐢. Hai bộ màu lệch nhau: `packages/ui/src/theme.css` (nâu/hổ phách) và `packages/ui/src/theme/tokens.ts` (indigo). |

---

## 1. Cài đặt và tùy chỉnh người dùng

Cột "Đề xuất": **Cài đặt chung** = nên chuyển vào mục Cài đặt chung. **Giữ** = để ở chỗ hiện tại.

| Mục | Nằm ở đâu (tệp:dòng) | Lưu ở | Đề xuất |
|---|---|---|---|
| Ngôn ngữ giao diện vi/en | Tùy chỉnh: `apps/mfe-learner/src/preferences/PreferencesScreen.tsx:25-28`, `:118`. Nút 🌐 nhanh ở Trang chủ: `apps/host-shell/src/screens/Home.tsx:37-46` | `preferences.uiLanguage` (`packages/state/src/index.ts:42`); mặc định theo máy `:19-25` | **Cài đặt chung**. Nút 🌐 ở Học có thể bỏ, hoặc giữ như lối tắt |
| Giao diện sáng/tối | Chỉ ở Xưng hô: `apps/mfe-knowledge/src/components/HonorificMatrixScreen.tsx:70-82`; nối với host qua `apps/host-shell/src/screens/HonorificScreen.tsx:12-18`. Logic: `apps/host-shell/src/theme/ThemeContext.tsx:6-52` | `localStorage` `becutit.theme`, mặc định `dark` | **Cài đặt chung** (hiện không có). Gỡ nhóm nút khỏi Xưng hô |
| Phương ngữ (Bắc/Trung/Nam) | `PreferencesScreen.tsx:23`, `:121-134` | `preferences.dialect` (`index.ts:39`) **và** `profile.dialect` (`index.ts:33`) | **Cài đặt chung**. Hai trường trùng nghĩa, cần chọn một nguồn. Chưa kiểm chứng cách đồng bộ giữa hai trường |
| Giọng đọc (theo miền) | `PreferencesScreen.tsx:16-21` (danh sách sẵn), `:45-53` (`/v1/speech/voices`), `:135` | `preferences.voiceId` | **Cài đặt chung** |
| Tốc độ đọc 🐢 (0,5×–2×) | Thanh kéo: `PreferencesScreen.tsx:136-151`. Nút 🐢 chậm: `packages/exercises/src/audio/SlowButton.tsx:9` và `listen.tsx` ở 4 MFE (`apps/mfe-conversation/src/listen.tsx:14-20`, tương tự learner, practice, vision) | `preferences.speed` | **Cài đặt chung**. Nút 🐢 trong bài giữ nguyên |
| Nghe thử giọng | `PreferencesScreen.tsx:86-94`, `:152-154` | — | **Cài đặt chung** |
| Nhân vật trợ giảng (Bé Cu Tít / Cô giáo) | `PreferencesScreen.tsx:162-175` | `preferences.persona` (`index.ts:41`) | **Cài đặt chung** |
| Mức sửa lỗi (nhẹ / nghiêm / tắt) | `PreferencesScreen.tsx:24`, `:176-182` | `preferences.correctionLevel` (`index.ts:40`) | **Cài đặt chung** |
| Nhắc học (giờ nhắc) | `apps/mfe-path/src/GoalPanel.tsx:63-80` (🔔 ở dòng 65). Hiện ở Học qua `apps/mfe-path/src/PathHome.tsx:188` | `progressStore` (`@vietlearning/state/progress`); lên lịch native `packages/native/src/reminders.ts` | **Cài đặt chung** |
| Mục tiêu phút/ngày | `GoalPanel.tsx:37` (⚙️ "goalSettings"), `:38-60` | `progressStore` | **Giữ** ở Học hoặc Hồ sơ (ảnh hưởng vòng tiến độ) |
| Đồng ý quyền riêng tư (giọng, camera): xem và rút | `PreferencesScreen.tsx:185-210` (rút ở `:203`). Hỏi lúc dùng: `apps/mfe-conversation/src/chat/VoiceConsent.tsx`, `apps/mfe-vision/src/camera/CameraScreen.tsx:185`, `packages/exercises/src/speak/SpeakExercise.tsx:123` | `consents` (`index.ts:72`) | **Cài đặt chung > Quyền riêng tư** |
| Chính sách quyền riêng tư (link) | `PreferencesScreen.tsx:211-214` → `/quyen-rieng-tu` (`apps/host-shell/src/routes.tsx:160`) | — | **Cài đặt chung** |
| Tài khoản khách: mã khôi phục, sao chép, khôi phục máy mới | `apps/mfe-learner/src/preferences/AccountSection.tsx:156-230` (mã `:170-176`, sao chép `:131-133`) | phiên: `packages/api-client/src/session.ts` | **Cài đặt chung > Tài khoản** |
| Trạng thái đồng bộ (đang lưu / đã đồng bộ / chỉ trên máy) | `PreferencesScreen.tsx:108-112`; đẩy `/v1/preferences` `:35-43` | — | **Cài đặt chung** (hiển thị ở đầu) |
| Xóa dữ liệu / xóa tài khoản | `AccountSection.tsx:231-240` (nút `:238`), xử lý `:116-127`. Hủy nhắc khi xóa: `apps/host-shell/src/account/bootstrap.ts:28` | — | **Cài đặt chung > Dữ liệu**. Giữ bước xác nhận |
| Bạn học (mã mời, nhiệm vụ tuần chung) | `apps/mfe-learner/src/progress/ProgressScreen.tsx:144-160` (mở bằng `friendsOpen`, dòng `:30`); `apps/mfe-learner/src/friends/FriendsPanel.tsx:113` | máy chủ `/v1/friends` | **Tab Bạn bè** (tách khỏi Hồ sơ) |
| Làm lại xếp lớp | `ProgressScreen.tsx:163` ("redoPlacement"); banner ở Trang chủ `Home.tsx:57-67` | `profile.onboarded`, `profile.level` | **Giữ** ở Hồ sơ. Banner đưa về Học |
| Banner offline | `apps/host-shell/src/App.tsx:69-73` | — | Không phải cài đặt, giữ |

Ghi chú: hiện **không có** cài đặt âm thanh hiệu ứng, rung, hay cỡ chữ.

---

## 2. Danh sách route và màn

Nguồn: `apps/host-shell/src/routes.tsx`. Tổng **20 route**: 12 trong `SCREENS` (`:47-140`), 7 trong `PATH_ROUTES` (`:163-170`), cộng `/` (Trang chủ) và `*` (về Trang chủ, `apps/host-shell/src/App.tsx:89`).

Cột "Tab hiện nay" cho biết tab bar hiện tại. Cột "Đề xuất" là đề xuất, **cần bạn duyệt**.

| Route | Màn (tệp) | Chủ (owner) | Tab hiện nay | Đề xuất (5 tab) |
|---|---|---|---|---|
| `/` | `apps/host-shell/src/screens/Home.tsx` (lộ trình ở `PathHomeRoute`) | host | Học 🏠 | **Học** |
| `/bai-hoc/:lessonId` | `screens/LessonRoute.tsx` | mfe-path | — | **Học** (trong bài) |
| `/kiem-tra/:unitId` | `screens/TestOutRoute.tsx` | mfe-path | — | **Học** (trong unit) |
| `/on-tap` | `screens/ReviewRoute.tsx` | mfe-path | Ôn tập 🔁 | **Luyện tập** |
| `/kham-pha` | `screens/Explore.tsx` | host | Khám phá 🧭 | **Bỏ khỏi tab**. Giữ làm trang lối tắt hoặc gỡ |
| `/xung-ho` | `screens/HonorificScreen.tsx` → mfe-knowledge | mfe-knowledge | Xưng hô 🏮 | **Học** (mục tra cứu). Phương án khác: **Cu Tít** |
| `/van-hoa` | `screens/CultureRoute.tsx` | mfe-knowledge | — (Khám phá) | **Học** (tra cứu) |
| `/phuong-ngu` | `screens/DialectRoute.tsx` | mfe-speech-lab | — (Khám phá) | **Học** (tra cứu) |
| `/phat-am` | `screens/ToneLabRoute.tsx` | mfe-speech-lab | Phát âm 🎙️ | **Luyện tập** |
| `/phong-thanh` | `screens/ToneGymRoute.tsx` | mfe-speech-lab | — (Khám phá 🎯) | **Luyện tập** |
| `/luyen-tap` | `screens/DrillRoute.tsx` | mfe-practice | — (Khám phá) | **Luyện tập** |
| `/ghep-cau` | `screens/SentenceRoute.tsx` | mfe-practice | — (Khám phá) | **Luyện tập** |
| `/hoi-thoai` | `screens/ChatRoute.tsx` | mfe-conversation | — (Khám phá) | **Cu Tít** |
| `/nhap-vai` | `screens/RoleplayRoute.tsx` | mfe-conversation | — (Khám phá) | **Cu Tít** |
| `/goi-thoai` | `screens/CallRoute.tsx` | mfe-conversation | — (từ Trò chuyện) | **Cu Tít** |
| `/camera` | `screens/CameraRoute.tsx` | mfe-vision | — (Khám phá) | **Cu Tít** (phương án khác: Luyện tập) |
| `/ho-so` | `screens/ProgressRoute.tsx` | mfe-learner | — (Khám phá) | **Hồ sơ** |
| `/tuy-chinh` | `screens/PreferencesRoute.tsx` | mfe-learner | — (Khám phá) | **Hồ sơ > Cài đặt chung** |
| `/bat-dau` | `screens/OnboardingRoute.tsx` | mfe-learner | — (banner Trang chủ) | **Hồ sơ** (Xếp lớp) |
| `/quyen-rieng-tu` | `screens/PrivacyRoute.tsx` | host | — (link từ Tùy chỉnh) | **Cài đặt chung** |
| (chưa có) | — | mfe-learner | — (Hồ sơ `:144`) | **Bạn bè**: cần route mới, ví dụ `/ban-be` |

Ghi chú về chỗ **Cu Tít** và **Học**: các khối AI trong chat trỏ tới `/van-hoa`, `/xung-ho`, `/phat-am`, `/luyen-tap`, `/phuong-ngu` (`apps/mfe-conversation/src/chat/AgentBlockView.tsx:10-14`). Vì vậy có thể đặt các màn tra cứu này dưới **Cu Tít** cho gần với luồng hội thoại. Đây là lựa chọn cần quyết định.

---

## 3. Emoji dùng làm icon

Số liệu đếm bằng grep trên `apps` và `packages` (không gồm `node_modules`, `dist`, `e2e`):

- Tổng **286 dòng** có emoji trong `.ts`/`.tsx`.
- Khoảng **84 dòng** `.tsx` là icon/nhãn trong giao diện (không tính chú thích và test).
- Phần còn lại (khoảng 200 dòng) là chuỗi i18n, test và chú thích. Đây là số ước lượng từ grep, **chưa kiểm chứng** chính xác.

Vị trí chính:

| Loại | Emoji | Vị trí (tệp:dòng) |
|---|---|---|
| Thanh tab | 🏠 🔁 🧭 | `apps/host-shell/src/App.tsx:98`, `:104`, `:123` |
| Thanh tab (lấy từ route) | 🏮 🎙️ | `apps/host-shell/src/routes.tsx:50`, `:82` |
| Icon 12 công cụ (Khám phá) | 🏮 📜 💬 🎭 🎙️ 🗺️ 🧩 🧱 📷 📈 ⚙️ 🌱 | `apps/host-shell/src/routes.tsx:50-138`; hiển thị `screens/Explore.tsx:31-33` |
| Nút đổi ngôn ngữ | 🌐 | `apps/host-shell/src/screens/Home.tsx:45` |
| Banner làm quen | 🌱 | `apps/host-shell/src/screens/Home.tsx:60` |
| Nút đọc chậm | 🐢 (khoảng 5 bản) | `packages/exercises/src/audio/SlowButton.tsx:9`; `listen.tsx` ở 4 MFE |
| Nút nghe | 🔈 (khoảng 7 chỗ) | `packages/exercises/src/sentence/SentenceExercise.tsx:84`, `packages/exercises/src/story/StoryExercise.tsx:64`, `apps/mfe-path/src/DialectCard.tsx:39`, `apps/mfe-vision/src/camera/CameraScreen.tsx:254`, và các chỗ khác |
| Ghi âm / dừng | 🎙️ ⏹️ 🎤 | `apps/mfe-speech-lab/src/components/ToneLabScreen.tsx:124`; `packages/exercises/src/speak/SpeakExercise.tsx:160`; `apps/mfe-conversation/src/chat/ChatPanel.tsx:145` |
| Trạng thái, thống kê | 🔥 ⭐ 🎯 🔁 🏅 📈 ✅ ⬜ ✓ ✗ ❄ | `apps/mfe-path/src/PathHome.tsx:60`, `:66`, `:177`; `apps/mfe-path/src/motivation/Motivation.tsx:114` |
| Tiêu đề mục | 🗂️ ✏️ 🔔 ⚙️ 🗺️ | `apps/mfe-path/src/ReviewScreen.tsx:142-168`; `GoalPanel.tsx:37`, `:65` |
| Mô phỏng khung máy | 📱 🍎 🤖 🖥️ | `apps/mfe-knowledge/src/components/MobileSimulatorFrame.tsx` |

Lưu ý: emoji hiển thị theo font của từng máy. Chưa kiểm chứng việc hiển thị trên Android (WebView) và trên các máy khác nhau.

---

## 4. Chuyển động, animation và âm thanh

### 4.1 Chuyển động hiện có

| Loại | Vị trí (tệp:dòng) | Ghi chú |
|---|---|---|
| Vòng quay chờ (spinner) | `apps/host-shell/src/styles/global.css:284-296` (`@keyframes spin` ở `:293`) | Có `motion-reduce` ở `apps/mfe-learner/src/common/ui.tsx:24` và `apps/mfe-vision/src/camera/CameraScreen.tsx:218` |
| Khung xương nhấp nháy (`animate-pulse`) | `apps/host-shell/src/screens/Home.tsx:17-27`; `packages/exercises/src/ExerciseView.tsx:30-40` | |
| Nhấp nháy khi AI đang nói | `apps/mfe-conversation/src/call/CallScreen.tsx:137` | `animate-pulse` |
| Thanh tiến độ (đổi `width`) | `apps/mfe-learner/src/onboarding/OnboardingScreen.tsx:101`; `apps/mfe-path/src/session/SessionRunner.tsx:109`; `apps/mfe-practice/src/drills/DrillScreen.tsx:205` | 3 bản giống nhau |
| Đổi màu nút chọn | `apps/mfe-knowledge/src/components/honorific/ChoiceGroup.tsx:81`; `ControlPanel.tsx:96`; `SentencePanel.tsx:92` | `transition-colors` |
| Nút co khi nhấn | `apps/mfe-speech-lab/src/components/ToneLabScreen.tsx:112` | `active:scale-95` |
| Nền khi nhấn thẻ | `apps/host-shell/src/styles/global.css:238-240` | Chỉ đổi nền, không có animation |
| Khung xem thử điện thoại | `apps/mfe-knowledge/src/components/MobileSimulatorFrame.tsx:48`, `:194` | 0,3 s, chỉ dùng trong màn xem thử |
| Cuộn về đầu khi đổi màn | `apps/host-shell/src/App.tsx:61-63` | `window.scrollTo(0, 0)` |
| Hàm `transition` mặc định của nút | `packages/ui/src/components/Button.tsx:21` (`all 0.15s`) | Không app nào dùng |

Không có: chuyển cảnh giữa các màn (View Transition), hiệu ứng mở tab, animation khi thưởng huy hiệu, hiệu ứng lên cấp.

### 4.2 Tắt chuyển động khi người dùng bật "giảm chuyển động"

- `apps/host-shell/src/styles/global.css:76-84`: `@media (prefers-reduced-motion: reduce)` tắt `animation` và `transition` cho mọi phần tử (`!important`).
- Các `motion-reduce:` ở trên là thừa vì phần này đã tắt hết. Không cần sửa.

### 4.3 Âm thanh

| Có hay không | Chi tiết (tệp:dòng) |
|---|---|
| Âm hiệu ứng (đúng/sai, chuông, thưởng) | **Không có.** Không tìm thấy `oscillator`, file `.mp3`/`.wav` hiệu ứng, hay `new Audio` phục vụ hiệu ứng |
| Giọng đọc máy (TTS) | `packages/native/src/speech.ts`; `apps/mfe-knowledge/src/services/speechSynthesis.ts:114-118` |
| Tệp âm thanh dựng sẵn | `packages/exercises/src/audio/coursePlayer.ts:104-112` |
| Phát âm trong gọi thoại | `apps/mfe-conversation/src/call/useCall.ts:32-41`; `apps/mfe-conversation/src/call/speakReply.ts:45` |
| Ghi âm (micro) | `packages/audio-dsp/src/audio/AudioCaptureBridge.ts:80-88` (`AudioContext`, `AudioWorkletNode`) |
| Rung (haptic) | **Không có** (không tìm thấy `navigator.vibrate`) |

---

## 5. Thành phần UI dùng chung và chỗ trùng lặp

### 5.1 Đã có trong `packages/ui`

| Thành phần | Vị trí | Dùng ở đâu |
|---|---|---|
| Token màu (CSS variables, class `bg-surface`, `text-ink`…) | `packages/ui/src/theme.css` | Dùng thật, qua Tailwind (`apps/host-shell/src/styles/app.css:7`) |
| `Button` | `packages/ui/src/components/Button.tsx` | **Không app nào import** |
| `Card`, `Badge`, `AgentBlockWrapper` | `packages/ui/src/components/Card.tsx:7`, `:25`, `:51` | **Không app nào import** |
| `agent-blocks` (sanitize) | `packages/ui/src/agent-blocks/` | `apps/mfe-conversation/src/chat/useChatSession.ts:4` |
| `themeTokens` (bảng màu) | `packages/ui/src/theme/tokens.ts:5-29` | **Không ai import.** Màu indigo `#6366F1`, khác `theme.css` |

### 5.2 Trùng lặp giữa các MFE

| Thành phần | Bản 1 | Bản 2 (và khác) |
|---|---|---|
| `card` (khối nền) | `apps/mfe-learner/src/common/ui.tsx:18` | `apps/mfe-path/src/ui.tsx:8`. Chuỗi class lặp inline ở **19 file** |
| `primaryBtn`, `secondaryBtn` | `apps/mfe-learner/src/common/ui.tsx:19-20` | `apps/mfe-path/src/ui.tsx:4`, `:6` |
| `linkBtn` | `apps/mfe-learner/src/common/ui.tsx:38` | Chưa có bản khác |
| Khung màn (tiêu đề + hành động) | `apps/mfe-learner/src/common/ui.tsx:4` (`ScreenFrame`) | `apps/mfe-path/src/ui.tsx:11` (`Page`); host dùng class `.home` (`Home.tsx:35`, `Explore.tsx:11`) |
| Chọn một trong nhiều (radio nhóm) | `apps/mfe-learner/src/common/ui.tsx:41` (`ChoiceGroup`) | `apps/mfe-knowledge/src/components/honorific/ChoiceGroup.tsx:99` (API khác) |
| Spinner | `apps/mfe-learner/src/common/ui.tsx:23` | `apps/mfe-vision/src/camera/CameraScreen.tsx:218` (inline); `apps/host-shell/src/styles/global.css:284` |
| Nút nghe / đọc chậm 🐢 | `packages/exercises/src/audio/SlowButton.tsx` | `listen.tsx` ở `apps/mfe-conversation`, `apps/mfe-learner`, `apps/mfe-practice`, `apps/mfe-vision` (5 bản) |
| Hộp xin đồng ý | `apps/mfe-conversation/src/chat/VoiceConsent.tsx` | `apps/mfe-vision/src/camera/CameraScreen.tsx:185`; `packages/exercises/src/speak/SpeakExercise.tsx:123` |
| Thanh tiến độ | `apps/mfe-learner/src/onboarding/OnboardingScreen.tsx:101` | `apps/mfe-path/src/session/SessionRunner.tsx:109`; `apps/mfe-practice/src/drills/DrillScreen.tsx:205` |
| Ô số liệu (Tile) | `apps/mfe-learner/src/progress/ProgressScreen.tsx:12` | Danh sách `li` ở `apps/mfe-path/src/PathHome.tsx:58-62` |
| Khối tổng kết cuối bài | `apps/mfe-path/src/LessonScreen.tsx:86-117` | `apps/mfe-conversation/src/summary/SessionSummary.tsx:41-49`; `apps/mfe-conversation/src/roleplay/RoleplayScreen.tsx:81` |
| Khung chờ (skeleton) | `apps/host-shell/src/screens/Home.tsx:17-27` | `packages/exercises/src/ExerciseView.tsx:30-40` |

### 5.3 Màu viết cứng (hex) và lệch token

- `apps/mfe-path/src/App.tsx:5` và `apps/mfe-practice/src/App.tsx:5`: viền `#6366F1` (khung chạy thử riêng lẻ, có vẻ là bản nháp cũ).
- `apps/host-shell/src/screens/PrivacyRoute.tsx:22`: màu cứng `#78350f`, `#fef3c7`.
- `apps/mfe-knowledge/src/components/MobileSimulatorFrame.tsx:40-105` (và nhiều dòng khác): màu cứng, chỉ dùng cho khung xem thử.
- Hai bộ token: `packages/ui/src/theme.css` (nâu gỗ, hổ phách, xanh lá) dùng thật; `packages/ui/src/theme/tokens.ts` (indigo, emerald) không dùng. Nên xóa một bản khi làm lại giao diện.

---

## 6. Ngân sách bundle (`apps/host-shell/.size-limit.cjs`)

Tệp nằm ở `apps/host-shell/.size-limit.cjs`, **không** ở thư mục gốc. Có **36 mục**, đo gzip. Các con số đo gần nhất ghi trong chú thích là ngày 2026-11-15 và 2026-11-18.

| Mục | Ngân sách | Vị trí |
|---|---|---|
| **Tải ban đầu** (app + React, mọi người dùng) | **64.5 kB** | `.size-limit.cjs:8-15` |
| CSS toàn app (Tailwind + tokens) | 7.8 kB | `:18` |
| Xưng hô (lazy) | 15 kB | `:19` |
| Bảng 20 cặp + Radix Dialog | 18 kB | `:20` |
| Luyện thanh điệu (ToneLab) | 9 kB | `:21` |
| Văn hóa | 6.5 kB | `:22` |
| Phương ngữ | 5 kB | `:23` |
| Luyện tập (Drill) | 8 kB | `:24` |
| Ghép câu | 6 kB | `:25` |
| Làm quen (Onboarding) | 5 kB | `:26` |
| Tiến độ (Hồ sơ) | 5 kB | `:27` |
| Tùy chỉnh | 5 kB | `:28` |
| Trò chuyện | 6 kB | `:29` |
| Nhập vai | 6 kB | `:30` |
| Camera | 5 kB | `:31` |
| Lộ trình (trang chủ) | 3.45 kB | `:37` |
| Bài học | 2.5 kB | `:38` |
| Ôn tập | 3 kB | `:39` |
| Kiểm tra vượt unit | 2 kB | `:40` |
| Khám phá | 2.5 kB | `:41` |
| Trình chạy bài dùng chung | 6.5 kB | `:42` |
| Dữ liệu khóa A1 | 8.5 kB | `:43` |
| Gọi thoại | 5 kB | `:46` |
| Hội thoại dùng chung | 10 kB | `:47` |
| Tổng kết | 1.5 kB | `:48` |
| Worker phân tích cao độ | 5 kB | `:49` |
| Dựng bài + dữ liệu tình huống | 5.5 kB | `:51` |
| Truyện ngắn nghe | 2 kB | `:52` |
| Nói lại câu | 3.9 kB | `:53` |
| Phòng tập thanh điệu | 5.8 kB | `:54` |
| Thẻ miền | 1.5 kB | `:55` |
| Phát âm theo miền | 1.5 kB | `:56` |
| Huy hiệu + tổng kết tuần | 3.5 kB | `:58` |
| Đổi từ theo miền | 2 kB | `:59` |
| Bạn học (FriendsPanel) | 5 kB | `:61` |

Điểm cần chú ý:

- **Gói đầu chỉ còn ít chỗ.** Chú thích ở `.size-limit.cjs:12-14` ghi dư khoảng 0.4 kB sau lần đo R10. Chưa đo lại. Chuyển động, âm thanh và logic giao diện mới **không nên** nằm trong `host-shell` đầu bundle. Nên tách thành chunk lazy.
- **Màn Xưng hô** (15 kB) và **Bảng 20 cặp** (18 kB) là hai mục lớn nhất. Nếu chuyển nút Sáng/Tối ra Cài đặt chung thì phải kiểm tra lại mục này.
- Tab **Bạn bè** mới sẽ thêm một route. `FriendsPanel` đã lazy (5 kB), cần thêm ngân sách mục cho route `/ban-be`.
- Lệnh đo: `pnpm --filter @vietlearning/host-shell size` (theo chú thích trong tệp). **Chưa chạy trong lần kiểm kê này.**

---

## 7. Việc chưa kiểm chứng

- Chưa chạy `pnpm build`, `pnpm test`, `pnpm size`.
- Chưa mở app để xem giao diện thật (sáng/tối, tab, emoji trên Android).
- Số lượng emoji là đếm bằng grep, có thể lệch vài dòng.
- Chưa xác minh cách đồng bộ `profile.dialect` và `preferences.dialect`.
- Chưa xác minh `packages/ui/src/theme/tokens.ts` có được dùng ở đâu khác (chỉ tìm trong `apps` và `packages`, không tìm trong `docs`).
