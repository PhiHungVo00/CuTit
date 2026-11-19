# Nhật ký LUAT-UX — văn bản pháp lý mới + khóa nút/chỉ báo đang xử lý

> Nhánh `claude/luat-moi-ux-3d9194` (từ `main` @ `416b2e2`), ngày 19/11/2026. Theo slide vibecoder.fyi mục 08 (quy định) và mục 05 / slide 21 (UI/UX: loading, khóa nút).
> Phạm vi: **không sửa schema DB, không sửa `docs/van-hanh/`** (phiên song song làm `audit_events`).

## 1. Tra cứu văn bản pháp lý (web, 19/11/2026)

| Slide nêu | Kết quả kiểm tra | Mức chắc chắn |
|---|---|---|
| Luật BVDLCN 91/2025/QH15, hiệu lực 01/01/2026 | **Đúng.** Thông qua 26/6/2025; Điều 38 k1 hiệu lực 01/01/2026 | nguyên văn (bản sao hethongphapluat.com) |
| NĐ 356/2025/NĐ-CP thay NĐ 13/2023 | **Đúng.** Ký 31/12/2025, hiệu lực 01/01/2026; Điều 42 k2: NĐ 13/2023 hết hiệu lực | nguyên văn (luatvietnam.vn) |
| Luật Trí tuệ nhân tạo 134/2025/QH15 | **Đúng.** Thông qua 10/12/2025, hiệu lực 01/3/2026; hệ thống có trước được 12 tháng (18 tháng với giáo dục) | tóm tắt |
| Luật An ninh mạng 116/2025/QH15 | **Đúng.** Thông qua 10/12/2025, hiệu lực 01/7/2026, thay Luật ANM 2018 | tóm tắt |
| NĐ 330/2026/NĐ-CP xử phạt | **Đúng.** Ban hành 19/8/2026, hiệu lực ngay; phạt tới 3 tỷ, chuyển xuyên biên giới tới 5% doanh thu | tóm tắt (Global Vietnam Lawyers 08/2026) |

**Phát hiện quan trọng (khác với các bài tóm tắt trên mạng):** ân hạn 5 năm cho DN nhỏ/khởi nghiệp (Luật Điều 38 k2, NĐ Điều 41) chỉ gồm **Điều 21, 22 và khoản 2 Điều 33** (hồ sơ ĐGTĐ xử lý, cập nhật hồ sơ, nhân sự BVDLCN) — **không gồm Điều 20 (chuyển DLCN xuyên biên giới)**. Mất ân hạn nếu trực tiếp xử lý dữ liệu nhạy cảm hoặc từ 100.000 chủ thể. Đồ án sinh viên chưa chắc là “DN nhỏ/khởi nghiệp” ⇒ để `[CẦN ĐIỀN]`. Chi tiết + câu hỏi mở (giọng nói có phải sinh trắc học?): `docs/phap-ly/DANH-GIA-TAC-DONG.md` mục 0.

`vbpl.moj.gov.vn` không truy cập được (DNS), `thuvienphapluat.vn`/PwC chặn truy cập tự động ⇒ **trước khi nộp hồ sơ phải đối chiếu Công báo.**

## 2. Việc đã làm — phần A (pháp lý)

