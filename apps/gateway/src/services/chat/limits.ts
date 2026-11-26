import { createHash } from 'node:crypto';
import { CHAT_LIMITS, ChatErrorCode } from '@vietlearning/contracts/api';
import { GatewayError } from '../../pipeline/RequestPipeline.js';

/**
 * Giới hạn tốc độ + chống spam tin chữ (spec 5.4): 20 tin/10 giây/cuộc, 120/phút và 600/24 giờ mỗi người,
 * cùng nội dung gửi liên tiếp > 5 lần trong 1 phút → `chat_duplicate`.
 *
 * Bộ đếm nằm TRONG BỘ NHỚ một instance Gateway (bản đầu chỉ chạy một instance, spec 5.6): khởi động lại thì đếm lại từ 0 — chấp nhận
 * được vì chỉ là chống spam, không phải quota tính tiền; nhiều instance thì chuyển sang bảng đếm trong DB mà không đổi chữ ký.
 * Cửa sổ ngày là 24 giờ TRƯỢT (không phải ngày lịch) cho đơn giản và không có "giờ vàng" nửa đêm.
 * Đồng hồ do người gọi đưa vào (`now`) để test được mà không chờ.
 */
const TEN_SEC = 10_000;
const MINUTE = 60_000;
const DAY = 86_400_000;
const DUP_MAX_PER_MIN = 5;
const SWEEP_EVERY = 500;

export type Release = () => void;

const normalize = (body: string): string => body.trim().replace(/\s+/g, ' ').toLowerCase();
const hashOf = (body: string): string => createHash('sha256').update(normalize(body)).digest('base64url').slice(0, 22);

export class ChatLimiter {
  private readonly perUser = new Map<string, number[]>();
  private readonly perConv = new Map<string, number[]>();
  private readonly dup = new Map<string, number[]>();
  private calls = 0;

  /**
   * Kiểm VÀ ghi nhận một lần gửi. Vượt giới hạn → ném `chat_rate`/`chat_duplicate` (429) và KHÔNG ghi nhận gì.
   * Trả hàm hoàn lại (gọi khi việc ghi DB sau đó thất bại để không mất lượt oan).
   */
  enforceChatLimits(userId: string, conversationId: string, now: Date, body?: string): Release {
    const t = now.getTime();
    this.maybeSweep(t);

    const convKey = `${conversationId}:${userId}`;
    const conv = recent(this.perConv.get(convKey), t - TEN_SEC);
    const user = recent(this.perUser.get(userId), t - DAY);
    const inMinute = user.filter((x) => x > t - MINUTE).length;
    const dupKey = body === undefined ? null : `${userId}:${hashOf(body)}`;
    const dup = dupKey ? recent(this.dup.get(dupKey), t - MINUTE) : [];

    if (conv.length >= CHAT_LIMITS.perConvPer10s) throw rate('Gửi quá nhanh trong cuộc trò chuyện này, thử lại sau ít giây', 10);
    if (inMinute >= CHAT_LIMITS.perUserPerMin) throw rate('Gửi quá nhiều tin trong một phút, thử lại sau', 60);
    if (user.length >= CHAT_LIMITS.perUserPerDay) throw rate('Hôm nay bạn đã gửi quá nhiều tin', 3600);
    if (dup.length >= DUP_MAX_PER_MIN) {
      throw new GatewayError(429, ChatErrorCode.chatDuplicate, 'Bạn đang gửi lặp lại cùng một nội dung', { retryAfterSec: 60 });
    }

    conv.push(t);
    user.push(t);
    this.perConv.set(convKey, conv);
    this.perUser.set(userId, user);
    if (dupKey) {
      dup.push(t);
      this.dup.set(dupKey, dup);
    }
    return () => {
      take(this.perConv.get(convKey), t);
      take(this.perUser.get(userId), t);
      if (dupKey) take(this.dup.get(dupKey), t);
    };
  }

  /** Dọn khóa đã hết hạn để Map không phình mãi (chạy thưa, không theo lịch). */
  private maybeSweep(t: number): void {
    if (++this.calls % SWEEP_EVERY !== 0) return;
    for (const [m, win] of [[this.perConv, TEN_SEC], [this.perUser, DAY], [this.dup, MINUTE]] as const) {
      for (const [k, v] of m) if (!v.some((x) => x > t - win)) m.delete(k);
    }
  }

  /** chỉ cho test */
  get size(): number {
    return this.perUser.size + this.perConv.size + this.dup.size;
  }
}

const recent = (xs: number[] | undefined, since: number): number[] => (xs ?? []).filter((x) => x > since);

function take(xs: number[] | undefined, t: number): void {
  if (!xs) return;
  const i = xs.indexOf(t);
  if (i >= 0) xs.splice(i, 1);
}

const rate = (message: string, retryAfterSec: number): GatewayError => new GatewayError(429, ChatErrorCode.chatRate, message, { retryAfterSec });

export const createChatLimiter = (): ChatLimiter => new ChatLimiter();
