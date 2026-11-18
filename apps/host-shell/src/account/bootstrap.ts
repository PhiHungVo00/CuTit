/**
 * Tài khoản khách + đồng bộ (GĐ0). Nạp LƯỜI từ main.tsx (chunk riêng) để tải ban đầu không kéo Zod,
 * contract và hàng đợi đồng bộ.
 */
import { configureGateway, request } from '@vietlearning/api-client';
import { getAuthSession } from '@vietlearning/api-client/session';
import { AccountInfoSchema, SyncResponseSchema } from '@vietlearning/contracts/api';
import { getLocalReminders } from '@vietlearning/native';
import { getSyncEngine, startSync, type SyncEngine } from '@vietlearning/state/sync';
import { familyStore } from '@vietlearning/state/family';
import { isNativeApp } from '../native/bootstrap';
import { preferencesStore } from '../native/storage';
import { showNotice } from '../notice';

// App native: phiên lưu bằng Capacitor Preferences (đặt TRƯỚC lần dùng phiên đầu tiên — mọi lối vào
// phiên của Host đều đi qua module này). Web: localStorage (mặc định của api-client).
if (isNativeApp) configureGateway({ storage: preferencesStore });

export const session = getAuthSession;

/** GĐ4b: loại tài khoản (người lớn / trẻ) do server quyết định => lớp khóa giao diện (familyStore) */
export async function refreshAccountInfo(): Promise<void> {
  const info = await request('/v1/me/account', { schema: AccountInfoSchema });
  familyStore.getState().setAccount({
    mode: info.accountType,
    mediaConsent: info.mediaConsent,
    childCount: info.accountType === 'adult' ? info.childCount : undefined,
    activeChildId: info.accountType === 'child' ? info.userId : null
  });
}

export function startAccountSync(): SyncEngine {
  const existing = getSyncEngine();
  if (existing) return existing;
  const auth = getAuthSession();
  const engine = startSync({
    transport: { push: (events) => request('/v1/sync', { method: 'POST', body: { events }, schema: SyncResponseSchema }) },
    hasAccount: async () => Boolean(await auth.info()),
    // Một đường xóa dữ liệu duy nhất (xóa ở máy này hoặc bị xóa ở máy khác): hủy luôn lịch nhắc học,
    // xóa dữ liệu gia đình trên máy (biệt danh trẻ, PIN phụ huynh) — GĐ4b
    onLocalReset: () => {
      void getLocalReminders().cancelAll().catch(() => undefined);
      familyStore.getState().resetFamily();
    }
  });
  // GĐ4b: loại tài khoản (người lớn / trẻ) do server quyết định — cập nhật lớp khóa giao diện mỗi lần khởi động
  void auth.info().then((i) => i && refreshAccountInfo()).catch(() => undefined);
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
    // hồ sơ trẻ bị phụ huynh xóa => máy đã quay về phiên phụ huynh: đọc lại loại tài khoản và KÉO dữ liệu phụ huynh về
    // (máy vừa bị xóa trắng; không kéo thì thay đổi đầu tiên trên máy sẽ đè hồ sơ phụ huynh trên server)
    .then(() => (e.userId ? Promise.all([refreshAccountInfo(), startAccountSync().flush({ pull: true })]) : undefined))
    .catch((err) => console.error('[Sync] Xóa dữ liệu trên máy lỗi', err));
});
