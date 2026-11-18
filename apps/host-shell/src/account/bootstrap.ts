/**
 * Tài khoản khách + đồng bộ (GĐ0). Nạp LƯỜI từ main.tsx (chunk riêng) để tải ban đầu không kéo Zod,
 * contract và hàng đợi đồng bộ.
 */
import { configureGateway, request } from '@vietlearning/api-client';
import { getAuthSession } from '@vietlearning/api-client/session';
import { SyncResponseSchema } from '@vietlearning/contracts/api';
import { getLocalReminders } from '@vietlearning/native';
import { getSyncEngine, startSync, type SyncEngine } from '@vietlearning/state/sync';
import { isNativeApp } from '../native/bootstrap';
import { preferencesStore } from '../native/storage';
import { showNotice } from '../notice';

// App native: phiên lưu bằng Capacitor Preferences (đặt TRƯỚC lần dùng phiên đầu tiên — mọi lối vào
// phiên của Host đều đi qua module này). Web: localStorage (mặc định của api-client).
if (isNativeApp) configureGateway({ storage: preferencesStore });

export const session = getAuthSession;

export function startAccountSync(): SyncEngine {
  const existing = getSyncEngine();
  if (existing) return existing;
  const auth = getAuthSession();
  const engine = startSync({
    transport: { push: (events) => request('/v1/sync', { method: 'POST', body: { events }, schema: SyncResponseSchema }) },
    hasAccount: async () => Boolean(await auth.info()),
    // Một đường xóa dữ liệu duy nhất (xóa ở máy này hoặc bị xóa ở máy khác): hủy luôn lịch nhắc học
    onLocalReset: () => void getLocalReminders().cancelAll().catch(() => undefined)
  });
  return engine;
}

// Tài khoản bị xóa ở máy khác (Gateway trả account_deleted): xóa dữ liệu trên máy, bắt đầu như người mới.
// Đăng ký ngay khi module nạp (mọi lối lấy token đều qua đây) — kể cả khi hàng đợi chưa khởi động.
// resetLocal khóa hàng đợi NGAY (đồng bộ) nên dữ liệu cũ không kịp tải lên tài khoản khách mới.
getAuthSession().onUserChange((e) => {
  if (e.reason !== 'remote-deleted') return;
  void startAccountSync()
    .resetLocal()
    .then(() => showNotice('accountDeleted'))
    .catch((err) => console.error('[Sync] Xóa dữ liệu trên máy lỗi', err));
});
