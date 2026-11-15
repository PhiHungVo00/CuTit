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
| 9 | (commit này) | **Cài emulator + chạy thử trên Android 15.** Cài `emulator` 37.2.13 + `system-images/android-35/google_apis_playstore/x86_64` (có Google TTS). Tạo AVD `BeCuTit_Pixel_API35` (Pixel 7), tăng tốc WHPX. Chạy thử phát hiện và sửa **3 lỗi thật**: (a) status bar/navigation bar màu trắng, chữ giờ trắng không đọc được (Android 15 tràn viền) => đặt `windowBackground`/`statusBarColor` tối trong `styles.xml`; (b) **TTS native treo** với lỗi `"TextToSpeech.then()" is not implemented on android`: trả proxy plugin Capacitor từ hàm async làm Promise dò `.then` => bọc proxy trong object; (c) Gateway không khởi động với `.env` mẫu vì `JWT_SECRET=` rỗng bị coi là chuỗi => coi dòng trống là chưa đặt (+1 test). Script build APK giờ build trước các package phụ thuộc (trước đó sửa `packages/native` không vào APK) | Emulator: mở app 3.6 giây (cold start, bản debug); tab Xưng hô mở được; nút Back: M3 → Trang chủ → thoát app; phát âm: Google TTS đọc ~5 giây, nút trở về trạng thái nghỉ, không lỗi. Gateway 9/9 test |
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
- [ ] Chưa thử: luồng dự phòng TTS qua gateway trong app (emulator có sẵn giọng Việt nên không đi tới nhánh đó), drawer "Bảng 20 Cặp" + nút Back khi drawer đang mở (hiện Back sẽ rời màn hình thay vì đóng drawer)
- [ ] Bản release: tạo keystore ký app (giữ keystore NGOÀI repo), build AAB để lên Google Play
- [ ] Chạy thử trên emulator hoặc máy thật: nút Back, TTS tiếng Việt, edge-to-edge Android 15, gọi gateway qua `10.0.2.2`
- [ ] Giai đoạn 2: refactor M3 (Tailwind/CSS variables, nút ≥ 44px, drawer dùng Radix, một nguồn dữ liệu 20 cặp, sửa dữ liệu A7 thìa/muỗng)
- [ ] Giai đoạn 3: thu âm AudioWorklet/plugin native, YIN theo frame trong Worker, DTW trên semitone + Pearson
- [ ] Giai đoạn 4: Lighthouse/size-limit, Playwright, kiểm thử máy thật
- [ ] iOS: cần máy Mac hoặc dịch vụ build cloud (Codemagic)
- [x] Thêm `.gitattributes` (`gradlew text eol=lf`)
- [ ] Quyết định có commit `BAO_CAO_AUDIT_MOBILE.md` không; tắt khối `agentGuidance` của turbo trong `AGENTS.md` nếu không muốn

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
