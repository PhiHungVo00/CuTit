# Nhật ký chuyển đổi sang app mobile

> Nhánh: `claude/mobile-optimization-review-6ef57e`
> Mục đích: ghi lại **mọi quyết định, việc đã làm, cài đặt môi trường và việc còn lại** để không ai (kể cả AI agent) phải đoán lại.
> Quy ước: mỗi bước xong thì thêm một dòng vào mục 3 và cập nhật mục 5.
> **Quy tắc làm việc (người dùng đặt 2026-11-15):** xong một giai đoạn thì đọc lại nhật ký; nếu còn việc làm được thì làm tiếp luôn (giai đoạn kế → hàng chờ P1/P2 → P3). Chỉ dừng hỏi khi việc cần người quyết (nội dung ngôn ngữ, bí mật như keystore, máy thật, máy Mac, đồng ý điều khoản…), và gom các câu hỏi đó lại hỏi một lần ở cuối.
> Báo cáo kiểm tra ban đầu (34 phát hiện): `BAO_CAO_AUDIT_MOBILE.md` ở gốc repo.

---

## 1. Mục tiêu

Biến dự án thành **app mobile cài được (Android trước, iOS sau)** có hiệu năng tốt, từ cùng một codebase React.
Lưu ý: ban đầu tôi hiểu nhầm thành "web chạy trên trình duyệt điện thoại"; người dùng đã làm rõ là **app mobile**.

## 2. Các quyết định đã chốt

| Ngày | Quyết định | Lý do | Ghi chú |
|---|---|---|---|
| 2026-11-15 | **Ghép MFE lúc build**, không dùng Module Federation runtime cho bản mobile | Module Federation runtime phải tải `remoteEntry.js` lúc chạy (waterfall trên 4G), dễ trùng React, không chạy offline và không đóng gói store được | Lệch so với TDD (TDD bắt buộc MF). Nguyên tắc 7 được giữ bằng `pnpm lint:boundaries` |
| 2026-11-15 | **Capacitor**, làm **Android trước** | Giữ gần như toàn bộ code React, đúng TDD mục R7. Phần nặng (mic, TTS, camera) đi qua plugin native | Không chọn React Native vì phải viết lại toàn bộ giao diện. iOS cần macOS + Xcode |
| 2026-11-15 | **Capacitor 7** thay vì Capacitor 6 như TDD ghi | Capacitor 6 nhắm targetSdk 34, không đạt yêu cầu targetSdk 35 của Google Play cho app mới. Plugin TTS cần Capacitor 7 trở lên | Cần JDK 21 |
| 2026-11-15 | App id `vn.edu.uit.becutit`, tên app "Bé Cu Tít" | — | Đổi được trong `apps/host-shell/capacitor.config.ts` |

## 3. Việc đã làm (theo thứ tự)

