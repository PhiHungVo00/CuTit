import type { WsServerFrame } from '@vietlearning/contracts/api';

/**
 * Bộ phát tin trừu tượng (dự án 4, spec 5.6). Mọi service chat/gọi/push chỉ biết interface này;
 * bản thật `RealtimeHub` (Map<userId, Set<Socket>>, Task 5) cắm vào sau. Một instance Gateway ở bản đầu:
 * nhiều instance thì thay bằng Postgres LISTEN/NOTIFY hoặc Redis mà KHÔNG đổi service.
 *
 * Hợp đồng:
 * - `publish` KHÔNG ném lỗi và KHÔNG chờ (gọi SAU khi commit; mất khung không được làm hỏng giao dịch — client bù bằng REST `afterSeq`).
 * - Khung đưa vào là khung HỢP LỆ theo `WsServerFrameSchema` (người phát chịu trách nhiệm).
 * - `userIds` trùng lặp chỉ nhận một lần.
 */
export interface RealtimeBus {
  publish(userIds: readonly string[], frame: WsServerFrame): void;
  /** Nghe mọi khung đã phát (dùng cho push: "người nhận không có WS nền trước thì gửi FCM"). Trả hàm hủy đăng ký. */
  subscribe(fn: (userIds: readonly string[], frame: WsServerFrame) => void): () => void;
  /** có ít nhất một kết nối WS đang mở */
  isOnline(userId: string): boolean;
  /** có kết nối WS đang ở nền trước (client gửi `visibility{foreground:true}`) */
  isForeground(userId: string): boolean;
}

/** Bản trong bộ nhớ cho test (PGlite một kết nối, không cần socket thật). Ghi lại mọi khung đã phát. */
export class InMemoryBus implements RealtimeBus {
  readonly published: Array<{ userIds: string[]; frame: WsServerFrame }> = [];
  private readonly listeners = new Set<(userIds: readonly string[], frame: WsServerFrame) => void>();
  private readonly online = new Set<string>();
  private readonly foreground = new Set<string>();

  publish(userIds: readonly string[], frame: WsServerFrame): void {
    const unique = [...new Set(userIds)];
    this.published.push({ userIds: unique, frame });
    for (const fn of [...this.listeners]) {
      try {
        fn(unique, frame);
      } catch {
        // người nghe lỗi không được làm hỏng người phát
      }
    }
  }

  subscribe(fn: (userIds: readonly string[], frame: WsServerFrame) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  isOnline(userId: string): boolean {
    return this.online.has(userId);
  }

  isForeground(userId: string): boolean {
    return this.foreground.has(userId);
  }

  // ---- chỉ cho test ----
  setOnline(userId: string, online: boolean, foreground = online): void {
    if (online) this.online.add(userId);
    else this.online.delete(userId);
    if (online && foreground) this.foreground.add(userId);
    else this.foreground.delete(userId);
  }

  /** các khung (theo loại `t`) đã gửi tới một người */
  framesFor(userId: string): WsServerFrame[] {
    return this.published.filter((p) => p.userIds.includes(userId)).map((p) => p.frame);
  }

  clear(): void {
    this.published.length = 0;
  }
}
