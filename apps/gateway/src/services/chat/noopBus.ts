import type { WsServerFrame } from '@vietlearning/contracts/api';
import type { RealtimeBus } from '../realtime/RealtimeBus.js';

/**
 * Bộ phát rỗng: dùng khi chưa có `RealtimeHub` thật (Task 5). KHÔNG ghi nhớ khung nào (khác `InMemoryBus` của test, vốn lưu
 * mọi khung nên sẽ rò bộ nhớ ở production). Khi Task 5 vào main, `app.ts` truyền hub thật thay cho bản này.
 */
export class NoopBus implements RealtimeBus {
  publish(): void {}
  subscribe(_fn: (userIds: readonly string[], frame: WsServerFrame) => void): () => void {
    return () => {};
  }
  isOnline(): boolean {
    return false;
  }
  isForeground(): boolean {
    return false;
  }
}
