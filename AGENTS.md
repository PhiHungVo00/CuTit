# 🤖 Hướng Dẫn Kỹ Thuật Dành Cho AI Agents & Lập Trình Viên (AGENTS.md)
> **Dự án:** Học Tiếng Việt Cùng Bé Cu Tít (Agentic Vietnamese Learning)  
> **Khóa học:** Chuyên đề Mobile & Pervasive Computing (SE405.R11 - UIT)  
> **Tài liệu tham chiếu chuẩn:** `docs/Bao_Cao_Thiet_Ke_Kien_Truc_Toan_Dien_TDD_UIT.docx`

---

## 🏛️ 1. Cấu Trúc Monorepo & Quy Ước Sở Hữu

Hệ thống được tổ chức theo **Turborepo + PNPM Workspaces**. Mỗi thành viên sở hữu các module độc lập:

- `apps/host-shell` (M3 - FE Lead): Khung app **ghép MFE lúc build** (route lazy, không Module Federation runtime), thanh tab, PWA, Capacitor 7 (Android), cấu hình Gateway + phiên tài khoản khách + khởi động đồng bộ (`src/account/`).
- `apps/gateway` (M1 - BE Lead, M2): Backend Fastify, Adapter STT/TTS/LLM/Vision (Gemini), Rate Limit & Quota theo user, **DB qua Drizzle** (`DATABASE_URL` → Postgres; không có → PGlite), migration đánh số trong `apps/gateway/drizzle/`, tài khoản khách + JWT (`/v1/auth/*`), `/v1/sync`, `DELETE /v1/me`.
- `apps/mfe-conversation` (M3 FE, M1 BE): Màn hình M1 (Chat Canvas), M7 (Roleplay Simulator).
- `apps/mfe-practice` (M4 FE, M2 BE): Màn hình M5 (Adaptive Drills), M8 (Sentence Builder).
- `apps/mfe-learner` (M4 FE, M2 BE): Màn hình M9 (Analytics), M11 (Onboarding), M12 (Preferences).
- `apps/mfe-speech-lab` (M5): Màn hình M2 (Pitch Visualizer), M6 (Dialect Switcher).
- `apps/mfe-vision` (M5 FE, M1 BE): Màn hình M4 (AR Camera Surface).
- `apps/mfe-knowledge` (M2): Màn hình M3 (Honorific Matrix), M10 (Culture Guide).
- `packages/contracts`: Hợp đồng Zod Schema & Drizzle ORM Schema dùng chung.
- `packages/audio-dsp`: Xử lý âm thanh F0 YIN, DTW (Thuật toán A1, A2).
- `packages/content`: Kho dữ liệu JSON (Xưng hô, Phương ngữ, Văn hóa, Kịch bản).
- `packages/prompts`: Thư viện Prompt có phiên bản cho Bé Cu Tít (PromptBuilder).
- `packages/shared`: EventBus (Singleton + Observer), Thuật toán SM-2 (A4).
- `packages/ui`: Design System, Design Tokens, Thành phần giao diện dùng chung (M3).
- `packages/api-client`: Client Gateway có kiểu (Zod theo contract, lỗi chuẩn hóa, SSE, gửi lại một lần khi 401); subpath `./session` = phiên tài khoản khách (tạo lười, refresh xoay vòng, mã khôi phục) — import lười.
- `packages/native`: Cầu nối năng lực thiết bị (TTS native/Web Speech, mở Cài đặt app).
- `packages/state`: Kho người học Zustand + lưu bền (hồ sơ, tùy chỉnh, thẻ SM-2, lượt làm bài, thời gian học, đồng ý), i18n `defineMessages`; subpath `./sync` = hàng đợi đồng bộ local-first (KHÔNG re-export từ `index.ts`).

### Lệch TDD có chủ đích (đã ghi trong nhật ký)
- **Ghép MFE lúc build thay cho Module Federation runtime** (offline, đóng gói store, không trùng React). Nguyên tắc 7 được ép bằng `pnpm lint:boundaries` (dependency-cruiser).
- **Capacitor 7** thay vì 6 (targetSdk 35 của Google Play).
- **i18n tự viết** (`defineMessages` trong `packages/state`) thay i18next — ngân sách bundle đầu.
- **Đăng nhập = tài khoản khách + mã khôi phục** (chưa có email/Google); dev/test dùng **PGlite** thay Postgres; `AUTH_REQUIRED` bật ở mọi môi trường (chỉ test cô lập đặt `false`).
- Nhật ký: `docs/NHAT_KY_CHUYEN_DOI_MOBILE.md`, theo giai đoạn: `docs/nhat-ky/`; kế hoạch tổng: `docs/KE_HOACH_PHAT_TRIEN_TOAN_DIEN.md`.

