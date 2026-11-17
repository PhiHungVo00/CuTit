# 🤖 Hướng Dẫn Kỹ Thuật Dành Cho AI Agents & Lập Trình Viên (AGENTS.md)
> **Dự án:** Học Tiếng Việt Cùng Bé Cu Tít (Agentic Vietnamese Learning)  
> **Khóa học:** Chuyên đề Mobile & Pervasive Computing (SE405.R11 - UIT)  
> **Tài liệu tham chiếu chuẩn:** `docs/Bao_Cao_Thiet_Ke_Kien_Truc_Toan_Dien_TDD_UIT.docx`

---

## 🏛️ 1. Cấu Trúc Monorepo & Quy Ước Sở Hữu

Hệ thống được tổ chức theo **Turborepo + PNPM Workspaces**. Mỗi thành viên sở hữu các module độc lập:

- `apps/host-shell` (M3 - FE Lead): Điều phối Module Federation, Agent UI Registry, Event Bus.
- `apps/web-shell` (Bản Web Desktop): Reuse nguyên bộ 12 màn hình MFE, cùng Design Tokens bản mobile, điều hướng sidebar + hash routing, port 3010.
- `apps/gateway` (M1 - BE Lead, M2): Backend Fastify, Adapter STT/TTS/LLM/Vision, Rate Limit & Quota.
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
- `packages/shared`: EventBus (Singleton + Observer), Thuật toán SM-2 (A4), DrillFactory.
- `packages/ui`: Design System, Design Tokens, Thành phần giao diện dùng chung (M3).

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
```

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
