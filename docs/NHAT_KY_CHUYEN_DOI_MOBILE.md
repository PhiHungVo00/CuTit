# Nhật ký chuyển đổi sang app mobile

> Nhánh: `claude/mobile-optimization-review-6ef57e`
> Mục đích: ghi lại **mọi quyết định, việc đã làm, cài đặt môi trường và việc còn lại** để không ai (kể cả AI agent) phải đoán lại.
> Quy ước: mỗi bước xong thì thêm một dòng vào mục 3 và cập nhật mục 5.
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
| 12 | (commit này) | **GĐ3 phần 1, lõi DSP (`packages/audio-dsp`):** A1 YIN theo khung 40ms/10ms + McLeod (Strategy), giới hạn 70–500 Hz, nội suy parabol, cổng RMS; semitone chuẩn hóa theo trung vị giọng người nói; A2 DTW có dải Sakoe-Chiba + Pearson; `analyzeTone` chấm điểm và đoán thanh gần nhất; hạ tần số 48k→16k có lọc chống chồng phổ; `WebAudioDriver` thu âm qua getUserMedia + AudioWorklet (blob URL). Dữ liệu 6 thanh mẫu `packages/content/src/data/tones.json` | 11 test DSP: F0 đúng ±1%, giọng nam/nữ cùng điểm (lệch ≤3), phân loại đúng cả 6 thanh ở 2 giọng, lặng ra `no-voice`, resample giữ F0. Hiệu năng 5 s âm thanh: YIN 44 ms, McLeod 100 ms trên máy dev (TDD ≤ 1 s). **Chưa làm:** Worker, màn hình M2, quyền micro Android |
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

- [x] Chấp nhận giấy phép Android SDK, cài platform 35 + build-tools 35
- [x] Build APK debug (Windows: `pnpm --filter @vietlearning/host-shell android:apk:win`)
- [x] Cài emulator, chạy thử: điều hướng, nút Back, TTS native, thanh hệ thống
- [ ] Chạy thử trên điện thoại thật (TTS tiếng Việt và hiệu năng trên máy tầm trung/thấp)
- [ ] Chưa thử: luồng dự phòng TTS qua gateway trong app (emulator có sẵn giọng Việt nên không đi tới nhánh đó)
- [x] Nút Back khi drawer đang mở: đã sửa ở GĐ2, đóng drawer thay vì rời màn hình (đã thử trên emulator)
- [ ] Bản release: tạo keystore ký app (giữ keystore NGOÀI repo), build AAB để lên Google Play
- [x] Giai đoạn 2: refactor M3 (Tailwind/CSS variables, nút ≥ 44px, drawer dùng Radix, một nguồn dữ liệu 20 cặp, sửa dữ liệu A7)
- [x] Xử lý hàng chờ mục 5b (Q1–Q10). Còn mở: Q1, Q11 (cần người quyết nội dung), Q12, Q4b
- [x] Giai đoạn 3 phần 1: lõi DSP (YIN/McLeod theo khung, semitone tương đối, DTW + Pearson, resample, driver thu âm), 11 test
- [ ] Giai đoạn 3 phần 2: Web Worker (Comlink) chạy `analyzeTone` trong `apps/mfe-speech-lab`; màn hình M2 (chọn thanh ma/mà/má/mả/mã/mạ, nghe mẫu, ghi âm, biểu đồ Canvas contour người học vs mẫu, điểm + thanh gần nhất); route `/phat-am` `ready: true`; thêm `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS` vào AndroidManifest; thử trình duyệt (giả lập micro bằng OscillatorNode) và emulator (luồng xin quyền)
- [ ] Hàng chờ mới: Q13 gửi audio lên gateway dạng binary/multipart thay vì base64 (`/v1/speech/assess`); Q14 contour 6 thanh mẫu là xấp xỉ theo mô tả ngữ âm, cần đối chiếu bản ghi người bản ngữ; Q15 turbo cache đôi khi khôi phục `dist/` cũ của `packages/content`, `packages/audio-dsp` (phải xóa `dist` + `tsbuildinfo` rồi build lại)
- [ ] Giai đoạn 4: Lighthouse/size-limit, Playwright, kiểm thử máy thật
- [ ] iOS: cần máy Mac hoặc dịch vụ build cloud (Codemagic)
- [x] Thêm `.gitattributes` (`gradlew text eol=lf`)
- [ ] Quyết định có commit `BAO_CAO_AUDIT_MOBILE.md` không; tắt khối `agentGuidance` của turbo trong `AGENTS.md` nếu không muốn