---

## ⚖️ 2. Bảy Nguyên Tắc Kiến Trúc Bắt Buộc (Mục 3 TDD)

Mọi dòng mã do AI Agent hoặc thành viên viết bắt buộc phải tuân thủ:

1. **API-first:** Mọi năng lực có nhà cung cấp (STT, TTS, LLM, Vision) đều gọi qua Gateway. Không tự train hoặc tự host AI trong MVP.
2. **Client mỏng - Zero Secret Key:** Trình duyệt và ứng dụng client tuyệt đối không giữ API Key. Mọi Secret Key nằm ở biến môi trường server.
3. **Tự viết có kiểm soát:** Chỉ tự viết khi không có API thương mại, và chỉ nằm trong danh mục đóng 8 thuật toán (A1 đến A8).
4. **Hướng năng lực trừu tượng:** Code gọi `stt.transcribe`, `tts.synthesize`, không gọi trực tiếp tên hãng. Đổi nhà cung cấp qua cấu hình môi trường.
5. **Contract-first:** Sửa đổi API phải cập nhật `packages/contracts` trước. Frontend làm việc với Mock Server từ ngày đầu.
6. **Đầu ra LLM luôn có cấu trúc JSON:** Bắt buộc có Zod Schema xác thực ở Gateway. UI không render HTML thô từ LLM.
7. **Độc lập triển khai:** Mỗi Remote MFE build độc lập, không import chéo remote khác. Giao tiếp qua URL, Event Bus hoặc State Slice do Host cấp.

---

## 📋 3. Danh Mục Đóng 8 Thuật Toán Tự Viết (Mục 8 TDD)

Tuyệt đối không tự ý bổ sung thuật toán ngoài danh mục sau nếu chưa có sự phê duyệt của Lead Dev:

- **A1:** Trích xuất cao độ F0 YIN/McLeod & Semitone (`packages/audio-dsp/src/pitch/yin.ts`).
- **A2:** So sánh contour DTW & Pearson 6 thanh điệu (`packages/audio-dsp/src/pitch/dtw.ts`).
- **A3:** Chấm phát âm tổng hợp so khớp từ NFC kết hợp A2 (`apps/gateway/src/services/assessment/`).
- **A4:** Lặp lại ngắt quãng SuperMemo-2 (`packages/shared/src/srs/sm2.ts`).
- **A5:** Kiểm tra xếp lớp thích ứng Staircase/Elo (`apps/gateway`).
- **A6:** Bộ luật đại từ xưng hô tiếng Việt 20 cặp (`packages/content/src/honorifics/`).
- **A7:** Ánh xạ từ vựng phương ngữ 3 miền (`packages/content/src/dialects/`).
- **A8:** Kiểm tra trật tự câu ghép đốt tre (`packages/contracts` & `apps/gateway`).

---

## 🛠️ 4. Quy Lệnh Chuẩn & Kiểm Thử

```bash
# Cài đặt thư viện
pnpm install

# Kiểm tra kiểu dữ liệu toàn monorepo
pnpm build

# Chạy môi trường phát triển
pnpm dev

# Chạy kiểm thử tự động
pnpm test

# Kiểm tra ranh giới MFE (Nguyên tắc 7)
pnpm lint:boundaries

# Sinh migration sau khi sửa packages/contracts/src/db/schema.ts (không sửa migration đã phát hành)
pnpm --filter @vietlearning/gateway db:generate --name <ten>

# e2e (Gateway thật PGlite tự chạy kèm; bản build phải trỏ đúng cổng gateway)
VITE_GATEWAY_URL=http://localhost:4000 pnpm --filter @vietlearning/host-shell build
pnpm --filter @vietlearning/host-shell e2e
```

---

## 🧭 5. Phân việc theo model (thống nhất với người dùng 20/11/2026)

