import type { FeedbackContext } from '@vietlearning/contracts/api';

/** Chỉ chẩn đoán ứng dụng, không nội dung bài học/tin nhắn/email (spec §5.1): tên hệ điều hành/trình duyệt + số chính */
export function osLabel(ua: string): string {
  const android = /Android (\d+(?:\.\d+)?)/.exec(ua);
  if (android) return `Android ${android[1]}`;
  const pick = (re: RegExp, name: string) => {
    const m = re.exec(ua);
    return m ? `${name} ${m[1]}` : null;
  };
  return pick(/Edg\/(\d+)/, 'Edge') ?? pick(/Firefox\/(\d+)/, 'Firefox') ?? pick(/Chrome\/(\d+)/, 'Chrome') ?? (/Safari\//.test(ua) ? pick(/Version\/(\d+)/, 'Safari') : null) ?? 'Web';
}

/** Tên lỗi + dòng đầu của stack, đã bỏ máy chủ và tham số truy vấn (khớp `FeedbackContext.error`) */
export function errorReport(err: unknown): NonNullable<FeedbackContext['error']> {
  const e = err as { name?: unknown; stack?: unknown } | null;
  const name = (typeof e?.name === 'string' && e.name ? e.name : 'Error').slice(0, 100);
  const stack = typeof e?.stack === 'string' ? e.stack : '';
  // V8/Chrome: "    at fn (url:l:c)"; Firefox/Safari: "fn@url:l:c". Không khớp dòng đầu (tên: thông điệp) vì có thể chứa dữ liệu người dùng
  const frame = stack.split('\n').find((l) => /^\s*at\s/.test(l) || /^[^\s@]*@\S+:\d+:\d+/.test(l)) ?? '';
  const firstFrame = frame
    .trim()
    .replace(/https?:\/\/[^/\s)]+/g, '')
    .replace(/\?[^\s):]*/g, '')
    .slice(0, 300);
  return { name, firstFrame };
}
