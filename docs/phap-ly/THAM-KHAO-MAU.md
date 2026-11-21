# Nguồn đã tham khảo cho chính sách quyền riêng tư và hộp đồng ý (dự án 2, Task 8)

> Ngày tra: 21/11/2026. Quy tắc dự án (AGENTS.md mục 6): chỉ chép code MIT/Apache/BSD/ISC; văn bản pháp lý **tự viết lại**, không chép.
> **Kết quả: không chép dòng mã hay đoạn văn nào từ nguồn ngoài.** Chỉ lấy ý (cấu trúc, câu hỏi cần trả lời). Không thêm thư viện nào.

| Nguồn | Dùng để | Ghi chú |
|---|---|---|
| Trợ giúp Play Console “Data safety” — `support.google.com/googleplay/android-developer/answer/10787469` | Định nghĩa *thu thập*, *chia sẻ*, *xử lý tạm thời*, *nhà cung cấp dịch vụ* | Xử lý tạm thời = chỉ giữ trong bộ nhớ, không lâu hơn mức cần cho yêu cầu. Chuyển cho nhà cung cấp xử lý thay mặt mình theo chỉ dẫn **không** tính là “chia sẻ”. Dữ liệu gửi ra khỏi máy vẫn phải khai dù xử lý tạm thời. Đã đưa vào `DATA-SAFETY.md`. |
| Tài liệu Groq “Your data” — `console.groq.com/docs/your-data` | Biết Groq có chế độ Zero Data Retention bật được ở cài đặt tài khoản | Một nguồn thứ ba nói mặc định lưu 30 ngày khi không bật ZDR — **chưa kiểm chứng**, ghi vào mục cần điền. |
| Tài liệu OpenRouter “Privacy, Logging” và “ZDR” — `openrouter.ai/docs/guides/privacy/logging`, `…/zdr` | Biết OpenRouter chuyển tiếp tới nhà vận hành mô hình khác; có thể ép chỉ chọn điểm cuối ZDR; mô hình miễn phí có thể bị dùng huấn luyện tùy nhà vận hành | Chính sách ghi “bên thứ ba xử lý thêm”. Khi phát hành nên đặt cờ ZDR/không-huấn-luyện nếu OpenRouter còn trong chuỗi. |
| Luật BVDLCN 91/2025/QH15, NĐ 356/2025/NĐ-CP | Cơ sở đồng ý, chuyển dữ liệu ra nước ngoài | Đã tra từ 19/11/2026, chi tiết và mức chắc chắn ở `DANH-GIA-TAC-DONG.md` mục 0. **Không** tra lại lần này (không có nguồn mới); vẫn cần đối chiếu Công báo. |
| Thư viện hộp đồng ý React: `react-cookie-consent-popup` (MIT), `@c15t/react` (**GPL-3.0 ⇒ loại**), `@silverassist/consent-banner` (**PolyForm Noncommercial ⇒ loại**), `react-hook-consent` (MIT) — qua tìm kiếm web, **chưa mở repo kiểm giấy phép** | Chỉ lấy ý: `role="dialog"` + `aria-modal` + `aria-labelledby`, công tắc có tên truy cập được, nút xác nhận không tick sẵn | Đều là hộp **cookie** (không khớp: ở đây là quyền micro/camera + tên nhà cung cấp AI), nên **không cài thư viện nào** (giữ gói đầu ≤ 67,5 kB). Hộp đồng ý thuộc Task 5 (phiên chat, `mfe-conversation`), phần host chỉ link tới `/quyen-rieng-tu`. |

## Điều tra chưa làm được
- Chưa thấy văn bản chính thức của Google về việc dữ liệu gửi cho Gemini API gói miễn phí có dùng huấn luyện hay không **tại thời điểm phát hành** — phải đọc lại điều khoản Gemini API khi chọn gói.
- Chưa có mẫu chính sách quyền riêng tư cụ thể cho “app học ngôn ngữ dùng AI có thu âm/ảnh” theo NĐ 356 giấy phép cho phép chép; chính sách được viết lại từ bản 19/11/2026 của dự án và các định nghĩa ở trên.
