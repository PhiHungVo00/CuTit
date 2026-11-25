<#
  Build APK debug trên Windows.

  Vì sao cần script này: Gradle/Java trên Windows lỗi khi đường dẫn dự án có ký tự tiếng Việt
  (ví dụ "Kì cuối", "đồ án"): "Could not find or load main class GradleWrapperMain".
  Script map tạm gốc monorepo sang một ổ ảo ASCII (subst) rồi build ở đó.
  Ổ ảo phải trỏ vào GỐC repo, vì capacitor.settings.gradle tham chiếu ../../../node_modules.

  Dùng:  pnpm --filter @vietlearning/host-shell android:apk:win       (debug)
         pnpm --filter @vietlearning/host-shell android:release:win   (release, CHƯA ký)
  Tùy chọn: -Drive X:  -JavaHome "C:\...\jdk-21"  -SkipWeb  -Release  -Flavor play|apk (mặc định play; dự án 8: hai kênh phân phối)
  Ghi manifest cho trang giới thiệu (chỉ bản -Release ĐÃ KÝ; debug và bản chưa ký không ghi):
    -ReleaseManifest apps/landing/apk-release.json -ApkUrl https://.../becutit.apk [-MinAndroid 6.0]

  Release: NODE_ENV=production => capacitor.config tắt debug WebView và mixed content;
  bắt buộc VITE_GATEWAY_URL là https (http bị chặn khi tắt mixed content). Ký app: xem nhật ký mục 5.
#>
param(
  [string]$Drive = 'B:',
  [string]$JavaHome = '',
  [switch]$SkipWeb,
  [switch]$Release,
  [string]$ReleaseManifest = '',
  [string]$ApkUrl = '',
  [string]$MinAndroid = '6.0',
  [ValidateSet('play','apk')][string]$Flavor = 'play'
)
$ErrorActionPreference = 'Stop'

$hostShell = Split-Path -Parent $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $hostShell '..\..')).Path

if ($ReleaseManifest -and -not $Release) {
  Write-Warning '-ReleaseManifest chỉ áp dụng cho bản -Release; bản debug KHÔNG ghi apk-release.json.'
  $ReleaseManifest = ''
}
if ($ReleaseManifest -and -not $ApkUrl) { throw '-ReleaseManifest cần thêm -ApkUrl (địa chỉ tải APK, https://... hoặc /...).' }

if ($Release) {
  $env:NODE_ENV = 'production'
  # Lấy VITE_GATEWAY_URL theo đúng thứ tự ưu tiên của Vite (biến môi trường > .env.production.local > ...)
  $gateway = $env:VITE_GATEWAY_URL
  if (-not $gateway) {
    foreach ($f in '.env.production.local', '.env.local', '.env.production', '.env') {
      $p = Join-Path $hostShell $f
      if (Test-Path $p) {
        $line = Select-String -Path $p -Pattern '^\s*VITE_GATEWAY_URL\s*=\s*(.+)$' | Select-Object -First 1
        if ($line) { $gateway = $line.Matches[0].Groups[1].Value.Trim(); break }
      }
    }
  }
  if (-not $gateway -or -not $gateway.StartsWith('https://')) {
    throw "Bản release cần VITE_GATEWAY_URL dạng https (hiện: '$gateway'). Đặt trong apps/host-shell/.env.production.local"
  }
  Write-Host "Release: gateway = $gateway"
} else {
  $env:NODE_ENV = 'development'
}

# JDK 21 (Capacitor 7 bắt buộc)
if (-not $JavaHome) {
  $JavaHome = Get-ChildItem 'C:\Program Files\Microsoft' -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $JavaHome -or -not (Test-Path "$JavaHome\bin\java.exe")) {
  throw 'Không tìm thấy JDK 21. Cài: winget install Microsoft.OpenJDK.21, hoặc truyền -JavaHome.'
}
$env:JAVA_HOME = $JavaHome
$env:Path = "$JavaHome\bin;$env:Path"
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk" }
if (-not (Test-Path "$env:ANDROID_HOME\platforms")) {
  throw "Chưa có Android SDK tại $env:ANDROID_HOME (xem docs/NHAT_KY_CHUYEN_DOI_MOBILE.md mục 4)."
}

# Dự án 8: APK release tự cập nhật chỉ tải từ host trong danh sách (cùng APK_DOWNLOAD_HOSTS của Gateway); rỗng ⇒ native từ chối mọi URL
if ($Release -and $Flavor -eq 'apk' -and -not (($env:APK_DOWNLOAD_HOSTS -split ',' | ForEach-Object { $_.Trim() }) -join '')) {
  throw 'Build -Release -Flavor apk cần APK_DOWNLOAD_HOSTS (host tải APK, cách nhau dấu phẩy, giống Gateway). Rỗng thì app không tự cập nhật được.'
}

