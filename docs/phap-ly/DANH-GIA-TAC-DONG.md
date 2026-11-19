# Hồ sơ đánh giá tác động xử lý dữ liệu cá nhân và chuyển dữ liệu cá nhân ra nước ngoài (BẢN NHÁP)

> **Ứng dụng:** Học Tiếng Việt Cùng Bé Cu Tít (Android, Capacitor 7) + Gateway (Fastify).
> **Trạng thái:** bản nháp kỹ thuật do nhóm dự án soạn ngày 19/11/2026. **Không phải tư vấn pháp lý.** Chỗ cần thông tin tổ chức ghi `[CẦN ĐIỀN]`.
> **Đối chiếu mã nguồn:** `packages/contracts/src/db/schema.ts`, `apps/gateway/src/providers/*`, `packages/state/src/sync.ts` (nhánh `claude/luat-moi-ux-3d9194`).
> Khi nộp thật, nội dung dưới đây được chép vào **Mẫu số 10** (đánh giá tác động xử lý) và **Mẫu số 09** (đánh giá tác động chuyển dữ liệu xuyên biên giới) trong Phụ lục Nghị định 356/2025/NĐ-CP, kèm Mẫu 02a/02b và 01a/01b.

---

## 0. Căn cứ pháp lý đã tra (19/11/2026)

Ký hiệu nguồn: **[NV]** = đã đọc nguyên văn trên bản sao trực tuyến (không phải Công báo); **[TT]** = chỉ từ bài tóm tắt của công ty luật/báo, chưa thấy nguyên văn. `vbpl.moj.gov.vn` không truy cập được, `thuvienphapluat.vn` chặn truy cập tự động → **trước khi nộp phải đối chiếu Công báo / vanban.chinhphu.vn.**

| Văn bản | Hiệu lực | Nội dung liên quan | Nguồn |
|---|---|---|---|
| Luật Bảo vệ dữ liệu cá nhân **91/2025/QH15** (thông qua 26/6/2025) | 01/01/2026 (Điều 38 k1) | Điều 4 quyền chủ thể; Điều 7 k6 cấm mua bán DLCN; Điều 9 sự đồng ý (k4d: *im lặng không phải là đồng ý*; đồng ý theo từng mục đích; kiểm chứng được); Điều 10 rút lại đồng ý; Điều 20 chuyển DLCN xuyên biên giới; Điều 21 đánh giá tác động xử lý; Điều 22 cập nhật hồ sơ; Điều 24 trẻ em; Điều 38 k2–3 miễn/ân hạn; Điều 39 chuyển tiếp từ NĐ 13/2023 | [NV] hethongphapluat.com |
| Nghị định **356/2025/NĐ-CP** (ký 31/12/2025) | 01/01/2026 (Điều 42 k1); **NĐ 13/2023/NĐ-CP hết hiệu lực** (Điều 42 k2) | Điều 4 DLCN nhạy cảm; Điều 5 thời hạn xử lý yêu cầu; Điều 13 nhân sự BVDLCN; Điều 17–20 hồ sơ; Điều 28–29 thông báo vi phạm; Điều 41 áp dụng Điều 38 Luật cho DN nhỏ/khởi nghiệp | [NV] luatvietnam.vn |
| Luật Trí tuệ nhân tạo **134/2025/QH15** (thông qua 10/12/2025) | 01/3/2026 | Hệ thống AI đưa vào dùng trước hiệu lực có 12 tháng (18 tháng với y tế, **giáo dục**, tài chính) để tuân thủ; NĐ 142/2026/NĐ-CP hướng dẫn | [TT] |
| Luật An ninh mạng **116/2025/QH15** (thông qua 10/12/2025) | 01/7/2026 (Điều 44); thay Luật ANM 24/2018/QH14 | — | [TT] |
| Nghị định **330/2026/NĐ-CP** xử phạt VPHC an ninh mạng & BVDLCN | ban hành 19/8/2026, hiệu lực ngay từ ngày ký | Phạt tối đa 3 tỷ đồng (vi phạm thông thường); vi phạm chuyển DLCN xuyên biên giới tới 5% doanh thu năm trước; mua bán DLCN tới 10 lần khoản thu; coi im lặng là đồng ý tới 70 triệu; không lập/nộp hồ sơ ĐGTĐ chuyển xuyên biên giới đúng hạn 30–50 triệu; không lập hồ sơ ĐGTĐ xử lý 20–30 triệu; không có quy trình xử lý yêu cầu chủ thể 10–20 triệu. Cá nhân = ½ mức tổ chức | [TT] Global Vietnam Lawyers, Legal alert 08/2026 |