| # | Commit | Nội dung | Kiểm chứng |
|---|---|---|---|
| 1 | — | Đọc toàn bộ repo + TDD, viết báo cáo `BAO_CAO_AUDIT_MOBILE.md` (34 phát hiện) | Build/test gốc qua; tôi chạy thử thấy gateway phản chiếu CORS từ origin lạ |
| 2 | `3f59b7d` | **Vá bảo mật Gateway**: CORS chỉ cho phép danh sách cụ thể, nạp `.env` qua dotenv + kiểm tra Zod, JWT, quota theo người dùng, kiểm tra request/response theo contract, sửa khóa cache TTS, trả 503 khi chưa có nhà cung cấp TTS | 8 test `apps/gateway/test/security.test.mjs` |
| 3 | `32457cb` | **Host-shell ghép lúc build**: route lazy, thanh tab dưới, PWA, font tự host (subset tiếng Việt), safe-area, `100dvh`, dependency-cruiser; các package dùng chung chuyển sang ESM; sửa tràn ngang ở 320px | Trình duyệt 375/320px, tắt server vẫn tải được (offline) |
| 4 | `9c76b6d` | **Capacitor 7 + project Android**: nút Back, status bar, splash, icon; `packages/native` (TTS native/Web Speech); viết lại SpeechService (sửa race condition, bỏ giả vờ đọc 1.2s, báo lỗi thật) | Trình duyệt: phát → dừng → phát lại hoạt động đúng. **Chưa chạy trên Android** |
| 5 | — | Cài **JDK 21** (Microsoft OpenJDK 21.0.13) bằng winget | `C:\Program Files\Microsoft\jdk-21.0.13.21-hotspot` |
| 6 | — | Tải **Android command-line tools** (16111833) vào `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest`. Lưu ý: lần giải nén đầu bằng Bash bị sandbox chặn ghi thật, phải làm lại bằng PowerShell | Có `sdkmanager.bat`, `android.exe` |
| 7 | — | Người dùng đồng ý giấy phép Android SDK. Cài `platform-tools` 37.0.1, `platforms/android-35`, `build-tools/35.0.0` bằng `android sdk install` (sdkmanager đã deprecated). Gradle tự cài thêm build-tools 34 | `android sdk list` |
| 15 | `1fcf326` `edd0aba` `d113f19` (+ commit này) | **Hàng chờ sau GĐ4:** Q15 (tsbuildinfo trong `dist/`), Q12 (plugin `SystemBarsPlugin`), Q16 (plugin `AppSettingsPlugin` + nút mở Cài đặt), Q13 (upload multipart WAV, quota theo giây) | Emulator: thanh hệ thống đổi theo theme lúc chạy; từ chối quyền vĩnh viễn → nút mở đúng Cài đặt, Back quay lại app. Test: gateway 13, audio-dsp 12 |
| 14 | `46f2fb8` | **Giai đoạn 4: đo lường và chặn hồi quy.** (1) `size-limit`: ngân sách gzip cho tải ban đầu (≤ 68 kB), CSS, M3, drawer, M2, Worker; đặt tên chunk ổn định (`app-*`, `ToneLabRoute-*`). (2) Playwright e2e (Chrome có sẵn, 2 cấu hình Pixel 7 + Android 320px): bố cục mobile (không tràn, vùng chạm ≥ 44px), lazy chunk, M3, theme, drawer, M2 với micro giả lập, offline PWA, hiệu năng CPU chậm 4×. (3) Lighthouse mobile (4G chậm + CPU 4×), trung vị 3 lần, ngân sách LCP ≤ 2.5 s, TBT ≤ 200 ms, Perf ≥ 90, A11y ≥ 95. (4) Tối ưu theo số đo: bỏ font độ đậm 600 (6 → 4 file, −35 KB; LCP mở thẳng M3/M2 từ 2.45/2.53 s xuống 2.15/2.22 s); gắn `data-theme` ngay trong `<head>` và chỉ ghi khi khác (tránh tính lại style toàn trang sau khi vẽ). (5) Workflow GitHub Actions `.github/workflows/ci.yml` | Size: tải ban đầu 60.7 kB, CSS 6.0, M3 12.6, drawer 15.5, M2 7.6, Worker 4.2 kB (đều trong ngân sách). E2E 15/15 qua. Lighthouse (trung vị): `/` 100/100, LCP 0.76 s; `/xung-ho` 98/100, LCP 2.15 s, TBT 116 ms; `/phat-am` 98/100, LCP 2.24 s, TBT 76 ms. Mở M3 với CPU chậm 4×: ~1.0 s; phản hồi một lần chạm: 114 ms. **CI chưa chạy thật** (repo chưa có remote); chưa có WebKit/iPhone |
| 13 | `659e91c` | **GĐ3 phần 2, màn hình M2 "Luyện 6 thanh điệu" (`apps/mfe-speech-lab`):** Web Worker (Comlink, tạo lười, PCM chuyển giao không sao chép) chạy `analyzeTone`; `useToneRecorder` (state machine idle → recording → analyzing → done/error, tự dừng 2.5 s, chặn bản ghi < 0.3 s); biểu đồ Canvas contour mẫu vs người học (màu theo token, vẽ lại khi đổi theme, sắc nét theo DPR); 6 nút thanh ma/mà/má/mả/mã/mạ, nghe mẫu qua TTS thiết bị, điểm + "nghe giống thanh nào"; tự cuộn tới kết quả. Route `/phat-am` bật; Android thêm `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS`. Lỗi tự phát hiện và sửa: (a) vừa khen "Rất tốt" vừa nói "giống thanh khác" => chỉ khen khi thanh gần nhất đúng là mục tiêu; (b) kết quả nằm dưới màn hình => tự cuộn | Trình duyệt (micro giả lập bằng OscillatorNode, chạy thật AudioWorklet → resample → Worker): giọng đi lên 150→280 Hz chấm **86/100, đúng thanh sắc**, phân tích 11 ms; giọng đi xuống nhận đúng là dốc như thanh nặng. Emulator Android 15: hộp thoại xin quyền micro hiện đúng; sau khi cho phép, thu âm + Worker chạy trong WebView, micro emulator im lặng => báo đúng "Chưa nghe rõ giọng"; tự cuộn hoạt động. Test: 7 test M2; toàn monorepo 67 test qua. **Chưa thử với giọng người thật** (cần máy thật) |
| 12 | `f25625a` | **GĐ3 phần 1, lõi DSP (`packages/audio-dsp`):** A1 YIN theo khung 40ms/10ms + McLeod (Strategy), giới hạn 70–500 Hz, nội suy parabol, cổng RMS; semitone chuẩn hóa theo trung vị giọng người nói; A2 DTW có dải Sakoe-Chiba + Pearson; `analyzeTone` chấm điểm và đoán thanh gần nhất; hạ tần số 48k→16k có lọc chống chồng phổ; `WebAudioDriver` thu âm qua getUserMedia + AudioWorklet (blob URL). Dữ liệu 6 thanh mẫu `packages/content/src/data/tones.json` | 11 test DSP: F0 đúng ±1%, giọng nam/nữ cùng điểm (lệch ≤3), phân loại đúng cả 6 thanh ở 2 giọng, lặng ra `no-voice`, resample giữ F0. Hiệu năng 5 s âm thanh: YIN 44 ms, McLeod 100 ms trên máy dev (TDD ≤ 1 s). **Chưa làm:** Worker, màn hình M2, quyền micro Android |
| 11 | `d9c78fd` | **Xử lý hàng chờ.** Sửa Q2, Q4 (sanitizer), Q6, Q7, Q8, Q9, Q10; Q3 kết luận không cần sửa; Q1 và Q11 cần người phụ trách nội dung quyết; thêm Q12, tách Q4b | 49 test qua (content 15, gateway 9, M3 17, host 8). Trình duyệt: giao diện sáng áp dụng cả thanh tab, giữ sau khi tải lại. Emulator: giữ sau khi tắt hẳn app |
| 10 | `0002b77` | **Giai đoạn 2: refactor M3.** (1) Design tokens `packages/ui/src/theme.css` cho Tailwind v4, màu theo `data-theme` => đổi giao diện không remount, bỏ `key={theme}`, giữ nguyên lựa chọn; (2) tách `HonorificMatrixScreen` (1.233 dòng inline style) thành `useHonorificPlayground` (logic A6) + `ControlPanel` + `SentencePanel` + `ChoiceGroup` (radiogroup, phím mũi tên); bỏ thanh trượt trùng với nút bậc; bỏ chữ kỹ thuật ("Kiến trúc Micro Frontend", "Thuật toán A6") khỏi giao diện người học; (3) drawer dùng Radix Dialog: focus trap, Esc, khóa cuộn, trả focus về nút mở, nút Back Android đóng drawer; tải lười (chunk riêng 15.4KB, tải trước khi chạm); tìm kiếm không dấu dùng chỉ mục tính sẵn; (4) **một nguồn dữ liệu**: 20 cặp + phương ngữ chuyển về `packages/content/src/data/*.json`, TS chỉ import; sửa dữ liệu A7 bị đảo (thìa/muỗng, roi/mận); (5) SpeechService báo kết thúc cho lượt bị thay thế (trước đó drawer phát âm làm nút ở câu mẫu kẹt "Đang đọc"); (6) mọi app sang `"type": "module"` (giải quyết Q5; plugin Tailwind là ESM-only) | Trình duyệt 375px: 25/25 nút ≥ 44px, không chữ < 12px, không tràn ngang; đổi giao diện giữ lựa chọn; drawer: chunk chỉ tải khi mở, focus vào trong, ô tìm 16px, "thay" ra "Thầy", Esc đóng + trả focus, "Áp dụng" đưa cặp lên. Emulator: Back khi drawer mở chỉ đóng drawer. Chunk M3 13.5KB gzip (bản gốc 14.8KB). Test: content 15/15 (+3 test dữ liệu), gateway 9/9 |
| 9 | `4c80dca` | **Cài emulator + chạy thử trên Android 15.** Cài `emulator` 37.2.13 + `system-images/android-35/google_apis_playstore/x86_64` (có Google TTS). Tạo AVD `BeCuTit_Pixel_API35` (Pixel 7), tăng tốc WHPX. Chạy thử phát hiện và sửa **3 lỗi thật**: (a) status bar/navigation bar màu trắng, chữ giờ trắng không đọc được (Android 15 tràn viền) => đặt `windowBackground`/`statusBarColor` tối trong `styles.xml`; (b) **TTS native treo** với lỗi `"TextToSpeech.then()" is not implemented on android`: trả proxy plugin Capacitor từ hàm async làm Promise dò `.then` => bọc proxy trong object; (c) Gateway không khởi động với `.env` mẫu vì `JWT_SECRET=` rỗng bị coi là chuỗi => coi dòng trống là chưa đặt (+1 test). Script build APK giờ build trước các package phụ thuộc (trước đó sửa `packages/native` không vào APK) | Emulator: mở app 3.6 giây (cold start, bản debug); tab Xưng hô mở được; nút Back: M3 → Trang chủ → thoát app; phát âm: Google TTS đọc ~5 giây, nút trở về trạng thái nghỉ, không lỗi. Gateway 9/9 test |
| 8 | `e319a77` | **Build APK debug thành công.** Gặp 3 lỗi: (a) đường dẫn có dấu tiếng Việt làm Gradle hỏng => map ổ ảo bằng `subst`; (b) ổ ảo phải trỏ vào **gốc repo** vì `capacitor.settings.gradle` dùng `../../../node_modules`; (c) Gradle daemon giữ ống dẫn output làm script treo => dùng `--no-daemon`. Gói lại thành `apps/host-shell/scripts/build-apk.ps1` (`android:apk:win`). Thêm `.gitattributes` cho `gradlew` | `aapt2 dump badging`: package `vn.edu.uit.becutit`, targetSdk 35, minSdk 23, nhãn "Bé Cu Tít", có 40 file web trong `assets/public`. APK 4.1MB |

