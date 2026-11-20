---
name: chup-man-hinh-app
description: Chạy bản web của Bé Cu Tít với Gateway thật trên máy và chụp màn hình từng màn (khung Pixel 7, vi hoặc en, sáng/tối) bằng Playwright — cho slide, báo cáo, tài liệu, hoặc để xem nhanh giao diện sau khi sửa.
---

# Chụp màn hình app

1. **Build** (cổng riêng cho mỗi phiên, ví dụ Gateway 4024 và UI 4195):
   - `pnpm install && pnpm --filter @vietlearning/gateway... build`
   - `VITE_GATEWAY_URL=http://localhost:4024 pnpm --filter @vietlearning/host-shell build`
   - Sau đó chạy `git checkout -- AGENTS.md`.
2. **Gateway:** `node apps/gateway/dist/index.js` với `PORT=4024 HOST=localhost PGLITE_DIR=memory:// CORS_ORIGIN=http://localhost:4195 NODE_ENV=development`.
   - Không đặt `BECUTIT_ENV_FILE`: Gateway tự đọc khóa Gemini ở `%USERPROFILE%\.becutit\gateway.env`, nên AI có kết quả thật. Gói miễn phí có hạn mức, dùng ít lượt.
   - Muốn tắt AI thì đặt `GEMINI_API_KEY=` và `BECUTIT_ENV_FILE=e2e-khong-co-tep.env`.
3. **UI:** trong `apps/host-shell` chạy `npx vite preview --port 4195 --strictPort`. Ghi PID cả hai tiến trình.
4. **Chụp** bằng script Playwright (`@playwright/test` có sẵn, `channel: 'chrome'`, viewport 412×915, `locale: 'vi-VN'` hoặc `'en-US'`).
   - Muốn ảnh có dữ liệu thật (XP, chuỗi ngày, huy hiệu) thì học vài bài trước. Dùng lại các helper trong `apps/host-shell/e2e/lesson-helpers.ts`.
   - Giao diện sáng: đặt `localStorage['becutit.theme'] = 'light'` qua `addInitScript`.
   - Route chính nằm trong `apps/host-shell/src/routes.tsx`.
5. **Xem nhanh một màn** thì có thể dùng trình duyệt tích hợp của app (`mcp__Claude_Browser__*`) với chế độ mobile, thay cho script.
6. Lưu ảnh vào thư mục tài liệu tương ứng (ví dụ `docs/slide-tinh-nang/anh/`). Dừng tiến trình theo đúng PID.