### 0.1 Thời hạn và ân hạn — kết luận cho dự án

| Nghĩa vụ | Thời hạn | DN nhỏ / khởi nghiệp được chọn không làm trong 5 năm (tới 01/01/2031)? |
|---|---|---|
| Hồ sơ ĐGTĐ **xử lý** DLCN (Luật Điều 21; NĐ Điều 19, Mẫu 10) | lập từ khi bắt đầu xử lý, nộp **01 bản chính trong 60 ngày** kể từ ngày đầu xử lý | **Có** (Luật Điều 38 k2; NĐ Điều 41 k1) |
| Cập nhật hồ sơ (Luật Điều 22; NĐ Điều 20) | định kỳ **06 tháng** khi có thay đổi; trong **10 ngày** khi tổ chức lại/giải thể/đổi đơn vị dịch vụ BVDLCN/đổi ngành nghề | **Có** |
| Nhân sự/bộ phận BVDLCN (Luật Điều 33 k2; NĐ Điều 13: cao đẳng + 2 năm kinh nghiệm + đã đào tạo BVDLCN) | — | **Có** (theo Điều 38 k2 Luật; NĐ Điều 13 không tự ghi miễn) |
| Hồ sơ ĐGTĐ **chuyển DLCN xuyên biên giới** (Luật Điều 20; NĐ Điều 17–18, Mẫu 09) | nộp **01 bản chính trong 60 ngày** kể từ ngày đầu chuyển; lập 01 lần, cập nhật như trên | **KHÔNG** — Điều 20 không nằm trong danh sách Điều 38 k2. Các trường hợp không phải lập (NĐ Điều 17 k3: báo chí, dữ liệu đã công khai, khẩn cấp, nhân sự nội bộ, ký hợp đồng/vận chuyển/thanh toán/thị thực/học bổng) **không bao gồm** việc gửi nội dung người dùng tới nhà cung cấp AI nước ngoài |

**Ngoại lệ làm mất ân hạn** (Luật Điều 38 k2; NĐ Điều 41 k1 [NV]): doanh nghiệp kinh doanh dịch vụ xử lý DLCN, **trực tiếp xử lý DLCN nhạy cảm**, hoặc xử lý DLCN của từ **100.000 chủ thể** trở lên (tích lũy). Hộ kinh doanh, doanh nghiệp siêu nhỏ: không phải thực hiện Điều 21, 22, 33 k2 (không giới hạn 5 năm), cùng ngoại lệ.

**Áp dụng cho dự án:**
- Tư cách pháp lý bên kiểm soát dữ liệu: `[CẦN ĐIỀN: đồ án sinh viên / cá nhân / doanh nghiệp nhỏ / khởi nghiệp — có đăng ký kinh doanh chưa]`. Đồ án sinh viên **không phải** DN nhỏ/khởi nghiệp nên ân hạn Điều 38 có thể không áp dụng; khi phát hành công khai cần xác định lại.
- **Câu hỏi mở 1 — giọng nói có là “dữ liệu sinh trắc học” (nhạy cảm, NĐ Điều 4 k1đ) không?** App gửi bản ghi để *chuyển thành chữ và chấm phát âm*, không tạo/lưu đặc trưng nhận dạng giọng (voiceprint), máy chủ không lưu bản ghi. Nhóm nghiêng về “không phải sinh trắc học” nhưng **chưa có văn bản xác nhận**. Nếu bị coi là nhạy cảm: mất ân hạn, phải báo cho người dùng đó là dữ liệu nhạy cảm khi xin đồng ý (NĐ Điều 6 k4), và áp thời hạn thông báo vi phạm 72 giờ (NĐ Điều 29).
- **Câu hỏi mở 2 — NĐ Điều 4 k1l** (“dữ liệu theo dõi hành vi, hoạt động sử dụng … truyền thông trực tuyến”): thời gian học/kết quả bài làm là dữ liệu học tập phục vụ chính người học, không dùng để theo dõi quảng cáo. Nhóm nghiêng về “không thuộc” — **cần người có chuyên môn xác nhận**.
- **Việc phải làm dù có ân hạn hay không:** lập và nộp hồ sơ chuyển dữ liệu xuyên biên giới (mục B) **trong 60 ngày kể từ ngày đầu tiên gửi dữ liệu người dùng thật tới Gemini** (bản phát hành công khai đầu tiên). Ngày bắt đầu: `[CẦN ĐIỀN]`. Hạn nộp: `[CẦN ĐIỀN = ngày bắt đầu + 60 ngày]`.
- Hồ sơ đã được tiếp nhận theo NĐ 13/2023 trước 01/01/2026 được dùng tiếp (Luật Điều 39 k2) — **dự án chưa từng nộp**, nên không áp dụng.

