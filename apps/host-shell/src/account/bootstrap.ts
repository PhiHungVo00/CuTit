/**
 * Tài khoản khách + đồng bộ (GĐ0). Nạp LƯỜI từ main.tsx (chunk riêng) để tải ban đầu không kéo Zod,
 * contract và hàng đợi đồng bộ.
 */
import { configureGateway, request } from '@vietlearning/api-client';
import { getAuthSession } from '@vietlearning/api-client/session';
import { SyncResponseSchema } from '@vietlearning/contracts/api';
import { getSyncEngine, startSync, type SyncEngine } from '@vietlearning/state/sync';
import { isNativeApp } from '../native/bootstrap';
import { preferencesStore } from '../native/storage';

// App native: phiên lưu bằng Capacitor Preferences (đặt TRƯỚC lần dùng phiên đầu tiên — mọi lối vào
// phiên của Host đều đi qua module này). Web: localStorage (mặc định của api-client).
if (isNativeApp) configureGateway({ storage: preferencesStore });

export const session = getAuthSession;

export function startAccountSync(): SyncEngine {
  const existing = getSyncEngine();
  if (existing) return existing;
  const auth = getAuthSession();
  return startSync({
    transport: { push: (events) => request('/v1/sync', { method: 'POST', body: { events }, schema: SyncResponseSchema }) },
    hasAccount: async () => Boolean(await auth.info())
  });
}
