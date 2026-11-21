# Đề xuất triển khai: tên miền miễn phí + kiến trúc SaaS (DB, FE, BE)

> Ngày: 21/11/2026 · Trạng thái: **ĐỀ XUẤT, chưa tạo tài khoản, chưa triển khai, chưa sửa code.**
> Ký hiệu: **[C]** = đã đọc trong repo · **[N, ngày]** = đọc qua kết quả tìm kiếm/trang chính thức ngày đó, **phải mở lại trang gốc trước khi chốt** · **[?]** = chưa xác nhận được, hoặc các nguồn mâu thuẫn.
> Cách tra: tôi chỉ có công cụ tìm kiếm trả về tóm tắt, **không mở được từng trang gốc**. Vì vậy mọi con số bên dưới đều mang nhãn [N] (tóm tắt) chứ chưa phải "đọc nguyên văn". Chỗ nào tóm tắt nguồn chính thức mâu thuẫn tóm tắt bên thứ ba, tôi ghi cả hai.
> Đầu vào repo: `docs/van-hanh/BACKUP.md`, `docs/van-hanh/SU-CO-LO-DU-LIEU.md`, `docs/phap-ly/DANH-GIA-TAC-DONG.md` (mục A.a: hạ tầng ngoài VN là thêm một luồng chuyển xuyên biên giới), `docs/KE_HOACH_PHAT_TRIEN_TOAN_DIEN.md:233,238` (D2: Neon + Drizzle), `docs/thiet-ke/DE-XUAT-DANG-NHAP-PHAN-QUYEN.md`, `.github/workflows/ci.yml`, `apps/gateway/src/config.ts`.

---

## 0. Tóm tắt (đọc phần này là đủ)

1. **Tên miền chính: `<tên>.id.vn`** (VNNIC, miễn phí, tên miền thật nên dùng được cho OAuth Google, mail, App Links). **Dự phòng: tên miền phụ `*.pages.dev`/`*.onrender.com` chỉ để chạy staging và thử nghiệm**. (Đính chính 21/11: một số tên miền phụ như `*.vercel.app`/`*.pages.dev` nằm trong Public Suffix List nên *có thể* khai làm tên miền được ủy quyền cho màn đồng ý Google — chưa thử; người dùng đã chọn `.id.vn` từ đầu nên không phụ thuộc điểm này.) Khi có doanh thu, hoặc khi cần uy tín cho chính sách quyền riêng tư công khai: mua `.com`/`.com.vn` (~vài trăm nghìn đồng/năm [?]).
2. **Kiến trúc: "một bản dùng chung, ít mảnh":** FE tĩnh trên **Cloudflare Pages** · Gateway Node trên **một dịch vụ container** (staging: Render free; prod: gói trả phí nhỏ ~7 USD/tháng [?], không ngủ) · DB **Neon Postgres, vùng Singapore** · tệp trong **Cloudflare R2** · TURN **Cloudflare Realtime** · FCM · Resend khi có tên miền · Sentry free. Không microservice, không Kubernetes.
3. **Chi phí:** 0 người dùng = **0 đ** (nhưng Gateway ngủ, WebSocket chập chờn); 100 MAU ≈ **0–7 USD/tháng**; 1.000 MAU ≈ **7–25 USD/tháng**; 10.000 MAU ≈ **50–150 USD/tháng** (ước lượng thô, mục 2.6).
4. **Pháp lý:** đặt DB/BE ở nước ngoài ⇒ thêm luồng chuyển xuyên biên giới vào hồ sơ Mẫu 09 (đã có khung trong `docs/phap-ly/`). Chọn **Singapore** cho DB để giảm độ trễ cho người dùng VN; Singapore không làm hồ sơ nhẹ hơn, chỉ làm app nhanh hơn.
5. **Việc người dùng phải làm trước:** đăng ký `.id.vn` (eKYC bằng CCCD), tạo tài khoản Cloudflare/Neon/Render (mục 5).

---

## 1. Tên miền miễn phí

### 1.1 Bảng so sánh