## 5b. Hàng chờ (phát hiện trong lúc làm, chưa sửa)

> Quy ước: thấy vấn đề ngoài phạm vi việc đang làm thì ghi vào đây thay vì sửa ngay. Làm xong việc chính sẽ quay lại xử lý theo mức ưu tiên.
> P1 = ảnh hưởng người dùng/bảo mật · P2 = chất lượng/hiệu năng · P3 = dọn dẹp

| # | Ưu tiên | Vấn đề | Vị trí | Ghi nhận lúc |
|---|---|---|---|---|
**Còn mở:**

| # | Ưu tiên | Vấn đề | Vị trí | Ghi nhận lúc |
|---|---|---|---|---|
| Q1 | P2 · cần người | Dữ liệu phương ngữ cần người bản ngữ duyệt (ví dụ "ngã/té" miền Trung chưa chắc). Không tự quyết được, giao cho M2 (chủ `packages/content`); cột `content_items.reviewedBy` đã có sẵn để ghi người duyệt | `packages/content/src/data/dialects.json` | GĐ2 |
| Q11 | P2 · cần người | A6: trong quan hệ gia tộc, preset "Nhỏ hơn" (28 và 16 tuổi, lệch đúng 12) chạm ngưỡng `ageDiff <= -12` nên ra "chú/cháu", trong khi mô tả nút là "em út, hậu bối". M2 cần quyết: đổi preset (ví dụ 26/16) hay đổi ngưỡng | `useHonorificPlayground.ts` (`agesFor`), `HonorificInterpreter.ts` | phát hiện khi viết test |
| Q12 | P3 | Giao diện sáng: dải status bar/navigation bar Android vẫn tối (màu nền native của cửa sổ khi vẽ tràn viền). Cần đổi màu phía native theo theme | `apps/host-shell/android`, `native/bootstrap.ts` | thử trên emulator |
| Q4b | P3 | Các stub GoF còn lại (`ShellMediator`, `BlockTree`, `PitchStrategy`, `AudioCaptureBridge`) chưa có hành vi thật; không phải lỗ bảo mật. Phần âm thanh làm ở GĐ3 | `apps/host-shell/src/...`, `packages/audio-dsp` | tách từ Q4 |

**Đã xử lý:**

| # | Kết quả | Ghi chú |
|---|---|---|
| Q2 | ✅ sửa | Thực chất là lỗi: áp dụng cặp h20 (`relation: 'civic'`) thì không nút quan hệ nào được chọn. Sửa bằng `toUiRelation` (civic→work, stranger→social ở giao diện; thuật toán vẫn dùng relation gốc) + test |
| Q3 | ✅ không sửa | `MobileSimulatorFrame` không có trong bundle app (0 lần xuất hiện, bị tree-shake); là phần bạn vừa làm cho trang demo desktop nên giữ lại |
| Q4 | ✅ sửa | `SanitizerVisitor` giờ làm thật: kiểm tra contract từng block, bỏ key nguy hiểm, chặn URL `javascript:`/`data:`, giới hạn độ sâu/độ dài/4 block mỗi lượt; 8 test (test bắt được 1 lỗi lệch-một ở giới hạn độ sâu). Thêm `@vietlearning/contracts/api` để client không kéo Drizzle |
| Q5 | ✅ sửa | `"type": "module"` cho mọi app (GĐ2, vì chặn Tailwind) |
| Q6 | ✅ sửa | Theme đưa lên Shell (`ThemeProvider`, `data-theme` trên `<html>`); thanh tab dùng token chung; M3 nhận theme dạng controlled |
| Q7 | ✅ sửa | Lưu vào localStorage (`becutit.theme`); script trong `<head>` gắn theme trước lần vẽ đầu (không chớp tối). Đã thử: giữ sau khi tải lại trang và sau khi tắt hẳn app Android |
| Q8 | ✅ sửa | Vitest + Testing Library: M3 17 test (hook A6, ChoiceGroup, SpeechService, drawer + nút Back), host 8 test. Tổng monorepo 49 test |
| Q9 | ✅ sửa | Rule giảm chuyển động giờ tắt hẳn `animation`/`transition` |
| Q10 | ✅ sửa | Nhãn nút quan hệ căn trái (`ChoiceGroup align="start"`) |

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
