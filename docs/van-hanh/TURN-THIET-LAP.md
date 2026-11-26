# Thiết lập TURN (đường trung chuyển cho gọi thoại/video) — hướng dẫn

> **Dành cho ai:** chủ dự án. Không cần biết lập trình. Viết câu ngắn, đọc từng bước.
> **Nguồn:** spec `docs/superpowers/specs/2026-11-25-ban-be-design.md`, mục 7.3 và 7.4. Trạng thái: **chưa làm**.
> **Lưu ý tuyệt đối:** tài liệu này **không** có khóa, mật khẩu hay mẫu khóa nào. Khóa thật chỉ được lưu trong tệp cấu hình trên máy chủ, **không** ở chat, repo hay APK.

---

## 0. TURN là gì, và vì sao cần

Khi hai điện thoại gọi nhau, chúng thường nối **trực tiếp** với nhau. Nhưng có nhà mạng hoặc tường lửa chặn kết nối trực tiếp. Lúc đó cuộc gọi phải đi qua một **máy trung gian** gọi là **TURN** (đường trung chuyển).

- Trung chuyển tốn **băng thông** (dữ liệu đi qua máy trung gian).
- Dự án dự kiến dùng **Cloudflare Realtime TURN** vì có mức miễn phí.
- Ta **không** để app giữ khóa TURN. Máy chủ Gateway lấy một "thẻ tạm" 1 giờ rồi đưa cho app.

---

## 1. Số liệu cần biết (phải đối chiếu lại trước khi triển khai)

Các số dưới đây lấy từ tài liệu nội bộ ngày 21/11/2026. **Giá và hạn mức của nhà cung cấp có thể đổi.** Trước khi bật TURN thật, mở trang chính thức của Cloudflare và đối chiếu lại từng số.

| Mục | Số trong tài liệu 21/11 | Ghi chú |
|---|---|---|
| Miễn phí mỗi tháng | **1.000 GB** | Cần đối chiếu |
| Sau mức miễn phí | **0,05 USD / GB** | Cần đối chiếu. Dự án không muốn bị tính tiền bất ngờ |
| Ngân sách Gateway đặt mặc định | **800 GB / tháng** (`TURN_MONTHLY_BUDGET_GB`) | Để dư 200 GB so với mức miễn phí |
| Mức cảnh báo | **70%** ngân sách | Gateway ghi cảnh báo cho chủ app |
| Mức ngừng cấp | **100%** ngân sách | Gateway ngừng cấp thông tin TURN mới |

> **Điểm quan trọng nhất:** theo tài liệu, Cloudflare có thể **tính tiền vượt mức thay vì dừng hẳn** khi hết hạn mức miễn phí. Vì vậy dự án tự giữ ngân sách ở phía Gateway. Việc cần làm là **xác nhận** trên trang Cloudflare: tài khoản chưa gắn thẻ thì có bị dừng cứng khi hết mức không. Ghi kết quả vào mục 6.

Ước tính để dễ hình dung (từ spec):
- Một giờ gọi video 1-1, cả hai chiều đều đi qua máy trung gian: khoảng **450 MB**.
- Một giờ gọi thoại: khoảng **30 MB**.
- 1.000 GB ≈ khoảng 2.200 giờ gọi video qua trung gian mỗi tháng. Thường chỉ khoảng 15–30% cuộc gọi cần trung gian, nên mức này đủ cho thử nghiệm, chưa chắc đủ khi phát hành.

---

## 2. Tạo khóa TURN trên Cloudflare

1. Vào **dash.cloudflare.com** và đăng nhập tài khoản Cloudflare của chủ dự án.
2. Tìm mục liên quan đến **Realtime** hoặc **Calls** (tên mục có thể khác theo thời gian; tìm chữ **TURN**). Vào mục **TURN** (hoặc **Realtime TURN**).
3. Bấm **Create TURN key** (Tạo khóa TURN). Đặt tên dễ nhớ, ví dụ `becutit-dev`.
4. Trang sẽ hiện **hai giá trị**: một **ID khóa** và một **khóa API (token)**.
5. **Chép hai giá trị này vào nơi an toàn** (trình quản lý mật khẩu, hoặc tệp ghi chú **chỉ trên máy bạn**). **Không** dán vào chat, không gửi qua Zalo, email, không chụp màn hình.
6. Trang Cloudflare thường chỉ hiện khóa API **một lần**. Nếu lỡ đóng, tạo khóa mới và xóa khóa cũ.

