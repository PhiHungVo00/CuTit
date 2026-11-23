# 01 — Nền tảng

**Chủ sở hữu:** @NGUOI-1 (chủ dự án)

## Gồm gì

Khung app và các gói lõi mà mọi thư mục khác dựa vào.
- `apps/host-shell`: khung app (ghép MFE lúc build, PWA, Capacitor Android, tài khoản khách, đồng bộ).
- `apps/gateway`: backend Fastify + Drizzle (auth, đồng bộ, hạn mức, AI/STT/TTS qua adapter). Chia quyền theo chức năng ở `.github/CODEOWNERS`.
- `apps/landing`: trang giới thiệu.
- `packages/contracts` (Zod + schema DB), `shared`, `state`, `api-client`, `ui`, `native`.

## Chạy riêng phần của mình

Chạy từ **gốc repo** (một workspace pnpm, dùng `corepack pnpm`):

```powershell
corepack pnpm --filter "./01-nen-tang/**" build
corepack pnpm --filter "./01-nen-tang/**" test
corepack pnpm --filter @vietlearning/gateway dev          # Gateway (dev dùng PGlite, không cần Postgres)
corepack pnpm --filter @vietlearning/host-shell dev       # khung app
```

## Lưu ý

Là người tích hợp: host-shell import mọi MFE, Gateway dùng `prompts`, `content`, `audio-dsp`. e2e và APK nằm ở `apps/host-shell` (xem `AGENTS.md` mục 4).

Quy ước, bản đồ 4 thư mục và cách phụ thuộc chéo: [docs/CAU-TRUC-4-THU-MUC.md](../docs/CAU-TRUC-4-THU-MUC.md).
