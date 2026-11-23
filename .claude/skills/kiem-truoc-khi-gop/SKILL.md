---
name: kiem-truoc-khi-gop
description: Quy trình kiểm bắt buộc trước khi gộp một nhánh/PR vào main của dự án Bé Cu Tít — build, test, ranh giới MFE, ngân sách bundle, e2e, CI, emulator khi đụng native, nhật ký. Dùng mỗi khi sắp merge, đẩy lên main, hoặc khi người dùng hỏi "gộp được chưa".
---

# Kiểm trước khi gộp

Chỉ gộp khi **mọi bước** đạt. Bước nào đỏ thì phân biệt nhiễu (chạy lại 2–3 lần, so với main) và lỗi thật. Không nới **ngân sách hiệu năng** (LCP, TBT, gói đầu JS, thời gian phản hồi một lần chạm) hay timeout để cho qua.
Ngân sách không ảnh hưởng hiệu năng thật (ví dụ vài trăm byte CSS vượt trần do máy Linux đo khác Windows) thì **được nâng bình thường** (người dùng chốt 23/11/2026): nâng vừa đủ, ghi lý do trong `.size-limit.cjs` và dòng nhật ký.

1. **Cập nhật nhánh theo main** (`git fetch && git merge origin/main`). Gỡ xung đột:
   - Nhật ký `docs/NHAT_KY_CHUYEN_DOI_MOBILE.md`: giữ cả hai dòng, đánh số lại, dòng mới nhất ở trên.
   - Migration trùng số (`01-nen-tang/apps/gateway/drizzle/`): xóa migration và snapshot của nhánh vào sau, lấy journal của main, chạy `pnpm --filter @vietlearning/gateway db:generate --name <ten>`, so SQL với bản gốc.
   - `.size-limit.cjs`, `app.ts`, `contracts/api/index.ts`: giữ mục của cả hai bên.
2. `pnpm install`, rồi `pnpm build` (19/19). Ngay sau đó chạy **`git checkout -- AGENTS.md`**: turbo tự sửa tệp này (R13), không commit thay đổi đó.
3. `pnpm test` (35/35 task), `pnpm lint:boundaries` (0 vi phạm).
4. `VITE_GATEWAY_URL=http://localhost:<cổng GW> pnpm --filter @vietlearning/host-shell build`, rồi `pnpm --filter @vietlearning/host-shell size`. Không mục nào "exceeded".
5. e2e trong `01-nen-tang/apps/host-shell`: `E2E_PORT=<cổng UI> E2E_GATEWAY_PORT=<cổng GW> npx playwright test --reporter=line`. Mỗi phiên dùng **cổng riêng** để không đụng phiên khác.
6. **Đụng native/khởi động/tài khoản/đồng bộ/camera/micro** ⇒ chạy skill `thu-tren-emulator`.
6b. **Plugin và công cụ** (người dùng bật 20/11; Axe gỡ 22/11):
   - **code-review**: chạy review nhiều agent trên PR/diff trước khi gộp. Chỉ sửa phát hiện có độ tin cậy cao; phát hiện còn nghi ngờ thì ghi vào PR.
   - **Trợ năng (miễn phí, không dùng plugin Axe trả phí — gỡ 22/11)**: PR có đổi giao diện thì
     (1) `npx playwright test a11y` (e2e/a11y.spec.ts, `@axe-core/playwright` mã nguồn mở, WCAG 2.0–2.2 A+AA gồm vùng chạm, 8 màn × sáng/tối × 2 cỡ) phải 0 vi phạm serious/critical — màn mới thì thêm vào `SCREENS`;
     (2) Lighthouse a11y giữ 100 (`pnpm --filter @vietlearning/host-shell perf`).
     (Nguyên tắc UI/UX `docs/thiet-ke/NGUYEN-TAC-UI-UX.md` dùng ở khâu thiết kế, không phải bước kiểm này.)
   - **Android Emulator QA**: dùng kèm skill `thu-tren-emulator` để chụp màn hình, xem UI và lấy logcat.
   - **Playwright MCP**: xem nhanh hoặc chụp màn hình trong trình duyệt. e2e chính thức vẫn chạy bằng `@playwright/test` của repo.
   - **Security review**: plugin tự cảnh báo khi sửa code và khi commit. Cảnh báo nào đụng auth/Gateway thì chuyển cho `kien-truc` xem.
7. Đẩy nhánh, mở draft PR, chờ CI: `verify` phải xanh; `performance` không chặn merge, nhưng đỏ thì phải biết là nhiễu hay thật.
8. Ghi một dòng vào đầu bảng nhật ký: việc gì, xung đột gì, số đo từng bước.
9. Gộp (`gh pr ready` + `gh pr merge --merge`), rồi fast-forward nhánh làm việc và checkout gốc (`git merge --ff-only origin/main`).

**Không bao giờ** gộp nhánh của phiên khác khi người dùng chưa đồng ý rõ ràng.