Tiêu chí "OAuth Google": màn đồng ý cần trang chủ và trang chính sách nằm trên **tên miền cấp cao riêng của bạn** (top private domain) đã xác minh quyền sở hữu; tên miền phụ của một dịch vụ chung nằm trong Public Suffix List (`pages.dev`, `vercel.app`…) thì bạn **không đăng ký/không xác minh được** làm miền được ủy quyền. Đây là suy luận từ quy định Google [N, 21/11/2026: [Google, xác minh thương hiệu](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification), [hướng dẫn xác minh client](https://developers.google.com/apps-script/guides/client-verification)], **không phải câu Google nói thẳng về từng tên miền** ⇒ [?] cho từng trường hợp cụ thể, nên thử bằng một dự án OAuth ở trạng thái "Testing" trước.

| Lựa chọn | Miễn phí thật? | OAuth Google | Gửi mail (SPF/DKIM) | App Links Android | Rủi ro |
|---|---|---|---|---|---|
| **`.id.vn` (VNNIC)** | Có, 3 năm đầu theo tin báo [N]; sau đó ~50.000 đ/năm [?] | **Có** (tên miền riêng, xác minh được) | **Có** nếu nhà đăng ký cho sửa DNS (TXT/CNAME) [?: kiểm khi đăng ký] hoặc trỏ NS về Cloudflare | **Có** (đặt `assetlinks.json` ở `https://<tên>.id.vn/.well-known/`) | Điều kiện công dân/độ tuổi, eKYC sai khó sửa; hết ưu đãi phải trả phí; đuôi `.id.vn` là tên miền cá nhân, **không dành cho tổ chức** nên khi lập doanh nghiệp nên đổi sang `.com.vn`/`.com` |
| `*.pages.dev` (Cloudflare Pages) | Có | **Không** (miền chung) [N, suy luận] | Không (không có DNS riêng) | Có kỹ thuật (HTTPS, host cố định) nhưng gắn nền tảng | Bị đổi tên project là đổi URL; uy tín thấp; mail không được |
| `*.vercel.app` | Có, **nhưng Hobby chỉ cho dùng phi thương mại** [N: [Vercel fair use](https://vercel.com/docs/platform/fair-use-policy)] | **Không** (miền chung) | Không | Có kỹ thuật | Vi phạm điều khoản nếu app thu phí/quảng cáo ⇒ không chọn làm FE chính |
| `*.netlify.app` | Có, gói free tính theo "credit" 300/tháng, cứng, cho phép thương mại [N, bài bên thứ ba; [?] đối chiếu trang Netlify] | **Không** | Không | Có kỹ thuật | Hết credit là site dừng |
| `*.onrender.com` | Có (web service free) | **Không** | Không | Có kỹ thuật | Ngủ sau 15 phút không có traffic [N: [Render free](https://render.com/docs/free)] |
| `eu.org` | Có, miễn phí, hậu tố `xxx.eu.org` | Có (là miền riêng đăng ký được) | Có (tự quản DNS) | Có | **Chờ duyệt có thể hàng tháng/năm; tình trạng nhận đăng ký 2026 chưa rõ** (chỉ có diễn đàn, một bài nói đã ngừng) [?]; do một người vận hành ⇒ không nên là đường găng |
| `is-a.dev` (GitHub PR) | Có | Có thể, [?] chưa tra được điều khoản dùng cho app thương mại | Có thể [?] | Có thể [?] | Dành cho **dự án của nhà phát triển**; quy tắc nội dung và quyền thu hồi [?] chưa xác nhận |
| Freenom (`.tk/.ml/.ga/.cf/.gq`) | **Đã ngừng đăng ký mới** (theo yêu cầu của đề bài; tôi không tra lại) | — | — | — | Loại |

### 1.2 Điều kiện `.id.vn` (chỗ cần kiểm lại trước khi làm)

- Bản tin **17/10/2026** báo VNNIC sẽ kéo miễn phí `.id.vn`/`.biz.vn` từ 2 năm lên **3 năm** [N: [VietnamNews](https://vietnamnews.vn/economy/1802210/viet-nam-extends-free-id-vn-biz-vn-domain-fees-to-three-years.html), [VOV](https://english.vov.vn/en/economy/vietnam-extends-free-idvn-bizvn-domain-fees-to-three-years-post1342362.vov)]. Một bài khác nêu chính sách miễn lệ phí đăng ký + duy trì áp dụng **01/01/2027–31/12/2030**, 3 năm kể từ ngày cấp, phí duy trì từ năm thứ tư; và nhắc **Thông tư 149/2026/TT-BTC** hiệu lực 23/11/2026 [N: [Doanh nhân & Pháp luật](https://doanhnhan.baophapluat.vn/ten-mien-vn-mien-phi-3-nam-mo-rong-co-hoi-hien-dien-so-cho-doanh-nghiep.html)]. **Các nguồn đang không khớp mốc ngày ⇒ [?]: nếu ưu đãi 3 năm chỉ tính từ 01/01/2027 thì đăng ký trong tháng 11–12/2026 có thể chỉ được mức 2 năm cũ**; nên hỏi nhà đăng ký đúng thời điểm đăng ký.
- Đối tượng: công dân Việt Nam trong độ tuổi của chương trình, ngày sinh đọc từ CCCD qua eKYC; **tuổi cụ thể chưa thấy ở nguồn nào** [?] [N: [QUASA](https://quasa.io/vi/media/ten-mien-idvn-mien-phi-2-nam-chon-sai-ho-so-ekyc-rat-kho-sua), [Tenten](https://tenten.vn/en/ten-mien/id-vn)]. Quảng cáo gốc: thanh niên, sinh viên.
- Phí sau ưu đãi: 50.000 đ/năm [?, một bài viết dẫn biểu phí VNNIC].
- Đăng ký trực tuyến hoàn toàn; chính thức từ 01/6/2023.
- Sai thông tin eKYC khó sửa [N: bài QUASA ở trên] ⇒ làm đúng ngay lần đầu. (Yêu cầu "đăng ký đúng họ tên thật" là suy luận của tôi từ eKYC CCCD [?].)

### 1.3 Đề xuất

| Vai trò | Chọn | Lý do |
|---|---|---|
| **Chính** | `.id.vn` (đăng ký qua một nhà đăng ký/OnePortal; trỏ NS về **Cloudflare DNS** để dùng chung với Pages, R2, Resend) | Duy nhất vừa miễn phí vừa là tên miền riêng đủ điều kiện OAuth, mail, App Links. Rủi ro lớn nhất là điều kiện cá nhân/độ tuổi, nên **kiểm điều kiện trước, đừng mua hosting đi kèm**. |
| **Dự phòng** | `*.pages.dev` (FE) và `*.onrender.com` (BE) **cho staging**; nếu `.id.vn` bị từ chối thì mua `.com` rẻ nhất (khoảng 10–15 USD/năm [?: giá do nhà đăng ký, chưa tra được]) | Staging không cần OAuth công khai. Giá `.com` và `.com.vn` **chưa tra được** ⇒ [?]; chỉ chốt khi mở trang nhà đăng ký. |
| **Khi nào mua tên miền thật** | (a) phát hành store công khai và cần chính sách quyền riêng tư trên miền mang thương hiệu; (b) có người ngoài chủ app cần dùng chung tên miền (`.id.vn` gắn danh tính cá nhân); (c) gói trả phí dự án 6 bắt đầu thu tiền; (d) `.id.vn` hết ưu đãi và không muốn trả/không còn đủ điều kiện | `.com.vn` cần giấy tờ tổ chức; `.com` thì không |

---

## 2. Kiến trúc triển khai SaaS

### 2.1 Sơ đồ

```
 Người dùng
  │  Android (APK Capacitor)         Trình duyệt (PWA)
  │          │                              │
  │          └───────── HTTPS ──────────────┤
  ▼                                          ▼
┌──────────────────────┐             ┌──────────────────────────┐
│  FE tĩnh (PWA)       │  fetch/SSE  │  Gateway Fastify (Node)  │──► Gemini/AI (nước ngoài)
│  Cloudflare Pages    │────────────►│  1 container, 1 vùng     │──► Resend (mail OTP)
│  app.<tên>.id.vn     │  WebSocket  │  api.<tên>.id.vn         │──► FCM (thông báo đẩy)
└──────────────────────┘◄────────────│  /v1/* , /ws , /health   │──► Sentry (lỗi)
        ▲                            └───┬───────────┬──────────┘
        │ tệp tĩnh âm thanh             │           │
        │ (gói dựng sẵn)                ▼           ▼
┌───────┴────────┐          ┌────────────────┐  ┌─────────────────────┐
│ Cloudflare R2  │◄─────────│ Neon Postgres  │  │ TURN: Cloudflare     │
│ ảnh/giọng chat │ URL ký   │ Singapore      │  │ Realtime (WebRTC)    │
│ + backup dump  │          │ nhánh dev/stg  │  └─────────────────────┘
└────────────────┘          └────────────────┘
   CI/CD (GitHub Actions): verify ► migrate (staging) ► deploy BE ► deploy FE ► smoke test
```

### 2.2 Bảng thành phần

| Thành phần | Chọn | Gói free: giới hạn quan trọng | Vấn đề | Nguồn |
|---|---|---|---|---|
| **FE PWA tĩnh** | **Cloudflare Pages** | 500 build/tháng, băng thông không giới hạn, 100 miền tùy chỉnh/dự án, 20.000 tệp | Không dùng cho SSR (app không cần) | [N 21/11: [limits](https://developers.cloudflare.com/pages/platform/limits)] |
| *(thay thế FE)* | Netlify | 300 credit/tháng cứng | Hết credit là dừng | [N, bên thứ ba] |
| *(không chọn FE)* | Vercel Hobby | — | **Chỉ phi thương mại** | [N: [fair use](https://vercel.com/docs/platform/fair-use-policy)] |
| **BE Gateway** (staging) | **Render free web service** | 750 giờ/tháng/workspace; **ngủ sau 15 phút không có traffic** (traffic WebSocket đang mở được tính là hoạt động); đánh thức ~1 phút; khi hết giờ thì dừng đến đầu tháng sau | Một người dùng báo WebSocket rớt lúc ~15 phút dù ping 30 giây (chỉ là giai thoại) ⇒ **phải thử** | [N: [Render free](https://render.com/docs/free)] |
| **BE Gateway** (prod) | **Render gói trả phí nhỏ** (không ngủ) *hoặc* Fly.io *hoặc* Cloud Run | Render: gói trả phí **không ngủ** [N: [Render FAQ](https://render.com/docs/faq)]; giá ~7 USD/tháng cho gói nhỏ nhất [?: chưa tra được bảng giá] | Render chưa xác nhận có vùng Singapore cho gói đó [?] | |
| *(BE thay thế)* Fly.io | pay-as-you-go | **Không còn gói free cho khách mới** (trial ngắn); 1 máy shared-cpu 256MB chạy 24/7 ≈ 2 USD/tháng tính toán thô [?: tóm tắt bên thứ ba] | Có vùng Singapore [?]; cần thẻ | [N: [Fly pricing](https://fly.io/pricing), [discontinued plans](https://fly.io/docs/about/discontinued-plans/)] |
| *(BE thay thế)* Koyeb | free instance | **Ngủ sau 1 giờ không traffic**, không tắt được; **gói free không có vùng Singapore** (Frankfurt/Washington) | Nghi vấn WebSocket có giữ thức không: chỉ blog bên thứ ba, chưa xác nhận [?] | [N: [Koyeb scale-to-zero](https://www.koyeb.com/docs/run-and-scale/scale-to-zero)] |
| *(BE thay thế)* Cloud Run | pay-per-use + free | Free hằng tháng: ~2 triệu request và ~180.000–240.000 vCPU-giây (hai trang ghi hai số ⇒ [?]); **WebSocket tối đa 60 phút/kết nối**, máy có kết nối đang mở bị tính là đang hoạt động ⇒ tốn vCPU-giây | Cần thẻ + dự án GCP; chat realtime ăn hết free nhanh | [N: [Cloud Run WebSockets](https://docs.cloud.google.com/run/docs/triggering/websockets)] |
| **DB Postgres** | **Neon** | **100 dự án, 10 nhánh/dự án, 100 CU-giờ/tháng/dự án, 1 GB/dự án (tối đa 20 GB tổng), 5 GB egress; không tính phí vượt (gói free)** [N: neon.com/faqs cập nhật 01/10/2026]; trang cũ ghi 0,5 GB/191,9 giờ ⇒ **số mới nhất, đối chiếu lại** | Compute tự dừng khi rảnh (khởi động lại vài trăm ms [?]); restore window gói free ngắn [?] | [N: [Neon free plan limits](https://neon.com/faqs/free-plan-limits-and-quotas)] |
| *Vùng DB* | Neon có **`aws-ap-southeast-1` (Singapore)** [N: [Neon regions](https://neon.com/docs/introduction/regions)] | | | |
| *(DB thay thế)* Supabase | Free | **500 MB DB**, 1 GB file, 5 GB egress, 2 dự án đang chạy; **dự án free bị tạm dừng nếu ít hoạt động trong 1 tuần**; paid từ 25 USD/tháng | Tạm dừng DB prod là không chấp nhận được; nhánh DB không có ở gói free [?] | [N: [pause FAQ](https://supabase.com/kb/faqs/platform/free-project-pausing), [pricing](https://supabase.com/pricing)] |
| *(không chọn)* Render Postgres free | | **Hết hạn sau 30 ngày**, 1 GB, **không có backup** | | [N: [Render changelog](https://render.com/changelog/free-postgresql-instances-now-expire-after-30-days-previously-90)] |
| **Lưu tệp** (ảnh/giọng chat, dump backup) | **Cloudflare R2** | 10 GB-tháng, 1 triệu thao tác ghi/liệt kê, 10 triệu đọc/tháng; **không phí egress** | Phải tự cấp URL ký ngắn hạn qua Gateway | [N: [R2 pricing](https://developers.cloudflare.com/r2/pricing)] |
| **TURN** (WebRTC) | **Cloudflare Realtime TURN** | 1.000 GB/tháng free (dùng chung với SFU), sau đó 0,05 USD/GB | Cần Gateway phát thông tin xác thực TURN ngắn hạn | [N: [Realtime pricing](https://developers.cloudflare.com/realtime/pricing/)] |
| *(TURN thay thế)* Metered | | Nguồn mâu thuẫn: Open Relay 20 GB/tháng vs bảng giá hiện tại ghi gói free 500 MB thử [?] | | [N: [Metered pricing](https://metered.ca/pricing)] |
| **Thông báo đẩy** | **FCM** | Không phí sử dụng [N: [Firebase](https://firebase.google.com/products/cloud-messaging/)] | Cần dự án Firebase + `google-services.json` (không bí mật khóa, nhưng khóa dịch vụ phía server là **bí mật**) | |
| **Email** | Hiện: Gmail SMTP. Khi có tên miền: **Resend** | 3.000 thư/tháng, **100 thư/ngày** (tính cả thư nhận); số miền tùy chỉnh free: 1 hay 3 [?] | Gmail SMTP: hạn mức ngày thấp và có thể bị khóa; chỉ cho thử nghiệm. Giới hạn 100/ngày làm OTP đăng ký đồng loạt bị nghẽn ⇒ ~100 lượt đăng ký/ngày | [N: [Resend limits](https://resend.com/docs/knowledge-base/resend-sending-limits)] |
| **Giám sát lỗi** | **Sentry Developer (free)** | 1 người dùng, ~5.000 lỗi/tháng [N, bài 2026; trang chính thức chỉ thấy mảnh] | Chỉ một ghế; client phải **lọc dữ liệu cá nhân** trước khi gửi (mục 4) | [N: [Sentry pricing](https://sentry.io/pricing/)] |
| **Log** | Log của nền tảng BE (xem 7 ngày [?]) + log JSON ra stdout; **không** thêm dịch vụ log riêng ở giai đoạn đầu | | Không lưu lâu; nếu cần, đẩy log lỗi quan trọng qua Sentry | |
| **Uptime** | Một dịch vụ ping `GET /health` mỗi 5 phút (UptimeRobot/Better Stack free [?: chưa tra]) | Ping còn **giữ Render free không ngủ nếu ping < 15 phút**, nhưng đốt 750 giờ ⇒ chỉ dùng cho staging khi cần | | |

### 2.3 Gateway trên "free có ngủ": hệ quả cho app này

- **Chat bạn bè realtime (WebSocket):** cần Gateway **luôn thức** vì kết nối WebSocket đến phải đánh thức dịch vụ (vài chục giây đến ~1 phút trên Render [N]). Với thông báo đẩy, máy chủ ngủ cũng không gửi được nếu không có sự kiện đánh thức. ⇒ **Staging chấp nhận ngủ; prod phải trả phí nhỏ hoặc chạy trên máy luôn bật.**
- **App là local-first** (`packages/state/src/sync.ts`, BACKUP.md): ngắt kết nối chỉ làm trễ đồng bộ, không mất dữ liệu ⇒ Gateway ngủ chấp nhận được cho **học và đồng bộ**, không chấp nhận được cho **chat realtime và gọi thoại**.
- **Một container, một tiến trình:** `config.ts:95–122` chạy được dạng một tiến trình Node. WebSocket trạng thái trong bộ nhớ nghĩa là **chưa cần Redis** nếu chạy một bản; khi cần chạy ≥ 2 bản (1.000+ MAU hoạt động đồng thời) mới thêm Redis/pub-sub [?: số liệu, đo trước].
- Bản dựng Gateway dùng `tsc -b` + `node dist/index.js` [C: `apps/gateway/package.json`] ⇒ Dockerfile 1 tầng là đủ (ghi nhận, không tạo trong tệp này).

### 2.4 Môi trường, bí mật, migration, rollback, backup

| Việc | Đề xuất |
|---|---|
| **Môi trường** | `dev` = máy (PGlite, không cần mạng); `staging` = Neon **nhánh riêng** + Render free + Pages preview; `prod` = Neon **dự án riêng** (không chung nhánh với staging, để quota/xóa nhầm không lan) + BE trả phí + Pages production. Test CI vẫn dùng PGlite (đã có) |
| **Biến môi trường/bí mật** | Bí mật ở **bảng biến môi trường của nền tảng BE** (`DATABASE_URL`, `JWT_SECRET`, `AUDIT_IP_SALT`, khóa AI, khóa Resend/FCM) [C: `config.ts:98–100` bắt buộc `JWT_SECRET`, `AUDIT_IP_SALT` ở production]; **không** đặt trong repo, **không** đặt trong FE (Nguyên tắc 2). GitHub Actions secrets chỉ giữ token triển khai và URL DB dùng cho bước migrate. Mỗi môi trường **khóa riêng** (khóa staging bị lộ không ảnh hưởng prod) |
| **Migration có kiểm soát** | Chạy **trong CI/CD, trước khi đổi bản Gateway**, theo thứ tự: backup/nhánh DB ⇒ `drizzle` áp migration ⇒ triển khai BE ⇒ smoke test. Migration phải **tương thích ngược một bản** (thêm cột/bảng trước, bỏ cột sau một bản phát hành) để rollback BE không gãy. Hook repo đã chặn sửa migration đã phát hành [C: AGENTS.md mục 5]. **Hiện CI chưa có bước migrate/deploy** [C: `ci.yml` chỉ `verify`, `performance`, `android-apk`] ⇒ còn thiếu |
| **Rollback** | BE: triển khai lại bản trước (nền tảng giữ lịch sử bản). FE: Pages giữ mọi bản, "rollback" bằng cách chọn bản trước. DB: **không rollback tự động**; dùng khôi phục tại một thời điểm (PITR) của Neon hoặc tạo nhánh từ thời điểm trước migration; vì migration tương thích ngược nên thường chỉ cần rollback BE |
| **Backup/restore** | Theo `docs/van-hanh/BACKUP.md`: lớp 1 PITR của nhà cung cấp, lớp 2 `pg_dump` hằng ngày lên **R2 (nơi khác)**, bật versioning/khóa đối tượng, giữ 30 bản ngày + 6 bản tháng; script `db:backup`, `db:restore-test` **đã có và đã thử trên Postgres 16** [C]. **Thử khôi phục mỗi tháng** vào một nhánh Neon tạm. Lưu ý: gói free của Neon có thể có cửa sổ khôi phục ngắn [?] ⇒ **không dựa riêng vào PITR** |
| **Nhật ký lộ dữ liệu** | `docs/van-hanh/SU-CO-LO-DU-LIEU.md` giữ nguyên; thêm mục "liên hệ nhà cung cấp" khi biết nền tảng thật |

### 2.5 Tên miền con đề xuất

`app.<tên>.id.vn` (FE) · `api.<tên>.id.vn` (Gateway, đồng thời là URL chính sách/xóa tài khoản cho OAuth và store: `app.<tên>.id.vn/chinh-sach`, `app.<tên>.id.vn/xoa-tai-khoan`) · `mail.<tên>.id.vn` (bản ghi SPF/DKIM của Resend). Một miền gốc, nhiều miền con ⇒ chỉ **một** miền được ủy quyền trong OAuth.

### 2.6 Ước tính chi phí (thô; không phải báo giá)

Giả định: MAU = người dùng hoạt động/tháng; mỗi người dùng ~ 20 phút/ngày; chat realtime chỉ một phần nhỏ dùng; một số tính toán thô mà **chưa đo thật**.

| MAU | FE | BE | DB | Tệp/TURN | Mail | Giám sát | **Tổng/tháng** |
|---|---|---|---|---|---|---|---|
| **0** (staging/đồ án) | 0 | 0 (ngủ) | 0 (Neon free) | 0 | 0 (Gmail SMTP) | 0 | **0 đ** |
| **100** | 0 | 0 (ngủ) hoặc ~7 USD (không ngủ) [?] | 0 | 0 | 0 (Resend free, ~100/ngày đủ) | 0 | **0–7 USD** |
| **1.000** | 0 | ~7–15 USD [?] | 0 hoặc ~19 USD nếu vượt 100 CU-giờ/1 GB [?: gói Neon trả phí chưa tra] | 0–5 | 0–20 (Resend Pro nếu >100 thư/ngày) | 0 | **7–25 USD** |
| **10.000** | 0–20 (Pages Pro nếu cần build nhiều [?]) | 20–60 (nhiều bản chạy, có thể thêm Redis) | 20–50 | 5–30 (R2 + TURN) | 20 | 26 (Sentry Team [N bài 2026]) | **~50–150 USD** |

Số cần đo trước khi tin: số kết nối WebSocket đồng thời/MAU, dung lượng DB/người dùng (hiện chỉ hồ sơ + thẻ SM-2 + lượt bài, nhỏ), GB TURN/phút gọi, chi phí gọi AI (**chưa tính ở đây**, đang theo `docs/thiet-ke/DE-XUAT-AI-THAY-THE.md`; khả năng là khoản lớn nhất khi có người dùng thật).

---

## 3. "Kiến trúc SaaS" áp vào app này nghĩa là gì

SaaS ở đây = **một bản triển khai dùng chung cho mọi người, cô lập dữ liệu theo user, có hạn mức, quản trị, đưa lên tự động, quan sát được**. Không có nghĩa là microservice hay Kubernetes.

| Đặc điểm SaaS | App đã có | Còn thiếu |
|---|---|---|
| **Một bản dùng chung, đa người thuê theo user** | Mọi bảng khóa theo `users.id`; tài khoản khách + JWT (`/v1/auth/*`); `/v1/sync`; `DELETE /v1/me` [C: AGENTS.md mục 1] | Chưa có tách theo tổ chức (không cần) |
| **Hạn mức, chống lạm dụng** | Rate limit + quota theo user, JWT bắt buộc [C: AGENTS.md; `@fastify/rate-limit`] | Quota theo gói (miễn phí/trả phí) ⇒ **dự án 6, làm sau** |
| **Gói miễn phí/trả phí** | Chưa | Bảng gói + cổng thanh toán (dự án 6, sau); đừng làm trước khi có người dùng thật |
| **Quản trị** | Đề xuất vai trò + trang admin ở `DE-XUAT-DANG-NHAP-PHAN-QUYEN.md` [C] | Dự án 5; **một trang web quản trị phải ở tên miền riêng đã bảo vệ** (không để chung API công khai không xác thực) |
| **CI/CD** | `verify` (build, test, ranh giới, bundle, e2e) + `performance` + APK debug [C: `ci.yml`] | **Chưa có** migrate-trên-CI, deploy BE/FE, smoke test, deploy preview |
| **Quan sát** | Audit events (`audit_events`) [C: BACKUP.md]; log Fastify | Sentry, uptime, dashboard hạn mức; **cảnh báo khi DB gần 1 GB hoặc CU-giờ gần hết** |
| **Cô lập môi trường** | PGlite (dev/test), nhánh cấu hình | Dự án Neon `staging` + `prod`, khóa riêng từng môi trường |
| **Tuân thủ + quyền chủ thể** | Chính sách, xóa tài khoản, hồ sơ nháp `docs/phap-ly/` | **URL công khai** (chính sách + xóa tài khoản) chỉ có khi có tên miền |

Giữ đơn giản: **một Gateway, một DB, một bucket**, tách module bằng thư mục chứ không tách dịch vụ; chỉ tách khi có số đo (CPU, kết nối WebSocket) cho thấy cần.

---

## 4. Pháp lý triển khai

- **Máy chủ/DB ở nước ngoài ⇒ thêm luồng chuyển DLCN xuyên biên giới** (Luật 91/2025/QH15 Điều 20; NĐ 356/2025 Điều 17–18, Mẫu 09). `docs/phap-ly/DANH-GIA-TAC-DONG.md` A.a đã ghi rõ: *"nếu đặt ngoài Việt Nam thì đây là thêm một luồng chuyển xuyên biên giới"*. Hồ sơ phải nộp trong **60 ngày kể từ ngày đầu chuyển**; Điều 20 **không** thuộc phạm vi ân hạn DN nhỏ (cùng tệp, mục 0.1). Cần **thêm vào hồ sơ**: tên nhà cung cấp BE/DB/lưu tệp/TURN/mail/Sentry, vùng đặt máy chủ, loại dữ liệu từng nơi.
- **Chọn Singapore:** gần VN, độ trễ thấp; **không** thay đổi nghĩa vụ hồ sơ so với vùng khác ngoài VN. Vùng trong nước (nếu có nhà cung cấp VN): sẽ giảm hồ sơ chuyển xuyên biên giới cho luồng đó [?: chưa tra, chưa có đề xuất cụ thể trong phạm vi này]. Hiện **không** có gói Postgres miễn phí trong nước được tra ở đây.
- **Sentry và log gửi ra nước ngoài** cũng là luồng dữ liệu: bật lọc dữ liệu cá nhân (không gửi nội dung chat/giọng, ẩn IP/ID) trước khi gửi.
- **Tài khoản admin cá nhân của nhà cung cấp** (Neon, Render, Cloudflare) là **bên xử lý**; ghi lại điều khoản xử lý dữ liệu (DPA) mỗi nhà cung cấp vào hồ sơ `[CẦN ĐIỀN]` khi tạo tài khoản.
- **Ảnh/giọng chat** (dự án 4) lưu trên R2: dữ liệu người dùng tạo; vùng của R2 và chính sách xóa cần ghi hồ sơ. Giọng nói và phân loại "sinh trắc" vẫn là câu hỏi mở 1 trong `DANH-GIA-TAC-DONG.md`.
- **Tư cách pháp lý của bên kiểm soát dữ liệu** (sinh viên/cá nhân/doanh nghiệp) quyết định có ân hạn khác không ⇒ liên hệ mục 5 quyết định D-pháp-lý.
- Tài liệu này **không phải tư vấn pháp lý**.

---

## 5. Lộ trình từng bước

| Bước | Việc | Môi trường | Ai làm | Cần người dùng tạo tài khoản? |
|---|---|---|---|---|
| 0 | Kiểm tra điều kiện `.id.vn` (độ tuổi, ngày hiệu lực ưu đãi 3 năm, nhà đăng ký cho sửa DNS/NS) | — | Người dùng (eKYC bằng CCCD) | **Có**: nhà đăng ký `.id.vn` |
| 1 | Tạo tài khoản **Cloudflare** (Pages + R2 + DNS), trỏ NS `.id.vn` về Cloudflare | — | Người dùng | **Có** |
| 2 | Tạo **Neon**: dự án `staging` (Singapore) + dự án `prod` (Singapore) | staging/prod | Người dùng tạo tài khoản; tôi viết lệnh | **Có** |
| 3 | Tạo **Render** (hoặc nền tảng BE chọn); dựng `Dockerfile` + `render.yaml`/cấu hình; triển khai **staging** | staging | Phiên làm tính năng | **Có** |
| 4 | Thêm vào CI: migrate staging → deploy BE → deploy FE preview → smoke test `/health` | staging | Phiên làm tính năng | Secrets GitHub: người dùng nhập |
| 5 | Thử **WebSocket lâu 30 phút + ngủ/thức** trên Render free; nếu rớt ⇒ nâng gói BE hoặc dùng nền khác | staging | Tôi (kiểm tay + e2e) | Không |
| 6 | Cài Sentry, uptime, cảnh báo quota DB | staging | Phiên làm tính năng | **Có** (Sentry) |
| 7 | Đăng ký OAuth Google (consent screen ở trạng thái "Testing"), trang chính sách + xóa tài khoản trên `app.<tên>.id.vn` | staging | Người dùng (Google Cloud Console) + tôi | **Có** (Google Cloud) |
| 8 | Cấu hình Resend + SPF/DKIM trên Cloudflare DNS, thay Gmail SMTP | staging → prod | Người dùng + tôi | **Có** (Resend) |
| 9 | Nộp **hồ sơ chuyển dữ liệu xuyên biên giới** + điều chỉnh chính sách quyền riêng tư khi có máy chủ ngoài nước | trước khi có người dùng thật | Người dùng | Không |
| 10 | Triển khai **prod**: BE trả phí nhỏ, Neon prod, backup R2 + thử khôi phục | prod | Tôi + người dùng (thanh toán) | **Có** (thanh toán) |
| 11 | FCM (cần `google-services.json` và khóa dịch vụ server), TURN, R2 cho ảnh/giọng chat | prod | Theo dự án 4 | **Có** (Firebase) |
| 12 | Phát hành store (keystore, Play Console, v.v.) | cuối | Người dùng | **Có** |

**Tài khoản người dùng phải tự tạo:** nhà đăng ký `.id.vn`, Cloudflare, Neon, Render (hoặc BE khác), Google Cloud (OAuth), Resend, Sentry, Firebase, thanh toán BE prod. Tôi không tạo tài khoản và không nhập thông tin thanh toán.

### Quyết định cho người dùng

| # | Quyết định | Đề xuất của tôi |
|---|---|---|
| T1 | Đăng ký **`.id.vn`** có phù hợp với điều kiện cá nhân/độ tuổi và tên chủ thể không? Dùng tên nào? | Có nếu đủ điều kiện; kiểm trước, đừng chờ |
| T2 | Chấp nhận **staging chạy trên gói free có ngủ**; **prod phải trả phí nhỏ (~7 USD/tháng [?])**? | Đồng ý; chat realtime không chạy được trên máy ngủ |
| T3 | **Neon (đề xuất, đã chốt D2)** hay Supabase? | Neon (nhánh + không tạm dừng DB prod) |
| T4 | Vùng **Singapore** cho DB/BE? | Có |
| T5 | Nền tảng BE prod: **Render** (đơn giản) / **Fly.io** (rẻ, cần thẻ) / Cloud Run (WS 60 phút)? | Render cho đến khi đo xong WebSocket |
| T6 | Hỏi lại nhóm: **bên kiểm soát dữ liệu** là ai (sinh viên/cá nhân/doanh nghiệp)? | Cần trước bước 9 |
| T7 | Chấp nhận **Sentry** (dữ liệu lỗi ra nước ngoài, có lọc) và Resend? | Có, kèm lọc dữ liệu cá nhân |
| T8 | Khi nào mua `.com`/`.com.vn`? | Khi có doanh thu hoặc khi lập doanh nghiệp (mục 1.3) |

---

## 6. Việc chưa kiểm chứng

- Giá `.com`, `.com.vn`, `.id.vn` sau ưu đãi (chỉ có số 50.000 đ/năm từ một nguồn), độ tuổi, và **mốc ngày ưu đãi 3 năm** (nguồn lệch: 01/01/2027 vs tin 17/10/2026).
- Điều khoản **Netlify**, **is-a.dev**, **eu.org 2026**, **Render gói trả phí và vùng Singapore**, **Neon gói trả phí**, **Metered 2026**, số miền free của Resend, **Sentry** (trang chính thức chỉ thấy một phần), **UptimeRobot/Better Stack**.
- Việc **Google có chấp nhận `*.pages.dev`/`*.vercel.app`** làm miền ủy quyền hay không (suy luận; cần thử thật).
- Hành vi **WebSocket trên Render free** (thực nghiệm ở bước 5).
- Con số chi phí ở 2.6 là ước lượng thô, chưa đo.