## 4. Môi trường máy dev (Windows)

| Thành phần | Trạng thái | Đường dẫn / ghi chú |
|---|---|---|
| Node | v24.14.0 | — |
| pnpm | 12.9.1 | — |
| JDK 17 | Có sẵn | Không đủ cho Capacitor 7 |
| JDK 21 | Đã cài | `C:\Program Files\Microsoft\jdk-21.0.13.21-hotspot`. Gradle dùng qua `JAVA_HOME` |
| Android Studio | Có sẵn | `C:\Program Files\Android\Android Studio` (thư mục `jbr` thiếu `java.exe`) |
| Android SDK | Đã cài | `C:\Users\ADMIN\AppData\Local\Android\Sdk`: cmdline-tools 23, platform-tools 37.0.1, platforms android-35, build-tools 35.0.0 + 34.0.0. Quản lý gói bằng `cmdline-tools\latest\bin\android.exe sdk ...` |
| Emulator | Đã cài | AVD `BeCuTit_Pixel_API35` (Pixel 7, Android 15, Google Play image). Mở: `%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe -avd BeCuTit_Pixel_API35`. App trong emulator gọi gateway qua `http://10.0.2.2:4000` (đặt trong `apps/host-shell/.env.local`, không commit) |

## 5. Việc còn lại (cập nhật liên tục)

