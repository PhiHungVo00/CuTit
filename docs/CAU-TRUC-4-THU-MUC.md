# Cấu trúc 4 thư mục sở hữu

> Nhóm 4 người cùng làm một app. Mã nguồn chia thành **4 thư mục cấp một**, mỗi người sở hữu một thư mục.
> Vẫn là **một repo, một workspace pnpm, một lockfile**. Tên gói `@vietlearning/*` không đổi nên import không đổi.
> Việc chuyển thư mục làm bằng `git mv` nên `git log --follow <tệp>` vẫn xem được lịch sử cũ.

## 1. Bản đồ

| Thư mục | Chủ sở hữu | Ứng dụng (`apps/`) | Gói (`packages/`) |
|---|---|---|---|
| `01-nen-tang/` | `@NGUOI-1` (chủ dự án) | `host-shell`, `gateway`, `landing` | `contracts`, `shared`, `state`, `api-client`, `ui`, `native` |
| `02-hoi-thoai-ai/` | `@NGUOI-2` | `mfe-conversation`, `mfe-vision` | `prompts` |
| `03-hoc-tap/` | `@NGUOI-3` | `mfe-path`, `mfe-practice`, `mfe-learner` | `exercises` |
| `04-am-thanh-tri-thuc/` | `@NGUOI-4` | `mfe-speech-lab`, `mfe-knowledge` | `audio-dsp`, `content` |

Tên giữ chỗ `@NGUOI-1..4` nằm trong `.github/CODEOWNERS`; thay bằng tên GitHub thật là xong.

Các tệp ở gốc (`.github`, `.claude`, `docs`, `package.json`, `turbo.json`, `pnpm-workspace.yaml`, `AGENTS.md`, `tsconfig.base.json`,
`.dependency-cruiser.cjs`, `scripts/`, `tools/`) là của chung: sửa phải qua PR và báo cả nhóm (mặc định `@NGUOI-1` duyệt).

### Gateway chia theo chức năng

Gateway (`01-nen-tang/apps/gateway`) là **một ứng dụng chung**, nên nằm trọn trong `01-`. Ai sở hữu phần nào của nó được ghi bằng
CODEOWNERS (dòng sau thắng dòng trước):

| Chức năng | Tệp trong `01-nen-tang/apps/gateway/` | Chủ |
|---|---|---|
| Chat, gia sư, vision, LLM | `src/routes/chat.ts`, `src/routes/content.ts` (ảnh + hỏi văn hóa), `src/services/chat/`, `src/services/ai/`, `src/providers/llm.ts`, `scripts/ai-chat-smoke.mjs`, test `chat`, `chat-image-summary`, `gd3-chat`, `vision`, `llm` | `02-` |
| Tiến độ, bài tập, luyện tập | `src/routes/practice.ts`, `src/services/learner/`, `src/services/placement/`, `src/services/explain/`, test `learner`, `placement`, `explain` | `03-` |
| Giọng nói, chấm phát âm, TTS/STT, âm thanh dựng sẵn | `src/routes/speech.ts`, `src/routes/audio.ts`, `src/services/assessment/`, `src/services/tts/`, `src/cache/`, `src/providers/stt.ts`, `src/providers/tts.ts`, `src/lib/audioUpload.ts`, `scripts/prebuild-tts.ts`, `scripts/ai-stt-smoke.mjs`, test `assessment`, `tts`, `audio-upload`, và `tools/tts-local/` | `04-` |
| Còn lại: đăng nhập, tài khoản, đồng bộ, hạn mức, phiên bản app, bạn bè, thư, audit, sao lưu, hạ tầng (`app.ts`, `config.ts`, `db/`, `drizzle/`, `pipeline/`, `providers/` còn lại) | các tệp khác | `01-` |

Ghi chú: `routes/content.ts` gộp ba thứ (nhãn ảnh, đường nét thanh điệu tham chiếu, hỏi văn hóa); đang giao cho `02-` vì phần chính là vision.
Nếu muốn tách nhỏ hơn thì tách tệp trước rồi đổi CODEOWNERS.

## 2. Ai được phụ thuộc vào ai

```
01-nen-tang   ◀── 02-, 03-, 04-   (qua tên gói @vietlearning/ui, state, contracts, api-client, native, shared)
01-nen-tang   ──▶ 02-, 03-, 04-   (host-shell ghép mọi MFE lúc build; gateway dùng prompts, content, audio-dsp)
02-, 03-, 04-  ✗  nhau            (trừ hai gói dùng chung dưới đây)
```

- `01-nen-tang` là **người tích hợp**: host-shell import điểm vào công khai (`src/index.ts`) của từng MFE, Gateway dùng các gói nội dung.
- `02-`, `03-`, `04-` **chỉ được phụ thuộc vào chính nó và `01-nen-tang`**. Luật `owner-dir-only-depends-on-foundation` trong
  `.dependency-cruiser.cjs` ép điều này (`pnpm lint:boundaries`).
