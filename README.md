# 🌟 Học Tiếng Việt Cùng Bé Cu Tít (Agentic Vietnamese Learning)
> **Đồ án môn học:** Chuyên đề Mobile and Pervasive Computing (SE405.R11)  
> **Trường:** Đại học Công nghệ Thông tin – ĐHQG-HCM (UIT)

---

## 🏛️ 1. Cấu Trúc Monorepo

Hệ thống được tổ chức theo mô hình **Turborepo + PNPM Workspaces**, chia thành **4 thư mục cấp một** (mỗi thành viên nhóm sở hữu một thư mục, vẫn là MỘT workspace pnpm; xem [docs/CAU-TRUC-4-THU-MUC.md](docs/CAU-TRUC-4-THU-MUC.md)):

```text
├── 01-nen-tang/             # Nền tảng (người dùng sở hữu): khung app + Gateway + gói lõi
│   ├── apps/host-shell/     # Host Shell: ghép MFE lúc build, lazy theo route, PWA offline, Capacitor
│   ├── apps/gateway/        # SaaS Gateway Backend (Fastify, Zod, Drizzle)
│   ├── apps/landing/        # Trang giới thiệu
│   └── packages/            # contracts, shared, state, api-client, ui, native
├── 02-hoi-thoai-ai/         # Hội thoại & AI
│   ├── apps/                # mfe-conversation (Chat, Roleplay), mfe-vision (Camera AR)
│   └── packages/prompts/    # Lắp ráp Prompt Bé Cu Tít đa tầng (PromptBuilder)
├── 03-hoc-tap/              # Học tập
│   ├── apps/                # mfe-path (Lộ trình), mfe-practice (Luyện tập, Ghép câu), mfe-learner (Phân tích, Onboarding, Cài đặt)
│   └── packages/exercises/  # Bài tập dùng chung
├── 04-am-thanh-tri-thuc/    # Âm thanh & Tri thức
│   ├── apps/                # mfe-speech-lab (Thanh điệu, Phương ngữ), mfe-knowledge (Xưng hô, Văn hóa)
│   └── packages/            # audio-dsp (YIN F0, DTW), content (Xưng hô, Phương ngữ, Kịch bản)
└── docs/                    # Tài liệu (bản đồ 4 thư mục: docs/CAU-TRUC-4-THU-MUC.md)
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
cp .env.example 01-nen-tang/apps/gateway/.env

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
- Cấu hình nằm ở `01-nen-tang/apps/gateway/.env` (được nạp qua dotenv và kiểm tra bằng Zod khi khởi động).
- `CORS_ORIGIN` là danh sách origin được phép; không chấp nhận `*`.
- Production bắt buộc `JWT_SECRET`; môi trường dev mặc định cho phép khách ẩn danh (`AUTH_REQUIRED=false`).

---

## 📚 4. Tài Liệu Kỹ Thuật Tham Khảo (Trong thư mục `docs/`)
- `docs/Bao_Cao_Thiet_Ke_Kien_Truc_Toan_Dien_TDD_UIT.docx`: Tài liệu đặc tả kiến trúc chuẩn (Master TDD) gồm đầy đủ 16 mục theo chuẩn quốc tế ASD-STE100.
- `docs/diagram_architecture_gof.png`: Sơ đồ kiến trúc 3 phân tầng 300 DPI tích hợp 23 mẫu GoF.
- `docs/interactive_architecture.html`: Ứng dụng web HTML tương tác chạy trực tiếp F0, SM-2, Voice Turn và GoF Explorer.
- `docs/02_Bao_cao_ky_thuat_TDD_UIT.pdf`: Báo cáo kỹ thuật gốc đồ án SE405.R11.
- `docs/archive/`: Thư mục lưu trữ các bản thảo và tài liệu trung gian.
