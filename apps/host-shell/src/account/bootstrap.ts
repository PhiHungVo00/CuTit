/**
 * Tài khoản khách + đồng bộ (GĐ0). Nạp LƯỜI từ main.tsx (chunk riêng) để tải ban đầu không kéo Zod,
 * contract và hàng đợi đồng bộ.
 */
import { configureGateway, request } from '@vietlearning/api-client';
import { getAuthSession, setGoogleIdTokenProvider } from '@vietlearning/api-client/session';
import { SyncResponseSchema } from '@vietlearning/contracts/api';
import { configureGoogleIdentity, getGoogleIdToken, getLocalReminders } from '@vietlearning/native';
import { getSyncEngine, startSync, type SyncEngine } from '@vietlearning/state/sync';
import { isNativeApp } from '../native/bootstrap';
import { preferencesStore } from '../native/storage';
import { showNotice } from '../notice';

// App native: phiên lưu bằng Capacitor Preferences (đặt TRƯỚC lần dùng phiên đầu tiên — mọi lối vào
// phiên của Host đều đi qua module này). Web: localStorage (mặc định của api-client).
if (isNativeApp) configureGateway({ storage: preferencesStore });

// Đăng nhập Google: Web client ID là khóa CÔNG KHAI (không phải secret). Thiếu => nút Google ẩn, app không sập.
// Đặt ở mức module để mọi lối nạp bootstrap (khởi động đồng bộ, route /dang-nhap) đều cấu hình đủ.
configureGoogleIdentity({ webClientId: import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID });
setGoogleIdTokenProvider(getGoogleIdToken);

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
  // Kéo dữ liệu máy khác về mỗi 5 phút khi app mở + mỗi lần trở lại màn hình
  engine.startPeriodicPull();
  // Đăng xuất chờ mạng sống qua lần mở lại app: callback logout chỉ nằm trong RAM nên gắn lại ở đây
  if (engine.status().signOutPending) void engine.signOut(() => auth.logout()).catch(() => undefined);
  return engine;
}

// Tài khoản bị xóa ở máy khác (Gateway trả account_deleted): xóa dữ liệu trên máy, bắt đầu như người mới.
// Đăng ký ngay khi module nạp (mọi lối lấy token đều qua đây) — kể cả khi hàng đợi chưa khởi động.
// resetLocal khóa hàng đợi NGAY (đồng bộ) nên dữ liệu cũ không kịp tải lên tài khoản khách mới.
getAuthSession().onUserChange((e) => {
  // Phiên không dùng được nhưng KHÔNG xóa gì trên máy: chỉ báo và mời đăng nhập lại
  if (e.reason === 'merged-elsewhere') return showNotice('mergedElsewhere');
  // 'signed-out' cũng được phát khi người dùng chủ động đăng xuất (không chặn phiên) => chỉ báo khi phiên bị chặn
  if (e.reason === 'signed-out') {
    if (getAuthSession().blockedReason() === 'signed_out') showNotice('signedOut');
    return;
  }
  if (e.reason !== 'remote-deleted') return;
  void startAccountSync()
    .resetLocal()
    .then(() => showNotice('accountDeleted'))
    .catch((err) => console.error('[Sync] Xóa dữ liệu trên máy lỗi', err));
});