- **Hai ngoại lệ có chủ đích** (gói dùng chung, được nhiều thư mục import):
  - `04-am-thanh-tri-thuc/packages/content` (kho nội dung JSON; bài học, xưng hô, phương ngữ);
  - `03-hoc-tap/packages/exercises` (khối bài tập; hiện `mfe-speech-lab` ở `04-` đang dùng).
  Sửa hai gói này phải báo các thư mục đang dùng. Muốn thêm ngoại lệ thứ ba thì bàn cả nhóm rồi thêm vào `pathNot` của luật.
- Các luật cũ vẫn giữ nguyên: MFE không import MFE khác (nguyên tắc 7), host chỉ import `src/index.ts` của MFE, gói không import ứng dụng,
  client không import Gateway.

## 3. Quy ước làm việc

- **Mỗi người chỉ sửa thư mục của mình.** Cần sửa thư mục người khác: nhắn chủ thư mục, hoặc mở PR và gắn họ review (CODEOWNERS tự yêu cầu).
- **Nhánh:** `<số thư mục>/<việc>`, ví dụ `02/chat-streaming`, `04/pitch-lab-fix`. Không đẩy thẳng lên `main`.
- **PR:** một việc một PR, mô tả bằng tiếng Việt, nói rõ đã chạy thử / đã kiểm thử gì. CI xanh mới gộp.
- **Sửa hợp đồng API** (`01-nen-tang/packages/contracts`) làm trước và qua PR riêng, để các thư mục khác lấy về (nguyên tắc 5 contract-first).
- **Migration DB** (`01-nen-tang/apps/gateway/drizzle/`): chỉ thêm mới, không sửa migration đã phát hành; chủ `01-` duyệt.
- **Commit nhỏ**, mô tả rõ. Không commit khóa API, `.env`, keystore, dữ liệu người dùng (repo công khai).
- **Nhật ký:** mỗi việc một dòng ở `docs/NHAT_KY_CHUYEN_DOI_MOBILE.md`.

## 4. Cách chạy

Luôn chạy từ **gốc repo** (một workspace). Dùng `corepack pnpm` (pnpm 12.9.1), không dùng pnpm toàn cục bản cũ.

```powershell
corepack pnpm install                 # cài một lần cho cả repo
corepack pnpm build                   # build mọi gói/ứng dụng (turbo)
corepack pnpm test                    # test mọi nơi
corepack pnpm lint:boundaries         # kiểm ranh giới MFE và ranh giới thư mục
corepack pnpm --filter @vietlearning/mfe-practice test     # chỉ một gói theo tên (tên không đổi)
corepack pnpm --filter "./03-hoc-tap/**" build             # cả một thư mục sở hữu (lọc theo đường dẫn)
corepack pnpm --filter "./03-hoc-tap/**" test
```

Chạy app thật: cần Gateway (cổng riêng) và host-shell; xem README của `01-nen-tang/` và skill `chup-man-hinh-app`, `thu-tren-emulator`.
Mỗi thư mục có `README.md` ngắn nói gồm gì và chạy riêng phần của mình thế nào.

## 5. Gộp lại bố cục phẳng (nếu cần)

```powershell
node scripts/gop-lai-monorepo.mjs --dry-run    # xem sẽ chuyển gì
node scripts/gop-lai-monorepo.mjs              # git mv về apps/ + packages/, sửa workspace + đường dẫn, sinh lại lockfile
```

Tập lệnh không tự commit và không đụng `docs/`. Sau khi chạy: `corepack pnpm install --frozen-lockfile`, `build`, `test`, `lint:boundaries`.
README gốc và `AGENTS.md` có mô tả 4 thư mục, cần sửa tay phần đó. Không có tập lệnh chia ngược (việc chia đã làm một lần bằng `git mv`, bảng ở mục 1 là nguồn).

## 6. Những chỗ đã sửa vì đường dẫn đổi (để người sau khỏi dò lại)

- Mọi `tsconfig*.json`: `extends` thành `../../../tsconfig.base.json`.
- `pnpm-workspace.yaml`: glob `0[1-4]-*/apps/*`, `0[1-4]-*/packages/*`. `package.json` gốc: `lint:boundaries` quét 4 thư mục.
- `host-shell`: `src/styles/app.css` (`@source` trỏ sang MFE ở thư mục khác), `scripts/build-apk.ps1` (gốc repo sâu hơn một cấp, bộ lọc turbo),
  `android/capacitor.settings.gradle` (`node_modules` ở gốc: thêm một `../`). `android/app/build.gradle` đọc `../../package.json` của chính host-shell nên **không đổi**;
  `vite.config.ts` và `scripts/version.mjs` đọc `package.json` của host-shell qua đường dẫn nội bộ nên cũng không đổi.
- `.github/workflows/ci.yml`, `.gitignore`, `.gitattributes`, `.env.example`, hook chặn sửa migration, skill trong `.claude/skills/`.
- Test `shared/test/audio-sources.test.mjs` tự tìm gốc repo (theo `pnpm-workspace.yaml`) và duyệt cả 4 thư mục.
