/**
 * Câu báo lỗi của chat theo MÃ lỗi Gateway (không dựa vào chữ của server).
 * Có tham số `lang` nên bảng vi/en nằm ở đây thay vì `defineMessages` (hook đọc ngôn ngữ từ kho).
 */
export interface ChatErrorLike {
  kind?: string;
  code?: string;
  details?: Record<string, unknown>;
}

const TEXT = {
  vi: {
    busy: 'Cu Tít đang bận, thử lại sau ít giây',
    quota: 'Hết lượt hôm nay, có lượt mới lúc 0 giờ',
    globalQuota: 'Hôm nay nhiều bạn học quá, Cu Tít nghỉ một chút',
    rate: 'Bạn gửi hơi nhanh. Chờ vài giây rồi thử lại nhé.',
    network: 'Không kết nối được máy chủ',
    unauthorized: 'Phiên đăng nhập chưa sẵn sàng. Thử lại nhé.',
    updateRequired: 'Cần cập nhật ứng dụng để tiếp tục trò chuyện.',
    rejected: 'Cu Tít không xử lý được tin này. Hãy thử nội dung khác.',
    generic: 'Có lỗi xảy ra. Vui lòng thử lại.'
  },
  en: {
    busy: 'Cu Tít is busy, try again in a few seconds',
    quota: 'No turns left today — new turns arrive at midnight',
    globalQuota: 'So many learners today — Cu Tít is taking a short rest',
    rate: 'You’re sending a bit fast. Wait a few seconds and try again.',
    network: 'Can’t reach the server',
    unauthorized: 'Your session isn’t ready yet. Please try again.',
    updateRequired: 'Please update the app to keep chatting.',
    rejected: 'Cu Tít couldn’t handle that message. Try something else.',
    generic: 'Something went wrong. Please try again.'
  }
} as const;

export function messageForError(e: ChatErrorLike, lang: 'vi' | 'en'): { text: string; retry: boolean } {
  const s = TEXT[lang] ?? TEXT.vi;
  if (e.code === 'llm_busy') return { text: s.busy, retry: true };
  if (e.kind === 'quota' || e.code === 'quota_exceeded') {
    if (e.code && e.code !== 'quota_exceeded') return { text: s.rate, retry: true };
    return { text: e.details?.scope === 'global' ? s.globalQuota : s.quota, retry: false };
  }
  if (e.kind === 'offline' || e.kind === 'timeout' || e.kind === 'incomplete') return { text: s.network, retry: true };
  if (e.kind === 'update-required') return { text: s.updateRequired, retry: false };
  if (e.kind === 'unauthorized') return { text: s.unauthorized, retry: true };
  if (e.kind === 'invalid-request') return { text: s.rejected, retry: false };
  return { text: s.generic, retry: true };
}