---

## A. Hồ sơ đánh giá tác động XỬ LÝ dữ liệu cá nhân (theo NĐ 356 Điều 19 k3, Mẫu 10)

### A.a Thông tin các bên
| Vai trò | Thông tin |
|---|---|
| Bên kiểm soát và xử lý DLCN | `[CẦN ĐIỀN: tên tổ chức/cá nhân, địa chỉ, mã số (nếu có), người đại diện]` |
| Liên hệ về DLCN | `[CẦN ĐIỀN: tên, email, điện thoại]` (người dùng đã hoãn — chưa điền) |
| Bên xử lý (nhà cung cấp AI) | Google LLC — dịch vụ Gemini API. Văn bản ràng buộc: Điều khoản Gemini API / Google Cloud Data Processing Addendum `[CẦN ĐIỀN: gói dịch vụ, bản điều khoản, ngày chấp nhận]` |
| Hạ tầng máy chủ Gateway + Postgres | `[CẦN ĐIỀN: nhà cung cấp hosting, vị trí đặt máy chủ (trong/ngoài Việt Nam)]` — nếu đặt ngoài Việt Nam thì đây là thêm một luồng chuyển xuyên biên giới (Luật Điều 20 k1a) |

### A.b Nhân sự/bộ phận bảo vệ DLCN
`[CẦN ĐIỀN: họ tên, văn bản chỉ định, trình độ (≥ cao đẳng), kinh nghiệm (≥ 2 năm trong pháp chế/CNTT/an ninh mạng…), chứng nhận đào tạo BVDLCN]` — xem NĐ Điều 13.

### A.c Mục đích, loại dữ liệu, luồng dữ liệu
Không thu thập: tên thật, email, số điện thoại, giấy tờ, vị trí, danh bạ, định danh quảng cáo. Không có SDK thống kê/quảng cáo của bên thứ ba (đã kiểm tra `package.json` toàn monorepo ngày 19/11/2026).

| # | Dữ liệu | Bảng / nơi lưu | Mục đích | Cơ sở xử lý | Thời gian lưu |
|---|---|---|---|---|---|
| 1 | Mã người dùng ngẫu nhiên (UUID); băm mã khôi phục; băm refresh token | `users`, `refresh_tokens` | Đăng nhập, khôi phục trên máy khác | Cung cấp dịch vụ người dùng yêu cầu | Tới khi xóa tài khoản; refresh token hết hạn 90 ngày không dùng |
| 2 | Hồ sơ học (trình độ, mục tiêu, ngôn ngữ mẹ đẻ, phương ngữ), tùy chỉnh | `users`, `preferences` | Cá nhân hóa lộ trình, giọng đọc | như trên | Tới khi xóa tài khoản |
| 3 | Thẻ ôn SM-2, lượt làm bài, giây học & XP theo ngày, tiến độ bài, huy hiệu, sổ chống trùng đồng bộ | `srs_cards`, `attempts`, `daily_activity`, `xp_events`, `lesson_progress`, `learner_progress`, `achievements`, `sync_events` | Lặp lại ngắt quãng, thống kê cho chính người học, đồng bộ nhiều máy | như trên | Tới khi xóa tài khoản |
| 4 | Tên hiển thị tự đặt, mã mời (có hạn), quan hệ bạn học, mục tiêu chung | `social_profiles`, `friend_invites`, `friendships` | Tính năng bạn học (người dùng tự bật) | như trên | Tới khi hủy kết bạn/xóa tài khoản; mã mời tới khi hết hạn |
| 5 | Bản ghi đồng ý: khóa, **phiên bản nội dung**, thời điểm | `consents` | Chứng minh sự đồng ý (Luật Điều 9 k3) | Nghĩa vụ pháp lý | Tới khi rút lại (bản ghi bị xóa) hoặc xóa tài khoản |
| 6 | Bộ đếm lượt dùng AI theo ngày | `ai_usage` | Hạn mức công bằng, chống lạm dụng | Lợi ích chính đáng/cung cấp dịch vụ | Tới khi xóa tài khoản |
| 7 | Băm thông tin đăng nhập của tài khoản đã xóa | `deleted_accounts` | Báo cho máy khác biết tài khoản đã xóa | như trên | 90 ngày |
| 8 | Nhật ký máy chủ (thời gian, đường dẫn, IP) | log stdout của Fastify | Chống lạm dụng (giới hạn tần suất theo IP), sửa lỗi | Lợi ích chính đáng | `[CẦN ĐIỀN: theo cấu hình hosting]` |
| 9 | Nội dung chat, câu hỏi văn hóa, yêu cầu giải thích | chỉ đi qua Gateway → Gemini, **không lưu** | Gia sư AI, giải thích | Cung cấp dịch vụ người dùng yêu cầu | Không lưu ở Gateway |
| 10 | Ảnh Camera từ vựng (JPEG ≤ 640 px) | chỉ đi qua Gateway → Gemini, **không lưu** | Nhận diện đồ vật | **Đồng ý** khóa `camera` | Không lưu ở Gateway |
| 11 | Bản ghi giọng nói (WAV 16 kHz) | chỉ đi qua Gateway → Gemini, **không lưu** | Chuyển giọng nói thành chữ, chấm phát âm | **Đồng ý** khóa `voice` | Không lưu ở Gateway |

