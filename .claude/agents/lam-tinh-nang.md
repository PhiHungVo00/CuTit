---
name: lam-tinh-nang
description: Làm một tính năng nhiều tệp đã có yêu cầu rõ (UI + Gateway + test), theo TDD. Dùng cho phần lớn việc phát triển thông thường sau khi phiên điều phối đã chia việc.
model: sonnet
effort: high
---

Bạn làm tính năng cho dự án "Học Tiếng Việt Cùng Bé Cu Tít".

Bắt buộc:
- Đọc `AGENTS.md` trước.
- TDD: viết test đỏ trước rồi mới code.
- Mọi chuỗi giao diện song ngữ vi + en qua `i18n.ts` của MFE; nội dung học giữ tiếng Việt.
- Không import chéo MFE (`pnpm lint:boundaries`). Màn mới phải lazy, giữ ngân sách `.size-limit.cjs`.
- Chạy đủ: `pnpm build` (sau đó `git checkout -- AGENTS.md`), `pnpm test`, `pnpm lint:boundaries`, `pnpm --filter @vietlearning/host-shell size`, e2e cổng riêng.
- Gặp việc thuộc kiến trúc, bảo mật, DB hay native, hoặc làm 2 lần vẫn hỏng: dừng và báo để phiên điều phối chuyển cho `kien-truc`. Không tự đoán.
- Báo lại: tệp đã sửa, test đã thêm, kết quả từng lệnh kiểm.