**Opus chỉ dùng cho lập kế hoạch** (phiên chính: brainstorm, spec, plan, chia việc, chọn model/effort, quyết gộp). **Mọi việc khác dùng Sonnet hoặc Haiku cho đỡ tốn** (người dùng chốt 22/11/2026), kể cả rà kiến trúc/bảo mật; Opus chỉ quay lại theo luật nâng cấp bên dưới.

Effort chọn theo **rủi ro và mức mơ hồ**, không theo độ dài. Bốn câu hỏi để quyết:
- Sai có khó hoàn tác không (DB, bảo mật, dữ liệu người dùng, pháp lý)?
- Có cần tự suy luận nhiều không?
- Sửa có lan ra nhiều chỗ không?
- Có cách kiểm tự động không?

| Việc | Agent / phiên | Model | Effort |
|---|---|---|---|
| Lập kế hoạch, điều phối, quyết gộp | phiên chính | Opus | high |
| Kiến trúc, bảo mật, schema/migration, auth, lỗi khó (native, hiệu năng, race), review cuối | `kien-truc` | Sonnet | high |
| Tính năng nhiều tệp đã có yêu cầu rõ, TDD | `lam-tinh-nang` | Sonnet | high |
| Lỗi đã rõ nguyên nhân, test chập chờn, CI đỏ có log, refactor nhỏ | `sua-nho` | Sonnet | medium |
| Tìm/đọc code, nhật ký, tài liệu, chụp ảnh, slide, sửa chữ hàng loạt | `tai-lieu` | Haiku | medium (low cho việc rất máy móc) |

**Luật nâng cấp:**
- Model rẻ làm 2 lần vẫn hỏng ⇒ chuyển lên model cao hơn.
- **Rà tổng bằng Opus chỉ một lần trước khi phát hành, hoặc khi thật sự cần** (người dùng chốt 22/11/2026): một lượt `kien-truc` chạy Opus rà toàn bộ đăng nhập, dữ liệu người dùng, DB/migration, native Android, pháp lý. Ngày thường `kien-truc` chạy Sonnet.
- Việc đụng DB, auth, native Android hay pháp lý ⇒ `kien-truc` xem lại.
- **Không gì vào `main`** nếu chưa qua skill `kiem-truoc-khi-gop`.

**Skill của dự án** (`.claude/skills/`):
- `kiem-truoc-khi-gop`
- `thu-tren-emulator`
- `dung-am-thanh`
- `chup-man-hinh-app`

**Plugin đã cài:** code-review, Android Emulator QA, Playwright MCP, security review, TypeScript LSP (cách dùng trong skill `kiem-truoc-khi-gop`). Trợ năng dùng công cụ miễn phí trong repo (`@axe-core/playwright` ở `e2e/a11y.spec.ts`, Lighthouse) thay plugin Axe trả phí (gỡ 22/11). Nguyên tắc thiết kế UI/UX (dùng khi thiết kế, không phải bước kiểm): `docs/thiet-ke/NGUYEN-TAC-UI-UX.md`.

**Hook** (`.claude/settings.json`):
- chặn sửa migration đã phát hành;
- chặn commit `AGENTS.md` khi turbo tự sửa.

**Cách làm việc với người dùng:**
- Có ý hay hơn đề xuất của người dùng thì phải nói ra kèm lý do trước khi làm.
- Cần plugin, hook, skill, MCP, subagent hay phiên mới thì hỏi người dùng, đừng cố làm thiếu công cụ.
- **Giao việc bằng phiên con, không bằng subagent chạy ngầm** (người dùng chốt 20/11/2026). Phiên chính mở phiên con từ chính nó (hiện thành các dòng lồng dưới phiên chính, người dùng mở xem và nhắn chỉnh được), chọn model theo bảng trên. Việc nào độc lập thì mở nhiều phiên con chạy đồng thời. Subagent chỉ dùng cho việc rất nhỏ cần kết quả ngay trong lượt.
- **Làm gì cũng ghi nhật ký** (`docs/NHAT_KY_CHUYEN_DOI_MOBILE.md`, mỗi việc một dòng: làm gì, tệp nào, đã kiểm thế nào / chưa kiểm gì), kể cả việc chỉ đọc, bàn thiết kế, tạo tài nguyên. Mỗi phiên con tự ghi dòng của mình; phiên chính kiểm số dòng không trùng.