Luồng: Điện thoại (localStorage/Preferences) ⇄ HTTPS ⇄ Gateway (Fastify, JWT) ⇄ Postgres (dữ liệu 1–8); Gateway → Gemini API (dữ liệu 9–11, khóa API chỉ ở biến môi trường server — Nguyên tắc 2).

### A.d Cách xin đồng ý, lưu trữ, xóa
- Hộp hỏi riêng cho từng mục đích (giọng nói; ảnh), hiện **trước** khi ghi âm/mở camera/chọn ảnh. Không có ô đánh dấu sẵn; nút “Để sau” không ghi gì. Đồng ý → sự kiện `consent.grant {key, version, at}` → bảng `consents (user_id, key, version, granted_at)`: lưu **ai** (user_id), **lúc nào** (granted_at = thời điểm trên máy), **đồng ý nội dung gì** (version, tra ở Sổ đồng ý dưới đây).
- Rút lại: Tùy chỉnh → Quyền riêng tư → “Rút lại đồng ý” → `consent.revoke` → Gateway xóa bản ghi của khóa đó; ảnh chụp đồng bộ không còn khóa → máy khác cũng thôi coi là đã đồng ý.
  **Hạn chế đã biết:** schema chưa có cột thu hồi nên lịch sử “đã từng đồng ý rồi rút lại” không còn trong DB. Khi bảng `audit_events` (phiên song song) có, cần ghi thêm sự kiện thu hồi vào đó.
- Xóa tài khoản: `DELETE /v1/me` xóa ngay mọi bảng gắn `user_id` (cascade), máy hiện tại xóa dữ liệu cục bộ, máy khác tự xóa ở lần kết nối kế.

**Sổ đồng ý** (phiên bản nội dung, `packages/state/src/sync.ts` → `CONSENT_VERSIONS`):

| Khóa | Phiên bản | Nội dung người dùng đã đọc | Từ |
|---|---|---|---|
| `voice` | 1 | “Bản ghi âm được gửi qua máy chủ Bé Cu Tít tới dịch vụ AI Google Gemini để chuyển thành chữ. Máy chủ Bé Cu Tít không lưu bản ghi; Google xử lý theo chính sách của họ.” (bài nói ở bài học: “…tới dịch vụ nhận dạng giọng nói…”, không nêu tên Google) | 2026-11-16 |
| `voice` | 2 | v1 + nêu rõ Google Gemini ở mọi màn (cả bài nói), “máy chủ của Google có thể đặt ở ngoài Việt Nam”, “rút lại được trong Tùy chỉnh” | 2026-11-19 |
| `camera` | 1 | “Ảnh bạn chụp hoặc chọn được thu nhỏ rồi gửi qua máy chủ Bé Cu Tít tới dịch vụ AI Google Gemini để nhận diện đồ vật. Máy chủ Bé Cu Tít không lưu ảnh; máy chủ của Google có thể đặt ở ngoài Việt Nam. Tránh chụp mặt người hoặc giấy tờ cá nhân. Bạn rút lại đồng ý được bất cứ lúc nào trong Tùy chỉnh.” | 2026-11-19 |

