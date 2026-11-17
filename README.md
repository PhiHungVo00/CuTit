# 🌟 Học Tiếng Việt Cùng Bé Cu Tít (Agentic Vietnamese Learning)
> **Đồ án môn học:** Chuyên đề Mobile and Pervasive Computing (SE405.R11)  
> **Trường:** Đại học Công nghệ Thông tin – ĐHQG-HCM (UIT)

---

## 🏛️ 1. Cấu Trúc Monorepo

Hệ thống được tổ chức theo mô hình **Turborepo + PNPM Workspaces**, bao gồm 1 Host Shell, 6 Remote Micro Frontends (MFE), 1 Backend SaaS Gateway và 5 Thư viện dùng chung:

```text
├── apps/
│   ├── host-shell/          # Host Shell MOBILE điều phối (Module Federation, React, Tailwind) — port 3000
│   ├── web-shell/           # 🆕 BẢN WEB (Desktop) cùng Design System — port 3010
│   ├── gateway/             # SaaS Gateway Backend (Fastify, Zod, Redis, Drizzle) — port 4000
│   ├── mfe-conversation/    # Remote MFE: Chat canvas, Voice turn state machine, Roleplay — port 3003
│   ├── mfe-speech-lab/      # Remote MFE: Biểu đồ cao độ F0, DTW 6 thanh điệu, Phương ngữ — port 3002
│   ├── mfe-knowledge/       # Remote MFE: Ma trận xưng hô, Cẩm nang văn hóa — port 3004
│   ├── mfe-vision/          # Remote MFE: Camera AR dán nhãn từ vựng — port 3007
│   ├── mfe-practice/        # Remote MFE: Bài tập thích ứng, Ghép câu đốt tre (Memento) — port 3006
│   └── mfe-learner/         # Remote MFE: Bảng phân tích SM-2, Khảo sát xếp lớp A5 — port 3005
├── packages/
│   ├── contracts/           # Hợp đồng API (Zod) & Lược đồ cơ sở dữ liệu (Drizzle)
│   ├── ui/                  # Design System, Design Tokens & Thành phần giao diện dùng chung (M3)
│   ├── audio-dsp/           # Xử lý âm thanh Web Worker: YIN F0, DTW, AudioBridge
│   ├── content/             # Ma trận xưng hô, Từ điển phương ngữ, Kịch bản mẫu
│   ├── prompts/             # Lắp ráp Prompt Bé Cu Tít đa tầng (PromptBuilder)
│   └── shared/              # EventBus (Singleton + Observer), Thuật toán SM-2, Factory
└── docs/                    # Toàn bộ tài liệu kiến trúc, file Word, PDF, Web tương tác
```

---

### 🧭 1.1 Hợp Đồng Sự Kiện Điều Hướng (Nav Event Contract)

Cả hai shell (mobile lẫn web) giao tiếp chuyển màn qua **một hợp đồng duy nhất** khai báo trong `packages/contracts/src/api/nav.ts` (nguyên tắc Contract-first + Shell cấp Event Bus GoF Observer):

- **Tên sự kiện:** `shell.nav.screen_changed`
- **Schema (Zod):** `NavScreenChangedEventSchema` — trường `to`, `from?`, `source`, `mainTab?`, `emittedAt`
- **Cổng phát an toàn:** `emitNavScreenChanged(bus, payload)` — tự gắn `emittedAt`, tự bỏ qua payload lệch schema
- **Nguồn phát (`NAV_SOURCE_IDS`, 10):** `sidebar`, `bottom_tab`, `drawer`, `card`, `subtab`, `main_tab`, `quick_action`, `rail`, `url`, `programmatic`
- **Danh mục màn (`NAV_SCREEN_IDS`, 13):** `overview` + `m1-chat`, `m7-roleplay`, `m8-sentence`, `m5-drill`, `m3-honorific`, `m10-culture`, `m4-vision`, `m2-pitch`, `m6-dialect`, `m9-analytics`, `m11-onboarding`, `m12-preferences`

Bộ test của hợp đồng nằm tại `packages/contracts/test/nav.test.mjs` (chạy cùng `pnpm test`).

### 🔌 1.2 Bảng Port Dev Chuẩn