> Khóa TURN có quyền cấp đường trung chuyển trên tài khoản của bạn. Nếu lộ, người khác có thể dùng và **làm bạn bị tính tiền**. Nếu nghi ngờ lộ: vào Cloudflare, **xóa khóa đó ngay**, tạo khóa mới.

---

## 3. Đặt khóa vào Gateway (máy chủ), không đặt vào app

Gateway đọc cấu hình từ tệp `~\.becutit\gateway.env` (thư mục này nằm ngoài repo).

Thêm các dòng sau. **Chỉ viết tên biến**; giá trị thật bạn tự điền trên máy mình:

```
TURN_PROVIDER=cloudflare
CF_TURN_KEY_ID=<ID khóa của bạn, chỉ điền trên máy>
CF_TURN_API_TOKEN=<token của bạn, chỉ điền trên máy>
TURN_MONTHLY_BUDGET_GB=800
```

| Biến | Làm gì | Ghi chú |
|---|---|---|
| `TURN_PROVIDER` | Chọn nhà cung cấp: `none`, `static`, `cloudflare` | Dev dùng `none` hoặc `static` |
| `CF_TURN_KEY_ID` | ID khóa TURN | Bí mật vừa phải |
| `CF_TURN_API_TOKEN` | Token gọi API Cloudflare | **Bí mật**. Chỉ máy chủ giữ |
| `TURN_MONTHLY_BUDGET_GB` | Ngân sách GB mỗi tháng | Mặc định 800 |

Sau đó khởi động lại Gateway.

**Chỉ Gateway giữ khóa.** App (điện thoại, trình duyệt) **không bao giờ** nhận khóa. App chỉ nhận "thẻ tạm" 1 giờ qua đường `GET /v1/calls/ice`.

---

## 4. Các mức TURN_PROVIDER

| Giá trị | Nghĩa | Khi dùng |
|---|---|---|
| `none` | Không có TURN. Chỉ thử kết nối trực tiếp | Dev đơn giản |
| `static` | Dùng TURN tự dựng (coturn) trên máy bạn | Chỉ để thử cục bộ, mục 5 |
| `cloudflare` | Cloudflare Realtime TURN | Khi đã có khóa và đã đối chiếu số liệu |

Đổi nhà cung cấp chỉ cần sửa `TURN_PROVIDER`, không sửa app.

---

## 5. Thử cục bộ bằng coturn trong Docker (chỉ cho người làm kỹ thuật)

Mục này dành cho người biết dùng Docker. Chủ dự án không cần làm; nhờ người làm kỹ thuật.

- coturn là phần mềm TURN mã nguồn mở. Chạy trong Docker để thử trên máy mình, **không** đưa ra internet.
- Đặt mật khẩu thử nghiệm **chỉ trên máy thử**, không dùng mật khẩu thật.
- Không đưa cấu hình coturn vào repo nếu có mật khẩu.
- Dùng khi cần thử gọi qua trung chuyển mà không tốn tiền Cloudflare.

> Đây **không** phải cách đưa lên chạy thật. Khi phát hành, dùng Cloudflare (hoặc coturn tự dựng trên máy chủ riêng, theo quyết định khác).

---

## 5b. Kiểm soát chi phí: hai lớp, và giới hạn của chúng

**Sự thật về tiền:** Cloudflare là bên đo lượng dữ liệu TURN thật và tính tiền. Số do **app tự báo** (đường `POST /v1/calls/:id/stats`) chỉ dùng để ước lượng, **không** phải nguồn sự thật, vì app có thể bị giả mạo hoặc báo sai. Vì vậy không được coi con số app báo là căn cứ để tính tiền.

**Lớp 1 — trong bảng điều khiển Cloudflare (kiểm soát chi phí thật):**
1. Vào trang Cloudflare, mục Billing (thanh toán) và đặt **cảnh báo ngân sách** (budget alert) ở mức thấp, ví dụ 70% mức dự kiến.
2. Nếu Cloudflare có tùy chọn **giới hạn chi tiêu**, bật nó. Nếu không có, ghi rõ điều đó vào nhật ký.
3. Mỗi tuần đối chiếu số GB đã dùng trên bảng điều khiển Realtime với con số ước lượng của Gateway (mục 6).

