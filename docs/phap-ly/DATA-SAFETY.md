# Khai báo Google Play — mục An toàn dữ liệu (Data safety) — BẢN NHÁP

> Dùng khi đưa app lên Google Play (việc phát hành đang hoãn). Đối chiếu mã nguồn ngày 19/11/2026 — **khai lại nếu mã đổi** (thêm SDK, thêm bảng, đổi nhà cung cấp AI).
> Cách hiểu thuật ngữ theo trang trợ giúp Play Console “Provide information for Google Play's Data safety section” (`support.google.com/googleplay/android-developer/answer/10787469`) — **đọc lại bản hiện hành khi khai**, vì Google thay đổi định nghĩa theo thời gian:
> - **Collected (thu thập)** = dữ liệu được gửi ra khỏi thiết bị (kể cả tới máy chủ của chính mình). Dữ liệu chỉ ở trên máy thì không phải khai.
> - **Shared (chia sẻ)** = chuyển cho bên thứ ba. **Không** tính là chia sẻ khi chuyển cho **nhà cung cấp dịch vụ xử lý thay mặt mình** theo chỉ dẫn của mình (service provider) ⇒ Google Gemini xử lý nội dung cho app ⇒ “không chia sẻ”, nhưng phải liệt kê là “thu thập”.
> - **Processed ephemerally (xử lý tạm thời)** = chỉ giữ trong bộ nhớ đủ để phục vụ yêu cầu, không lưu.
> - **Optional** = người dùng dùng được app mà không cần cung cấp.

## 1. Tổng quan (trang đầu của biểu mẫu)

| Câu hỏi | Trả lời | Căn cứ trong mã |
|---|---|---|
| App có thu thập hoặc chia sẻ loại dữ liệu người dùng bắt buộc khai không? | **Có** | đồng bộ `/v1/sync`, gửi nội dung tới `/v1/chat`, `/v1/vision/label`, `/v1/speech/*` |
| Mọi dữ liệu thu thập có được mã hóa khi truyền không? | **Có** — HTTPS. Android release chặn HTTP thường (`network_security_config` chỉ cho phép ở bản debug) | `apps/host-shell/android/app/src/debug/` |
| Người dùng có cách yêu cầu xóa dữ liệu không? | **Có** — trong app: Tùy chỉnh → Xóa tài khoản (xóa ngay, `DELETE /v1/me`). Play còn yêu cầu **một đường link web** để yêu cầu xóa tài khoản cho app có tạo tài khoản: `[CẦN ĐIỀN: URL trang yêu cầu xóa — có thể là trang /quyen-rieng-tu của bản web + email liên hệ]` | `apps/mfe-learner/src/preferences/AccountSection.tsx` |
| Đã cam kết theo chính sách Families? | Không nhắm tới trẻ em (đã gỡ chế độ trẻ em) — nhóm tuổi mục tiêu `[CẦN ĐIỀN: 13+ hoặc 18+]` | |
| Đánh giá bảo mật độc lập (MASA)? | Không | |

## 2. Loại dữ liệu

| Nhóm Play | Loại Play | Thu thập? | Chia sẻ? | Xử lý tạm thời? | Bắt buộc/Tùy chọn | Mục đích (theo danh mục Play) | Ghi chú |
|---|---|---|---|---|---|---|---|
| Personal info | **Name** | Có | Không | Không | Tùy chọn | App functionality | Tên hiển thị tự đặt cho Bạn học (Play coi biệt danh là “Name”); chỉ bạn đã kết bạn thấy |
| Personal info | **User IDs** | Có | Không | Không | Bắt buộc | App functionality, Account management | UUID ngẫu nhiên của tài khoản khách; không email/SĐT |
| Personal info | Email, Phone, Address, … | Không | — | — | — | — | |
| Location | Approximate / Precise | Không | — | — | — | — | IP chỉ dùng cho giới hạn tần suất, không suy ra vị trí |
| Audio | **Voice or sound recordings** | Có | Không | **Có** (Gateway không lưu) | Tùy chọn (hỏi đồng ý `voice`) | App functionality | Gửi tới Google Gemini để chuyển thành chữ/chấm phát âm |
| Photos and videos | **Photos** | Có | Không | **Có** | Tùy chọn (hỏi đồng ý `camera`) | App functionality | Ảnh ≤ 640 px gửi tới Google Gemini để nhận diện đồ vật |
| Messages | Other in-app messages | Không | — | — | — | — | App không có nhắn tin giữa người dùng |
| App activity | **App interactions** | Có | Không | Không | Bắt buộc | App functionality, Analytics (cho chính người học: thống kê tiến độ) | Kết quả bài làm, thời gian học, XP, tiến độ bài, huy hiệu, thẻ ôn |
| App activity | **Other user-generated content** | Có | Không | **Có** | Tùy chọn | App functionality | Tin nhắn với gia sư AI, câu hỏi văn hóa — gửi tới Gemini, không lưu ở Gateway |
| App activity | In-app search history, Installed apps, Other actions | Không | — | — | — | — | Tìm kiếm trong Cẩm nang văn hóa chạy trên máy |
| App info and performance | Crash logs, Diagnostics | `[CẦN ĐIỀN]` | Không | — | — | — | Hiện không có SDK báo lỗi. Nhật ký máy chủ (thời gian, đường dẫn, IP) — Play không có loại “IP”; nếu hosting lưu log lâu dài, cân nhắc khai “Diagnostics” |
| Device or other IDs | | Không | — | — | — | — | Không dùng Advertising ID |
| Financial, Health, Contacts, Calendar, Files, Web browsing | | Không | — | — | — | — | |

Không khai “Advertising or marketing”, “Personalization” cho bên thứ ba, “Fraud prevention” (giới hạn tần suất là bảo vệ dịch vụ, nếu muốn chặt chẽ có thể thêm “Fraud prevention, security, and compliance” cho User IDs).

## 3. Mâu thuẫn cần tránh
- Nội dung khai phải **khớp** chính sách quyền riêng tư (`apps/host-shell/src/privacyI18n.ts`) và link chính sách trên Play: `[CẦN ĐIỀN: URL công khai của chính sách]`.
- Nếu sau này thêm Firebase/Crashlytics/Analytics, **phải** khai lại (SDK đó thu thập Device IDs, Crash logs…).
- Nếu bật TTS bằng Gemini (`TTS_PROVIDER=gemini`), văn bản bài học (không phải dữ liệu người dùng) được gửi đi — không phải khai.
- Nếu đổi nhà cung cấp AI (Nguyên tắc 4) thì cập nhật cả chính sách, hồ sơ `DANH-GIA-TAC-DONG.md` mục B (bên nhận mới) và mục này.