Người đã đồng ý `voice` v1 trên máy trước 19/11/2026 không bị hỏi lại (bản ghi v1 giữ nguyên); `[CẦN QUYẾT ĐỊNH: có hỏi lại để nâng lên v2 trước khi phát hành công khai không]`.

### A.đ Biện pháp bảo đảm an toàn
- Truyền: HTTPS ở bản phát hành; Android release chặn HTTP thường (chỉ bản debug cho phép, xem nhật ký dòng 25).
- Bí mật: khóa Gemini chỉ ở biến môi trường server; client không giữ khóa (Nguyên tắc 2).
- Xác thực: JWT ngắn hạn + refresh token xoay vòng (lưu băm sha256); mã khôi phục lưu băm; `AUTH_REQUIRED` bật ở mọi môi trường.
- Mọi truy vấn lọc theo `user_id` của token; đầu vào/đầu ra LLM kiểm tra bằng Zod (Nguyên tắc 6); Gateway kiểm tra chữ ký tệp ảnh trước khi gửi.
- Giới hạn tần suất theo người dùng/IP, hạn mức AI theo ngày.
- Lưu trữ tại máy chủ: `[CẦN ĐIỀN: mã hóa đĩa của hosting, sao lưu, phân quyền truy cập DB]`.

### A.e Kết quả tự đánh giá tuân thủ (19/11/2026)
| Yêu cầu | Trạng thái |
|---|---|
| Thông báo xử lý (Luật Điều 4 k1a) | Đạt — trang `/quyen-rieng-tu` song ngữ (bản nháp) |
| Đồng ý theo từng mục đích, không mặc định, kiểm chứng được (Điều 9) | Đạt — hộp hỏi riêng voice/camera, không tick sẵn, lưu `consents` |
| Rút lại đồng ý (Điều 10) | Đạt — từ 19/11/2026 |
| Xóa (Điều 14) | Đạt — xóa ngay trong app |
| Cung cấp bản sao dữ liệu (Điều 4 k1d) | Chưa có chức năng xuất; xử lý thủ công qua liên hệ `[CẦN ĐIỀN]` |
| Không mua bán DLCN (Điều 7 k6) | Đạt |
| Thời hạn trả lời yêu cầu: phản hồi 02 ngày làm việc; thực hiện rút lại 15 ngày, truy cập/sửa 10 ngày, xóa 20 ngày (NĐ Điều 5) | Cần quy trình + người nhận yêu cầu `[CẦN ĐIỀN]` |
| Nhân sự BVDLCN (NĐ Điều 13) | Chưa có `[CẦN ĐIỀN]` |
| Quy trình thông báo vi phạm (NĐ Điều 28, Mẫu 08) | Chưa có — xem tài liệu vận hành của phiên song song (`docs/van-hanh/`) |

### A.g Rủi ro và biện pháp giảm thiểu
| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Người dùng chụp mặt người/giấy tờ, nói thông tin cá nhân khi chat/ghi âm → tới Google | Trung bình | Hộp đồng ý dặn tránh; ảnh thu nhỏ ≤ 640 px; không lưu ở Gateway; `[CẦN ĐIỀN: chọn gói Gemini không dùng dữ liệu để huấn luyện]` |
| Lộ mã khôi phục → người khác vào tài khoản | Trung bình | Mã 16 ký tự, chỉ lưu băm ở server; giới hạn tần suất `/v1/auth/recover`; người dùng xóa được tài khoản |
| Lộ DB | Thấp–TB | Không có tên/email/SĐT; token & mã khôi phục băm; `[CẦN ĐIỀN: hosting]` |
| Bạn học thấy tên + phút học | Thấp | Chỉ người đã nhận mã mời; tên tự đặt; hủy kết bạn bất cứ lúc nào |
| Trẻ em dùng app | TB | Không có chế độ trẻ em; chính sách yêu cầu cha mẹ đồng ý thay (Luật Điều 24) |

---

## B. Hồ sơ đánh giá tác động CHUYỂN DLCN XUYÊN BIÊN GIỚI — Google Gemini (NĐ 356 Điều 18 k3, Mẫu 09)

