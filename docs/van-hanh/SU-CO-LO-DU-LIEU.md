# Quy trình xử lý sự cố lộ dữ liệu cá nhân

> App: Học Tiếng Việt Cùng Bé Cu Tít. Áp dụng cho Gateway (`apps/gateway`), DB Postgres (Neon/Supabase khi triển khai) và kho backup.
> Căn cứ: Luật Bảo vệ dữ liệu cá nhân **91/2025/QH15** (hiệu lực 01/01/2026) và Nghị định **356/2025/NĐ-CP** (ban hành 31/12/2025, hiệu lực 01/01/2026). Nguồn ở [mục 8](#8-nguồn-pháp-lý-đã-kiểm-tra).
> Đây không phải tư vấn pháp lý. Trước khi nộp báo cáo thật, đối chiếu lại văn bản trên Công báo hoặc vbpl.vn.

**Đồng hồ 72 giờ bắt đầu chạy từ lúc PHÁT HIỆN vi phạm** (Luật 91, Điều 23 khoản 1), không phải lúc xác minh xong. Ghi lại giờ phát hiện ngay ở bước 1.

## 0. Vai trò (điền trước khi phát hành)

| Vai trò | Người | Liên lạc |
|---|---|---|
| Người phụ trách sự cố (quyết định, ký báo cáo) | [CẦN ĐIỀN] | [CẦN ĐIỀN] |
| Người/bộ phận bảo vệ dữ liệu cá nhân (theo Luật 91 Điều 33 khoản 2; ghi vào Mẫu số 08) | [CẦN ĐIỀN] | [CẦN ĐIỀN] |
| Kỹ thuật Gateway/DB (M1 – BE Lead) | [CẦN ĐIỀN] | [CẦN ĐIỀN] |
| Liên lạc với người dùng (thông báo trong app, cửa hàng ứng dụng) | [CẦN ĐIỀN] | [CẦN ĐIỀN] |
| Đơn vị tiếp nhận: cơ quan chuyên trách bảo vệ dữ liệu cá nhân (Bộ Công an), hoặc Cổng thông tin quốc gia về bảo vệ dữ liệu cá nhân | — | [CẦN ĐIỀN: địa chỉ/cổng tiếp nhận hiện hành] |

## 1. Phát hiện (giờ 0)

### Dấu hiệu bất thường

- Nhật ký `audit_events` (Gateway ghi; giữ 180 ngày):
  - `auth.refresh_reuse`: refresh token đã xoay vòng bị dùng lại. Đây là dấu hiệu token bị sao chép. Một dòng lẻ có thể chỉ do client gửi trùng; nhiều dòng, hoặc nhiều user cùng lúc, là đáng lo.
  - `auth.failure_burst`: một IP gửi nhiều token sai, mã khôi phục sai hoặc refresh token sai (≥ 5 lần trong 10 phút; mỗi cửa sổ một dòng).
  - `auth.recover` với `outcome = 'failure'` tăng vọt: có người đang dò mã khôi phục.
  - `auth.rate_limited`: IP chạm giới hạn `/v1/auth` (mỗi IP mỗi 10 phút một dòng).
  - `auth.guest_created` tăng đột biến: tạo khách hàng loạt để lấy hạn mức AI.
  - `friends.invite_accepted` với `reason = 'invite_invalid'` nhiều: có người đang dò mã mời.
  - `account.deleted` tăng bất thường.
- Ngoài Gateway:
  - Hóa đơn hoặc hạn mức Gemini tăng bất thường: có thể khóa API đã lộ.
  - Cảnh báo từ Neon/Supabase: đăng nhập lạ, truy vấn lớn, xuất dữ liệu.
  - GitHub secret scanning báo lộ khóa trong repo.
  - Người dùng hoặc bên thứ ba báo tin.

### Truy vấn nhanh (chạy bằng `psql "$DATABASE_URL"`, chỉ đọc)

```sql
-- Tổng quan 24 giờ qua theo loại/kết quả
SELECT type, outcome, count(*) FROM audit_events
WHERE created_at > now() - interval '24 hours' GROUP BY 1, 2 ORDER BY 3 DESC;

-- So với trung bình 7 ngày trước (theo giờ) để thấy đột biến
SELECT date_trunc('hour', created_at) AS h, type, count(*) FROM audit_events
WHERE created_at > now() - interval '8 days' GROUP BY 1, 2 ORDER BY 1 DESC, 3 DESC;

-- IP (đã băm) đáng ngờ: nhiều lỗi xác thực / chạm rate limit
SELECT ip_hash, type, count(*), min(created_at), max(created_at) FROM audit_events
WHERE type IN ('auth.failure_burst', 'auth.rate_limited', 'auth.recover', 'auth.refresh_reuse')
  AND outcome <> 'success' AND created_at > now() - interval '7 days'
GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 50;

-- Tài khoản bị dùng lại refresh token (ứng viên token bị đánh cắp)
SELECT user_id, count(*), max(created_at) FROM audit_events
WHERE type = 'auth.refresh_reuse' AND created_at > now() - interval '7 days'
GROUP BY 1 ORDER BY 2 DESC;

-- Mọi hoạt động của một IP đã băm (ip_hash lấy từ truy vấn trên)
SELECT created_at, type, outcome, user_id, user_agent, metadata FROM audit_events
WHERE ip_hash = '<ip_hash>' ORDER BY created_at;
```

Để biết một IP thô (ví dụ từ log nhà cung cấp) có trong `audit_events` không, băm nó bằng cùng muối:
`node -e "console.log(require('crypto').createHmac('sha256', process.env.AUDIT_IP_SALT).update('1.2.3.4').digest('hex').slice(0,32))"`.
**Không đổi `AUDIT_IP_SALT` trong lúc xử lý sự cố**: đổi muối thì không còn đối chiếu được IP trước và sau.

### Việc phải làm ngay

1. Ghi **giờ phát hiện** (UTC và giờ Việt Nam), người phát hiện, nguồn tin.
2. Mở hồ sơ sự cố `[CẦN ĐIỀN: nơi lưu, ví dụ thư mục riêng tư]`. Hồ sơ phải giữ tối thiểu 5 năm kể từ ngày khắc phục xong (Nghị định 356 Điều 29 khoản 1 điểm c, áp dụng bắt buộc cho dữ liệu vị trí/sinh trắc học; ta áp dụng cho mọi sự cố).
3. Báo người phụ trách sự cố.

## 2. Khoanh vùng (giờ 0–12)

Mục tiêu: chặn rò rỉ đang diễn ra, giữ bằng chứng.

- **Giữ bằng chứng trước khi sửa:**
  - Chạy `pnpm --filter @vietlearning/gateway db:backup` (xem [BACKUP.md](BACKUP.md)) để có bản chụp DB lúc phát hiện.
  - Xuất `audit_events` liên quan ra tệp.
  - Lưu log của nền tảng triển khai.
- **Xác định phạm vi:**
  - Những bảng nào bị đọc hoặc xuất. Dữ liệu server lưu xem trong `packages/contracts/src/db/schema.ts`: hồ sơ học, thẻ SM-2, tiến độ, XP, thời gian học, tên hiển thị bạn học, mã mời.
  - Bao nhiêu tài khoản bị ảnh hưởng.
  - Khoảng thời gian.
  - Theo thiết kế, server KHÔNG lưu nội dung chat, ảnh camera hay giọng nói, nên cần xác nhận lại điều này với log.
- **Phân loại dữ liệu:**
  - App không thu thập dữ liệu vị trí. Server không lưu dữ liệu sinh trắc học: giọng nói chỉ được chuyển tiếp để chấm phát âm, không lưu.
  - Nếu điều tra cho thấy có lộ loại dữ liệu này, áp dụng thêm Nghị định 356 Điều 29 (xem bước 5).
- **Chặn:**
  - Tạm tắt route bị khai thác, chặn IP hoặc dải IP ở tầng proxy, siết `AUTH_RATE_LIMIT_PER_MINUTE`.
  - Nếu cần, dừng hẳn tiến trình Gateway. App vẫn chạy offline (local-first). Chế độ bảo trì riêng `[CẦN ĐIỀN: chưa có — việc sau]`.

## 3. Thu hồi khóa (giờ 0–24, song song bước 2)

> **Ghi giờ (UTC) của mỗi lần xoay hoặc thu hồi vào hồ sơ, và lọc các truy vấn ở bước 1 đến TRƯỚC mốc đó.** Sau khi thu hồi hàng loạt refresh token, lần làm mới kế tiếp của mọi client hợp lệ sẽ bị ghi `auth.refresh_reuse`. Sau khi xoay `JWT_SECRET`, access token cũ còn hạn bị coi là token sai và cộng vào `auth.failure_burst`. Đây là nhiễu do chính ta tạo ra, không phải dấu hiệu tấn công mới.

| Bí mật | Cách thu hồi | Hệ quả |
|---|---|---|
| `GEMINI_API_KEY` | Google AI Studio / Cloud Console: xóa khóa cũ, tạo khóa mới, cập nhật biến môi trường server, khởi động lại Gateway. Khóa chỉ nằm ở server (Nguyên tắc 2). | Không ảnh hưởng người dùng. Trong lúc chưa có khóa, Gateway tự chạy bộ giả lập (`mock: true`). |
| `JWT_SECRET` | Sinh giá trị mới (≥ 32 ký tự), cập nhật env, khởi động lại. | **Mọi access token hết hiệu lực ngay.** Client tự làm mới bằng refresh token (lưu trong DB, không phụ thuộc `JWT_SECRET`). |
| Refresh token | Nếu nghi refresh token bị lộ: `UPDATE refresh_tokens SET revoked_at = now() WHERE revoked_at IS NULL [AND user_id IN (...)];` | Người dùng bị đăng xuất. Họ đăng nhập lại bằng **mã khôi phục**, dữ liệu vẫn còn. |
| Mã khôi phục | DB chỉ lưu sha256. Nếu bảng `users` bị lộ, mã 80 bit vẫn khó dò ngược, nhưng nên khuyên người dùng tạo mã mới (tính năng này `[CẦN ĐIỀN: chưa có — việc sau]`). | — |
| `DATABASE_URL` (mật khẩu DB) | Đổi mật khẩu ở Neon/Supabase, cập nhật env. | Gateway khởi động lại. |
| `AUDIT_IP_SALT` | **Không đổi** trong sự cố. Chỉ đổi khi chính muối bị lộ, và ghi rõ thời điểm đổi trong hồ sơ. | Mất khả năng đối chiếu IP trước và sau thời điểm đổi. |
| Khóa object storage chứa backup | Xoay khóa, kiểm tra log truy cập bucket. | — |

## 4. Báo cáo cơ quan chuyên trách: chậm nhất 72 giờ kể từ khi phát hiện

**Khi nào bắt buộc** (Luật 91, Điều 23 khoản 1): bên kiểm soát dữ liệu phát hiện vi phạm có thể gây tổn hại đến quốc phòng, an ninh quốc gia, trật tự, an toàn xã hội, hoặc xâm phạm tính mạng, sức khỏe, danh dự, nhân phẩm, tài sản của chủ thể dữ liệu. Khi đó phải thông báo cho **cơ quan chuyên trách bảo vệ dữ liệu cá nhân** (thuộc Bộ Công an, Luật 91 Điều 33 khoản 1 điểm a) chậm nhất 72 giờ kể từ khi phát hiện.

Điều 23 khoản 3 còn yêu cầu thông báo trong các trường hợp:

- phát hiện vi phạm;
- dữ liệu bị xử lý sai mục đích đã thỏa thuận;
- quyền của chủ thể dữ liệu không được bảo đảm.

Khoản này không ghi thời hạn riêng. **Quy tắc của dự án: nếu có nghi ngờ, vẫn báo trong 72 giờ.** Báo thừa an toàn hơn báo trễ.

Ngoài báo cáo, bên kiểm soát phải:

- lập **biên bản xác nhận** việc xảy ra vi phạm (Điều 23 khoản 2);
- phối hợp với cơ quan chuyên trách, ngừng vi phạm và khắc phục hậu quả (khoản 4).

**Hình thức gửi** (Nghị định 356, Điều 28 khoản 2): gửi cơ quan chuyên trách, hoặc qua Cổng thông tin quốc gia về bảo vệ dữ liệu cá nhân, theo **Mẫu số 08** trong Phụ lục của Nghị định. Phải lấy mẫu gốc từ Phụ lục khi nộp; bố cục chi tiết của mẫu **chưa được kiểm tra** trong lần soạn này.

**Nội dung bắt buộc** (Nghị định 356, Điều 28 khoản 1). Phần nháp dưới đây điền sẵn những gì hệ thống tự trả lời được:

```text
THÔNG BÁO VI PHẠM QUY ĐỊNH VỀ BẢO VỆ DỮ LIỆU CÁ NHÂN (theo Mẫu số 08, NĐ 356/2025/NĐ-CP)
Kính gửi: Cơ quan chuyên trách bảo vệ dữ liệu cá nhân — Bộ Công an

Bên kiểm soát dữ liệu: [CẦN ĐIỀN: tên tổ chức/cá nhân vận hành app, địa chỉ, mã số]
Ứng dụng: Học Tiếng Việt Cùng Bé Cu Tít (Android; web)

a) Mô tả vi phạm
   - Thời điểm xảy ra (ước tính): ____  | Thời điểm phát hiện: ____ (giờ VN)
   - Địa điểm / hệ thống: Gateway API [CẦN ĐIỀN: tên miền], DB Postgres [CẦN ĐIỀN: nhà cung cấp, vùng]
   - Hành vi: ____ (truy cập trái phép / lộ khóa / xuất dữ liệu / ...)
   - Tổ chức, cá nhân liên quan: ____
   - Loại dữ liệu cá nhân và số lượng: ____ (ví dụ: mã định danh tài khoản khách ngẫu nhiên, tên hiển thị tự chọn,
     tiến độ học, thời gian học; N tài khoản; khoảng thời gian ...). Tài khoản khách không có email, số điện thoại, tên thật.
b) Liên lạc người/bộ phận bảo vệ dữ liệu cá nhân: [CẦN ĐIỀN]
c) Hậu quả, thiệt hại có thể xảy ra: ____
d) Biện pháp đã thực hiện để giải quyết, giảm thiểu tác hại: ____ (thu hồi khóa, vô hiệu token, chặn IP, vá lỗi ...)

Tài liệu kèm theo: biên bản xác nhận vi phạm; trích xuất audit_events liên quan.
[Địa điểm], ngày ... tháng ... năm ...      Người đại diện: [CẦN ĐIỀN] (ký, ghi rõ họ tên)
```

Nếu sau 72 giờ vẫn chưa đủ thông tin, **vẫn gửi đúng hạn** với những gì đã biết, rồi gửi bổ sung. Văn bản đã đọc không quy định gia hạn cho thông báo theo Điều 23.

## 5. Thông báo người dùng

- **Bắt buộc theo Nghị định 356 Điều 29 khi lộ dữ liệu VỊ TRÍ hoặc SINH TRẮC HỌC:**
  - Thông báo chủ thể bị ảnh hưởng chậm nhất **72 giờ** kể từ khi phát hiện (khoản 1).
  - Nội dung tối thiểu (khoản 2): thời điểm và cách phát hiện; loại dữ liệu bị ảnh hưởng; mức độ và rủi ro; biện pháp đã, đang và sẽ làm; hướng dẫn người dùng tự phòng ngừa; liên lạc người bảo vệ dữ liệu và đơn vị xử lý sự cố.
  - Nếu không gửi riêng từng người kịp vì lý do kỹ thuật hoặc khẩn cấp: đăng thông báo công khai trên kênh điện tử chính thức (website, ứng dụng), rồi gửi riêng khi có điều kiện (khoản 3).
  - Chậm hoặc né tránh thông báo sẽ bị xem xét xử lý (khoản 4).
- **Các loại dữ liệu khác:** văn bản đã đọc không bắt buộc thông báo người dùng. Quy tắc của dự án là **vẫn thông báo** khi tài khoản người dùng bị ảnh hưởng, cùng nội dung tối thiểu như trên.
- **Kênh liên lạc:** tài khoản khách không có email hay số điện thoại, nên kênh khả thi là:
  - banner trong app (Gateway có thể trả cờ qua API, `[CẦN ĐIỀN: chưa có — việc sau]`);
  - trang thông báo trên website;
  - ghi chú phát hành trên cửa hàng ứng dụng.
- **Hướng dẫn người dùng:** cập nhật app; đăng nhập lại bằng mã khôi phục nếu bị đăng xuất; có thể xóa tài khoản trong mục Quyền riêng tư.

## 6. Khắc phục và rút kinh nghiệm (trong 2 tuần)

- Vá lỗ hổng gốc. Thêm test hồi quy và, nếu cần, loại sự kiện `audit_events` mới để lần sau phát hiện sớm hơn.
- Nếu khôi phục từ backup, nhớ làm lại các lần xóa tài khoản sau thời điểm backup (xem [BACKUP.md](BACKUP.md) §5).
- Họp rút kinh nghiệm không đổ lỗi. Ghi lại:
  - dòng thời gian (phát hiện → khoanh vùng → báo cáo → khắc phục);
  - nguyên nhân gốc;
  - điều đã làm tốt và chưa tốt;
  - việc cần làm, có người nhận và hạn.
- Cập nhật tài liệu này, chính sách quyền riêng tư (`apps/host-shell/src/privacyI18n.ts`) nếu thay đổi cách xử lý dữ liệu, và nhật ký `docs/NHAT_KY_CHUYEN_DOI_MOBILE.md`.
- Lưu hồ sơ sự cố tối thiểu 5 năm.

## 7. Diễn tập

Mỗi học kỳ diễn tập một lần trên môi trường thử, kịch bản "lộ `JWT_SECRET` + refresh token":

1. Phát hiện bằng truy vấn `audit_events`.
2. Xoay khóa.
3. Kiểm tra app tự làm mới phiên.
4. Điền nháp Mẫu số 08 trong ≤ 72 giờ (tính giả lập).

Ghi kết quả vào `docs/nhat-ky/`.

## 8. Nguồn pháp lý đã kiểm tra

Truy cập ngày 19/11/2026. Không có quyền truy cập trực tiếp Công báo; đọc qua trang trích văn bản từ vbpl.

- Luật 91/2025/QH15, Điều 23 (đọc nguyên văn), Điều 33 và Điều 38 (đọc từ trang chương): https://lawplayer.com/vn/act/vn-vbpl-179252/section/chapter-2.section-1, https://lawplayer.com/vn/act/vn-vbpl-179252/section/chapter-3, https://lawplayer.com/vn/act/vn-vbpl-179252/section/chapter-5
- Nghị định 356/2025/NĐ-CP:
  - Điều 28: https://lawplayer.com/vn/article/vn-vbpl-187276/e0028
  - Điều 29: https://lawplayer.com/vn/article/vn-vbpl-187276/e0029
- **Bản chính thức cần đối chiếu** (chưa mở trong lần soạn này): bản .doc của NĐ 356 trên vbpl, https://vbpl.moj.gov.vn/TW/Lists/vbpq/Attachments/187276/ND.356.2025.doc; Công báo.
- Đối chiếu thứ cấp (Mẫu số 08, ngày ban hành/hiệu lực):
  - https://luatvietnam.vn/bieu-mau/mau-thong-bao-vi-pham-quy-dinh-ve-bao-ve-du-lieu-ca-nhan-moi-nhat-571-106398-article.html
  - https://www.ey.com/vi_vn/technical/tax/tax-and-law-updates/nghi-dinh-so-356-2025-nd-cp-quy-dinh-chi-tiet-mot-so-dieu-va-bien-phap-thi-hanh-luat-bao-ve-du-lieu-ca-nhan
  - https://www.tilleke.com/insights/new-decree-provides-guidance-for-vietnams-personal-data-protection-law/

**Chưa kiểm tra được nguyên văn:**

- bố cục Mẫu số 08;
- địa chỉ hoặc cổng tiếp nhận hiện hành của cơ quan chuyên trách;
- mức phạt khi không thông báo (một số bài viết nêu con số, nhưng chưa đối chiếu với nghị định xử phạt).

Không dùng các thông tin này như sự thật khi chưa kiểm tra.
