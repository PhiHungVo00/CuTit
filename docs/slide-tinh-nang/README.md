# Bộ slide tính năng “Học Tiếng Việt Cùng Bé Cu Tít”

- `anh/`: ảnh màn hình thật (Pixel 7, 412×915) và `manifest.json` (ảnh nào chụp được, ghi chú).
- `bo-slide/project/`: nguồn bộ slide (deck.json, deck.css, slides/*.html). Bản đã đăng là một Artifact “Slides” (xem link trong báo cáo); thư mục này là bản sao để giữ trong repo.
- `chup-anh.spec.ts`, `chup-anh.config.ts`: script chụp ảnh chính.
- `chup-huy-hieu.spec.ts`: chụp bổ sung khu Huy hiệu trên trang chủ.

## Chạy lại để chụp

Chạy từ gốc repo, PowerShell:

```powershell
pnpm install
pnpm --filter @vietlearning/gateway... build
$env:VITE_GATEWAY_URL = "http://localhost:4024"; pnpm --filter @vietlearning/host-shell build
git checkout -- AGENTS.md
```

Gateway (một cửa sổ riêng):

```powershell
$env:PORT="4024"; $env:HOST="localhost"; $env:PGLITE_DIR="memory://"; $env:CORS_ORIGIN="http://localhost:4195"; $env:NODE_ENV="development"; node apps/gateway/dist/index.js
```

Giao diện (cửa sổ khác, trong `apps/host-shell`):

```powershell
npx vite preview --port 4195 --strictPort
```

Chụp (từ gốc repo):

```powershell
pnpm --filter @vietlearning/host-shell exec playwright test --config=../../docs/slide-tinh-nang/chup-anh.config.ts
```

Gateway đọc khóa Gemini từ `%USERPROFILE%\.becutit\gateway.env`. Nếu hết lượt AI thì chat và nhập vai hiện lỗi hoặc trả lời mẫu; manifest và slide ghi chú điều đó.
