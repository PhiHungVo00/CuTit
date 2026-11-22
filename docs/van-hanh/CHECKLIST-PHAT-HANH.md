# Checklist phát hành (AI và quyền riêng tư) — BẢN NHÁP

> Soạn 21/11/2026 (dự án 2 Task 8). Việc phát hành công khai đang hoãn; dùng danh sách này khi tới lúc. Không tự triển khai production.

## A. Build release
- [ ] `VITE_GATEWAY_URL` trỏ `https://…` (không `http://`, không `localhost`); Android release chặn HTTP thường.
- [ ] `pnpm build`, `pnpm test`, `pnpm lint:boundaries`, `pnpm size` đạt; `git checkout -- AGENTS.md` nếu turbo tự sửa.
- [ ] Keystore ký release có (hoãn), `versionCode` tăng.

## B. Thử một lượt chat thật trên bản release
- [ ] Gateway phát hành có ít nhất một khóa AI trong biến môi trường server (không trong app).
- [ ] Cài APK release lên máy thật hoặc AVD, mở bong bóng Cu Tít, **nhắn một câu chữ** ⇒ có trả lời, không báo lỗi; dòng phụ “Còn N lượt”.
- [ ] Header `x-ai-provider` của lượt đó đúng nhà cung cấp dự kiến (xem log Gateway `AI source answered`).
- [ ] Lần đầu bấm 🎤/📷/📞/📹 thấy hộp “Quyền khi nói chuyện với Cu Tít” với đủ tên nhà cung cấp.

## C. Pháp lý (người dùng điền — AI không tự điền)
- [ ] Tên và email người phụ trách ở mục “Liên hệ” của `/quyen-rieng-tu` (`apps/host-shell/src/privacyI18n.ts` khóa `contact1`) — hiện còn `[Cần điền]`.
- [ ] Thời gian lưu nhật ký máy chủ (`collect6`), gói + điều khoản Gemini/Groq/OpenRouter (`ai3`).
- [ ] URL công khai của chính sách và URL yêu cầu xóa tài khoản trên Play Console.
- [ ] Tư cách pháp lý bên kiểm soát dữ liệu, nhân sự bảo vệ dữ liệu, ngày bắt đầu chuyển dữ liệu ra nước ngoài (nộp hồ sơ trong 60 ngày) — `docs/phap-ly/DANH-GIA-TAC-DONG.md` mục C.
- [ ] Khai Data safety theo `docs/phap-ly/DATA-SAFETY.md` mục 4.
