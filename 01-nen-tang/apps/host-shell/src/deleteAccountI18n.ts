import { defineMessages } from '@vietlearning/state';

/**
 * Trang công khai /xoa-tai-khoan (Google Play Data safety yêu cầu một đường dẫn web hướng dẫn xóa tài khoản).
 * BẢN NHÁP — phần chữ pháp lý cần người phụ trách (kien-truc) duyệt trước khi phát hành.
 *
 * Mô tả theo hành vi của Gateway (01-nen-tang/apps/gateway/src/routes/me.ts, services/auth/lifecycle.ts):
 *  - DELETE /v1/me {mode:'grace'}: khóa ngay, thu hồi mọi phiên, xóa cứng sau ACCOUNT_DELETE_GRACE_DAYS = 30 ngày;
 *    đăng nhập lại trong hạn thì hỏi khôi phục (POST /v1/me/restore).
 *  - DELETE /v1/me {mode:'now'}: xóa cứng ngay. Bia mộ (băm mã đăng nhập) giữ 90 ngày; tên đăng nhập giữ chỗ 30 ngày.
 * Đường trong app theo spec đăng nhập 5.5: Hồ sơ › Cài đặt › Tài khoản › Xóa tài khoản.
 * TODO dự án 3 (Task 7): màn Cài đặt hiện còn gửi DELETE /v1/me không thân (= xóa ngay); khi giao diện đăng nhập
 * gộp, đối chiếu lại đường trong app và hai lựa chọn "Chờ 30 ngày" / "Xóa ngay" ở đây.
 * Nằm trong chunk lazy của trang này, không ở bundle đầu.
 */
export const vi = {
  title: 'Xóa tài khoản và dữ liệu',
  draft: 'BẢN NHÁP — nội dung này chưa được người phụ trách dự án duyệt và có thể thay đổi.',
  intro:
    'Trang này hướng dẫn xóa tài khoản “Học Tiếng Việt Cùng Bé Cu Tít” và nói rõ dữ liệu nào bị xóa, dữ liệu nào còn giữ và trong bao lâu. Bạn không cần gửi yêu cầu cho ai: tự xóa ngay trong ứng dụng.',
  howTitle: 'Cách xóa trong ứng dụng',
  how1: 'Mở ứng dụng (bản Android hoặc bản web), đăng nhập vào tài khoản cần xóa. Chưa đăng nhập: vào tab Hồ sơ ở thanh dưới cùng.',
  how2: 'Vào Hồ sơ › Cài đặt › Tài khoản › Xóa tài khoản.',
  how3: 'Chọn một trong hai cách bên dưới rồi xác nhận. Tài khoản khách (chưa đăng ký) chỉ có cách 2, xóa ngay.',
  graceTitle: 'Cách 1 — Xóa và chờ 30 ngày (mặc định)',
  grace1: 'Tài khoản bị khóa ngay: mọi thiết bị bị đăng xuất, bạn biến mất khỏi danh sách bạn của người khác, máy chủ ngừng xử lý dữ liệu của bạn.',
  grace2: 'Trong 30 ngày bạn đổi ý được: đăng nhập lại và chọn “Khôi phục tài khoản” — mọi dữ liệu còn nguyên.',
  grace3: 'Hết 30 ngày, tài khoản và dữ liệu bị xóa vĩnh viễn, không khôi phục được.',
  nowTitle: 'Cách 2 — Xóa ngay',
  now1: 'Máy chủ xóa vĩnh viễn tài khoản và dữ liệu ngay lúc bạn xác nhận, không có 30 ngày chờ và không khôi phục được.',
  deletedTitle: 'Dữ liệu bị xóa',
  deleted1: 'Tài khoản và thông tin đăng nhập: mã định danh, tên đăng nhập, email (nếu bạn đã gắn), liên kết Google, mật khẩu (dạng băm), mã khôi phục và mã dự phòng (trừ bản băm nêu ở mục “Dữ liệu còn giữ”).',
  deleted2: 'Tiến độ học: hồ sơ học, tùy chỉnh, thẻ ôn, kết quả bài làm, thời gian học và XP, chuỗi ngày học, huy hiệu.',
  deleted3: 'Bạn học: tên hiển thị, danh sách bạn, mục tiêu chung. Lựa chọn đồng ý (micro, camera). Bộ đếm lượt dùng AI.',
  deleted4:
    'Dữ liệu trên thiết bị đang dùng (tiến độ, lịch sử trò chuyện) cũng bị xóa. Thiết bị khác dùng cùng tài khoản tự xóa ở lần kết nối tiếp theo. Gỡ ứng dụng cũng xóa dữ liệu trên máy.',
  keptTitle: 'Dữ liệu còn giữ sau khi xóa hẳn',
  kept1: 'Bản băm (một chiều, không đọc ngược được) của phiên đăng nhập cũ và của mã khôi phục tài khoản khách, chỉ để báo cho thiết bị khác của bạn biết tài khoản đã bị xóa. Bản băm phiên đăng nhập giữ tối đa 90 ngày; bản băm mã khôi phục tài khoản khách giữ lâu dài. Không kèm dữ liệu học.',
  kept2: 'Tên đăng nhập được giữ chỗ 30 ngày để không ai mạo danh bạn, rồi được giải phóng.',
  kept3:
    'Nhật ký sự kiện bảo mật (loại sự kiện, thời gian, bản băm của địa chỉ IP — không lưu IP thô — và thông tin thiết bị rút gọn) đã được ẩn danh (không còn gắn với tài khoản của bạn), lưu tối đa 180 ngày. Nhật ký kỹ thuật thông thường của máy chủ (thời gian, đường dẫn yêu cầu, địa chỉ IP): thời gian lưu [Cần điền khi có máy chủ phát hành].',
  kept4:
    'Nội dung bạn đã gửi tới nhà cung cấp AI (Google, Groq, OpenRouter) nằm dưới điều khoản của họ; máy chủ Bé Cu Tít không lưu bản sao. Xem Chính sách quyền riêng tư.',
  helpTitle: 'Không vào được ứng dụng?',
  help1: 'Nếu bạn không còn đăng nhập được, hãy liên hệ người phụ trách để được hỗ trợ xóa tài khoản. Địa chỉ liên hệ quyền riêng tư: Sắp có.',
  linksTitle: 'Xem thêm',
  privacy: 'Chính sách quyền riêng tư',
  signIn: 'Đăng nhập / Hồ sơ',
  updated: 'Cập nhật: 22/11/2026'
};

