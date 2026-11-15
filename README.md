# 🌟 Học Tiếng Việt Cùng Bé Cu Tít (Agentic Vietnamese Learning)
> **Đồ án môn học:** Chuyên đề Mobile and Pervasive Computing (SE405.R11)  
> **Trường:** Đại học Công nghệ Thông tin – ĐHQG-HCM (UIT)

---

## 🏛️ 1. Cấu Trúc Monorepo

Hệ thống được tổ chức theo mô hình **Turborepo + PNPM Workspaces**, bao gồm 1 Host Shell, 6 Remote Micro Frontends (MFE), 1 Backend SaaS Gateway và 5 Thư viện dùng chung:

```text
├── apps/
│   ├── host-shell/          # Host Shell: ghép MFE lúc build, lazy theo route, PWA offline
│   ├── gateway/             # SaaS Gateway Backend (Fastify, Zod, Redis, Drizzle)
│   ├── mfe-conversation/    # Remote MFE: Chat canvas, Voice turn state machine, Roleplay
│   ├── mfe-speech-lab/      # Remote MFE: Biểu đồ cao độ F0, DTW 6 thanh điệu, Phương ngữ
│   ├── mfe-knowledge/       # Remote MFE: Ma trận xưng hô, Cẩm nang văn hóa
│   ├── mfe-vision/          # Remote MFE: Camera AR dán nhãn từ vựng
│   ├── mfe-practice/        # Remote MFE: Bài tập thích ứng, Ghép câu đốt tre (Memento)
│   └── mfe-learner/         # Remote MFE: Bảng phân tích SM-2, Khảo sát xếp lớp A5
├── packages/
│   ├── contracts/           # Hợp đồng API (Zod) & Lược đồ cơ sở dữ liệu (Drizzle)
│   ├── ui/                  # Design System, Design Tokens & Thành phần giao diện dùng chung
│   ├── audio-dsp/           # Xử lý âm thanh Web Worker: YIN F0, DTW, AudioBridge
│   ├── content/             # Ma trận xưng hô, Từ điển phương ngữ, Kịch bản mẫu
│   ├── prompts/             # Lắp ráp Prompt Bé Cu Tít đa tầng (PromptBuilder)
│   └── shared/              # EventBus (Singleton + Observer), Thuật toán SM-2, Factory
└── docs/                    # Toàn bộ tài liệu kiến trúc, file Word, PDF, Web tương tác
```

---

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

### Kiến trúc ghép MFE cho mobile (quyết định 2026-11-15)
- Bản mobile/PWA/Capacitor **không dùng Module Federation runtime**: Host import điểm vào công khai
  (`src/index.ts`) của từng remote bằng `import()` động, Vite tách mỗi màn hình thành một chunk riêng.
  Lý do: tránh waterfall `remoteEntry.js` trên 4G, chỉ một bản React, chạy offline và đóng gói store được.
- Nguyên tắc 7 (không import chéo remote) được ép bằng công cụ: `pnpm lint:boundaries`.
- Thử PWA/offline: `pnpm build` rồi `pnpm --filter @vietlearning/host-shell preview`
  (Service Worker chỉ đăng ký ở bản build, không chạy ở `pnpm dev`).

### Gateway
- Cấu hình nằm ở `apps/gateway/.env` (được nạp qua dotenv và kiểm tra bằng Zod khi khởi động).
- `CORS_ORIGIN` là danh sách origin được phép; không chấp nhận `*`.
- Production bắt buộc `JWT_SECRET`; môi trường dev mặc định cho phép khách ẩn danh (`AUTH_REQUIRED=false`).

---

## 📚 4. Tài Liệu Kỹ Thuật Tham Khảo (Trong thư mục `docs/`)
- `docs/Bao_Cao_Thiet_Ke_Kien_Truc_Toan_Dien_TDD_UIT.docx`: Tài liệu đặc tả kiến trúc chuẩn (Master TDD) gồm đầy đủ 16 mục theo chuẩn quốc tế ASD-STE100.
- `docs/diagram_architecture_gof.png`: Sơ đồ kiến trúc 3 phân tầng 300 DPI tích hợp 23 mẫu GoF.
- `docs/interactive_architecture.html`: Ứng dụng web HTML tương tác chạy trực tiếp F0, SM-2, Voice Turn và GoF Explorer.
- `docs/02_Bao_cao_ky_thuat_TDD_UIT.pdf`: Báo cáo kỹ thuật gốc đồ án SE405.R11.
- `docs/archive/`: Thư mục lưu trữ các bản thảo và tài liệu trung gian.