| Port | Ứng dụng |
| :--- | :--- |
| 3000 | `host-shell` — bản MOBILE (Module Federation, toggle sáng/tối ở thanh trên) |
| 3010 | `web-shell` — bản WEB desktop (bố cục Duolingo, toggle sáng/tối ở topbar) |
| 3002 | `mfe-speech-lab` — Thanh Điệu (M2), Phương Ngữ (M6) |
| 3003 | `mfe-conversation` — Hội Thoại (M1), Nhập Vai (M7) |
| 3004 | `mfe-knowledge` — Xưng Hô (M3), Văn Hóa (M10) |
| 3005 | `mfe-learner` — Tiến Trình (M9), Xếp Lớp (M11), Cài Đặt Trợ Lý (M12) |
| 3006 | `mfe-practice` — Ghép Câu (M8), Luyện Tập (M5) |
| 3007 | `mfe-vision` — AR Camera (M4) |
| 4000 | `gateway` — Fastify SaaS Gateway (STT/TTS/LLM/Vision qua adapter) |

## 👥 2. Phân Công Thành Viên & Màn Hình Phụ Trách

| Thành viên | Vai trò chính | Màn hình MVP phụ trách |
| :--- | :--- | :--- |
| **M1** | Tech Lead & Core Backend | M1 (Chat SSE), M4 (Vision Backend), M7 (Roleplay), M12 (AI Preferences) |
| **M2** | Backend AI & Knowledge Content | M3 (Xưng hô), M5 (Drill Gen), M6 (Phương ngữ), M8 (Câu ghép), M10 (Văn hóa) |
| **M3** | Frontend Lead (Shell & Voice) | M1 (Chat Canvas), Host Shell, Module Federation, SSE Streaming, UI Blocks |
| **M4** | Frontend Logic (Practice & Learner)| M5 (Adaptive Drill), M8 (Sentence Builder), M9 (Dashboard), M11 (Onboarding) |
| **M5** | DSP Audio & Visual FX | M2 (Pitch Visualizer F0/DTW), M4 (AR Camera), M6 (Dialect Audio Player) |

---

## 🚀 3. Hướng Dẫn Bắt Đầu Nhanh (Quick Start)

### Điều kiện tiên quyết:
- **Node.js:** v20+ hoặc v24+
- **PNPM:** `npm install -g pnpm`

### Cài đặt toàn bộ dự án:
```bash
# 1. Cài đặt các gói phụ thuộc
pnpm install

# 2. Tạo tệp cấu hình môi trường
cp .env.example apps/gateway/.env

# 3. Khởi chạy toàn bộ hệ thống (Dev Mode)
pnpm dev
```

> ⚠️ **Bảng port cố định (đã thiết lập trong từng `vite.config.ts`):**
> | App | Port |
> | --- | --- |
> | host-shell (bản mobile UI) | `3000` *(nếu 3000 bị chiếm, Vite tự lui sang 3001 — kiểm tra log dev)* |
> | **web-shell (bản web desktop)** | **`3010`** |
> | mfe-speech-lab / conversation / knowledge / learner / practice / vision | `3002 / 3003 / 3004 / 3005 / 3006 / 3007` |
> | gateway (backend Fastify) | `4000` |
>
> Mở bản Web desktop tại **http://localhost:3010** — cùng design system Material-3 Stitch với bản mobile,
> điều hướng sidebar cho màn hình lớn, giữ nguyên bottom nav (mobile) khi co hẹp về dưới `lg`.

---

## 📚 4. Tài Liệu Kỹ Thuật Tham Khảo (Trong thư mục `docs/`)
- `docs/Bao_Cao_Thiet_Ke_Kien_Truc_Toan_Dien_TDD_UIT.docx`: Tài liệu đặc tả kiến trúc chuẩn (Master TDD) gồm đầy đủ 16 mục theo chuẩn quốc tế ASD-STE100.
- `docs/diagram_architecture_gof.png`: Sơ đồ kiến trúc 3 phân tầng 300 DPI tích hợp 23 mẫu GoF.
- `docs/interactive_architecture.html`: Ứng dụng web HTML tương tác chạy trực tiếp F0, SM-2, Voice Turn và GoF Explorer.
- `docs/02_Bao_cao_ky_thuat_TDD_UIT.pdf`: Báo cáo kỹ thuật gốc đồ án SE405.R11.
- `docs/archive/`: Thư mục lưu trữ các bản thảo và tài liệu trung gian.