if (-not $SkipWeb) {
  # Build trước các package dùng chung (native, content, shared...) vì host đọc dist/ của chúng
  Push-Location $repoRoot
  try {
    # Chỉ packages/* (có dist/); các MFE được host đọc thẳng từ src/ nên không cần build trang demo của chúng
    pnpm turbo run build --filter='./packages/*'
    if ($LASTEXITCODE) { throw 'build package phụ thuộc lỗi' }
  } finally { Pop-Location }

  Push-Location $hostShell
  try {
    npx vite build
    if ($LASTEXITCODE) { throw 'vite build lỗi' }
    npx cap sync android
    if ($LASTEXITCODE) { throw 'cap sync lỗi' }
  } finally { Pop-Location }

  # Kiểm tra cấu hình thật sự được chép vào app (đề phòng NODE_ENV không tới được capacitor.config.ts)
  $capJson = Get-Content (Join-Path $hostShell 'android\app\src\main\assets\capacitor.config.json') -Raw | ConvertFrom-Json
  $debugOn = [bool]$capJson.android.webContentsDebuggingEnabled
  $mixedOn = [bool]$capJson.android.allowMixedContent
  Write-Host "capacitor.config.json: webContentsDebuggingEnabled=$debugOn, allowMixedContent=$mixedOn"
  if ($Release -and ($debugOn -or $mixedOn)) { throw 'Bản release vẫn bật debug/mixed content — dừng lại' }
  $hosts = @($capJson.plugins.ApkUpdater.allowedHosts)
  Write-Host "capacitor.config.json: ApkUpdater.allowedHosts=[$($hosts -join ', ')]"
  if ($Release -and $Flavor -eq 'apk' -and $hosts.Count -eq 0) { throw 'allowedHosts rỗng trong capacitor.config.json — bản release sẽ từ chối mọi URL tải' }
}

$needsSubst = $repoRoot -match '[^\x00-\x7F]'
$buildRoot = $repoRoot
if ($needsSubst) {
  subst $Drive /d 2>$null | Out-Null
  subst $Drive $repoRoot
  $buildRoot = "$Drive\"
  Write-Host "Đường dẫn có ký tự không phải ASCII => build qua ổ ảo $Drive"
}

try {
  Push-Location (Join-Path $buildRoot 'apps\host-shell\android')
  # --no-daemon: daemon sống tiếp sẽ giữ ổ ảo và ống dẫn output, làm script treo
  $flavorCap = (Get-Culture).TextInfo.ToTitleCase($Flavor)
  $task = if ($Release) { "assemble${flavorCap}Release" } else { "assemble${flavorCap}Debug" }
  .\gradlew.bat $task --no-daemon --console=plain
  if ($LASTEXITCODE) { throw 'Gradle build lỗi' }
  $apk = if ($Release) {
    # Chưa có cấu hình ký => Gradle xuất bản chưa ký; ký bằng keystore của nhóm trước khi phát hành
    Join-Path $hostShell "android\app\build\outputs\apk\$Flavor\release\app-$Flavor-release-unsigned.apk"
  } else {
    Join-Path $hostShell "android\app\build\outputs\apk\$Flavor\debug\app-$Flavor-debug.apk"
  }
  if ($Release) {
    # APK release KHÔNG được debuggable: native chỉ chặn host/https khi không debuggable
    $aapt = Get-ChildItem "$env:ANDROID_HOMEuild-tools" -Recurse -Filter aapt.exe -ErrorAction SilentlyContinue | Sort-Object FullName | Select-Object -Last 1
    if ($aapt) {
      if (& $aapt.FullName dump badging $apk | Select-String 'application-debuggable') { throw 'APK release đang debuggable — dừng lại' }
      Write-Host 'APK release: không debuggable (aapt)'
    } else { Write-Warning 'Không thấy aapt.exe: chưa kiểm được APK release có debuggable không' }
  }
  Write-Host "`nAPK: $apk ($([math]::Round((Get-Item $apk).Length / 1MB, 1)) MB)"

  if ($ReleaseManifest) {
    # apk-manifest.mjs từ chối APK chưa ký (tên có "unsigned") nên không ghi manifest cho bản dở
    $manifestPath = if ([IO.Path]::IsPathRooted($ReleaseManifest)) { $ReleaseManifest } else { Join-Path $repoRoot $ReleaseManifest }
    node (Join-Path $PSScriptRoot 'apk-manifest.mjs') --apk $apk --url $ApkUrl --out $manifestPath --min-android $MinAndroid
    if ($LASTEXITCODE) { throw 'Không ghi được apk-release.json (APK chưa ký hoặc url sai)' }
  }
} finally {
  Pop-Location
  if ($needsSubst) { subst $Drive /d | Out-Null }
}
