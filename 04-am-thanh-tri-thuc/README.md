# 04 — Âm thanh & Tri thức

**Chủ sở hữu:** @NGUOI-4

## Gồm gì

- `apps/mfe-speech-lab`: Pitch Visualizer (M2), Dialect Switcher (M6).
- `apps/mfe-knowledge`: Ma trận xưng hô (M3), Cẩm nang văn hóa (M10).
- `packages/audio-dsp`: F0 YIN, DTW (thuật toán A1, A2).
- `packages/content`: kho nội dung JSON (xưng hô, phương ngữ, văn hóa, bài học) — gói dùng chung.
Phần Gateway tương ứng (giọng nói, chấm phát âm, TTS/STT, âm thanh dựng sẵn) nằm ở `01-nen-tang/apps/gateway` — xem CODEOWNERS.

## Chạy riêng phần của mình

Chạy từ **gốc repo** (một workspace pnpm, dùng `corepack pnpm`):

```powershell
corepack pnpm --filter "./04-am-thanh-tri-thuc/**" build
corepack pnpm --filter "./04-am-thanh-tri-thuc/**" test
corepack pnpm --filter @vietlearning/audio-dsp test
```

## Lưu ý

`packages/content` là ngoại lệ dùng chung: sửa phải báo các thư mục đang dùng. Dựng âm thanh khóa học: skill `dung-am-thanh`.

Quy ước, bản đồ 4 thư mục và cách phụ thuộc chéo: [docs/CAU-TRUC-4-THU-MUC.md](../docs/CAU-TRUC-4-THU-MUC.md).
