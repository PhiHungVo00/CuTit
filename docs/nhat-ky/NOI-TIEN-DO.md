# Nhật ký: Nối tiến độ GĐ0 ↔ GĐ1 (nhánh claude/noi-tien-do-159c6c)

Plan: `docs/superpowers/plans/2026-11-18-noi-tien-do.md`.

| Commit | Việc | Kiểm chứng |
|---|---|---|
| 0a3dc31 | Contract `day.mark`, `progress.set`, snapshot `dayFlags`/`progressState`; migration 0001 (`learner_progress`, `deleted_accounts` = bia mộ băm credential 90 ngày); refresh/recover trả `account_deleted`; streak server tính ngày đóng băng | gateway 54/54 |
| 695ed63 | Engine sync: bóng thứ hai cho `becutit.progress` (xp.add theo delta ngày, lesson.progress, testout:<unit>, day.mark, progress.set); áp snapshot vào progressStore; resetLocal xóa cả tiến độ + `onLocalReset` | state 35/35 (+8) |
| 6eafd2c | Session: `account_deleted` ⇒ xóa phiên, phát `remote-deleted`, ném lỗi (không tạo khách mới trong cùng lần gọi); Host xóa dữ liệu + hủy nhắc + thông báo song ngữ (`becutit.notice`) | api-client 14/14 |
| (commit này) | Trang `/quyen-rieng-tu` song ngữ (BẢN NHÁP), link từ M12; e2e `progress-sync.spec.ts` | e2e mới 3/3 (cổng 4020/4193) |

| (commit sửa) | CSS toàn app vượt 28 B (7.53/7.5 kB) do kiểu trang chính sách ⇒ chuyển kiểu vào chunk lazy của trang (inline style) | CSS 7.42/7.5 kB; JS tải đầu 67.98/68.5 kB |

## Kiểm tra toàn bộ (2026-11-18, trên commit cuối)
- `pnpm build` 19/19; `pnpm test` 35/35 tác vụ, **246 test** (gateway 54, state 35, api-client 14, content 22, contracts 10, audio-dsp 12, ui 8, exercises 23, mfe-path 19, mfe-knowledge 18, mfe-conversation 9, mfe-learner 9, mfe-practice 7, host-shell 3, mfe-vision 2, mfe-speech-lab 1).
- `pnpm lint:boundaries`: 0 vi phạm (294 module). size-limit: mọi mục đạt.
- e2e (Gateway thật PGlite, cổng 4020/4193): **62 passed, 6 skipped, 1 failed** — test đo hiệu năng `@perf` "mở M3 < 1.5 s" ra 3252 ms khi máy đang tải CPU 73% (phiên khác). Chạy lại riêng: nhánh 1225/1078/1062 ms (đạt 3/3); `main` (fa16cd9) cùng lúc 2396/1305 ms ⇒ nhiễu do máy, không phải hồi quy.

## Chưa làm / ghi chú
- (ĐÃ LÀM ở `VIEC-SOT.md` mục 3) Link từ hộp đồng ý micro: nằm ở `apps/mfe-conversation/src/chat/ChatPanel.tsx` (vùng GĐ3) ⇒ không sửa; GĐ3 cần thêm `<Link to="/quyen-rieng-tu">`.
- Không đồng bộ: `times` từng bài, giờ nhắc, lỗi gần đây, điểm thanh. `lessonsDone/freezes/dailyGoal` là LWW (hai máy cùng học có thể lệch số bài).
- Ghi chú bàn giao cho GĐ3 (link chính sách trong hộp đồng ý micro): `side-session-notes/.../NOI-TIEN-DO-ghi-chu-cho-GD3.md`.
- Thông tin liên hệ trong chính sách là chỗ trống cần điền; cần người phụ trách duyệt.
