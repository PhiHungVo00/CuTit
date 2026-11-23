# Cài đặt và chạy app Bé Cu Tít (dành cho thành viên mới)

> Viết cho người **không chuyên**: cứ làm lần lượt từng bước, gặp lỗi thì xem mục [Khi gặp lỗi](#7-khi-gặp-lỗi).
> Lệnh viết cho **PowerShell trên Windows**. Nếu dùng macOS thì có ghi chú ngắn ở những chỗ khác.
> Sau bước 4 bạn đã **chạy được app mà không cần khóa AI nào** — khóa AI (mục 6) là bước thêm sau.

Thời gian dự kiến: cài phần mềm 15–30 phút (một lần), tải và build ~5 phút.

---

## 1. Cài phần mềm (một lần duy nhất)

| Phần mềm | Bắt buộc? | Cài từ đâu | Ghi chú |
|---|---|---|---|
| **Node.js 24** (bản LTS) | Có | https://nodejs.org | Đúng phiên bản dự án dùng (CI chạy Node 24). Node đi kèm sẵn **corepack**. |
| **pnpm 12.9.1** | Có | không cần tải riêng — lấy qua corepack (bước 3) | Phải đúng **12.9.1**. |
| **Git** | Có | https://git-scm.com/downloads | Cài mặc định, bấm Next. |
| **Google Chrome** | Có (để xem app / chạy e2e) | https://www.google.com/chrome | |
| JDK 21 | Không — chỉ cho phần Android | https://adoptium.net (Temurin **21** LTS) | Capacitor 7 cần đúng 21. |
| Android Studio | Không — chỉ cho phần Android | https://developer.android.com/studio | Mở lần đầu để nó tự tải SDK. |

**Sau khi cài xong, ĐÓNG hẳn PowerShell và mở lại** (để máy nhận lệnh mới).

> macOS: cài Node từ nodejs.org (hoặc `brew install node@24`), Git có sẵn (`git --version` nếu chưa có máy sẽ hỏi cài).
> Các lệnh bên dưới giống nhau, chỉ khác: dùng Terminal thay PowerShell, đường dẫn kiểu `~/code/becutit`.

Kiểm tra nhanh:

```powershell
node -v
git --version
```

`node -v` phải hiện `v24.x.x`.

---

## 2. Tải mã nguồn về (clone)

**Quan trọng — chọn thư mục NGẮN, KHÔNG dấu, KHÔNG dấu cách**, ví dụ `C:\code\becutit`. Windows giới hạn độ dài đường dẫn,
đường dẫn dài hoặc có chữ có dấu (như "Kì cuối") gây lỗi khó hiểu (xem mục 7).

```powershell
New-Item -ItemType Directory -Force C:\code | Out-Null
git clone https://github.com/PhiHungVo00/CuTit.git C:\code\becutit
cd C:\code\becutit
```

Từ đây **mọi lệnh chạy trong thư mục `C:\code\becutit`** (gọi là "thư mục dự án").

### Kiểm tra máy đã đủ chưa

```powershell
node scripts/nhom/kiem-tra-may.mjs
```

Script in từng mục **đạt / CHƯA ĐẠT** kèm cách khắc phục ngay bên dưới. Mục tùy chọn (Java, adb) chỉ nhắc, không sao nếu chưa có.
Làm cho đến khi hiện dòng `✔ Đủ điều kiện chạy app trên web`.

> **Hai bố cục thư mục.** Repo đang chuyển từ `apps/` + `packages/` ở gốc sang 4 thư mục
> `01-nen-tang`, `02-hoi-thoai-ai`, `03-hoc-tap`, `04-am-thanh-tri-thuc` (PR #34). Sau khi gộp, đường dẫn Gateway đổi từ
> `apps/gateway` thành `01-nen-tang/apps/gateway`. **Các lệnh trong hướng dẫn này không đổi** vì dùng tên gói
> (`--filter @vietlearning/gateway`), chỉ những chỗ nhắc đường dẫn tệp là khác. Hai script trong `scripts/nhom/` tự nhận biết
> bạn đang ở bố cục nào.

---

## 3. Cài thư viện (có một bẫy: pnpm bản cũ)

**Luôn gõ `corepack pnpm ...` thay vì `pnpm ...`.** Lý do: nhiều máy đã có sẵn pnpm toàn cục bản 9 (cài từ trước). Bản đó đọc sai tệp
khóa của dự án và báo `ERR_PNPM_BROKEN_LOCKFILE`. `corepack pnpm` luôn tự lấy đúng bản **12.9.1** mà dự án ghi trong `package.json`.

Tránh hộp thoại hỏi tải lần đầu (một lần cho cả cửa sổ PowerShell):

```powershell
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
corepack pnpm --version
```

Phải in ra `12.9.1` (lần đầu cần mạng để tải, vài giây). Rồi cài thư viện:

```powershell
corepack pnpm install --frozen-lockfile
```

Kỳ vọng: cuối cùng có dòng `Done in … using pnpm v12.9.1`, vài dòng `esbuild postinstall: Done`. Có cảnh báo `DEP0169` hay `deprecated` là **bình thường**.

> macOS: bước `$env:...` thay bằng `export COREPACK_ENABLE_DOWNLOAD_PROMPT=0`.

---

## 4. Build và chạy (chế độ KHÔNG khóa AI)

### 4.1 Build một lần

```powershell
corepack pnpm build
```

Chờ ~1–5 phút (đo thật: 80 giây trên máy mạnh). Thành công khi cuối cùng báo `Tasks: 20 successful, 20 total` và **không** có dòng `ERROR`/`failed`.
Dòng `WARNING no output files found for task @vietlearning/exercises#build` là **bình thường**, bỏ qua.
(Chỉ cần build lại khi bạn kéo code mới về hoặc sửa các gói dùng chung.)

### 4.2 Chạy Gateway (backend) — cửa sổ PowerShell số 1

```powershell
cd C:\code\becutit
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
corepack pnpm --filter @vietlearning/gateway dev
```

Để cửa sổ này **mở** (đừng đóng). Khi thấy dòng `Gateway running on port 4000` là xong. Thử: mở trình duyệt vào
http://localhost:4000/healthz → thấy `{"status":"healthy",...}`.

**Chế độ không khóa** = bạn chưa có khóa AI nào → Gateway tự dùng **bộ giả lập** (trả lời mẫu; trong log có `"llm":"mock"`). Dòng cảnh báo `JWT_SECRET chưa đặt: dùng khóa ngẫu nhiên` là bình thường khi phát triển.
Mọi màn vẫn mở được, chat vẫn trả lời, chỉ là câu trả lời mẫu chứ chưa phải AI thật. Dữ liệu lưu bằng **PGlite** (cơ sở dữ liệu nhúng,
tự tạo trong `apps/gateway/.data`, không cần cài Postgres).

### 4.3 Chạy giao diện — cửa sổ PowerShell số 2

```powershell
cd C:\code\becutit
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
corepack pnpm --filter @vietlearning/host-shell dev
```

Mở **http://localhost:5173** trong Chrome. Muốn xem như điện thoại: nhấn `F12` → biểu tượng điện thoại (Ctrl+Shift+M).

### 4.4 Checklist "chạy thành công"

Đánh dấu từng mục khi đã thấy đúng:

- [ ] http://localhost:4000/healthz trả `healthy`.
- [ ] http://localhost:5173 mở ra màn **Học** ("Chào bạn!", lộ trình A1 với các bài "Xin chào!", "Anh, chị, em"…), thanh tab ở dưới gồm **Học · Luyện tập · Bạn bè · Hồ sơ**.
- [ ] Mở http://localhost:5173/hoi-thoai (hoặc vào từ bài nhập vai): có dòng **"Đang chạy chế độ giả lập: câu trả lời là câu mẫu, chưa nối AI."** Gõ `Xin chao` → Cu Tít sửa thành "xin chào" và trả lời mẫu "Chào bạn! Mình là Bé Cu Tít đây…" kèm nhãn "trả lời mẫu (chưa nối AI)".
- [ ] **Luyện tập** (`/luyen-tap`): hiện câu trắc nghiệm (vd. "Người miền Nam gọi “ngã” là gì?"), chọn đáp án thì báo đúng/sai.
- [ ] **Xưng hô** (`/xung-ho`): "Ma trận đại từ xưng hô" với 3 bước chọn (quan hệ, tuổi, bối cảnh). **Văn hóa** (`/van-hoa`) cũng hiện nội dung.
- [ ] **Hồ sơ → Cài đặt** (`/cai-dat`): có các nhóm Giao diện, Ngôn ngữ, Học, Âm thanh, Chuyển động, Quyền riêng tư, Tài khoản; đổi ngôn ngữ vi ⇄ en thì chữ đổi theo.
- [ ] Mở F12 → tab **Console**: không có chữ đỏ liên tục (một hai cảnh báo vàng là bình thường).
- [ ] Cửa sổ Gateway không báo lỗi đỏ khi bạn bấm các màn trên.

Khi đã thêm khóa AI (mục 6), dòng "chế độ giả lập" ở màn Hội thoại biến mất. Màn **Camera** và **Phát âm** cần cho phép micro/camera của trình duyệt; không bắt buộc lúc kiểm tra đầu tiên.

---

## 5. Cổng bận và đổi cổng

Gateway dùng cổng **4000**, giao diện **5173**. Nếu `kiem-tra-may.mjs` báo cổng bận (đang chạy bản khác), tìm và đóng chương trình đó,
hoặc chạy ở cổng khác:

```powershell
# cửa sổ 1 — Gateway cổng 4123, cho phép giao diện ở cổng 5203
$env:PORT = "4123"
$env:CORS_ORIGIN = "http://localhost:5203"
corepack pnpm --filter @vietlearning/gateway dev

# cửa sổ 2 — giao diện cổng 5203, trỏ tới Gateway 4123
$env:VITE_GATEWAY_URL = "http://localhost:4123"
corepack pnpm --filter @vietlearning/host-shell exec vite --port 5203 --strictPort
```

(Biến `$env:` chỉ có hiệu lực trong cửa sổ đó; đóng cửa sổ là mất.)

---

## 6. Thêm khóa AI miễn phí của riêng bạn (tùy chọn)

Không bắt buộc để chạy app. Có khóa thì Cu Tít trả lời bằng AI thật. **Mỗi người tự tạo khóa riêng, không dùng chung, không gửi cho nhau,
không dán vào chat/Git** (repo này công khai).

| Nhà cung cấp | Tạo khóa ở | Giới hạn miễn phí cần nhớ |
|---|---|---|
| **Gemini** (Google) | https://aistudio.google.com/apikey | Có hạn mức theo phút/ngày (đổi theo thời gian, xem trang chính thức). Đôi khi báo "bận" (503). |
| **Groq** | https://console.groq.com/keys | Rất nhanh nhưng chỉ ~8 000 token/phút (≈ vài lượt chat mỗi phút) → thỉnh thoảng 429. |
| **OpenRouter** | https://openrouter.ai/keys | Model đuôi `:free`: ~20 yêu cầu/phút và ~50 yêu cầu/**ngày** nếu chưa nạp tiền. |

Có một khóa là đủ; có nhiều thì Gateway thử lần lượt nguồn nhanh trước, nguồn lỗi/hết lượt thì sang nguồn kế.
Giới hạn có thể đổi — số liệu trên là lúc dự án đo; hết lượt chỉ là chờ hoặc dùng nguồn khác, **không mất tiền**.

### Cách đặt (script làm hộ)

```powershell
node scripts/nhom/tao-env.mjs
```

Script hỏi từng khóa (Enter để bỏ qua). Bạn dán khóa vào thì **màn hình không hiện chữ** — đó là cố ý. Script ghi vào:

- Windows: `C:\Users\<tên bạn>\.becutit\gateway.env`
- macOS: `~/.becutit/gateway.env`

Đây là chỗ Gateway đọc khóa, **nằm ngoài thư mục dự án** nên không thể bị commit nhầm, và dùng chung cho mọi bản clone trên máy.
Script từ chối ghi nếu tệp đích nằm trong repo mà chưa được `.gitignore` bỏ qua.
Kiểm tra đã đặt chưa (không lộ khóa): `node scripts/nhom/tao-env.mjs --kiem-tra`.

Xong thì **tắt Gateway (Ctrl+C) và chạy lại** lệnh ở 4.2. Trong log Gateway sẽ không còn `mock`, và tin nhắn Cu Tít trả lời khác hẳn câu mẫu.

> Sao chép nguyên `.env.example` thành `apps/gateway/.env` cũng không làm hỏng (đã thử: Gateway vẫn chạy giả lập), nhưng không cần thiết.
>
> Có thể tự đặt tay thay vì dùng script: tạo tệp trên, mỗi dòng `GROQ_API_KEY=...` (không dấu ngoặc kép). Mẫu các biến có ở `.env.example`
> (chỉ là mẫu, **không điền khóa vào `.env.example`**).

---

## 7. Khi gặp lỗi

Đây là các lỗi **thật** gặp khi làm đúng theo hướng dẫn này.

**`ERR_PNPM_BROKEN_LOCKFILE ... expected a single document in the stream, but found more`**
→ Bạn gõ `pnpm install` bằng pnpm toàn cục bản 9. Dùng **`corepack pnpm install --frozen-lockfile`** (mục 3). Đây là lỗi tác giả gặp khi thử `pnpm install` trên máy có pnpm 9.15.4. Chạy `node scripts/nhom/kiem-tra-may.mjs` sẽ báo bản pnpm đang dùng.

**Cổng bận: `EADDRINUSE` / `address already in use :::4000` (hoặc 5173)**
→ Còn một phiên Gateway/giao diện cũ đang chạy. Tìm: `Get-NetTCPConnection -LocalPort 4000 | Select OwningProcess`, rồi `Get-Process -Id <số>`.
Nếu đúng là phiên cũ của bạn thì đóng cửa sổ của nó (hoặc `Stop-Process -Id <số>`). **Đừng tắt hàng loạt `node`** vì có thể tắt nhầm việc khác. Hoặc đổi cổng (mục 5).

**Đường dẫn quá dài / "path too long" / không tìm thấy tệp, hoặc lỗi lạ khi thư mục có chữ có dấu, dấu cách**
→ Clone vào thư mục ngắn không dấu như `C:\code\becutit` (mục 2). Tạm thời: `git config --global core.longpaths true`.

**`corepack : The term 'corepack' is not recognized`**
→ Node chưa cài đúng hoặc chưa mở lại PowerShell. Cài lại Node 24 từ nodejs.org, **đóng và mở lại PowerShell**.

**Corepack báo lỗi quyền (`EPERM`) khi `corepack enable`**
→ Không cần `corepack enable`. Cứ dùng `corepack pnpm ...` như hướng dẫn. (Nếu vẫn muốn bật: mở PowerShell "Run as administrator".)

**Giao diện mở được nhưng báo không kết nối được máy chủ / trắng ở màn có AI**
→ Gateway chưa chạy hoặc sai cổng. Kiểm tra http://localhost:4000/healthz. Nếu bạn đổi cổng, đã đặt `VITE_GATEWAY_URL` và `CORS_ORIGIN` đúng chưa (mục 5)?

**Lỗi chữ đỏ về kiểu dữ liệu sau khi `git pull`**
→ Chạy lại `corepack pnpm install --frozen-lockfile` rồi `corepack pnpm build`.

**Gateway báo `AI chain entry skipped` (cảnh báo vàng)**
→ Bình thường: một nguồn AI trong chuỗi thiếu khóa nên bị bỏ qua. Không có khóa nào thì vẫn chạy giả lập.

**Android: build lỗi JDK**
→ Cần đúng JDK 21 và biến `JAVA_HOME` trỏ tới nó. Xem mục 8.

Vẫn kẹt? Chụp màn hình **cả lệnh bạn gõ lẫn thông báo lỗi** (che khóa nếu có) rồi gửi vào nhóm.

---

## 8. Phần Android (tùy chọn — chỉ khi cần chạy app trên máy ảo/điện thoại)

Cần JDK 21 + Android Studio (bảng ở mục 1). Chỉ làm khi đã chạy được app trên web.

1. Mở Android Studio một lần, để nó tải **Android SDK** (mặc định `C:\Users\<tên>\AppData\Local\Android\Sdk`).
2. Đặt biến môi trường (PowerShell, đặt cho cả máy; **mở lại PowerShell** sau đó):
   ```powershell
   [Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
   [Environment]::SetEnvironmentVariable("JAVA_HOME", "<thư mục JDK 21 của bạn>", "User")
   ```
3. Thêm `%LOCALAPPDATA%\Android\Sdk\platform-tools` vào `Path` để có lệnh `adb`.
4. `node scripts/nhom/kiem-tra-may.mjs` phải báo JDK 21, adb, Android SDK đều "đạt".
5. Build APK: xem `apps/host-shell/package.json` (`android:apk:win`) và skill `thu-tren-emulator` — hỏi người phụ trách Android trước khi làm, vì cần máy ảo và cấu hình ký.
   Sau PR #34 đường dẫn là `01-nen-tang/apps/host-shell`.

App trên máy ảo gọi Gateway ở `http://10.0.2.2:4000` (địa chỉ đặc biệt trỏ về máy tính của bạn), xem `apps/host-shell/.env.example`.

---

## 9. Lệnh hay dùng (tóm tắt)

| Việc | Lệnh |
|---|---|
| Kiểm máy | `node scripts/nhom/kiem-tra-may.mjs` |
| Đặt khóa AI | `node scripts/nhom/tao-env.mjs` |
| Cài thư viện | `corepack pnpm install --frozen-lockfile` |
| Build tất cả | `corepack pnpm build` |
| Chạy Gateway | `corepack pnpm --filter @vietlearning/gateway dev` |
| Chạy giao diện | `corepack pnpm --filter @vietlearning/host-shell dev` |
| Kiểm thử tự động | `corepack pnpm test` |
| Kiểm ranh giới giữa các MFE | `corepack pnpm lint:boundaries` |
| Kéo code mới | `git pull` rồi cài + build lại |

Quy tắc nhóm: **không commit khóa/`.env`**, làm trên nhánh riêng, mở Pull Request, không đẩy thẳng vào `main`.
