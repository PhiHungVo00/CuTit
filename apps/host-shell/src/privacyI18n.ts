import { defineMessages } from '@vietlearning/state';

/**
 * Chính sách quyền riêng tư (BẢN NHÁP — cần người phụ trách duyệt trước khi phát hành).
 * Nội dung đối chiếu với mã nguồn ngày 2026-11-18: packages/contracts/src/db/schema.ts (bảng lưu ở server),
 * apps/gateway (Gemini cho chat/ảnh/giọng nói, không lưu nội dung), refresh token 90 ngày, bia mộ 90 ngày.
 * Nằm trong chunk lazy của trang này, không ở bundle đầu.
 */
export const { useT } = defineMessages(
  {
    title: 'Chính sách quyền riêng tư',
    draft: 'BẢN NHÁP — nội dung này chưa được người phụ trách dự án duyệt và có thể thay đổi.',
    updated: 'Cập nhật: 18/11/2026',
    intro: 'Ứng dụng “Học Tiếng Việt Cùng Bé Cu Tít” là đồ án môn học tại Trường ĐH Công nghệ Thông tin (UIT). Trang này nói rõ ứng dụng thu thập gì, gửi đi đâu, giữ bao lâu và cách bạn xóa.',
    collectTitle: 'Dữ liệu chúng tôi lưu',
    collect1: 'Tài khoản khách: một mã định danh ngẫu nhiên. Không cần email, số điện thoại hay tên thật. Mã khôi phục chỉ lưu dưới dạng băm (không đọc ngược được).',
    collect2: 'Tiến độ học: hồ sơ học (trình độ, mục tiêu, phương ngữ), tùy chỉnh, thẻ ôn tập, kết quả bài làm, thời gian học theo ngày, XP, chuỗi ngày học, bài đã xong, lựa chọn đồng ý.',
    collect3: 'Dữ liệu này lưu trên điện thoại của bạn và được sao lưu lên máy chủ Bé Cu Tít để dùng được trên máy khác (bằng mã khôi phục).',
    collect4: 'Nhật ký kỹ thuật của máy chủ (thời gian, đường dẫn yêu cầu, địa chỉ IP) dùng để chống lạm dụng và sửa lỗi.',
    aiTitle: 'Nội dung gửi tới dịch vụ AI',
    ai1: 'Tin nhắn trò chuyện, ảnh chụp ở Camera từ vựng và bản ghi giọng nói được gửi qua máy chủ Bé Cu Tít tới Google Gemini để xử lý. Máy chủ của Google có thể đặt ở ngoài Việt Nam.',
    ai2: 'Máy chủ Bé Cu Tít không lưu nội dung tin nhắn, ảnh hay giọng nói sau khi xử lý xong. Google xử lý theo điều khoản và chính sách của Google.',
    ai3: 'Lần đầu dùng micro, ứng dụng hỏi bạn đồng ý trước khi ghi âm. Bạn có thể học mà không dùng micro hay camera.',
    keepTitle: 'Thời gian lưu',
    keep1: 'Dữ liệu học được giữ cho tới khi bạn xóa tài khoản.',
    keep2: 'Phiên đăng nhập trên mỗi máy hết hạn sau 90 ngày không dùng.',
    keep3: 'Sau khi xóa tài khoản, máy chủ chỉ giữ bản băm của mã đăng nhập cũ trong 90 ngày để báo cho máy khác của bạn biết tài khoản đã bị xóa (không kèm dữ liệu học).',
    deleteTitle: 'Cách xóa dữ liệu',
    delete1: 'Vào Tùy chỉnh → mục “Xóa tài khoản” → “Xóa tài khoản và dữ liệu…”. Máy chủ xóa ngay tài khoản và toàn bộ dữ liệu học; dữ liệu trên máy này cũng bị xóa.',
    delete2: 'Các máy khác đang dùng cùng tài khoản sẽ tự xóa dữ liệu ở lần kết nối tiếp theo.',
    contactTitle: 'Liên hệ',
    contact1: '[Cần điền: tên và email người phụ trách dự án] — hỏi đáp hoặc yêu cầu về dữ liệu cá nhân.',
    back: 'Quay lại'
  },
  {
    title: 'Privacy policy',
    draft: 'DRAFT — this text has not yet been approved by the project owner and may change.',
    updated: 'Updated: 18 Nov 2026',
    intro: '“Learn Vietnamese with Cu Tít” is a university course project at the University of Information Technology (UIT). This page explains what the app collects, where it is sent, how long it is kept and how to delete it.',
    collectTitle: 'Data we store',
    collect1: 'Guest account: a random identifier. No email, phone number or real name is needed. Your recovery code is only stored as a hash (it cannot be read back).',
    collect2: 'Learning progress: learner profile (level, goal, dialect), settings, review cards, exercise results, daily study time, XP, streak, completed lessons and consent choices.',
    collect3: 'This data is stored on your phone and backed up to the Cu Tít server so you can use it on another device (with your recovery code).',
    collect4: 'Technical server logs (time, request path, IP address) used to prevent abuse and fix bugs.',
    aiTitle: 'Content sent to the AI service',
    ai1: 'Chat messages, Camera vocabulary photos and voice recordings are sent through the Cu Tít server to Google Gemini for processing. Google’s servers may be located outside Vietnam.',
    ai2: 'The Cu Tít server does not keep messages, photos or recordings after processing. Google processes them under Google’s own terms and policies.',
    ai3: 'The first time you use the microphone, the app asks for your consent before recording. You can learn without using the microphone or camera.',
    keepTitle: 'How long we keep data',
    keep1: 'Learning data is kept until you delete your account.',
    keep2: 'The sign-in session on each device expires after 90 days without use.',
    keep3: 'After you delete your account, the server keeps only hashes of the old sign-in codes for 90 days so your other devices learn the account is gone (no learning data is kept).',
    deleteTitle: 'How to delete your data',
    delete1: 'Go to Settings → “Delete account” → “Delete account and data…”. The server immediately deletes the account and all learning data; the data on this device is cleared too.',
    delete2: 'Other devices using the same account clear their data the next time they connect.',
    contactTitle: 'Contact',
    contact1: '[To fill in: project owner’s name and email] — questions or requests about personal data.',
    back: 'Back'
  }
);