| # | Việc | Tệp |
|---|---|---|
| A1 | Chính sách quyền riêng tư viết lại theo mã nguồn, song ngữ: căn cứ pháp lý mới; bảng dữ liệu (gì / để làm gì / giữ bao lâu) gồm cả **Bạn học, bộ đếm AI, bản ghi đồng ý** (bản cũ thiếu); chuyển ra nước ngoài (Gemini: chat, hỏi văn hóa, giải thích, ảnh, giọng); quyền (biết, rút lại, xem/sửa, xóa ngay trong app, khiếu nại – phản hồi 02 ngày làm việc); **không mua bán dữ liệu**, không quảng cáo/SDK thống kê; HTTPS; trẻ em. Giữ nguyên chỗ trống liên hệ; thêm `[Cần điền]` cho thời gian lưu log và gói Gemini | `apps/host-shell/src/privacyI18n.ts`, `screens/PrivacyRoute.tsx` |
| A2 | Mọi chỗ nhắc NĐ 13/2023 trong `docs/` (đã quét `.md`, `.html`, `.py`, 4 tệp `.docx`, PDF báo cáo TDD): **chỉ có 1 chỗ**, trong nhật ký cũ `docs/nhat-ky/GD4b.md` ⇒ không sửa nội dung, **thêm ghi chú** (NĐ 13 hết hiệu lực, ngưỡng 16 tuổi chưa xác nhận lại) | `docs/nhat-ky/GD4b.md` |
| A3 | Nháp hồ sơ ĐGTĐ xử lý (Mẫu 10) + chuyển xuyên biên giới Gemini (Mẫu 09): thời hạn 60 ngày, cập nhật 6 tháng/10 ngày, ân hạn và ngoại lệ, mức phạt NĐ 330, sổ đồng ý, rủi ro | `docs/phap-ly/DANH-GIA-TAC-DONG.md` |
| A4 | Nháp khai báo Google Play Data safety (thu thập/chia sẻ/xử lý tạm thời/mã hóa khi truyền/cho xóa; cần URL web xóa tài khoản) | `docs/phap-ly/DATA-SAFETY.md` |
| A5 | Hộp đồng ý — xem mục 3 | |

## 3. Kiểm tra hộp xin đồng ý

| Hộp | Trước | Sau |
|---|---|---|
| Micro ở Trò chuyện / Gọi thoại / Nhập vai (`VoiceConsent`) | Hộp riêng, nút “Để sau”/“Đồng ý, ghi âm”, **không tick sẵn**, lưu `consents.voice` | Thêm “máy chủ Google có thể ở ngoài Việt Nam”, “rút lại trong Tùy chỉnh” |
| Micro ở bài nói của bài học (`SpeakExercise`) | Không nêu tên Google (“dịch vụ nhận dạng giọng nói”) | Nêu Google Gemini + ngoài Việt Nam ⇒ **phiên bản nội dung `voice` = 2** |
| **Camera từ vựng** | **THIẾU** — ảnh gửi Gemini không hỏi | Hộp đồng ý `camera` hiện **trước** khi mở camera hoặc chọn ảnh; `analyze` kiểm tra lại đồng ý trước khi gửi (lớp chặn cuối) |
| Thống kê | Không có SDK thống kê/quảng cáo (đã quét `package.json`) ⇒ không cần hộp | — |
| **Rút lại đồng ý** | **THIẾU** (`giveConsent` chỉ bật; kéo về từ server còn bật lại) | Tùy chỉnh → Quyền riêng tư: trạng thái từng loại + nút “Rút lại đồng ý”. Sự kiện mới `consent.revoke` (contract trước) ⇒ Gateway xóa bản ghi; server là nguồn đúng cho đồng ý khi áp ảnh chụp ⇒ rút ở máy này thì máy khác cũng thôi |

Lưu “ai / lúc nào / nội dung gì”: bảng `consents (user_id, key, version, granted_at)` — `version` nay theo từng khóa (`CONSENT_VERSIONS`), bảng tra nội dung từng phiên bản ở DANH-GIA-TAC-DONG.md mục A.d.
**Hạn chế:** không sửa schema nên (1) lịch sử “đã rút lại” không giữ trong DB — đã ghi chú cho phiên `audit_events`; (2) không có bia mộ cho đồng ý: máy khác đang offline mà đã đồng ý *trước* lúc rút lại sẽ gửi grant cũ lên và bật lại đồng ý (hiếm).

