# 02 — Hội thoại & AI

**Chủ sở hữu:** @NGUOI-2

## Gồm gì

- `apps/mfe-conversation`: Chat Canvas (M1), Roleplay (M7).
- `apps/mfe-vision`: Camera AR (M4).
- `packages/prompts`: thư viện Prompt có phiên bản cho Bé Cu Tít (PromptBuilder).
Phần Gateway tương ứng (chat, gia sư, vision, LLM) nằm ở `01-nen-tang/apps/gateway` — xem CODEOWNERS.

## Chạy riêng phần của mình

Chạy từ **gốc repo** (một workspace pnpm, dùng `corepack pnpm`):

```powershell
corepack pnpm --filter "./02-hoi-thoai-ai/**" build
corepack pnpm --filter "./02-hoi-thoai-ai/**" test
corepack pnpm --filter @vietlearning/mfe-conversation test
```

## Lưu ý

Chỉ phụ thuộc vào `01-nen-tang` (và gói dùng chung `content`, `exercises` nếu cần). Không import MFE khác.

Quy ước, bản đồ 4 thư mục và cách phụ thuộc chéo: [docs/CAU-TRUC-4-THU-MUC.md](../docs/CAU-TRUC-4-THU-MUC.md).