**Lớp 2 — trong Gateway (giảm số lần cấp, không phải trần tiền):**
1. **Thời hạn ngắn** cho thông tin đăng nhập TURN (spec ghi 1 giờ).
2. **Giới hạn số lần cấp** theo người dùng (ví dụ 30 lần mỗi giờ mỗi người, như spec) và **giới hạn theo ngày** cho từng người (3 giờ gọi qua trung chuyển mỗi ngày).
3. **Giới hạn tổng toàn hệ thống** mỗi ngày, để một lỗi hoặc một người lạm dụng không kéo cả hệ thống vượt mức.
4. **Ước lượng ngân sách** phía server, theo công thức bảo thủ: **số cuộc gọi × thời lượng tối đa mỗi cuộc × băng thông giả định**. Ước lượng này **không** dựa vào số app báo, nên không bị lệch vì app báo sai. Nó cao hơn thực tế, nhưng an toàn hơn.
5. **Mốc 70%** của ngân sách ước lượng: Gateway ghi cảnh báo cho chủ app.
6. **Mốc 100%**: Gateway **ngừng cấp** thông tin TURN mới. App hiện "Gọi qua mạng này có thể không kết nối được" và **vẫn thử nối trực tiếp (P2P)**. Gọi vẫn được thử; chỉ phần trung chuyển bị dừng.

**Giới hạn cần biết (quan trọng):**
- **Không có "trần cứng" tự động** từ phía Gateway nếu Cloudflare không cho đặt giới hạn chi tiêu. Lớp 2 chỉ giảm số lần cấp, nó không chặn được mọi khoản phí.
- Vì vậy **chủ dự án phải tự kiểm tra hóa đơn Cloudflare mỗi tháng**, dù hệ thống đã có cảnh báo.
- Nếu Cloudflare tính tiền vượt mức thay vì dừng (theo tài liệu 21/11, chưa xác nhận), lớp 1 là lớp bảo vệ quan trọng nhất.

## 6. Đối chiếu hằng tuần (việc định kỳ, để không bị tính tiền bất ngờ)

Mỗi tuần, một lần, làm đúng ba bước:

1. Vào trang Cloudflare, mục TURN/Realtime, xem **số GB đã dùng trong tháng**.
2. So với con số Gateway ghi (log hoặc trang quản trị 5a khi có). Nếu lệch nhiều (ví dụ trên 20%), báo người làm kỹ thuật để xem lại cách ước lượng.
3. Ghi một dòng vào nhật ký `docs/NHAT_KY_CHUYEN_DOI_MOBILE.md`: ngày, số GB Cloudflare, số GB Gateway ước tính.

**Mốc cần hành động:**
- **70%** của ngân sách bạn đặt (mặc định 800 GB → **560 GB**): Gateway cảnh báo. Xem có cần tăng ngân sách không.
- **100%** (mặc định 800 GB): Gateway **ngừng cấp** thông tin TURN mới. App hiện "Gọi qua mạng này có thể không kết nối được" và thử nối trực tiếp. Không phát sinh thêm tiền từ phía Gateway.

---

## 7. Hạn mức theo người (đã thiết kế)

- Gateway giới hạn mỗi người **tối đa 3 giờ** gọi qua trung chuyển mỗi ngày.
- Lấy thông tin TURN: tối đa **30 lần mỗi giờ mỗi người** (chống lạm dụng).

---

## 8. Mục đã kiểm và chưa kiểm

| Việc | Trạng thái |
|---|---|
| Số liệu 1.000 GB, 0,05 USD/GB | **Chưa đối chiếu** với trang chính thức. Phải làm trước khi bật |
| Tên mục trên trang Cloudflare | **Chưa kiểm**; có thể khác. Tìm chữ TURN |
| Cloudflare có dừng cứng khi hết mức không | **Chưa xác nhận**. Việc của chủ dự án |
| Gateway đọc đúng các biến trên | **Chưa kiểm**; kiểm khi làm Task thiết lập TURN |

---

## 9. Việc tuyệt đối không làm

- Không dán `CF_TURN_API_TOKEN` hay `CF_TURN_KEY_ID` vào chat với AI, ticket, ảnh chụp, repo, APK.
- Không đặt khóa trong mã nguồn, tệp `.env.example`, hay tài liệu này.
- Không để app giữ khóa TURN.
- Không bật TURN trả tiền khi chưa có quyết định của chủ dự án.

---

## Nguồn tham khảo

- Spec mục 7.3 và 7.4: `docs/superpowers/specs/2026-11-25-ban-be-design.md`.
- Tài liệu 21/11 nêu Cloudflare Realtime TURN: `docs/thiet-ke/DE-XUAT-TRIEN-KHAI.md` mục 2.2.
- Trang giá và hạn mức của Cloudflare: **đối chiếu tại thời điểm triển khai** (chưa mở trong phiên này).
