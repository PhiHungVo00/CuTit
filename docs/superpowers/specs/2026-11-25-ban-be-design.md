# Thiết kế dự án 4: Bạn bè — chat, gọi thoại/video, nhóm

> Ngày: 2026-11-25 · Trạng thái: **BẢN NHÁP CHỜ DUYỆT** (đã qua người đọc độc lập rà, xem mục 10) · Góp ý gốc: mục "Dự án 4" trong `docs/nhat-ky/GOP-Y-20-11.md` (quyết định 21/11 và các lựa chọn người dùng chốt thêm 25/11).
> Giai đoạn 1–4 của quy trình (`AGENTS.md` mục 6). **Chưa viết code sản phẩm, chưa sinh migration thật.**
> Ký hiệu: *(gọi của người thiết kế)* là chỗ người dùng chưa nói, người thiết kế tự quyết kèm lý do. Người dùng sửa được khi đọc. Chỗ chưa kiểm được ghi **[?]**.
> Nền kỹ thuật dùng lại: `docs/superpowers/specs/2026-11-21-gop-y-bao-loi-design.md` (dự án 5a: `BlobStore`, quản trị, hàng chờ), `…-dang-nhap-design.md` (dự án 3: tài khoản, JWT, gộp/xóa tài khoản), `docs/thiet-ke/DE-XUAT-TRIEN-KHAI.md` (hạ tầng free).

## 1. Mục đích và lý do
Người học tiếng Việt học tốt hơn khi có người cùng học. App đã có "bạn học hợp tác" (mã mời + nhiệm vụ tuần chung, GĐ4c) nhưng bạn bè **không nói chuyện được với nhau**. Dự án 4 cho họ:
- nhắn tin (chữ, ảnh, giọng nói) 1-1 và trong nhóm học;
- gọi thoại và gọi video (1-1 và nhóm tới 6 người);
- nhận thông báo đẩy khi có tin/cuộc gọi lúc app đang đóng.

Tất cả chạy trên hạ tầng **miễn phí** (người dùng chốt), đủ an toàn để phát hành thật: người dưới 18 không bị người lạ nhắn, người dùng chặn/báo cáo được, chủ app xử lý báo cáo ở trang quản trị 5a.

**Thành công nghĩa là:**
- Hai người đã kết bạn nhắn nhau: tin tới trong dưới 1 giây khi cả hai đang mở app; khi một người tắt app thì nhận thông báo đẩy và mở app thấy đủ tin, đúng thứ tự, không trùng.
- Gọi video 1-1 nối được trên 4G ở cả hai phía (qua TURN khi cần); nhóm 6 người gọi thoại ổn định.
- Báo cáo một tin → chủ app thấy trong hàng chờ quản trị kèm đoạn hội thoại làm bằng chứng, khóa chat được người đó trong vài cú bấm.
- Toàn bộ chạy được trên emulator Android và trình duyệt, không tốn tiền dịch vụ ở quy mô thử nghiệm.

## 2. Mục tiêu / không làm / phản mục tiêu
**Mục tiêu (người dùng chốt):**
1. Chat chữ, ảnh, giọng nói; gọi thoại và gọi video.
2. Nhóm học **không giới hạn thành viên** (như group chat); **gọi nhóm trần 6 người**, kết nối thẳng WebRTC mesh, thiết kế để sau này thay bằng máy chủ SFU (LiveKit) mà không đổi phần còn lại.
3. Thời gian thực miễn phí: WebSocket trên Gateway; WebRTC + STUN miễn phí + TURN gói miễn phí.
4. Tin nhắn lưu **vĩnh viễn**, có khôi phục (thu hồi / xóa mềm); không tự xóa sau 90 ngày.
5. Thông báo đẩy Firebase Cloud Messaging.
6. Kết bạn bằng **tên đăng nhập + mã mời (link)**; không danh bạ, số điện thoại, email, không QR ở bản đầu.
7. Thứ tự làm: chat chữ+ảnh → giọng nói → gọi 1-1 → nhóm → gọi nhóm; làm hết một lượt rồi mới kiểm tích hợp, nhưng **mỗi Task có test tự động riêng**.
8. Xác nhận tuổi: tự khai **năm sinh**; dưới 18 bị chặn chat/gọi với người lạ nhưng học bình thường; **chỉ lưu cờ** "đủ 18 hay chưa".
9. Nghị định 147 và việc phát hành để cuối.

**Không làm (bản đầu):**
- Mã hóa đầu-cuối (E2EE): server giữ chữ rõ để thu hồi/khôi phục và để chủ app xem được đoạn bị báo cáo. Trang quyền riêng tư phải nói thẳng điều này.
- SFU/LiveKit (chỉ chừa chỗ cắm, mục 7.4), web push, QR kết bạn, nhập danh bạ.
- Sửa tin, phản hồi trích dẫn, biểu cảm, chuyển tiếp, sticker/GIF, xem trước link, tìm trong tin nhắn, ảnh đại diện nhóm, gọi nhóm qua link mời.
- Màn hình đổ chuông kiểu cuộc gọi toàn màn (full-screen intent / ConnectionService): bản đầu dùng thông báo hiện nổi có nút Trả lời/Từ chối (mục 8.4).
- Ghi âm/ghi hình cuộc gọi. Server không bao giờ nhận luồng media (trừ TURN chuyển tiếp mã hóa DTLS-SRTP).
- Quản lý người dùng chat ở quy mô lớn (5b).

**Phản mục tiêu (chạy được vẫn là thất bại):**
- Người dưới 18 nhận được tin hoặc cuộc gọi từ người lạ.
- Lưu năm sinh/ngày sinh (chỉ được lưu cờ), hoặc ghi năm sinh vào log/audit.
- Khóa Firebase/TURN/LiveKit nằm trong APK hoặc trong repo công khai.
- Dò được tên đăng nhập nào tồn tại (liệt kê người dùng), hoặc người lạ nhắn được cho ai đó khi chưa kết bạn.
- Người dùng gửi ảnh nhưng ảnh mang GPS/EXIF; URL ảnh/giọng nói xem được công khai.
- Tin đến sai thứ tự, trùng, hoặc mất khi mạng chập chờn.
- Hóa đơn bất ngờ: dùng vượt gói free TURN/lưu trữ mà không có chặn/cảnh báo.
- Gói đầu của app phình ra vì chat/gọi (ngân sách hiệu năng không được nới).
- Xóa tài khoản mà nội dung người đó gửi vẫn còn đọc được.
- Chủ app đọc được mọi cuộc trò chuyện (chỉ đoạn người dùng đã báo cáo).