**Đã xong:** GĐ0 bảo mật gateway · GĐ1 ghép MFE lúc build + PWA · Capacitor 7 + APK Android · GĐ2 refactor M3 · GĐ3 DSP A1/A2 + màn hình M2 · GĐ4 size-limit, e2e, Lighthouse, CI · hàng chờ Q2–Q10, Q12, Q13, Q15, Q16.

**Còn lại — tất cả cần người quyết hoặc cần phần cứng/tài khoản:**

| Việc | Vì sao cần người |
|---|---|
| Chạy thử trên điện thoại Android thật (TTS tiếng Việt, M2 với giọng thật, hiệu năng máy tầm trung/thấp); hiệu chỉnh cách chấm điểm A2 (60% DTW / 40% Pearson) theo kết quả | Cần thiết bị và giọng người thật |
| Luồng dự phòng TTS qua gateway trên thiết bị (đã có test đơn vị cho 503/mất mạng) | Cần máy không có giọng tiếng Việt |
| Đẩy repo lên GitHub để CI chạy thật | Cần tạo remote / quyền repo |
| Bản release: keystore ký app, build AAB lên Google Play | Keystore là bí mật, phải do người giữ (ngoài repo) |
| iOS (build + kiểm thử Safari/WebKit) | Cần máy Mac hoặc dịch vụ build cloud; WebKit cho Playwright cần tải thêm ~70 MB |
| Q1, Q11, Q14 (nội dung ngôn ngữ) | Cần người phụ trách nội dung (M2) / người bản ngữ |
| Q4b (các stub GoF chưa có hành vi) | Cần quyết: giữ để minh họa đủ 23 mẫu GoF cho báo cáo môn học, hay xóa |
| Các màn hình còn lại (M1, M4, M5/M8, M9–M12) | Thuộc phần việc của các thành viên khác theo TDD; cần quyết có làm hay không |
| Commit `BAO_CAO_AUDIT_MOBILE.md`; khối `agentGuidance` turbo tự chèn vào `AGENTS.md` | Quyết định của nhóm |