export const en: { [K in keyof typeof vi]: string } = {
  title: 'Delete your account and data',
  draft: 'DRAFT — the project owner has not yet reviewed this text and it may change.',
  intro:
    'This page explains how to delete your “Learn Vietnamese with Bé Cu Tít” account, which data is deleted, which data is kept and for how long. You do not need to ask anyone: delete it yourself right inside the app.',
  howTitle: 'How to delete in the app',
  how1: 'Open the app (Android or web) and sign in to the account you want to delete. Not signed in yet: open the Profile tab in the bottom bar.',
  how2: 'Go to Profile › Settings › Account › Delete account.',
  how3: 'Pick one of the two options below and confirm. A guest account (not registered) only has option 2, delete now.',
  graceTitle: 'Option 1 — Delete with a 30-day wait (default)',
  grace1: 'The account is locked immediately: every device is signed out, you disappear from other people’s friend lists, and the server stops processing your data.',
  grace2: 'For 30 days you can change your mind: sign in again and choose “Restore account” — all your data is intact.',
  grace3: 'After 30 days the account and its data are permanently deleted and cannot be restored.',
  nowTitle: 'Option 2 — Delete now',
  now1: 'The server permanently deletes the account and data the moment you confirm. There is no 30-day wait and it cannot be restored.',
  deletedTitle: 'Data that is deleted',
  deleted1: 'The account and sign-in details: account ID, username, email (if you added one), Google link, password (hashed), recovery code and backup code (except the hashes described under “Data kept after final deletion”).',
  deleted2: 'Learning progress: learning profile, settings, review cards, exercise results, study time and XP, streaks, badges.',
  deleted3: 'Buddies: display name, friend list, shared goals. Consent choices (microphone, camera). AI usage counters.',
  deleted4:
    'Data on the device you are using (progress, chat history) is deleted too. Other devices using the same account clear their data the next time they connect. Uninstalling the app also removes data on that device.',
  keptTitle: 'Data kept after final deletion',
  kept1: 'Hashes (one-way, cannot be reversed) of your old sign-in sessions and of a guest account’s recovery code, kept only so your other devices learn the account is gone. Sign-in session hashes are kept for up to 90 days; the guest recovery-code hash is kept long term. They carry no learning data.',
  kept2: 'The username is reserved for 30 days so nobody can impersonate you, then released.',
  kept3:
    'Security event records (event type, time, a hash of the IP address — the raw IP is not stored — and shortened device info), anonymized (no longer linked to your account) and kept for at most 180 days. Ordinary server technical logs (time, request path, IP address): retention time [To fill in once a production server exists].',
  kept4:
    'Content you already sent to AI providers (Google, Groq, OpenRouter) falls under their terms; the Bé Cu Tít server keeps no copy. See the Privacy Policy.',
  helpTitle: 'Cannot open the app?',
  help1: 'If you can no longer sign in, contact the project owner to get help deleting the account. Privacy contact address: Coming soon.',
  linksTitle: 'See also',
  privacy: 'Privacy policy',
  signIn: 'Sign in / Profile',
  updated: 'Updated: 22/11/2026'
};

export const { useT } = defineMessages(vi, en);
