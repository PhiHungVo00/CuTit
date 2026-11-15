<#
  Build APK debug trên Windows.

  Vì sao cần script này: Gradle/Java trên Windows lỗi khi đường dẫn dự án có ký tự tiếng Việt
  (ví dụ "Kì cuối", "đồ án"): "Could not find or load main class GradleWrapperMain".
  Script map tạm gốc monorepo sang một ổ ảo ASCII (subst) rồi build ở đó.
  Ổ ảo phải trỏ vào GỐC repo, vì capacitor.settings.gradle tham chiếu ../../../node_modules.

  Dùng:  pnpm --filter @vietlearning/host-shell android:apk:win
  Tùy chọn: -Drive X:  -JavaHome "C:\...\jdk-21"  -SkipWeb
#>
param(
  [string]$Drive = 'B:',
  [string]$JavaHome = '',
  [switch]$SkipWeb
)
$ErrorActionPreference = 'Stop'

$hostShell = Split-Path -Parent $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $hostShell '..\..')).Path

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

if (-not $SkipWeb) {
  Push-Location $hostShell
  try {
    npx vite build
    if ($LASTEXITCODE) { throw 'vite build lỗi' }
    npx cap sync android
    if ($LASTEXITCODE) { throw 'cap sync lỗi' }
  } finally { Pop-Location }
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
  .\gradlew.bat assembleDebug --no-daemon --console=plain
  if ($LASTEXITCODE) { throw 'Gradle build lỗi' }
  $apk = Join-Path $hostShell 'android\app\build\outputs\apk\debug\app-debug.apk'
  Write-Host "`nAPK: $apk ($([math]::Round((Get-Item $apk).Length / 1MB, 1)) MB)"
} finally {
  Pop-Location
  if ($needsSubst) { subst $Drive /d | Out-Null }
}