Đã kiểm thêm theo góp ý duyệt: Gateway chỉ ghi `placement_sessions` ngoài các bảng đã liệt kê (bổ sung vào chính sách + hồ sơ); bộ đệm giải thích chỉ ở RAM, không gắn người dùng; gia sư nhận kèm trình độ/phương ngữ/ngôn ngữ giải thích (đã sửa câu “không gửi hồ sơ học”); mã mời hết hạn 48 giờ; Điều 33 k2 Luật 91 đã đọc nguyên văn; định nghĩa Play đã đọc nguyên văn. Test mới: đồng ý có trên máy nhưng chưa lên server ⇒ vẫn gửi grant và giữ nguyên.

## 4. Rà UI/UX — khóa nút & chỉ báo (slide 21)

“Khóa” = không thể gửi 2 yêu cầu khi bấm 2 lần; “ref” = chặn đồng bộ bằng `useRef` (an toàn cả khi 2 lần chạm trước lúc React vẽ lại).

| Nơi | Yêu cầu server | Khóa trước | Chỉ báo trước | Sửa | Test |
|---|---|---|---|---|---|
| Tùy chỉnh → Tạo tài khoản ngay | `/v1/auth/guest` + sync | state | **không** | ref + vòng quay “Đang tạo tài khoản…” | — |
| Tùy chỉnh → Đồng bộ ngay | `/v1/sync` | state | chữ | ref + vòng quay | — |
| Tùy chỉnh → Khôi phục | `/v1/auth/recover` | state | chữ | ref + vòng quay | vitest có sẵn |
| Tùy chỉnh → Xóa vĩnh viễn | `DELETE /v1/me` | state; **nút “Hủy” vẫn bấm được giữa chừng** | chữ | ref + vòng quay; khóa “Hủy” khi đang xóa | **vitest mới**: 2 lần chạm ⇒ 1 DELETE |
| Bạn học → Lưu tên / Đổi tên | `PUT /v1/friends/profile` | state | **không** | ref + “Đang gửi…”; khóa “Đổi tên”, “Thôi” | — |
| Bạn học → Tạo mã mời | `POST /v1/friends/invite` | state | **không** | ref + “Đang gửi…” | **vitest mới**: 2 lần chạm ⇒ 1 mã |
| Bạn học → Kết bạn (nhập mã) | `POST /v1/friends/accept` | state | **không** | ref + “Đang gửi…” | — |
| Bạn học → Hủy kết bạn | `DELETE /v1/friends/:id` | **không** | **không** | khóa + ref + “Đang gửi…” | **vitest mới**: 2 lần ⇒ 1 yêu cầu, mọi nút khóa |
| Bạn học → Đổi mục tiêu chung | `PUT …/goal` | **không** | **không** | khóa `<select>` + dòng “Đang gửi…” | gián tiếp |
| Bạn học → mọi nút | — | bật lại trước khi danh sách mới về | — | giữ khóa tới khi `refresh()` xong | |
| Bạn học → đang tải | `GET /v1/friends` | — | chữ | thêm vòng quay | |
| Camera → Chụp | `/v1/vision/label` | **không** (2 lần chạm ⇒ 2 ảnh) | chữ | ref chặn; vòng quay khi nhận diện | e2e camera (cập nhật) |
| Camera → Mở camera / Chọn ảnh | — | có | chữ “Đang mở…” | thêm hộp đồng ý | e2e |
| Trò chuyện → Gửi | `/v1/chat` SSE | máy trạng thái `m.isBusy()` (đồng bộ) | trạng thái lượt | đạt, không sửa | có sẵn |
| Gọi thoại → Gửi chữ | `/v1/chat` | reducer bỏ `SEND_TYPED` khi đang `thinking` | trạng thái | đạt | có sẵn |
| Bài nói (bài học, M7) | `/v1/speech/assess` | `status === 'sending'` | “Đang chấm…” | đạt | có sẵn |
| Nhập giọng nói (chat) | `/v1/speech/transcribe` | `starting/transcribing` | ⏳ + chữ | đạt | có sẵn |
| Hỏi văn hóa | `/v1/culture/ask` | `loading` | chữ trên nút | đạt | — |
| Giải thích thêm | `/v1/practice/explain` | `loading` | chữ trên nút | đạt | — |
| Xếp lớp (M11) | `/v1/placement/next` | `busy` khóa lựa chọn | “Đang xử lý…” | đạt | có sẵn |
| Tùy chỉnh (giọng, tốc độ…) | `PUT /v1/preferences` | lưu trên máy trước, gộp 600 ms | “Đang lưu…/Đã lưu” | đạt | — |
| Rút lại đồng ý | đồng bộ nền (hàng đợi) | thao tác cục bộ, idempotent | trạng thái đổi ngay | mới | e2e mới + test sync |

