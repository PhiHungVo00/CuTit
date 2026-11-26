import { PushPayloadSchema } from '@vietlearning/contracts/api';

export type PushLocale = 'vi' | 'en';
export type PushChannel = 'messages' | 'calls' | 'friends';

/** Gói đưa cho nhà cung cấp: hiển thị + dữ liệu (deep link becutit://chat/<cid>, becutit://call/<callId>). */
export interface PushMessage {
  title: string;
  body: string;
  /** chỉ chuỗi (FCM yêu cầu); khớp `PushPayloadSchema` */
  data: Record<string, string>;
  channel: PushChannel;
  priority: 'normal' | 'high';
  ttlSec: number;
  /** nhiều tin cùng cuộc trò chuyện gộp thành một thông báo */
  collapseKey?: string;
}

export const PUSH_TTL = { message: 4 * 3600, call: 30 } as const;
const APP_TITLE = 'Bé Cu Tít';
const PREVIEW_MAX = 100;
const NAME_MAX = 100;

/** bỏ ký tự điều khiển/định dạng ẩn, gộp khoảng trắng, cắt theo ký tự Unicode (không cắt đôi cặp thay thế) */
const clean = (s: string, max: number): string => {
  const t = s.replace(/[\p{Cc}\p{Cf}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const chars = [...t];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : t;
};

const T = {
  vi: {
    newFrom: (n: string) => `Tin nhắn mới từ ${n}`,
    image: (n: string) => `${n} đã gửi ảnh`,
    voice: (n: string) => `${n} đã gửi tin nhắn thoại`,
    calling: (n: string) => `${n} đang gọi`
  },
  en: {
    newFrom: (n: string) => `New message from ${n}`,
    image: (n: string) => `${n} sent a photo`,
    voice: (n: string) => `${n} sent a voice message`,
    calling: (n: string) => `${n} is calling`
  }
} as const;

export interface MsgForPush {
  cid: string;
  kind: 'text' | 'image' | 'voice';
  body?: string;
  fromName: string;
}

/**
 * Nội dung thông báo tin mới. MẶC ĐỊNH KHÔNG lộ nội dung ở màn khóa (spec 5.7): chỉ "Tin nhắn mới từ <tên>".
 * `showPreview` chỉ mở chữ của tin văn bản; ảnh/giọng nói LUÔN chỉ "đã gửi ảnh / tin nhắn thoại".
 */
export function buildPayload(msg: MsgForPush, opts: { showPreview: boolean; locale: PushLocale }): PushMessage {
  const t = T[opts.locale];
  const from = clean(msg.fromName, NAME_MAX) || '?';
  const body =
    msg.kind === 'image'
      ? t.image(from)
      : msg.kind === 'voice'
        ? t.voice(from)
        : opts.showPreview && msg.body?.trim()
          ? `${from}: ${clean(msg.body, PREVIEW_MAX)}`
          : t.newFrom(from);
  const data = PushPayloadSchema.parse({ type: 'msg', cid: msg.cid, from });
  return { title: APP_TITLE, body, data: data as Record<string, string>, channel: 'messages', priority: 'normal', ttlSec: PUSH_TTL.message, collapseKey: `cid:${msg.cid}` };
}

/** Cuộc gọi đến (Task 13 dùng): ưu tiên cao, sống 30 giây (spec 8.3). */
export function buildCallPayload(call: { callId: string; cid?: string; fromName: string }, opts: { locale: PushLocale }): PushMessage {
  const from = clean(call.fromName, NAME_MAX) || '?';
  const data = PushPayloadSchema.parse({ type: 'call', callId: call.callId, ...(call.cid ? { cid: call.cid } : {}), from });
  return { title: APP_TITLE, body: T[opts.locale].calling(from), data: data as Record<string, string>, channel: 'calls', priority: 'high', ttlSec: PUSH_TTL.call, collapseKey: `call:${call.callId}` };
}