---

## 🧱 6. Quy trình 10 giai đoạn (người dùng đưa vào 21/11/2026)

Bản đầy đủ: `docs/QUY-TRINH-VIBE-CODING.md`. Người dùng không phải lập trình viên chuyên nghiệp ⇒ giải thích tiếng Việt dễ hiểu. **Không viết code khi chưa hiểu yêu cầu, chưa có kế hoạch, chưa được xác nhận.**

| Giai đoạn | Ở dự án này làm bằng |
|---|---|
| 1 Yêu cầu · 2 Kiến trúc · 3 Database · 4 Giao diện | skill `superpowers:brainstorming` ⇒ spec `docs/superpowers/specs/` (có mục phương án, mục tiêu/không làm, người đọc độc lập rà) ⇒ người dùng duyệt. Giai đoạn 4 thiết kế màn/bản phác theo `docs/thiet-ke/NGUYEN-TAC-UI-UX.md` |
| 5 Thiết lập dự án | monorepo sẵn có; `.env.example` không chứa khóa; bí mật ở `~/.becutit/gateway.env` |
| 6 Lập trình từng chức năng | `superpowers:writing-plans` ⇒ kế hoạch `docs/superpowers/plans/` chia đợt ⇒ phiên con TDD, commit nhỏ |
| 7 Bảo mật | 7 nguyên tắc mục 2; `kien-truc` xem lại khi đụng DB/auth; plugin security review |
| 8 Kiểm thử | build/test/boundaries/size/e2e/a11y (axe-core)/AVD — skill `kiem-truoc-khi-gop` |
| 9 Triển khai | hoãn tới cuối (`docs/thiet-ke/DE-XUAT-TRIEN-KHAI.md`); không tự triển khai production |
| 10 Bảo trì | nhật ký, sao lưu (`docs/van-hanh/`), góp ý người dùng |

**Bắt buộc:** không làm vượt bước; xin xác nhận trước khi đổi kiến trúc quan trọng, xóa/ghi đè dữ liệu, đổi DB có rủi ro, dùng dịch vụ có phí, triển khai production; đọc hiểu + tìm nguyên nhân trước khi sửa; **phân biệt rõ** đã viết code / đã chạy thử / đã kiểm thử / đã triển khai / đã nghiệm thu; ưu tiên giải pháp đơn giản.

**Tham khảo code có sẵn trước khi viết tính năng mới** (người dùng chốt 22/11/2026): tìm trên web/GitHub xem đã có ai làm tính năng tương tự với cùng tech stack (React 18 + Vite, Capacitor 7, Fastify, Drizzle/Postgres, Zod) để tham khảo cho nhanh. Kèm điều kiện:
- **Giấy phép:** chỉ chép/chỉnh code MIT, Apache-2.0, BSD, ISC (ghi nguồn + giấy phép vào comment đầu tệp và `docs/`); **không** chép code GPL/AGPL/không có giấy phép (app phát hành thương mại, mã đóng).
- **Ưu tiên thư viện được bảo trì** (cài qua pnpm, kiểm số tải, lần cập nhật, lỗ hổng) hơn chép đoạn code rời; mọi thư viện mới vẫn qua ngân sách gói đầu (size-limit).
- **Hiểu rồi mới dùng:** đọc kỹ, viết lại theo kiến trúc dự án (7 nguyên tắc, contract trước, không import chéo MFE), có test của mình; không dán nguyên khối chưa kiểm.
- **Không lộ dữ liệu dự án** khi tìm kiếm (không dán code/khóa/thông tin người dùng lên dịch vụ ngoài). Ghi link nguồn đã tham khảo vào nhật ký.

**Báo cáo cuối mỗi giai đoạn** theo mẫu: Giai đoạn · Mục tiêu · Đã thực hiện · Kết quả kiểm tra · Vấn đề còn tồn tại · Điều kiện chuyển bước · Bước tiếp theo · Trạng thái (CHƯA BẮT ĐẦU / ĐANG THỰC HIỆN / CHỜ XÁC NHẬN / ĐÃ HOÀN THÀNH).

> `turbo.json` đặt `"agentGuidance": false` để `pnpm build` không tự sửa tệp này (R13). Khối turbo bên dưới được giữ nguyên có chủ đích.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