Dùng chung trong `mfe-learner`: `Spinner`, `BusyLabel` (`common/ui.tsx`); `secondaryBtn` thêm `disabled:opacity-50` (trước đây nút phụ bị khóa trông như bật). Vòng quay tắt hiệu ứng khi `prefers-reduced-motion`.

## 5. Test thêm / sửa
- `packages/state/test/sync.test.mjs`: rút lại ⇒ `consent.revoke`, đồng ý lại ⇒ `consent.grant` v2; rút ở máy khác ⇒ máy này thôi đồng ý, không sinh sự kiện vọng lại.
- `apps/gateway/test/sync.test.mjs`: grant lưu (key, version, grantedAt) ⇒ revoke xóa ⇒ grant lại có lại.
- `FriendsPanel.test.tsx` (+2), `AccountSection.test.tsx` (+1) như bảng trên.
- e2e: camera (hộp đồng ý, “Để sau” không mở camera/không lưu đồng ý), trang chính sách (căn cứ pháp lý, quyền, không mua bán; song ngữ), rút lại đồng ý ở Tùy chỉnh.

## 6. Kết quả kiểm tra
| Lệnh | Kết quả |
|---|---|
| `pnpm build` | 19/19 |
| `pnpm test` | 35/35 task |
| `pnpm lint:boundaries` | 0 vi phạm (399 module) |
| `pnpm --filter @vietlearning/host-shell size` | đạt; gói đầu **64,21 / 64,5 kB** (+0,03 kB do `revokeConsent` + sự kiện revoke trong chunk đồng bộ) |
| e2e (`E2E_PORT=4194 E2E_GATEWAY_PORT=4023`) | 96 đạt / 9 bỏ qua / 0 lỗi (lần cuối) — xem mục 7 |

## 7. e2e
Build host với `VITE_GATEWAY_URL=http://localhost:4023`, chạy `E2E_PORT=4194 E2E_GATEWAY_PORT=4023`:
- Lần 1: 93 đạt, **2 lỗi do chính test mới** (đọc `localStorage` trước khi app ghi ⇒ `null`) — sửa test, không phải lỗi app.
- Lần 2: 91 đạt, 2 lỗi **chập chờn theo tải máy** (`sync.spec.ts:42` chờ “Đã sao lưu” 15 s; `app.spec.ts:636` WAV ngắn hơn 10 kB khi máy chậm). Cả hai đều đạt ở lần 1; chạy lại riêng: 2 test × 3 lần đạt 9/9, `sync.spec.ts` × 4 đạt 12/12.
- **Lần cuối: 96 đạt, 9 bỏ qua (có sẵn), 0 lỗi.**

## 8. Còn lại / cần người quyết
- Điền `[CẦN ĐIỀN]` trong 2 tài liệu pháp lý + liên hệ trong chính sách (bạn đã hoãn).
- Có hỏi lại người đã đồng ý `voice` v1 để nâng lên v2 trước khi phát hành không.
- Có cần hộp đồng ý riêng cho chat văn bản không (hiện coi là dịch vụ người dùng chủ động yêu cầu, có thông báo trong chính sách).
- Chưa có chức năng xuất dữ liệu (quyền nhận bản sao) — hiện xử lý thủ công qua liên hệ.
- Chưa chạy APK trên emulator cho phần này (thay đổi chỉ là UI web + đồng bộ; camera native đi qua cùng đường `getUserMedia`).