## 5b. Hàng chờ

> Quy ước: thấy vấn đề ngoài phạm vi việc đang làm thì ghi vào đây thay vì sửa ngay. P1 = ảnh hưởng người dùng/bảo mật · P2 = chất lượng/hiệu năng · P3 = dọn dẹp

**Còn mở (đều cần người quyết):**

| # | Ưu tiên | Vấn đề | Vị trí |
|---|---|---|---|
| Q1 | P2 · cần người | Dữ liệu phương ngữ cần người bản ngữ duyệt (ví dụ "ngã/té" miền Trung chưa chắc); cột `content_items.reviewedBy` đã có sẵn | `packages/content/src/data/dialects.json` |
| Q11 | P2 · cần người | A6: trong quan hệ gia tộc, preset "Nhỏ hơn" (28 và 16 tuổi, lệch đúng 12) chạm ngưỡng `ageDiff <= -12` nên ra "chú/cháu", trong khi mô tả nút là "em út, hậu bối". Đổi preset (ví dụ 26/16) hay đổi ngưỡng? | `useHonorificPlayground.ts` (`agesFor`), `HonorificInterpreter.ts` |
| Q14 | P2 · cần người | Contour 6 thanh mẫu là xấp xỉ theo mô tả ngữ âm học, cần đối chiếu bản ghi người bản ngữ | `packages/content/src/data/tones.json` |
| Q4b | P3 · cần quyết | `ShellMediator`, `BlockTree` (Composite), `TurnStateMachine` (chỉ `console.log`), các Provider giả trong `gateway/src/providers/factory.ts`: giữ làm minh họa GoF hay xóa? Provider thật cần API key | `apps/host-shell/src/...`, `apps/gateway/src/providers` |

**Đã xử lý:**

| # | Kết quả | Ghi chú |
|---|---|---|
| Q2 | ✅ sửa | Áp dụng cặp h20 (`relation: 'civic'`) thì không nút quan hệ nào được chọn; sửa bằng `toUiRelation` + test |
| Q3 | ✅ không sửa | `MobileSimulatorFrame` không có trong bundle app; giữ cho trang demo desktop |
| Q4 | ✅ sửa | `SanitizerVisitor` làm thật + 8 test; `@vietlearning/contracts/api` để client không kéo Drizzle |
| Q5 | ✅ sửa | `"type": "module"` cho mọi app |
| Q6 | ✅ sửa | Theme ở mức Shell (`ThemeProvider`), thanh tab đổi theo |
| Q7 | ✅ sửa | Lưu theme, gắn trước lần vẽ đầu; giữ sau khi tắt app |
| Q8 | ✅ sửa | Vitest + Testing Library cho UI |
| Q9 | ✅ sửa | Giảm chuyển động tắt hẳn animation/transition |
| Q10 | ✅ sửa | Nhãn nút quan hệ căn trái |
| Q12 | ✅ sửa | Plugin native `SystemBarsPlugin`: dải status/navigation bar đổi theo theme (thử trên emulator) |
| Q13 | ✅ sửa | Upload âm thanh multipart (WAV PCM16) thay base64; quota STT theo số giây thật; 4 test |
| Q15 | ✅ sửa | `tsBuildInfoFile` nằm trong `dist/` nên không còn bản build cũ (nguyên nhân: tsbuildinfo ở gốc package + cache turbo dùng chung giữa các worktree) |
| Q16 | ✅ sửa | Plugin native `AppSettingsPlugin` + nút "Mở Cài đặt của app" khi bị từ chối quyền micro vĩnh viễn (thử trên emulator) |

## 6. Lệnh hay dùng

```bash
pnpm build                                           # build toàn monorepo
pnpm test                                            # test (content + gateway)
pnpm lint:boundaries                                 # kiểm tra không import chéo remote
pnpm --filter @vietlearning/host-shell cap:sync      # build web + chép vào project Android
pnpm --filter @vietlearning/host-shell android:apk:win  # build APK debug trên Windows (tự xử lý đường dẫn tiếng Việt)
pnpm --filter @vietlearning/host-shell android:apk   # build APK debug trên macOS/Linux
pnpm --filter @vietlearning/host-shell android:open  # mở Android Studio
```
