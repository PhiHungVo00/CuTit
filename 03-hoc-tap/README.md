# 03 — Học tập

**Chủ sở hữu:** @NGUOI-3

## Gồm gì

- `apps/mfe-path`: Lộ trình học.
- `apps/mfe-practice`: Luyện tập thích ứng (M5), Ghép câu (M8).
- `apps/mfe-learner`: Phân tích học tập (M9), Onboarding (M11), Cài đặt (M12).
- `packages/exercises`: các khối bài tập dùng chung (cũng được `mfe-speech-lab` dùng).
Phần Gateway tương ứng (tiến độ, bài tập, luyện tập, xếp lớp) nằm ở `01-nen-tang/apps/gateway` — xem CODEOWNERS.

## Chạy riêng phần của mình

Chạy từ **gốc repo** (một workspace pnpm, dùng `corepack pnpm`):

```powershell
corepack pnpm --filter "./03-hoc-tap/**" build
corepack pnpm --filter "./03-hoc-tap/**" test
corepack pnpm --filter @vietlearning/mfe-practice test
```

## Lưu ý

`packages/exercises` là ngoại lệ dùng chung: sửa phải báo `04-`. Chỉ phụ thuộc vào `01-nen-tang` ngoài ra.

Quy ước, bản đồ 4 thư mục và cách phụ thuộc chéo: [docs/CAU-TRUC-4-THU-MUC.md](../docs/CAU-TRUC-4-THU-MUC.md).
