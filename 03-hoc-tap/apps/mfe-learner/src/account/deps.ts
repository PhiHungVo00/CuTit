import type { AuthSession } from '@vietlearning/api-client/session';
import type { SyncEngine } from '@vietlearning/state/sync';
import { learnerStore } from '@vietlearning/state';
import { progressStore, totalXp } from '@vietlearning/state/progress';
import { isGoogleSignInAvailable } from '@vietlearning/native';

/** Phụ thuộc nạp lười (chunk riêng) — test tiêm bản giả. */
export interface AuthDeps {
  session(): Promise<AuthSession>;
  engine(): Promise<SyncEngine | null>;
  /** Có OAuth client Google chưa (biến build). Chưa có => ẩn nút Google, app không sập */
  googleAvailable(): boolean;
  /** Gateway gửi được mail không. Gateway chưa có tín hiệu công khai => biến build VITE_MAIL_RESET=1 (mặc định tắt) */
  mailReset(): boolean;
  /** Máy này có tiến độ học chưa đồng bộ vào tài khoản nào (để hỏi gộp/thay khi đăng nhập) */
  hasLocalProgress(): boolean;
}

export function localProgressExists(): boolean {
  const l = learnerStore.getState();
  const p = progressStore.getState();
  // Không tính `activity` (giây học): bộ đếm giờ ghi cả khi chỉ mở màn, nên máy nào cũng "có tiến độ" sau ít phút
  return Object.keys(l.srs).length > 0 || l.attempts.length > 0 || p.lessonsDone > 0 || totalXp(p.xpByDay) > 0;
}

export const defaultDeps: AuthDeps = {
  session: () => import('@vietlearning/api-client/session').then((m) => m.getAuthSession()),
  engine: () => import('@vietlearning/state/sync').then((m) => m.getSyncEngine()),
  googleAvailable: isGoogleSignInAvailable,
  mailReset: () => (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_MAIL_RESET === '1',
  hasLocalProgress: localProgressExists
};