## 3. Ràng buộc
- **Bảy nguyên tắc** (`AGENTS.md` mục 2): API-first (mọi thứ qua Gateway; TURN/FCM/SFU là nhà cung cấp phía server); không khóa ở client; **contract trước** (`packages/contracts`); khả năng trừu tượng (`PushProvider`, `TurnProvider`, `CallBackend`, `BlobStore`); mỗi MFE độc lập, không import chéo; ghép MFE lúc build.
- **Danh mục 8 thuật toán đóng:** dự án này **không thêm thuật toán tự viết**. Giao thức báo hiệu WebRTC theo mẫu "perfect negotiation" của W3C/MDN là mã giao thức chuẩn, không phải thuật toán tự nghĩ; nếu Lead Dev xem đó là "thêm thuật toán" thì dùng `RTCPeerConnection` tối giản kèm chính sách kết nối lại (xem câu hỏi Q6).
- **Migration** đánh số tiếp từ migration hiện có (`0010_admin_audit_append_only` là mới nhất ở `main` lúc viết). Số thật lấy bằng `db:generate` **lúc gộp**, không đặt số tay, không sửa migration đã phát hành. PGlite (dev/test) và Postgres đều phải chạy: **không dùng extension** (`citext`, `pg_trgm`…); chữ thường hóa bằng `lower()` + chỉ mục duy nhất.
- **i18n:** mọi chuỗi UI có vi + en (`apps/mfe-social/src/i18n.ts`, theo quy ước `defineMessages` của `packages/state`). Nội dung học vẫn tiếng Việt. Trang quản trị chỉ tiếng Việt.
- **Hiệu năng:** màn chat và màn gọi **nạp lười**, không vào gói đầu; thư viện WebSocket client = `WebSocket` có sẵn của trình duyệt (không thêm gói). Thêm mục `size-limit` cho từng chunk (mục 9). Không nới ngân sách hiện có.
- **Phụ thuộc:** dự án 5a Task 2 (`BlobStore`, giới hạn multipart theo request; PR #46) **đã gộp vào `main`**. 5a Task 4 (đăng nhập quản trị, PR #50) **đã qua rà ĐẠT nhưng chưa gộp**; Task 5–6 (hàng chờ, `apps/admin`) chưa có. Nêu rõ ở mục 12. Task nào cần mà chưa gộp thì **chờ**, không tự copy sang.
- **Người dùng mặc định là người đủ tuổi** (quyết định 21/11) — đổi so với D4 cũ ("trẻ em dùng như mọi người", 19/11). Phải ghi vào `docs/KE_HOACH_PHAT_TRIEN_TOAN_DIEN.md` mục 9 (PR này làm).
- Phần này đụng DB, auth, dữ liệu người dùng, native Android và pháp lý ⇒ **`kien-truc` xem lại**, chạy skill `kiem-truoc-khi-gop`, thử trên AVD (mục 11).
- Repo công khai: không commit `google-services.json`, khóa dịch vụ Firebase, khóa TURN. Chúng nằm ở `~/.becutit/gateway.env` hoặc secret của CI.

## 4. Các phương án đã cân nhắc
Người dùng đã chốt hướng ở mục 2; bảng này ghi các **quyết định lớn còn lại** và vì sao chọn.

| # | Quyết định | Phương án | Chọn | Lý do / đánh đổi |
|---|---|---|---|---|
| A | Cách gửi tin & đẩy tin | A1. Mọi thứ qua WebSocket (gửi + nhận) · **A2. Gửi bằng REST (có khóa chống trùng), nhận/đẩy bằng WebSocket** · A3. SSE + REST | **A2** | REST gửi được kể cả khi WS đang nối lại hoặc Gateway vừa "thức dậy" (Render free ngủ ~1 phút), thử/giới hạn tốc độ/đo bằng hạ tầng sẵn có, thử tự động dễ. WS lo phần cần nhanh: tin mới, đã xem, đang gõ, báo hiệu cuộc gọi. A1 phải tự làm ack/gửi lại/hạn tốc độ trên WS. A3 (đã có SSE) một chiều nên báo hiệu gọi phải đi vòng; người dùng đã chọn WS. |
| B | Nơi đặt giao diện chat/gọi | B1. Thêm vào `mfe-learner` (nơi có màn Bạn bè) · **B2. MFE mới `apps/mfe-social`** · B3. Hai MFE (chat, gọi) | **B2** | `mfe-learner` đã lớn; chat+gọi là hai khối mã nặng (WebRTC, ghi âm) cần chunk riêng và độc lập. B3 dư (hai chunk lười trong một MFE là đủ). Màn Bạn bè hiện có (mã mời, nhiệm vụ tuần) **ở nguyên `mfe-learner`**, host nối hai bên bằng URL/EventBus, không import chéo. |
| C | Thứ tự tin trong cuộc trò chuyện | C1. Theo `created_at` · **C2. Số thứ tự `seq` liên tục theo từng cuộc trò chuyện, cấp trong giao dịch DB** · C3. ULID | **C2** | `seq` không có lỗ hổng nên client phát hiện thiếu tin và bù đúng phần thiếu; chỉ cần một câu lệnh `UPDATE … RETURNING` có khóa dòng. C1 lệch đồng hồ, trùng mili giây. |
| D | Phát tin tới nhiều thành viên | D1. Mỗi người một "hộp thư" (ghi N dòng) · **D2. Một dòng tin, mỗi thành viên giữ `last_read_seq`** | **D2** | Nhóm không giới hạn thành viên: D1 nhân bản dữ liệu theo số người. D2 ghi một dòng, đọc theo `seq`. Đánh đổi: số chưa đọc = `last_seq − last_read_seq` (xấp xỉ, chấp nhận được; gửi tin thì tự coi là đã đọc tới tin của mình). |
| E | TURN miễn phí | **E1. Cloudflare Realtime TURN** · E2. Metered (Open Relay) · E3. Tự dựng coturn trên máy ảo free (Oracle Always Free) | **E1**, E3 chỉ làm môi trường thử cục bộ (Docker) | Đã chọn ở `DE-XUAT-TRIEN-KHAI.md`: 1.000 GB/tháng free, quá thì 0,05 USD/GB **[?: số liệu từ tài liệu 21/11, đối chiếu lại lúc triển khai]**. E2: nguồn mâu thuẫn về hạn mức free. E3: tự vận hành, cần thẻ + máy ảo. Chi tiết và hết hạn mức: mục 7.3. |
| F | Gọi nhóm | **F1. Mesh P2P trần 6 (lớp `CallTransport` tách khỏi giao diện)** · F2. LiveKit Cloud free ngay · F3. Tự dựng LiveKit | **F1** (người dùng chốt) | F1 không cần máy chủ media. Đánh đổi: mỗi người gửi (N−1) luồng; ở 6 người máy yếu và pin chịu không nổi nếu bật cả video ⇒ có chính sách chất lượng ở 7.2. F2/F3 là đường nâng cấp (7.4). |
| G | Kết bạn bằng "tên đăng nhập" khi khách/Google không có tên đăng nhập | G1. Chỉ cho tài khoản mật khẩu · **G2. Bảng riêng "tên bạn bè" (`handle`), tài khoản mật khẩu tự lấy tên đăng nhập làm handle, tài khoản khác tự chọn** · G3. Dùng email | **G2** *(gọi của người thiết kế)* | G1 loại người dùng Google (nhiều nhất). G3 trái quyết định (không email). G2 giữ đúng ý "kết bạn bằng tên đăng nhập" cho đa số, và tên đăng nhập thật dùng để đăng nhập không bị lộ ra ngoài khi người dùng chọn handle khác. |
| H | Tin bị thu hồi/xóa | H1. Xóa cứng · **H2. Xóa mềm (`deleted_at`), nội dung giữ ở server, người gửi hoàn tác được; bằng chứng báo cáo giữ riêng** · H3. Xóa mềm rồi xóa cứng sau X ngày | **H2** | Người dùng chốt "lưu vĩnh viễn, có khôi phục". Đánh đổi: dữ liệu phình dần ⇒ ảnh/giọng nói có trần và cảnh báo dung lượng (mục 5.5). Khi xóa **tài khoản** thì nội dung của người đó bị xóa thật (mục 6.6). |

## 5. Thiết kế đã chốt: dữ liệu và Gateway

### 5.1 Tuổi, tài khoản, điều kiện dùng chat
- **Cờ tuổi:** thêm cột `users.is_adult boolean NULL` (NULL = chưa khai) và `users.age_declared_at timestamptz NULL`. **Không có cột năm sinh/ngày sinh.**
- **Khai tuổi:** `PUT /v1/me/age { birthYear }` (Bearer). Server tính `is_adult`, **bỏ giá trị năm sinh ngay**: không ghi DB, không ghi audit (`age.declared` chỉ ghi `outcome`), không vào log (Fastify không log body; test chứng minh).
  - `birthYear` hợp lệ: số nguyên từ 1900 tới năm hiện tại.
  - **Luật đủ 18 chỉ từ năm sinh** *(người dùng chốt 26/11)*: đủ 18 ⇔ `năm hiện tại − birthYear ≥ 18`. Người khai năm sinh đúng 18 năm trước **chưa chắc đã đủ 18 tuổi thực** (có thể mới 17 tuổi tới cuối năm), nhưng đây là lựa chọn của người dùng vì không lưu ngày sinh; rủi ro này ghi trong đánh giá tác động pháp lý (Task 19). Hệ thống chỉ lưu cờ đủ/chưa đủ, không lưu năm sinh.
  - Đã khai `false` thì **khóa 12 tháng** (`age_declared_at`), sau đó khai lại được; đã khai `true` thì không đổi ngược lại. Lý do: khai tuổi là tự khai, nên chỉ chặn việc thử đi thử lại ngay lập tức; không có cách xác minh khác nếu không lưu ngày sinh (đã loại).
- **Cổng tuổi hiện ở:** (1) bước cuối màn Tạo tài khoản của dự án 3 (client gọi `PUT /v1/me/age` ngay sau khi đăng ký); (2) lần đầu mở tab Tin nhắn nếu `is_adult` còn NULL (tài khoản cũ, đăng nhập Google). Không chặn việc học khi chưa khai.
- **Ai dùng được chat/gọi** *(gọi của người thiết kế)*: tài khoản **không phải khách** (`is_guest=false`), **không chờ xóa**, `is_adult=true`, đã đặt handle, không bị khóa chat. Khách bị loại vì: (a) tài khoản khách gắn với một máy, mất máy là mất cả lịch sử "vĩnh viễn"; (b) chống tài khoản tạo-hàng-loạt để spam. Khách vẫn học và vẫn dùng nhiệm vụ bạn học hiện có.
- **Người dưới 18** *(gọi của người thiết kế, chặt hơn mức tối thiểu)*: không dùng chat, gọi, nhóm, không nhận/gửi lời mời kết bạn **bằng handle**. Luồng **mã mời + nhiệm vụ tuần hiện có giữ nguyên** (mở cho khách và người dưới 18, chỉ chia sẻ số phút học; không sửa ngoài `quest_active`); chỉ chat/gọi/nhóm bị chặn. Bạn học và nhiệm vụ tuần đã có vẫn chạy như cũ (chỉ chia sẻ số phút học, không nhắn nhau). Người dùng chỉ nói "chặn chat/gọi với **người lạ**"; cho dưới 18 chat với bạn cùng tuổi cần quyết định thêm (Q1) nên bản đầu chọn đóng hẳn.
- **Cờ tuổi không vào JWT**: server đọc từ DB (cache 60 giây như `userState`), đổi có hiệu lực ngay.
- **Gộp tài khoản (dự án 3, `services/auth/merge.ts`):** khách không có dữ liệu chat/handle nên **không có luật chuyển**, nhưng thêm một ca test khẳng định bảng chat không bị đụng khi gộp, và `is_adult` của khách **không** ghi đè tài khoản đích.

### 5.2 Tên bạn bè (handle), kết bạn, chặn
- `social_profiles` (đã có: `user_id`, `display_name`) thêm: `handle text NULL` (duy nhất theo `lower(handle)`), `discoverable boolean default true`, `show_online boolean default true`, `show_read_receipts boolean default true`, `show_push_preview boolean default false`.
- **Handle:** 3–24 ký tự `a-z 0-9 . _` (giống tên đăng nhập, dùng lại bộ kiểm của dự án 3 và danh sách tên cấm). Tài khoản mật khẩu: lần đầu bật chat, gợi ý sẵn **tên đăng nhập** làm handle; nếu trùng handle người khác thì phải chọn tên khác. Tài khoản Google: tự chọn. Handle **không đổi quá 1 lần/30 ngày**. Không có tìm kiếm theo tiền tố, không liệt kê: chỉ tra **khớp đúng**.
- **Hai đường kết bạn:**
  1. **Mã mời / link** (đã có ở `friend_invites`: mã 8 ký tự, 48 giờ, dùng một lần): thêm dạng link `https://<PUBLIC_WEB_ORIGIN>/moi/<MÃ>` và deep link `becutit://moi/<MÃ>`; host-shell nhận route `/moi/:code` mở màn nhập mã đã điền sẵn. Tên miền chưa có lúc này ⇒ `PUBLIC_WEB_ORIGIN` là cấu hình; App Links (xác nhận miền với Android) để dự án triển khai. Nhập mã đúng = **kết bạn ngay** (như hiện nay).
  2. **Tên đăng nhập (handle):** `POST /v1/friends/requests { handle }` → tạo lời mời chờ; người kia thấy tên hiển thị và bấm **Chấp nhận / Từ chối**. Bảng `friend_requests(id, from_user_id, to_user_id, status 'pending'|'accepted'|'declined'|'canceled', created_at, resolved_at)`, duy nhất `(from, to)` đang `pending`.
- **Không dò người dùng:** gửi lời mời tới handle không tồn tại, không `discoverable`, đang bị chặn, đang chờ xóa, hoặc dưới 18 đều trả **cùng một** lỗi `handle_not_found` (404). Giới hạn **20 lời mời/ngày** và **10 tra cứu sai/giờ** mỗi người. Nhận lời mời bị giới hạn: tối đa 50 lời mời `pending` tới một người.
- **`friendships` (đã có)** vẫn là "một quan hệ bạn bè". Giới hạn `MAX_FRIENDS = 5` hiện có là **giới hạn của nhiệm vụ tuần chung** chứ không phải của việc nhắn tin ⇒ thêm cột `friendships.quest_active boolean default true`; chỉ tối đa 5 cặp có `quest_active` cùng lúc; bạn thứ 6 trở đi vẫn là bạn (nhắn tin được) nhưng không có nhiệm vụ tuần, người dùng đổi qua lại được. Cập nhật hợp đồng `friends.ts` và test `friend_limit`.
- **Chặn:** `user_blocks(blocker_id, blocked_id, created_at)`. Chặn ai đó thì: xóa quan hệ bạn bè (và nhiệm vụ chung), hai bên không nhắn riêng được, người bị chặn không nhận được lời mời, không thấy trạng thái trực tuyến; trong **nhóm chung** hai bên vẫn ở trong nhóm nhưng tin của người bị chặn hiện với người chặn dưới dạng "Tin của người bạn đã chặn" (nội dung không gửi xuống, thay bằng cờ `blocked: true`). Bỏ chặn không tự kết bạn lại.
- **Điều kiện tạo cuộc trò chuyện 1-1:** hai bên là bạn, cả hai đủ điều kiện ở 5.1, không bên nào chặn bên kia. Mỗi cặp **một** cuộc 1-1 (`dm_key = min(id)||':'||max(id)` duy nhất).

### 5.3 Mô hình dữ liệu (migration mới, số do `db:generate`)
Tên bảng tránh trùng bảng AI chat hiện có `messages`/`sessions`. Mọi khóa ngoại tới `users` đã nêu cách xử lý khi xóa tài khoản.

```
-- cột thêm vào bảng có sẵn
users(+ is_adult bool null, + age_declared_at timestamptz null)
social_profiles(+ handle text null, + discoverable bool, + show_online bool, + show_read_receipts bool,
                + show_push_preview bool)              -- unique index on lower(handle) where handle is not null
friendships(+ quest_active bool default true)

friend_requests(id uuid pk, from_user_id → users CASCADE, to_user_id → users CASCADE,
                status, created_at, resolved_at null)
                unique (from_user_id, to_user_id) where status='pending'; index (to_user_id, status, created_at desc)
user_blocks(blocker_id → users CASCADE, blocked_id → users CASCADE, created_at, pk(blocker_id, blocked_id))

conversations(id uuid pk, kind 'dm'|'group', title text null (nhóm: 1–60 ký tự), dm_key text null unique,
              created_by → users SET NULL, created_at, last_seq bigint default 0, last_message_at null)
conversation_members(conversation_id → conversations CASCADE, user_id → users CASCADE,
                     role 'owner'|'admin'|'member', joined_at, joined_seq bigint default 0 (last_seq lúc vào), left_at null,
                     last_read_seq bigint default 0, hidden_before_seq bigint default 0, muted_until null,
                     pk(conversation_id, user_id))      -- index (user_id, left_at) để liệt kê cuộc trò chuyện của tôi
chat_messages(id uuid pk, conversation_id → conversations CASCADE, seq bigint, sender_id → users SET NULL,
              client_msg_id uuid, kind 'text'|'image'|'voice'|'system', body text null (≤ 4000), attachment_id null,
              system_event jsonb null, created_at, deleted_at null, deleted_kind null ('recalled'|'account_deleted'))
              unique (conversation_id, seq); unique (conversation_id, sender_id, client_msg_id)  -- chống trùng
              index (conversation_id, seq desc)
chat_attachments(id uuid pk, conversation_id → conversations CASCADE, uploader_id → users SET NULL, blob_key,
                 media 'image'|'voice', content_type, bytes int, duration_ms int null, width int null, height int null,
                 created_at, pinned_by_report bool default false, purged_at null)   -- gắn vào tin ở bước sau khi tải lên xong
chat_reports(id uuid pk, reporter_id → users SET NULL, reported_user_id → users SET NULL, conversation_id → conversations SET NULL,
             message_id null, reason 'spam'|'harassment'|'sexual'|'minor_safety'|'scam'|'other', note text null (≤ 500),
             snapshot jsonb,          -- tối đa 30 tin quanh tin bị báo (nội dung + khóa tệp), chụp lúc báo cáo
             status 'open'|'reviewing'|'actioned'|'dismissed', created_at, resolved_at null, resolved_by null, action null)
             index (status, created_at desc)
chat_restrictions(id uuid pk, user_id → users CASCADE, kind 'chat_ban', until timestamptz null (null = vĩnh viễn),
                  reason text, report_id → chat_reports SET NULL, created_by (null = cli), created_at, lifted_at null)
                  index (user_id) where lifted_at is null
push_tokens(id uuid pk, user_id → users CASCADE, token text unique, platform 'android', app_build int,
            locale 'vi'|'en', created_at, last_seen_at, disabled_at null)
calls(id uuid pk, conversation_id → conversations CASCADE, kind 'voice'|'video', initiator_id → users SET NULL,
      mode 'mesh'|'sfu', started_at, ended_at null, end_reason null)
call_participants(call_id → calls CASCADE, user_id → users CASCADE, invited_at, joined_at null, left_at null,
                  relay_seconds int default 0, pk(call_id, user_id))   -- relay_seconds: tính ngân sách TURN (7.3)
```
- **Chỉ mục & truy vấn nóng:** (1) lấy tin: `(conversation_id, seq desc)`; (2) danh sách cuộc trò chuyện của tôi: `conversation_members (user_id, left_at)` rồi nối `conversations` theo `last_message_at`; (3) tra handle: chỉ mục `lower(handle)`; (4) khóa chat còn hiệu lực: chỉ mục từng phần.
- **Cấp `seq`:** trong **một giao dịch**: `UPDATE conversations SET last_seq = last_seq + 1, last_message_at = now() WHERE id = $1 RETURNING last_seq` (khóa dòng, tuần tự hóa người gửi cùng cuộc trò chuyện), rồi `INSERT chat_messages`. Chống trùng: lỗi trùng `(conversation_id, sender_id, client_msg_id)` thì **trả lại đúng tin đã có** (idempotent), không tạo mới và không tăng `seq` (nên kiểm tra trước trong cùng giao dịch).
- **Xóa tài khoản** (mục 6.6) và **gộp tài khoản** (5.1) có test riêng. Mọi bảng mới có test migration trên PGlite rỗng **và** trên DB đã có `0010` (tương tự `feedback-schema-migration.test.mjs`).

### 5.4 Tin nhắn: API REST (`/v1/chat/*`, Bearer, mọi route kiểm điều kiện 5.1 trừ khi nêu khác)
Tất cả lược đồ ở `packages/contracts/src/api/chat-social.ts` (tên tệp để tránh trùng `chat.ts` của AI) trước khi code.

| Route | Việc |
|---|---|
| `GET /v1/chat/conversations?cursor=` | danh sách cuộc trò chuyện của tôi: `{id, kind, title, peer?{displayName, online?}, lastSeq, lastMessage?(tóm tắt), unread, muted}` |
| `POST /v1/chat/conversations` | tạo nhóm `{title, memberIds[]}` (chỉ thành viên là **bạn** của người tạo); tạo/lấy 1-1 `{peerFriendshipId}` |
| `GET /v1/chat/conversations/:id/messages?beforeSeq=&afterSeq=&limit=` | trang tin theo `seq`, mặc định 40, tối đa 100; chỉ từ `max(hidden_before_seq, joined_seq)` |
| `POST /v1/chat/conversations/:id/messages` | gửi `{clientMsgId, kind, body? , attachmentId?}` → `{id, seq, createdAt}`; **idempotent** |
| `POST /v1/chat/conversations/:id/read {seq}` | đánh dấu đã đọc tới `seq` |
| `POST /v1/chat/messages/:id/recall` · `POST …/restore` | thu hồi · hoàn tác thu hồi (chỉ người gửi; quản trị nhóm thu hồi được tin của người khác nhưng **không hoàn tác thay** họ) |
| `POST /v1/chat/conversations/:id/hide` | "xóa cuộc trò chuyện cho riêng mình" = đặt `hidden_before_seq = last_seq` (hoàn tác bằng `…/unhide` để xem lại, do tin vẫn lưu) |
| `POST /v1/chat/attachments` (multipart) | tải ảnh/giọng nói lên **trước**, trả `attachmentId` (5.5) |
| `GET /v1/chat/attachments/:id/url` | URL ký 5 phút để thẻ `<img>`/`<audio>` mở được (HMAC, như 5a) |
| `POST /v1/chat/groups/:id/members` · `DELETE …/members/:userId` · `POST …/leave` · `PUT …/title` · `PUT …/members/:userId/role` | quản lý nhóm (6.1) |
| `PUT /v1/chat/conversations/:id/mute` | tắt thông báo |
| `POST /v1/chat/reports` | báo cáo (6.2) |
| `GET/PUT /v1/chat/settings` | `show_online`, `show_read_receipts`, `show_push_preview`, `discoverable` |
| `POST /v1/chat/push-tokens` · `DELETE …/:token` | đăng ký/hủy token FCM (8) |

- **Thu hồi:** đặt `deleted_at`, `deleted_kind='recalled'`; API trả cho người khác `{deleted:true}` **không có nội dung**; người gửi vẫn thấy nội dung mờ kèm nút "Hoàn tác". Hoàn tác xóa `deleted_at`. Server **giữ nguyên** `body` và tệp để hoàn tác được; nếu tin nằm trong báo cáo đang mở thì **bằng chứng nằm ở `snapshot`** nên người gửi thu hồi sau đó cũng không xóa được bằng chứng. Tệp thuộc snapshot được đặt `pinned_by_report=true` (không bị dọn).
- **Giới hạn tốc độ và chống spam** *(gọi của người thiết kế; hằng số ở `CHAT_LIMITS` trong contract)*: 20 tin / 10 giây / cuộc trò chuyện; 120 tin / phút / người; 600 tin / ngày / người; tối đa 30 ảnh + 30 giọng nói / ngày / người; tối đa 5 nhóm tạo / ngày; 20 lời mời kết bạn / ngày; 10 báo cáo / ngày; nội dung tin giống hệt gửi liên tiếp > 5 lần trong 1 phút bị chặn (`chat_duplicate`). Lỗi chuẩn: `chat_rate` (429), `chat_restricted`, `not_a_member`, `peer_unavailable`, `blocked`, `adult_required`, `age_required`, `handle_required`, `handle_taken`, `handle_not_found`, `attachment_invalid`, `storage_full`, `call_full`, `call_not_found`… (đầy đủ ở contract).
- **Tin hệ thống** (`kind='system'`, `system_event` JSON có kiểu): "đã thêm / rời / bị xóa khỏi nhóm", "đổi tên nhóm", "cuộc gọi nhỡ / đã gọi N phút". Client dựng chữ theo ngôn ngữ từ `system_event`, **server không lưu chữ tiếng nào** (để i18n vi/en đúng).

### 5.5 Ảnh và giọng nói (dùng `BlobStore` của dự án 5a)
- **Phụ thuộc:** `BlobStore` (`fs` | `r2`), `sniffMedia`, kho tệp ở `apps/gateway/src/services/blob/` từ dự án 5a Task 2 (PR #46, **đã gộp**). Task tệp đính kèm chỉ cần Task 4 của dự án này xong.
- **Ảnh:** app vẽ lại qua canvas thành WebP, cạnh dài ≤ 1280 px (mất EXIF/GPS, nhẹ hơn mức 1920 của góp ý vì chat gửi nhiều), ≤ 2 MB. Server kiểm **magic bytes** (WebP/JPEG/PNG), từ chối còn lại.
- **Giọng nói:** ghi bằng `MediaRecorder` (Opus/WebM; trên WebView/Android không có thì AAC/MP4), tối đa **120 giây**, tối đa **3 MB**. Server kiểm magic bytes (WebM/Ogg/MP4). Hiển thị dạng sóng đơn giản (tính cục bộ trên client từ vài mẫu biên độ gửi kèm `waveform` ≤ 64 số, **không phải** thuật toán A1/A2).
- **Luồng:** (1) `POST /v1/chat/attachments` ghi thẳng vào kho (streaming, không đọc hết vào RAM, quá cỡ thì hủy và xóa tệp dở), trả `attachmentId` ở trạng thái chưa gắn; (2) `POST …/messages` gắn `attachmentId` (chỉ người đã tải lên, cùng cuộc trò chuyện). Tệp chưa gắn quá **1 giờ** bị dọn.
- **Khóa tệp:** `chat/<conversationId>/<uuid>.<ext>`, không chứa tên gốc.
- **Xem tệp:** không có URL công khai; `GET …/url` kiểm thành viên rồi trả URL ký HMAC sống 5 phút (`/v1/chat/blob?k=&exp=&sig=`, hỗ trợ `Range` cho âm thanh, header `cross-origin-resource-policy: cross-origin`). Khóa ký `CHAT_BLOB_URL_SECRET`.
- **Dung lượng — nói thẳng:** tin nhắn lưu vĩnh viễn nhưng đĩa miễn phí thì có hạn. Ước tính **[?]**: ảnh ~150 KB, giọng nói 32 kbps ≈ 240 KB/phút; ở thử nghiệm (≤ 200 người, ~2 tệp/người/ngày) khoảng 60 MB/ngày ⇒ gói R2 free 10 GB **[?]** đủ vài tháng. Hai chốt chặn: `CHAT_BLOB_TOTAL_CAP_MB` (mặc định 5000, riêng khỏi trần góp ý `BLOB_TOTAL_CAP_MB`): vượt thì **từ chối ảnh/giọng nói mới nhưng chữ vẫn gửi được** và báo `storage_full`; ở 80% có cảnh báo cho chủ app (dòng nhật ký + hiện trên trang quản trị). Khi chạm trần thật sự, chủ app chọn trả tiền thêm (R2 ~0,015 USD/GB/tháng **[?]**) hoặc đặt chính sách xóa phương tiện cũ (Q4). Chính sách "lưu vĩnh viễn" áp cho **chữ**; **phương tiện** lưu vĩnh viễn *trong hạn mức*.

### 5.6 WebSocket: giao thức và độ tin cậy
- **Thư viện:** `@fastify/websocket` (MIT, dựa trên `ws` MIT). Người làm kiểm số tải/lần cập nhật/lỗ hổng.
- **Điểm nối:** `GET /ws` (scope riêng, **ngoài** `/v1` vì trình duyệt không gửi được header `Authorization` khi mở WebSocket và hook `/v1` yêu cầu header đó), giới hạn theo IP, tối đa **3 kết nối đồng thời/người** (kết nối thứ 4 đóng kết nối cũ nhất).
- **Xác thực (không đưa token lên URL):** khung đầu tiên client gửi phải là `{"t":"hello","v":1,"token":"<access JWT>","build":123,"device":"<uuid>"}` **trong 5 giây**, nếu không server đóng `4401`. Server kiểm đúng như `authenticate` (`typ:'access'`, người dùng còn tồn tại, không chờ xóa, đủ điều kiện 5.1, không bị khóa chat) và kiểm `build` ≥ bản tối thiểu (dùng lại `updateGate` của dự án 8: bản quá cũ nhận `4426`). Trả `hello_ok{serverTime, expSec}`.
- **Token hết hạn khi đang nối** (access chỉ sống 15 phút): server gửi `auth_expiring` 60 giây trước; client làm mới token rồi gửi `{"t":"auth","token":…}`; quá hạn mà chưa gia hạn thì đóng `4401`. Thu hồi quyền (khóa chat, xóa tài khoản, đăng xuất mọi máy) đóng kết nối ngay (`4403`).
- **Khung (JSON, có `t` và `v`; kiểm bằng Zod ở `packages/contracts`)**, tối đa 16 KB/khung, tối đa 30 khung/giây/kết nối (vượt thì đóng `4429`):
  - Server → client: `msg` (tin mới, đủ nội dung), `recall`, `restore`, `read{cid, userId, seq}`, `typing{cid, userId}`, `presence{userId, online}`, `member`(thêm/xóa/rời/vai trò), `conv`(đổi tên/tạo), `friend`(lời mời/được chấp nhận), `call.*` (7.1), `error{code, ref}`, `ping`.
  - Client → server: `hello`, `auth`, `typing{cid}`, `visibility{foreground}` (để quyết định có gửi thông báo đẩy không), `call.*`, `pong`. **Không có khung "gửi tin"**: gửi tin luôn bằng REST (phương án A2).
- **Thứ tự và bù tin:**
  1. Mỗi `msg` mang `cid` và `seq`. Client giữ `lastSeq` từng cuộc trò chuyện.
  2. Nhận `msg` có `seq = lastSeq+1` thì áp dụng. `seq` ≤ `lastSeq` thì bỏ (trùng). `seq > lastSeq+1` (thiếu) thì **gọi REST `afterSeq=lastSeq`** để bù đúng phần thiếu, rồi áp dụng theo thứ tự.
  3. **Nối lại sau khi rớt/offline:** client gọi `GET /v1/chat/conversations` (có `lastSeq` mỗi cuộc) và bù từng cuộc có `lastSeq` lớn hơn của mình. WebSocket **không** là nguồn sự thật, chỉ là đường báo; mọi thứ đều lấy lại được bằng REST.
  4. **Gửi chờ (outbox):** tin soạn lúc offline nằm trong hàng đợi cục bộ (IndexedDB; dự phòng `localStorage`) với `clientMsgId`; khi có mạng gửi lại đúng `clientMsgId` ⇒ server trả tin cũ nếu đã nhận (không trùng). Tệp đính kèm chờ: tải lên lại khi có mạng. Thứ tự hiển thị: tin đã có `seq` theo `seq`, tin chờ nằm cuối.
  5. **Chiến lược nối lại:** lùi theo cấp số nhân 1 s → 30 s có nhiễu ngẫu nhiên; ngừng khi app ra nền (Android sẽ cắt socket ở Doze, đã có FCM lo phần đó); nối lại khi app trở lại nền trước.
- **Sống còn của kết nối:** server `ping` mỗi 25 giây (dưới ngưỡng chờ ~55–60 giây của proxy nền tảng **[?]**), quá 60 giây không nhận `pong` thì đóng. Người nhận chậm (bộ đệm gửi vượt 1 MB) bị đóng để khỏi nghẽn bộ nhớ.
- **Bộ phát tin trong tiến trình** (`RealtimeHub`: `Map<userId, Set<Socket>>`) đứng sau interface `RealtimeBus` (`publish(userIds, frame)`). Bản đầu **một instance Gateway** (như `DE-XUAT-TRIEN-KHAI.md`); nhiều instance thì thay bằng Postgres `LISTEN/NOTIFY` hoặc Redis mà không đổi phần còn lại. PGlite một kết nối nên bản test dùng bus trong bộ nhớ. **Hệ quả của Render free ngủ sau ~15 phút không có kết nối [?]:** đã có WebSocket mở thì tính là hoạt động; khi Gateway đang ngủ, gửi bằng REST vẫn "đánh thức" được (chậm ~1 phút lần đầu), người nhận thì nhận thông báo đẩy. Gói trả phí không ngủ là hướng khi phát hành.
- **Với nhóm lớn (không giới hạn thành viên):** nhóm > 50 người **tắt** "đang gõ" và "đã xem" từng người (chỉ có "đã xem bởi N" tải lười khi bấm), trạng thái trực tuyến chỉ hỏi khi mở danh sách thành viên; thông báo đẩy gộp (cùng `collapse_key` theo cuộc trò chuyện, gửi theo mẻ ≤ 500 token) và tắt sẵn từ 200 thành viên trở lên *(gọi của người thiết kế; người dùng bật lại được)*.

### 5.7 Quyền riêng tư
- **Ai thấy ai:** người lạ chỉ có thể tìm bạn bằng **handle chính xác** hoặc mã mời; người tìm thấy chỉ thấy tên hiển thị. Trạng thái trực tuyến và "đã xem" chỉ hiển thị cho bạn bè (1-1) / thành viên chung (nhóm ≤ 50) và **đối xứng**: tắt `show_online` thì mình cũng không thấy của người khác. Không lưu "lần cuối trực tuyến".
- **Chủ app xem gì:** chỉ đoạn **snapshot** của báo cáo; **không có màn duyệt cuộc trò chuyện**. Mỗi lần chủ app mở báo cáo/tệp bằng chứng ghi `admin_audit_log` (cùng giao dịch, như 5a).
- **Tin nhắn không E2EE:** văn bản và tệp được lưu rõ ở server (vì thu hồi/khôi phục, bằng chứng báo cáo). Cập nhật `/quyen-rieng-tu`, `docs/phap-ly/DATA-SAFETY.md` (thêm: nội dung tin nhắn, ảnh/giọng nói, danh sách bạn, handle, cờ đủ 18, token thiết bị), `DANH-GIA-TAC-DONG.md`. Cờ tuổi: nói rõ chỉ lưu "đủ 18 hay chưa", không lưu năm sinh.
- **Thông báo đẩy ở màn khóa:** mặc định **không hiện nội dung** ("Tin nhắn mới từ <tên>"); bật `show_push_preview` mới hiện chữ (ảnh/giọng nói luôn chỉ hiện "đã gửi ảnh").

### 5.8 Báo cáo, chặn, khóa chat và trang quản trị 5a
- **Người dùng báo cáo** một tin (hoặc một người trong nhóm): `POST /v1/chat/reports {conversationId, messageId?, reportedUserId, reason, note?}` (tối đa 10/ngày). Server chụp **snapshot** (tối đa 30 tin quanh tin bị báo, hoặc 30 tin gần nhất của người đó trong cuộc trò chuyện), đặt `pinned_by_report` cho tệp trong snapshot, chỉ cho báo cáo thành viên cùng cuộc trò chuyện và **không cho biết người bị báo cáo ai báo**. Sau khi báo cáo, app gợi ý "Chặn người này".
- **Hàng chờ quản trị:** mở rộng hợp đồng 5a — `QueueTypeSchema` thêm `'chat_report'`, `QueueItemSchema`/`QueueQuerySchema` hỗ trợ nhánh chat (ghi chú trong `admin.ts` đã chừa chỗ). API: `GET /admin/v1/queue?type=chat_report`, `GET /admin/v1/chat/reports/:id` (nội dung báo cáo + snapshot + người báo/bị báo rút gọn, **không email**), `GET …/files/:fileId/url` (URL ký như 5a), `POST /admin/v1/chat/reports/:id/resolve {action, note}` với `action` ∈ `dismiss | warn | restrict`. `restrict` tạo `chat_restrictions` (thời hạn hoặc vĩnh viễn) và phát `close 4403` tới mọi kết nối của người đó; `warn` gửi một thông báo hệ thống tới người bị báo cáo. Mọi hành động ghi `admin_audit_log` cùng giao dịch (`chat.report_view`, `chat.report_resolve`, `chat.restrict`, `chat.restrict_lift`).
- **Khóa chat là nguy hiểm** ⇒ theo §B7 nên **xác thực lại bằng mã 6 số (step-up)**; 5a chưa có cơ chế đó (để cho 5b). *(gọi của người thiết kế)* bản đầu có **nút Khóa trong `apps/admin` (có hộp xác nhận nêu thời hạn, ghi nhật ký) và CLI `admin:chat-restrict`**, chưa có step-up; khi 5b có step-up thì gắn vào nút. Chủ app là người duy nhất có quyền này nên rủi ro chấp nhận được ở bản đầu. Người bị khóa vẫn học bình thường và thấy thông báo "Tài khoản bị tạm khóa chat đến …"; khiếu nại qua "Góp ý / Báo lỗi" của 5a (không cần cơ chế mới).
- **Phụ thuộc 5a:** hook quản trị + `admin_audit_log` (Task 4), hàng chờ (Task 5), trang `apps/admin` (Task 6). Task quản trị chat **chờ** các Task đó; trước đó test bằng phiên quản trị giả như 5a đã làm.

### 5.9 Xóa tài khoản và dữ liệu
- **Chờ xóa 30 ngày (dự án 3):** người đó hiện "không khả dụng" (offline, không nhận tin mới, lời mời tới họ trả `handle_not_found`); cuộc trò chuyện giữ nguyên; khôi phục thì mọi thứ trở lại.
- **Xóa cứng** (`purgeExpiredAccounts` và `DELETE /v1/me`), trong cùng giao dịch: (1) `chat_messages` do người đó gửi: **xóa nội dung** (`body=NULL`, `attachment_id=NULL`, `deleted_kind='account_deleted'`, `sender_id` → NULL qua FK) nhưng **giữ dòng** để `seq` liên tục và cuộc trò chuyện không vỡ, hiển thị "Tin của người dùng đã xóa tài khoản"; (2) tệp của họ: xóa qua `BlobStore` **sau** commit, lỗi thì ghi `blob_deletions` thử lại (cơ chế 5a), ngoại trừ tệp đang `pinned_by_report` thuộc báo cáo `open/reviewing`; (3) nhóm: nếu người đó là chủ nhóm duy nhất thì chuyển quyền cho thành viên vào sớm nhất (nhóm không còn ai thì xóa nhóm); (4) `push_tokens`, `user_blocks`, `friend_requests`, `conversation_members` cascade; (5) giải phóng handle.
- **Bằng chứng báo cáo còn lại:** nội dung nằm trong `chat_reports.snapshot` được giữ đến **30 ngày sau khi báo cáo đóng** *(gọi của người thiết kế)* rồi xóa bằng job; trang quyền riêng tư nói rõ. Có cần cơ sở pháp lý riêng không: để giai đoạn pháp lý/Nghị định 147 (Q5).
- **Dọn định kỳ** (job hằng ngày sẵn có): tệp chưa gắn > 1 giờ; `chat_reports` đóng > 30 ngày (snapshot, ghim tệp); `push_tokens` không dùng > 60 ngày hoặc FCM báo `UNREGISTERED`; `friend_requests` `pending` > 30 ngày; `calls` mở > 6 giờ (đóng `timeout`).

## 6. Nhóm

### 6.1 Vai trò và quy tắc
- Vai trò: `owner` (1 người), `admin`, `member`. Chủ/quản trị nhóm thêm/xóa thành viên, đổi tên nhóm; chỉ chủ đổi vai trò và giải tán. **Không giới hạn số thành viên** (người dùng chốt) nhưng có trần mềm cấu hình `GROUP_SOFT_CAP` (mặc định 1000) để Gateway không bị lạm dụng; chạm trần thì báo rõ, đổi bằng cấu hình.
- **Thêm thành viên:** chỉ thêm được người là **bạn** của người thêm và đủ điều kiện 5.1. Người mới **không** thấy tin cũ (`joined_seq`). Người rời/bị xóa không nhận tin mới; vào lại sau đó = người mới (không thấy tin trong thời gian vắng).
- Thành viên nhóm có thể chưa là bạn của nhau (cùng được một bạn mời) — chấp nhận vì tất cả đã đủ 18 (5.1), có chặn và báo cáo. Không có lời mời nhóm bằng link ở bản đầu (mở cửa cho người lạ, để sau).
- Chủ nhóm rời nhóm: bắt buộc chọn người kế vị (hoặc tự động chọn quản trị/thành viên cũ nhất).

## 7. Gọi thoại và video

### 7.1 Báo hiệu qua Gateway (WebSocket) và trạng thái cuộc gọi
- **Khung `call.*`** (Zod ở contract): `call.invite{callId, cid, kind}` (server → người được mời), `call.accept`, `call.decline`, `call.join/leave`, `call.signal{callId, to, data}` (offer/answer/ICE do **client** tạo, server chỉ chuyển tiếp, kiểm `to` là thành viên cuộc gọi và kích thước ≤ 8 KB), `call.state{callId, participants[]}`, `call.end{callId, reason}`.
- **Bắt đầu cuộc gọi:** `POST /v1/calls {conversationId, kind}` (REST, có giới hạn tốc độ: 10 cuộc/giờ/người) trả `{callId, join: CallJoinInfo}`. Server tạo `calls` + `call_participants`, gửi `call.invite` tới mọi thành viên đang có WS (nhóm: chỉ mời, ai vào thì vào) và **thông báo đẩy ưu tiên cao** tới người không có kết nối (8.4). Nhấc máy: `POST /v1/calls/:id/join`. Người gọi chờ **45 giây** rồi tự kết thúc `no_answer`; từ chối `declined`; bận `busy` (đang trong cuộc gọi khác).
- **Gọi trong nhóm lớn** *(gọi của người thiết kế)*: người gọi chọn tối đa 5 người để mời (mặc định mời tất cả nếu nhóm ≤ 10 người). `call.invite` và push chuông chỉ gửi cho **người được chọn**; thành viên khác thấy biểu ngữ "Đang có cuộc gọi" (không chuông) và vào được cho tới khi đủ 6. Nhờ vậy gọi không đổ chuông 1.000 người và không đốt hạn mức FCM.
- **Hạn chế:** một người **một** cuộc gọi tại một thời điểm; không gọi người đã chặn/không đủ điều kiện; trong 1-1 cả hai bên phải là bạn; trong nhóm chỉ thành viên.
- **Nhật ký cuộc gọi** = tin hệ thống trong cuộc trò chuyện ("Cuộc gọi nhỡ", "Cuộc gọi video 3:21"), không lưu gì về nội dung cuộc gọi.
- **Lệnh vào cuộc gọi nhóm:** `call_full` khi đã đủ `CALL_MAX_PARTICIPANTS` (mặc định 6) ⇒ bản trả `409`; client hiện "Cuộc gọi đã đủ người (6)". Hạn mức mềm hơn của video (7.2).

### 7.2 Mesh P2P (bản đầu) và chính sách chất lượng
- Mỗi cặp người có **một** `RTCPeerConnection`; N người ⇒ N(N−1)/2 kết nối, mỗi máy gửi (N−1) luồng. Quy ước tránh đụng độ offer: người có `userId` **nhỏ hơn** là bên **không nhường** (impolite), theo mẫu "perfect negotiation" (W3C WebRTC §Perfect negotiation, MDN); bên kia nhường và chấp nhận rollback.
- **Chính sách chất lượng theo số người** *(gọi của người thiết kế; số liệu ban đầu, chỉnh bằng đo thật trên máy yếu)*:

| Số người | Thoại (Opus) | Video |
|---|---|---|
| 2 | 32 kbps | 360p·24 fps, tối đa 600 kbps |
| 3–4 | 24 kbps | 240p·15 fps, tối đa 250 kbps mỗi luồng |
| 5–6 | 16–24 kbps | **camera tắt sẵn**, người dùng bật được nhưng 160p·10 fps ≤ 120 kbps; cảnh báo pin/nóng |

  Đặt qua `RTCRtpSender.setParameters` (`maxBitrate`, `scaleResolutionDownBy`, `maxFramerate`) khi số người đổi. Bản đầu **không** tự thay đổi theo băng thông (không có thuật toán thích nghi tự viết), chỉ theo số người.
- **Mất kết nối giữa chừng:** thấy `connectionState = 'failed'` thì thử `restartIce()` một lần, không được thì tạo lại kết nối cặp đó; một cặp lỗi **không** làm hỏng cặp khác; sau 15 giây vẫn lỗi thì hiện "Mạng của <tên> không ổn" và giữ phần còn lại.
- **Lớp `CallTransport`** (client, `apps/mfe-social/src/call/transport/`): giao diện `join(info) / leave() / publish(tracks) / on('participants'|'track'|'state'|'stats')`. Ruột `MeshTransport` làm bản đầu. Giao diện người dùng chỉ biết `CallTransport`.

### 7.3 STUN/TURN miễn phí và khi hết hạn mức
- **STUN:** `stun:stun.cloudflare.com:3478` (Cloudflare, không tính hạn mức) và dự phòng `stun:stun.l.google.com:19302` **[?: không có cam kết chính thức của Google]**; nằm trong cấu hình Gateway, không nằm trong app.
- **TURN dự kiến: Cloudflare Realtime TURN** (đã nêu ở `DE-XUAT-TRIEN-KHAI.md` mục 2.2): **1.000 GB/tháng miễn phí**, sau đó **0,05 USD/GB**, tính chung với Cloudflare SFU **[?: số liệu 21/11, đối chiếu trên trang giá khi triển khai]**. Gateway gọi API Cloudflare bằng khóa server (`CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN`, biến môi trường) để lấy **thông tin xác thực ngắn hạn** (TTL 1 giờ) và đưa cho app qua `GET /v1/calls/ice` (Bearer, 30 lần/giờ/người). App **không bao giờ giữ khóa TURN**. Interface `TurnProvider` (`none` | `static` (coturn thử cục bộ) | `cloudflare`); đổi nhà cung cấp bằng biến `TURN_PROVIDER`.
- **Ước tính mức dùng:** video 360p ~500 kbps mỗi chiều ⇒ ~450 MB cho một giờ gọi 1-1 **nếu cả hai chiều đều qua relay**; thoại ~30 MB/giờ. 1.000 GB ≈ 2.200 giờ gọi video qua relay/tháng. Thường chỉ ~15–30% kết nối cần relay **[?]**, nên đủ rộng cho thử nghiệm; chưa chắc đủ khi phát hành.
- **Khi hết hạn mức — điều quan trọng nhất:** theo trang giá, Cloudflare **tính tiền vượt mức thay vì dừng** **[?: cần xác nhận tài khoản chưa gắn thẻ thì có bị dừng cứng không; việc của người dùng, Q3]**. Ta không muốn hóa đơn bất ngờ, nên Gateway tự giữ **ngân sách**:
  1. đếm số phút gọi **có dùng relay** (client báo `selectedCandidatePair.type='relay'` qua `POST /v1/calls/:id/stats`, kiểm hợp lý nhưng không tin tuyệt đối) × băng thông ước tính ⇒ ước lượng GB/tháng (cộng từ `call_participants.relay_seconds`, tổng hợp theo tháng khi cần);
  2. ở **70%** `TURN_MONTHLY_BUDGET_GB` (mặc định 800): ghi cảnh báo cho chủ app; ở **100%**: **ngừng cấp thông tin TURN**; app hiện "Gọi qua mạng này có thể không kết nối được" và vẫn thử P2P trực tiếp (nối được ~70–85% cặp **[?]**); gọi vẫn không gây hóa đơn;
  3. hạn mức hằng ngày mỗi người: tối đa 3 giờ gọi qua relay/ngày để một người không ăn hết;
  4. chủ app tăng ngân sách bằng cấu hình khi chấp nhận trả tiền, hoặc dùng E3 (coturn tự dựng) cho bản triển khai.
  Nếu ước lượng sai vì Cloudflare tính khác, đối chiếu bảng điều khiển Cloudflare hằng tuần (việc ghi trong `docs/van-hanh/`).
- **Kết nối thất bại vì chặn UDP:** cấu hình TURN có cả `turn:…?transport=udp`, `…tcp` và `turns:` cổng 443 (qua tường lửa nghiêm).

### 7.4 Đường nâng cấp sang SFU (LiveKit) không đổi phần còn lại
- Hợp đồng **`CallJoinInfo`** là union có phân biệt: `{mode:'mesh', iceServers[], maxParticipants}` hoặc `{mode:'sfu', url, token, roomName}`. Server `CallBackend` (`MeshBackend` bản đầu, `LiveKitBackend` sau) chỉ tạo `CallJoinInfo`; với `sfu`, Gateway **cấp token LiveKit ngắn hạn** (khóa API LiveKit ở server) thay vì chuyển tiếp offer/answer.
- Client chọn `MeshTransport` hay `LivekitTransport` theo `mode`; **màn gọi, danh sách người, nút, nhật ký cuộc gọi, thông báo, quyền** không đổi. `CALL_MAX_PARTICIPANTS` đổi thành số lớn hơn theo cấu hình.
- Bản đầu **không** thêm thư viện LiveKit vào gói (chỉ mô tả). Khi chuyển, `livekit-client` (Apache-2.0) nạp lười trong chunk gọi.
- Một **test hợp đồng** của `CallTransport` (chạy với `MeshTransport` thật và với một `FakeSfuTransport`) bảo đảm màn gọi chỉ dùng giao diện chung.

## 8. Android, quyền, thông báo đẩy

### 8.1 Quyền và phần native
- Đã có `RECORD_AUDIO`, `CAMERA`, `MODIFY_AUDIO_SETTINGS`, `INTERNET`. Thêm trong `AndroidManifest.xml`: `POST_NOTIFICATIONS` (Android 13+, xin lúc chạy), `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `FOREGROUND_SERVICE_CAMERA`, `BLUETOOTH_CONNECT` (tai nghe; xin lúc chạy, tùy chọn). Giải thích lý do ngay trước hộp thoại quyền (màn "Cho phép micro để nói chuyện với bạn").
- **Dịch vụ nền trong lúc gọi:** Android 14 buộc tiếp tục dùng micro/camera khi app ra nền phải có **foreground service** đúng loại; không có thì âm thanh bị cắt. Plugin `CallForegroundService` (thông báo "Đang gọi với <tên>", nút Kết thúc) bật khi vào cuộc gọi, tắt khi rời; cầu nối `packages/native/src/call.ts` (`startCallService`, `stopCallService`, `setSpeaker`, `onAudioRouteChanged`). Web: bỏ qua (no-op).
- **Định tuyến âm thanh:** `AudioManager.MODE_IN_COMMUNICATION`; nút loa ngoài/loa trong; tai nghe có dây/Bluetooth tự chuyển. Tự đặt lại chế độ âm thanh khi cuộc gọi kết thúc **và** khi tiến trình bị hủy (tránh để máy kẹt chế độ gọi).
- **Camera:** chỉ một nơi dùng camera một lúc ⇒ màn gọi video xin camera sau khi `packages/native/src/camera.ts` (AR) đã giải phóng; đổi camera trước/sau trong cuộc gọi.
- **WebView:** `getUserMedia` đi qua `BridgeWebChromeClient` của Capacitor sau khi quyền Android đã cấp (cơ chế đã chạy cho STT/camera hiện có); thử lại trên AVD (mục 11) vì đây là chỗ lỗi hay gặp riêng ở Android.
- **iOS:** ngoài phạm vi (chưa có).

### 8.2 FCM — việc người dùng phải làm tay
Không làm thay được vì cần tài khoản Google của chủ app. Kèm hướng dẫn chi tiết trong `docs/van-hanh/FCM-THIET-LAP.md` (Task):
1. Tạo **dự án Firebase** (gói Spark, miễn phí) trên console.firebase.google.com.
2. Thêm ứng dụng Android với `applicationId` **`vn.edu.uit.becutit`** (và các hậu tố của flavor `apk`/`play`/debug nếu khác id).
3. Tải **`google-services.json`** (không commit; đặt ở `apps/host-shell/android/app/` và làm secret của CI).
4. Tạo **khóa tài khoản dịch vụ** (service account JSON, quyền "Firebase Cloud Messaging API Admin") ⇒ đặt ở `~/.becutit/fcm-service-account.json`, biến `FCM_SERVICE_ACCOUNT_FILE` trong `~/.becutit/gateway.env`. **Không** dán vào chat/commit.
5. Với bản phát hành: thêm vân tay SHA-1/256 của keystore (không cần cho FCM cơ bản, cần nếu sau này dùng đăng nhập Google/App Links).
Dev/test **không cần** Firebase thật: `PUSH_PROVIDER=log` ghi thông báo ra log, test dùng bản giả; chỉ bước nghiệm thu trên thiết bị thật cần việc tay ở trên.

### 8.3 Thông báo đẩy: thiết kế
- **Phía app:** plugin `@capacitor/push-notifications` (MIT, chính thức Capacitor). Đăng ký token lúc đủ điều kiện chat (sau khi xin quyền `POST_NOTIFICATIONS`), `POST /v1/chat/push-tokens`; gửi lại khi token đổi; hủy khi đăng xuất/xóa tài khoản. Bản web **không** có push (không làm web push).
- **Phía Gateway:** interface `PushProvider { send(tokens, payload) }` với `none | log | fcm` (`firebase-admin` Apache-2.0 hoặc `google-auth-library` + HTTP v1; người làm chọn, kiểm số tải/lỗ hổng). Token trả `UNREGISTERED`/`INVALID_ARGUMENT` ⇒ đặt `disabled_at`.
- **Khi nào gửi:** có tin mới và người nhận **không** có kết nối WS ở nền trước (client gửi `visibility`), chưa tắt thông báo cuộc trò chuyện, không bị chặn; không gửi lại nếu đã đọc trong vài giây (trì hoãn 3 giây rồi kiểm). Gọi đến: tin dữ liệu `android.priority=high`, `ttl=30s`.
- **Nội dung:** theo `show_push_preview` (5.7). Có `collapse_key`/`tag` theo cuộc trò chuyện để nhiều tin gộp thành một. Kênh thông báo Android: `messages` (độ ưu tiên mặc định), `calls` (cao, chuông), `friends` (thấp).
- **Gói tin:** `{type:'msg'|'call'|'friend', cid?, callId?, from?}`; chạm vào thông báo mở đúng màn qua deep link `becutit://chat/<cid>`, `becutit://call/<callId>`.
- Trả lời `5a`: "thông báo đẩy khi chủ app trả lời góp ý" (đã ghi ở 5a "không làm") **nối vào đây** ở Task thông báo (nếu 5a đã gộp), loại `feedback`.

### 8.4 Cuộc gọi đến khi app đang đóng
Bản đầu: thông báo đẩy ưu tiên cao hiện nổi **"<tên> đang gọi"** với nút **Trả lời** / **Từ chối**; bấm Trả lời mở app tới màn gọi và xin quyền nếu thiếu. Lệnh đổ chuông toàn màn trên màn khóa (USE_FULL_SCREEN_INTENT, Android 14 hạn chế cho app không thuộc loại gọi/báo thức) để sau (đã nêu ở "Không làm"). Hết 45 giây nút vô hiệu, người gọi nhận "không trả lời".

## 9. Giao diện (MFE `apps/mfe-social`) và ngân sách
- Lối vào: Hồ sơ › dòng **Tin nhắn** (có chấm đỏ số chưa đọc ở dòng và ở tab Hồ sơ, như chấm Góp ý của 5a) và từ màn Bạn bè (nút "Nhắn tin"). **Không thêm tab mới** (thanh tab đã chốt ở `docs/thiet-ke/ban-phac/bo-cuc-tab.html`). Số chưa đọc lấy từ `GET /v1/chat/conversations/unread` sau lần vẽ đầu, lúc rảnh (như `useFeedbackUnread`), **WebSocket mở khi app ở nền trước và tài khoản đủ điều kiện chat** (mở lười sau lần vẽ đầu, lúc rảnh, bằng mã `packages/api-client/src/social` nạp lười; đóng khi ra nền) để cuộc gọi/tin đến lúc đang mở app không bị mất. Khi app ở nền trước, thông báo đẩy FCM không tự hiện trong Capacitor nên app tự hiện biểu ngữ trong app qua sự kiện `pushNotificationReceived`. Số chưa đọc cập nhật từ khung WS (REST chỉ để lấy lúc mở). Người chưa đủ điều kiện chat **không** mở WS.
- Route (khai trong `apps/host-shell/src/routes.tsx` → `PATH_ROUTES`, nạp lười): `/tin-nhan` (danh sách), `/tin-nhan/:id` (một cuộc trò chuyện), `/tin-nhan/moi` (tạo nhóm), `/goi/:callId` (màn gọi), `/moi/:code` (mã mời), `/ban-be/tim` (kết bạn bằng handle). Màn gọi là chunk **riêng** với chunk chat để người chỉ nhắn tin không nạp WebRTC.
- Giao diện đủ trạng thái: đang nối lại ("Đang kết nối…" thanh nhỏ), tin đang gửi/đã gửi/lỗi (nút gửi lại), thu hồi, ghi âm giữ-để-nói với **vuốt để hủy**, khóa/xóa/báo cáo. Cu Tít `khen` khi kết bạn thành công. Phác giao diện **tạo ở Task đầu** (`docs/thiet-ke/ban-phac/4-ban-be.html`, theo `docs/thiet-ke/NGUYEN-TAC-UI-UX.md`) trước khi làm màn.
- **Ngân sách** *(gọi của người thiết kế; người làm đo rồi chốt, được **siết**, không được nới)*: chunk chat ≤ 40 kB gzip, chunk gọi ≤ 35 kB gzip, chunk ghi âm/ảnh tải thêm khi dùng; gói đầu **không tăng một byte** ngoài hook chấm đỏ (≤ 1 kB gzip). Thêm mục `size-limit` cho từng chunk ở `apps/host-shell/package.json`. Không thêm thư viện WebRTC/WebSocket (dùng API trình duyệt).
- `apps/mfe-social` **không import** MFE khác; nhận danh sách bạn qua API Gateway (không qua `mfe-learner`); thêm vào luật `lint:boundaries` nếu cần.

## 10. Cách gộp và nghiệm thu *(gọi của người thiết kế)*
- Mỗi Task là một PR nhỏ, gộp từng đợt khi qua `kiem-truoc-khi-gop`. Người dùng muốn kiểm tích hợp một lượt, nên có **cờ `CHAT_ENABLED` (mặc định `false` ở production, `true` ở dev/test)** giữ toàn bộ chat/gọi tắt (`/v1/chat/*`, `/ws`, `/v1/calls/*` trả 404; app ẩn lối vào) cho tới khi Task 17 (báo cáo + quản trị) và Task 19 (kiểm tích hợp) xong. Mã vào `main` dần mà **không tính năng nào chưa có kiểm duyệt ra tay người dùng**.
- **Nghiệm thu:** Gateway chạy trên máy dev (emulator qua `10.0.2.2`, Chrome trên máy). Điều chưa kiểm về Render free (ngủ/đánh thức, timeout proxy cho ping 25 giây) ghi **[?]**, đo khi có môi trường triển khai.
- **Liên kết mời:** bản đầu dùng **mã văn bản + `becutit://moi/<MÃ>`**; link `https://` và `assetlinks.json` làm khi có tên miền (`PUBLIC_WEB_ORIGIN` trống thì app chỉ chia sẻ mã).
- Dự án 3 (mật khẩu, Google, màn Tạo tài khoản) **đã có trên `main`**.

## 11. Kiểm thử bắt buộc
- **Contract:** Zod mọi khung WS và lược đồ REST; giới hạn và mã lỗi; `CallJoinInfo` union; từ chối `body` 4001 ký tự, `waveform` > 64, `clientMsgId` không phải uuid, `birthYear` ngoài khoảng.
- **Gateway (PGlite `memory://`, bus trong bộ nhớ, `BlobStore` fs tạm):**
  - tuổi: 2007 so với năm hiện tại, ranh giới `năm−18` là **đủ**, `năm−17` là chưa đủ; **không** có chỗ nào ghi năm sinh (kiểm DB, audit, log); khai `false` bị khóa 12 tháng; dưới 18 không tạo được 1-1/nhóm/lời mời;
  - khách và tài khoản chờ xóa không vào được `/ws` và `/v1/chat/*`;
  - `handle`: tra khớp đúng; không tồn tại / không `discoverable` / bị chặn / dưới 18 → **cùng** `handle_not_found`; giới hạn 20/ngày;
  - **thứ tự & trùng:** 50 người gửi đồng thời vào một cuộc trò chuyện → `seq` 1..50 không lỗ không trùng; gửi lại cùng `clientMsgId` → trả đúng tin cũ, `seq` không tăng; rớt WS giữa chừng rồi bù bằng `afterSeq` đủ;
  - WS: không `hello` trong 5 giây → đóng `4401`; token `typ:'refresh'` bị từ chối; token hết hạn khi đang nối → `auth_expiring` rồi `4401`; khóa chat → `4403` ngay; khung quá 16 KB / quá 30 khung/giây → đóng;
  - ảnh/giọng nói: đuôi giả (magic bytes) bị từ chối; quá cỡ → không còn tệp mồ côi; chưa gắn > 1 giờ bị dọn; người ngoài cuộc trò chuyện không lấy được URL; URL ký hết hạn sau 5 phút; vượt trần → `storage_full` nhưng chữ vẫn gửi được;
  - thu hồi/hoàn tác; người khác không thấy nội dung đã thu hồi; thu hồi sau khi bị báo cáo không xóa snapshot;
  - chặn: xóa bạn, không nhắn riêng, tin trong nhóm hiện cờ `blocked`; bỏ chặn không tự kết bạn lại;
  - nhóm: thêm chỉ bạn của người thêm; người mới không thấy tin cũ; chủ rời → chuyển quyền; nhóm > 50 người tắt typing/read từng người; nhóm 1.000 thành viên vẫn gửi một tin = một dòng;
  - báo cáo → hàng chờ quản trị có snapshot; `restrict` đóng kết nối và chặn gửi; mọi hành động có dòng `admin_audit_log` cùng giao dịch (thao tác lỗi thì không có dòng nhật ký);
  - xóa tài khoản: nội dung tin và tệp của người đó bị xóa (kho tệp lỗi → `blob_deletions`), trừ tệp ghim bởi báo cáo mở; chủ nhóm duy nhất → chuyển quyền; handle được giải phóng;
  - cuộc gọi: mời → nhận/từ chối/nhỡ 45 giây; bận; `call_full` ở người thứ 7; chuyển `call.signal` chỉ tới thành viên; ICE giả cấp theo `TurnProvider`; vượt ngân sách TURN → ngừng cấp TURN, ghi cảnh báo;
  - push: `PushProvider` giả nhận đúng nội dung (ẩn/hiện theo `show_push_preview`), không gửi khi có WS nền trước, `UNREGISTERED` → vô hiệu token;
  - giới hạn tốc độ và chống spam các hằng số ở 5.4;
  - **migration:** chạy trên PGlite rỗng và trên DB đã có `0010`; thử **một lần trên Postgres thật** (như cách rà PR #41: embedded-postgres hoặc Docker).
- **App (Vitest/RTL):** danh sách và màn chat; sắp theo `seq`, bù tin khi thiếu, bỏ trùng; outbox gửi lại sau mất mạng không trùng; ghi âm giữ-để-nói/vuốt hủy; ảnh vẽ lại không còn EXIF; đủ chuỗi vi + en; chấm đỏ; trạng thái kết nối; màn gọi dùng `CallTransport` (kiểm bằng `FakeTransport`); chính sách chất lượng theo số người.
- **e2e Playwright** (Gateway thật PGlite, Chromium với `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`): hai ngữ cảnh trình duyệt kết bạn bằng mã mời → nhắn tin hai chiều → gửi ảnh → thu hồi → báo cáo → quản trị khóa; gọi thoại 1-1 đạt `connectionState==='connected'` và có byte âm thanh nhận được; gọi 3 người mesh; đóng tab giữa cuộc gọi thì người kia nhận `peer left`. TURN thử bằng coturn dựng bằng Docker (`TURN_PROVIDER=static`, ép `iceTransportPolicy:'relay'`).
- **Android (skill `thu-tren-emulator`, AVD `BeCuTit_Pixel_API35`; camera ảo + micro máy chủ):** xin quyền micro/camera/thông báo; gọi thoại và video giữa app (AVD) và Chrome trên máy (Gateway ở `10.0.2.2`; ICE nhờ STUN, hoặc relay qua coturn nội bộ vì NAT của emulator); đưa app ra nền trong cuộc gọi vẫn còn tiếng (foreground service); xoay màn hình; đổi loa trong/ngoài; nhận thông báo đẩy khi app đóng (cần Firebase thật — **việc tay mục 8.2**); chạm thông báo mở đúng cuộc trò chuyện; ghi âm giọng nói trong WebView; chọn ảnh từ thư viện. Chưa kiểm được trên máy thật nhiều hãng (Doze, tiết kiệm pin hãng): ghi rõ trong báo cáo cuối giai đoạn.
- **Hiệu năng:** `size-limit` các chunk mới; Lighthouse không xấu đi ở màn đầu; đo CPU cuộc gọi 6 người thoại trên AVD và thiết bị thật **nếu có** (kiểm khi người dùng có máy).
- `pnpm build`, `pnpm test`, `pnpm lint:boundaries`, `kien-truc` xem lại (DB/auth/native/pháp lý), skill `kiem-truoc-khi-gop`.

## 12. Phụ thuộc và thứ tự gộp
| Phần của dự án 4 | Cần gì | Từ đâu | Nếu chưa có |
|---|---|---|---|
| Tệp đính kèm (ảnh/giọng nói), URL ký, xóa tệp khi xóa tài khoản | `BlobStore`, `sniffMedia`, `blob_deletions`, `purgeUserFeedbackBlobs` mẫu | dự án 5a Task 2 (PR #46, **đã gộp**) | Không còn chờ |
| Báo cáo → hàng chờ quản trị, khóa chat, nhật ký quản trị | hook `/admin/v1`, `admin_audit_log`, hàng chờ, `apps/admin` | 5a Task 4–6 | Test bằng phiên quản trị giả; ghép UI quản trị sau |
| Cổng tuổi ở màn tạo tài khoản | màn Tạo tài khoản, `PUT /v1/me/age` | dự án 3 Task 7 (đã gộp **[?: kiểm lại `main`]**) | Cổng tuổi ở lần mở Tin nhắn vẫn chạy độc lập |
| Chờ xóa 30 ngày, xóa cứng | `purgeExpiredAccounts`, `lifecycle.ts` | dự án 3 Task 4 (đã có ở `main`) | — |
| Cập nhật bản app tối thiểu cho WS (`4426`) | `updateGate` | dự án 8 | — |
| Thông báo đẩy khi trả lời góp ý | `PushProvider` | Task thông báo của dự án này | 5a để lại không làm; nối sau |

## 13. Kết quả người đọc độc lập rà
Người đọc độc lập (subagent chạy `builder-check-prompt.md`) hỏi 9 câu. Cách xử lý:
- **Đã có sẵn trong dự án hoặc là việc nhỏ → đã đưa vào tài liệu:** vòng đời WebSocket (mục 9: mở khi nền trước); bản đầu có nút Khóa + CLI (5.8); gộp từng đợt dưới cờ `CHAT_ENABLED` (mục 10); dự án 3 đã gộp (mục 10); tuổi chỉ áp cho chat, luồng mã mời cũ giữ nguyên (5.1); gọi nhóm lớn mời người được chọn (7.1); link mời bản đầu là mã + `becutit://` (mục 10); nghiệm thu trên máy dev (mục 10).
- **Chỉ người dùng trả lời được:** luật tuổi và dưới 18 đã được người dùng chốt 26/11 (đóng hẳn chat/gọi/nhóm; đủ 18 = năm hiện tại − năm sinh ≥ 18). Việc tay (Firebase, Cloudflare TURN, dung lượng) nằm ở danh sách cuối báo cáo.

## 14. Các điểm người thiết kế tự quyết (người dùng xem khi duyệt)
1. Giao thức: gửi tin bằng **REST**, WebSocket chỉ để đẩy/báo hiệu (4-A).
2. MFE mới `apps/mfe-social` (4-B); màn Bạn bè cũ giữ ở `mfe-learner`.
3. Thứ tự tin bằng `seq` theo cuộc trò chuyện, một dòng tin cho mọi thành viên (4-C, 4-D).
4. Handle riêng, lấy tên đăng nhập làm sẵn cho tài khoản mật khẩu (4-G).
5. Luật "đủ 18" từ năm sinh: cách năm sinh ≥ 18 năm (**người dùng chốt 26/11**); khai "chưa đủ" thì khóa 12 tháng (5.1).
6. **Dưới 18 đóng hẳn chat/gọi/nhóm** (chặt hơn mức người dùng nêu) (5.1). Khách không dùng chat (5.1).
7. Chỉ thêm vào nhóm người **là bạn** của mình; không có link mời nhóm; trần mềm 1.000 (6.1).
8. Bằng chứng báo cáo giữ 30 ngày sau khi đóng; xóa tài khoản xóa nội dung tin (5.9).
9. Thông báo đẩy mặc định ẩn nội dung; nhóm ≥ 200 người tắt thông báo mặc định (5.6, 8.3).
10. Ngân sách TURN tự đếm: 70% cảnh báo, 100% ngừng cấp TURN (7.3). Trần dung lượng chat riêng 5.000 MB (5.5).
11. Giới hạn tốc độ/chống spam (5.4); chính sách chất lượng theo số người trong cuộc gọi (7.2); ngân sách chunk (9).
12. Cuộc gọi đến khi app đóng: thông báo nổi có nút, chưa có đổ chuông toàn màn (8.4).
13. Khóa chat: bản đầu chưa step-up (chờ 5b) (5.8).