| Mục | Nội dung |
|---|---|
| a. Bên chuyển | như A.a `[CẦN ĐIỀN]` |
| Bên nhận | Google LLC, 1600 Amphitheatre Parkway, Mountain View, CA 94043, Hoa Kỳ (dịch vụ Gemini API). Vị trí xử lý: hạ tầng toàn cầu của Google, có thể ngoài Việt Nam |
| Trường hợp chuyển (Luật Điều 20 k1) | (c) dùng nền tảng ngoài lãnh thổ để xử lý DLCN thu thập tại Việt Nam |
| b. Nhân sự BVDLCN | như A.b `[CẦN ĐIỀN]` |
| c. Mục đích | Chuyển giọng nói thành chữ và chấm phát âm; nhận diện đồ vật trong ảnh; trả lời hội thoại, giải thích bài tập, hỏi văn hóa |
| Loại dữ liệu | Bản ghi giọng nói (≤ 15 s/lượt), ảnh JPEG ≤ 640 px, văn bản người dùng nhập (≤ 500 ký tự/lượt, kèm ≤ 6 lượt trước). **Không gửi** mã người dùng, IP người dùng, hồ sơ học |
| Có DLCN nhạy cảm không | Không chủ đích. Rủi ro gián tiếp: người dùng tự đưa thông tin nhạy cảm vào ảnh/lời nói; câu hỏi mở 1 (giọng nói) ở mục 0.1 |
| Số chủ thể dự kiến | `[CẦN ĐIỀN]` (ngưỡng 100.000 ảnh hưởng ân hạn) |
| d. Đồng ý | Khóa `voice` (v2), `camera` (v1) — như A.d. Văn bản chat: thông báo trong chính sách + màn hình chat `[CẦN QUYẾT ĐỊNH: có cần hộp đồng ý riêng cho chat văn bản không — hiện coi là cung cấp dịch vụ người dùng chủ động yêu cầu]` |
| Lưu trữ, xóa | Gateway không lưu nội dung; phía Google theo điều khoản gói dịch vụ `[CẦN ĐIỀN]` |
| đ. An toàn khi chuyển | TLS tới `generativelanguage.googleapis.com`; khóa API gửi qua header, chỉ ở server; timeout 8–10 s; lỗi nhà cung cấp không lộ ra client |
| Đánh giá mức bảo vệ của bên nhận | Google công bố chứng nhận ISO/IEC 27001/27017/27018, SOC 2 cho Google Cloud `[CẦN ĐIỀN: dẫn chứng tài liệu Google tại thời điểm nộp]` |
| Ảnh hưởng & rủi ro | xem A.g; thêm: dữ liệu chịu pháp luật nước nhận (Hoa Kỳ) |
| Phương án sau khi chuyển | Không lưu bản sao ở Gateway; nếu phải dừng chuyển theo yêu cầu cơ quan chuyên trách (Luật Điều 20 k5): tắt Gemini bằng cấu hình (`GEMINI_API_KEY` trống ⇒ Gateway trả kết quả mẫu `mock: true`, app vẫn học được offline) |
| Văn bản ràng buộc trách nhiệm (Điều 18 k2b) | `[CẦN ĐIỀN: bản sao điều khoản Gemini API + Data Processing Addendum]` |
| Ngày bắt đầu chuyển / hạn nộp | `[CẦN ĐIỀN]` / `[CẦN ĐIỀN: +60 ngày]` |
| Nơi nộp | Cơ quan chuyên trách BVDLCN (Bộ Công an) — trực tuyến qua Cổng thông tin quốc gia về BVDLCN, trực tiếp hoặc bưu chính (Luật Điều 22 k3; NĐ Điều 18 k4). Thẩm định 15 ngày; nếu thiếu, có 30 ngày bổ sung |

---

## C. Việc cần làm trước khi phát hành công khai
1. Điền mọi `[CẦN ĐIỀN]`, xác định tư cách pháp lý ⇒ ân hạn có áp dụng không.
2. Chọn gói Gemini; lưu bản điều khoản.
3. Chỉ định nhân sự BVDLCN (hoặc xác nhận được miễn).
4. Nộp hồ sơ B (và A nếu không được ân hạn) trong 60 ngày từ ngày đầu xử lý/chuyển.
5. Đối chiếu nguyên văn các văn bản ở mục 0 trên Công báo; nhờ người có chuyên môn pháp lý xem lại câu hỏi mở 1–2.
6. Lập lịch cập nhật hồ sơ 6 tháng/lần.
