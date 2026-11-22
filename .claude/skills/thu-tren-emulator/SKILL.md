---
name: thu-tren-emulator
description: Build APK debug của Bé Cu Tít, chạy trên AVD BeCuTit_Pixel_API35 với Gateway trên máy, điều khiển WebView qua Chrome DevTools để thử tài khoản/đồng bộ/màn hình. Dùng sau khi đổi code native, khởi động app, tài khoản, đồng bộ, camera/micro — e2e web KHÔNG bắt được lỗi native.
---

# Thử trên emulator

Lỗi đã gặp: proxy plugin Capacitor bị trả qua Promise ⇒ `.then` bị dò ⇒ treo. Trên Android, tài khoản và đồng bộ đã không chạy từ GĐ0 mà e2e web không phát hiện (nhật ký dòng 45). Vì vậy phải thử thật.

Máy dev: JDK 21 ở `C:\Program Files\Microsoft\jdk-21*`, SDK ở `%LOCALAPPDATA%\Android\Sdk`. Đường dẫn repo có dấu tiếng Việt, nên phải build bằng script dùng ổ ảo `subst`.

Chạy bằng PowerShell, **ghi PID mọi tiến trình mình mở** và chỉ dừng đúng các PID đó:
1. **Emulator:** `Start-Process "$sdk\emulator\emulator.exe" -ArgumentList '-avd','BeCuTit_Pixel_API35','-no-snapshot-save','-no-audio' -PassThru`, rồi `adb wait-for-device` và chờ `getprop sys.boot_completed` = 1.
2. **Gateway:** `node apps/gateway/dist/index.js` với `PORT=4020 HOST=0.0.0.0 PGLITE_DIR=memory:// CORS_ORIGIN=https://localhost,http://localhost,capacitor://localhost GEMINI_API_KEY= BECUTIT_ENV_FILE=e2e-khong-co-tep.env NODE_ENV=development`. Build gateway trước nếu cần.
3. **APK:** `$env:VITE_GATEWAY_URL='http://10.0.2.2:4020'`, rồi trong `apps/host-shell` chạy `pwsh -File scripts/build-apk.ps1 -Drive R:` (đổi ổ nếu phiên khác đang dùng R:). Mặc định build flavor **play** (`assemblePlayDebug`) ⇒ `android/app/build/outputs/apk/play/debug/app-play-debug.apk`; thêm `-Flavor apk` cho bản cài tay (`assembleApkDebug` ⇒ `.../apk/apk/debug/app-apk-debug.apk`, có quyền cài APK). Cần kiểm quyền/versionCode: `node scripts/check-apk.mjs <apk> --flavor play|apk`.
4. **Cài và mở:** chép APK sang thư mục scratchpad (đường dẫn không dấu), `adb install -r`, `adb shell pm clear vn.edu.uit.becutit`, `adb shell am start -n vn.edu.uit.becutit/.MainActivity`.
5. **Điều khiển WebView:** `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>` (pid lấy từ `adb shell pidof vn.edu.uit.becutit`). Lấy `webSocketDebuggerUrl` từ `http://127.0.0.1:9333/json`, rồi gửi `Runtime.evaluate` (`awaitPromise`, `returnByValue`) để điều hướng (`history.pushState` + `popstate`), bấm nút, đọc `innerText`.
6. **Kiểm tối thiểu:**
   - trang chủ hiện;
   - Tùy chỉnh → "Create account" ⇒ có `[data-testid=recovery-code]`;
   - log Gateway có `POST /v1/auth/guest` và `/v1/sync`, 0 lỗi 4xx/5xx;
   - thêm màn hình bị ảnh hưởng.
   - Ảnh chụp màn hình: `adb exec-out screencap -p > file.png`.
7. **Dọn:** `adb forward --remove tcp:9333`, `adb emu kill`, `Stop-Process` đúng PID Gateway và emulator.
